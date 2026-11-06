export type Mutation = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  requireMatch?: boolean;
};
export type SyncJob = {
  id: string;
  productIds: string[];
  deletedProductIds?: string[];
  deletedSaleIds?: string[];
  saleIds?: string[];
  mutations: Mutation[];
};

// Persist explicit mutations, never a full cached database snapshot.
export class SyncQueue {
  jobs: SyncJob[];
  private running: Promise<void> | null = null;
  private save: (json: string) => void;
  constructor(saved: string | null, save: (json: string) => void) {
    this.save = save;
    this.jobs = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(this.jobs)) throw new Error("Pending changes cannot be read. Export a backup before continuing.");
  }
  enqueue(job: SyncJob) {
    this.jobs.push(job);
    this.save(JSON.stringify(this.jobs));
  }
  flush(send: (mutation: Mutation) => Promise<unknown>) {
    if (this.running) return this.running;
    this.running = (async () => {
      let conflict: Error | null = null;
      const blocked = new Set<string>();
      // Read the live queue so edits added during an upload are sent in this pass.
      for (let index = 0; index < this.jobs.length;) {
        const job = this.jobs[index];
        const keys = [...job.productIds, ...(job.deletedProductIds ?? [])];
        if (keys.some((id) => blocked.has(id))) { index++; continue; }
        while (job.mutations.length) {
          const mutation = job.mutations[0];
          const result = await send(mutation);
          if (mutation.requireMatch && (!Array.isArray(result) || result.length !== 1)) {
            conflict = new Error("Inventory changed on another device or this product was deleted. Conflicting changes kept locally; unrelated uploads have continued.");
            keys.forEach((id) => blocked.add(id));
            break;
          }
          job.mutations.shift();
          this.save(JSON.stringify(this.jobs));
        }
        if (job.mutations.length) { index++; continue; }
        this.jobs.splice(this.jobs.indexOf(job), 1);
        this.save(JSON.stringify(this.jobs));
      }
      if (conflict) throw conflict;
    })().finally(() => { this.running = null; });
    return this.running;
  }
}

export function stockMutation(product: { id: string; stock: number }, previousStock: number): Mutation {
  return {
    path: `products?id=eq.${encodeURIComponent(product.id)}&stock=eq.${previousStock}`,
    method: "PATCH",
    body: { stock: product.stock },
    requireMatch: true,
  };
}

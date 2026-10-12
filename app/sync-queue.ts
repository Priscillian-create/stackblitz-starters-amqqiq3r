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
      while (this.jobs.length) {
        const job = this.jobs[0];
        while (job.mutations.length) {
          const mutation = job.mutations[0];
          const result = await send(mutation);
          if (mutation.requireMatch && (!Array.isArray(result) || result.length !== 1)) {
            throw new Error("Inventory changed on another device or this product was deleted. Pending changes kept; export a backup and reconcile before retrying.");
          }
          job.mutations.shift();
          this.save(JSON.stringify(this.jobs));
        }
        this.jobs.shift();
        this.save(JSON.stringify(this.jobs));
      }
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

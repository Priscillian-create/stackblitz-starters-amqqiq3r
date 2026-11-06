export type Mutation = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  requireMatch?: boolean;
};
export type SyncJob = {
  id: string;
  kind?: "product-edit";
  productSnapshot?: Record<string, unknown>;
  productIds: string[];
  deletedProductIds?: string[];
  deletedSaleIds?: string[];
  saleIds?: string[];
  mutations: Mutation[];
};

export class InventoryConflictError extends Error {
  productIds: string[];
  constructor(productIds: string[]) {
    super("Inventory changed on another device or this product was deleted. Conflicting changes kept locally; unrelated uploads have continued.");
    this.name = "InventoryConflictError";
    this.productIds = productIds;
  }
}

// Persist explicit mutations, never a full cached database snapshot.
export class SyncQueue {
  jobs: SyncJob[];
  private running: Promise<void> | null = null;
  private save: (json: string) => void;
  constructor(saved: string | null, save: (json: string) => void) {
    this.save = save;
    this.jobs = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(this.jobs)) throw new Error("Pending changes cannot be read. Export a backup before continuing.");
    let migrated = false;
    for (const job of this.jobs) {
      // Older product-form edits used stock/price/cost compare guards. Ordinary
      // explicit field edits now use the latest submitted values. Sale stock
      // mutations retain their quantity guards and are never converted.
      if (job.mutations.length !== 1 || job.saleIds?.length || job.deletedProductIds?.length) continue;
      const mutation = job.mutations[0];
      const query = new URLSearchParams(mutation.path.split("?")[1] || "");
      if (!mutation.path.startsWith("products?")) continue;
      const oldFormEdit = mutation.method === "PATCH" && query.has("price") && query.has("cost") && query.has("stock");
      const newProduct = mutation.method === "POST";
      if (!oldFormEdit && !newProduct && job.kind !== "product-edit") continue;
      job.kind = "product-edit";
      if (oldFormEdit) {
        for (const key of ["stock", "price", "cost"]) query.delete(key);
        mutation.path = "products?" + query.toString();
      }
      migrated = true;
    }
    if (migrated) this.save(JSON.stringify(this.jobs));
  }
  enqueue(job: SyncJob) {
    this.save(JSON.stringify([...this.jobs, job]));
    this.jobs.push(job);
  }
  flush(send: (mutation: Mutation) => Promise<unknown>) {
    if (this.running) return this.running;
    this.running = (async () => {
      const conflicts = new Set<string>();
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
            keys.forEach((id) => conflicts.add(id));
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
      if (conflicts.size) throw new InventoryConflictError([...conflicts]);
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

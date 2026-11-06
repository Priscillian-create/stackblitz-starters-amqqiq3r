import type { SyncJob } from './sync-queue';

// Rebuild unuploaded product writes if a tab closed before its cache was saved.
export function restorePendingProductRows(rows: Record<string, unknown>[], jobs: SyncJob[]) {
  const products = new Map(rows.map(row => [String(row.id), row]));
  for (const job of jobs) {
    if (job.productSnapshot && !products.has(String(job.productSnapshot.id))) {
      products.set(String(job.productSnapshot.id), job.productSnapshot);
    }
    for (const mutation of job.mutations) {
      if (!mutation.path.startsWith('products?')) continue;
      if (mutation.method === 'POST' && Array.isArray(mutation.body)) {
        for (const row of mutation.body) if (row?.id) products.set(String(row.id), row);
      }
      const filter = new URLSearchParams(mutation.path.split('?')[1]).get('id');
      if (!filter?.startsWith('eq.')) continue;
      const id = filter.slice(3);
      if (mutation.method === 'DELETE') products.delete(id);
      if (mutation.method === 'PATCH' && mutation.body && typeof mutation.body === 'object' && products.has(id)) {
        products.set(id, { ...products.get(id), ...mutation.body, id });
      }
    }
  }
  return [...products.values()];
}

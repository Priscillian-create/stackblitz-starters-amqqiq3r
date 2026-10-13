import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the app's actual download function with delayed network responses.
async function harness() {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  async function loadFromSupabase()');
  const end = source.indexOf('  function queueChanges(', start);
  const code = stripTypeScriptTypes(source.slice(start, end));
  let resolveProducts;
  const products = new Promise(resolve => { resolveProducts = resolve; });
  const updates = [];
  const current = { products: [{ id: 'new', name: 'GALVUS MET' }], sales: [], customers: [], expenses: [] };
  const context = {
    pendingWriteRef: { current: false }, mutationQueueRef: { current: { jobs: [] } },
    blockPullUntilRef: { current: 0 }, localWriteVersionRef: { current: 0 },
    storeRef: { current }, protectedProductIdsRef: { current: new Set() },
    deletedProductIdsRef: { current: new Set() }, deletedSaleIdsRef: { current: new Set() },
    loadAllRows: async path => path.startsWith('products?') ? products : [],
    supabaseRequest: () => {}, productFromRow: row => row,
    setStore: update => updates.push(update), setSyncStatus: () => {},
    sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  };
  const download = vm.runInNewContext(`(${code})`, context);
  return { context, download, resolveProducts, updates, current };
}

test('a read that started before a product save cannot erase the new product after the queue drains', async () => {
  const h = await harness();
  const reading = h.download();
  h.context.localWriteVersionRef.current++;
  // Save has completed; no pending flags or protection remain.
  h.resolveProducts([]);
  await reading;
  assert.equal(h.updates.length, 0);
  assert.equal(h.current.products[0].name, 'GALVUS MET');
});

test('a deferred React updater also rejects a snapshot when a write happens before commit', async () => {
  const h = await harness();
  const reading = h.download();
  h.resolveProducts([]);
  await reading;
  assert.equal(h.updates.length, 1);
  h.context.localWriteVersionRef.current++;
  assert.equal(h.updates[0](h.current), h.current);
});

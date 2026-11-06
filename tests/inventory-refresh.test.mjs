import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { DatabaseConnectionError } from '../app/sync-backoff.ts';

// Exercise the app's actual download function with delayed network responses.
async function harness() {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  async function loadFromSupabase(');
  const end = source.indexOf('  function queueChanges(', start);
  const code = stripTypeScriptTypes(source.slice(start, end));
  let resolveProducts, rejectProducts;
  const products = new Promise((resolve, reject) => { resolveProducts = resolve; rejectProducts = reject; });
  const updates = [];
  const current = { products: [{ id: 'new', name: 'GALVUS MET' }], sales: [], customers: [], expenses: [] };
  const context = {
    pendingWriteRef: { current: false }, mutationQueueRef: { current: { jobs: [] } },
    inventoryReadRef: { current: null }, AbortController, DatabaseConnectionError,
    blockPullUntilRef: { current: 0 }, localWriteVersionRef: { current: 0 },
    storeRef: { current }, protectedProductIdsRef: { current: new Set() },
    deletedProductIdsRef: { current: new Set() }, deletedSaleIdsRef: { current: new Set() },
    loadAllRows: async path => path.startsWith('products?') ? products : [],
    supabaseConfig: { anonKey: "public" },
    supabaseRequest: async () => [], productFromRow: row => row,
    setStore: update => updates.push(update), setSyncStatus: () => {},
    sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  };
  const download = vm.runInNewContext(`(${code})`, context);
  return { context, download, resolveProducts, rejectProducts, updates, current };
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

test('an interrupted inventory page leaves existing products untouched and releases the read controller', async () => {
  const h = await harness();
  const reading = h.download();
  h.rejectProducts(new TypeError('Network IO suspended'));
  await reading;
  assert.equal(h.updates.length, 0);
  assert.equal(h.current.products[0].name, 'GALVUS MET');
  assert.equal(h.context.inventoryReadRef.current, null);
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

test('pending local changes do not block shared customer and expense updates', async () => {
  const h = await harness();
  h.context.mutationQueueRef.current.jobs = [{ productIds: [], mutations: [{ path: 'customers?on_conflict=id', method: 'POST', body: [{ id: 'local-customer' }] }] }];
  h.current.customers = [{ id: 'local-customer', name: 'Unsynced edit' }];
  h.context.loadAllRows = async path => path.startsWith('customers?') ? [{ id: 'remote-customer', name: 'Another device' }] : path.startsWith('expenses?') ? [{ id: 'remote-expense' }] : [];
  await h.download();
  const next = h.updates[0](h.current);
  assert.equal(next.customers.length, 2);
  assert.equal(next.customers.find(row => row.id === 'local-customer').name, 'Unsynced edit');
  assert.equal(next.expenses[0].id, 'remote-expense');
});

test('partially uploaded sales keep local line items while other device sales arrive', async () => {
  const h = await harness();
  h.context.mutationQueueRef.current.jobs = [{ productIds: ['product'], saleIds: ['local-sale'], mutations: [] }];
  h.current.sales = [{ id: 'local-sale', items: [{ productId: 'product', qty: 2 }] }];
  h.context.loadAllRows = async path => path.startsWith('sales?') ? [{ id: 'local-sale' }, { id: 'remote-sale' }] : [];
  await h.download();
  const next = h.updates[0](h.current);
  assert.equal(next.sales.length, 2);
  assert.equal(next.sales.find(row => row.id === 'local-sale').items[0].qty, 2);
});

test('shared downloads retain a newly added local product while receiving other device products', async () => {
  const h = await harness();
  h.context.protectedProductIdsRef.current.add('new');
  h.context.mutationQueueRef.current.jobs = [{ productIds: ['new'], mutations: [{ path: 'products?on_conflict=id', method: 'POST', body: [{ id: 'new' }] }] }];
  h.context.loadAllRows = async path => path.startsWith('products?') ? [{ id: 'other-device', name: 'Remote product' }] : [];
  await h.download();
  const next = h.updates[0](h.current);
  assert.equal(next.products.length, 2);
  assert.equal(next.products.find(row => row.id === 'new').name, 'GALVUS MET');
  assert.equal(next.products.find(row => row.id === 'other-device').name, 'Remote product');
});

test('background downloads do not replace an upload failure with a generic status', async () => {
  const h = await harness();
  const statuses = [];
  h.context.setSyncStatus = value => statuses.push(value);
  h.resolveProducts([]);
  await h.download(false);
  assert.equal(statuses.length, 0);
});

test('anonymous-visible inventory cannot be mistaken for an empty authenticated database', async () => {
  const h = await harness();
  const statuses = [];
  h.context.setSyncStatus = value => statuses.push(value);
  h.context.supabaseConfig = { anonKey: 'public' };
  h.context.supabaseRequest = async () => [{ id: 'existing-server-product' }];
  h.resolveProducts([]);
  await h.download();
  assert.equal(h.updates.length, 0);
  assert.match(statuses[0], /Database permissions hide products/);
});

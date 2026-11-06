import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { DatabaseConnectionError } from '../app/sync-backoff.ts';
import { SyncQueue } from '../app/sync-queue.ts';
import { restorePendingProductRows } from '../app/pending-products.ts';
import { randomUUID } from 'node:crypto';
const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const product = { id: 'p', name: 'Product', price: 10, stock: 4, sku: 'sku', barcode: 'barcode' };

function persistence() {
  const start = source.indexOf('  async function persistProduct(');
  const end = source.indexOf('  async function deleteProductFromSupabase(', start);
  const calls = [];
  let persisted;
  const queue = new SyncQueue(null, json => { persisted = json; });
  const context = {
    authSessionRef: { current: { access_token: 'user' } }, navigator: { onLine: true },
    mutationQueueRef: { current: queue }, pushLocalToSupabase: async () => true,
    crypto: { randomUUID }, DatabaseConnectionError,
    protectProducts: () => {}, markLocalWrite: () => {},
    productToRow: row => row, productFromRow: row => row,
    sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    supabaseRequest: async (path, init) => { calls.push({ path, init }); return [product]; },
    encodeURIComponent,
  };
  const save = vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context);
  return { save, context, calls, persisted: () => persisted };
}

test('new product saves directly and requires the confirmed database row', async () => {
  const h = persistence();
  assert.equal((await h.save(product)).product.id, product.id);
  assert.equal(h.calls[0].path, 'products?on_conflict=id');
  assert.equal(h.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(h.calls[0].init.body), [product]);
  assert.equal(h.context.mutationQueueRef.current.jobs.length, 0);
});

test('price edit patches only the changed field without old stock/price/cost guards', async () => {
  const h = persistence();
  await h.save(product, { ...product, price: 9 });
  assert.equal(h.calls[0].path, 'products?id=eq.p');
  assert.equal(h.calls[0].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { price: 10 });
});

test('offline product saves persist immediately and reload reconstructs the pending product', async () => {
  const h = persistence();
  h.context.navigator.onLine = false;
  const result = await h.save(product);
  assert.equal(result.savedToDatabase, false);
  assert.equal(h.calls.length, 0);
  const reloaded = new SyncQueue(h.persisted(), () => {});
  const restored = restorePendingProductRows([], reloaded.jobs);
  assert.equal(restored[0].id, product.id);
  assert.equal(restored[0].price, product.price);
  const sent = [];
  await reloaded.flush(async mutation => { sent.push(mutation); return [product]; });
  assert.equal(sent.length, 1);
  assert.equal(reloaded.jobs.length, 0);
});

test('connection failure queues the product, but permission errors stay errors', async () => {
  const h = persistence();
  h.context.supabaseRequest = async () => { throw new DatabaseConnectionError(); };
  assert.equal((await h.save(product)).savedToDatabase, false);
  assert.equal(h.context.mutationQueueRef.current.jobs.length, 1);
  const denied = persistence();
  denied.context.supabaseRequest = async () => { throw new Error('permission denied'); };
  await assert.rejects(denied.save(product), /permission denied/);
  assert.equal(denied.context.mutationQueueRef.current.jobs.length, 0);
  denied.context.supabaseRequest = async () => [];
  await assert.rejects(denied.save(product), /Database did not confirm/);
});

test('offline creation followed by an edit uploads in order without duplicate products', async () => {
  const h = persistence();
  h.context.navigator.onLine = false;
  await h.save(product);
  h.context.navigator.onLine = true;
  await h.save({ ...product, price: 12 }, product);
  assert.equal(h.calls.length, 0);
  const reloaded = new SyncQueue(h.persisted(), () => {});
  const restored = restorePendingProductRows([], reloaded.jobs);
  assert.equal(restored.length, 1); assert.equal(restored[0].price, 12);
  const server = new Map();
  await reloaded.flush(async mutation => {
    if (mutation.method === 'POST') server.set('p', mutation.body[0]);
    else server.set('p', { ...server.get('p'), ...mutation.body });
    return [server.get('p')];
  });
  assert.equal(server.size, 1); assert.equal(server.get('p').price, 12);
});

function formHarness() {
  const start = source.indexOf('  async function saveProduct(');
  const end = source.indexOf('  function deleteProduct(', start);
  let resolve, reject, closed = false, reset = false, error = '', writes = 0;
  const response = new Promise((yes, no) => { resolve = yes; reject = no; });
  const context = {
    editingProduct: product, editingOriginalRef: { current: undefined },
    productSaveBusyRef: { current: false }, storeRef: { current: { products: [] } },
    localWriteVersionRef: { current: 0 }, inventoryReadRef: { current: null },
    setProductSaveBusy: () => {}, setProductSaveError: value => { error = value; },
    setEditingProduct: () => {}, persistProduct: () => response,
    setStore: () => {}, setSyncStatus: () => {},
    resetProductForm: () => { reset = true; }, setIsProductFormOpen: value => { closed = !value; },
    storageKey: 'cache', window: { localStorage: { setItem: () => { writes++; } }, dispatchEvent: () => {} },
    Event, DatabaseConnectionError,
  };
  const save = vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context);
  return { save, context, resolve, reject, state: () => ({ closed, reset, error, writes }) };
}

test('product stays out of the list and the form stays open until database confirms', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  assert.equal(h.context.storeRef.current.products.length, 0);
  assert.equal(h.state().closed, false); assert.equal(h.state().writes, 0);
  h.resolve({ product, savedToDatabase: true }); await saving;
  assert.equal(h.context.storeRef.current.products[0].id, 'p');
  assert.equal(h.state().closed, true); assert.equal(h.state().reset, true);
});

test('failed database save retains form and creates no phantom local product', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  h.reject(new DatabaseConnectionError()); await saving;
  assert.equal(h.context.storeRef.current.products.length, 0);
  assert.equal(h.state().closed, false); assert.equal(h.state().reset, false);
  assert.equal(h.state().writes, 0); assert.match(h.state().error, /Could not reach the server/);
  assert.equal(h.context.productSaveBusyRef.current, false);
});

test('offline form closes only after a durable pending save and adds the cached product', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  h.resolve({ product, savedToDatabase: false }); await saving;
  assert.equal(h.context.storeRef.current.products.length, 1);
  assert.equal(h.state().closed, true);
  assert.ok(h.state().writes > 0);
});

test('a snapshot restores a pending edit if its cached product was lost before page close', async () => {
  const h = persistence();
  h.context.navigator.onLine = false;
  await h.save({ ...product, price: 12 }, product);
  const restored = restorePendingProductRows([], new SyncQueue(h.persisted(), () => {}).jobs);
  assert.equal(restored[0].name, product.name);
  assert.equal(restored[0].price, 12);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
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
    mutationQueueRef: { current: queue },
    queueChanges: job => { calls.push(job); queue.enqueue({ ...job, id: randomUUID() }); },
    protectProducts: () => {},
    productToRow: row => row,
    sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    encodeURIComponent,
  };
  const save = vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context);
  return { save, context, calls, persisted: () => persisted };
}

test('adding a product saves to the device and queues an upload', async () => {
  const h = persistence();
  assert.equal((await h.save(product)).id, product.id);
  const [job] = new SyncQueue(h.persisted(), () => {}).jobs;
  assert.equal(job.mutations[0].path, 'products?on_conflict=id');
  assert.equal(job.mutations[0].method, 'POST');
  assert.deepEqual(job.mutations[0].body, [product]);
  assert.equal(restorePendingProductRows([], [job])[0].id, product.id);
});

test('price edit queues only the changed field', async () => {
  const h = persistence();
  await h.save(product, { ...product, price: 9 });
  const [mutation] = h.calls[0].mutations;
  assert.equal(mutation.path, 'products?id=eq.p');
  assert.equal(mutation.method, 'PATCH');
  assert.equal(mutation.body.price, 10);
  assert.deepEqual(Object.keys(mutation.body), ['price']);
});

test('offline creation followed by an edit uploads in order without duplicate products', async () => {
  const h = persistence();
  await h.save(product);
  await h.save({ ...product, price: 12 }, product);
  assert.equal(h.calls.length, 2);
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
    Error,
  };
  const save = vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context);
  return { save, context, resolve, reject, state: () => ({ closed, reset, error, writes }) };
}

test('product stays out of the list until the device saves it', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  assert.equal(h.context.storeRef.current.products.length, 0);
  assert.equal(h.state().closed, false); assert.equal(h.state().writes, 0);
  h.resolve(product); await saving;
  assert.equal(h.context.storeRef.current.products[0].id, 'p');
  assert.equal(h.state().closed, true); assert.equal(h.state().reset, true);
});

test('failed device save retains the form and creates no product', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  h.reject(new Error("Device storage is full")); await saving;
  assert.equal(h.context.storeRef.current.products.length, 0);
  assert.equal(h.state().closed, false); assert.equal(h.state().reset, false);
  assert.equal(h.state().writes, 0); assert.match(h.state().error, /Device storage is full/);
  assert.equal(h.context.productSaveBusyRef.current, false);
});

test('form closes after a durable pending save and adds the cached product', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  h.resolve(product); await saving;
  assert.equal(h.context.storeRef.current.products.length, 1);
  assert.equal(h.state().closed, true);
  assert.ok(h.state().writes > 0);
});

test('a snapshot restores a pending edit if its cached product was lost before page close', async () => {
  const h = persistence();
  await h.save({ ...product, price: 12 }, product);
  const restored = restorePendingProductRows([], new SyncQueue(h.persisted(), () => {}).jobs);
  assert.equal(restored[0].name, product.name);
  assert.equal(restored[0].price, 12);
});

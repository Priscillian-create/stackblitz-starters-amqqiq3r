import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { DatabaseConnectionError } from '../app/sync-backoff.ts';
const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const product = { id: 'p', name: 'Product', price: 10, stock: 4, sku: 'sku', barcode: 'barcode' };

function persistence() {
  const start = source.indexOf('  async function persistProduct(');
  const end = source.indexOf('  async function deleteProductFromSupabase(', start);
  const calls = [];
  const context = {
    authSessionRef: { current: { access_token: 'user' } }, navigator: { onLine: true },
    mutationQueueRef: { current: { jobs: [] } }, pushLocalToSupabase: async () => true,
    productToRow: row => row, productFromRow: row => row,
    sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    supabaseRequest: async (path, init) => { calls.push({ path, init }); return [product]; },
    encodeURIComponent,
  };
  const save = vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context);
  return { save, context, calls };
}

test('new product saves directly and requires the confirmed database row', async () => {
  const h = persistence();
  assert.deepEqual(await h.save(product), product);
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

test('offline and unconfirmed saves reject rather than report success', async () => {
  const h = persistence();
  h.context.navigator.onLine = false;
  await assert.rejects(h.save(product), /No internet/);
  assert.equal(h.calls.length, 0);
  h.context.navigator.onLine = true;
  h.context.supabaseRequest = async () => [];
  await assert.rejects(h.save(product), /Database did not confirm/);
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
  h.resolve(product); await saving;
  assert.equal(h.context.storeRef.current.products[0].id, 'p');
  assert.equal(h.state().closed, true); assert.equal(h.state().reset, true);
});

test('failed database save retains form and creates no phantom local product', async () => {
  const h = formHarness();
  const saving = h.save({ preventDefault() {} });
  h.reject(new DatabaseConnectionError()); await saving;
  assert.equal(h.context.storeRef.current.products.length, 0);
  assert.equal(h.state().closed, false); assert.equal(h.state().reset, false);
  assert.equal(h.state().writes, 0); assert.match(h.state().error, /Could not confirm/);
  assert.equal(h.context.productSaveBusyRef.current, false);
});

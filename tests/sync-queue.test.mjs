import assert from 'node:assert/strict';
import test from 'node:test';
import { SyncQueue, stockMutation } from '../app/sync-queue.ts';

const job = () => ({ id: 'sale', productIds: ['sold'], mutations: [stockMutation({ id: 'sold', stock: 4 }, 5)] });

test('a sale changes only the sold stock and checks the prior server quantity', () => {
  const mutation = stockMutation({ id: 'sold', stock: 4 }, 5);
  assert.equal(mutation.method, 'PATCH');
  assert.match(mutation.path, /id=eq.sold&stock=eq.5/);
  assert.deepEqual(mutation.body, { stock: 4 });
});

test('queued changes survive reload and unrelated cached inventory is never uploaded', async () => {
  let saved;
  const queue = new SyncQueue(null, json => { saved = json; });
  queue.enqueue(job());
  const reloaded = new SyncQueue(saved, json => { saved = json; });
  const sent = [];
  await reloaded.flush(async mutation => { sent.push(mutation); return [{ id: 'sold' }]; });
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(saved), []);
});

test('conflicting or deleted products cannot be recreated; pending changes remain', async () => {
  let saved;
  const queue = new SyncQueue(null, json => { saved = json; });
  queue.enqueue(job());
  await assert.rejects(queue.flush(async () => []), /Inventory changed/);
  assert.equal(JSON.parse(saved).length, 1);
});

test('failed steps retry without replaying successful steps', async () => {
  let saved;
  const queue = new SyncQueue(null, json => { saved = json; });
  queue.enqueue({ ...job(), mutations: [{ path: 'sales', method: 'POST', body: [{ id: 'sale' }] }, ...job().mutations] });
  let count = 0;
  await assert.rejects(queue.flush(async () => { if (++count === 2) throw new Error('offline'); return []; }), /offline/);
  const restored = new SyncQueue(saved, () => {});
  assert.equal(restored.jobs[0].mutations.length, 1);
  await restored.flush(async mutation => { assert.equal(mutation.method, 'PATCH'); return [{}]; });
});

test('concurrent retries share one sender', async () => {
  const queue = new SyncQueue(null, () => {});
  queue.enqueue(job());
  let calls = 0;
  const send = async () => { calls++; return [{}]; };
  await Promise.all([queue.flush(send), queue.flush(send)]);
  assert.equal(calls, 1);
});

test('a conflicting product does not block unrelated uploads or reorder dependent edits', async () => {
  let saved;
  const queue = new SyncQueue(null, json => { saved = json; });
  queue.enqueue(job());
  queue.enqueue({ id: 'dependent', productIds: ['sold'], mutations: [stockMutation({ id: 'sold', stock: 3 }, 4)] });
  queue.enqueue({ id: 'other', productIds: ['new'], mutations: [{ path: 'products', method: 'POST', body: [{ id: 'new' }] }] });
  const sent = [];
  await assert.rejects(queue.flush(async mutation => { sent.push(mutation); return mutation.requireMatch ? [] : [{ id: 'new' }]; }), /Inventory changed/);
  assert.equal(sent.length, 2);
  assert.deepEqual(JSON.parse(saved).map(item => item.id), ['sale', 'dependent']);
});

test('edits added while an upload is in flight drain automatically in the same flush', async () => {
  const queue = new SyncQueue(null, () => {});
  queue.enqueue(job());
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const paths = [];
  const sending = queue.flush(async mutation => {
    paths.push(mutation.path);
    if (paths.length === 1) await blocked;
    return [{}];
  });
  queue.enqueue({ id: 'new-edit', productIds: ['new'], mutations: [{ path: 'products?on_conflict=id', method: 'POST', body: [{ id: 'new' }] }] });
  release();
  await sending;
  assert.equal(paths.length, 2);
  assert.equal(queue.jobs.length, 0);
});

test('conflict error identifies every blocked product while a new product still uploads', async () => {
  const queue = new SyncQueue(null, () => {});
  queue.enqueue(job());
  queue.enqueue({ id: 'another-conflict', productIds: ['other'], mutations: [stockMutation({ id: 'other', stock: 8 }, 9)] });
  queue.enqueue({ id: 'new-product', productIds: ['new'], mutations: [{ path: 'products?on_conflict=id', method: 'POST', body: [{ id: 'new' }] }] });
  const uploaded = [];
  await assert.rejects(queue.flush(async mutation => {
    if (mutation.requireMatch) return [];
    uploaded.push(mutation.body[0].id); return mutation.body;
  }), error => {
    assert.equal(error.name, 'InventoryConflictError');
    assert.deepEqual(error.productIds, ['sold', 'other']);
    return true;
  });
  assert.deepEqual(uploaded, ['new']);
  assert.equal(queue.jobs.length, 2);
});

test('old product form edits retry automatically without turning sale stock guards into overwrites', async () => {
  const oldEdit = { id: 'edit', productIds: ['p'], mutations: [{ path: 'products?id=eq.p&stock=eq.5&price=eq.10&cost=eq.8', method: 'PATCH', requireMatch: true, body: { price: 12 } }] };
  let saved;
  const queue = new SyncQueue(JSON.stringify([oldEdit, job()]), json => { saved = json; });
  assert.equal(queue.jobs[0].kind, 'product-edit');
  assert.equal(queue.jobs[0].mutations[0].path, 'products?id=eq.p');
  assert.match(queue.jobs[1].mutations[0].path, /stock=eq.5/);
  assert.deepEqual(JSON.parse(saved)[0].mutations[0].body, { price: 12 });
  const paths = [];
  await queue.flush(async mutation => { paths.push(mutation.path); return [{}]; });
  assert.deepEqual(paths, ['products?id=eq.p', 'products?id=eq.sold&stock=eq.5']);
});

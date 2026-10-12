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

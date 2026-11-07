import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

async function harness(accept = true) {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  async function reviewPendingChanges()');
  const end = source.indexOf('  function exportData()', start);
  const queue = { jobs: [8, 7].map((stock, index) => ({ id: String(index), productIds: ['p'], mutations: [{ path: 'products?id=eq.p&stock=eq.9', method: 'PATCH', requireMatch: true, body: { stock } }] })) };
  let remote = 10, calls = 0, prompts = 0;
  const guards = [];
  const context = {
    mutationQueueRef: { current: queue }, syncBusyRef: { current: false },
    authSessionRef: { current: {} }, syncBackoffRef: { current: { reset() {} } },
    setSyncStatus: () => {}, URLSearchParams,
    mutationQueueStorageKey: 'queue',
    window: { localStorage: { setItem: () => {} }, confirm: () => { prompts++; return accept; } },
    supabaseRequest: async () => [{ id: 'p', name: 'Product', stock: remote }],
    pushLocalToSupabase: async () => {
      if (++calls === 1) return false;
      const job = queue.jobs[0];
      if (!job) return true;
      const mutation = job.mutations[0];
      const guard = new URLSearchParams(mutation.path.split('?')[1]).get('stock');
      if (guard === 'eq.' + remote) {
        guards.push(guard); remote = mutation.body.stock; queue.jobs.shift();
      }
      return !queue.jobs.length;
    },
    loadFromSupabase: async () => {},
  };
  const review = vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context);
  return { review, queue, context, state: () => ({ remote, prompts, guards }) };
}

test('accepted conflict decisions upload before the next dependent edit is reviewed', async () => {
  const h = await harness();
  await h.review();
  assert.equal(h.queue.jobs.length, 0);
  assert.deepEqual(h.state(), { remote: 7, prompts: 2, guards: ['eq.10', 'eq.8'] });
  assert.equal(h.context.syncBusyRef.current, false);
});

test('cancelling an edit keeps it and later dependent stock changes intact', async () => {
  const h = await harness(false);
  await h.review();
  assert.equal(h.queue.jobs.length, 2);
  assert.deepEqual(h.state(), { remote: 10, prompts: 1, guards: [] });
});

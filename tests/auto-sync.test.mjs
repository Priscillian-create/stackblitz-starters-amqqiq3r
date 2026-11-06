import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoSync } from '../app/auto-sync.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('a change arriving during sync automatically starts another pass', { timeout: 2000 }, async () => {
  const entered = deferred(), release = deferred(), second = deferred();
  let calls = 0, active = 0, maximum = 0;
  const sync = createAutoSync(async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    if (calls === 1) { entered.resolve(); await release.promise; }
    active--;
    if (calls === 2) second.resolve();
  }, assert.fail, 0);
  try {
    sync.request(); await entered.promise;
    sync.request(); sync.request();
    release.resolve(); await second.promise;
    assert.equal(calls, 2);
    assert.equal(maximum, 1);
  } finally { sync.stop(); }
});

test('a failed sync reports the error and a later automatic request succeeds', { timeout: 2000 }, async () => {
  const failed = deferred(), succeeded = deferred();
  let calls = 0;
  const sync = createAutoSync(async () => {
    if (++calls === 1) throw new Error('connection lost');
    succeeded.resolve();
  }, error => { assert.match(error.message, /connection lost/); failed.resolve(); }, 0);
  try {
    sync.request(); await failed.promise;
    sync.request(); await succeeded.promise;
    assert.equal(calls, 2);
  } finally { sync.stop(); }
});

test('repeated triggers share one scheduled pass and stopping cancels pending work', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const sync = createAutoSync(async () => { calls++; }, assert.fail);
  sync.request(); sync.request(); sync.request();
  t.mock.timers.tick(200);
  assert.equal(calls, 1);
  sync.stop();
  const stopped = createAutoSync(async () => { calls++; }, assert.fail);
  stopped.request(); stopped.stop(); stopped.request();
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
});

import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

test('app syncs at startup, every two seconds, after saves and reconnecting', async () => {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const start = source.lastIndexOf('  useEffect(() => {', source.indexOf('    const automaticSync = createAutoSync'));
  const end = source.indexOf('\n  useEffect(() => {', start + 5);
  const events = new Map(), documentEvents = new Map();
  let effect, run, interval, delay, requests = 0, pushes = 0, pulls = 0, stopped = false;
  const context = {
    useEffect: fn => { effect = fn; },
    localReady: true, authSession: {}, hasSupabase: () => true,
    supabaseConfig: { url: 'https://database.test', anonKey: 'public' },
    navigator: { onLine: true }, syncBusyRef: { current: false },
    syncBackoffRef: { current: { remaining: () => 0, reset: () => {} } },
    inventoryReadRef: { current: null }, setSyncStatus: () => {},
    pushLocalToSupabase: async () => { pushes++; return true; },
    loadFromSupabase: async () => { pulls++; },
    createAutoSync: fn => { run = fn; return { request: () => { requests++; }, stop: () => { stopped = true; } }; },
    window: {
      setInterval: (fn, ms) => { interval = fn; delay = ms; return 1; },
      clearInterval: () => {},
      addEventListener: (key, fn) => events.set(key, fn),
      removeEventListener: key => events.delete(key),
    },
    document: {
      visibilityState: 'visible',
      addEventListener: (key, fn) => documentEvents.set(key, fn),
      removeEventListener: key => documentEvents.delete(key),
    },
  };
  vm.runInNewContext(stripTypeScriptTypes(source.slice(start, end)), context);
  const cleanup = effect();
  assert.equal(requests, 1);
  assert.equal(delay, 2000);
  interval(); events.get('pos-data-changed')(); events.get('online')(); events.get('focus')(); documentEvents.get('visibilitychange')();
  assert.equal(requests, 6);
  context.navigator.onLine = false;
  await run(); assert.equal(pushes, 1);
  context.navigator.onLine = true;
  await run(); assert.equal(pushes, 2); assert.equal(pulls, 2);
  cleanup(); assert.equal(stopped, true); assert.equal(events.size, 0);
});

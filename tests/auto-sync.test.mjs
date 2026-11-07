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

import vm from 'node:vm';

test('POS syncs automatically on startup, saves, polling and reconnect', async () => {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const start = source.lastIndexOf('  useEffect(() => {', source.indexOf('    const automaticSync = createAutoSync'));
  const end = source.indexOf('\n  useEffect(() => {', start + 5);
  const events = new Map();
  const documentEvents = new Map();
  let effect, run, interval;
  let requests = 0, pushes = 0, pulls = 0, cooldown = 5000, stopped = false;
  const context = {
    useEffect: fn => { effect = fn; },
    signedIn: true, localReady: true, hasSupabase: () => true, supabaseConfig: {},
    authSessionRef: { current: {} }, syncBusyRef: { current: false },
    syncBackoffRef: { current: { remaining: () => cooldown, reset: () => { cooldown = 0; } } },
    inventoryReadRef: { current: null },
    pushLocalToSupabase: async () => { pushes++; return true; },
    loadFromSupabase: async uploaded => { assert.equal(uploaded, true); pulls++; return true; },
    createAutoSync: fn => {
      run = fn;
      return { request: () => { requests++; }, stop: () => { stopped = true; } };
    },
    window: {
      setInterval: (fn, delay) => { assert.equal(delay, 2000); interval = fn; return 1; },
      clearInterval: () => {},
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: name => events.delete(name),
    },
    document: {
      visibilityState: 'visible',
      addEventListener: (name, fn) => documentEvents.set(name, fn),
      removeEventListener: name => documentEvents.delete(name),
    },
  };
  vm.runInNewContext(source.slice(start, end), context);
  const cleanup = effect();
  assert.equal(requests, 1);
  await run();
  assert.equal(pushes, 0);
  events.get('online')();
  await run();
  assert.equal(pushes, 1);
  assert.equal(pulls, 1);
  events.get('pos-data-changed')();
  interval();
  assert.equal(requests, 4);
  cleanup();
  assert.equal(stopped, true);
  assert.equal(events.size, 0);
  assert.equal(documentEvents.size, 0);
  assert.ok(!source.includes('>Sync now</button>'));
});

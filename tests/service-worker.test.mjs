import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function worker(fetchImpl, put = async () => {}) {
  const handlers = {};
  const cachedPaths = [];
  const context = {
    self: {
      location: { origin: 'https://pagerry.com' },
      addEventListener: (event, handler) => { handlers[event] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches: { open: async () => ({ put: async (path, response) => { cachedPaths.push(path); await put(path, response); }, match: async () => undefined }), keys: async () => [], delete: async () => true },
    fetch: fetchImpl, Response, URL,
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return { handlers, cachedPaths };
}

test('an unavailable shell asset does not abort worker installation', async () => {
  const { handlers, cachedPaths } = await worker(async path => {
    if (path === '/manifest.webmanifest') throw new Error('NotFound');
    return new Response('ok');
  });
  let done;
  handlers.install({ waitUntil: promise => { done = promise; } });
  await done;
  assert.ok(cachedPaths.includes('/'));
  assert.ok(cachedPaths.includes('/favicon.svg'));
});

test('database/auth requests bypass the worker and missing assets return a valid response', async () => {
  const { handlers } = await worker(async () => { throw new Error('offline'); });
  handlers.fetch({ request: { method: 'GET', url: 'https://project.supabase.co/rest/v1/products' }, respondWith: () => assert.fail('Database must bypass cache') });
  let result;
  handlers.fetch({ request: { method: 'GET', url: 'https://pagerry.com/missing.js', mode: 'cors' }, respondWith: promise => { result = promise; } });
  assert.equal((await result).status, 503);
});

test('cache write failures do not become unhandled rejections', async () => {
  const { handlers } = await worker(async () => new Response('asset'), async () => { throw new Error('Cache removed'); });
  let result;
  const waits = [];
  handlers.fetch({ request: { method: 'GET', url: 'https://pagerry.com/asset.js', mode: 'cors' }, respondWith: promise => { result = promise; }, waitUntil: promise => waits.push(promise) });
  assert.equal((await result).status, 200);
  await Promise.all(waits);
});

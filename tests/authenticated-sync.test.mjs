import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

async function harness(responses = [200]) {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  async function supabaseRequest<T>');
  const end = source.indexOf('  async function validSession(', start);
  const calls = [];
  const renewals = [];
  const context = {
    hasSupabase: () => true,
    supabaseConfig: { url: 'https://database.test', anonKey: 'public' },
    authSessionRef: { current: { access_token: 'signed-in' } },
    validSession: async (session, force) => { renewals.push(force); return { access_token: force ? 'renewed' : session.access_token }; },
    fetch: async (url, init) => { calls.push(init); return new Response(JSON.stringify([]), { status: responses.shift() ?? 200 }); },
    readWithTimeout: fn => fn(),
  };
  return { request: vm.runInNewContext(`(${stripTypeScriptTypes(source.slice(start, end))})`, context), calls, renewals, context };
}

test('product uploads use the signed-in session while apikey stays public', async () => {
  const h = await harness();
  await h.request('products', { method: 'POST', body: '[]' });
  assert.equal(h.calls[0].headers.Authorization, 'Bearer signed-in');
  assert.equal(h.calls[0].headers.apikey, 'public');
});

test('expired upload token is renewed and retried with the authenticated token', async () => {
  const h = await harness([401, 200]);
  await h.request('products', { method: 'POST', body: '[]' });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer renewed');
  assert.deepEqual(h.renewals, [undefined, true]);
});

test('database downloads after browser data is cleared use the new signed-in session', async () => {
  const h = await harness();
  h.context.authSessionRef.current = { access_token: 'fresh-login' };
  await h.request('products?select=*');
  assert.equal(h.calls[0].headers.Authorization, 'Bearer fresh-login');
});

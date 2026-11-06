import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyDatabaseRequest } from '../server/database-proxy.mjs';
import { SyncBackoff } from '../app/sync-backoff.ts';
const config = { url: 'https://database.test', anonKey: 'public-key' };
const request = (suffix, init = {}) => new Request('https://pagerry.com/api/database?' + suffix, {
  headers: { Authorization: 'Bearer signed-in-token', Prefer: 'resolution=merge-duplicates,return=representation' }, ...init,
});

test('relay sends signed-in token to fixed Supabase host and preserves query and errors', async () => {
  const result = await proxyDatabaseRequest(request('table=products&on_conflict=id', { method: 'POST', body: '[{"id":"p"}]' }), config, async (url, init) => {
    assert.equal(url, 'https://database.test/rest/v1/products?on_conflict=id');
    assert.equal(init.headers.get('Authorization'), 'Bearer signed-in-token');
    assert.equal(init.headers.get('apikey'), 'public-key');
    assert.equal(init.headers.get('prefer'), 'resolution=merge-duplicates,return=representation');
    assert.equal(init.body, '[{"id":"p"}]');
    return new Response('{"message":"permission denied"}', { status: 403 });
  });
  assert.equal(result.status, 403);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.match(await result.text(), /permission denied/);
});

test('relay preserves pagination, count headers and empty DELETE responses', async () => {
  const read = await proxyDatabaseRequest(request('table=sales&select=*&order=createdAt.desc,id.asc&limit=500&offset=1000'), config, async url => {
    assert.match(url, /offset=1000/);
    return new Response('[]', { status: 206, headers: { 'content-range': '1000-1499/1700' } });
  });
  assert.equal(read.status, 206); assert.equal(read.headers.get('content-range'), '1000-1499/1700');
  const removed = await proxyDatabaseRequest(request('table=products&id=eq.p', { method: 'DELETE' }), config, async () => new Response(null, { status: 204 }));
  assert.equal(removed.status, 204); assert.equal(await removed.text(), '');
});

test('relay rejects missing tokens and arbitrary destinations before sending', async () => {
  const send = () => assert.fail('must not forward');
  const invalid = await proxyDatabaseRequest(request('table=https://other.test'), config, send);
  assert.equal(invalid.status, 400);
  const noToken = await proxyDatabaseRequest(new Request('https://pagerry.com/api/database?table=products'), config, send);
  assert.equal(noToken.status, 401);
});

test('connection failures return a retryable response without claiming upload success', async () => {
  const result = await proxyDatabaseRequest(request('table=products', { method: 'POST', body: '[]' }), config, async () => { throw new TypeError('ECONNRESET'); });
  assert.equal(result.status, 503);
  assert.match(await result.text(), /Changes remain queued/);
});

test('network retry delay increases, is shared by parallel failures, and resets after recovery', () => {
  const backoff = new SyncBackoff();
  backoff.fail(1000); assert.equal(backoff.remaining(1000), 5000);
  backoff.fail(1001); assert.equal(backoff.remaining(1001), 4999);
  backoff.fail(6000); assert.equal(backoff.remaining(6000), 10000);
  backoff.fail(16000); assert.equal(backoff.remaining(16000), 20000);
  backoff.fail(36000); assert.equal(backoff.remaining(36000), 40000);
  backoff.fail(76000); assert.equal(backoff.remaining(76000), 60000);
  backoff.reset(); assert.equal(backoff.remaining(76000), 0);
  backoff.fail(76000); assert.equal(backoff.remaining(76000), 5000);
});

test('relay timeout releases hung database requests for a later automatic retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = proxyDatabaseRequest(request('table=products'), config, async (url, init) => {
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout'))));
  });
  t.mock.timers.tick(15000);
  const result = await pending;
  assert.equal(result.status, 503);
});

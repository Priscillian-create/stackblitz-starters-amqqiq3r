import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRefresher, needsSessionRefresh, SessionExpiredError } from '../app/auth-session.ts';

const session = { access_token: 'old', refresh_token: 'refresh', user: { id: 'cashier' } };
const next = { ...session, access_token: 'new', refresh_token: 'rotated', expires_at: 9999999999 };

test('renews tokens near expiry and reads JWT expiry for older saved sessions', () => {
  assert.equal(needsSessionRefresh({ ...session, expires_at: 200 }, 100000), false);
  assert.equal(needsSessionRefresh({ ...session, expires_at: 150 }, 100000), true);
  const token = 'header.' + Buffer.from(JSON.stringify({ exp: 200 })).toString('base64url') + '.signature';
  assert.equal(needsSessionRefresh({ ...session, access_token: token }, 100000), false);
  assert.equal(needsSessionRefresh(session), true);
});

test('concurrent renewals share one request and retain the rotated refresh token', async () => {
  let calls = 0;
  const renew = createSessionRefresher({ url: 'https://example.test', anonKey: 'public-key' }, async (url, init) => {
    calls++;
    assert.match(url, /grant_type=refresh_token/);
    assert.deepEqual(JSON.parse(init.body), { refresh_token: 'refresh' });
    return new Response(JSON.stringify(next));
  });
  const results = await Promise.all([renew(session), renew(session)]);
  assert.equal(calls, 1);
  assert.deepEqual(results, [next, next]);
});

test('rejected refresh requires sign-in while network failures remain retryable', async () => {
  const config = { url: 'https://example.test', anonKey: 'key' };
  const denied = createSessionRefresher(config, async () => new Response('', { status: 400 }));
  await assert.rejects(denied(session), SessionExpiredError);
  const offline = createSessionRefresher(config, async () => { throw new TypeError('offline'); });
  await assert.rejects(offline(session), TypeError);
  await assert.rejects(offline(session), TypeError);
});

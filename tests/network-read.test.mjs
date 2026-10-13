import assert from 'node:assert/strict';
import test from 'node:test';
import { readWithTimeout } from '../app/network-read.ts';

const stalledRead = signal => new Promise((resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('a suspended read times out, allowing sync to retry after waking', async () => {
  await assert.rejects(readWithTimeout(stalledRead, null, 5), { name: 'TimeoutError' });
  assert.equal(await readWithTimeout(async () => 'reconnected', null, 100), 'reconnected');
});

test('hiding the page cancels the active download', async () => {
  const controller = new AbortController();
  const reading = readWithTimeout(stalledRead, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
});

test('a successful read keeps the complete result', async () => {
  assert.deepEqual(await readWithTimeout(async () => [{ id: 'saved' }]), [{ id: 'saved' }]);
});

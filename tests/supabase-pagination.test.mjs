import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllRows } from '../app/supabase-pagination.ts';

test('loads all 1,519 inventory records across multiple pages', async () => {
  const records = Array.from({ length: 1519 }, (_, id) => ({ id }));
  const offsets = [];
  const rows = await loadAllRows('products?select=*&order=name.asc,id.asc', async (path) => {
    const params = new URLSearchParams(path.split('?')[1]);
    const offset = Number(params.get('offset'));
    offsets.push(offset);
    assert.equal(params.get('order'), 'name.asc,id.asc');
    return records.slice(offset, offset + Number(params.get('limit')));
  });
  assert.deepEqual(rows, records);
  assert.deepEqual(offsets, [0, 500, 1000, 1500]);
});

test('fetches the terminating empty page for an exact page multiple', async () => {
  let calls = 0;
  const rows = await loadAllRows('products', async () => ++calls === 1 ? Array(500).fill(1) : []);
  assert.equal(rows.length, 500);
  assert.equal(calls, 2);
});

test('rejects a failed later page rather than returning an incomplete inventory', async () => {
  let calls = 0;
  await assert.rejects(loadAllRows('products?select=*', async () => {
    if (++calls === 2) throw new Error('Connection lost');
    return Array(500).fill(1);
  }), /Connection lost/);
});

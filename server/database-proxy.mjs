// Fixed-destination relay: Supabase still validates the caller's own access token.
const tables = new Set(['products', 'customers', 'expenses', 'sales', 'sale_items', 'app_users']);

/** @param {Request} request
 * @param {{url: string, anonKey: string}} config
 * @param {typeof fetch} send */
export async function proxyDatabaseRequest(request, config, send = fetch) {
  const reply = (message, status) => Response.json({ message }, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return reply('Method not allowed', 405);
  const query = new URL(request.url).searchParams;
  const table = query.get('table');
  if (!table || !tables.has(table)) return reply('Unknown database table', 400);
  query.delete('table');
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return reply('Sign in to access the database', 401);
  const headers = new Headers({
    apikey: config.anonKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
  });
  for (const key of ['prefer', 'range', 'range-unit']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await send(`${config.url.replace(/\/$/, '')}/rest/v1/${table}?${query}`, {
      method: request.method, headers, redirect: 'error', signal: controller.signal,
      ...(request.method === 'GET' ? {} : { body: await request.text() }),
    });
    const body = response.status === 204 ? null : await response.text();
    const returnedHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of ['content-type', 'content-range', 'retry-after']) {
      const value = response.headers.get(key);
      if (value) returnedHeaders.set(key, value);
    }
    return new Response(body, { status: response.status, headers: returnedHeaders });
  } catch {
    return reply('Database connection interrupted. Changes remain queued; automatic sync will retry.', 503);
  } finally { clearTimeout(timeout); }
}

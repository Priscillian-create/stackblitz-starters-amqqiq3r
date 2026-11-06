const { handler: getConfig } = require('./supabase-config.cjs');

exports.handler = async function handler(event) {
  const { proxyDatabaseRequest } = await import('../../server/database-proxy.mjs');
  const config = JSON.parse((await getConfig()).body);
  const request = new Request(event.rawUrl || `https://pagerry.com/api/database?${new URLSearchParams(event.queryStringParameters || {})}`, {
    method: event.httpMethod,
    headers: event.headers,
    ...(['GET', 'HEAD'].includes(event.httpMethod) ? {} : {
      body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '',
    }),
  });
  const response = await proxyDatabaseRequest(request, config);
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
};

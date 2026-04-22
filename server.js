const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

let port = Number(process.env.PORT) || 8080;
const root = __dirname;
const REMOTE_API_ORIGIN = 'https://gerrysm.vercel.app';

const mime = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8'
};

function send(res, status, data, headers = {}) {
  res.writeHead(status, headers);
  res.end(data);
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mime[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        send(res, 404, 'Not Found');
      } else {
        send(res, 500, 'Server Error');
      }
      return;
    }
    send(res, 200, data, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  });
}

function parseBodySource(raw, contentType, cb) {
  try {
    if ((contentType || '').includes('application/json')) {
      cb(null, raw ? JSON.parse(raw) : {});
    } else {
      cb(null, raw);
    }
  } catch (e) {
    cb(e);
  }
}

function parseBody(req, cb, rawBody = null) {
  if (rawBody != null) {
    parseBodySource(rawBody, req.headers['content-type'] || '', cb);
    return;
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    parseBodySource(raw, req.headers['content-type'] || '', cb);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function okJson(res, obj) {
  send(res, 200, JSON.stringify(obj || {}), { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' });
}

function notFound(res) {
  okJson(res, { error: 'Not Found' });
}

function getDevDb() {
  global.__DEV_DB__ = global.__DEV_DB__ || { products: [], expenses: [], purchases: [], sales: [], deletedSales: [] };
  return global.__DEV_DB__;
}

function normalizeReceiptNumber(value) {
  return String(value || '').trim();
}

function getSaleReceiptNumber(sale) {
  return normalizeReceiptNumber(sale && (sale.receiptNumber || sale.receiptnumber));
}

function getSaleArchiveKey(sale) {
  if (!sale || typeof sale !== 'object') return '';
  if (sale.id != null && String(sale.id).trim()) return `id:${String(sale.id).trim()}`;
  const receiptNumber = getSaleReceiptNumber(sale);
  return receiptNumber ? `receipt:${receiptNumber}` : '';
}

function normalizeRemoteProductsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.products)) return payload.products;
  return [];
}

function normalizeProductRecord(product) {
  if (!product || typeof product !== 'object') return null;
  return {
    ...product,
    id: product.id,
    name: product.name || 'Unnamed',
    category: product.category || 'Uncategorized',
    price: Number(product.price) || 0,
    stock: Number(product.stock) || 0,
    expiryDate: product.expiryDate || product.expirydate || null,
    barcode: product.barcode || '',
    created_at: product.created_at || product.createdAt || product.updated_at || new Date().toISOString(),
    updated_at: product.updated_at || product.updatedAt || product.created_at || new Date().toISOString()
  };
}

function hydrateLocalProducts(products) {
  const db = getDevDb();
  const normalized = normalizeRemoteProductsPayload(products).map(normalizeProductRecord).filter(Boolean);
  if (normalized.length > 0 && db.products.length === 0) {
    db.products = normalized;
  }
}

function handleLocalApi(req, res, rawBody = null) {
  const u = new URL(req.url, `http://localhost:${port}`);
  const p = u.pathname.replace(/^\/+|\/+$/g, '');
  const db = getDevDb();
  if (p === 'api/auth/login' && req.method === 'POST') {
    parseBody(req, (err, body) => {
      if (err) {
        send(res, 400, JSON.stringify({ error: 'Bad Request' }), { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' });
        return;
      }
      const email = String(body && body.email || '').trim().toLowerCase();
      const password = String(body && body.password || '').trim();
      if (!email || !password) {
        send(res, 400, JSON.stringify({ error: 'Email and password are required' }), { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' });
        return;
      }
      okJson(res, { token: 'dev-token', user: { id: 'dev', email, role: 'admin' } });
    }, rawBody);
    return;
  }
  if (p === 'api/products' && req.method === 'GET') {
    okJson(res, db.products);
    return;
  }
  if (p.startsWith('api/products/') && req.method === 'PUT') {
    const id = p.split('/')[2];
    parseBody(req, (err, body) => {
      if (err) return okJson(res, { error: 'Bad Request' });
      const idx = db.products.findIndex(pr => String(pr.id) === String(id));
      const now = new Date().toISOString();
      if (idx >= 0) {
        db.products[idx] = { ...db.products[idx], ...body, id, updated_at: now };
        okJson(res, db.products[idx]);
      } else {
        const item = {
          id,
          name: body && body.name || 'Unnamed',
          category: body && body.category || 'Uncategorized',
          price: Number(body && body.price) || 0,
          stock: Number(body && body.stock) || 0,
          expiryDate: body && body.expiryDate || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          barcode: body && body.barcode || '',
          created_at: now,
          updated_at: now
        };
        db.products.push(item);
        okJson(res, item);
      }
    }, rawBody);
    return;
  }
  if (p.startsWith('api/products/') && req.method === 'DELETE') {
    const id = p.split('/')[2];
    const before = db.products.length;
    db.products = db.products.filter(pr => String(pr.id) !== String(id));
    okJson(res, { success: true, removed: before !== db.products.length });
    return;
  }
  if (p === 'api/products' && req.method === 'POST') {
    parseBody(req, (err, body) => {
      if (err) return okJson(res, { error: 'Bad Request' });
      const item = {
        id: Date.now().toString(),
        name: body && body.name || 'Unnamed',
        category: body && body.category || 'Uncategorized',
        price: Number(body && body.price) || 0,
        stock: Number(body && body.stock) || 0,
        expiryDate: body && body.expiryDate || new Date(Date.now() + 365*24*3600*1000).toISOString().slice(0,10),
        barcode: body && body.barcode || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.products.push(item);
      okJson(res, item);
    }, rawBody);
    return;
  }
  if (p === 'api/stock' && req.method === 'GET') {
    okJson(res, db.products);
    return;
  }
  if (p === 'api/checkout' && req.method === 'POST') {
    parseBody(req, (err, body) => {
      if (err) return okJson(res, { error: 'Bad Request' });
      const sale = {
        id: Date.now().toString(),
        receiptNumber: body && body.receiptNumber || `R${Date.now()}`,
        items: Array.isArray(body && body.items) ? body.items : [],
        total: Number(body && body.total) || 0,
        paymentMethod: (body && body.paymentMethod) || 'cash',
        cashier: body && body.cashier || 'cashier',
        created_at: body && body.created_at || new Date().toISOString()
      };
      db.sales.push(sale);
      sale.items.forEach(it => {
        const pid = it && (it.id || it.productId);
        const qty = Number(it && it.quantity) || 0;
        if (pid) {
          const pr = db.products.find(x => String(x.id) === String(pid));
          if (pr) pr.stock = Math.max(0, Number(pr.stock || 0) - qty);
        }
      });
      okJson(res, sale);
    }, rawBody);
    return;
  }
  if (p === 'api/sales' && req.method === 'GET') {
    const day = u.searchParams.get('date');
    const start = u.searchParams.get('start');
    const end = u.searchParams.get('end');
    let filteredSales = Array.isArray(db.sales) ? db.sales.slice() : [];
    if (day || start || end) {
      let s = new Date('1970-01-01T00:00:00.000Z');
      let e = new Date();
      if (day) {
        const d = new Date(day);
        s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      } else {
        s = start ? new Date(start) : s;
        e = end ? new Date(end) : e;
      }
      filteredSales = filteredSales.filter((sale) => {
        const t = new Date(sale && sale.created_at).getTime();
        return t >= s.getTime() && t <= e.getTime();
      });
    }
    okJson(res, { sales: filteredSales });
    return;
  }
  if (p === 'api/sales/deleted' && req.method === 'GET') {
    okJson(res, { sales: Array.isArray(db.deletedSales) ? db.deletedSales : [] });
    return;
  }
  if (p.startsWith('api/sales/') && req.method === 'DELETE') {
    const id = decodeURIComponent(p.split('/')[2] || '');
    const receiptNumber = normalizeReceiptNumber(u.searchParams.get('receiptNumber'));
    const activeSales = Array.isArray(db.sales) ? db.sales : [];
    const saleIndex = activeSales.findIndex((sale) => {
      if (!sale) return false;
      if (id && String(sale.id) === String(id)) return true;
      return receiptNumber && getSaleReceiptNumber(sale) === receiptNumber;
    });
    if (saleIndex === -1) {
      const archived = (Array.isArray(db.deletedSales) ? db.deletedSales : []).find((sale) => {
        if (!sale) return false;
        if (id && String(sale.id) === String(id)) return true;
        return receiptNumber && getSaleReceiptNumber(sale) === receiptNumber;
      });
      okJson(res, { success: !!archived, sale: archived || null, sales: db.sales, deletedSales: db.deletedSales });
      return;
    }
    const existingSale = activeSales[saleIndex];
    const deletedAt = new Date().toISOString();
    const archivedSale = {
      ...existingSale,
      deleted: true,
      deletedAt,
      deleted_at: deletedAt
    };
    db.sales.splice(saleIndex, 1);
    const archivedKey = getSaleArchiveKey(archivedSale);
    const deletedIndex = (Array.isArray(db.deletedSales) ? db.deletedSales : []).findIndex((sale) => getSaleArchiveKey(sale) === archivedKey);
    if (deletedIndex >= 0) {
      db.deletedSales[deletedIndex] = archivedSale;
    } else {
      db.deletedSales.unshift(archivedSale);
    }
    okJson(res, { success: true, sale: archivedSale, sales: db.sales, deletedSales: db.deletedSales });
    return;
  }
  if (p === 'api/expenses' && req.method === 'GET') {
    okJson(res, db.expenses);
    return;
  }
  if (p === 'api/expenses' && req.method === 'POST') {
    parseBody(req, (err, body) => {
      if (err) return okJson(res, { error: 'Bad Request' });
      const item = { id: Date.now().toString(), ...body };
      db.expenses.unshift(item);
      okJson(res, item);
    }, rawBody);
    return;
  }
  if (p.startsWith('api/expenses/') && req.method === 'DELETE') {
    const id = p.split('/')[2];
    const before = db.expenses.length;
    db.expenses = db.expenses.filter(e => String(e.id) !== String(id));
    okJson(res, { success: true, removed: before !== db.expenses.length });
    return;
  }
  if (p === 'api/purchases' && req.method === 'GET') {
    okJson(res, db.purchases);
    return;
  }
  if (p === 'api/purchases' && req.method === 'POST') {
    parseBody(req, (err, body) => {
      if (err) return okJson(res, { error: 'Bad Request' });
      const item = { id: Date.now().toString(), ...body };
      db.purchases.unshift(item);
      okJson(res, item);
    }, rawBody);
    return;
  }
  if (p.startsWith('api/purchases/') && req.method === 'DELETE') {
    const id = p.split('/')[2];
    const before = db.purchases.length;
    db.purchases = db.purchases.filter(e => String(e.id) !== String(id));
    okJson(res, { success: true, removed: before !== db.purchases.length });
    return;
  }
  if (p === 'api/reports/daily' && req.method === 'GET') {
    const day = u.searchParams.get('date');
    const start = u.searchParams.get('start');
    const end = u.searchParams.get('end');
    let s = new Date();
    let e = new Date();
    if (day) {
      const d = new Date(day);
      s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
      e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
    } else if (start || end) {
      s = start ? new Date(start) : new Date('1970-01-01T00:00:00.000Z');
      e = end ? new Date(end) : new Date();
    }
    const inRange = db.sales.filter(x => {
      const t = new Date(x.created_at).getTime();
      return t >= s.getTime() && t <= e.getTime();
    });
    let total = 0, transactions = 0, items = 0, cash = 0, pos = 0;
    inRange.forEach(x => {
      total += Number(x.total) || 0;
      transactions += 1;
      if (Array.isArray(x.items)) items += x.items.reduce((m, it) => m + (Number(it.quantity) || 0), 0);
      const pm = (x.paymentMethod || '').toLowerCase();
      if (pm === 'cash') cash += Number(x.total) || 0;
      if (pm === 'pos') pos += Number(x.total) || 0;
    });
    okJson(res, { total, transactions, items, cash, pos, sales: inRange });
    return;
  }
  if (p === 'api/reports/summary' && req.method === 'GET') {
    // Simple summary over all sales
    const inRange = db.sales.slice();
    let total = 0, transactions = 0, items = 0, cash = 0, pos = 0;
    inRange.forEach(x => {
      total += Number(x.total) || 0;
      transactions += 1;
      if (Array.isArray(x.items)) items += x.items.reduce((m, it) => m + (Number(it.quantity) || 0), 0);
      const pm = (x.paymentMethod || '').toLowerCase();
      if (pm === 'cash') cash += Number(x.total) || 0;
      if (pm === 'pos') pos += Number(x.total) || 0;
    });
    okJson(res, { total, transactions, items, cash, pos, sales: inRange });
    return;
  }
  if (p === 'api/reports/products' && req.method === 'GET') {
    const counts = {};
    db.sales.forEach(sale => {
      (sale.items || []).forEach(it => {
        const k = it.id || it.productId || it.name || 'unknown';
        const qty = Number(it.quantity) || 0;
        const amt = (Number(it.price) || 0) * qty;
        if (!counts[k]) counts[k] = { id: it.id || it.productId || '', name: it.name || 'Unknown', count: 0, amount: 0 };
        counts[k].count += qty;
        counts[k].amount += amt;
      });
    });
    okJson(res, { items: Object.values(counts) });
    return;
  }
  if (p === 'api/reports/categories' && req.method === 'GET') {
    const byCat = {};
    db.sales.forEach(sale => {
      (sale.items || []).forEach(it => {
        let cat = 'Uncategorized';
        const pr = db.products.find(x => String(x.id) === String(it.id || it.productId));
        if (pr && pr.category) cat = pr.category;
        const qty = Number(it.quantity) || 0;
        const amt = (Number(it.price) || 0) * qty;
        if (!byCat[cat]) byCat[cat] = { category: cat, count: 0, amount: 0 };
        byCat[cat].count += qty;
        byCat[cat].amount += amt;
      });
    });
    okJson(res, { items: Object.values(byCat) });
    return;
  }
  if (p === 'api/analytics' && req.method === 'GET') {
    okJson(res, { revenue: 0, expenses: 0, purchases: 0, profit: 0, profitMargin: 0, soldRevenue: 0, soldCost: 0 });
    return;
  }
  notFound(res);
}

function filterProxyHeaders(headers) {
  const output = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    const name = String(key || '').toLowerCase();
    if (!value) return;
    if (['host', 'connection', 'content-length', 'accept-encoding'].includes(name)) return;
    output[key] = value;
  });
  return output;
}

function proxyApiRequest(req, rawBody) {
  return new Promise((resolve, reject) => {
    const target = new URL(req.url, REMOTE_API_ORIGIN);
    const headers = filterProxyHeaders(req.headers);
    if (rawBody && !['GET', 'HEAD'].includes((req.method || 'GET').toUpperCase())) {
      headers['Content-Length'] = Buffer.byteLength(rawBody);
    }
    const requestImpl = target.protocol === 'https:' ? https : http;
    const proxyReq = requestImpl.request(target, { method: req.method, headers }, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        resolve({
          status: proxyRes.statusCode || 500,
          headers: proxyRes.headers || {},
          body: Buffer.concat(chunks)
        });
      });
    });
    proxyReq.on('error', reject);
    if (rawBody && !['GET', 'HEAD'].includes((req.method || 'GET').toUpperCase())) {
      proxyReq.write(rawBody);
    }
    proxyReq.end();
  });
}

function relayProxyResponse(res, proxyRes) {
  const headers = {};
  Object.entries(proxyRes.headers || {}).forEach(([key, value]) => {
    const name = String(key || '').toLowerCase();
    if (!value) return;
    if (['transfer-encoding', 'connection', 'keep-alive', 'content-encoding'].includes(name)) return;
    headers[key] = value;
  });
  headers['Cache-Control'] = 'no-cache';
  send(res, proxyRes.status || 500, proxyRes.body || '', headers);
}

function shouldUseLocalApi(req) {
  const forceLocal = String(process.env.FORCE_LOCAL_API || '').toLowerCase();
  if (forceLocal === '1' || forceLocal === 'true' || forceLocal === 'yes') return true;
  return false;
}

function canFallbackToLocalApi(req) {
  const pathname = new URL(req.url, REMOTE_API_ORIGIN).pathname.replace(/^\/+|\/+$/g, '');
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  return (
    pathname === 'api/products' ||
    pathname === 'api/stock' ||
    pathname === 'api/sales' ||
    pathname === 'api/sales/deleted' ||
    pathname === 'api/expenses' ||
    pathname === 'api/purchases' ||
    pathname.startsWith('api/reports/') ||
    pathname === 'api/analytics'
  );
}

async function tryHandleApi(req, res, rawBody) {
  const method = (req.method || 'GET').toUpperCase();
  if (shouldUseLocalApi(req)) {
    handleLocalApi(req, res, rawBody);
    return true;
  }
  try {
    const proxyRes = await proxyApiRequest(req, rawBody);
    if (proxyRes.status >= 200 && proxyRes.status < 400) {
      const pathname = new URL(req.url, REMOTE_API_ORIGIN).pathname.replace(/^\/+|\/+$/g, '');
      if ((method === 'GET' && (pathname === 'api/products' || pathname === 'api/stock')) && proxyRes.body) {
        try {
          hydrateLocalProducts(JSON.parse(proxyRes.body.toString('utf8')));
        } catch (_) {}
      }
      relayProxyResponse(res, proxyRes);
      return true;
    }
    if (canFallbackToLocalApi(req) && [404, 405, 500, 501, 502, 503, 504].includes(proxyRes.status)) {
      handleLocalApi(req, res, rawBody);
      return true;
    }
    if (method === 'GET' || ![404, 405, 501].includes(proxyRes.status)) {
      relayProxyResponse(res, proxyRes);
      return true;
    }
  } catch (_) {
    if (canFallbackToLocalApi(req)) {
      handleLocalApi(req, res, rawBody);
      return true;
    }
  }
  okJson(res, { error: 'Backend unavailable' });
  return true;
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURI(req.url.split('?')[0] || '/');
    if (urlPath.startsWith('/api/')) {
      readRequestBody(req)
        .then((rawBody) => tryHandleApi(req, res, rawBody))
        .catch(() => handleLocalApi(req, res, ''));
      return;
    }
    if (urlPath === '/' || urlPath === '') {
      serveFile(path.join(root, 'index.html'), res);
      return;
    }
    const filePath = path.join(root, urlPath);
    fs.stat(filePath, (err, stat) => {
      if (err) {
        serveFile(path.join(root, 'index.html'), res);
        return;
      }
      if (stat.isDirectory()) {
        serveFile(path.join(filePath, 'index.html'), res);
      } else {
        serveFile(filePath, res);
      }
    });
  } catch (_) {
    send(res, 500, 'Server Error');
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const next = port + 1;
    console.warn(`Port ${port} in use, retrying on ${next}...`);
    port = next;
    setTimeout(() => {
      server.listen(port, () => {
        const url = `http://localhost:${port}/`;
        console.log(`Local preview server running at ${url}`);
      });
    }, 300);
  } else {
    throw err;
  }
});

server.listen(port, () => {
  const url = `http://localhost:${port}/`;
  console.log(`Local preview server running at ${url}`);
});

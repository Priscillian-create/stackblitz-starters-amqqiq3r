const DEFAULT_BACKEND_BASE_URL = 'https://gerrysm.vercel.app/';
const LOCAL_BACKEND_BASE_URL = '/api';

function isLocalDevHost(hostname) {
  return /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)$/i.test(String(hostname || '').trim());
}

function normalizeBaseUrl(value) {
  const cleaned = String(value || '').trim().replace(/\/+$/, '');
  if (!cleaned) return DEFAULT_BACKEND_BASE_URL;
  if (/\/api$/i.test(cleaned)) return cleaned;
  return `${cleaned}/api`;
}

function isLegacyLocalBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return false;
  if (normalized === '/api') return true;
  return /^(https?:)?\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?\/api$/i.test(normalized);
}

function resolveBaseUrl() {
  if (typeof window === 'undefined') return DEFAULT_BACKEND_BASE_URL;
  const storedBaseUrl = normalizeBaseUrl(localStorage.getItem('backendBaseUrl'));
  const defaultBaseUrl = normalizeBaseUrl(DEFAULT_BACKEND_BASE_URL);
  const localBaseUrl = normalizeBaseUrl(LOCAL_BACKEND_BASE_URL);
  if (isLocalDevHost(window.location && window.location.hostname)) {
    if (!storedBaseUrl || storedBaseUrl === defaultBaseUrl || storedBaseUrl === localBaseUrl || isLegacyLocalBaseUrl(storedBaseUrl)) {
      localStorage.setItem('backendBaseUrl', localBaseUrl);
      return localBaseUrl;
    }
    return storedBaseUrl;
  }
  if (storedBaseUrl) return storedBaseUrl;
  localStorage.setItem('backendBaseUrl', defaultBaseUrl);
  return defaultBaseUrl;
}

let __base = DEFAULT_BACKEND_BASE_URL;
try {
  __base = resolveBaseUrl();
} catch (_) {}
export const BASE_URL = __base;

function getAuthToken() {
  try {
    return localStorage.getItem('token') || null;
  } catch (_) {
    return null;
  }
}

function setAuthToken(token) {
  try {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  } catch (_) {}
}

let loginAttemptActive = false;
let loginBackoffUntil = 0;

async function handleResponse(endpoint, method, res) {
  if (res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return {};
  }
  let message = `API request failed (${res.status})`;
  let payload = null;
  try {
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_) {
        payload = text;
      }
    }
  } catch (_) {}
  if (payload && typeof payload === 'object') {
    if (payload.message) message = payload.message;
    else if (payload.error && (payload.error.message || payload.error)) {
      message = payload.error.message || payload.error;
    }
  } else if (typeof payload === 'string' && payload.trim()) {
    message = payload;
  }
  if (res.status === 401) {
    try { localStorage.removeItem('token'); } catch (_) {}
    if (!payload) message = 'Unauthorized';
  } else if (res.status === 503 && !payload) {
    message = 'Server unavailable';
  } else if (res.status === 500 && !payload) {
    message = 'Server error';
  }
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('api-error', {
          detail: { endpoint, method, status: res.status, message }
        })
      );
    }
  } catch (_) {}
  throw new Error(message);
}

export async function apiRequest(endpoint, method = 'GET', body = null, requiresAuth = false) {
  const url = `${BASE_URL.replace(/\/+$/, '')}/${String(endpoint).replace(/^\/+/, '')}`;
  const headers = {};
  if (requiresAuth) {
    const token = getAuthToken();
    if (!token) {
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('api-error', {
              detail: { endpoint, method, status: 401, message: 'Unauthorized' }
            })
          );
        }
      } catch (_) {}
      throw new Error('Unauthorized');
    } else {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  try {
    const res = await fetch(url, {
      method,
      headers: (method && method.toUpperCase() !== 'GET' && body != null) ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : null
    });
    return await handleResponse(endpoint, method, res);
  } catch (e) {
    const isNetworkError = e && (e.name === 'TypeError' || String(e.message || '').toLowerCase().includes('failed to fetch'));
    const message = isNetworkError ? 'Connection failed' : (e && e.message) || 'Connection failed';
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(
          new CustomEvent('api-error', {
            detail: { endpoint, method, status: 0, message }
          })
        );
      }
    } catch (_) {}
    try {
      const m = (method || 'GET').toString().toUpperCase();
      if (m === 'GET' && isNetworkError) return [];
    } catch (_) {}
    throw new Error(message);
  }
}

export const AuthAPI = {
  async login(email, password) {
    const now = Date.now();
    if (now < loginBackoffUntil) {
      throw new Error('Too many attempts. Please wait a moment and try again.');
    }
    if (loginAttemptActive) {
      throw new Error('Login already in progress');
    }
    loginAttemptActive = true;
    try {
      const payload = { email: String(email || '').trim().toLowerCase(), password: String(password || '').trim() };
      if (!payload.email || !payload.password) {
        throw new Error('Email and password are required');
      }
      const data = await apiRequest('auth/login', 'POST', payload, false);
      const token = data && (data.token || data.access_token);
      if (!token) {
        throw new Error('Invalid email or password');
      }
      setAuthToken(token);
      loginBackoffUntil = 0;
      return data || {};
    } catch (e) {
      loginBackoffUntil = Date.now() + 3000;
      throw e;
    } finally {
      loginAttemptActive = false;
    }
  },
  logout() {
    setAuthToken(null);
  }
};

export const ProductsAPI = {
  async list() {
    const data = await apiRequest('products', 'GET', null, true);
    if (Array.isArray(data)) return data;
    if (data && data.success === false) {
      throw new Error(data.message || 'Failed to load products');
    }
    if (Array.isArray(data && data.products)) return data.products;
    if (Array.isArray(data && data.items)) return data.items;
    if (Array.isArray(data && data.data)) return data.data;
    return [];
  },
  async create(product) {
    return apiRequest('products', 'POST', product, true);
  },
  async update(id, product) {
    return apiRequest(`products/${encodeURIComponent(id)}`, 'PUT', product, true);
  },
  async remove(id) {
    return apiRequest(`products/${encodeURIComponent(id)}`, 'DELETE', null, true);
  }
};

export const StockAPI = {
  async get() {
    return apiRequest('stock', 'GET', null, true);
  }
};

export const CheckoutAPI = {
  async checkout(payload) {
    return apiRequest('checkout', 'POST', payload, true);
  }
};

export const SalesAPI = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    const data = await apiRequest(`sales${q ? `?${q}` : ''}`, 'GET', null, true);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data && data.sales)) return data.sales;
    if (Array.isArray(data && data.items)) return data.items;
    if (Array.isArray(data && data.data)) return data.data;
    return [];
  },
  async listDeleted(params = {}) {
    const q = new URLSearchParams(params).toString();
    const data = await apiRequest(`sales/deleted${q ? `?${q}` : ''}`, 'GET', null, true);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data && data.sales)) return data.sales;
    if (Array.isArray(data && data.items)) return data.items;
    if (Array.isArray(data && data.data)) return data.data;
    return [];
  },
  async remove(id, params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`sales/${encodeURIComponent(id)}${q ? `?${q}` : ''}`, 'DELETE', null, true);
  }
};

export const ExpensesAPI = {
  async list() {
    return apiRequest('expenses', 'GET', null, true);
  },
  async create(expense) {
    return apiRequest('expenses', 'POST', expense, true);
  },
  async remove(id) {
    return apiRequest(`expenses/${encodeURIComponent(id)}`, 'DELETE', null, true);
  }
};

export const PurchasesAPI = {
  async list() {
    return apiRequest('purchases', 'GET', null, true);
  },
  async create(purchase) {
    return apiRequest('purchases', 'POST', purchase, true);
  }
};

export const ReportsAPI = {
  async summary(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`reports/summary${q ? `?${q}` : ''}`, 'GET', null, true);
  },
  async daily(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`reports/daily${q ? `?${q}` : ''}`, 'GET', null, true);
  },
  async products(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`reports/products${q ? `?${q}` : ''}`, 'GET', null, true);
  },
  async categories(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`reports/categories${q ? `?${q}` : ''}`, 'GET', null, true);
  },
  async analytics(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`analytics${q ? `?${q}` : ''}`, 'GET', null, true);
  }
};

export async function login(email, password) {
  const data = await AuthAPI.login(email, password);
  return data || {};
}

export async function getProducts() {
  return ProductsAPI.list();
}

export async function getReports(params = {}) {
  const p = params || {};
  if (p.date) {
    return ReportsAPI.daily({ date: p.date });
  }
  if (p.start && p.end) {
    return ReportsAPI.summary({ start: p.start, end: p.end });
  }
  return ReportsAPI.summary(p);
}

export function logout() {
  AuthAPI.logout();
}

export { getAuthToken as getToken, getAuthToken };

import { apiRequest, AuthAPI as BackendAuth, ProductsAPI, ExpensesAPI, PurchasesAPI, CheckoutAPI, ReportsAPI, SalesAPI, getToken, BASE_URL } from './api.js?v=20260412';

// Service Worker Registration
if ('serviceWorker' in navigator && !window.location.hostname.includes('stackblitz') && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => {})
            .catch(() => {});
    });
  }
  function stripInjectedDevClients() {
    try {
      const devHosts = ['localhost:5174', '127.0.0.1:5174'];
      const isDevRef = (el) => {
        const u = (el && (el.src || el.href || '')) + '';
        return devHosts.some(h => u.includes(h)) || u.includes('/@vite') || u.includes('__vite') || u.includes('hmr');
      };
      document.querySelectorAll('script,link').forEach(el => {
        if (isDevRef(el)) {
          el.parentElement && el.parentElement.removeChild(el);
        }
      });
    } catch (_) {}
  }
  document.addEventListener('DOMContentLoaded', stripInjectedDevClients);
  setTimeout(stripInjectedDevClients, 1500);
  window.addEventListener('error', (e) => {
    try {
      const msg = (e && e.message) || '';
      const file = (e && e.filename) || '';
      const line = (e && e.lineno) || 0;
      const col = (e && e.colno) || 0;
      const lowerMsg = (msg || '').toString().toLowerCase();
      const lowerFile = (file || '').toString().toLowerCase();
      const isAbort = lowerMsg.includes('abort') || lowerMsg.includes('err_aborted') || lowerMsg.includes('err_network_changed') || lowerMsg.includes('network_changed') || lowerMsg.includes('err_network_io_suspended') || lowerMsg.includes('network_io_suspended');
      const isLiveReload = lowerMsg.includes('livereload') || lowerFile.includes('livereload');
      const isDevProbe = lowerMsg.includes('localhost:5174') || lowerFile.includes('localhost:5174') || lowerMsg.includes('@vite') || lowerMsg.includes('__vite') || lowerMsg.includes('hmr');
      if (isAbort || isLiveReload) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        return;
      }
      if (isDevProbe) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        return;
      }
      console.error('[GlobalError]', msg, file, line, col);
      const err = e && e.error;
      if (err && err.stack) console.error(err.stack);
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const msg = (e && e.reason && (e.reason.message || '') || '').toString().toLowerCase();
      const isAbort = msg.includes('abort') || msg.includes('err_aborted') || msg.includes('err_network_changed') || msg.includes('network_changed') || msg.includes('err_network_io_suspended') || msg.includes('network_io_suspended') || msg.includes('livereload');
      const isDevProbe = msg.includes('localhost:5174') || msg.includes('@vite') || msg.includes('__vite') || msg.includes('hmr');
      if (isAbort) {
        e.preventDefault();
        return;
      }
      if (isDevProbe) {
        e.preventDefault();
        return;
      }
    } catch (_) {}
  });
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e && e.data;
      if (d && d.type === 'SW_ACTIVATED') {
        
      }
    });
  }
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('api-error', (e) => {
        const detail = (e && e.detail) || {};
        const code = detail && detail.status ? ` (${detail.status})` : '';
        const ep = (detail && detail.endpoint) || '';
        let configuredHealth = 'products';
        try {
          const v = localStorage.getItem('healthEndpoint');
          if (v && typeof v === 'string') configuredHealth = v.replace(/^\/+|\/+$/g, '');
        } catch (_) {}
        if (detail.status === 401) {
          logout();
          showNotification('Invalid credentials', 'error');
          return;
        }
        if (detail.status === 403) {
          showNotification('Access denied', 'warning');
          return;
        }
        const txt = (detail && (detail.message || detail.text || ep || 'API error')) || 'API error';
        showNotification(`Upstream error${code}: ${txt}`, 'warning');
      });
    }
  } catch (_) {}
  
  function loadStockCheck() {
    if (stockDayBadge) {
        const d = new Date();
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        stockDayBadge.textContent = d.getDay() === 4 ? 'Today is Thursday' : 'Today is ' + days[d.getDay()];
    }
    if (stockLastUpdated) {
        stockLastUpdated.textContent = new Date().toLocaleString();
    }
    const render = (list) => {
        if (!stockTableBody) return;
        const items = (list || []).filter(p => p && !p.deleted);
        if (items.length === 0) {
            stockTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No products</td></tr>';
            return;
        }
        // Group by category
        const groups = new Map();
        for (const p of items) {
            const cat = (p.category || 'Uncategorized').toString();
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(p);
        }
        // Sort categories and products
        const categories = Array.from(groups.keys()).sort((a,b) => a.localeCompare(b));
        categories.forEach(cat => {
            groups.get(cat).sort((a,b) => {
                const an = (a.name || '').toString().toLowerCase();
                const bn = (b.name || '').toString().toLowerCase();
                return an.localeCompare(bn);
            });
        });
        // Render
        stockTableBody.innerHTML = '';
        const frag = document.createDocumentFragment();
        categories.forEach(cat => {
            const list = groups.get(cat);
            const totalStock = list.reduce((s,p) => s + (Number(p.stock) || 0), 0);
            const header = document.createElement('tr');
            header.style.background = '#f8f9fa';
            header.style.fontWeight = '700';
            header.innerHTML = '<td colspan="5">' + cat + ' — ' + list.length + ' items, total stock ' + totalStock + '</td>';
            frag.appendChild(header);
            list.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + (p.name || '') + '</td>' +
                    '<td>' + (p.category || '') + '</td>' +
                    '<td>' + (p.stock != null ? p.stock : '') + '</td>' +
                    '<td>' + (p.barcode || '') + '</td>' +
                    '<td>' + formatDate(p.expiryDate, true) + '</td>';
                frag.appendChild(tr);
            });
        });
        stockTableBody.appendChild(frag);
    };
    render(products);
    if (isOnline) {
        const prevTs = lastProductsSyncTs;
        const p = products.length === 0
            ? DataModule.fetchAllProducts()
            : DataModule.fetchProductsSince(lastProductsSyncTs);
        p.then(() => {
            if (lastProductsSyncTs !== prevTs || products.length > 0) {
                dedupeProducts();
                render(products);
                if (stockLastUpdated) stockLastUpdated.textContent = new Date().toLocaleString();
            }
        }).catch(() => {});
    }
  }

  function applyPendingStockOverrides(list) {
    if (!list || !Array.isArray(list)) return list;
    const pending = getPendingStockOverrides();
    if (pending.size === 0) return list;
    
    list.forEach(p => {
      if (p && p.id && pending.has(p.id)) {
        p.stock = pending.get(p.id);
      }
    });
    return list;
  }

  function getPendingStockOverrides() {
    const map = new Map();
    try {
      (syncQueue || []).forEach(op => {
        if (op && op.type === 'saveProduct' && op.data && op.data.id && op.data.stock !== undefined) {
          map.set(op.data.id, Number(op.data.stock));
        }
      });
    } catch (_) {}
    return map;
  }
  
  function sanitize(v) { return String(v || '').replace(/[`'"]/g, '').trim(); }
  function getCfg(k, def) { try { const v = localStorage.getItem(k); return v ? sanitize(v) : def; } catch (_) { return def; } }
  const hasToken = () => !!getToken();
  function getCurrentUser() {
    try {
      const rawUser = localStorage.getItem('user');
      if (rawUser) return JSON.parse(rawUser);
    } catch (_) {}
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || '';
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function logout() {
    try { localStorage.removeItem('token'); } catch (_) {}
    try { localStorage.removeItem('user'); } catch (_) {}
    try { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); } catch (_) {}
    currentUser = null;
    showLogin();
  }
  let loginInProgress = false;
  let loginBackoffUntil = 0;
  
  // Global variables
  let products = [], cart = [], sales = [], deletedSales = [], users = [], currentUser = null;
  const PRODUCTS_PAGE_SIZE = 100;
  let productsOffset = 0;
  let productsHasMore = true;
  let isLoadingProducts = false;
  let currentPage = "pos", isOnline = navigator.onLine, syncQueue = [];
  let pendingPostSyncRefresh = false;
  let pendingRemoteUpdate = false;
  let posSearchSeq = 0;
  let currentPosSearchTerm = '';
  let connectionRetryCount = 0;
  const MAX_RETRY_ATTEMPTS = 3, RETRY_DELAY = 5000;
  const FETCH_COOLDOWN_MS = Number(getCfg('fetchCooldownMs', '300000')) || 300000;
  let lastProductsFetchAt = 0;
  let lastSalesFetchAt = 0;
  let lastUsersFetchAt = 0;
  let lastConnectionCheckAt = 0;
  let lastReportsRefreshAt = 0;
  function shouldFetch(ts, cd = FETCH_COOLDOWN_MS) {
    return Date.now() - ts > cd;
  }
  
  // New global variables for extended features
  let expenses = [], purchases = [], stockAlerts = [], profitData = [];
  let expenseCategories = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance', 'Other'];
  let appRealtimeChannel = null;
  let reportsAutoTimer = null;
  // Removed pagination view mode to keep inventory consistent
  
  function isUserBusy() {
    // User is busy if they are typing in a search bar or have items in their cart
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    const hasCartItems = cart && cart.length > 0;
    return isTyping || hasCartItems;
  }

  function normalizeSyncTs(ts) {
    try {
      const t = new Date(ts || '1970-01-01T00:00:00.000Z').getTime();
      const now = Date.now();
      if (!isFinite(t)) return '1970-01-01T00:00:00.000Z';
      if (t > now + 5 * 60 * 1000) return '1970-01-01T00:00:00.000Z';
      return new Date(t).toISOString();
    } catch (_) {
      return '1970-01-01T00:00:00.000Z';
    }
  }

  function refreshVisibleData() {
    if (currentPage === 'inventory') loadInventory();
    else if (currentPage === 'stock') loadStockCheck();
    else if (currentPage === 'reports') refreshReportData(true);
    else if (currentPage === 'sales' || currentPage === 'daily-sales') loadSales();
    else if (currentPage === 'deleted-sales') loadDeletedSales();
    else loadProducts();
  }

  function reconcileMissingStockReductions(daysBack) {
    try {
      const windowDays = Number(daysBack);
      const cutoff = Date.now() - (isFinite(windowDays) ? windowDays : 7) * 24 * 60 * 60 * 1000;
      const appliedKey = 'pagerrysmart_stock_applied_receipts';
      let applied = new Set();
      try {
        const raw = localStorage.getItem(appliedKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) applied = new Set(arr.map(String));
        }
      } catch (_) {}

      const deletedReceipts = new Set();
      try {
        (deletedSales || []).forEach(s => {
          const rn = s && (s.receiptNumber || s.receiptnumber);
          if (rn) deletedReceipts.add(String(rn));
        });
      } catch (_) {}

      let changed = false;
      let appliedCount = 0;

      (sales || []).forEach(sale => {
        if (!sale) return;
        if (sale.deleted || sale.deleted_at || sale.deletedAt) return;
        const rn = sale.receiptNumber || sale.receiptnumber;
        if (!rn) return;
        const rns = String(rn);
        if (deletedReceipts.has(rns)) return;
        if (applied.has(rns)) return;

        const saleTs = sale.created_at ? Date.parse(sale.created_at) : NaN;
        if (!isFinite(saleTs) || saleTs < cutoff) {
          applied.add(rns);
          return;
        }

        const idStr = sale.id ? String(sale.id) : '';
        const isLocalOrigin = !!sale.clientSaleId || idStr.startsWith('temp_');
        if (!isLocalOrigin) return;
        if (!Array.isArray(sale.items) || sale.items.length === 0) return;

        sale.items.forEach(item => {
          if (!item) return;
          const pid = item.id != null ? String(item.id) : (item.productId != null ? String(item.productId) : '');
          if (!pid) return;
          const qty = Number(item.quantity);
          const safeQty = isFinite(qty) ? qty : 0;
          if (safeQty <= 0) return;
          const p = products.find(x => x && String(x.id) === pid);
          if (!p) return;
          const currentStock = Number(p.stock);
          const safeCurrent = isFinite(currentStock) ? currentStock : 0;
          const newStock = Math.max(0, safeCurrent - safeQty);
          if (newStock !== safeCurrent) {
            p.stock = newStock;
            addToSyncQueue({
              type: 'saveProduct',
              data: { id: p.id, stock: p.stock }
            });
            changed = true;
          }
        });

        applied.add(rns);
        appliedCount++;
      });

      if (changed) {
        saveToLocalStorage();
        try { checkAndGenerateAlerts(); } catch (_) {}
        if (!isUserBusy()) {
          try { refreshVisibleData(); } catch (_) {}
        }
      }
      try {
        localStorage.setItem(appliedKey, JSON.stringify(Array.from(applied)));
      } catch (_) {}
      return { changed, appliedCount };
    } catch (_) {
      return { changed: false, appliedCount: 0 };
    }
  }

  window.addEventListener('online', async () => {
    isOnline = true;
    updateConnectionStatusUI();
    appRealtimeChannel = null;
    
    try { setupRealtimeListeners(); } catch (_) {}
    
    // Only auto-refresh if user is not busy
    if (!isUserBusy()) {
        try { await refreshAllData(); } catch (_) {}
        if (currentPage === 'reports') {
            try { refreshReportData(true); } catch (_) {}
        }
    } else {
        pendingRemoteUpdate = true;
    }
    
    if (syncQueue.length > 0) processSyncQueue();
  });
  window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatusUI();
  });

  function updateConnectionStatusUI() {
    const statusEl = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-status-text');
    if (!statusEl || !statusText) return;
    
    if (isOnline) {
      statusEl.classList.remove('offline');
      statusEl.classList.add('online');
      statusText.textContent = 'Online';
    } else {
      statusEl.classList.remove('online');
      statusEl.classList.add('offline');
      statusText.textContent = 'Offline';
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentPage === 'reports') {
      // Only auto-refresh if user is not busy
      if (!isUserBusy()) {
        try { refreshReportData(true); } catch (_) {}
      }
    }
  });
  
  // Settings - Changed from const to let to allow reassignment
  let settings = {
    storeName: "Pa Gerrys Mart",
    storeAddress: "Alatishe, Ibeju Lekki, Lagos State, Nigeria",
    storePhone: "+2347037850121",
    lowStockThreshold: 10,
    expiryWarningDays: 90
  };
  const APP_VERSION = '1.0.1';
  let isReportsLoading = false;
  let lastOverallTotals = { total: 0, transactions: 0, items: 0, cash: 0, pos: 0 };
  let lastDailyTotals = { total: 0, transactions: 0, items: 0, cash: 0, pos: 0 };
  let lastProductsSyncTs = '1970-01-01T00:00:00.000Z';
  let lastSalesSyncTs = '1970-01-01T00:00:00.000Z';
  
  // Local storage keys
  const STORAGE_KEYS = {
    PRODUCTS: 'pagerrysmart_products',
    SALES: 'pagerrysmart_sales',
    DELETED_SALES: 'pagerrysmart_deleted_sales',
    USERS: 'pagerrysmart_users',
    SETTINGS: 'pagerrysmart_settings',
    CURRENT_USER: 'pagerrysmart_current_user',
    EXPENSES: 'pagerrysmart_expenses',
    PURCHASES: 'pagerrysmart_purchases',
    STOCK_ALERTS: 'pagerrysmart_stock_alerts',
    PROFIT_DATA: 'pagerrysmart_profit_data',
    PRODUCTS_SYNC_TS: 'pagerrysmart_products_sync_ts',
    SALES_SYNC_TS: 'pagerrysmart_sales_sync_ts'
  };
  function runMigrations(prev) {
    const move = (from, to) => {
      try {
        const v = localStorage.getItem(from);
        if (v && !localStorage.getItem(to)) {
          localStorage.setItem(to, v);
        }
        localStorage.removeItem(from);
      } catch (_) {}
    };
    move('pgm_products', STORAGE_KEYS.PRODUCTS);
    move('pgm_sales', STORAGE_KEYS.SALES);
    move('pgm_expenses', STORAGE_KEYS.EXPENSES);
    move('pgm_purchases', STORAGE_KEYS.PURCHASES);
  }
  function ensureAppVersion() {
    const k = 'pagerrysmart_app_version';
    const prev = localStorage.getItem(k) || '';
    if (prev !== APP_VERSION) {
      runMigrations(prev);
      localStorage.setItem(k, APP_VERSION);
    }
  }
  ensureAppVersion();
  
  // DOM elements
  const loginPage = document.getElementById('login-page');
  const appContainer = document.getElementById('app-container');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const navLinks = document.querySelectorAll('.nav-link');
  const pageContents = document.querySelectorAll('.page-content');
  const pageTitle = document.getElementById('page-title');
  const currentUserEl = document.getElementById('current-user');
  const userRoleEl = document.getElementById('user-role');
  const logoutBtn = document.getElementById('logout-btn');
  const productsGrid = document.getElementById('products-grid');
  const cartItems = document.getElementById('cart-items');
  const totalEl = document.getElementById('total');
  const inventoryTableBody = document.getElementById('inventory-table-body');
  let inventoryRenderSeq = 0;
  let inventoryCategoryFilter = null;
  const salesTableBody = document.getElementById('sales-table-body');
  const deletedSalesTableBody = document.getElementById('deleted-sales-table-body');
  const dailySalesTableBody = document.getElementById('daily-sales-table-body');
  const reportProductSalesBody = document.getElementById('report-product-sales-body');
  const reportStockReconBody = document.getElementById('report-stock-recon-body');
    const reportNewProductsBody = document.getElementById('report-new-products-body');
    const reportCategorySalesBody = document.getElementById('report-category-sales-body');
  const productModal = document.getElementById('product-modal');
  const receiptModal = document.getElementById('receipt-modal');
  const notification = document.getElementById('notification');
  const notificationMessage = document.getElementById('notification-message');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
  const stockTableBody = document.getElementById('stock-table-body');
  const stockLastUpdated = document.getElementById('stock-last-updated');
  const stockDayBadge = document.getElementById('stock-day-badge');
  const printStockBtn = document.getElementById('print-stock-btn');
  let currentProductSalesRows = [];
  let currentCategorySalesRows = [];
  
  function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  
  // Enhanced Stock Alert System
  function checkAndGenerateAlerts() {
    const alerts = {
        expired: [],
        expiringSoon: [],
        lowStock: [],
        outOfStock: []
    };
    const today = new Date();
    products.forEach(product => {
        if (product.deleted) return;
        const expiryDate = new Date(product.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry < 0) {
            alerts.expired.push({
                id: product.id,
                name: product.name,
                expiryDate: product.expiryDate,
                daysExpired: Math.abs(daysUntilExpiry),
                severity: 'critical',
                message: `CRITICAL: ${product.name} expired ${Math.abs(daysUntilExpiry)} days ago`
            });
        } else if (daysUntilExpiry <= settings.expiryWarningDays) {
            alerts.expiringSoon.push({
                id: product.id,
                name: product.name,
                expiryDate: product.expiryDate,
                daysUntilExpiry: daysUntilExpiry,
                severity: daysUntilExpiry <= 7 ? 'high' : 'medium',
                message: `${daysUntilExpiry <= 7 ? 'URGENT' : 'WARNING'}: ${product.name} expires in ${daysUntilExpiry} days`
            });
        }
        if (product.stock <= 0) {
            alerts.outOfStock.push({
                id: product.id,
                name: product.name,
                currentStock: product.stock,
                severity: 'critical',
                message: `CRITICAL: ${product.name} is out of stock`
            });
        } else if (product.stock <= settings.lowStockThreshold) {
            alerts.lowStock.push({
                id: product.id,
                name: product.name,
                currentStock: product.stock,
                threshold: settings.lowStockThreshold,
                severity: product.stock <= settings.lowStockThreshold / 2 ? 'high' : 'medium',
                message: `${product.stock <= settings.lowStockThreshold / 2 ? 'URGENT' : 'WARNING'}: ${product.name} has only ${product.stock} items left (threshold: ${settings.lowStockThreshold})`
            });
        }
    });
    const allAlerts = [
        ...alerts.expired,
        ...alerts.outOfStock,
        ...alerts.expiringSoon.filter(a => a.severity === 'high'),
        ...alerts.lowStock.filter(a => a.severity === 'high'),
        ...alerts.expiringSoon.filter(a => a.severity === 'medium'),
        ...alerts.lowStock.filter(a => a.severity === 'medium')
    ];
    stockAlerts = allAlerts;
    saveToLocalStorage();
    const criticalAlerts = allAlerts.filter(alert => alert.severity === 'critical');
    if (criticalAlerts.length > 0) {
        showNotification(`${criticalAlerts.length} critical stock alerts detected! Check Analytics page for details.`, 'error');
    }
    return { all: allAlerts, byType: alerts };
  }
  
  function readArrayFromLS(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : [];
    } catch (_) {
      return [];
    }
  }
  
  // Function to acknowledge an alert
  function acknowledgeAlert(productId) {
    const acknowledgedAlerts = readArrayFromLS('acknowledgedAlerts');
    
    if (!acknowledgedAlerts.includes(productId)) {
        acknowledgedAlerts.push(productId);
        localStorage.setItem('acknowledgedAlerts', JSON.stringify(acknowledgedAlerts));
        showNotification('Alert acknowledged', 'success');
        
        // Refresh the alerts list
        loadStockAlerts();
    }
  }
  
  // Function to resolve a discrepancy
  function resolveDiscrepancy(discrepancyId, type) {
    const resolvedDiscrepancies = readArrayFromLS('resolvedDiscrepancies');
    
    if (!resolvedDiscrepancies.includes(discrepancyId)) {
        resolvedDiscrepancies.push(discrepancyId);
        localStorage.setItem('resolvedDiscrepancies', JSON.stringify(resolvedDiscrepancies));
        showNotification('Discrepancy resolved', 'success');
        
        // Refresh the discrepancies list
        loadDiscrepancies();
    }
  }
  
  // Connection management
  function checkBackendConnection() {
    if (Date.now() - lastConnectionCheckAt < 60000) {
        return;
    }
    lastConnectionCheckAt = Date.now();
    if (!isOnline) {
        updateConnectionStatus('offline', 'Offline');
        return;
    }
    
    updateConnectionStatus('checking', 'Checking connection...');
    
    let healthEndpoint = 'products';
    try {
      const v = localStorage.getItem('healthEndpoint');
      if (v && typeof v === 'string') healthEndpoint = v.replace(/^\/+|\/+$/g, '');
    } catch (_) {}
    try {
      const t = getToken && getToken();
      if (!t) {
        connectionRetryCount = 0;
        updateConnectionStatus('online', 'Connected (auth required)');
        return;
      }
    } catch (_) {}
    apiRequest(healthEndpoint, 'GET', null, true)
      .then(() => {
        connectionRetryCount = 0;
        updateConnectionStatus('online', 'Connected');
        if (syncQueue.length > 0) processSyncQueue();
      })
      .catch((err) => {
        const m = (err && err.message || '').toLowerCase();
        const authIssue = m.includes('401') || m.includes('unauthorized') || m.includes('forbidden') || m.includes('403');
        if (authIssue) {
          connectionRetryCount = 0;
          updateConnectionStatus('online', 'Connected (auth required)');
          return;
        }
        updateConnectionStatus('offline', 'Connection failed');
        if (connectionRetryCount < MAX_RETRY_ATTEMPTS) {
          connectionRetryCount++;
          setTimeout(checkBackendConnection, RETRY_DELAY);
        } else {
          showNotification('Connection to backend failed. Some features may be limited.', 'warning');
        }
      });
  }
  
  function updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('connection-status');
    const textEl = document.getElementById('connection-status-text');
    
    if (statusEl && textEl) {
        statusEl.className = 'connection-status ' + status;
        textEl.textContent = message;
    }
  }
  
  // PWA Install Prompt
  let deferredPrompt;
  const installBtn = document.getElementById('install-btn');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    deferredPrompt = e;
    installBtn.style.display = 'flex';
  });
  
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installBtn.style.display = 'none';
        }
        deferredPrompt = null;
    } else {
        showNotification('Use browser menu to install this app', 'info');
    }
  });
  
  // Online/Offline Detection
  window.addEventListener('online', () => {
    isOnline = true;
    document.getElementById('offline-indicator').classList.remove('show');
    showNotification('You are back online!', 'success');
    checkBackendConnection();
    try {
        if (syncQueue && syncQueue.length > 0) {
            processSyncQueue();
        }
    } catch (e) {
        console.error('Error triggering sync after online:', e);
    }
    setTimeout(refreshAllData, 1000);
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    document.getElementById('offline-indicator').classList.add('show');
  });
  
  const AuthModule = {
    async signUp() {
      showNotification('User management is handled in the backend', 'warning');
      return { success: false };
    },
    async signIn(email, password) {
      const cleanEmail = String(email || '').trim();
      const cleanPassword = String(password || '').trim();
      if (!cleanEmail || !cleanPassword) {
        showNotification('Email and password are required', 'error');
        const loginErrorEl = document.getElementById('login-error');
        if (loginErrorEl) {
          loginErrorEl.textContent = 'Email and password are required';
          loginErrorEl.style.display = 'block';
        }
        return { success: false, error: 'Missing credentials' };
      }
      const now = Date.now();
      if (now < loginBackoffUntil) {
        showNotification('Please wait a moment before trying again.', 'warning');
        const loginErrorEl = document.getElementById('login-error');
        if (loginErrorEl) {
          loginErrorEl.textContent = 'Please wait a moment before trying again.';
          loginErrorEl.style.display = 'block';
        }
        return { success: false, error: 'Backoff' };
      }
      if (loginInProgress) {
        return { success: false, error: 'Login already in progress' };
      }
      loginInProgress = true;
      const loginSubmitBtn = document.getElementById('login-submit-btn');
      loginSubmitBtn.classList.add('loading');
      loginSubmitBtn.disabled = true;
      const loginErrorEl = document.getElementById('login-error');
      if (loginErrorEl) loginErrorEl.style.display = 'none';
      try {
        const data = await BackendAuth.login(cleanEmail, cleanPassword);
        const u = data && (data.user || data.profile || null);
        try {
          if (data && data.token) {
            localStorage.setItem('token', data.token);
          }
          if (u) {
            localStorage.setItem('user', JSON.stringify(u));
          }
        } catch (_) {}
        const fallback = {
          id: u && u.id || 'unknown',
          name: u && (u.name || u.email?.split('@')[0]) || 'User',
          email: u && u.email || cleanEmail,
          role: (u && u.role) || 'user',
          created_at: u && u.created_at || new Date().toISOString(),
          last_login: new Date().toISOString()
        };
        currentUser = u ? { ...u, last_login: new Date().toISOString() } : fallback;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
        if (loginErrorEl) loginErrorEl.style.display = 'none';
        showApp();
        showNotification('Login successful', 'success');
        if (isOnline && syncQueue.length > 0) {
          setTimeout(() => { processSyncQueue(); }, 1000);
        }
        return { success: true };
      } catch (error) {
        const em = (error && error.message ? String(error.message) : '').toLowerCase();
        const msg = (em.includes('401') || em.includes('unauthorized')) ? 'Invalid credentials' : ((error && error.message) || 'Invalid email or password');
        showNotification(msg, 'error');
        if (loginErrorEl) {
          loginErrorEl.textContent = msg;
          loginErrorEl.style.display = 'block';
        }
        loginBackoffUntil = Date.now() + 3000;
        return { success: false, error: error.message };
      } finally {
        loginInProgress = false;
        loginSubmitBtn.classList.remove('loading');
        loginSubmitBtn.disabled = false;
      }
    },
    async signOut() {
      try {
        BackendAuth.logout();
      } catch (_) {}
      try { localStorage.removeItem('user'); } catch (_) {}
      try { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); } catch (_) {}
      currentUser = null;
      showLogin();
      showNotification('Logged out', 'info');
    },
    isAdmin() {
      const u = getCurrentUser() || currentUser;
      return !!(u && (u.role || '').toString().toLowerCase() === 'admin');
    },
    onAuthStateChanged(callback) {
      try {
        const token = getToken();
        if (token) {
          const u = getCurrentUser();
          currentUser = u || null;
          callback(currentUser || null);
        } else {
          currentUser = null;
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          callback(null);
        }
      } catch (_) {
        callback(null);
      }
    },
    async handleExistingSession(_session, callback) {
      try {
        const u = getCurrentUser();
        currentUser = u || null;
        callback(currentUser || null);
      } catch (_) {
        callback(null);
      }
    }
  };
  
  function normalizeSaleRecord(sale) {
    const out = sale && typeof sale === 'object' ? { ...sale } : {};
    if (!out.receiptNumber && out.receiptnumber) out.receiptNumber = out.receiptnumber;
    if (!Array.isArray(out.items)) out.items = [];
    if (typeof out.total !== 'number') out.total = parseFloat(out.total) || 0;
    if (!out.created_at && out.createdAt) out.created_at = out.createdAt;
    if (!out.created_at) out.created_at = new Date().toISOString();
    const pm = ((out.paymentMethod || out.paymentmethod || '') + '').toLowerCase();
    if (!out.paymentMethod && pm) out.paymentMethod = pm;
    return out;
  }

  function getSaleMergeKey(sale) {
    const actionKey = getSaleActionKey(sale);
    if (actionKey) return actionKey;
    if (sale && sale.clientSaleId) return `client:${sale.clientSaleId}`;
    const receiptNumber = String(sale && (sale.receiptNumber || sale.receiptnumber) || '').trim();
    const createdAt = String(sale && (sale.created_at || sale.createdAt) || '').trim();
    const total = Number(sale && sale.total) || 0;
    if (receiptNumber || createdAt || total) {
      return `fallback:${receiptNumber}|${createdAt}|${total}`;
    }
    return '';
  }

  function getSaleUpdatedTimestamp(sale) {
    const raw = sale && (sale.updated_at || sale.updatedAt || sale.created_at || sale.createdAt);
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function mergeDeletedSalesData(serverDeletedSales) {
    const mergedMap = new Map();
    const pushSale = (sale) => {
      if (!sale) return;
      const normalized = normalizeSaleRecord(sale);
      normalized.deleted = true;
      if (!normalized.deletedAt && normalized.deleted_at) normalized.deletedAt = normalized.deleted_at;
      if (!normalized.deleted_at && normalized.deletedAt) normalized.deleted_at = normalized.deletedAt;
      if (!normalized.deletedAt && !normalized.deleted_at) {
        const deletedAt = new Date().toISOString();
        normalized.deletedAt = deletedAt;
        normalized.deleted_at = deletedAt;
      }
      const key = getSaleMergeKey(normalized);
      if (!key) return;
      const existing = mergedMap.get(key);
      if (!existing || getSaleUpdatedTimestamp(normalized) >= getSaleUpdatedTimestamp(existing)) {
        mergedMap.set(key, normalized);
      }
    };
    (Array.isArray(deletedSales) ? deletedSales : []).forEach(pushSale);
    (Array.isArray(serverDeletedSales) ? serverDeletedSales : []).forEach(pushSale);
    return Array.from(mergedMap.values()).sort((a, b) => {
      const dateA = new Date(a.deleted_at || a.deletedAt || a.created_at || 0);
      const dateB = new Date(b.deleted_at || b.deletedAt || b.created_at || 0);
      return dateB - dateA;
    });
  }

  // Data Module
  const DataModule = {
    async fetchSalesForRange(startIso, endIso, force = false) {
        try {
            if (!isOnline || (!force && !shouldFetch(lastSalesFetchAt) && sales.length > 0)) {
                const s = new Date(startIso);
                const e = new Date(endIso);
                return sales.filter(sale => {
                    const d = new Date(sale.created_at);
                    return d >= s && d <= e;
                });
            }
            let res;
            try {
                res = await ReportsAPI.daily({ start: startIso, end: endIso });
            } catch (_) {
                const day = (new Date(startIso).toISOString().slice(0,10));
                res = await ReportsAPI.daily({ date: day });
            }
            const list = (res && (res.sales || res.data || res.items)) || [];
            const arr = Array.isArray(list) ? list : [];
            const normalized = arr.map(normalizeSaleRecord).filter(s => !s.deleted && !s.deleted_at && !s.deletedAt);
            if (normalized.length || force) {
                sales = DataModule.mergeSalesData(normalized);
                saveToLocalStorage();
                lastSalesFetchAt = Date.now();
            }
            return normalized;
        } catch (_) {
            return sales.filter(sale => {
                const d = new Date(sale.created_at);
                const s = new Date(startIso);
                const e = new Date(endIso);
                return d >= s && d <= e;
            });
        }
    },
    async fetchUsers() {
        return users;
    },
    async fetchProducts(offset = 0, limit = PRODUCTS_PAGE_SIZE) {
        try {
            if (!isOnline) return products;
            if (!shouldFetch(lastProductsFetchAt) && products.length > 0 && offset === 0) return products;
            const data = await ProductsAPI.list();
            products = mergeFetchedProducts(data);
            dedupeProducts();
            productsHasMore = products.length > offset + limit;
            productsOffset = Math.min(products.length, offset + limit);
            saveToLocalStorage();
            lastProductsFetchAt = Date.now();
            return products.slice(0, productsOffset);
        } catch (error) {
            console.error('Error in fetchProducts:', error);
            showNotification(`Error fetching products: ${(error && error.message) || 'Unknown error'}`, 'error');
            return products;
        }
    },
    
    async fetchAllProducts() {
        try {
            if (!isOnline && products.length > 0) return products;
            const list = await ProductsAPI.list();
            products = mergeFetchedProducts(list);
            dedupeProducts();
            productsHasMore = false;
            productsOffset = products.length;
            try {
                const maxTs = products.reduce((m, p) => {
                    const t = p && p.updated_at ? new Date(p.updated_at).toISOString() : null;
                    return t && t > m ? t : m;
                }, lastProductsSyncTs || '1970-01-01T00:00:00.000Z');
                lastProductsSyncTs = maxTs;
            } catch (_) {}
            saveToLocalStorage();
            lastProductsFetchAt = Date.now();
            return products;
        } catch (_) {
            return products;
        }
    },
    
    async fetchProductsSince(sinceTs, force = false) {
        try {
            if (!isOnline) return products;
            if (!force && !shouldFetch(lastProductsFetchAt)) return products;
            const list = await ProductsAPI.list();
            const sinceTime = new Date(sinceTs || '1970-01-01T00:00:00.000Z').getTime();
            const updates = (Array.isArray(list) ? list : []).map(p => {
                if (p.expirydate && !p.expiryDate) p.expiryDate = p.expirydate;
                return p;
            }).filter(p => (p.updated_at ? new Date(p.updated_at).getTime() : 0) >= sinceTime);
            if (updates.length === 0) {
                if (products.length === 0) await DataModule.fetchAllProducts();
                return products;
            }
            applyPendingStockOverrides(updates);
            const byId = new Map(products.map(p => [p.id, p]));
            updates.forEach(u => {
                const exist = byId.get(u.id);
                if (exist) Object.assign(exist, u);
                else products.push(u);
            });
            dedupeProducts();
            try {
                const maxTs = updates.reduce((m, p) => {
                    const t = p && p.updated_at ? new Date(p.updated_at).toISOString() : null;
                    return t && t > m ? t : m;
                }, sinceTs || '1970-01-01T00:00:00.000Z');
                lastProductsSyncTs = maxTs;
            } catch (_) {}
            saveToLocalStorage();
            lastProductsFetchAt = Date.now();
            return products;
        } catch (_) {
            try { await DataModule.fetchAllProducts(); } catch(_) {}
            return products;
        }
    },
    
    mergeProductData(serverProducts) {
        const serverProductsMap = {};
        serverProducts.forEach(product => {
            serverProductsMap[product.id] = product;
        });
        
        const localProductsMap = {};
        products.forEach(product => {
            localProductsMap[product.id] = product;
        });
        
        const mergedProducts = [];
        
        serverProducts.forEach(serverProduct => {
            const localProduct = localProductsMap[serverProduct.id];
            
            if (localProduct) {
                const serverDate = new Date(serverProduct.updated_at || serverProduct.created_at || 0);
                const localDate = new Date(localProduct.updated_at || localProduct.created_at || 0);
                
                mergedProducts.push(localDate > serverDate ? localProduct : serverProduct);
            } else {
                mergedProducts.push(serverProduct);
            }
        });
        
        products.forEach(localProduct => {
            if (!serverProductsMap[localProduct.id]) {
                mergedProducts.push(localProduct);
            }
        });
        
        return mergedProducts;
    },
    
    async fetchSales() {
        try {
            if (!isOnline) return sales;
            if (!shouldFetch(lastSalesFetchAt) && sales.length > 0) return sales;
            let list;
            try {
                list = await SalesAPI.list();
            } catch (_) {
                const day = new Date().toISOString().slice(0,10);
                const res = await ReportsAPI.daily({ date: day });
                list = (res && (res.sales || res.data || res.items)) || [];
            }
            const arr = Array.isArray(list) ? list : [];
            const normalized = arr.map(normalizeSaleRecord).filter(s => !s.deleted && !s.deleted_at && !s.deletedAt);
            sales = DataModule.mergeSalesData(normalized);
            saveToLocalStorage();
            lastSalesFetchAt = Date.now();
            return normalized;
        } catch (_) {
            return sales;
        }
    },

    async fetchSalesSince(sinceTs, force = false) {
        try {
            if (!isOnline) return sales;
            if (!force && !shouldFetch(lastSalesFetchAt)) return sales;
            let list;
            try {
                list = await SalesAPI.list({ start: sinceTs, end: new Date().toISOString() });
            } catch (_) {
                const res = await ReportsAPI.daily({ start: sinceTs, end: new Date().toISOString() });
                list = (res && (res.sales || res.data || res.items)) || [];
            }
            const arr = Array.isArray(list) ? list : [];
            const updates = arr.map(normalizeSaleRecord).filter(s => !s.deleted && !s.deleted_at && !s.deletedAt);
            if (updates.length === 0) return sales;
            sales = DataModule.mergeSalesData(updates);
            try {
                const maxTs = updates.reduce((m, s) => {
                    const t = s && (s.updated_at || s.created_at) ? new Date(s.updated_at || s.created_at).toISOString() : null;
                    return t && t > m ? t : m;
                }, sinceTs || '1970-01-01T00:00:00.000Z');
                lastSalesSyncTs = maxTs;
            } catch (_) {}
            saveToLocalStorage();
            lastSalesFetchAt = Date.now();
            return sales;
        } catch (e) {
            console.error('Error in fetchSalesSince:', e);
            return sales;
        }
    },
    
    mergeSalesData(serverSales) {
        const deletedSaleKeys = new Set(
            (Array.isArray(deletedSales) ? deletedSales : [])
                .map(sale => getSaleActionKey(sale))
                .filter(Boolean)
        );
        const deletedReceiptNumbers = new Set(
            (Array.isArray(deletedSales) ? deletedSales : [])
                .map(sale => String(sale && (sale.receiptNumber || sale.receiptnumber) || '').trim())
                .filter(Boolean)
        );
        const mergedMap = new Map();
        const upsertSale = (candidate) => {
            if (!candidate) return;
            const normalized = normalizeSaleRecord(candidate);
            const saleKey = getSaleActionKey(normalized);
            const receiptNumber = String(normalized.receiptNumber || normalized.receiptnumber || '').trim();
            if ((saleKey && deletedSaleKeys.has(saleKey)) || (receiptNumber && deletedReceiptNumbers.has(receiptNumber))) {
                return;
            }
            const mergeKey = getSaleMergeKey(normalized);
            if (!mergeKey) return;
            const existing = mergedMap.get(mergeKey);
            if (!existing || getSaleUpdatedTimestamp(normalized) >= getSaleUpdatedTimestamp(existing)) {
                mergedMap.set(mergeKey, normalized);
            }
        };
        (Array.isArray(sales) ? sales : []).forEach(upsertSale);
        (Array.isArray(serverSales) ? serverSales : []).forEach(upsertSale);
        const mergedSales = Array.from(mergedMap.values());
        mergedSales.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB - dateA;
        });
        
        return mergedSales;
    },
    
    async fetchDeletedSales() {
        try {
            if (!isOnline) return deletedSales;
            let serverDeletedSales = [];
            try {
                serverDeletedSales = await SalesAPI.listDeleted();
            } catch (_) {
                serverDeletedSales = deletedSales;
            }
            deletedSales = mergeDeletedSalesData(serverDeletedSales);
            saveToLocalStorage();
            return deletedSales;
        } catch (_) {
            return deletedSales;
        }
    },
    
    async fetchExpenses() {
        try {
            if (!isOnline) return expenses;
            const data = await ExpensesAPI.list();
            const server = Array.isArray(data) ? data : [];
            const serverKeys = new Set(server.map(e => expenseKey(e)));
            const merged = [...server];
            (Array.isArray(expenses) ? expenses : []).forEach(le => {
                if (!serverKeys.has(expenseKey(le))) merged.push(le);
            });
            expenses = dedupeListByKey(merged, expenseKey);
            saveToLocalStorage();
            return expenses;
        } catch (error) {
            showNotification('Error fetching expenses', 'error');
            return expenses;
        }
    },
    
    async saveExpense(expense) {
        try {
            // Ensure we have a valid user ID
            let userId = currentUser?.id;
            
            // If no valid user ID, use a default UUID or skip the field
            if (!userId || userId === 'undefined') {
                console.warn('No valid user ID found, using default');
                userId = '00000000-0000-0000-0000-000000000000';
            }
            
            const expenseToSave = {
                date: expense.date,
                description: expense.description,
                category: expense.category,
                amount: expense.amount,
                receipt: expense.receipt,
                notes: expense.notes,
                created_by: userId
            };
            
            if (isOnline) {
                const created = await ExpensesAPI.create(expenseToSave);
                if (created) {
                    expenses.unshift(created);
                    saveToLocalStorage();
                    return { success: true, expense: created };
                }
            } else {
                expenseToSave.id = 'temp_' + Date.now();
                expenses.unshift(expenseToSave);
                saveToLocalStorage();
                
                addToSyncQueue({
                    type: 'saveExpense',
                    data: expenseToSave
                });
                
                return { success: true, expense: expenseToSave };
            }
        } catch (error) {
            console.error('Error saving expense:', error);
            showNotification('Error saving expense: ' + error.message, 'error');
            return { success: false, error };
        }
    },
    
    async fetchPurchases() {
        try {
            if (!isOnline) return purchases;
            const data = await PurchasesAPI.list();
            const server = Array.isArray(data) ? data : [];
            const serverSignatures = new Set(server.map(p => purchaseSignature(p)));
            const merged = [...server];
            (Array.isArray(purchases) ? purchases : []).forEach(lp => {
                const sig = purchaseSignature(lp);
                if (!serverSignatures.has(sig)) merged.push(lp);
            });
            purchases = dedupeListByKey(merged, purchaseKey);
            saveToLocalStorage();
            return purchases;
        } catch (_) {
            showNotification('Error fetching purchases', 'error');
            return purchases;
        }
    },
    
    async savePurchase(purchase) {
        try {
            // Ensure we have a valid user ID
            let userId = currentUser?.id;
            
            // If no valid user ID, use a default UUID or skip the field
            if (!userId || userId === 'undefined') {
                console.warn('No valid user ID found, using default');
                userId = '00000000-0000-0000-0000-000000000000';
            }
            
            const purchaseToSave = {
                date: purchase.date,
                supplier: purchase.supplier,
                description: purchase.description,
                amount: purchase.amount,
                invoice: purchase.invoice,
                notes: purchase.notes,
                created_by: userId
            };
            
            if (isOnline) {
                const created = await PurchasesAPI.create(purchaseToSave);
                if (created) {
                    purchases.unshift(created);
                    saveToLocalStorage();
                    return { success: true, purchase: created };
                }
            } else {
                purchaseToSave.id = 'temp_' + Date.now();
                purchases.unshift(purchaseToSave);
                saveToLocalStorage();
                
                addToSyncQueue({
                    type: 'savePurchase',
                    data: purchaseToSave
                });
                
                return { success: true, purchase: purchaseToSave };
            }
        } catch (error) {
            console.error('Error saving purchase:', error);
            showNotification('Error saving purchase: ' + error.message, 'error');
            return { success: false, error };
        }
    },
    
    calculateProfit(startDate, endDate) {
        const filteredSales = sales.filter(sale => {
            const saleDate = new Date(sale.created_at);
            return saleDate >= new Date(startDate) && saleDate <= new Date(endDate);
        });
        
        const filteredExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= new Date(startDate) && expenseDate <= new Date(endDate);
        });
        
        const filteredPurchases = purchases.filter(purchase => {
            const purchaseDate = new Date(purchase.date);
            return purchaseDate >= new Date(startDate) && purchaseDate <= new Date(endDate);
        });
        
        const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
        const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const totalPurchases = filteredPurchases.reduce((sum, purchase) => sum + purchase.amount, 0);
        
        return {
            revenue: totalRevenue,
            expenses: totalExpenses,
            purchases: totalPurchases,
            profit: totalRevenue - (totalExpenses + totalPurchases),
            salesCount: filteredSales.length,
            expenseCount: filteredExpenses.length,
            purchaseCount: filteredPurchases.length
        };
    },
    
    checkStockLevels() {
        const alerts = [];
        const today = new Date();
        
        products.forEach(product => {
            if (product.deleted) return;
            
            // Check for low stock
            if (product.stock <= settings.lowStockThreshold) {
                alerts.push({
                    id: product.id,
                    type: 'low_stock',
                    productId: product.id,
                    productName: product.name,
                    currentStock: product.stock,
                    threshold: settings.lowStockThreshold,
                    message: `Low stock alert: ${product.name} has only ${product.stock} items left (threshold: ${settings.lowStockThreshold})`,
                    created_at: today.toISOString()
                });
            }
            
            // Check for expiry dates
            const expiryDate = new Date(product.expiryDate);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiry <= settings.expiryWarningDays) {
                alerts.push({
                    id: product.id + '_expiry',
                    type: 'expiry_warning',
                    productId: product.id,
                    productName: product.name,
                    expiryDate: product.expiryDate,
                    daysUntilExpiry: daysUntilExpiry,
                    message: `Expiry warning: ${product.name} expires in ${daysUntilExpiry} days`,
                    created_at: today.toISOString()
                });
            }
        });
        
        stockAlerts = alerts;
        saveToLocalStorage();
        return alerts;
    },
    
    detectDiscrepancies() {
        const discrepancies = [];
        
        // Check for sales with negative or zero totals
        sales.forEach(sale => {
            if (sale.total <= 0) {
                discrepancies.push({
                    id: sale.id + '_invalid_total',
                    type: 'invalid_sale_total',
                    saleId: sale.id,
                    receiptNumber: sale.receiptNumber,
                    message: `Sale with receipt #${sale.receiptNumber} has an invalid total: ${sale.total}`,
                    created_at: new Date().toISOString()
                });
            }
            
            // Check for sales with empty items
            if (!sale.items || sale.items.length === 0) {
                discrepancies.push({
                    id: sale.id + '_empty_items',
                    type: 'empty_sale_items',
                    saleId: sale.id,
                    receiptNumber: sale.receiptNumber,
                    message: `Sale with receipt #${sale.receiptNumber} has no items`,
                    created_at: new Date().toISOString()
                });
            }
        });
        
        // Check for products with negative stock
        products.forEach(product => {
            if (product.stock < 0) {
                discrepancies.push({
                    id: product.id + '_negative_stock',
                    type: 'negative_stock',
                    productId: product.id,
                    productName: product.name,
                    currentStock: product.stock,
                    message: `Product ${product.name} has negative stock: ${product.stock}`,
                    created_at: new Date().toISOString()
                });
            }
        });
        
        return discrepancies;
    },
    
    async saveProduct(product) {
        const productModalLoading = document.getElementById('product-modal-loading');
        const saveProductBtn = document.getElementById('save-product-btn');
        
        if (productModalLoading) productModalLoading.style.display = 'flex';
        if (saveProductBtn) {
            saveProductBtn.disabled = true;
        }
        
        try {
            if (!product.name || !product.category || !product.price || !product.stock || !product.expiryDate) {
                throw new Error('Please fill in all required fields');
            }
            
            if (isNaN(product.price) || product.price <= 0) {
                throw new Error('Please enter a valid price');
            }
            
            if (isNaN(product.stock) || product.stock < 0) {
                throw new Error('Please enter a valid stock quantity');
            }
  
            if (!isOnline) {
                if (!product.id) {
                    product.id = 'temp_' + Date.now();
                }
                if (!product.created_at) {
                    product.created_at = new Date().toISOString();
                }
                const key = productKeyNCP(product);
                const existIdx = products.findIndex(p => productKeyNCP(p) === key);
                if (existIdx >= 0) {
                    products[existIdx] = { ...products[existIdx], ...product };
                } else {
                    products.push(product);
                }
                dedupeProducts();
                saveToLocalStorage();
                addToSyncQueue({ type: 'saveProduct', data: product });
                return { success: true, product };
            }
            
            const body = {
                name: product.name,
                category: product.category,
                price: parseFloat(product.price),
                stock: parseInt(product.stock),
                expiryDate: product.expiryDate,
                barcode: product.barcode || null
            };
            let server;
            if (product.id && !product.id.startsWith('temp_')) {
                server = await ProductsAPI.update(product.id, body);
            } else {
                server = await ProductsAPI.create(body);
            }
            if (server && server.id) {
                product.id = server.id;
            }
            const result = { success: true, product: server || product };
            
            if (product.id && !product.id.startsWith('temp_')) {
                const index = products.findIndex(p => p.id === product.id);
                if (index >= 0) products[index] = product;
                else {
                    const key = productKeyNCP(product);
                    const existIdx = products.findIndex(p => productKeyNCP(p) === key);
                    if (existIdx >= 0) products[existIdx] = product; else products.push(product);
                }
            } else {
                const key = productKeyNCP(product);
                const existIdx = products.findIndex(p => productKeyNCP(p) === key);
                if (existIdx >= 0) products[existIdx] = { ...products[existIdx], ...product };
                else products.push(product);
            }
            
            dedupeProducts();
            saveToLocalStorage();
            return result;
            
        } catch (error) {
            console.error('Error saving product:', error);
            
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showNotification('Network error. Product saved locally only.', 'warning');
                
                if (product.id) {
                    const index = products.findIndex(p => p.id === product.id);
                    if (index >= 0) {
                        products[index] = product;
                    } else {
                        if (!String(product.id).startsWith('temp_')) {
                            product.id = 'temp_' + Date.now();
                        }
                        const key = productKeyNCP(product);
                        const existIdx = products.findIndex(p => productKeyNCP(p) === key);
                        if (existIdx >= 0) products[existIdx] = { ...products[existIdx], ...product };
                        else products.push(product);
                    }
                } else {
                    product.id = 'temp_' + Date.now();
                    const key = productKeyNCP(product);
                    const existIdx = products.findIndex(p => productKeyNCP(p) === key);
                    if (existIdx >= 0) products[existIdx] = { ...products[existIdx], ...product };
                    else products.push(product);
                }
                saveToLocalStorage();
                
                addToSyncQueue({
                    type: 'saveProduct',
                    data: product
                });
                
                return { success: true, product };
            } else {
                showNotification('Error saving product: ' + error.message, 'error');
                return { success: false, error: error.message };
            }
        } finally {
            if (productModalLoading) productModalLoading.style.display = 'none';
            if (saveProductBtn) {
                saveProductBtn.disabled = false;
            }
        }
    },
    
    async deleteProduct(productId) {
        try {
            const index = products.findIndex(p => p.id === productId);
            if (index >= 0) {
                products[index].deleted = true;
                products[index].deletedAt = new Date().toISOString();
                saveToLocalStorage();
            }
            
          if (isOnline) {
              try {
                  await ProductsAPI.remove(productId);
                  products = products.filter(p => p.id !== productId);
                  saveToLocalStorage();
                  return { success: true };
              } catch (dbError) {
                  console.error('Backend delete failed:', dbError);
                  showNotification('Failed to delete on server. Marked as deleted locally.', 'warning');
                  addToSyncQueue({
                      type: 'deleteProduct',
                      id: productId,
                      data: {}
                  });
                  return { success: true };
              }
          } else {
              const p = products.find(x => x.id === productId) || {};
              addToSyncQueue({
                  type: 'deleteProduct',
                  id: productId,
                  data: {
                      name: p.name,
                      category: p.category,
                      price: p.price
                  }
              });
              return { success: true };
          }
        } catch (error) {
            console.error('Error deleting product:', error);
            showNotification('Error deleting product', 'error');
            return { success: false, error };
        }
    },
    
    async saveSale(sale) {
        try {
            const existingIndex = sales.findIndex(s => s.receiptNumber === sale.receiptNumber);
            const existingSale = existingIndex >= 0 ? sales[existingIndex] : null;
            const existingSaleId = existingSale && existingSale.id ? String(existingSale.id) : '';
            const isLocalOnlySale = !!existingSale && (!existingSaleId || existingSaleId.startsWith('temp_'));

            if (existingSale && !isLocalOnlySale) {
                return { success: true, sale: existingSale };
            }

            if (existingSale && isLocalOnlySale) {
                sales[existingIndex] = { ...existingSale, ...sale, id: existingSale.id };
                sale = sales[existingIndex];
                saveToLocalStorage();
            }

            // Always save locally first when this receipt is not already cached locally
            const localResult = existingSale && isLocalOnlySale
                ? { success: true, sale }
                : this.saveSaleLocally(sale);
  
            if (!isOnline) {
                addToSyncQueue({
                    type: 'saveSale',
                    data: sale
                });
                return localResult;
            }

            if (true) {
                try {
                    const payload = {
                        receiptNumber: sale.receiptNumber,
                        items: sale.items,
                        total: sale.total,
                        created_at: sale.created_at,
                        cashier: sale.cashier,
                        paymentMethod: sale.paymentMethod
                    };
                    const saved = await CheckoutAPI.checkout(payload);
                    const idx = sales.findIndex(s => s.receiptNumber === sale.receiptNumber);
                    if (idx >= 0 && saved && saved.id) {
                        sales[idx].id = saved.id;
                        saveToLocalStorage();
                    }
                    return { success: true, sale: saved || sale };
                } catch (dbError) {
                    addToSyncQueue({ type: 'saveSale', data: sale });
                    return localResult;
                }
            } else {
                // If offline, add to sync queue
                addToSyncQueue({
                    type: 'saveSale',
                    data: sale
                });
                
                return localResult;
            }
        } catch (error) {
            console.error('Error saving sale:', error);
            showNotification('Error saving sale: ' + (error.message || 'Unknown error'), 'error');
            return { success: false, error };
        }
    },
    
    saveSaleLocally(sale) {
        const existingSale = sales.find(s => s.receiptNumber === sale.receiptNumber);
        if (existingSale) {
            return { success: true, sale: existingSale };
        }
        sale.id = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sales.push(sale);
        saveToLocalStorage();
        return { success: true, sale };
    },
    
    async deleteSale(saleId) {
        try {
            const sale = findSaleByActionKey(saleId, sales) || findSaleByActionKey(saleId, deletedSales);
            if (!sale) {
                return { success: false, error: 'Sale not found' };
            }

            const saleActionKey = getSaleActionKey(sale);
            const receiptNo = sale.receiptnumber || sale.receiptNumber || null;
            const deletedAt = new Date().toISOString();
            const archivedSale = {
                ...sale,
                deleted: true,
                deletedAt,
                deleted_at: deletedAt
            };

            sales = sales.filter(existingSale => {
                if (!existingSale) return false;
                if (saleActionKey && getSaleActionKey(existingSale) === saleActionKey) return false;
                if (receiptNo && String(existingSale.receiptNumber || existingSale.receiptnumber || '') === String(receiptNo)) return false;
                return true;
            });

            const deletedIndex = deletedSales.findIndex(existingSale => {
                if (!existingSale) return false;
                if (saleActionKey && getSaleActionKey(existingSale) === saleActionKey) return true;
                if (receiptNo && String(existingSale.receiptNumber || existingSale.receiptnumber || '') === String(receiptNo)) return true;
                return false;
            });

            if (deletedIndex >= 0) {
                deletedSales.splice(deletedIndex, 1, archivedSale);
            } else {
                deletedSales.unshift(archivedSale);
            }

            saveToLocalStorage();
            
            if (!isOnline) {
                addToSyncQueue({
                    type: 'deleteSale',
                    id: sale && sale.id ? sale.id : saleId,
                    receiptNumber: receiptNo
                });
                return { success: true, sale: archivedSale };
            }

            try {
                const serverResult = await SalesAPI.remove(sale && sale.id ? sale.id : saleId, receiptNo ? { receiptNumber: receiptNo } : {});
                if (Array.isArray(serverResult && serverResult.sales)) {
                    sales = DataModule.mergeSalesData(serverResult.sales);
                }
                if (Array.isArray(serverResult && serverResult.deletedSales)) {
                    deletedSales = mergeDeletedSalesData(serverResult.deletedSales);
                } else if (serverResult && serverResult.sale) {
                    deletedSales = mergeDeletedSalesData([serverResult.sale]);
                }
                saveToLocalStorage();
            } catch (_) {
                addToSyncQueue({
                    type: 'deleteSale',
                    id: sale && sale.id ? sale.id : saleId,
                    receiptNumber: receiptNo
                });
            }

            return { success: true, sale: archivedSale };
            
        } catch (error) {
            console.error('Error deleting sale:', error);
            return { success: false, error: error.message };
        }
    }
  };
  
  // Sync Queue Management
  function addToSyncQueue(operation) {
    if (!operation.id) {
        operation.id = 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    operation.timestamp = new Date().toISOString();
    
    if (operation.type === 'saveSale') {
        const receiptNumber = operation.data.receiptNumber;
        const existingIndex = syncQueue.findIndex(op => 
            op.type === 'saveSale' && 
            op.data.receiptNumber === receiptNumber
        );
        
        if (existingIndex !== -1) {
            syncQueue[existingIndex] = operation;
        } else {
            syncQueue.push(operation);
        }
    } else if (operation.type === 'saveProduct') {
        if (operation.data.stock !== undefined && !operation.data.name) {
            const existingIndex = syncQueue.findIndex(op => 
                op.type === 'saveProduct' && 
                op.data.id === operation.data.id && 
                op.data.stock !== undefined
            );
            
            if (existingIndex !== -1) {
                syncQueue[existingIndex].data.stock = operation.data.stock;
            } else {
                syncQueue.push(operation);
            }
        } else {
            const key = operation.data && operation.data.name && operation.data.category && operation.data.price != null
                ? `${operation.data.name.toLowerCase()}|${operation.data.category.toLowerCase()}|${normalizePrice(operation.data.price)}`
                : null;
            const existingIndex = syncQueue.findIndex(op => 
                op.type === operation.type && 
                (
                    (key && op.data && `${(op.data.name||'').toLowerCase()}|${(op.data.category||'').toLowerCase()}|${normalizePrice(op.data.price)}` === key) ||
                    (!key && op.data && op.data.id === operation.data.id)
                )
            );
            
            if (existingIndex !== -1) {
                syncQueue[existingIndex] = operation;
            } else {
                syncQueue.push(operation);
            }
        }
    } else if (operation.type === 'savePurchase') {
        const key = operation.data && operation.data.date && operation.data.supplier && operation.data.amount != null
            ? `${operation.data.date}|${operation.data.supplier.toLowerCase()}|${normalizePrice(operation.data.amount)}`
            : null;
        const existingIndex = syncQueue.findIndex(op => 
            op.type === 'savePurchase' && 
            op.data && `${op.data.date}|${(op.data.supplier||'').toLowerCase()}|${normalizePrice(op.data.amount)}` === key
        );
        if (existingIndex !== -1) {
            syncQueue[existingIndex] = operation;
        } else {
            syncQueue.push(operation);
        }
    } else {
        const existingIndex = syncQueue.findIndex(op => 
            op.type === operation.type && 
            op.id === operation.id
        );
        
        if (existingIndex !== -1) {
            syncQueue[existingIndex] = operation;
        } else {
            syncQueue.push(operation);
        }
    }
    
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
    
    if (isOnline) {
        processSyncQueue();
    } else {
        showNotification('Offline: Operation saved locally and will sync automatically.', 'info');
    }
  }
  
  async function processSyncQueue() {
    if (syncQueue.length === 0) return;
    
    const syncStatus = document.getElementById('sync-status');
    const syncStatusText = document.getElementById('sync-status-text');
    
    if (syncStatus) {
        syncStatus.classList.add('show', 'syncing');
        syncStatusText.textContent = `Syncing ${syncQueue.length} operations...`;
    }
    
    syncQueue.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    for (let i = 0; i < syncQueue.length; i++) {
        const operation = syncQueue[i];
        
        if (operation.synced) continue;
        
        try {
            let syncResult = null;
            
            if (operation.type === 'saveSale') {
                syncResult = await syncSale(operation);
            } else if (operation.type === 'saveProduct') {
                syncResult = await syncProduct(operation);
            } else if (operation.type === 'deleteProduct') {
                syncResult = await syncDeleteProduct(operation);
            } else if (operation.type === 'deleteSale') {
                syncResult = await syncDeleteSale(operation);
            } else if (operation.type === 'saveExpense') {
                syncResult = await syncExpense(operation);
            } else if (operation.type === 'savePurchase') {
                syncResult = await syncPurchase(operation);
            } else if (operation.type === 'deleteExpense') {
                syncResult = await syncDeleteExpense(operation);
            } else if (operation.type === 'deletePurchase') {
                syncResult = await syncDeletePurchase(operation);
            }
            
            if (syncResult) {
                operation.synced = true;
                operation.syncedAt = new Date().toISOString();
                
                // If this was a product sync that returned a new ID, update other queued ops
                if (operation.type === 'saveProduct' && typeof syncResult === 'string' && operation.data.id !== syncResult) {
                    updateSyncQueueIds(operation.data.id, syncResult);
                }
            }
        } catch (error) {
            console.error(`Error syncing operation:`, operation.type, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
    
    const originalLength = syncQueue.length;
    syncQueue = syncQueue.filter(op => !op.synced);
    
    if (syncQueue.length < originalLength) {
        localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
    }
    
    if (syncStatus && syncStatusText) {
        if (syncQueue.length === 0) {
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('show');
            syncStatusText.textContent = 'All data synced';
            setTimeout(() => syncStatus.classList.remove('show'), 3000);
            if (!isUserBusy()) {
                await refreshAllData();
            } else {
                pendingPostSyncRefresh = true;
                showNotification('Sync completed. Data will refresh when you are ready.', 'info');
            }
        } else {
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('error');
            syncStatusText.textContent = `${syncQueue.length} operations pending`;
            setTimeout(() => syncStatus.classList.remove('show', 'error'), 3000);
        }
    }
  }

  function updateSyncQueueIds(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    
    syncQueue.forEach(op => {
      if (op.synced) return;
      
      // Update product ID in saveProduct data
      if (op.type === 'saveProduct' && op.data && op.data.id === oldId) {
        op.data.id = newId;
      }
      
      // Update product ID in deleteProduct data
      if (op.type === 'deleteProduct' && op.id === oldId) {
        op.id = newId;
      }
      
      // Update product IDs in saveSale items
      if (op.type === 'saveSale' && op.data && Array.isArray(op.data.items)) {
        op.data.items.forEach(item => {
          if (item.id === oldId) item.id = newId;
          if (item.productId === oldId) item.productId = newId;
        });
      }
    });
    
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  }
  
  async function syncProduct(operation) {
    const p = operation && operation.data ? operation.data : null;
    if (!p) return null;
    const existingProduct = products.find(item => item && p.id && String(item.id) === String(p.id));
    const source = existingProduct ? { ...existingProduct, ...p } : p;
    const body = {
      name: source.name,
      category: source.category,
      price: Number(source.price) || 0,
      stock: parseInt(source.stock, 10),
      expiryDate: source.expiryDate,
      barcode: source.barcode || null
    };
    if (source.id && !String(source.id).startsWith('temp_')) {
      const updated = await ProductsAPI.update(source.id, body);
      return updated && updated.id ? String(updated.id) : String(source.id);
    } else {
      const created = await ProductsAPI.create(body);
      return created && created.id ? String(created.id) : null;
    }
  }
  
  async function syncSale(operation) {
    const s = operation && operation.data ? operation.data : null;
    if (!s) return null;
    const payload = {
      receiptNumber: s.receiptNumber,
      items: Array.isArray(s.items) ? s.items : [],
      total: Number(s.total) || 0,
      created_at: s.created_at || new Date().toISOString(),
      cashier: s.cashier || 'cashier',
      paymentMethod: s.paymentMethod || 'cash'
    };
    const res = await CheckoutAPI.checkout(payload);
    return res && res.id ? String(res.id) : true;
  }
  
  async function syncDeleteProduct(operation) {
    if (!operation || !operation.id) return true;
    await ProductsAPI.remove(operation.id);
    return true;
  }
  
  async function syncDeleteSale(operation) {
    if (!operation || !operation.id) return true;
    await SalesAPI.remove(operation.id, operation.receiptNumber ? { receiptNumber: operation.receiptNumber } : {});
    return true;
  }
  
  async function syncExpense(operation) {
    const e = operation && operation.data ? operation.data : null;
    if (!e) return null;
    const saved = await ExpensesAPI.create(e);
    return saved && saved.id ? String(saved.id) : true;
  }
  
  async function syncPurchase(operation) {
    const p = operation && operation.data ? operation.data : null;
    if (!p) return null;
    const saved = await PurchasesAPI.create(p);
    return saved && saved.id ? String(saved.id) : true;
  }
  
  async function syncDeleteExpense(operation) {
    if (!operation || !operation.id) return true;
    if (ExpensesAPI.remove) {
      await ExpensesAPI.remove(operation.id);
    }
    return true;
  }
  
  async function syncDeletePurchase(operation) {
    if (!operation || !operation.id) return true;
    if (PurchasesAPI.remove) {
      await PurchasesAPI.remove(operation.id);
    }
    return true;
  }
  function loadSyncQueue() {
    const savedQueue = localStorage.getItem('syncQueue');
    if (savedQueue) {
        try {
            syncQueue = JSON.parse(savedQueue);
            
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            const originalLength = syncQueue.length;
            syncQueue = syncQueue.filter(op => {
                const opDate = new Date(op.timestamp || 0);
                return opDate > weekAgo;
            });
            
            if (syncQueue.length < originalLength) {
                localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
            }
        } catch (e) {
            console.error('Error parsing sync queue:', e);
            syncQueue = [];
        }
    }
  }
  
  function cleanupSyncQueue() {
    syncQueue = syncQueue.filter(op => !op.synced);
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  }

  function recoverUnsyncedLocalSales() {
    try {
        const queuedReceipts = new Set(
            (syncQueue || [])
                .filter(op => op && op.type === 'saveSale' && op.data && op.data.receiptNumber)
                .map(op => op.data.receiptNumber)
        );
        let added = 0;
        (sales || []).forEach(sale => {
            const saleId = sale && sale.id ? String(sale.id) : '';
            if (!sale || !sale.receiptNumber || sale.deleted || sale.deleted_at || sale.deletedAt) return;
            if (!saleId || !saleId.startsWith('temp_')) return;
            if (queuedReceipts.has(sale.receiptNumber)) return;
            syncQueue.push({
                id: 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                type: 'saveSale',
                data: sale,
                timestamp: new Date().toISOString()
            });
            queuedReceipts.add(sale.receiptNumber);
            added++;
        });
        if (added > 0) {
            localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
        }
    } catch (e) {
        console.error('Error recovering unsynced local sales:', e);
    }
  }
  
  function cleanupDuplicateSales() {
    const receiptNumbers = new Set();
    const uniqueSales = [];
    
    sales.forEach(sale => {
        if (!receiptNumbers.has(sale.receiptNumber)) {
            receiptNumbers.add(sale.receiptNumber);
            uniqueSales.push(sale);
        }
    });
    
    if (sales.length !== uniqueSales.length) {
        sales = uniqueSales;
        saveToLocalStorage();
    }
  }
  function isArchiveEnabled() {
    const v = localStorage.getItem('ARCHIVE_ENABLED');
    return v === 'true';
  }
  function disableArchive() {
    localStorage.setItem('ARCHIVE_ENABLED', 'false');
  }
  
  function setupRealtimeListeners() { return; }
  
  // Local Storage Functions
  function loadFromLocalStorage() {
    try {
        // Initialize empty arrays/objects first
        products = [];
        sales = [];
        deletedSales = [];
        users = [];
        currentUser = null;
        expenses = [];
        purchases = [];
        stockAlerts = [];
        profitData = [];
        
        // Load products
        const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
        if (savedProducts) {
            try {
                const parsedProducts = JSON.parse(savedProducts);
                if (Array.isArray(parsedProducts)) {
                    products = normalizeProductsCollection(parsedProducts);
                }
            } catch (parseError) {
                console.error('Error parsing products from localStorage:', parseError);
                products = [];
                try { localStorage.removeItem(STORAGE_KEYS.PRODUCTS); } catch (_) {}
            }
        }
        
        // Load sales
        const savedSales = localStorage.getItem(STORAGE_KEYS.SALES);
        if (savedSales) {
            try {
                const parsedSales = JSON.parse(savedSales);
                if (Array.isArray(parsedSales)) {
                    sales = parsedSales;
                }
            } catch (parseError) {
                console.error('Error parsing sales from localStorage:', parseError);
                sales = [];
                try { localStorage.removeItem(STORAGE_KEYS.SALES); } catch (_) {}
            }
        }
        
        // Load deleted sales
        const savedDeletedSales = localStorage.getItem(STORAGE_KEYS.DELETED_SALES);
        if (savedDeletedSales) {
            try {
                const parsedDeletedSales = JSON.parse(savedDeletedSales);
                if (Array.isArray(parsedDeletedSales)) {
                    deletedSales = parsedDeletedSales;
                }
            } catch (parseError) {
                console.error('Error parsing deleted sales from localStorage:', parseError);
                deletedSales = [];
                try { localStorage.removeItem(STORAGE_KEYS.DELETED_SALES); } catch (_) {}
            }
        }
        
        // Load users
        const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
        if (savedUsers) {
            try {
                const parsedUsers = JSON.parse(savedUsers);
                if (Array.isArray(parsedUsers)) {
                    users = parsedUsers;
                }
            } catch (parseError) {
                console.error('Error parsing users from localStorage:', parseError);
                users = [];
                try { localStorage.removeItem(STORAGE_KEYS.USERS); } catch (_) {}
            }
        }
        
        // Load settings - Update properties of the existing settings object
        const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                if (parsedSettings && typeof parsedSettings === 'object') {
                    // Update properties of the existing settings object instead of reassigning
                    Object.assign(settings, parsedSettings);
                }
            } catch (parseError) {
                console.error('Error parsing settings from localStorage:', parseError);
                try { localStorage.removeItem(STORAGE_KEYS.SETTINGS); } catch (_) {}
            }
        }
        
        // Load current user
        const savedCurrentUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (savedCurrentUser) {
            try {
                const parsedCurrentUser = JSON.parse(savedCurrentUser);
                if (parsedCurrentUser && typeof parsedCurrentUser === 'object') {
                    currentUser = parsedCurrentUser;
                }
            } catch (parseError) {
                console.error('Error parsing current user from localStorage:', parseError);
                currentUser = null;
                try { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); } catch (_) {}
            }
        }
        
        // Load expenses
        const savedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
        if (savedExpenses) {
            try {
                expenses = JSON.parse(savedExpenses);
            } catch (parseError) {
                console.error('Error parsing expenses from localStorage:', parseError);
                expenses = [];
                try { localStorage.removeItem(STORAGE_KEYS.EXPENSES); } catch (_) {}
            }
        }
        
        // Load purchases
        const savedPurchases = localStorage.getItem(STORAGE_KEYS.PURCHASES);
        if (savedPurchases) {
            try {
                purchases = JSON.parse(savedPurchases);
            } catch (parseError) {
                console.error('Error parsing purchases from localStorage:', parseError);
                purchases = [];
                try { localStorage.removeItem(STORAGE_KEYS.PURCHASES); } catch (_) {}
            }
        }
        
        // Load stock alerts
        const savedStockAlerts = localStorage.getItem(STORAGE_KEYS.STOCK_ALERTS);
        if (savedStockAlerts) {
            try {
                stockAlerts = JSON.parse(savedStockAlerts);
            } catch (parseError) {
                console.error('Error parsing stock alerts from localStorage:', parseError);
                stockAlerts = [];
                try { localStorage.removeItem(STORAGE_KEYS.STOCK_ALERTS); } catch (_) {}
            }
        }
        
        // Load profit data
        const savedProfitData = localStorage.getItem(STORAGE_KEYS.PROFIT_DATA);
        if (savedProfitData) {
            try {
                profitData = JSON.parse(savedProfitData);
            } catch (parseError) {
                console.error('Error parsing profit data from localStorage:', parseError);
                profitData = [];
                try { localStorage.removeItem(STORAGE_KEYS.PROFIT_DATA); } catch (_) {}
            }
        }
        
        try {
            const ts = localStorage.getItem(STORAGE_KEYS.PRODUCTS_SYNC_TS);
            if (ts) lastProductsSyncTs = ts;
        } catch (_) {}
        try {
            const ts2 = localStorage.getItem(STORAGE_KEYS.SALES_SYNC_TS);
            if (ts2) lastSalesSyncTs = ts2;
        } catch (_) {}
    } catch (e) {
        console.error('Error loading data from localStorage:', e);
        // Reset to defaults on error
        products = [];
        sales = [];
        deletedSales = [];
        users = [];
        currentUser = null;
        expenses = [];
        purchases = [];
        stockAlerts = [];
        profitData = [];
    }
  }
  
  function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
        localStorage.setItem(STORAGE_KEYS.DELETED_SALES, JSON.stringify(deletedSales));
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
        localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(purchases));
        localStorage.setItem(STORAGE_KEYS.STOCK_ALERTS, JSON.stringify(stockAlerts));
        localStorage.setItem(STORAGE_KEYS.PROFIT_DATA, JSON.stringify(profitData));
        localStorage.setItem(STORAGE_KEYS.PRODUCTS_SYNC_TS, String(lastProductsSyncTs || '1970-01-01T00:00:00.000Z'));
        localStorage.setItem(STORAGE_KEYS.SALES_SYNC_TS, String(lastSalesSyncTs || '1970-01-01T00:00:00.000Z'));
        
        if (currentUser) {
            localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
        }
    } catch (e) {
        console.error('Error saving data to localStorage:', e);
        showNotification('Error saving data locally. Some changes may be lost.', 'error');
    }
  }
  
  function validateDataStructure() {
    let isValid = true;
    
    if (!Array.isArray(products)) {
        products = [];
        isValid = false;
    }
    
    if (!Array.isArray(sales)) {
        sales = [];
        isValid = false;
    }
    
    if (!Array.isArray(deletedSales)) {
        deletedSales = [];
        isValid = false;
    }
    
    if (!Array.isArray(users)) {
        users = [];
        isValid = false;
    }
    
    if (!Array.isArray(expenses)) {
        expenses = [];
        isValid = false;
    }
    
    if (!Array.isArray(purchases)) {
        purchases = [];
        isValid = false;
    }
    
    if (!Array.isArray(stockAlerts)) {
        stockAlerts = [];
        isValid = false;
    }
    
    if (!Array.isArray(profitData)) {
        profitData = [];
        isValid = false;
    }
    
    if (!settings || typeof settings !== 'object') {
        settings = {
            storeName: "Pa Gerrys Mart",
            storeAddress: "Alatishe, Ibeju Lekki, Lagos State, Nigeria",
            storePhone: "+2347037850121",
            lowStockThreshold: 10,
            expiryWarningDays: 90
        };
        isValid = false;
    }
    
    if (!isValid) {
        saveToLocalStorage();
    }
    
    return isValid;
  }
  
  function normalizePrice(value) {
    const n = Number(value);
    if (!isFinite(n)) return '0.00';
    return n.toFixed(2);
  }

  function normalizeProductRecord(product) {
    if (!product || typeof product !== 'object') return null;
    const normalized = { ...product };
    if (normalized.expirydate && !normalized.expiryDate) normalized.expiryDate = normalized.expirydate;
    if (normalized.expiryDate && !normalized.expirydate) normalized.expirydate = normalized.expiryDate;
    normalized.price = Number(normalized.price);
    if (!isFinite(normalized.price)) normalized.price = 0;
    normalized.stock = parseInt(normalized.stock, 10);
    if (!isFinite(normalized.stock)) normalized.stock = 0;
    return normalized;
  }

  function normalizeProductsCollection(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(normalizeProductRecord)
      .filter(product => product && !product.deleted);
  }

  function mergeFetchedProducts(serverProducts, localProducts = products) {
    const normalizedServerProducts = normalizeProductsCollection(serverProducts);
    const normalizedLocalProducts = normalizeProductsCollection(localProducts);
    if (normalizedServerProducts.length === 0 && normalizedLocalProducts.length > 0) {
      applyPendingStockOverrides(normalizedLocalProducts);
      return normalizedLocalProducts;
    }
    const previousProducts = products;
    products = normalizedLocalProducts;
    const mergedProducts = DataModule.mergeProductData(normalizedServerProducts);
    products = previousProducts;
    applyPendingStockOverrides(mergedProducts);
    return normalizeProductsCollection(mergedProducts);
  }
  
  function productKeyNCP(p) {
    const barcode = (p.barcode || '').toString().trim().toLowerCase();
    if (barcode) {
      return `barcode:${barcode}`;
    }
    const name = (p.name || '').toString().toLowerCase();
    const category = (p.category || '').toString().toLowerCase();
    const price = normalizePrice(p.price);
    const expiry = (p.expiryDate || '').toString();
    return `${name}|${category}|${price}|${expiry}`;
  }
  
  function productSignature(p) {
    return productKeyNCP(p);
  }
  
  function dedupeProducts() {
    try {
      if (!Array.isArray(products)) return;
      
      const result = [];
      const seenServerIds = new Set();
      const serverSigs = new Map(); // Map sig -> index in result
      
      // 1. Process real server products first
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!p || !p.id) continue;
        
        const id = String(p.id);
        const isTemp = id.startsWith('temp_');
        
        if (!isTemp) {
          if (seenServerIds.has(id)) continue;
          
          const sig = productSignature(p);
          // If we already have a product with this signature, prefer the one with a real ID
          if (serverSigs.has(sig)) continue;
          
          seenServerIds.add(id);
          serverSigs.set(sig, result.length);
          result.push(p);
        }
      }
      
      // 2. Process temp products, only keeping them if their signature isn't already in serverSigs
      const tempSigs = new Set();
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!p || !p.id) continue;
        
        const id = String(p.id);
        const isTemp = id.startsWith('temp_');
        
        if (isTemp) {
          const sig = productSignature(p);
          if (serverSigs.has(sig)) continue;
          if (tempSigs.has(sig)) continue;
          
          tempSigs.add(sig);
          result.push(p);
        }
      }
      
      products = result;
    } catch (e) {
      console.error('Error de-duplicating products:', e);
    }
  }
  
  function dedupeListByKey(list, keyFn) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item) continue;
        const key = keyFn(item);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
  }
  
  function purchaseKey(p) {
    if (p && p.id && !String(p.id).startsWith('temp_')) return String(p.id);
    return `${p.date || ''}|${(p.supplier || '').toLowerCase()}|${normalizePrice(p.amount)}`;
  }
  
  function expenseKey(e) {
    return `${e.date || ''}|${(e.description || '').toLowerCase()}|${(e.category || '').toLowerCase()}|${normalizePrice(e.amount)}`;
  }
  
  function validateSalesData() {
    let isValid = true;
    
    if (!Array.isArray(sales)) {
        sales = [];
        isValid = false;
    }
    
    sales.forEach((sale, index) => {
        if (!sale || typeof sale !== 'object') {
            isValid = false;
            return;
        }
        
        if (!sale.receiptNumber) {
            isValid = false;
        }
        
        if (!sale.created_at) {
            isValid = false;
        }
        
        if (typeof sale.total !== 'number' || isNaN(sale.total)) {
            isValid = false;
        }
        
        if (!Array.isArray(sale.items)) {
            isValid = false;
        }
    });
    
    if (!isValid) {
        showNotification('Sales data validation failed. Some data may be missing.', 'warning');
    }
    
    return isValid;
  }
  
  // UI Functions
  function showLogin() {
    loginPage.style.display = 'flex';
    appContainer.style.display = 'none';
    if (notification && loginPage && notification.parentElement !== loginPage) {
        loginPage.appendChild(notification);
    }
  }
  
  function initChangePasswordForm() {
    if (currentUser && currentUser.email) {
        const changePasswordForm = document.getElementById('change-password-form');
        if (changePasswordForm && !document.getElementById('change-password-username')) {
            const usernameField = document.createElement('input');
            usernameField.type = 'email';
            usernameField.id = 'change-password-username';
            usernameField.name = 'username';
            usernameField.value = currentUser.email;
            usernameField.style.display = 'none';
            usernameField.setAttribute('aria-hidden', 'true');
            usernameField.setAttribute('tabindex', '-1');
            usernameField.setAttribute('autocomplete', 'username');
            
            changePasswordForm.insertBefore(usernameField, changePasswordForm.firstChild);
        }
    }
  }
  
  async function showApp() {
    loginPage.style.display = 'none';
    appContainer.style.display = 'flex';
    if (notification && notification.parentElement !== document.body) {
        document.body.appendChild(notification);
    }
    
    if (currentUser) {
        currentUserEl.textContent = currentUser.name;
        userRoleEl.textContent = currentUser.role;
        
        const usersContainer = document.getElementById('users-container');
        if (AuthModule.isAdmin()) {
            usersContainer.style.display = 'block';
        } else {
            usersContainer.style.display = 'none';
        }
        
        await refreshCurrentUserFromDB();
        applyRoleUIRestrictions();
        
        if (!AuthModule.isAdmin()) {
            document.querySelectorAll('.nav-link[data-page="expenses"], .nav-link[data-page="purchases"], .nav-link[data-page="analytics"]')
                .forEach(el => el && el.parentElement && (el.parentElement.style.display = 'none'));
        }
        
        initChangePasswordForm();
    }
    
    try {
        const needInitialProducts = isOnline && products.length === 0;
        if (needInitialProducts) {
            await DataModule.fetchProducts(0, PRODUCTS_PAGE_SIZE);
        }
        loadProducts();
        setupRealtimeListeners();
        (async () => {
            try {
                const results = await Promise.allSettled([
                    DataModule.fetchSales(),
                    DataModule.fetchDeletedSales()
                ]);
                const sRes = results[0];
                const dRes = results[1];
                if (sRes.status === 'fulfilled' && Array.isArray(sRes.value)) {
                    sales = DataModule.mergeSalesData(sRes.value);
                }
                if (dRes.status === 'fulfilled' && Array.isArray(dRes.value)) {
                    const existingDeletedIds = new Set(deletedSales.map(s => s.id || s.receiptNumber || s.receiptnumber));
                    dRes.value.forEach(s => {
                        if (!existingDeletedIds.has(s.id || s.receiptNumber || s.receiptnumber)) {
                            deletedSales.push(s);
                        }
                    });
                }
                saveToLocalStorage();
                loadSales();
                if (currentPage === 'reports') {
                    try { generateReport(); } catch (_) {}
                }
            } catch (_) {}
        })();
    } catch (_) {
        loadProducts();
        setupRealtimeListeners();
    }
  }
  
  function showNotification(message, type = 'success') {
    notificationMessage.textContent = message;
    notification.className = `notification ${type} show`;
    
    const icon = notification.querySelector('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 
                   type === 'error' ? 'fas fa-exclamation-circle' : 
                   type === 'warning' ? 'fas fa-exclamation-triangle' : 
                   'fas fa-info-circle';
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
  }
  
  async function refreshCurrentUserFromDB() {
    return;
  }
  
  function applyRoleUIRestrictions() {
    const isAdmin = AuthModule.isAdmin();
    try {
      const addBtn = document.getElementById('add-product-btn');
      if (addBtn) addBtn.style.display = isAdmin ? 'block' : 'none';
      const addInvBtn = document.getElementById('add-inventory-btn');
      if (addInvBtn) addInvBtn.style.display = isAdmin ? 'block' : 'none';
      document.querySelectorAll('.nav-link[data-page="expenses"], .nav-link[data-page="purchases"], .nav-link[data-page="analytics"]').forEach(el => {
        if (el && el.parentElement) el.parentElement.style.display = isAdmin ? '' : 'none';
      });
      const usersContainer = document.getElementById('users-container');
      if (usersContainer) usersContainer.style.display = isAdmin ? 'block' : 'none';
    } catch (_) {}
  }
  
  function showInstallPromptNotification() {
    notificationMessage.textContent = 'Install this app';
    notification.className = 'notification info show';
    const icon = notification.querySelector('i');
    icon.className = 'fas fa-download';
    notification.onclick = async () => {
        try {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                }
                deferredPrompt = null;
            } else {
                showNotification('Use browser menu to install this app', 'info');
            }
        } finally {
            notification.classList.remove('show');
            notification.onclick = null;
        }
    };
    setTimeout(() => {
        notification.classList.remove('show');
        notification.onclick = null;
    }, 10000);
  }
  
  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-NG', { 
        style: 'currency', 
        currency: 'NGN',
        minimumFractionDigits: 2
    }).format(amount);
  }
  
  function formatDate(date, short = false) {
    if (!date) return '-';
    
    let d;
    if (typeof date === 'string') {
        const s = date.trim();
        // If it's exactly YYYY-MM-DD, parse as local midnight
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            d = new Date(Number(s.slice(0,4)), Number(s.slice(5,7)) - 1, Number(s.slice(8,10)));
        } else {
            d = new Date(s);
            if (isNaN(d.getTime())) {
                const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
                if (m) {
                    d = new Date(Number(m[1].slice(0,4)), Number(m[1].slice(5,7)) - 1, Number(m[1].slice(8,10)));
                }
            }
        }
    } else {
        d = date instanceof Date ? date : new Date(date);
    }
    
    if (!d || isNaN(d.getTime())) {
        return '-';
    }
    
    if (short) {
        return d.toLocaleDateString();
    }
    
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  
  function parseDateInput(value) {
    if (!value) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return new Date(Number(s.slice(0,4)), Number(s.slice(5,7)) - 1, Number(s.slice(8,10)));
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return new Date();
  }
  
  function parseSaleDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    
    // If it's strictly a date string YYYY-MM-DD, treat it as local midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return new Date(Number(s.slice(0,4)), Number(s.slice(5,7)) - 1, Number(s.slice(8,10)));
    }
    
    // Otherwise, parse as normal (handles ISO strings properly converting to local time)
    let d = new Date(s);
    if (isNaN(d.getTime())) {
      // Fallback for some non-standard formats
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) {
        return new Date(Number(m[1].slice(0,4)), Number(m[1].slice(5,7)) - 1, Number(m[1].slice(8,10)));
      }
    }
    if (isNaN(d.getTime())) return null;
    return d;
  }
  
  function computeRange(period, selectedDateObj, startStr, endStr) {
    let rangeStart = null, rangeEnd = null;
    if (period === 'day') {
      rangeStart = new Date(selectedDateObj); rangeStart.setHours(0,0,0,0);
      rangeEnd = new Date(selectedDateObj); rangeEnd.setHours(23,59,59,999);
    } else if (period === 'week') {
      const d = new Date(selectedDateObj);
      const diffToMonday = (d.getDay() + 6) % 7;
      rangeStart = new Date(d); rangeStart.setDate(d.getDate() - diffToMonday); rangeStart.setHours(0,0,0,0);
      rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeStart.getDate() + 6); rangeEnd.setHours(23,59,59,999);
    } else if (period === 'month') {
      const d = new Date(selectedDateObj);
      rangeStart = new Date(d.getFullYear(), d.getMonth(), 1); rangeStart.setHours(0,0,0,0);
      rangeEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0); rangeEnd.setHours(23,59,59,999);
    } else {
      const s = startStr ? new Date(startStr) : null;
      const e = endStr ? new Date(endStr) : null;
      if (s && !isNaN(s.getTime())) { rangeStart = new Date(s); rangeStart.setHours(0,0,0,0); }
      if (e && !isNaN(e.getTime())) { rangeEnd = new Date(e); rangeEnd.setHours(23,59,59,999); }
      if (!rangeStart || !rangeEnd) {
        rangeStart = new Date(selectedDateObj); rangeStart.setHours(0,0,0,0);
        rangeEnd = new Date(selectedDateObj); rangeEnd.setHours(23,59,59,999);
      }
    }
    return { rangeStart, rangeEnd };
  }
  
  function scheduleRender(fn) {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(fn);
    } else {
        setTimeout(fn, 0);
    }
  }
  
  function getAnalyticsCtx() {
    return {
      document,
      formatCurrency,
      formatDate,
      showNotification,
      DataModule,
      sales,
      purchases,
      expenses,
      products,
      stockAlerts,
      settings,
      checkAndGenerateAlerts,
      readArrayFromLS,
      viewProduct: window.viewProduct,
      viewSale: window.viewSale,
      acknowledgeAlert: window.acknowledgeAlert,
      resolveDiscrepancy: window.resolveDiscrepancy,
      localStorage
    };
  }
  
  function generateReceiptNumber() {
    const d = new Date();
    const y = d.getFullYear().toString().slice(-2);
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const mi = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `R${y}${m}${day}${h}${mi}${s}${ms}${rnd}`;
  }
  
  // Page Navigation
  function showPage(pageName) {
    try {
      const token = localStorage.getItem('token');
      const u = getCurrentUser();
      if (!token) {
        showLogin();
        return;
      }
      if (!u || !u.role) {
        logout();
        return;
      }
      if (['expenses','purchases','analytics'].includes(pageName) && String(u.role).toLowerCase() !== 'admin') {
        showNotification('Access denied', 'warning');
        pageName = 'pos';
      }
    } catch (_) {}
    pageContents.forEach(page => {
        page.style.display = 'none';
    });
    
    const selectedPage = document.getElementById(`${pageName}-page`);
    if (selectedPage) {
        selectedPage.style.display = 'block';
    }
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === pageName) {
            link.classList.add('active');
        }
    });
    
    const titles = {
        'pos': 'Point of Sale',
        'inventory': 'Inventory Management',
        'reports': 'Sales Reports',
        'stock': 'Stock Check',
        'expenses': 'Expense Management',
        'purchases': 'Purchase Management',
        'analytics': 'Business Analytics',
        'account': 'My Account'
    };
    
    pageTitle.textContent = titles[pageName] || 'Pa Gerrys Mart';
    currentPage = pageName;
    
    if (reportsAutoTimer) {
        try { clearInterval(reportsAutoTimer); } catch (_) {}
        reportsAutoTimer = null;
    }
    
    if (pageName === 'inventory') {
        loadInventory();
    } else if (pageName === 'reports') {
        loadReports();
    } else if (pageName === 'stock') {
        loadStockCheck();
    } else if (pageName === 'account') {
        loadAccount();
    } else if (pageName === 'expenses') {
        loadExpenses();
    } else if (pageName === 'purchases') {
        loadPurchases();
    } else if (pageName === 'analytics') {
        loadAnalytics();
    }

    if (pendingPostSyncRefresh && isOnline && !isUserBusy()) {
        pendingPostSyncRefresh = false;
        try { refreshAllData(); } catch (_) {}
    }
  }
  
  function validateProductData(product) {
    const validatedProduct = { ...product };
    
    if (!validatedProduct.name) validatedProduct.name = 'Unnamed Product';
    if (!validatedProduct.category) validatedProduct.category = 'Uncategorized';
    if (!validatedProduct.price || isNaN(validatedProduct.price)) validatedProduct.price = 0;
    if (!validatedProduct.stock || isNaN(validatedProduct.stock)) validatedProduct.stock = 0;
    if (!validatedProduct.expiryDate) {
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        validatedProduct.expiryDate = date.toISOString().split('T')[0];
    }
    
    validatedProduct.price = parseFloat(validatedProduct.price);
    validatedProduct.stock = parseInt(validatedProduct.stock);
    validatedProduct.expirydate = validatedProduct.expiryDate;
    
    return validatedProduct;
  }
  
  // Product Functions
  function loadProducts() {
    try {
        const searchEl = document.getElementById('product-search');
        const term = searchEl ? (searchEl.value || '').toString().trim() : '';
        if (term) {
            applyProductSearch(term);
            return;
        }
    } catch (_) {}
    const list = products.filter(p => !p.deleted);
    if (list.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No Products Added Yet</h3>
                <p>Click "Add Product" to start adding your inventory</p>
            </div>
        `;
        return;
    }
    productsGrid.innerHTML = '';
    const chunkSize = 60;
    let index = 0;
    function renderChunk() {
        const fragment = document.createDocumentFragment();
        const today = new Date();
        for (let i = 0; i < chunkSize && index < list.length; i++, index++) {
            const product = list[index];
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            const expiryDate = new Date(product.expiryDate);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            let expiryWarning = '';
            let productNameStyle = '';
            if (daysUntilExpiry < 0) {
                expiryWarning = `<div class="expiry-warning"><i class="fas fa-exclamation-triangle"></i> Expired</div>`;
                productNameStyle = 'style="color: red; font-weight: bold;"';
            } else if (daysUntilExpiry <= settings.expiryWarningDays) {
                expiryWarning = `<div class="expiry-warning"><i class="fas fa-clock"></i> Expires in ${daysUntilExpiry} days</div>`;
                productNameStyle = 'style="color: red; font-weight: bold;"';
            }
            let stockClass = 'stock-high';
            if (product.stock <= 0) {
                stockClass = 'stock-low';
            } else if (product.stock <= settings.lowStockThreshold) {
                stockClass = 'stock-medium';
            }
            productCard.innerHTML = `
                <div class="product-img">
                    <i class="fas fa-box"></i>
                </div>
                <h4 ${productNameStyle}>${product.name}</h4>
                <div class="price">${formatCurrency(product.price)}</div>
                <div class="stock ${stockClass}">Stock: ${product.stock}</div>
                ${expiryWarning}
            `;
            productCard.addEventListener('click', () => addToCart(product));
            fragment.appendChild(productCard);
        }
        productsGrid.appendChild(fragment);
        if (index < list.length) {
            setTimeout(renderChunk, 0);
        }
    }
    renderChunk();
  }
  
  async function loadInventory() {
    const inventoryLoading = document.getElementById('inventory-loading');
    if (inventoryLoading) inventoryLoading.style.display = 'none';
    dedupeProducts();
    updateInventoryTotalFromAllProducts();
    const baseList = products.filter(p => !p.deleted);
    const msPerDay = 1000 * 60 * 60 * 24;
    const todayTs = Date.now();
    let list;
    if (!inventoryCategoryFilter) {
        list = baseList.slice();
    } else if (inventoryCategoryFilter === 'Expired') {
        list = baseList.filter(p => (Date.parse(p.expiryDate) - todayTs) / msPerDay < 0);
    } else if (inventoryCategoryFilter === 'Expiring Soon') {
        list = baseList.filter(p => {
            const d = Math.ceil((Date.parse(p.expiryDate) - todayTs) / msPerDay);
            return d >= 0 && d <= settings.expiryWarningDays;
        });
    } else if (inventoryCategoryFilter === 'Low Stock') {
        list = baseList.filter(p => p.stock > 0 && p.stock <= settings.lowStockThreshold);
    } else if (inventoryCategoryFilter === 'Out of Stock') {
        list = baseList.filter(p => p.stock <= 0);
    } else {
        list = baseList.filter(p => ((p.category || 'Uncategorized').toString() === inventoryCategoryFilter));
    }
    list = list.slice().sort((a, b) => {
        const an = (a.name || '').toString().toLowerCase();
        const bn = (b.name || '').toString().toLowerCase();
        return an.localeCompare(bn);
    });
    if (list.length === 0) {
        inventoryTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center;">No products in inventory</td>
            </tr>
        `;
        const inventoryTotalValue = document.getElementById('inventory-total-value');
        if (inventoryTotalValue) inventoryTotalValue.textContent = formatCurrency(0);
        const inventoryTotalItems = document.getElementById('inventory-total-items');
        if (inventoryTotalItems) inventoryTotalItems.textContent = '0';
        if (inventoryLoading) inventoryLoading.style.display = 'none';
        return;
    }
    let totalValue = list.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
    const inventoryTotalItems = document.getElementById('inventory-total-items');
    if (inventoryTotalItems) {
        const totalUnits = list.reduce((s, p) => s + (Number(p.stock) || 0), 0);
        inventoryTotalItems.textContent = String(totalUnits);
    }
    const byCategory = {};
    const byCategoryCount = {};
    for (let i = 0; i < baseList.length; i++) {
        const p = baseList[i];
        const cat = (p.category || 'Uncategorized').toString();
        const val = ((Number(p.price) || 0) * (Number(p.stock) || 0));
        byCategory[cat] = (byCategory[cat] || 0) + val;
        byCategoryCount[cat] = (byCategoryCount[cat] || 0) + 1;
    }
    const summaryEl = document.getElementById('inventory-category-summary');
    if (summaryEl) {
        let sHtml = '';
        let expiredCount = 0, expiredValue = 0;
        let soonCount = 0, soonValue = 0;
        let lowCount = 0, lowValue = 0;
        let outCount = 0, outValue = 0;
        for (let i = 0; i < baseList.length; i++) {
            const p = baseList[i];
            const val = ((Number(p.price) || 0) * (Number(p.stock) || 0));
            const d = Math.ceil((Date.parse(p.expiryDate) - todayTs) / msPerDay);
            if (d < 0) { expiredCount++; expiredValue += val; }
            else if (d <= settings.expiryWarningDays) { soonCount++; soonValue += val; }
            if (p.stock <= 0) { outCount++; outValue += val; }
            else if (p.stock <= settings.lowStockThreshold) { lowCount++; lowValue += val; }
        }
        sHtml += `
            <div class="summary-card" onclick="filterInventoryByCategory('Expired')">
                <h3>Expired</h3>
                <p>${formatCurrency(expiredValue)}</p>
                <p>${expiredCount} items</p>
            </div>
            <div class="summary-card" onclick="filterInventoryByCategory('Expiring Soon')">
                <h3>Expiring Soon</h3>
                <p>${formatCurrency(soonValue)}</p>
                <p>${soonCount} items</p>
            </div>
            <div class="summary-card" onclick="filterInventoryByCategory('Low Stock')">
                <h3>Low Stock</h3>
                <p>${formatCurrency(lowValue)}</p>
                <p>${lowCount} items</p>
            </div>
            <div class="summary-card" onclick="filterInventoryByCategory('Out of Stock')">
                <h3>Out of Stock</h3>
                <p>${formatCurrency(outValue)}</p>
                <p>${outCount} items</p>
            </div>
        `;
        const cats = Object.keys(byCategory).sort((a,b) => a.localeCompare(b));
        for (let i = 0; i < cats.length; i++) {
            const c = cats[i];
            sHtml += `
                <div class="summary-card" onclick="filterInventoryByCategory('${c.replace(/'/g, "&#39;")}')">
                    <h3>${c}</h3>
                    <p>${formatCurrency(byCategory[c])}</p>
                    <p>${byCategoryCount[c]} items</p>
                </div>
            `;
        }
        summaryEl.innerHTML = sHtml;
    }
    inventoryTableBody.innerHTML = '';
    const chunkSize = 400;
    let index = 0;
    const mySeq = ++inventoryRenderSeq;
    const seenKeys = new Set();
    function renderChunk() {
        if (mySeq !== inventoryRenderSeq) return;
        let html = '';
        for (let i = 0; i < chunkSize && index < list.length; i++, index++) {
            const product = list[index];
            if (!product) continue;
            const key = productKeyNCP(product);
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            const expiryTs = product.expiryTs || (product.expiryTs = Date.parse(product.expiryDate));
            const daysUntilExpiry = Math.ceil((expiryTs - todayTs) / msPerDay);
            let rowClass = '';
            let stockBadgeClass = 'stock-high';
            let stockBadgeText = 'In Stock';
            let productNameStyle = '';
            if (product.stock <= 0) {
                stockBadgeClass = 'stock-low';
                stockBadgeText = 'Out of Stock';
            } else if (product.stock <= settings.lowStockThreshold) {
                stockBadgeClass = 'stock-medium';
                stockBadgeText = 'Low Stock';
            }
            let expiryBadgeClass = 'expiry-good';
            let expiryBadgeText = 'Good';
            if (daysUntilExpiry < 0) {
                expiryBadgeClass = 'expiry-expired';
                expiryBadgeText = 'Expired';
                rowClass = 'expired';
                productNameStyle = 'style="color: red; font-weight: bold;"';
            } else if (daysUntilExpiry <= settings.expiryWarningDays) {
                expiryBadgeClass = 'expiry-warning';
                expiryBadgeText = 'Expiring Soon';
                rowClass = 'expiring-soon';
                productNameStyle = 'style="color: red; font-weight: bold;"';
            }
            let actionButtons = '';
            if (AuthModule.isAdmin()) {
                actionButtons = `
                    <div class="action-buttons">
                        <button class="btn-edit" onclick="editProduct('${product.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete" onclick="deleteProduct('${product.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            } else {
                actionButtons = '<span class="no-permission">Admin only</span>';
            }
            html += `
                <tr ${rowClass ? `class=\"${rowClass}\"` : ''}>
                    <td>${product.id}</td>
                    <td ${productNameStyle}>${product.name}</td>
                    <td>${product.category}</td>
                    <td>${formatCurrency(product.price)}</td>
                    <td>${product.stock}</td>
                    <td>${formatDate(product.expiryDate)}</td>
                    <td>
                        <span class="stock-badge ${stockBadgeClass}">${stockBadgeText}</span>
                        <span class="expiry-badge ${expiryBadgeClass}">${expiryBadgeText}</span>
                    </td>
                    <td>
                        ${actionButtons}
                    </td>
                </tr>
            `;
        }
        if (mySeq !== inventoryRenderSeq) return;
        if (html) inventoryTableBody.insertAdjacentHTML('beforeend', html);
        if (index < list.length) {
            requestAnimationFrame(renderChunk);
        } else {
            const inventoryTotalValue = document.getElementById('inventory-total-value');
            if (inventoryTotalValue) inventoryTotalValue.textContent = formatCurrency(totalValue);
            if (inventoryLoading) inventoryLoading.style.display = 'none';
        }
    }
    requestAnimationFrame(renderChunk);
    if (isOnline) {
        const prevTs = lastProductsSyncTs;
        DataModule.fetchProductsSince(lastProductsSyncTs)
            .then(() => {
                if (lastProductsSyncTs !== prevTs) {
                    dedupeProducts();
                    updateInventoryTotalFromAllProducts();
                    if (inventoryLoading) inventoryLoading.style.display = 'none';
                    inventoryRenderSeq++;
                    if (currentPage === 'inventory') {
                        loadInventory();
                    }
                }
            })
            .catch(() => {});
    }
  }
  
  function filterInventoryByCategory(cat) {
    if (inventoryCategoryFilter === cat) {
        inventoryCategoryFilter = null;
    } else {
        inventoryCategoryFilter = cat;
    }
    loadInventory();
  }
  
  function loadSales() {
    updateSalesTables();
    
    if (currentPage === 'reports') {
        generateReport();
    }
  }
  
  function loadDeletedSales() {
    updateSalesTables();
  }

  function getSaleActionKey(sale) {
    if (!sale || typeof sale !== 'object') return '';
    if (sale.id != null && String(sale.id).trim()) return `id:${String(sale.id)}`;
    const receiptNumber = sale.receiptNumber || sale.receiptnumber;
    if (receiptNumber != null && String(receiptNumber).trim()) return `receipt:${String(receiptNumber)}`;
    return '';
  }

  function findSaleByActionKey(actionKey, sourceList = sales) {
    const key = String(actionKey || '').trim();
    if (!key) return null;
    const list = Array.isArray(sourceList) ? sourceList : [];
    if (key.startsWith('id:')) {
        const id = key.slice(3);
        return list.find(s => s && String(s.id) === id) || null;
    }
    if (key.startsWith('receipt:')) {
        const receipt = key.slice(8);
        return list.find(s => s && String(s.receiptNumber || s.receiptnumber || '') === receipt) || null;
    }
    return list.find(s => s && (String(s.id) === key || String(s.receiptNumber || s.receiptnumber || '') === key)) || null;
  }
  
  function updateSalesTables() {
    const activeSales = sales.filter(s => !s.deleted && !s.deleted_at && !s.deletedAt);
    if (activeSales.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center;">No sales data available</td>
            </tr>
        `;
    } else {
        salesTableBody.innerHTML = '';
        const sortedSales = [...activeSales].sort((a, b) => {
            const dateA = a.created_at ? (parseSaleDate(a.created_at) || new Date(0)) : new Date(0);
            const dateB = b.created_at ? (parseSaleDate(b.created_at) || new Date(0)) : new Date(0);
            return dateB - dateA;
        });
        const recentSales = sortedSales.slice(0, 10);
        const fragment = document.createDocumentFragment();
        recentSales.forEach(sale => {
            const row = document.createElement('tr');
            const saleActionKey = getSaleActionKey(sale);
            let actionButtons = `
                <button type="button" class="btn-edit" onclick="viewSale('${saleActionKey}')" title="View Sale">
                    <i class="fas fa-eye"></i>
                </button>
            `;
            if (AuthModule.isAdmin()) {
                actionButtons += `
                    <button type="button" class="btn-delete" onclick="deleteSale('${saleActionKey}')" title="Delete Sale">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            }
            const totalItemsSold = Array.isArray(sale.items) 
                ? sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
                : 0;
            row.innerHTML = `
                <td>${sale.receiptNumber}</td>
                <td>${formatDate(sale.created_at)}</td>
                <td>${totalItemsSold}</td>
                <td>${formatCurrency(sale.total)}</td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons}
                    </div>
                </td>
            `;
            fragment.appendChild(row);
        });
        salesTableBody.appendChild(fragment);
    }
    
    if (deletedSales.length === 0) {
        deletedSalesTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center;">No deleted sales</td>
            </tr>
        `;
    } else {
        deletedSalesTableBody.innerHTML = '';
        const sortedDeletedSales = [...deletedSales].sort((a, b) => {
            const aDel = a.deleted_at || a.deletedAt;
            const bDel = b.deleted_at || b.deletedAt;
            const dateA = aDel ? new Date(aDel) : new Date(0);
            const dateB = bDel ? new Date(bDel) : new Date(0);
            return dateB - dateA;
        });
        const fragmentDeleted = document.createDocumentFragment();
        sortedDeletedSales.forEach(sale => {
            const row = document.createElement('tr');
            const totalItemsSold = Array.isArray(sale.items) 
                ? sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
                : 0;
            row.innerHTML = `
                <td>${sale.receiptNumber}</td>
                <td>${formatDate(sale.created_at)}</td>
                <td>${totalItemsSold}</td>
                <td>${formatCurrency(sale.total)}</td>
                <td><span class="deleted-badge">Deleted</span></td>
            `;
            fragmentDeleted.appendChild(row);
        });
        deletedSalesTableBody.appendChild(fragmentDeleted);
    }
  }
  
  function loadReports() {
    const reportsLoading = document.getElementById('reports-loading');
    if (reportsLoading) reportsLoading.style.display = 'flex';
    
    const today = new Date().toISOString().split('T')[0];
    const reportDateEl = document.getElementById('report-date');
    if (reportDateEl) {
        reportDateEl.value = today;
    }
    const periodEl = document.getElementById('report-period');
    const startEl = document.getElementById('report-start-date');
    const endEl = document.getElementById('report-end-date');
    const debouncedRefreshReports = debounce(() => refreshReportData(true), 150);
    if (periodEl) {
        periodEl.addEventListener('change', () => {
            const v = periodEl.value || 'day';
            const showRange = v === 'custom';
            if (startEl) startEl.style.display = showRange ? '' : 'none';
            if (endEl) endEl.style.display = showRange ? '' : 'none';
            debouncedRefreshReports();
        });
    }
    if (reportDateEl) {
        reportDateEl.addEventListener('change', debouncedRefreshReports);
    }
    if (startEl) startEl.addEventListener('change', debouncedRefreshReports);
    if (endEl) endEl.addEventListener('change', debouncedRefreshReports);
    const generateBtn = document.getElementById('generate-report-btn');
    if (generateBtn) {
        generateBtn.onclick = debouncedRefreshReports;
    }
    const productSearchEl = document.getElementById('report-product-search');
    if (productSearchEl) {
        productSearchEl.addEventListener('input', () => {
            renderProductSalesTable(currentProductSalesRows, productSearchEl.value);
            renderStockReconTable(currentProductSalesRows, productSearchEl.value);
        });
    }
    const categorySearchEl = document.getElementById('report-category-search');
    if (categorySearchEl) {
        categorySearchEl.addEventListener('input', () => {
            renderCategorySalesTable(currentCategorySalesRows, categorySearchEl.value);
        });
    }
    
    isReportsLoading = true;
    const todayR = new Date().toISOString().split('T')[0];
    const reportDateElR = document.getElementById('report-date');
    if (reportDateElR && !reportDateElR.value) reportDateElR.value = todayR;
    const periodElR = document.getElementById('report-period');
    const startElR = document.getElementById('report-start-date');
    const endElR = document.getElementById('report-end-date');
    const selectedDateObj = parseDateInput(reportDateElR ? reportDateElR.value : todayR);
    const v = periodElR ? (periodElR.value || 'day') : 'day';
    const rng = computeRange(v, selectedDateObj, startElR ? startElR.value : null, endElR ? endElR.value : null);
    const startIso = rng.rangeStart ? rng.rangeStart.toISOString() : '1970-01-01T00:00:00.000Z';
    const endIso = rng.rangeEnd ? rng.rangeEnd.toISOString() : new Date().toISOString();
    Promise.allSettled([
      DataModule.fetchSalesForRange(startIso, endIso, true),
      DataModule.fetchDeletedSales()
    ]).then(results => {
      const sRes = results[0];
      const dRes = results[1];
      if (sRes.status === 'fulfilled' && Array.isArray(sRes.value)) {
        sales = DataModule.mergeSalesData(sRes.value);
      }
      if (dRes.status === 'fulfilled' && Array.isArray(dRes.value)) {
        const existingDeletedIds = new Set(deletedSales.map(s => s.id || s.receiptNumber || s.receiptnumber));
        dRes.value.forEach(s => {
          if (!existingDeletedIds.has(s.id || s.receiptNumber || s.receiptnumber)) {
            deletedSales.push(s);
          }
        });
      }
      updateSalesTables();
      isReportsLoading = false;
      generateReport();
      if (reportsLoading) reportsLoading.style.display = 'none';
    }).catch(() => {
      isReportsLoading = false;
      generateReport();
      if (reportsLoading) reportsLoading.style.display = 'none';
    });
  }
  
  function refreshReportData(force = false, silent = false) {
    try {
        if (!force && !shouldFetch(lastReportsRefreshAt)) {
            isReportsLoading = false;
            generateReport();
            return;
        }
        const reportsLoading = document.getElementById('reports-loading');
        if (reportsLoading && !silent) reportsLoading.style.display = 'flex';
        isReportsLoading = true;
        const reportDateEl = document.getElementById('report-date');
        const periodEl = document.getElementById('report-period');
        const startEl = document.getElementById('report-start-date');
        const endEl = document.getElementById('report-end-date');
        const selectedDateObj = parseDateInput(reportDateEl && reportDateEl.value ? reportDateEl.value : '');
        const v = periodEl ? (periodEl.value || 'day') : 'day';
        const rng = computeRange(v, selectedDateObj, startEl ? startEl.value : null, endEl ? endEl.value : null);
        const startIso = rng.rangeStart ? rng.rangeStart.toISOString() : '1970-01-01T00:00:00.000Z';
        const endIso = rng.rangeEnd ? rng.rangeEnd.toISOString() : new Date().toISOString();
        Promise.allSettled([
            DataModule.fetchSalesForRange(startIso, endIso, force),
            DataModule.fetchDeletedSales()
        ]).then(results => {
            const sRes = results[0];
            const dRes = results[1];
            if (sRes.status === 'fulfilled' && Array.isArray(sRes.value)) {
                // Merge into local sales instead of overwriting
                sales = DataModule.mergeSalesData(sRes.value);
            }
            if (dRes.status === 'fulfilled' && Array.isArray(dRes.value)) {
                // Merge into local deletedSales instead of overwriting
                const existingDeletedIds = new Set(deletedSales.map(s => s.id || s.receiptNumber || s.receiptnumber));
                dRes.value.forEach(s => {
                    if (!existingDeletedIds.has(s.id || s.receiptNumber || s.receiptnumber)) {
                        deletedSales.push(s);
                    }
                });
            }
            updateSalesTables();
            isReportsLoading = false;
            generateReport();
            if (reportsLoading) reportsLoading.style.display = 'none';
        }).catch(() => {
            isReportsLoading = false;
            generateReport();
            if (reportsLoading) reportsLoading.style.display = 'none';
        });
        lastReportsRefreshAt = Date.now();
    } catch (_) {
        const reportsLoading = document.getElementById('reports-loading');
        if (reportsLoading) reportsLoading.style.display = 'none';
        isReportsLoading = false;
        generateReport();
    }
  }
  
  function generateReport() {
    try {
        if (isReportsLoading) return;
        const reportDateEl = document.getElementById('report-date');
        const selectedDateStr = reportDateEl ? reportDateEl.value : new Date().toISOString().split('T')[0];
        const selectedDateObj = parseDateInput(selectedDateStr);
        
        const activeSales = Array.isArray(sales) ? sales.filter(s => !s.deleted && !s.deleted_at && !s.deletedAt) : [];
        const archivedSales = Array.isArray(deletedSales) ? deletedSales : [];

        const combinedMap = new Map();
        for (const s of [...activeSales, ...archivedSales]) {
            if (!s || typeof s !== 'object') continue;
            const rn = s.receiptnumber || s.receiptNumber || `NO_RN_${s.id || Math.random()}`;
            if (!combinedMap.has(rn)) combinedMap.set(rn, s);
        }
        const combinedSales = Array.from(combinedMap.values());

        const periodElTop = document.getElementById('report-period');
        const periodTop = periodElTop ? (periodElTop.value || 'day') : 'day';
        const rngTop = computeRange(periodTop, selectedDateObj, (document.getElementById('report-start-date') || {}).value, (document.getElementById('report-end-date') || {}).value);
        const filteredForSummary = (rngTop.rangeStart && rngTop.rangeEnd)
            ? activeSales.filter(sale => {
                if (!sale || !sale.created_at) return false;
                const d = parseSaleDate(sale.created_at);
                if (!d || isNaN(d.getTime())) return false;
                return d >= rngTop.rangeStart && d <= rngTop.rangeEnd;
            })
            : activeSales;
        let totalSales = 0;
        let totalTransactions = 0;
        let totalItemsSold = 0;
        let totalCash = 0;
        let totalPos = 0;
        
        filteredForSummary.forEach(sale => {
            if (!sale || typeof sale !== 'object') return;
            totalSales += (typeof sale.total === 'number') ? sale.total : parseFloat(sale.total) || 0;
            totalTransactions++;
            if (Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    totalItemsSold += Number(item.quantity) || 0;
                });
            }
            const pm = ((sale.paymentMethod || sale.paymentmethod || '') + '').toLowerCase();
            if (pm === 'cash') {
                totalCash += (typeof sale.total === 'number') ? sale.total : parseFloat(sale.total) || 0;
            } else if (pm === 'pos') {
                totalPos += (typeof sale.total === 'number') ? sale.total : parseFloat(sale.total) || 0;
            }
        });
        
        const totalSalesEl = document.getElementById('report-total-sales');
        const totalTransactionsEl = document.getElementById('report-transactions');
        const totalItemsSoldEl = document.getElementById('report-items-sold');
        const totalCashEl = document.getElementById('report-cash-sales');
        const totalPosEl = document.getElementById('report-pos-sales');
        
        if (totalSalesEl) totalSalesEl.textContent = formatCurrency(totalSales);
        if (totalTransactionsEl) totalTransactionsEl.textContent = totalTransactions;
        if (totalItemsSoldEl) totalItemsSoldEl.textContent = totalItemsSold;
        if (totalCashEl) totalCashEl.textContent = formatCurrency(totalCash);
        if (totalPosEl) totalPosEl.textContent = formatCurrency(totalPos);
        lastOverallTotals = { total: totalSales, transactions: totalTransactions, items: totalItemsSold, cash: totalCash, pos: totalPos };
        
        // Daily section should ALWAYS reflect a single day, independent of selected period
        const dayRng = computeRange('day', selectedDateObj);
        let dailyTotal = 0;
        let dailyTransactions = 0;
        let dailyItems = 0;
        let dailyCash = 0;
        let dailyPos = 0;
        
        const salesInRange = [];
        
        activeSales.forEach(sale => {
            if (!sale || typeof sale !== 'object' || !sale.created_at) return;
            const saleDate = parseSaleDate(sale.created_at);
            if (!saleDate || isNaN(saleDate.getTime())) return;
            const inRange = (dayRng.rangeStart && dayRng.rangeEnd)
                ? (saleDate >= dayRng.rangeStart && saleDate <= dayRng.rangeEnd)
                : true;
            if (inRange) {
                dailyTotal += sale.total || 0;
                dailyTransactions++;
                
                if (Array.isArray(sale.items)) {
                    sale.items.forEach(item => {
                        dailyItems += item.quantity || 0;
                    });
                }
                const pm2 = ((sale.paymentMethod || sale.paymentmethod || '') + '').toLowerCase();
                if (pm2 === 'cash') {
                    dailyCash += sale.total || 0;
                } else if (pm2 === 'pos') {
                    dailyPos += sale.total || 0;
                }
                salesInRange.push(sale);
            }
        });
        
        const dailyTotalEl = document.getElementById('daily-total-sales');
        const dailyTransactionsEl = document.getElementById('daily-transactions');
        const dailyItemsEl = document.getElementById('daily-items-sold');
        const dailyCashEl = document.getElementById('daily-cash-sales');
        const dailyPosEl = document.getElementById('daily-pos-sales');
        
        if (dailyTotalEl) dailyTotalEl.textContent = formatCurrency(dailyTotal);
        if (dailyTransactionsEl) dailyTransactionsEl.textContent = dailyTransactions;
        if (dailyItemsEl) dailyItemsEl.textContent = dailyItems;
        if (dailyCashEl) dailyCashEl.textContent = formatCurrency(dailyCash);
        if (dailyPosEl) dailyPosEl.textContent = formatCurrency(dailyPos);
        lastDailyTotals = { total: dailyTotal, transactions: dailyTransactions, items: dailyItems, cash: dailyCash, pos: dailyPos };
        
        if (!dailySalesTableBody) {
            console.error('dailySalesTableBody element not found');
            return;
        }
        
        if (salesInRange.length === 0) {
            dailySalesTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-data">No sales data for selected date</td>
                </tr>
            `;
        } else {
            // Show a lightweight loading message before incremental rendering
            dailySalesTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-data">Loading daily sales...</td>
                </tr>
            `;
            salesInRange.sort((a, b) => {
                const dateA = a.created_at ? (parseSaleDate(a.created_at) || new Date(0)) : new Date(0);
                const dateB = b.created_at ? (parseSaleDate(b.created_at) || new Date(0)) : new Date(0);
                return dateB - dateA;
            });
            let idx = 0;
            const chunkSize = 75;
            function renderDailyChunk() {
                if (idx === 0) {
                    dailySalesTableBody.innerHTML = '';
                }
                let html = '';
                for (let i = 0; i < chunkSize && idx < salesInRange.length; i++, idx++) {
                    const sale = salesInRange[idx];
                    let actionButtons = `
                    <button class="btn-edit" onclick="viewSale('${getSaleActionKey(sale)}')" title="View Sale">
                            <i class="fas fa-eye"></i>
                        </button>
                    `;
                    if (AuthModule.isAdmin()) {
                        actionButtons += `
                            <button class="btn-delete" onclick="deleteSale('${getSaleActionKey(sale)}')" title="Delete Sale">
                                <i class="fas fa-trash"></i>
                            </button>
                        `;
                    }
                    const totalItemsSold = Array.isArray(sale.items) 
                        ? sale.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
                        : 0;
                    html += `
                        <tr>
                            <td>${sale.receiptNumber || 'N/A'}</td>
                            <td>${formatDate(sale.created_at)}</td>
                            <td>${totalItemsSold}</td>
                            <td>${formatCurrency(sale.total || 0)}</td>
                            <td>
                                <div class="action-buttons">
                                    ${actionButtons}
                                </div>
                            </td>
                        </tr>
                    `;
                }
                if (html) dailySalesTableBody.insertAdjacentHTML('beforeend', html);
                if (idx < salesInRange.length) {
                    requestAnimationFrame(renderDailyChunk);
                }
            }
            requestAnimationFrame(renderDailyChunk);
        }
        const periodEl2 = document.getElementById('report-period');
        const period = periodEl2 ? (periodEl2.value || 'day') : 'day';
        const rng = computeRange(period, selectedDateObj, (document.getElementById('report-start-date') || {}).value, (document.getElementById('report-end-date') || {}).value);
        let filteredActiveSales = activeSales;
        if (rng.rangeStart && rng.rangeEnd) {
            filteredActiveSales = activeSales.filter(sale => {
                if (!sale || !sale.created_at) return false;
                const d = parseSaleDate(sale.created_at);
                if (!d || isNaN(d.getTime())) return false;
                return d >= rng.rangeStart && d <= rng.rangeEnd;
            });
        }
        const productCountMap = new Map();
        const categoryCountMap = new Map();
        const productById = new Map(Array.isArray(products) ? products.map(p => [p.id, p]) : []);
        filteredActiveSales.forEach(sale => {
            if (!sale || !Array.isArray(sale.items)) return;
            sale.items.forEach(item => {
                const qty = Number(item.quantity) || 0;
                const pid = item.id || item.productId || '';
                const pname = item.name || 'Unknown';
                const price = Number(item.price) || 0;
                const amt = price * qty;
                if (pid || pname) {
                    const existing = productCountMap.get(pid || pname);
                    if (existing) {
                        existing.count += qty;
                        existing.amount += amt;
                    } else {
                        productCountMap.set(pid || pname, { id: pid, name: pname, count: qty, amount: amt });
                    }
                }
                let category = 'Uncategorized';
                const p = pid ? productById.get(pid) : null;
                if (p && p.category) category = p.category;
                const c = categoryCountMap.get(category);
                if (c) {
                    c.count += qty;
                    c.amount += amt;
                } else {
                    categoryCountMap.set(category, { count: qty, amount: amt });
                }
            });
        });
        currentProductSalesRows = Array.from(productCountMap.values()).sort((a, b) => b.count - a.count);
        currentCategorySalesRows = Array.from(categoryCountMap.entries()).map(([category, v]) => ({ category, count: v.count, amount: v.amount })).sort((a, b) => b.count - a.count);
        
        // Newly added products
        const newProducts = products.filter(p => {
            if (!p || !p.created_at || p.deleted) return false;
            const d = parseSaleDate(p.created_at);
            if (!d || isNaN(d.getTime())) return false;
            return d >= rng.rangeStart && d <= rng.rangeEnd;
        }).sort((a, b) => {
            const dA = parseSaleDate(a.created_at) || new Date(0);
            const dB = parseSaleDate(b.created_at) || new Date(0);
            return dB - dA;
        });

        const productSearchEl2 = document.getElementById('report-product-search');
        const categorySearchEl2 = document.getElementById('report-category-search');
        renderProductSalesTable(currentProductSalesRows, productSearchEl2 ? productSearchEl2.value : '');
        renderStockReconTable(currentProductSalesRows);
        renderNewProductsTable(newProducts);
        renderCategorySalesTable(currentCategorySalesRows, categorySearchEl2 ? categorySearchEl2.value : '');
    } catch (error) {
        console.error('Error generating report:', error);
        showNotification('Error generating report: ' + error.message, 'error');
    }
  }
  
  function renderProductSalesTable(rows, query) {
    if (!reportProductSalesBody) return;
    const q = (query || '').toString().trim().toLowerCase();
    const list = q ? rows.filter(r => (r.name || '').toString().toLowerCase().includes(q)) : rows;
    if (!list || list.length === 0) {
        reportProductSalesBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center;">No product sales data</td>
            </tr>
        `;
        return;
    }
    const fragment = document.createDocumentFragment();
    reportProductSalesBody.innerHTML = '';
    const productById = new Map(Array.isArray(products) ? products.map(p => [p.id, p]) : []);
    list.forEach(r => {
        const row = document.createElement('tr');
        const p = productById.get(r.id);
        const currentStock = p ? p.stock : '-';
        row.innerHTML = `
            <td>${r.name}</td>
            <td>${r.count}</td>
            <td>${formatCurrency(r.amount || 0)}</td>
            <td>${currentStock}</td>
        `;
        fragment.appendChild(row);
    });
    reportProductSalesBody.appendChild(fragment);
  }
  
  function renderStockReconTable(rows, query) {
    if (!reportStockReconBody) return;
    const q = (query || '').toString().trim().toLowerCase();
    const list = q ? rows.filter(r => (r.name || '').toString().toLowerCase().includes(q)) : rows;
    if (!list || list.length === 0) {
        reportStockReconBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center;">No reconciliation data</td>
            </tr>
        `;
        return;
    }
    const fragment = document.createDocumentFragment();
    reportStockReconBody.innerHTML = '';
    const productById = new Map(Array.isArray(products) ? products.map(p => [p.id, p]) : []);
    list.forEach(r => {
        const row = document.createElement('tr');
        const p = productById.get(r.id);
        const closingBalance = p ? p.stock : 0;
        const deducted = r.count || 0;
        const openingBalance = closingBalance + deducted;
        row.innerHTML = `
            <td>${r.name}</td>
            <td>${openingBalance}</td>
            <td>${deducted}</td>
            <td>${closingBalance}</td>
        `;
        fragment.appendChild(row);
    });
    reportStockReconBody.appendChild(fragment);
  }

  function renderNewProductsTable(list) {
    if (!reportNewProductsBody) return;
    if (!list || list.length === 0) {
        reportNewProductsBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center;">No new products in this period</td>
            </tr>
        `;
        return;
    }
    const fragment = document.createDocumentFragment();
    reportNewProductsBody.innerHTML = '';
    list.forEach(p => {
        const row = document.createElement('tr');
        const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '-';
        row.innerHTML = `
            <td>${p.name}</td>
            <td>${p.category || '-'}</td>
            <td>${formatCurrency(p.price || 0)}</td>
            <td>${dateStr}</td>
        `;
        fragment.appendChild(row);
    });
    reportNewProductsBody.appendChild(fragment);
  }
  
  function renderCategorySalesTable(rows, query) {
    if (!reportCategorySalesBody) return;
    const q = (query || '').toString().trim().toLowerCase();
    const list = q ? rows.filter(r => (r.category || '').toString().toLowerCase().includes(q)) : rows;
    if (!list || list.length === 0) {
        reportCategorySalesBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center;">No category sales data</td>
            </tr>
        `;
        return;
    }
    const fragment = document.createDocumentFragment();
    reportCategorySalesBody.innerHTML = '';
    list.forEach(r => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${r.category}</td>
            <td>${r.count}</td>
            <td>${formatCurrency(r.amount || 0)}</td>
        `;
        fragment.appendChild(row);
    });
    reportCategorySalesBody.appendChild(fragment);
  }
  
  function loadAccount() {
    const accountLoading = document.getElementById('account-loading');
    if (accountLoading) accountLoading.style.display = 'flex';
    
    setTimeout(() => {
        if (accountLoading) accountLoading.style.display = 'none';
        
        if (currentUser) {
            const userNameEl = document.getElementById('user-name');
            const userEmailEl = document.getElementById('user-email');
            const userRoleDisplayEl = document.getElementById('user-role-display');
            const userCreatedEl = document.getElementById('user-created');
            const userLastLoginEl = document.getElementById('user-last-login');
            
            if (userNameEl) userNameEl.textContent = currentUser.name;
            if (userEmailEl) userEmailEl.textContent = currentUser.email;
            if (userRoleDisplayEl) userRoleDisplayEl.textContent = currentUser.role;
            if (userCreatedEl) userCreatedEl.textContent = formatDate(currentUser.created_at);
            if (userLastLoginEl) userLastLoginEl.textContent = formatDate(currentUser.last_login);
        }
        
        if (AuthModule.isAdmin()) {
            (async () => {
                await DataModule.fetchUsers();
                loadUsers();
            })();
        }
        
        /* no-op */
    }, 500);
  }
  
  function loadUsers() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    if (users.length === 0) {
        usersList.innerHTML = '<p>No users found</p>';
        return;
    }
    
    users.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        
        userCard.innerHTML = `
            <div class="user-info">
                <strong>${user.name}</strong>
                <span>${user.email}</span>
                <span class="role-badge ${user.role}">${user.role}</span>
            </div>
            <div class="action-buttons">
                <select onchange="updateUserRole('${user.id}', this.value)">
                    <option value="cashier" ${user.role === 'cashier' ? 'selected' : ''}>Cashier</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <button class="btn-delete" onclick="deleteUser('${user.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        usersList.appendChild(userCard);
    });
  }
  
  async function updateUserRole(userId, newRole) {
    showNotification('User role management is handled in the backend', 'warning');
  }
  
  async function deleteUser(userId) {
    showNotification('User deletion is handled in the backend', 'warning');
  }
  
  // Cart Functions
  function addToCart(product) {
    if (product.stock <= 0) {
        showNotification('Product is out of stock', 'error');
        return;
    }
    
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        if (existingItem.quantity >= product.stock) {
            showNotification('Not enough stock available', 'error');
            return;
        }
        
        existingItem.quantity++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }
    
    updateCart();
  }
  
  function updateCart() {
    if (cart.length === 0) {
        cartItems.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No items in cart</p>';
        totalEl.textContent = formatCurrency(0);
        return;
    }
    
    cartItems.innerHTML = '';
    let total = 0;
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        
        cartItem.innerHTML = '';
        const cartItemInfo = document.createElement('div');
        cartItemInfo.className = 'cart-item-info';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'cart-item-name';
        nameDiv.textContent = item.name;
        cartItemInfo.appendChild(nameDiv);
        
        const priceDiv = document.createElement('div');
        priceDiv.className = 'cart-item-price';
        priceDiv.textContent = formatCurrency(item.price);
        cartItemInfo.appendChild(priceDiv);
        
        const qtyDiv = document.createElement('div');
        qtyDiv.className = 'cart-item-qty';
        
        const minusBtn = document.createElement('button');
        minusBtn.className = 'cart-qty-btn';
        minusBtn.textContent = '-';
        minusBtn.setAttribute('data-product-id', item.id);
        minusBtn.setAttribute('data-change', '-1');
        minusBtn.setAttribute('aria-label', `Decrease quantity for ${item.name}`);
        qtyDiv.appendChild(minusBtn);
        
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.value = item.quantity;
        qtyInput.min = '1';
        qtyInput.readOnly = true;
        qtyDiv.appendChild(qtyInput);
        
        const plusBtn = document.createElement('button');
        plusBtn.className = 'cart-qty-btn';
        plusBtn.textContent = '+';
        plusBtn.setAttribute('data-product-id', item.id);
        plusBtn.setAttribute('data-change', '1');
        plusBtn.setAttribute('aria-label', `Increase quantity for ${item.name}`);
        qtyDiv.appendChild(plusBtn);
        
        cartItemInfo.appendChild(qtyDiv);
        cartItem.appendChild(cartItemInfo);
        
        const totalDiv = document.createElement('div');
        totalDiv.className = 'cart-item-total';
        totalDiv.textContent = formatCurrency(itemTotal);
        cartItem.appendChild(totalDiv);
        
        cartItems.appendChild(cartItem);
    });
    
    totalEl.textContent = formatCurrency(total);
  }
  
  function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const newQuantity = item.quantity + change;
    
    if (newQuantity <= 0) {
        cart = cart.filter(item => item.id !== productId);
    } else if (newQuantity <= product.stock) {
        item.quantity = newQuantity;
    } else {
        showNotification('Not enough stock available', 'error');
        return;
    }
    
    updateCart();
  }
  
  function clearCart() {
    cart = [];
    updateCart();
  }
  
  async function completeSale() {
    if (cart.length === 0) {
        showNotification('Cart is empty', 'error');
        return;
    }
    
    const completeSaleBtn = document.getElementById('complete-sale-btn');
    completeSaleBtn.classList.add('loading');
    completeSaleBtn.disabled = true;
    
    try {
        let validCashierId = currentUser?.id || null;
        if (validCashierId && !validCashierId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
            validCashierId = null;
        }
        
        const pmEl = document.getElementById('payment-method');
        const paymentMethod = pmEl && pmEl.value ? pmEl.value : 'cash';
        
        const sale = {
            receiptNumber: generateReceiptNumber(),
            clientSaleId: 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            items: [...cart],
            total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            created_at: new Date().toISOString(),
            cashier: currentUser.name,
            cashierId: validCashierId,
            paymentMethod: paymentMethod
        };
        const localResult = DataModule.saveSaleLocally(sale);
        (async () => {
            try { await DataModule.saveSale(sale); } catch (_) {}
        })();
        
        if (localResult.success) {
            for (const cartItem of cart) {
                const product = products.find(p => String(p.id) === String(cartItem.id));
                if (product) {
                    const currentStock = Number(product.stock);
                    const qty = Number(cartItem.quantity);
                    const safeCurrent = isFinite(currentStock) ? currentStock : 0;
                    const safeQty = isFinite(qty) ? qty : 0;
                    product.stock = Math.max(0, safeCurrent - safeQty);
                    
                    addToSyncQueue({
                        type: 'saveProduct',
                        data: {
                            id: product.id,
                            stock: product.stock
                        }
                    });
                }
            }
            
            saveToLocalStorage();
            
            // Check for new alerts after updating stock
            checkAndGenerateAlerts();
            
            // Refresh product displays and inventory/stock views immediately
            try {
                loadProducts();
                updateInventoryTotalFromAllProducts();
                loadInventory();
                loadStockCheck();
            } catch (_) {}
            
            showReceipt(localResult.sale);
            
            cart = [];
            updateCart();
            
            loadSales();
            if (currentPage === 'reports') {
                try { refreshReportData(true); } catch (_) {}
            }
            
            showNotification('Sale completed successfully', 'success');
            
            try {
                if (typeof window.updateAnalyticsSummary === 'function') {
                    window.updateAnalyticsSummary();
                }
            } catch (_) {}
        } else {
            showNotification('Failed to complete sale', 'error');
        }
    } catch (error) {
        console.error('Error completing sale:', error);
        showNotification('Error completing sale', 'error');
    } finally {
        completeSaleBtn.classList.remove('loading');
        completeSaleBtn.disabled = false;
    }
  }
  
  function showReceipt(sale) {
    const receiptContent = document.getElementById('receipt-content');
    if (!receiptContent) return;
    
    let itemsHtml = '';
    sale.items.forEach(item => {
        itemsHtml += `
            <div class="receipt-item">
                <span>${item.name} x${item.quantity}</span>
                <span>${formatCurrency(item.price * item.quantity)}</span>
            </div>
        `;
    });
    
    receiptContent.innerHTML = `
        <div class="receipt-header">
            <h2>${settings.storeName}</h2>
            <p>${settings.storeAddress}</p>
            <p>${settings.storePhone}</p>
        </div>
        <div class="receipt-items">
            ${itemsHtml}
        </div>
        <div class="receipt-footer">
            <div class="receipt-total">
                <span>Total:</span>
                <span>${formatCurrency(sale.total)}</span>
            </div>
            <div class="receipt-item">
                <span>Receipt #:</span>
                <span>${sale.receiptNumber}</span>
            </div>
            <div class="receipt-item">
                <span>Date:</span>
                <span>${formatDate(sale.created_at)}</span>
            </div>
            <div class="receipt-item">
                <span>Cashier:</span>
                <span>${sale.cashier}</span>
            </div>
            <div class="receipt-item">
                <span>Payment:</span>
                <span>${(sale.paymentMethod || 'cash').toUpperCase()}</span>
            </div>
        </div>
    `;
    
    receiptModal.style.display = 'flex';
  }
  
  function printReceipt() {
    const receiptContent = document.getElementById('receipt-content');
    if (!receiptContent) return;
    
    const content = receiptContent.innerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Receipt - ${settings.storeName}</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 20px; }
                    .receipt-header { text-align: center; margin-bottom: 20px; }
                    .receipt-items { margin-bottom: 20px; }
                    .receipt-item { display: flex; justify-content: space-between; margin-bottom: 8px; }
                    .receipt-footer { border-top: 1px dashed #ccc; padding-top: 10px; }
                    .receipt-total { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                ${content}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  }
  
  // Product Modal Functions
  function openProductModal(product = null) {
    if (!AuthModule.isAdmin()) {
        showNotification('Only admins can add or edit products', 'error');
        return;
    }
    
    const modalTitle = document.getElementById('modal-title');
    const productForm = document.getElementById('product-form');
    
    if (product) {
        if (modalTitle) modalTitle.textContent = 'Edit Product';
        const productNameEl = document.getElementById('product-name');
        const productCategoryEl = document.getElementById('product-category');
        const productPriceEl = document.getElementById('product-price');
        const productStockEl = document.getElementById('product-stock');
        const productExpiryEl = document.getElementById('product-expiry');
        const productBarcodeEl = document.getElementById('product-barcode');
        
        if (productNameEl) productNameEl.value = product.name;
        if (productCategoryEl) productCategoryEl.value = product.category;
        if (productPriceEl) productPriceEl.value = product.price;
        if (productStockEl) productStockEl.value = product.stock;
        if (productExpiryEl) productExpiryEl.value = product.expiryDate;
        if (productBarcodeEl) productBarcodeEl.value = product.barcode || '';
        
        if (productForm) productForm.dataset.productId = product.id;
    } else {
        if (modalTitle) modalTitle.textContent = 'Add New Product';
        if (productForm) {
            productForm.reset();
            delete productForm.dataset.productId;
        }
    }
    
    productModal.style.display = 'flex';
  }
  
  function closeProductModal() {
    productModal.style.display = 'none';
  }
  
  async function saveProduct() {
    if (!AuthModule.isAdmin()) {
        showNotification('Only admins can add or edit products', 'error');
        return;
    }
    
    const productForm = document.getElementById('product-form');
    if (!productForm) return;
    
    const productId = productForm.dataset.productId;
    
    const productNameEl = document.getElementById('product-name');
    const productCategoryEl = document.getElementById('product-category');
    const productPriceEl = document.getElementById('product-price');
    const productStockEl = document.getElementById('product-stock');
    const productExpiryEl = document.getElementById('product-expiry');
    const productBarcodeEl = document.getElementById('product-barcode');
    
    const productData = validateProductData({
        name: productNameEl ? productNameEl.value : '',
        category: productCategoryEl ? productCategoryEl.value : '',
        price: parseFloat(productPriceEl ? productPriceEl.value : 0),
        stock: parseInt(productStockEl ? productStockEl.value : 0),
        expiryDate: productExpiryEl ? productExpiryEl.value : '',
        barcode: productBarcodeEl ? productBarcodeEl.value : ''
    });
    
    if (productId) {
        productData.id = productId;
    }
    
    const result = await DataModule.saveProduct(productData);
    
    if (result.success) {
        closeProductModal();
        products = await DataModule.fetchProducts();
        
        // Check for new alerts after updating products
        checkAndGenerateAlerts();
        
        loadProducts();
        
        if (currentPage === 'inventory') {
            loadInventory();
        }
        
        if (currentPage === 'analytics') {
            loadStockAlerts();
        }
        
        showNotification(productId ? 'Product updated successfully' : 'Product added successfully', 'success');
    }
  }
  
  function editProduct(productId) {
    if (!AuthModule.isAdmin()) {
        showNotification('Only admins can edit products', 'error');
        return;
    }
    
    const product = products.find(p => p.id === productId);
    if (product) {
        openProductModal(product);
    }
  }
  
  async function deleteProduct(productId) {
    if (!AuthModule.isAdmin()) {
        showNotification('Only admins can delete products', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this product?')) {
        return;
    }
    
    const result = await DataModule.deleteProduct(productId);
    
    if (result.success) {
        if (isOnline) {
            products = await DataModule.fetchAllProducts();
        } else {
            dedupeProducts();
        }
        
        // Check for new alerts after deleting products
        checkAndGenerateAlerts();
        
        loadProducts();
        
        if (currentPage === 'inventory') {
            const inventorySearchEl = document.getElementById('inventory-search');
            if (inventorySearchEl) inventorySearchEl.value = '';
            loadInventory();
        }
        
        if (currentPage === 'analytics') {
            loadStockAlerts();
        }
        
        showNotification('Product deleted successfully', 'success');
    } else {
        showNotification('Failed to delete product', 'error');
    }
  }
  
  function viewSale(saleId) {
    const sale = findSaleByActionKey(saleId, sales) || findSaleByActionKey(saleId, deletedSales);
    if (sale) {
        showReceipt(sale);
    } else {
        showNotification('❌ Sale not found', 'error');
    }
  }
  
  async function deleteSale(saleId) {
    if (!AuthModule.isAdmin()) {
        showNotification('❌ You do not have permission to delete sales', 'error');
        return;
    }
    
    const sale = findSaleByActionKey(saleId, sales);
    if (!sale) {
        showNotification('❌ Sale not found', 'error');
        return;
    }
    
    const confirmMessage = `Are you sure you want to delete this sale?\n\n` +
        `Receipt #: ${sale.receiptNumber}\n` +
        `Date: ${formatDate(sale.created_at)}\n` +
        `Total: ${formatCurrency(sale.total)}\n\n` +
        `This will be synced across all devices.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // Show immediate UI feedback
        showNotification('⏳ Deleting sale...', 'info');
        
        const result = await DataModule.deleteSale(saleId);
        
        if (result.success) {
            updateSalesTables();
            
            showNotification('✅ Sale deleted! This will sync across all your devices.', 'success');
            
            if (currentPage === 'reports') {
                generateReport();
            }
            
            try {
                if (typeof window.updateAnalyticsSummary === 'function') {
                    window.updateAnalyticsSummary();
                }
            } catch (_) {}
        } else {
            showNotification('❌ Failed to delete sale: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error deleting sale:', error);
        showNotification('❌ Error deleting sale: ' + (error.message || 'Unknown error'), 'error');
    }
  }
  
  async function refreshAllData() {
    try {
        const tkn = getToken && getToken();
        if (!tkn) return;
        const syncStatus = document.getElementById('sync-status');
        const syncStatusText = document.getElementById('sync-status-text');
        
        if (syncStatus) {
            syncStatus.classList.add('show', 'syncing');
            syncStatusText.textContent = 'Syncing all data...';
        }
        
        let newProducts = [];
        let newSales = [];
        let newDeletedSales = [];
        let newExpenses = [];
        let newPurchases = [];
        
        try { newProducts = await DataModule.fetchAllProducts(); } catch (_) { newProducts = products; }
        
        try { newSales = await DataModule.fetchSales(); } catch (_) { newSales = sales; }
        
        try { newDeletedSales = await DataModule.fetchDeletedSales(); } catch (_) { newDeletedSales = deletedSales; }
        
        try { newExpenses = await DataModule.fetchExpenses(); } catch (_) { newExpenses = expenses; }
        
        try { newPurchases = await DataModule.fetchPurchases(); } catch (_) { newPurchases = purchases; }
        
        products = newProducts;
        dedupeProducts();
        sales = newSales;
        deletedSales = newDeletedSales;
        expenses = newExpenses;
        purchases = newPurchases;
        
        validateSalesData();
        
        scheduleRender(() => checkAndGenerateAlerts());
        
        saveToLocalStorage();
        
        loadProducts();
        loadSales();
        try { generateReport(); } catch (_) {}
        
        if (currentPage === 'inventory') {
            loadInventory();
        } else if (currentPage === 'reports') {
            try { generateReport(); } catch (_) {}
        } else if (currentPage === 'account') {
            loadAccount();
        } else if (currentPage === 'expenses') {
            loadExpenses();
        } else if (currentPage === 'purchases') {
            loadPurchases();
        } else if (currentPage === 'analytics') {
            loadAnalytics();
        }
        
        if (syncQueue.length > 0) {
            await processSyncQueue();
        }
        
        if (syncStatus && syncStatusText) {
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('show');
            syncStatusText.textContent = 'All data synced';
            setTimeout(() => syncStatus.classList.remove('show'), 3000);
        }
        
        showNotification('All data synchronized successfully!', 'success');
        
    } catch (error) {
        console.error('Error refreshing data:', error);
        
        const syncStatus = document.getElementById('sync-status');
        const syncStatusText = document.getElementById('sync-status-text');
        
        if (syncStatus && syncStatusText) {
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('error');
            syncStatusText.textContent = 'Sync error';
            setTimeout(() => syncStatus.classList.remove('show', 'error'), 3000);
        }
        
        showNotification('Error syncing data. Please try again.', 'error');
    }
  }
  
  // Expense Functions
  function openExpenseModal(expense = null) {
    const modalTitle = document.getElementById('expense-modal-title');
    const expenseForm = document.getElementById('expense-form');
    
    if (expense) {
        modalTitle.textContent = 'Edit Expense';
        document.getElementById('expense-date').value = expense.date;
        document.getElementById('expense-description').value = expense.description;
        document.getElementById('expense-category').value = expense.category;
        document.getElementById('expense-amount').value = expense.amount;
        document.getElementById('expense-receipt').value = expense.receipt || '';
        document.getElementById('expense-notes').value = expense.notes || '';
        
        expenseForm.dataset.expenseId = expense.id;
    } else {
        modalTitle.textContent = 'Add Expense';
        expenseForm.reset();
        document.getElementById('expense-date').valueAsDate = new Date();
        delete expenseForm.dataset.expenseId;
    }
    
    document.getElementById('expense-modal').style.display = 'flex';
  }
  
  function closeExpenseModal() {
    document.getElementById('expense-modal').style.display = 'none';
  }
  
  async function saveExpense() {
    const expenseForm = document.getElementById('expense-form');
    const expenseId = expenseForm.dataset.expenseId;
    
    // Get form values
    const date = document.getElementById('expense-date').value;
    const description = document.getElementById('expense-description').value;
    const category = document.getElementById('expense-category').value;
    const amount = document.getElementById('expense-amount').value;
    const receipt = document.getElementById('expense-receipt').value;
    const notes = document.getElementById('expense-notes').value;
    
    // Validate required fields
    const missingFields = [];
    if (!date) missingFields.push('Date');
    if (!description.trim()) missingFields.push('Description');
    if (!category) missingFields.push('Category');
    if (!amount || parseFloat(amount) <= 0) missingFields.push('Amount');
    
    if (missingFields.length > 0) {
        const fieldList = missingFields.join(', ');
        showNotification(`Please fill in the following required fields: ${fieldList}`, 'error');
        
        // Highlight missing fields
        if (!date) document.getElementById('expense-date').classList.add('error');
        if (!description.trim()) document.getElementById('expense-description').classList.add('error');
        if (!category) document.getElementById('expense-category').classList.add('error');
        if (!amount || parseFloat(amount) <= 0) document.getElementById('expense-amount').classList.add('error');
        
        // Remove error highlighting after 3 seconds
        setTimeout(() => {
            document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        }, 3000);
        
        return;
    }
    
    const expenseData = {
        date: date,
        description: description.trim(),
        category: category,
        amount: parseFloat(amount),
        receipt: receipt,
        notes: notes
    };
    
    if (expenseId) {
        expenseData.id = expenseId;
    }
    
    const modalLoading = document.getElementById('expense-modal-loading');
    const saveBtn = document.getElementById('save-expense-btn');
    
    modalLoading.style.display = 'flex';
    saveBtn.disabled = true;
    
    try {
        const result = await DataModule.saveExpense(expenseData);
        
        if (result.success) {
            closeExpenseModal();
            loadExpenses();
            showNotification('Expense saved successfully', 'success');
        } else {
            showNotification('Failed to save expense. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error saving expense:', error);
        showNotification('Error saving expense. Please try again.', 'error');
    } finally {
        modalLoading.style.display = 'none';
        saveBtn.disabled = false;
    }
  }
  
  async function loadExpenses() {
    const loading = document.getElementById('expenses-loading');
    const tableBody = document.getElementById('expenses-table-body');
    
    loading.style.display = 'flex';
    
    try {
        await DataModule.fetchExpenses();
        
        // Calculate monthly and yearly totals
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        let monthlyTotal = 0;
        let yearlyTotal = 0;
        
        expenses.forEach(expense => {
            const expenseDate = new Date(expense.date);
            
            if (expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear) {
                monthlyTotal += expense.amount;
            }
            
            if (expenseDate.getFullYear() === currentYear) {
                yearlyTotal += expense.amount;
            }
        });
        
        document.getElementById('monthly-expenses-total').textContent = formatCurrency(monthlyTotal);
        document.getElementById('yearly-expenses-total').textContent = formatCurrency(yearlyTotal);
        
        // Populate expense table
        if (expenses.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center;">No expenses data available</td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = '';
            
            expenses.slice(0, 20).forEach(expense => {
                const row = document.createElement('tr');
                
            row.innerHTML = `
                <td>${formatDate(expense.date)}</td>
                <td>${expense.description}</td>
                <td>${expense.category}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-edit" onclick="editExpense('${expense.id}')" title="Edit Expense">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </td>
            `;
                
                tableBody.appendChild(row);
            });
        }
        
        // Create expense categories chart
        createExpenseCategoriesChart();
    } catch (error) {
        console.error('Error loading expenses:', error);
        showNotification('Error loading expenses', 'error');
    } finally {
        loading.style.display = 'none';
    }
  }
  
  function createExpenseCategoriesChart() {
    const chartContainer = document.getElementById('expense-categories-chart');
    if (!chartContainer) return;
    
    // Calculate totals by category
    const categoryTotals = {};
    
    expenses.forEach(expense => {
        if (!categoryTotals[expense.category]) {
            categoryTotals[expense.category] = 0;
        }
        categoryTotals[expense.category] += expense.amount;
    });
    
    // Sort categories by total
    const sortedCategories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 categories
    
    if (sortedCategories.length === 0) {
        chartContainer.innerHTML = '<p>No expense data available</p>';
        return;
    }
    
    // Create a simple bar chart
    let maxAmount = Math.max(...sortedCategories.map(c => c[1]));
    
    let chartHTML = '<div class="simple-bar-chart">';
    
    sortedCategories.forEach(([category, amount]) => {
        const percentage = (amount / maxAmount) * 100;
        chartHTML += `
            <div class="bar-item">
                <div class="bar-label">${category}</div>
                <div class="bar-container">
                    <div class="bar" style="width: ${percentage}%"></div>
                </div>
                <div class="bar-value">${formatCurrency(amount)}</div>
            </div>
        `;
    });
    
    chartHTML += '</div>';
    chartContainer.innerHTML = chartHTML;
  }
  
  function editExpense(expenseId) {
    const expense = expenses.find(e => e.id === expenseId);
    if (expense) {
        openExpenseModal(expense);
    }
  }
  
  async function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }
    
    try {
        // Remove from local array
        expenses = expenses.filter(e => e.id !== expenseId);
        saveToLocalStorage();
        
        // Remove from database if online
        if (isOnline) {
            try { await ExpensesAPI.remove(expenseId); } catch (_) {}
        } else {
            // Add to sync queue
            addToSyncQueue({
                type: 'deleteExpense',
                id: expenseId
            });
        }
        
        loadExpenses();
        showNotification('Expense deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting expense:', error);
        showNotification('Error deleting expense', 'error');
    }
  }
  
  function filterExpenses() {
    const searchTerm = document.getElementById('expense-search').value.toLowerCase();
    const categoryFilter = document.getElementById('expense-filter-category').value;
    const dateFilter = document.getElementById('expense-filter-date').value;
    
    const filteredExpenses = expenses.filter(expense => {
        let matchesSearch = true;
        let matchesCategory = true;
        let matchesDate = true;
        
        if (searchTerm) {
            matchesSearch = expense.description.toLowerCase().includes(searchTerm) ||
                           expense.notes.toLowerCase().includes(searchTerm) ||
                           expense.receipt.toLowerCase().includes(searchTerm);
        }
        
        if (categoryFilter) {
            matchesCategory = expense.category === categoryFilter;
        }
        
        if (dateFilter) {
            matchesDate = expense.date === dateFilter;
        }
        
        return matchesSearch && matchesCategory && matchesDate;
    });
    
    const tableBody = document.getElementById('expenses-table-body');
    
    if (filteredExpenses.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center;">No expenses match the current filters</td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = '';
        
        filteredExpenses.forEach(expense => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${formatDate(expense.date)}</td>
                <td>${expense.description}</td>
                <td>${expense.category}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-edit" onclick="editExpense('${expense.id}')" title="Edit Expense">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    }
  }
  
  async function refreshExpenses() {
    await loadExpenses();
    showNotification('Expenses refreshed', 'success');
  }
  
  // Purchase Functions
  function openPurchaseModal(purchase = null) {
    const modalTitle = document.getElementById('purchase-modal-title');
    const purchaseForm = document.getElementById('purchase-form');
    
    if (purchase) {
        modalTitle.textContent = 'Edit Purchase';
        document.getElementById('purchase-date').value = purchase.date;
        document.getElementById('purchase-supplier').value = purchase.supplier;
        document.getElementById('purchase-description').value = purchase.description;
        document.getElementById('purchase-invoice').value = purchase.invoice || '';
        document.getElementById('purchase-notes').value = purchase.notes || '';
        
        purchaseForm.dataset.purchaseId = purchase.id;
    } else {
        modalTitle.textContent = 'Add Purchase';
        purchaseForm.reset();
        document.getElementById('purchase-date').valueAsDate = new Date();
        delete purchaseForm.dataset.purchaseId;
    }
    
    document.getElementById('purchase-modal').style.display = 'flex';
  }
  
  function closePurchaseModal() {
    document.getElementById('purchase-modal').style.display = 'none';
  }
  
  async function savePurchase() {
    const purchaseForm = document.getElementById('purchase-form');
    const purchaseId = purchaseForm.dataset.purchaseId;
    
    // Get form values
    const date = document.getElementById('purchase-date').value;
    const supplier = document.getElementById('purchase-supplier').value;
    const description = document.getElementById('purchase-description').value;
    const amountEl = document.getElementById('purchase-amount');
    const amount = amountEl ? amountEl.value : '';
    const invoice = document.getElementById('purchase-invoice').value;
    const notes = document.getElementById('purchase-notes').value;
    
    // Validate required fields
    const missingFields = [];
    if (!date) missingFields.push('Date');
    if (!supplier.trim()) missingFields.push('Supplier');
    if (!description.trim()) missingFields.push('Description');
    if (amountEl && (!amount || parseFloat(amount) <= 0)) missingFields.push('Amount');
    
    if (missingFields.length > 0) {
        const fieldList = missingFields.join(', ');
        showNotification(`Please fill in the following required fields: ${fieldList}`, 'error');
        
        // Highlight missing fields
        if (!date) document.getElementById('purchase-date').classList.add('error');
        if (!supplier.trim()) document.getElementById('purchase-supplier').classList.add('error');
        if (!description.trim()) document.getElementById('purchase-description').classList.add('error');
        if (amountEl && (!amount || parseFloat(amount) <= 0)) amountEl.classList.add('error');
        
        // Remove error highlighting after 3 seconds
        setTimeout(() => {
            document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        }, 3000);
        
        return;
    }
    
    const purchaseData = {
        date: date,
        supplier: supplier.trim(),
        description: description.trim(),
        amount: amountEl ? parseFloat(amount) : undefined,
        invoice: invoice,
        notes: notes
    };
    
    if (purchaseId) {
        purchaseData.id = purchaseId;
    }
    
    const modalLoading = document.getElementById('purchase-modal-loading');
    const saveBtn = document.getElementById('save-purchase-btn');
    
    modalLoading.style.display = 'flex';
    saveBtn.disabled = true;
    
    try {
        const result = await DataModule.savePurchase(purchaseData);
        
        if (result.success) {
            closePurchaseModal();
            loadPurchases();
            showNotification('Purchase saved successfully', 'success');
        } else {
            showNotification('Failed to save purchase. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error saving purchase:', error);
        showNotification('Error saving purchase. Please try again.', 'error');
    } finally {
        modalLoading.style.display = 'none';
        saveBtn.disabled = false;
    }
  }

  // Bind Add Purchase button to open the modal
  document.addEventListener('DOMContentLoaded', () => {
    const addPurchaseBtn = document.getElementById('add-purchase-btn');
    if (addPurchaseBtn) {
      addPurchaseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openPurchaseModal(null);
      });
    }
  });
  
  async function loadPurchases() {
    const loading = document.getElementById('purchases-loading');
    const tableBody = document.getElementById('purchases-table-body');
    
    loading.style.display = 'flex';
    
    try {
        await DataModule.fetchPurchases();
        
        // Calculate monthly and yearly totals
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        let monthlyTotal = 0;
        let yearlyTotal = 0;
        const suppliers = new Set();
        
        purchases.forEach(purchase => {
            const purchaseDate = new Date(purchase.date);
            
            if (purchaseDate.getMonth() === currentMonth && purchaseDate.getFullYear() === currentYear) {
                monthlyTotal += purchase.amount;
            }
            
            if (purchaseDate.getFullYear() === currentYear) {
                yearlyTotal += purchase.amount;
            }
            
            suppliers.add(purchase.supplier);
        });
        
        document.getElementById('monthly-purchases-total').textContent = formatCurrency(monthlyTotal);
        document.getElementById('yearly-purchases-total').textContent = formatCurrency(yearlyTotal);
        document.getElementById('total-suppliers').textContent = suppliers.size;
        
        // Populate purchase table
        if (purchases.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center;">No purchases data available</td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = '';
            
            purchases.slice(0, 20).forEach(purchase => {
                const row = document.createElement('tr');
                
                  row.innerHTML = `
                      <td>${formatDate(purchase.date)}</td>
                      <td>${purchase.supplier}</td>
                      <td>${purchase.description}</td>
                      <td>${formatCurrency(purchase.amount)}</td>
                      <td>
                          <div class="action-buttons">
                              <button class="btn-edit" onclick="editPurchase('${purchase.id}')" title="Edit Purchase">
                                  <i class="fas fa-edit"></i>
                              </button>
                          </div>
                      </td>
                  `;
                
                tableBody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading purchases:', error);
        showNotification('Error loading purchases', 'error');
    } finally {
        loading.style.display = 'none';
    }
  }
  
  function editPurchase(purchaseId) {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (purchase) {
        openPurchaseModal(purchase);
    }
  }
  
  async function deletePurchase(purchaseId) {
    if (!confirm('Are you sure you want to delete this purchase?')) {
        return;
    }
    
    try {
        // Remove from local array
        purchases = purchases.filter(p => p.id !== purchaseId);
        saveToLocalStorage();
        
        // Remove from database if online
        if (isOnline) {
            try { await PurchasesAPI.remove ? PurchasesAPI.remove(purchaseId) : Promise.resolve(); } catch (_) {}
        } else {
            // Add to sync queue
            addToSyncQueue({
                type: 'deletePurchase',
                id: purchaseId
            });
        }
        
        loadPurchases();
        showNotification('Purchase deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting purchase:', error);
        showNotification('Error deleting purchase', 'error');
    }
  }
  
  function filterPurchases() {
    const searchTerm = document.getElementById('purchase-search').value.toLowerCase();
    const dateFilter = document.getElementById('purchase-filter-date').value;
    
    const filteredPurchases = purchases.filter(purchase => {
        let matchesSearch = true;
        let matchesDate = true;
        
        if (searchTerm) {
            matchesSearch = purchase.supplier.toLowerCase().includes(searchTerm) ||
                           purchase.description.toLowerCase().includes(searchTerm) ||
                           purchase.notes.toLowerCase().includes(searchTerm) ||
                           purchase.invoice.toLowerCase().includes(searchTerm);
        }
        
        if (dateFilter) {
            matchesDate = purchase.date === dateFilter;
        }
        
        return matchesSearch && matchesDate;
    });
    
    const tableBody = document.getElementById('purchases-table-body');
    
    if (filteredPurchases.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center;">No purchases match the current filters</td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = '';
        
        filteredPurchases.forEach(purchase => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${formatDate(purchase.date)}</td>
                <td>${purchase.supplier}</td>
                <td>${purchase.description}</td>
                <td>${formatCurrency(purchase.amount)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-edit" onclick="editPurchase('${purchase.id}')" title="Edit Purchase">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    }
  }
  
  async function refreshPurchases() {
    await loadPurchases();
    showNotification('Purchases refreshed', 'success');
  }
  
  function loadStockAlerts() {
    import('./analytics.module.js').then(m => m.loadStockAlerts(getAnalyticsCtx())).catch(() => {});
  }
  
  function loadDiscrepancies() {
    import('./analytics.module.js').then(m => m.loadDiscrepancies(getAnalyticsCtx())).catch(() => {});
  }
  
  // Analytics Functions
  async function loadAnalytics() {
    try {
      const m = await import('./analytics.module.js');
      await m.loadAnalytics(getAnalyticsCtx());
    } catch (_) {
      showNotification('Error loading analytics', 'error');
    }
  }
  
  function createSalesTrendChart(startDate, endDate) {
    import('./analytics.module.js').then(m => m.createSalesTrendChart(getAnalyticsCtx(), startDate, endDate)).catch(() => {});
  }
  
  function createPurchaseTrendChart(startDate, endDate) {
    import('./analytics.module.js').then(m => m.createPurchaseTrendChart(getAnalyticsCtx(), startDate, endDate)).catch(() => {});
  }
  
  function createExpenseTrendChart(startDate, endDate) {
    import('./analytics.module.js').then(m => m.createExpenseTrendChart(getAnalyticsCtx(), startDate, endDate)).catch(() => {});
  }
  
  function createTopProductsChart(startDate, endDate) {
    import('./analytics.module.js').then(m => m.createTopProductsChart(getAnalyticsCtx(), startDate, endDate)).catch(() => {});
  }
  
  function handleAnalyticsPeriodChange() {
    import('./analytics.module.js').then(m => m.handleAnalyticsPeriodChange(getAnalyticsCtx())).catch(() => {});
  }
  
  async function refreshAnalytics() {
    try {
      const m = await import('./analytics.module.js');
      await m.refreshAnalytics(getAnalyticsCtx());
    } catch (_) {}
  }
  
  function restockProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        openProductModal(product);
    }
  }
  
  function viewProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        showPage('inventory');
        loadInventory();
        
        // Highlight the product in the table
        setTimeout(() => {
            const row = document.querySelector(`#inventory-table-body tr:has(td:first-child:contains("${productId}"))`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight');
                setTimeout(() => row.classList.remove('highlight'), 3000);
            }
        }, 500);
    }
  }
  
  function removeProduct(productId) {
    if (!confirm('Are you sure you want to remove this expired product from inventory?')) {
        return;
    }
    
    deleteProduct(productId);
  }
  
  // Event Listeners
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const loginErrorEl = document.getElementById('login-error');
    if (loginErrorEl) loginErrorEl.style.display = 'none';
    
    AuthModule.signIn(email, password);
  });
  
  const loginEmailInput = document.getElementById('login-email');
  const loginPasswordInput = document.getElementById('login-password');
  if (loginEmailInput) {
    loginEmailInput.addEventListener('input', () => {
        const el = document.getElementById('login-error');
        if (el) el.style.display = 'none';
    });
  }
  if (loginPasswordInput) {
    loginPasswordInput.addEventListener('input', () => {
        const el = document.getElementById('login-error');
        if (el) el.style.display = 'none';
    });
  }
  
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const role = document.getElementById('register-role').value;
    
    if (password !== confirmPassword) {
        const registerError = document.getElementById('register-error');
        if (registerError) {
            registerError.style.display = 'block';
            registerError.textContent = 'Passwords do not match';
        }
        return;
    }
    
    const registerSubmitBtn = document.getElementById('register-submit-btn');
    registerSubmitBtn.classList.add('loading');
    registerSubmitBtn.disabled = true;
    
    AuthModule.signUp(email, password, name, role)
        .then(result => {
            if (result.success) {
                const loginTab = document.querySelector('[data-tab="login"]');
                if (loginTab) loginTab.click();
                registerForm.reset();
            }
        })
        .finally(() => {
            registerSubmitBtn.classList.remove('loading');
            registerSubmitBtn.disabled = false;
        });
  });
  
  // Login tabs
  document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        
        document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            if (content.id === `${tabName}-tab` || content.id === `${tabName}-content`) {
                content.classList.add('active');
            }
        });
        
        const loginError = document.getElementById('login-error');
        const registerError = document.getElementById('register-error');
        if (loginError) loginError.style.display = 'none';
        if (registerError) registerError.style.display = 'none';
    });
  });
  
  // Navigation
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = link.getAttribute('data-page');
        showPage(pageName);
    });
  });
  
  // Mobile menu
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
  }
  
  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            AuthModule.signOut();
        }
    });
  }
  
  // Cart quantity button delegation (for performance)
  if (cartItems) {
    cartItems.addEventListener('click', (e) => {
        const btn = e.target.closest('.cart-qty-btn');
        if (btn) {
            const productId = btn.getAttribute('data-product-id');
            const change = parseInt(btn.getAttribute('data-change'), 10);
            updateQuantity(productId, change);
        }
    });
  }
  
  // Product search
  function applyProductSearch(searchTerm) {
    const term = (searchTerm || '').toLowerCase();
    currentPosSearchTerm = term;
    const mySeq = ++posSearchSeq;
    if (!term) {
        loadProducts();
        return;
    }
    
    // Always show local results immediately
    renderLocal();
    
    // If online, also fetch from server but merge/render instead of overwriting
    if (isOnline) {
        (async () => {
            try {
                const data = await ProductsAPI.list();
                const normalized = Array.isArray(data) ? data.map(p => {
                    if (p.expirydate && !p.expiryDate) p.expiryDate = p.expirydate;
                    return p;
                }).filter(p => !p.deleted && ((p.name||'').toLowerCase().includes(term) || (p.category||'').toLowerCase().includes(term) || (p.barcode||'').toString().toLowerCase().includes(term))) : [];
                const seenIds = new Set(products.map(p => p.id));
                let added = 0;
                normalized.forEach(p => {
                    if (!seenIds.has(p.id)) {
                        products.push(p);
                        seenIds.add(p.id);
                        added++;
                    }
                });
                if (added > 0) {
                    dedupeProducts();
                    saveToLocalStorage();
                }
                renderLocal();
            } catch (_) {}
        })();
    }
    
    function renderLocal() {
        if (mySeq !== posSearchSeq) return;
        const filteredProducts = products.filter(product => {
            if (!product || product.deleted) return false;
            const name = (product.name || '').toLowerCase();
            const category = (product.category || '').toLowerCase();
            const barcode = (product.barcode || '').toString().toLowerCase();
            return name.includes(term) || category.includes(term) || barcode.includes(term);
        });
        
        if (filteredProducts.length === 0) {
            if (mySeq !== posSearchSeq) return;
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No products found</h3>
                    <p>Try a different search term</p>
                </div>
            `;
            return;
        }
        
        // Use the common render logic
        if (mySeq !== posSearchSeq) return;
        productsGrid.innerHTML = '';
        const chunkSize = 100;
        let index = 0;
        function renderChunk() {
            if (mySeq !== posSearchSeq) return;
            const fragment = document.createDocumentFragment();
            const today = new Date();
            for (let i = 0; i < chunkSize && index < filteredProducts.length; i++, index++) {
                const product = filteredProducts[index];
                if (!product || product.deleted) continue;
                const productCard = document.createElement('div');
                productCard.className = 'product-card';
                const expiryDate = new Date(product.expiryDate);
                const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
                let expiryWarning = '';
                let productNameStyle = '';
                if (daysUntilExpiry < 0) {
                    expiryWarning = `<div class="expiry-warning"><i class="fas fa-exclamation-triangle"></i> Expired</div>`;
                    productNameStyle = 'style="color: red; font-weight: bold;"';
                } else if (daysUntilExpiry <= settings.expiryWarningDays) {
                    expiryWarning = `<div class="expiry-warning"><i class="fas fa-clock"></i> Expires in ${daysUntilExpiry} days</div>`;
                    productNameStyle = 'style="color: red; font-weight: bold;"';
                }
                let stockClass = 'stock-high';
                if (product.stock <= 0) {
                    stockClass = 'stock-low';
                } else if (product.stock <= settings.lowStockThreshold) {
                    stockClass = 'stock-medium';
                }
                productCard.innerHTML = `
                    <div class="product-img">
                        <i class="fas fa-box"></i>
                    </div>
                    <h4 ${productNameStyle}>${product.name}</h4>
                    <div class="price">${formatCurrency(product.price)}</div>
                    <div class="stock ${stockClass}">Stock: ${product.stock}</div>
                    ${expiryWarning}
                `;
                productCard.addEventListener('click', () => addToCart(product));
                fragment.appendChild(productCard);
            }
            if (mySeq !== posSearchSeq) return;
            productsGrid.appendChild(fragment);
            if (index < filteredProducts.length) {
                setTimeout(renderChunk, 0);
            }
        }
        renderChunk();
    }
  }
  
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
        const productSearchEl = document.getElementById('product-search');
        const searchTerm = productSearchEl ? productSearchEl.value : '';
        applyProductSearch(searchTerm);
    });
  }
  
  const productSearchEl = document.getElementById('product-search');
  if (productSearchEl) {
    const handler = debounce(() => {
        applyProductSearch(productSearchEl.value);
    }, 150);
    productSearchEl.addEventListener('input', handler);
  }

  const stockSearchEl = document.getElementById('stock-search');
  if (stockSearchEl) {
    const handler = debounce(() => {
        const term = (stockSearchEl.value || '').toLowerCase();
        const list = products.filter(p => {
            const n = (p && p.name ? p.name : '').toLowerCase();
            const c = (p && p.category ? p.category : '').toLowerCase();
            const b = (p && typeof p.barcode === 'string') ? p.barcode.toLowerCase() : '';
            return n.includes(term) || c.includes(term) || b.includes(term);
        });
        if (!stockTableBody) return;
        if (list.length === 0) {
            stockTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No products</td></tr>';
            return;
        }
        const groups = new Map();
        list.forEach(p => {
            const cat = (p.category || 'Uncategorized').toString();
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(p);
        });
        const categories = Array.from(groups.keys()).sort((a,b) => a.localeCompare(b));
        stockTableBody.innerHTML = '';
        const frag = document.createDocumentFragment();
        categories.forEach(cat => {
            const items = groups.get(cat).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
            const totalStock = items.reduce((s,p) => s + (Number(p.stock)||0), 0);
            const header = document.createElement('tr');
            header.style.background = '#f8f9fa';
            header.style.fontWeight = '700';
            header.innerHTML = '<td colspan=\"5\">' + cat + ' — ' + items.length + ' items, total stock ' + totalStock + '</td>';
            frag.appendChild(header);
            items.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td>' + (p.name || '') + '</td>' +
                               '<td>' + (p.category || '') + '</td>' +
                               '<td>' + (p.stock != null ? p.stock : '') + '</td>' +
                               '<td>' + (p.barcode || '') + '</td>' +
                               '<td>' + formatDate(p.expiryDate, true) + '</td>';
                frag.appendChild(tr);
            });
        });
        stockTableBody.appendChild(frag);
    }, 150);
    stockSearchEl.addEventListener('input', handler);
  }
  if (printStockBtn) {
    printStockBtn.addEventListener('click', () => {
        window.print();
    });
  }
  
  // Inventory search
  function applyInventorySearch(searchTerm, dateFilter) {
    const term = (searchTerm || '').toLowerCase();
    const day = (dateFilter || '').toString().trim();
    if (!term && !day) {
        loadInventory();
        return;
    }
    
    // Always show local results immediately
    renderLocal();
    
    // If online, also fetch from server but merge/render instead of overwriting
    if (isOnline) {
        (async () => {
            try {
                const data = await ProductsAPI.list();
                const filtered = Array.isArray(data) ? data.map(p => {
                    if (p.expirydate && !p.expiryDate) p.expiryDate = p.expirydate;
                    return p;
                }).filter(p => {
                    if (p.deleted) return false;
                    const matchesTerm = !term || (p.name||'').toLowerCase().includes(term) || (p.category||'').toLowerCase().includes(term);
                    const matchesDay = !day || (p.created_at && String(p.created_at).split('T')[0] === day);
                    return matchesTerm && matchesDay;
                }) : [];
                const seenIds = new Set(products.map(p => p.id));
                let added = 0;
                filtered.forEach(p => {
                    if (!seenIds.has(p.id)) {
                        products.push(p);
                        seenIds.add(p.id);
                        added++;
                    }
                });
                if (added > 0) {
                    dedupeProducts();
                    saveToLocalStorage();
                }
                renderLocal();
            } catch (_) {}
        })();
    }
    
    function renderLocal() {
        const filteredProducts = products.filter(product => {
            if (!product || product.deleted) return false;
            const name = (product.name || '').toLowerCase();
            const category = (product.category || '').toLowerCase();
            const idStr = (product.id != null) ? String(product.id).toLowerCase() : '';
            const matchesTerm = !term || name.includes(term) || category.includes(term) || idStr.includes(term);
            if (!matchesTerm) return false;
            
            if (!day) return true;
            if (!product.created_at) return false;
            const productDay = String(product.created_at).split('T')[0];
            return productDay === day;
        });
        
        if (filteredProducts.length === 0) {
            inventoryTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center;">No products found</td>
                </tr>
            `;
            const inventoryTotalValue = document.getElementById('inventory-total-value');
            if (inventoryTotalValue) inventoryTotalValue.textContent = formatCurrency(0);
            return;
        }
        
        renderInventoryList(filteredProducts);
        const totalValue = filteredProducts.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
        const inventoryTotalValue = document.getElementById('inventory-total-value');
        if (inventoryTotalValue) inventoryTotalValue.textContent = formatCurrency(totalValue);
    }
  }
  
  function renderInventoryList(list) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const todayTs = Date.now();
    const chunkSize = 400;
    let index = 0;
    const mySeq = ++inventoryRenderSeq;
    inventoryTableBody.innerHTML = '';
    const seenKeys = new Set();
    function renderChunk() {
        if (mySeq !== inventoryRenderSeq) return;
        let html = '';
        for (let i = 0; i < chunkSize && index < list.length; i++, index++) {
            const product = list[index];
            if (!product) continue;
            const key = productKeyNCP(product);
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            if (product.deleted) continue;
            const expiryTs = product.expiryTs || (product.expiryTs = Date.parse(product.expiryDate));
            const daysUntilExpiry = Math.ceil((expiryTs - todayTs) / msPerDay);
            let rowClass = '';
            let stockBadgeClass = 'stock-high';
            let stockBadgeText = 'In Stock';
            let productNameStyle = '';
            if (product.stock <= 0) {
                stockBadgeClass = 'stock-low';
                stockBadgeText = 'Out of Stock';
            } else if (product.stock <= settings.lowStockThreshold) {
                stockBadgeClass = 'stock-medium';
                stockBadgeText = 'Low Stock';
            }
            let expiryBadgeClass = 'expiry-good';
            let expiryBadgeText = 'Good';
            if (daysUntilExpiry < 0) {
                expiryBadgeClass = 'expiry-expired';
                expiryBadgeText = 'Expired';
                rowClass = 'expired';
                productNameStyle = 'style="color: red; font-weight: bold;"';
            } else if (daysUntilExpiry <= settings.expiryWarningDays) {
                expiryBadgeClass = 'expiry-warning';
                expiryBadgeText = 'Expiring Soon';
                rowClass = 'expiring-soon';
                productNameStyle = 'style="color: red; font-weight: bold;"';
            }
            let actionButtons = '';
            if (AuthModule.isAdmin()) {
                actionButtons = `
                    <div class="action-buttons">
                        <button class="btn-edit" onclick="editProduct('${product.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete" onclick="deleteProduct('${product.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            } else {
                actionButtons = '<span class="no-permission">Admin only</span>';
            }
            html += `
                <tr ${rowClass ? `class=\"${rowClass}\"` : ''}>
                    <td>${product.id}</td>
                    <td ${productNameStyle}>${product.name}</td>
                    <td>${product.category}</td>
                    <td>${formatCurrency(product.price)}</td>
                    <td>${product.stock}</td>
                    <td>${formatDate(product.expiryDate)}</td>
                    <td>
                        <span class="stock-badge ${stockBadgeClass}">${stockBadgeText}</span>
                        <span class="expiry-badge ${expiryBadgeClass}">${expiryBadgeText}</span>
                    </td>
                    <td>
                        ${actionButtons}
                    </td>
                </tr>
            `;
        }
        if (mySeq !== inventoryRenderSeq) return;
        if (html) inventoryTableBody.insertAdjacentHTML('beforeend', html);
        if (index < list.length) {
            requestAnimationFrame(renderChunk);
        }
    }
    requestAnimationFrame(renderChunk);
  }
  
  function updateInventoryTotalFromAllProducts() {
    const inventoryTotalValue = document.getElementById('inventory-total-value');
    if (inventoryTotalValue) {
        const totalValue = products
            .filter(p => !p.deleted)
            .reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
        inventoryTotalValue.textContent = formatCurrency(totalValue);
    }
    const inventoryTotalItems = document.getElementById('inventory-total-items');
    if (inventoryTotalItems) {
        const totalUnits = products
            .filter(p => !p.deleted)
            .reduce((s, p) => s + (Number(p.stock) || 0), 0);
        inventoryTotalItems.textContent = String(totalUnits);
    }
  }
  
  const inventorySearchBtn = document.getElementById('inventory-search-btn');
  const inventoryDateFilter = document.getElementById('inventory-date-filter');
  const inventorySearchEl = document.getElementById('inventory-search');

  if (inventorySearchBtn) {
    inventorySearchBtn.addEventListener('click', () => {
        const searchTerm = inventorySearchEl ? inventorySearchEl.value : '';
        const dateTerm = inventoryDateFilter ? inventoryDateFilter.value : '';
        applyInventorySearch(searchTerm, dateTerm);
    });
  }
  
  if (inventorySearchEl) {
    const handler = debounce(() => {
        const dateTerm = inventoryDateFilter ? inventoryDateFilter.value : '';
        applyInventorySearch(inventorySearchEl.value, dateTerm);
    }, 150);
    inventorySearchEl.addEventListener('input', handler);
  }

  if (inventoryDateFilter) {
    inventoryDateFilter.addEventListener('change', () => {
        const searchTerm = inventorySearchEl ? inventorySearchEl.value : '';
        applyInventorySearch(searchTerm, inventoryDateFilter.value);
    });
  }
  
  // Product buttons
  const addProductBtn = document.getElementById('add-product-btn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
        openProductModal();
    });
  }
  
  const addInventoryBtn = document.getElementById('add-inventory-btn');
  if (addInventoryBtn) {
    addInventoryBtn.addEventListener('click', () => {
        openProductModal();
    });
  }
  
  const saveProductBtn = document.getElementById('save-product-btn');
  if (saveProductBtn) {
    saveProductBtn.addEventListener('click', saveProduct);
  }
  
  const cancelProductBtn = document.getElementById('cancel-product-btn');
  if (cancelProductBtn) {
    cancelProductBtn.addEventListener('click', closeProductModal);
  }
  
  // Cart buttons
  const clearCartBtn = document.getElementById('clear-cart-btn');
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear cart?')) {
            clearCart();
        }
    });
  }
  
  const completeSaleBtn = document.getElementById('complete-sale-btn');
  if (completeSaleBtn) {
    completeSaleBtn.addEventListener('click', completeSale);
  }
  
  // Receipt modal buttons
  const printReceiptBtn = document.getElementById('print-receipt-btn');
  if (printReceiptBtn) {
    printReceiptBtn.addEventListener('click', printReceipt);
  }
  
  const newSaleBtn = document.getElementById('new-sale-btn');
  if (newSaleBtn) {
    newSaleBtn.addEventListener('click', () => {
        receiptModal.style.display = 'none';
    });
  }
  
  // Report generation
  const generateReportBtn = document.getElementById('generate-report-btn');
  if (generateReportBtn) {
    generateReportBtn.addEventListener('click', refreshReportData);
  }
  
  // Manual sync button
  const manualSyncBtn = document.getElementById('manual-sync-btn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', () => {
        if (isOnline && syncQueue.length > 0) {
            processSyncQueue();
        } else if (!isOnline) {
            showNotification('Cannot sync while offline', 'warning');
        } else {
            showNotification('No data to sync', 'info');
        }
    });
  }
  
  // Refresh report button
  const refreshReportBtn = document.getElementById('refresh-report-btn');
  if (refreshReportBtn) {
    refreshReportBtn.addEventListener('click', async () => {
        const reportsLoading = document.getElementById('reports-loading');
        if (reportsLoading) reportsLoading.style.display = 'flex';
        
        try {
            await refreshAllData();
            generateReport();
            showNotification('Report data refreshed successfully', 'success');
        } catch (error) {
            console.error('Error refreshing report data:', error);
            showNotification('Error refreshing report data', 'error');
        } finally {
            if (reportsLoading) reportsLoading.style.display = 'none';
        }
    });
  }
  
  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
    });
  });
  
  // Change password form
  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const emailEl = document.getElementById('change-password-username');
        const currentPasswordEl = document.getElementById('current-password');
        const newPasswordEl = document.getElementById('new-password');
        const confirmPasswordEl = document.getElementById('confirm-new-password');
        
        const email = (emailEl && emailEl.value) ? emailEl.value.trim() : (currentUser && currentUser.email) || '';
        const currentPassword = currentPasswordEl ? currentPasswordEl.value : '';
        const newPassword = newPasswordEl ? newPasswordEl.value : '';
        const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value : '';
        
        if (!email) {
            showNotification('Please enter your email address', 'error');
            return;
        }
        if (!currentPassword) {
            showNotification('Please enter your current password', 'error');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            showNotification('New password must be at least 6 characters', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showNotification('Passwords do not match', 'error');
            return;
        }
        if (newPassword === currentPassword) {
            showNotification('New password must be different from current', 'error');
            return;
        }
        
        const changePasswordBtn = document.getElementById('change-password-btn');
        changePasswordBtn.classList.add('loading');
        changePasswordBtn.disabled = true;
        
        try {
            showNotification('Password change is handled in the backend', 'warning');
        } finally {
            changePasswordBtn.classList.remove('loading');
            changePasswordBtn.disabled = false;
        }
    });
  }
  
  // Expense page event listeners
  document.getElementById('add-expense-btn').addEventListener('click', openExpenseModal);
  document.getElementById('refresh-expenses-btn').addEventListener('click', refreshExpenses);
  document.getElementById('expense-search').addEventListener('input', filterExpenses);
  document.getElementById('expense-filter-category').addEventListener('change', filterExpenses);
  document.getElementById('expense-filter-date').addEventListener('change', filterExpenses);
  
  // Purchase page event listeners
  document.getElementById('add-purchase-btn').addEventListener('click', openPurchaseModal);
  document.getElementById('refresh-purchases-btn').addEventListener('click', refreshPurchases);
  document.getElementById('purchase-search').addEventListener('input', filterPurchases);
  document.getElementById('purchase-filter-date').addEventListener('change', filterPurchases);
  
  // Analytics page event listeners
  document.getElementById('refresh-analytics-btn').addEventListener('click', refreshAnalytics);
  document.getElementById('analytics-period').addEventListener('change', handleAnalyticsPeriodChange);
  
  // Tab switching for analytics page
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
  
  // Modal event listeners
  document.querySelector('#expense-modal .modal-close').addEventListener('click', closeExpenseModal);
  document.getElementById('cancel-expense-btn').addEventListener('click', closeExpenseModal);
  document.getElementById('save-expense-btn').addEventListener('click', saveExpense);
  
  document.querySelector('#purchase-modal .modal-close').addEventListener('click', closePurchaseModal);
  document.getElementById('cancel-purchase-btn').addEventListener('click', closePurchaseModal);
  document.getElementById('save-purchase-btn').addEventListener('click', savePurchase);
  
  // Admin: Add User modal
  function openUserModal() {
    if (!AuthModule.isAdmin()) {
        showNotification('Only admins can create users', 'error');
        return;
    }
    const f = document.getElementById('user-form');
    if (f) f.reset();
    const err = document.getElementById('user-create-error');
    if (err) { err.style.display = 'none'; err.textContent = '-'; }
    document.getElementById('user-modal').style.display = 'flex';
  }
  function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
  }
  async function saveUserAdmin() {
    showNotification('User creation is handled in the backend', 'warning');
  }
  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) addUserBtn.addEventListener('click', openUserModal);
  const cancelUserBtn = document.getElementById('cancel-user-btn');
  if (cancelUserBtn) cancelUserBtn.addEventListener('click', closeUserModal);
  const saveUserBtn = document.getElementById('save-user-btn');
  if (saveUserBtn) saveUserBtn.addEventListener('click', saveUserAdmin);
  
  async function safeClearLocalData() {
    try {
      if (!isOnline) {
        showNotification('Go online before clearing data', 'warning');
        return;
      }
      try {
        if ((syncQueue || []).some(op => !op.synced)) {
          await processSyncQueue();
        }
      } catch (_) {}
      const pending = (syncQueue || []).filter(op => !op.synced).length;
      if (pending > 0) {
        showNotification('Pending offline operations; cannot clear now', 'error');
        return;
      }
      let serverProducts = products, serverSales = sales, serverDeleted = deletedSales, serverExpenses = expenses, serverPurchases = purchases;
      try {
        serverProducts = await DataModule.fetchAllProducts();
      } catch (_) {}
      try {
        serverSales = await DataModule.fetchSales();
      } catch (_) {}
      try {
        serverDeleted = await DataModule.fetchDeletedSales();
      } catch (_) {}
      try {
        serverExpenses = await DataModule.fetchExpenses();
      } catch (_) {}
      try {
        serverPurchases = await DataModule.fetchPurchases();
      } catch (_) {}
      const hadLocalSales = Array.isArray(sales) && sales.length > 0;
      const serverHasSales = Array.isArray(serverSales) && serverSales.length > 0;
      if (hadLocalSales && !serverHasSales) {
        showNotification('Server has no sales; preserving local sales', 'warning');
        return;
      }
      const keys = [
        STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.USERS,
        STORAGE_KEYS.SETTINGS, STORAGE_KEYS.CURRENT_USER, STORAGE_KEYS.EXPENSES, STORAGE_KEYS.PURCHASES,
        STORAGE_KEYS.STOCK_ALERTS, STORAGE_KEYS.PROFIT_DATA, STORAGE_KEYS.PRODUCTS_SYNC_TS, STORAGE_KEYS.SALES_SYNC_TS,
        'acknowledgedAlerts','resolvedDiscrepancies','syncQueue','ARCHIVE_ENABLED'
      ];
      for (let i = 0; i < keys.length; i++) {
        try { localStorage.removeItem(keys[i]); } catch (_) {}
      }
      products = serverProducts || [];
      sales = serverSales || [];
      deletedSales = serverDeleted || [];
      expenses = serverExpenses || [];
      purchases = serverPurchases || [];
      dedupeProducts();
      saveToLocalStorage();
      loadProducts();
      loadSales();
      showNotification('Local data cleared and re-synced', 'success');
    } catch (e) {
      showNotification('Failed to clear local data', 'error');
    }
  }
  const safeClearBtn = document.getElementById('safe-clear-storage-btn');
  if (safeClearBtn) safeClearBtn.addEventListener('click', safeClearLocalData);
  
  // Initialize app
  async function init() {
    loadFromLocalStorage();
    loadSyncQueue();
    updateConnectionStatusUI();
    validateDataStructure();
    cleanupDuplicateSales();
    validateSalesData();
    cleanupSyncQueue();
    recoverUnsyncedLocalSales();
    try { reconcileMissingStockReductions(14); } catch (_) {}
    
    // Check for stock alerts on initialization
    checkAndGenerateAlerts();
    try {
      const token = getToken();
      if (token) {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || '{}';
          currentUser = JSON.parse(raw);
        } catch (_) {}
        showApp();
        if (isOnline) {
          try { await refreshAllData(); } catch (_) {}
        }
      } else {
        showLogin();
      }
    } catch (_) { showLogin(); }
    
    showPage('pos');
    
    if (isOnline) {
        checkBackendConnection();
    }

    setInterval(async () => {
        if (!isOnline || !currentUser) return;
        const prevP = lastProductsSyncTs;
        const prevS = lastSalesSyncTs;
        lastProductsSyncTs = normalizeSyncTs(lastProductsSyncTs);
        lastSalesSyncTs = normalizeSyncTs(lastSalesSyncTs);
        try { await DataModule.fetchProductsSince(lastProductsSyncTs, true); } catch (_) {}
        try { await DataModule.fetchSalesSince(lastSalesSyncTs, true); } catch (_) {}
        const changed = lastProductsSyncTs !== prevP || lastSalesSyncTs !== prevS;
        if (changed) {
            if (!isUserBusy()) {
                if (currentPage === 'reports') {
                    try { refreshReportData(true, true); } catch (_) {}
                } else {
                    refreshVisibleData();
                }
            } else {
                pendingRemoteUpdate = true;
            }
        }
    }, 5000);

    // Apply any queued UI refresh when the user is idle
    setInterval(() => {
        if (!pendingRemoteUpdate) return;
        if (!isOnline || !currentUser) return;
        if (isUserBusy()) return;
        pendingRemoteUpdate = false;
        refreshVisibleData();
    }, 2000);
    
    // Infinite scroll for products
    window.addEventListener('scroll', () => {
        const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 200);
        if (nearBottom && isOnline && productsHasMore && !isLoadingProducts) {
            loadMoreProducts();
        }
    });
  
    
  
    // Check stock levels periodically
    setInterval(() => {
        if (currentPage === 'analytics') {
            loadStockAlerts();
        }
    }, 60000); // Check every minute
    
    // Sync deleted sales periodically (every 2 minutes) to reflect deletions across devices
    setInterval(async () => {
        if (isOnline && currentUser) {
            try {
                const newDeletedSales = await DataModule.fetchDeletedSales();
                if (newDeletedSales && newDeletedSales.length > 0) {
                    const newDeletedIds = new Set(newDeletedSales.map(s => s.id || s.receiptNumber || s.receiptnumber));
                    const oldDeletedIds = new Set(deletedSales.map(s => s.id || s.receiptNumber || s.receiptnumber));
                    
                    // Check if there are any new deletions from other devices
                    const hasNewDeletions = newDeletedSales.some(s => !oldDeletedIds.has(s.id || s.receiptNumber || s.receiptnumber));
                    
                    if (hasNewDeletions) {
                        deletedSales = newDeletedSales;
                        sales = sales.filter(s => !newDeletedIds.has(s.id) && !newDeletedIds.has(s.receiptNumber) && !newDeletedIds.has(s.receiptnumber));
                        saveToLocalStorage();
                        
                        // Refresh the current view if showing sales or deleted sales
                        if (currentPage === 'sales' || currentPage === 'deleted-sales') {
                            if (!isUserBusy()) {
                                loadSales();
                            } else {
                                pendingRemoteUpdate = true;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('Error syncing deleted sales:', e);
            }
        }
    }, 2 * 60 * 1000); // Check every 2 minutes
    
    // Check for date rollover every minute to automatically refresh reports at midnight
    let lastCheckedDay = new Date().toDateString();
    setInterval(() => {
        const today = new Date().toDateString();
        if (today !== lastCheckedDay) {
            // Only rollover if user is not busy
            if (!isUserBusy()) {
                lastCheckedDay = today;
                const reportDateEl = document.getElementById('report-date');
                if (reportDateEl) {
                    const newDayStr = new Date().toISOString().split('T')[0];
                    reportDateEl.value = newDayStr;
                    if (currentPage === 'reports') {
                        refreshReportData();
                    }
                }
                // Also refresh sales lists if on those pages
                if (currentPage === 'sales' || currentPage === 'daily-sales') {
                    loadSales();
                }
            }
        }
    }, 60000); // Check every minute

    setInterval(async () => {}, 30 * 60 * 1000);
  }
  
  // Start app
  init();
  
  async function loadMoreProducts() {
    try {
        isLoadingProducts = true;
        const newList = await DataModule.fetchProducts(productsOffset, PRODUCTS_PAGE_SIZE);
        if (Array.isArray(newList) && newList.length > 0) {
            loadProducts();
            if (currentPage === 'inventory') {
                loadInventory();
            }
        }
    } catch (e) {
        console.warn('Load more products failed:', e);
    } finally {
        isLoadingProducts = false;
    }
  }
  
  window.viewSale = viewSale;
  window.deleteSale = deleteSale;
  window.editProduct = editProduct;
  window.deleteProduct = deleteProduct;
  window.filterInventoryByCategory = filterInventoryByCategory;
  window.updateQuantity = updateQuantity;
  window.editExpense = editExpense;

  window.deleteExpense = deleteExpense;
  window.editPurchase = editPurchase;
  window.deletePurchase = deletePurchase;
  window.viewProduct = viewProduct;
  window.acknowledgeAlert = acknowledgeAlert;
  window.resolveDiscrepancy = resolveDiscrepancy;
  window.addEventListener('beforeunload', (e) => {
    try {
      const pending = (syncQueue || []).filter(op => !op.synced).length;
      if (pending > 0) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    } catch (_) {}
  });

"use client";

import { FormEvent, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  expiryDate: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  taxable: boolean;
};

type CartLine = {
  productId: string;
  qty: number;
  discount: number;
};

type Sale = {
  id: string;
  receiptNo: string;
  createdAt: string;
  cashier: string;
  customer: string;
  paymentMethod: string;
  items: Array<CartLine & { name: string; price: number; cost: number; sku: string }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  cogs: number;
  grossProfit: number;
};

type Expense = {
  id: string;
  createdAt: string;
  title: string;
  category: string;
  amount: number;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  balance: number;
};

type Settings = {
  taxRate: number;
  cashier: string;
  userRole: "Admin" | "Cashier";
  currency: string;
  receiptFooter: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type StoreState = {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  customers: Customer[];
  settings: Settings;
};

type SupabaseConfig = {
  url: string;
  anonKey: string;
  publishableKey: string;
};

type SupabaseProduct = Omit<Product, "reorderLevel" | "expiryDate"> & { reorder_level: number; expiry_date?: string | null };
type SupabaseCustomer = Customer;
type SupabaseExpense = Expense;
type SupabaseSale = Omit<Sale, "items">;
type SupabaseSaleItem = CartLine & {
  id: string;
  sale_id: string;
  name: string;
  price: number;
  cost: number;
  sku: string;
};

type AuthSession = {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email?: string;
  };
};

type AppUser = {
  id?: string;
  email: string;
  name?: string | null;
  role: Settings["userRole"];
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const storageKey = "pa-gerrys-mart-pos-v2";
const authStorageKey = "pa-gerrys-mart-auth-v1";
const fallbackSupabaseConfig: SupabaseConfig = {
  url: "https://vxvbwrzlypykidpkewsk.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dmJ3cnpseXB5a2lkcGtld3NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjU5MzgsImV4cCI6MjEwMTYwMTkzOH0.8v5Hu6U6IguiSeAsxagWm5R7q9pASD4r6cLmtIBeOuY",
  publishableKey: "sb_publishable_cMJrQTRIzTitrUJKkupqHg_hBfM7IN1",
};
const productCategories = [
  "Drinks",
  "Provisions",
  "Foodstuffs",
  "Cosmetics",
  "Drugs",
  "Household",
  "Snacks",
  "Bread",
  "Ice Cream / Greek Yoghurt / Parfait",
  "Building Materials",
  "Bottle Drinks",
];
const paymentMethods = ["Cash", "POS Card", "Transfer", "Credit", "Split"];

const initialState: StoreState = {
  products: [],
  sales: [],
  expenses: [],
  customers: [],
  settings: {
    taxRate: 0,
    cashier: "PA GERRY POS",
    userRole: "Admin",
    currency: "NGN",
    receiptFooter: "Thank you for shopping at PA GERRY POS.",
    supabaseUrl: "",
    supabaseAnonKey: "",
  },
};

const emptyProduct = (): Product => ({
  id: `p-${crypto.randomUUID()}`,
  name: "",
  sku: "",
  barcode: "",
  category: productCategories[0],
  unit: "piece",
  expiryDate: "",
  price: 0,
  cost: 0,
  stock: 0,
  reorderLevel: 5,
  taxable: true,
});

const money = (value: number, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const dayKey = (date: string) => new Date(date).toISOString().slice(0, 10);
const inputDate = (date = new Date()) => date.toISOString().slice(0, 10);

const offsetInputDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return inputDate(date);
};

const monthStartInputDate = () => {
  const date = new Date();
  date.setDate(1);
  return inputDate(date);
};

const codePart = (value: string, fallback: string) => {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").trim();
  const code = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 3))
    .join("");
  return code || fallback;
};

function generateSku(product: Product, products: Product[]) {
  const base = `${codePart(product.category, "CAT")}-${codePart(product.name, "ITEM")}`.slice(0, 22);
  let counter = products.length + 1;
  let sku = `${base}-${String(counter).padStart(3, "0")}`;

  while (products.some((item) => item.sku.toUpperCase() === sku.toUpperCase())) {
    counter += 1;
    sku = `${base}-${String(counter).padStart(3, "0")}`;
  }

  return sku;
}

function generateBarcode(products: Product[]) {
  let barcode = "";

  do {
    barcode = `29${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 10)}`;
  } while (products.some((item) => item.barcode === barcode));

  return barcode;
}

const normalizeProduct = (product: Product): Product => ({
  ...product,
  expiryDate: product.expiryDate ?? "",
});

const normalizeStore = (store: StoreState): StoreState => ({
  ...store,
  products: store.products.map(normalizeProduct),
  settings: {
    ...store.settings,
    userRole: store.settings.userRole ?? "Admin",
  },
});

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export default function Home() {
  const [store, setStore] = useState<StoreState>(initialState);
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({
    url: "",
    anonKey: "",
    publishableKey: "",
  });
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [loginDraft, setLoginDraft] = useState({ email: "", password: "" });
  const [loginStatus, setLoginStatus] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Local mode");
  const [localReady, setLocalReady] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventorySearchResetKey, setInventorySearchResetKey] = useState(0);
  const [activeTab, setActiveTab] = useState("register");
  const [selectedCustomer, setSelectedCustomer] = useState("Walk-in Customer");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [editingProduct, setEditingProduct] = useState<Product>(emptyProduct());
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState({ title: "", category: "Operations", amount: 0 });
  const [customerDraft, setCustomerDraft] = useState({ name: "", phone: "" });
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null);
  const [salesReportStart, setSalesReportStart] = useState(inputDate());
  const [salesReportEnd, setSalesReportEnd] = useState(inputDate());
  const [analyticsStart, setAnalyticsStart] = useState(inputDate());
  const [analyticsEnd, setAnalyticsEnd] = useState(inputDate());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef<StoreState>(initialState);
  const syncBusyRef = useRef(false);
  const pendingWriteRef = useRef(false);
  const blockPullUntilRef = useRef(0);
  const hasUnsyncedWritesRef = useRef(false);
  const protectedProductIdsRef = useRef(new Set<string>());
  const deletedProductIdsRef = useRef(new Set<string>());
  const deletedSaleIdsRef = useRef(new Set<string>());

  useEffect(() => {
    queueMicrotask(() => {
      const savedAuth = window.localStorage.getItem(authStorageKey);
      try {
        if (savedAuth) {
          const session = JSON.parse(savedAuth) as AuthSession;
          setAuthSession(session);
          setLoginDraft((current) => ({ ...current, email: session.user.email ?? "" }));
        }
      } catch {
        window.localStorage.removeItem(authStorageKey);
      }
      const saved = window.localStorage.getItem(storageKey);
      try {
        if (saved) {
          setStore(normalizeStore(JSON.parse(saved)));
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
      setLocalReady(true);
    });
  }, []);

  useEffect(() => {
    const applySupabaseConfig = (config: SupabaseConfig) => {
      const nextConfig = {
        url: config.url || fallbackSupabaseConfig.url,
        anonKey: config.anonKey || fallbackSupabaseConfig.anonKey,
        publishableKey: config.publishableKey || fallbackSupabaseConfig.publishableKey,
      };

      setSupabaseConfig(nextConfig);
      if (nextConfig.url && nextConfig.anonKey) {
        setStore((current) => ({
          ...current,
          settings: {
            ...current.settings,
            supabaseUrl: nextConfig.url,
            supabaseAnonKey: "",
          },
        }));
        setSyncStatus("Online backup ready");
      }
    };

    fetch("/api/supabase-config")
      .then((response) => response.json())
      .then(applySupabaseConfig)
      .catch(() => applySupabaseConfig(fallbackSupabaseConfig));
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        void registration.update();
      }).catch(() => undefined);

      let refreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshed) return;
        refreshed = true;
        window.location.reload();
      });
    }

    queueMicrotask(() => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      setIsAppInstalled(standalone || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    });

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsAppInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!localReady) return;
    storeRef.current = store;
    if (storageTimer.current) {
      clearTimeout(storageTimer.current);
    }
    storageTimer.current = setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(storeRef.current));
    }, 350);

    return () => {
      if (storageTimer.current) {
        clearTimeout(storageTimer.current);
      }
    };
  }, [localReady, store]);

  useEffect(() => {
    if (!authSession || !hasSupabase()) return;
    void loadUserProfile(authSession);
  }, [authSession, supabaseConfig.url, supabaseConfig.anonKey]);

  useEffect(() => {
    if (!localReady || !authSession || !hasSupabase()) return;

    const syncWhenOnline = (pushFirst = false) => {
      if (!navigator.onLine) {
        setSyncStatus("Offline changes saved");
        return;
      }
      if (syncBusyRef.current) return;
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
      syncTimer.current = setTimeout(async () => {
        if (userIsEditing()) {
          syncTimer.current = setTimeout(() => syncWhenOnline(false), 2000);
          return;
        }
        syncBusyRef.current = true;
        try {
          if (pushFirst || hasUnsyncedWritesRef.current) {
            await pushLocalToSupabase();
          }
          await loadFromSupabase();
        } finally {
          syncBusyRef.current = false;
        }
      }, 900);
    };

    syncWhenOnline(false);
    const interval = window.setInterval(() => syncWhenOnline(false), 30000);
    const handleOnline = () => syncWhenOnline(true);
    const handleFocus = () => syncWhenOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        syncWhenOnline(false);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
    };
  }, [authSession, localReady, supabaseConfig.url, supabaseConfig.anonKey]);

  function hasSupabase() {
    return Boolean(supabaseConfig.url && supabaseConfig.anonKey);
  }

  function userIsEditing() {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement;
  }

  function markLocalWrite(blockMs = 6000) {
    hasUnsyncedWritesRef.current = true;
    pendingWriteRef.current = true;
    blockPullUntilRef.current = Date.now() + blockMs;
  }

  function protectProducts(productIds: string[]) {
    productIds.forEach((id) => protectedProductIdsRef.current.add(id));
  }

  async function supabaseRequest<T>(path: string, init: RequestInit = {}, accessToken = supabaseConfig.anonKey): Promise<T> {
    if (!hasSupabase()) {
      throw new Error("Supabase is not configured yet.");
    }

    const response = await fetch(`${supabaseConfig.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${accessToken || supabaseConfig.anonKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Supabase request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function loadUserProfile(session: AuthSession) {
    const email = session.user.email?.toLowerCase();
    if (!email) return;

    try {
      const users = await supabaseRequest<AppUser[]>(
        `app_users?select=*&email=eq.${encodeURIComponent(email)}&limit=1`,
        {},
        session.access_token,
      );
      const profile = users[0];
      if (!profile) {
        setStore((current) => ({
          ...current,
          settings: {
            ...current.settings,
            cashier: email,
          },
        }));
        setSyncStatus("User profile not found in Supabase");
        return;
      }
      setStore((current) => ({
        ...current,
        settings: {
          ...current.settings,
          cashier: profile.name || email,
          userRole: profile.role === "Admin" ? "Admin" : "Cashier",
        },
      }));
    } catch (error) {
      setStore((current) => ({
        ...current,
        settings: {
          ...current.settings,
          cashier: email,
        },
      }));
      setSyncStatus(error instanceof Error ? `User role check failed: ${error.message}` : "User role check failed");
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!hasSupabase()) {
      setLoginStatus("Login needs an internet connection the first time.");
      return;
    }

    setLoginBusy(true);
    setLoginStatus("Signing in...");
    try {
      const response = await fetch(`${supabaseConfig.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginDraft.email.trim().toLowerCase(),
          password: loginDraft.password,
        }),
      });

      if (!response.ok) {
        throw new Error("Invalid email or password.");
      }

      const session = (await response.json()) as AuthSession;
      setAuthSession(session);
      window.localStorage.setItem(authStorageKey, JSON.stringify(session));
      setLoginDraft({ email: session.user.email ?? loginDraft.email, password: "" });
      setLoginStatus("");
      await loadUserProfile(session);
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoginBusy(false);
    }
  }

  function signOut() {
    setAuthSession(null);
    window.localStorage.removeItem(authStorageKey);
    setStore((current) => ({
      ...current,
      settings: {
        ...current.settings,
        cashier: "Signed out",
        userRole: "Cashier",
      },
    }));
  }

  async function installApp() {
    if (isAppInstalled) {
      window.alert("PA GERRY POS is already installed on this device.");
      return;
    }

    if (!installPrompt) {
      window.alert("Use your browser menu and choose Install app or Add to home screen.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsAppInstalled(true);
    }
    setInstallPrompt(null);
  }

  const productToRow = (product: Product): SupabaseProduct => {
    const { reorderLevel: _reorderLevel, expiryDate: _expiryDate, ...row } = product;
    return {
      ...row,
      reorder_level: product.reorderLevel,
      expiry_date: product.expiryDate || null,
    };
  };

  const productFromRow = (product: SupabaseProduct): Product => ({
    ...product,
    expiryDate: product.expiry_date ?? "",
    reorderLevel: product.reorder_level,
  });

  async function upsertRows<T>(table: string, rows: T[]) {
    if (!rows.length) return;
    await supabaseRequest(`${table}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows),
    });
  }

  async function loadFromSupabase() {
    if (pendingWriteRef.current || Date.now() < blockPullUntilRef.current) return;
    try {
      const [products, customers, expenses, sales, saleItems] = await Promise.all([
        supabaseRequest<SupabaseProduct[]>("products?select=*&order=name.asc"),
        supabaseRequest<SupabaseCustomer[]>("customers?select=*&order=name.asc"),
        supabaseRequest<SupabaseExpense[]>("expenses?select=*&order=createdAt.desc"),
        supabaseRequest<SupabaseSale[]>("sales?select=*&order=createdAt.desc"),
        supabaseRequest<SupabaseSaleItem[]>("sale_items?select=*"),
      ]);
      const itemsBySale = new Map<string, SupabaseSaleItem[]>();
      saleItems.forEach((item) => {
        const bucket = itemsBySale.get(item.sale_id);
        if (bucket) {
          bucket.push(item);
        } else {
          itemsBySale.set(item.sale_id, [item]);
        }
      });
      const localProductsById = new Map(storeRef.current.products.map((product) => [product.id, product]));
      const mergedProducts = products
        .map(productFromRow)
        .filter((product) => !deletedProductIdsRef.current.has(product.id))
        .map((product) => (
          protectedProductIdsRef.current.has(product.id) && localProductsById.has(product.id)
            ? localProductsById.get(product.id)!
            : product
        ));
      const mergedProductIds = new Set(mergedProducts.map((product) => product.id));
      protectedProductIdsRef.current.forEach((id) => {
        if (!deletedProductIdsRef.current.has(id) && !mergedProductIds.has(id)) {
          const localProduct = localProductsById.get(id);
          if (localProduct) {
            mergedProducts.unshift(localProduct);
            mergedProductIds.add(id);
          }
        }
      });
      const mergedSales = sales
        .filter((sale) => !deletedSaleIdsRef.current.has(sale.id))
        .map((sale) => ({
          ...sale,
          items: (itemsBySale.get(sale.id) ?? [])
            .filter((item) => !deletedSaleIdsRef.current.has(item.sale_id))
            .map(({ sale_id: _saleId, id: _id, ...item }) => item),
        }));
      setStore((current) => {
        const nextData = {
          products: mergedProducts,
          customers,
          expenses,
          sales: mergedSales,
        };

        if (
          sameJson(current.products, nextData.products) &&
          sameJson(current.customers, nextData.customers) &&
          sameJson(current.expenses, nextData.expenses) &&
          sameJson(current.sales, nextData.sales)
        ) {
          return current;
        }

        return {
          ...current,
          ...nextData,
        };
      });
      setSyncStatus("Loaded from Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Supabase load failed: ${error.message}` : "Supabase load failed");
    }
  }

  async function pushLocalToSupabase() {
    try {
      const currentStore = storeRef.current;
      setSyncStatus("Pushing local data...");
      await upsertRows("products", currentStore.products.map(productToRow));
      await upsertRows("customers", currentStore.customers);
      await upsertRows("expenses", currentStore.expenses);
      await upsertRows("sales", currentStore.sales.map(({ items: _items, ...sale }) => sale));
      await upsertRows(
        "sale_items",
        currentStore.sales.flatMap((sale) =>
          sale.items.map((item) => ({
            id: `${sale.id}-${item.productId}`,
            sale_id: sale.id,
            ...item,
          })),
        ),
      );
      hasUnsyncedWritesRef.current = false;
      protectedProductIdsRef.current.clear();
      blockPullUntilRef.current = Math.max(blockPullUntilRef.current, Date.now() + 5000);
      setSyncStatus("Local data pushed to Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Supabase push failed: ${error.message}` : "Supabase push failed");
    }
  }

  async function persistProduct(product: Product) {
    markLocalWrite();
    if (!hasSupabase()) {
      pendingWriteRef.current = false;
      return;
    }
    try {
      await upsertRows("products", [productToRow(product)]);
      protectedProductIdsRef.current.delete(product.id);
      setSyncStatus("Product saved to Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Product saved locally: ${error.message}` : "Product saved locally");
    } finally {
      pendingWriteRef.current = false;
    }
  }

  async function deleteProductFromSupabase(product: Product) {
    markLocalWrite();
    if (!hasSupabase()) {
      pendingWriteRef.current = false;
      return;
    }
    try {
      await supabaseRequest(`products?id=eq.${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      deletedProductIdsRef.current.delete(product.id);
      protectedProductIdsRef.current.delete(product.id);
      setSyncStatus("Product deleted from Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Product deleted locally: ${error.message}` : "Product deleted locally");
    } finally {
      pendingWriteRef.current = false;
    }
  }

  async function persistCustomer(customer: Customer) {
    markLocalWrite();
    if (!hasSupabase()) {
      pendingWriteRef.current = false;
      return;
    }
    try {
      await upsertRows("customers", [customer]);
      setSyncStatus("Customer saved to Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Customer saved locally: ${error.message}` : "Customer saved locally");
    } finally {
      pendingWriteRef.current = false;
    }
  }

  async function persistExpense(expense: Expense) {
    markLocalWrite();
    if (!hasSupabase()) {
      pendingWriteRef.current = false;
      return;
    }
    try {
      await upsertRows("expenses", [expense]);
      setSyncStatus("Expense saved to Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Expense saved locally: ${error.message}` : "Expense saved locally");
    } finally {
      pendingWriteRef.current = false;
    }
  }

  async function persistSale(sale: Sale, productsAfterSale: Product[]) {
    markLocalWrite();
    if (!hasSupabase()) {
      pendingWriteRef.current = false;
      return;
    }
    try {
      const { items, ...saleRow } = sale;
      await upsertRows("sales", [saleRow]);
      await upsertRows(
        "sale_items",
        items.map((item) => ({
          id: `${sale.id}-${item.productId}`,
          sale_id: sale.id,
          ...item,
        })),
      );
      await upsertRows("products", productsAfterSale.map(productToRow));
      productsAfterSale.forEach((product) => protectedProductIdsRef.current.delete(product.id));
      setSyncStatus("Sale saved to Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Sale saved locally: ${error.message}` : "Sale saved locally");
    } finally {
      pendingWriteRef.current = false;
    }
  }

  async function deleteSaleFromSupabase(sale: Sale, productsAfterRefund: Product[]) {
    markLocalWrite();
    if (!hasSupabase()) {
      pendingWriteRef.current = false;
      return;
    }
    try {
      await supabaseRequest(`sales?id=eq.${encodeURIComponent(sale.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await upsertRows("products", productsAfterRefund.map(productToRow));
      deletedSaleIdsRef.current.delete(sale.id);
      productsAfterRefund.forEach((product) => protectedProductIdsRef.current.delete(product.id));
      setSyncStatus("Sale refunded in Supabase");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Refund saved locally: ${error.message}` : "Refund saved locally");
    } finally {
      pendingWriteRef.current = false;
    }
  }

  const productsById = useMemo(
    () => new Map(store.products.map((product) => [product.id, product])),
    [store.products],
  );
  const handleProductSearch = useCallback((value: string) => setQuery(value), []);
  const handleInventorySearch = useCallback((value: string) => setInventorySearch(value), []);
  const deferredQuery = useDeferredValue(query);
  const deferredInventorySearch = useDeferredValue(inventorySearch);

  const searchableProducts = useMemo(() => {
    return store.products.map((product) => {
      const status = product.stock <= product.reorderLevel ? "reorder low stock" : "ok";
      return {
        product,
        searchText: [
          product.name,
          product.sku,
          product.barcode,
          product.category,
          product.unit,
          product.expiryDate,
          status,
        ].join(" ").toLowerCase(),
      };
    });
  }, [store.products]);

  const visibleProducts = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return store.products;
    return searchableProducts
      .filter(({ searchText }) => searchText.includes(needle))
      .map(({ product }) => product);
  }, [deferredQuery, searchableProducts, store.products]);

  const cartTotals = useMemo(() => {
    return cart.reduce(
      (totals, line) => {
        const product = productsById.get(line.productId);
        if (!product) return totals;
        const lineSubtotal = product.price * line.qty;
        const lineDiscount = Math.min(line.discount, lineSubtotal);
        return {
          subtotal: totals.subtotal + lineSubtotal,
          lineDiscounts: totals.lineDiscounts + lineDiscount,
          cogs: totals.cogs + product.cost * line.qty,
        };
      },
      { subtotal: 0, lineDiscounts: 0, cogs: 0 },
    );
  }, [cart, productsById]);

  const totalDiscount = Math.min(saleDiscount + cartTotals.lineDiscounts, cartTotals.subtotal);
  const grandTotal = Math.max(0, cartTotals.subtotal - totalDiscount);
  const grossProfit = grandTotal - cartTotals.cogs;

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = store.sales.filter((sale) => dayKey(sale.createdAt) === today);
    const todayExpenses = store.expenses.filter((expense) => dayKey(expense.createdAt) === today);
    const revenue = store.sales.reduce((sum, sale) => sum + sale.total, 0);
    const cogs = store.sales.reduce((sum, sale) => sum + sale.cogs, 0);
    const expenses = store.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const lowStock = store.products.filter((product) => product.stock <= product.reorderLevel);
    const netProfit = revenue - cogs - expenses;
    return {
      todayRevenue: todaySales.reduce((sum, sale) => sum + sale.total, 0),
      todayProfit: todaySales.reduce((sum, sale) => sum + sale.grossProfit, 0),
      todayExpenses: todayExpenses.reduce((sum, expense) => sum + expense.amount, 0),
      revenue,
      cogs,
      expenses,
      grossProfit: revenue - cogs,
      netProfit,
      saleCount: store.sales.length,
      expenseCount: store.expenses.length,
      averageSale: store.sales.length ? revenue / store.sales.length : 0,
      productCount: store.products.length,
      outOfStock: store.products.filter((product) => product.stock <= 0),
      inventoryValue: store.products.reduce((sum, product) => sum + product.cost * product.stock, 0),
      inventorySellingValue: store.products.reduce((sum, product) => sum + product.price * product.stock, 0),
      lowStock,
      profitStatus: netProfit >= 0 ? "Profit" : "Loss",
    };
  }, [store]);

  const filteredInventoryProducts = useMemo(() => {
    const search = deferredInventorySearch.trim().toLowerCase();
    if (!search) return store.products;

    return searchableProducts
      .filter(({ searchText }) => searchText.includes(search))
      .map(({ product }) => product);
  }, [deferredInventorySearch, searchableProducts, store.products]);

  const filteredSales = useMemo(() => {
    if (activeTab !== "sales") return [];
    return store.sales.filter((sale) => {
      const saleDate = dayKey(sale.createdAt);
      const afterStart = salesReportStart ? saleDate >= salesReportStart : true;
      const beforeEnd = salesReportEnd ? saleDate <= salesReportEnd : true;
      return afterStart && beforeEnd;
    });
  }, [activeTab, salesReportEnd, salesReportStart, store.sales]);

  const salesReportTotals = useMemo(() => {
    if (activeTab !== "sales") {
      return { salesTotal: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0 };
    }
    const salesTotal = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const cogs = filteredSales.reduce((sum, sale) => sum + sale.cogs, 0);
    const grossProfit = filteredSales.reduce((sum, sale) => sum + sale.grossProfit, 0);
    const expenses = store.expenses.reduce((sum, expense) => {
      const expenseDate = dayKey(expense.createdAt);
      const afterStart = salesReportStart ? expenseDate >= salesReportStart : true;
      const beforeEnd = salesReportEnd ? expenseDate <= salesReportEnd : true;
      return afterStart && beforeEnd ? sum + expense.amount : sum;
    }, 0);

    return {
      salesTotal,
      cogs,
      grossProfit,
      expenses,
      netProfit: grossProfit - expenses,
    };
  }, [activeTab, filteredSales, salesReportEnd, salesReportStart, store.expenses]);

  const paymentBreakdown = useMemo(() => {
    if (activeTab !== "sales") {
      return paymentMethods.map((method) => ({ method, count: 0, total: 0 }));
    }
    return paymentMethods.map((method) => {
      const methodSales = filteredSales.filter((sale) => sale.paymentMethod === method);
      return {
        method,
        count: methodSales.length,
        total: methodSales.reduce((sum, sale) => sum + sale.total, 0),
      };
    });
  }, [activeTab, filteredSales]);

  const analyticsSales = useMemo(() => {
    if (activeTab !== "analytics") return [];
    return store.sales.filter((sale) => {
      const saleDate = dayKey(sale.createdAt);
      const afterStart = analyticsStart ? saleDate >= analyticsStart : true;
      const beforeEnd = analyticsEnd ? saleDate <= analyticsEnd : true;
      return afterStart && beforeEnd;
    });
  }, [activeTab, analyticsEnd, analyticsStart, store.sales]);

  const analyticsExpenses = useMemo(() => {
    if (activeTab !== "analytics") return [];
    return store.expenses.filter((expense) => {
      const expenseDate = dayKey(expense.createdAt);
      const afterStart = analyticsStart ? expenseDate >= analyticsStart : true;
      const beforeEnd = analyticsEnd ? expenseDate <= analyticsEnd : true;
      return afterStart && beforeEnd;
    });
  }, [activeTab, analyticsEnd, analyticsStart, store.expenses]);

  const analyticsTotals = useMemo(() => {
    if (activeTab !== "analytics") {
      return { salesTotal: 0, cogs: 0, grossProfit: 0, expenses: 0, netResult: 0, profit: 0, loss: 0, saleCount: 0, expenseCount: 0, averageSale: 0 };
    }
    const salesTotal = analyticsSales.reduce((sum, sale) => sum + sale.total, 0);
    const cogs = analyticsSales.reduce((sum, sale) => sum + sale.cogs, 0);
    const grossProfit = analyticsSales.reduce((sum, sale) => sum + sale.grossProfit, 0);
    const expenses = analyticsExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const netResult = grossProfit - expenses;

    return {
      salesTotal,
      cogs,
      grossProfit,
      expenses,
      netResult,
      profit: Math.max(0, netResult),
      loss: Math.max(0, -netResult),
      saleCount: analyticsSales.length,
      expenseCount: analyticsExpenses.length,
      averageSale: analyticsSales.length ? salesTotal / analyticsSales.length : 0,
    };
  }, [activeTab, analyticsExpenses, analyticsSales]);

  const analyticsPaymentBreakdown = useMemo(() => {
    if (activeTab !== "analytics") {
      return paymentMethods.map((method) => ({ method, count: 0, total: 0 }));
    }
    return paymentMethods.map((method) => {
      const methodSales = analyticsSales.filter((sale) => sale.paymentMethod === method);
      return {
        method,
        count: methodSales.length,
        total: methodSales.reduce((sum, sale) => sum + sale.total, 0),
      };
    });
  }, [activeTab, analyticsSales]);

  const recentActivity = useMemo(() => {
    if (activeTab !== "analytics") return [];
    const sales = analyticsSales.map((sale) => ({
      id: sale.id,
      date: sale.createdAt,
      activity: `Sale ${sale.receiptNo}`,
      category: sale.paymentMethod,
      amount: sale.total,
    }));
    const expenses = analyticsExpenses.map((expense) => ({
      id: expense.id,
      date: expense.createdAt,
      activity: expense.title,
      category: expense.category,
      amount: -expense.amount,
    }));
    return [...sales, ...expenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [activeTab, analyticsExpenses, analyticsSales]);

  function setSalesReportPeriod(start: string, end: string) {
    setSalesReportStart(start);
    setSalesReportEnd(end);
  }

  function setAnalyticsPeriod(start: string, end: string) {
    setAnalyticsStart(start);
    setAnalyticsEnd(end);
  }

  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, qty: Math.min(product.stock, line.qty + 1) }
            : line,
        );
      }
      return [...current, { productId: product.id, qty: 1, discount: 0 }];
    });
  }, []);

  function updateCartLine(productId: string, field: "qty" | "discount", value: number) {
    const product = productsById.get(productId);
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const maxQty = product?.stock ?? line.qty;
          const nextQty = field === "qty" ? Math.max(1, Math.min(maxQty, value)) : line.qty;
          const nextDiscount = field === "discount" ? Math.max(0, value) : line.discount;
          return { ...line, qty: nextQty, discount: nextDiscount };
        })
        .filter((line) => line.qty > 0),
    );
  }

  function completeSale() {
    if (!cart.length) return;
    markLocalWrite();
    protectProducts(cart.map((line) => line.productId));
    const currentStore = storeRef.current;
    const productsAfterSale = currentStore.products.map((product) => {
      const line = cart.find((item) => item.productId === product.id);
      return line ? { ...product, stock: Math.max(0, product.stock - line.qty) } : product;
    });
    const sale: Sale = {
      id: `s-${crypto.randomUUID()}`,
      receiptNo: `PGM-${String(currentStore.sales.length + 1).padStart(5, "0")}`,
      createdAt: new Date().toISOString(),
      cashier: currentStore.settings.cashier,
      customer: selectedCustomer,
      paymentMethod,
      items: cart.map((line) => {
        const product = productsById.get(line.productId)!;
        return { ...line, name: product.name, price: product.price, cost: product.cost, sku: product.sku };
      }),
      subtotal: cartTotals.subtotal,
      discount: totalDiscount,
      tax: 0,
      total: grandTotal,
      cogs: cartTotals.cogs,
      grossProfit,
    };
    const nextStore = {
      ...currentStore,
      sales: [sale, ...currentStore.sales],
      products: productsAfterSale,
    };
    storeRef.current = nextStore;
    setStore(nextStore);
    void persistSale(sale, productsAfterSale);
    setLastReceipt(sale);
    setCart([]);
    setSaleDiscount(0);
  }

  function refundSale(sale: Sale) {
    markLocalWrite();
    protectProducts(sale.items.map((line) => line.productId));
    deletedSaleIdsRef.current.add(sale.id);
    const currentStore = storeRef.current;
    const productsAfterRefund = currentStore.products.map((product) => {
      const line = sale.items.find((item) => item.productId === product.id);
      return line ? { ...product, stock: product.stock + line.qty } : product;
    });
    const nextStore = {
      ...currentStore,
      sales: currentStore.sales.filter((item) => item.id !== sale.id),
      products: productsAfterRefund,
    };
    storeRef.current = nextStore;
    setStore(nextStore);
    void deleteSaleFromSupabase(sale, productsAfterRefund);
  }

  const productFormExists = useMemo(
    () => store.products.some((product) => product.id === editingProduct.id),
    [editingProduct.id, store.products],
  );

  function saveProduct(productDraft: Product) {
    const otherProducts = store.products.filter((item) => item.id !== productDraft.id);
    const product = {
      ...productDraft,
      name: productDraft.name.trim(),
      sku: productDraft.sku.trim(),
      barcode: productDraft.barcode.trim(),
    };
    if (!product.name) return;
    if (!product.sku) product.sku = generateSku(product, otherProducts);
    if (!product.barcode) product.barcode = generateBarcode(otherProducts);
    markLocalWrite();
    protectProducts([product.id]);
    const currentStore = storeRef.current;
    const exists = currentStore.products.some((item) => item.id === product.id);
    const nextStore = {
      ...currentStore,
      products: exists
        ? currentStore.products.map((item) => (item.id === product.id ? product : item))
        : [product, ...currentStore.products],
    };
    storeRef.current = nextStore;
    setStore(nextStore);
    void persistProduct(product);
    setEditingProduct(emptyProduct());
    setIsProductFormOpen(false);
  }

  function deleteProduct(product: Product) {
    markLocalWrite();
    deletedProductIdsRef.current.add(product.id);
    protectedProductIdsRef.current.delete(product.id);
    const currentStore = storeRef.current;
    const nextStore = {
      ...currentStore,
      products: currentStore.products.filter((item) => item.id !== product.id),
    };
    storeRef.current = nextStore;
    setStore(nextStore);
    if (editingProduct.id === product.id) {
      setEditingProduct(emptyProduct());
      setIsProductFormOpen(false);
    }
    void deleteProductFromSupabase(product);
  }

  function addExpense(event: FormEvent) {
    event.preventDefault();
    if (!expenseDraft.title.trim() || expenseDraft.amount <= 0) return;
    const expense: Expense = {
      id: `e-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      title: expenseDraft.title,
      category: expenseDraft.category,
      amount: expenseDraft.amount,
    };
    setStore((current) => ({
      ...current,
      expenses: [expense, ...current.expenses],
    }));
    void persistExpense(expense);
    setExpenseDraft({ title: "", category: "Operations", amount: 0 });
  }

  function addCustomer(event: FormEvent) {
    event.preventDefault();
    if (!customerDraft.name.trim()) return;
    const customer: Customer = { id: `c-${crypto.randomUUID()}`, ...customerDraft, balance: 0 };
    setStore((current) => ({
      ...current,
      customers: [customer, ...current.customers],
    }));
    void persistCustomer(customer);
    setCustomerDraft({ name: "", phone: "" });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pa-gerrys-mart-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = JSON.parse(String(reader.result)) as StoreState;
      setStore(parsed);
    };
    reader.readAsText(file);
  }

  const tabs = [
    { key: "register", label: "Point of Sale", note: "Sell items", icon: "POS" },
    { key: "inventory", label: "Inventory", note: "Products and stock", icon: "INV" },
    { key: "sales", label: "Sales Reports", note: "Receipts and refunds", icon: "REP" },
    { key: "reports", label: "Stock Check", note: "Profit and stock", icon: "STK" },
    { key: "expenses", label: "Expenses", note: "Running costs", icon: "EXP" },
    { key: "customers", label: "Customers", note: "Names and balances", icon: "CUS" },
    { key: "analytics", label: "Analytics", note: "Sales and activity", icon: "ANL" },
  ];
  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const isAdmin = store.settings.userRole === "Admin";

  if (!authSession) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={signIn}>
          <div className="logo login-logo">
            <h1>PA GERRY POS</h1>
            <p>Secure POS Login</p>
          </div>
          <label>
            Email
            <input
              className="input"
              type="email"
              value={loginDraft.email}
              onChange={(event) => setLoginDraft({ ...loginDraft, email: event.target.value })}
              placeholder="name@example.com"
              required
            />
          </label>
          <label>
            Password
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={loginDraft.password}
              onChange={(event) => setLoginDraft({ ...loginDraft, password: event.target.value })}
              placeholder="Password"
              required
            />
          </label>
          {loginStatus && <p className="login-status">{loginStatus}</p>}
          <button className="primary-button" disabled={loginBusy}>
            {loginBusy ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <>
    <main className={`pos-app ${lastReceipt ? "receipt-open" : ""}`}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="logo">
            <h1>PA GERRY POS</h1>
            <p>Supermarket POS</p>
          </div>
          <nav className="app-nav">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="nav-icon">{tab.icon}</span>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <div className="main-content">
          <header className="app-header">
            <h2>{activeTabMeta.label}</h2>
            <div className="user-info">
              <div className={`connection-status ${hasSupabase() ? "online" : "offline"}`}>
                <span className="status-dot" />
                <span>{hasSupabase() ? "Online" : "Local"}</span>
              </div>
              <div className="user-icon">PG</div>
              <span>{store.settings.cashier}</span>
              <span className="user-role">{store.settings.userRole}</span>
              <button className="install-button" onClick={installApp}>
                {isAppInstalled ? "Installed" : "Install App"}
              </button>
              <button className="table-action" onClick={signOut}>Sign Out</button>
            </div>
          </header>

        {activeTab === "register" && (
          <section className="pos-container">
            <div className="products-section">
              <div className="section-header">
                <h3>Products</h3>
                {isAdmin && (
                  <button
                    className="primary-button compact"
                    onClick={() => {
                      setEditingProduct(emptyProduct());
                      setActiveTab("inventory");
                    }}
                  >
                    Add Product
                  </button>
                )}
              </div>
              <div className="toolbar">
                <SearchField
                  ariaLabel="Search products"
                  className="input"
                  placeholder="Search item, SKU, barcode, or category"
                  initialValue={query}
                  onSearch={handleProductSearch}
                />
                <button
                  className="secondary-button"
                  onClick={() => {
                    const exact = store.products.find((product) => product.barcode === query.trim());
                    if (exact) addToCart(exact);
                  }}
                >
                  Scan
                </button>
              </div>
              <div className="product-grid">
                {visibleProducts.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    currency={store.settings.currency}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            </div>

            <aside className="cart-section">
              <div className="panel-heading">
                <div>
                  <h3>Current Sale</h3>
                  <p>{cart.length} item lines</p>
                </div>
                <button className="icon-button" onClick={() => setCart([])} title="Clear cart">Clear</button>
              </div>

              <div className="cart-lines">
                {cart.length === 0 && <p className="empty">Add products to begin a sale.</p>}
                {cart.map((line) => {
                  const product = productsById.get(line.productId);
                  if (!product) return null;
                  return (
                    <div className="cart-line" key={line.productId}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{money(product.price, store.settings.currency)} each</span>
                      </div>
                      <input
                        aria-label={`Quantity for ${product.name}`}
                        type="number"
                        min="1"
                        max={product.stock}
                        value={line.qty}
                        onChange={(event) => updateCartLine(line.productId, "qty", Number(event.target.value))}
                      />
                      <input
                        aria-label={`Discount for ${product.name}`}
                        type="number"
                        min="0"
                        value={line.discount}
                        onChange={(event) => updateCartLine(line.productId, "discount", Number(event.target.value))}
                      />
                      <button className="remove" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}>
                        x
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="checkout-fields">
                <label>
                  Customer
                  <select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
                    {store.customers.map((customer) => (
                      <option key={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Payment
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option>Cash</option>
                    <option>Transfer</option>
                    <option>POS Card</option>
                    <option>Credit</option>
                    <option>Split</option>
                  </select>
                </label>
                <label>
                  Sale discount
                  <input type="number" min="0" value={saleDiscount} onChange={(event) => setSaleDiscount(Number(event.target.value))} />
                </label>
              </div>

              <Totals
                currency={store.settings.currency}
                subtotal={cartTotals.subtotal}
                discount={totalDiscount}
                cogs={cartTotals.cogs}
                grossProfit={grossProfit}
                showProfit={isAdmin}
                total={grandTotal}
              />
              <button className="primary-button" disabled={!cart.length} onClick={completeSale}>
                Complete Sale
              </button>
            </aside>
          </section>
        )}

        {activeTab === "inventory" && (
          <section className="inventory-page">
            <div className="inventory-toolbar">
              <div className="inventory-search-area">
                <label className="inventory-search-column">
                  <span>Search Products</span>
                  <SearchField
                    key={inventorySearchResetKey}
                    ariaLabel="Search inventory products"
                    className="input inventory-search"
                    placeholder="Name, category, SKU, barcode, expiry..."
                    initialValue={inventorySearch}
                    onSearch={handleInventorySearch}
                  />
                </label>
                {inventorySearch && (
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() => {
                      setInventorySearch("");
                      setInventorySearchResetKey((current) => current + 1);
                    }}
                  >
                    Clear
                  </button>
                )}
                <strong>{filteredInventoryProducts.length} products</strong>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="inventory-add-button"
                  onClick={() => {
                    setEditingProduct(emptyProduct());
                    setIsProductFormOpen(true);
                  }}
                  aria-label="Add product"
                  title="Add product"
                >
                  +
                </button>
              )}
            </div>
            {isAdmin && (
              <div className="inventory-value-bar">
                <span>
                  <b>Total Cost Value</b>
                  {money(metrics.inventoryValue, store.settings.currency)}
                </span>
                <span>
                  <b>Total Selling Value</b>
                  {money(metrics.inventorySellingValue, store.settings.currency)}
                </span>
                <span>
                  <b>Potential Profit</b>
                  {money(metrics.inventorySellingValue - metrics.inventoryValue, store.settings.currency)}
                </span>
              </div>
            )}
            <div className="inventory-workspace">
              <div className="inventory-list" aria-label="Inventory products">
                {filteredInventoryProducts.length === 0 && <p className="empty inventory-empty">No products found.</p>}
                {filteredInventoryProducts.map((product) => {
                  const stockStatus = product.stock <= product.reorderLevel ? "Reorder" : "OK";
                  return (
                    <article className="inventory-row" key={product.id}>
                      <div className="inventory-product-main">
                        <strong>{product.name}</strong>
                        <span>{product.category}</span>
                        <small>SKU: {product.sku || "-"} | Barcode: {product.barcode || "-"}</small>
                      </div>
                      <div className="inventory-product-facts">
                        <span><b>Stock</b>{product.stock} {product.unit}</span>
                        <span><b>Status</b>{stockStatus}</span>
                        <span><b>Price</b>{money(product.price, store.settings.currency)}</span>
                        <span><b>Expiry</b>{product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : "-"}</span>
                        {isAdmin && <span><b>Value</b>{money(product.price * product.stock, store.settings.currency)}</span>}
                      </div>
                      {isAdmin && (
                        <div className="inventory-row-actions">
                          <button className="table-action" onClick={() => {
                            setEditingProduct(product);
                            setIsProductFormOpen(true);
                          }}>Edit</button>
                          <button className="table-action danger" onClick={() => deleteProduct(product)}>Delete</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
            {isAdmin && isProductFormOpen && (
              <ProductForm
                key={editingProduct.id}
                initialProduct={editingProduct}
                isExisting={productFormExists}
                onClose={() => setIsProductFormOpen(false)}
                onSave={saveProduct}
              />
            )}
          </section>
        )}

        {activeTab === "sales" && (
          <section className="sales-report-page">
            <div className="report-filter-panel">
              <div className="panel-heading">
                <div>
                  <h2>Sales Reports</h2>
                  <p>Select any day or period to view receipts and profit.</p>
                </div>
                <strong>{filteredSales.length} receipts</strong>
              </div>
              <div className="period-actions" aria-label="Sales report quick periods">
                <button type="button" className="secondary-button compact" onClick={() => setSalesReportPeriod(inputDate(), inputDate())}>Today</button>
                <button type="button" className="secondary-button compact" onClick={() => setSalesReportPeriod(offsetInputDate(-1), offsetInputDate(-1))}>Yesterday</button>
                <button type="button" className="secondary-button compact" onClick={() => setSalesReportPeriod(offsetInputDate(-6), inputDate())}>Last 7 Days</button>
                <button type="button" className="secondary-button compact" onClick={() => setSalesReportPeriod(monthStartInputDate(), inputDate())}>This Month</button>
                <button type="button" className="secondary-button compact" onClick={() => setSalesReportPeriod("", "")}>All</button>
              </div>
              <div className="report-date-grid">
                <label>
                  Start date
                  <input className="input" type="date" value={salesReportStart} onChange={(event) => setSalesReportStart(event.target.value)} />
                </label>
                <label>
                  End date
                  <input className="input" type="date" value={salesReportEnd} onChange={(event) => setSalesReportEnd(event.target.value)} />
                </label>
              </div>
            </div>
            <div className="report-summary-bar">
              <span><b>Sales</b>{money(salesReportTotals.salesTotal, store.settings.currency)}</span>
              {isAdmin && <span><b>Cost</b>{money(salesReportTotals.cogs, store.settings.currency)}</span>}
              {isAdmin && <span><b>Gross Profit</b>{money(salesReportTotals.grossProfit, store.settings.currency)}</span>}
              {isAdmin && <span><b>Expenses</b>{money(salesReportTotals.expenses, store.settings.currency)}</span>}
              {isAdmin && <span><b>Net Profit</b>{money(salesReportTotals.netProfit, store.settings.currency)}</span>}
              {paymentBreakdown.map((payment) => (
                <span
                  key={payment.method}
                >
                  <b>{payment.method === "POS Card" ? "POS" : payment.method} ({payment.count})</b>
                  {money(payment.total, store.settings.currency)}
                </span>
              ))}
            </div>
            <DataTable
              title="Sales History"
              headers={isAdmin ? ["Receipt", "Time", "Customer", "Payment", "Total", "Profit", "Action"] : ["Receipt", "Time", "Customer", "Payment", "Total", "Action"]}
              rows={filteredSales.map((sale) => [
                sale.receiptNo,
                new Date(sale.createdAt).toLocaleString(),
                sale.customer,
                sale.paymentMethod,
                money(sale.total, store.settings.currency),
                ...(isAdmin ? [
                  money(sale.grossProfit, store.settings.currency),
                  <div className="table-actions" key={sale.id}>
                    <button className="table-action view-sale-action" onClick={() => setLastReceipt(sale)} aria-label={`View sale ${sale.receiptNo}`} title="View sale details">
                      <EyeIcon />
                      <span>View</span>
                    </button>
                    <button
                      className="table-action danger"
                      onClick={() => {
                        if (window.confirm(`Delete sale ${sale.receiptNo}? This will restore the sold stock.`)) {
                          refundSale(sale);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>,
                ] : [
                  <button key={sale.id} className="table-action view-sale-action" onClick={() => setLastReceipt(sale)} aria-label={`View sale ${sale.receiptNo}`} title="View sale details">
                    <EyeIcon />
                    <span>View</span>
                  </button>,
                ]),
              ])}
            />
          </section>
        )}

        {activeTab === "expenses" && (
          <section className="grid gap-4 py-4 lg:grid-cols-[360px_1fr]">
            <form className="form-panel" onSubmit={addExpense}>
              <h2>Add Expense</h2>
              <input className="input" placeholder="Expense title" value={expenseDraft.title} onChange={(event) => setExpenseDraft({ ...expenseDraft, title: event.target.value })} />
              <input className="input" placeholder="Category" value={expenseDraft.category} onChange={(event) => setExpenseDraft({ ...expenseDraft, category: event.target.value })} />
              <NumberField label="Amount" value={expenseDraft.amount} onChange={(value) => setExpenseDraft({ ...expenseDraft, amount: value })} />
              <button className="primary-button">Record Expense</button>
            </form>
            <DataTable
              title="Expenses"
              headers={["Date", "Title", "Category", "Amount"]}
              rows={store.expenses.map((expense) => [
                new Date(expense.createdAt).toLocaleDateString(),
                expense.title,
                expense.category,
                money(expense.amount, store.settings.currency),
              ])}
            />
          </section>
        )}

        {activeTab === "customers" && (
          <section className="grid gap-4 py-4 lg:grid-cols-[360px_1fr]">
            <form className="form-panel" onSubmit={addCustomer}>
              <h2>Add Customer</h2>
              <input className="input" placeholder="Customer name" value={customerDraft.name} onChange={(event) => setCustomerDraft({ ...customerDraft, name: event.target.value })} />
              <input className="input" placeholder="Phone number" value={customerDraft.phone} onChange={(event) => setCustomerDraft({ ...customerDraft, phone: event.target.value })} />
              <button className="primary-button">Save Customer</button>
            </form>
            <DataTable
              title="Customers"
              headers={["Name", "Phone", "Balance"]}
              rows={store.customers.map((customer) => [customer.name, customer.phone || "-", money(customer.balance, store.settings.currency)])}
            />
          </section>
        )}

        {activeTab === "reports" && (
          <section className="space-y-4 py-4">
            <div className="report-grid">
              <Metric label="Revenue" value={money(metrics.revenue, store.settings.currency)} />
              {isAdmin && <Metric label="Cost of goods" value={money(metrics.cogs, store.settings.currency)} />}
              {isAdmin && <Metric label="Gross profit" value={money(metrics.grossProfit, store.settings.currency)} />}
              {isAdmin && <Metric label="Expenses" value={money(metrics.expenses, store.settings.currency)} />}
              {isAdmin && <Metric label="Net profit" value={money(metrics.netProfit, store.settings.currency)} />}
              {isAdmin && <Metric label="Inventory Cost Value" value={money(metrics.inventoryValue, store.settings.currency)} />}
              {isAdmin && <Metric label="Inventory Selling Value" value={money(metrics.inventorySellingValue, store.settings.currency)} />}
            </div>
            <div className="settings-band">
              <button className="primary-button" onClick={exportData}>Export Backup</button>
              <label className="file-button">
                Import Backup
                <input type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} />
              </label>
              <button className="secondary-button" onClick={() => window.print()}>Print Report</button>
            </div>
            <DataTable
              title="Low Stock"
              headers={["Item", "Current Stock", "Reorder At", "Category"]}
              rows={metrics.lowStock.map((product) => [product.name, `${product.stock} ${product.unit}`, product.reorderLevel, product.category])}
            />
          </section>
        )}

        {activeTab === "analytics" && (
          <section className="analytics-page">
            <div className="report-filter-panel">
              <div className="panel-heading">
                <div>
                  <h2>Analytics</h2>
                  <p>Analyze sales, expenses, activities, profit, and loss for any day or period.</p>
                </div>
                <strong>{analyticsTotals.saleCount} sales</strong>
              </div>
              <div className="period-actions" aria-label="Analytics quick periods">
                <button type="button" className="secondary-button compact" onClick={() => setAnalyticsPeriod(inputDate(), inputDate())}>Today</button>
                <button type="button" className="secondary-button compact" onClick={() => setAnalyticsPeriod(offsetInputDate(-1), offsetInputDate(-1))}>Yesterday</button>
                <button type="button" className="secondary-button compact" onClick={() => setAnalyticsPeriod(offsetInputDate(-6), inputDate())}>Last 7 Days</button>
                <button type="button" className="secondary-button compact" onClick={() => setAnalyticsPeriod(monthStartInputDate(), inputDate())}>This Month</button>
                <button type="button" className="secondary-button compact" onClick={() => setAnalyticsPeriod("", "")}>All</button>
              </div>
              <div className="report-date-grid">
                <label>
                  Start date
                  <input className="input" type="date" value={analyticsStart} onChange={(event) => setAnalyticsStart(event.target.value)} />
                </label>
                <label>
                  End date
                  <input className="input" type="date" value={analyticsEnd} onChange={(event) => setAnalyticsEnd(event.target.value)} />
                </label>
              </div>
            </div>
            <div className="report-grid compact-report-grid">
              <Metric label="Sales" value={money(analyticsTotals.salesTotal, store.settings.currency)} />
              <Metric label="Profit" value={money(analyticsTotals.profit, store.settings.currency)} />
              <Metric label="Loss" value={money(analyticsTotals.loss, store.settings.currency)} />
              <Metric label="Expenses" value={money(analyticsTotals.expenses, store.settings.currency)} />
              <Metric label="Average Sale" value={money(analyticsTotals.averageSale, store.settings.currency)} />
              <Metric label="Transactions" value={String(analyticsTotals.saleCount)} />
              <Metric label="Low Stock" value={String(metrics.lowStock.length)} />
            </div>
            <div className="analytics-grid">
              <DataTable
                title="Payment Analysis"
                headers={["Payment", "Sales Count", "Amount"]}
                rows={analyticsPaymentBreakdown.map((payment) => [
                  payment.method === "POS Card" ? "POS" : payment.method,
                  payment.count,
                  money(payment.total, store.settings.currency),
                ])}
              />
              <DataTable
                title="Profit and Loss"
                headers={["Sales", "Cost", "Expenses", "Profit", "Loss", "Net Result"]}
                rows={[[
                  money(analyticsTotals.salesTotal, store.settings.currency),
                  money(analyticsTotals.cogs, store.settings.currency),
                  money(analyticsTotals.expenses, store.settings.currency),
                  money(analyticsTotals.profit, store.settings.currency),
                  money(analyticsTotals.loss, store.settings.currency),
                  money(analyticsTotals.netResult, store.settings.currency),
                ]]}
              />
              <DataTable
                title="Recent Activity"
                headers={["Date", "Activity", "Type", "Amount"]}
                rows={recentActivity.map((activity) => [
                  new Date(activity.date).toLocaleString(),
                  activity.activity,
                  activity.category,
                  money(activity.amount, store.settings.currency),
                ])}
              />
              <DataTable
                title="Stock Alerts"
                headers={["Item", "Category", "Current Stock", "Reorder At", "Status"]}
                rows={metrics.lowStock.map((product) => [
                  product.name,
                  product.category,
                  `${product.stock} ${product.unit}`,
                  product.reorderLevel,
                  product.stock <= 0 ? "Out of stock" : "Low stock",
                ])}
              />
            </div>
          </section>
        )}
        </div>
      </div>
    </main>
    {lastReceipt && (
      <div className="receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div className="receipt-card">
          <div className="receipt-actions">
            <div>
              <h2 id="receipt-title">Sale Details</h2>
              <p>{lastReceipt.receiptNo}</p>
            </div>
            <button className="icon-button" onClick={() => setLastReceipt(null)} title="Close receipt">x</button>
          </div>
          <div className="sale-detail-summary" aria-label="Selected sale summary">
            <span><b>Total</b>{money(lastReceipt.total, store.settings.currency)}</span>
            <span><b>Items</b>{lastReceipt.items.reduce((sum, item) => sum + item.qty, 0)}</span>
            <span><b>Payment</b>{lastReceipt.paymentMethod}</span>
          </div>
          <Receipt sale={lastReceipt} footer={store.settings.receiptFooter} currency={store.settings.currency} showProfit={isAdmin} />
          <div className="receipt-actions bottom">
            <button className="secondary-button" onClick={() => setLastReceipt(null)}>Close</button>
            <button className="primary-button compact" onClick={() => window.print()}>Print Receipt</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function EyeIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const ProductTile = memo(function ProductTile({
  product,
  currency,
  onAdd,
}: {
  product: Product;
  currency: string;
  onAdd: (product: Product) => void;
}) {
  return (
    <button
      className="product-tile"
      onClick={() => onAdd(product)}
      disabled={product.stock <= 0}
    >
      <span className="category-chip">{product.category}</span>
      <strong>{product.name}</strong>
      <span>{product.sku || product.barcode}</span>
      <span className="tile-row">
        <b>{money(product.price, currency)}</b>
        <em>{product.stock} {product.unit}</em>
      </span>
    </button>
  );
});

const ProductForm = memo(function ProductForm({
  initialProduct,
  isExisting,
  onClose,
  onSave,
}: {
  initialProduct: Product;
  isExisting: boolean;
  onClose: () => void;
  onSave: (product: Product) => void;
}) {
  const [draft, setDraft] = useState(initialProduct);

  const updateDraft = useCallback((updates: Partial<Product>) => {
    setDraft((current) => ({ ...current, ...updates }));
  }, []);

  return (
    <div className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
      <form
        className="form-panel product-dashboard"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <div className="product-dashboard-header">
          <div>
            <h2 id="product-form-title">{isExisting ? "Edit Product" : "Add Product"}</h2>
            <p>Product dashboard</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Close product form">x</button>
        </div>
        <input className="input" placeholder="Product name" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
        <div className="two-col">
          <input className="input" placeholder="SKU" value={draft.sku} onChange={(event) => updateDraft({ sku: event.target.value })} />
          <input className="input" placeholder="Barcode" value={draft.barcode} onChange={(event) => updateDraft({ barcode: event.target.value })} />
        </div>
        <div className="two-col">
          <label>
            Category
            <select className="input" value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>
              {productCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <input className="input" placeholder="Unit" value={draft.unit} onChange={(event) => updateDraft({ unit: event.target.value })} />
        </div>
        <div className="two-col">
          <NumberField label="Selling price" value={draft.price} onChange={(value) => updateDraft({ price: value })} />
          <NumberField label="Cost price" value={draft.cost} onChange={(value) => updateDraft({ cost: value })} />
        </div>
        <div className="two-col">
          <NumberField label="Stock" value={draft.stock} onChange={(value) => updateDraft({ stock: value })} />
          <NumberField label="Reorder level" value={draft.reorderLevel} onChange={(value) => updateDraft({ reorderLevel: value })} />
        </div>
        <label>
          Expiry date
          <input className="input" type="date" value={draft.expiryDate} onChange={(event) => updateDraft({ expiryDate: event.target.value })} />
        </label>
        <div className="product-dashboard-actions">
          <button className="primary-button">Save Product</button>
          <button type="button" className="secondary-button" onClick={() => setDraft(emptyProduct())}>Clear Form</button>
        </div>
      </form>
    </div>
  );
});

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

const SearchField = memo(function SearchField({
  ariaLabel,
  className,
  placeholder,
  initialValue,
  onSearch,
}: {
  ariaLabel: string;
  className: string;
  placeholder: string;
  initialValue: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => onSearch(draft), 90);
    return () => clearTimeout(timer);
  }, [draft, onSearch]);

  return (
    <input
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
});

function Totals({
  currency,
  subtotal,
  discount,
  cogs,
  grossProfit,
  showProfit,
  total,
}: {
  currency: string;
  subtotal: number;
  discount: number;
  cogs: number;
  grossProfit: number;
  showProfit: boolean;
  total: number;
}) {
  return (
    <div className="totals">
      <span><b>Subtotal</b><strong>{money(subtotal, currency)}</strong></span>
      <span><b>Discount</b><strong>{money(discount, currency)}</strong></span>
      {showProfit && <span><b>COGS</b><strong>{money(cogs, currency)}</strong></span>}
      {showProfit && <span><b>Gross profit</b><strong>{money(grossProfit, currency)}</strong></span>}
      <span className="grand"><b>Total</b><strong>{money(total, currency)}</strong></span>
    </div>
  );
}

function Receipt({ sale, footer, currency, showProfit = false }: { sale: Sale; footer: string; currency: string; showProfit?: boolean }) {
  const itemCount = sale.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="receipt">
      <div className="receipt-title">
        <h3>{sale.receiptNo}</h3>
        <p>{new Date(sale.createdAt).toLocaleString()}</p>
      </div>
      <div className="receipt-detail-grid">
        <span><b>Customer</b>{sale.customer}</span>
        <span><b>Payment</b>{sale.paymentMethod}</span>
        <span><b>Items</b>{itemCount}</span>
      </div>
      <div className="receipt-items">
        <strong>Products</strong>
        {sale.items.map((item) => (
          <div className="receipt-item" key={`${sale.id}-${item.productId}`}>
            <div>
              <em>{item.name || "Unnamed product"}</em>
              <small>Qty {item.qty} x {money(item.price, currency)}{item.discount > 0 ? ` - ${money(item.discount, currency)} discount` : ""}</small>
            </div>
            <b>{money(item.qty * item.price - item.discount, currency)}</b>
          </div>
        ))}
      </div>
      <div className="receipt-total-list">
        <span><b>Subtotal</b>{money(sale.subtotal, currency)}</span>
        <span><b>Discount</b>{money(sale.discount, currency)}</span>
        {showProfit && <span><b>Cost</b>{money(sale.cogs, currency)}</span>}
        {showProfit && <span><b>Profit</b>{money(sale.grossProfit, currency)}</span>}
        <strong><b>Total</b>{money(sale.total, currency)}</strong>
      </div>
      <small>{footer}</small>
    </div>
  );
}

function DataTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | JSX.Element>>;
}) {
  return (
    <div className="table-wrap">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{rows.length} records</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length}>No records yet.</td>
              </tr>
            )}
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const supabaseSchema = `create table if not exists products (
  id text primary key,
  name text not null,
  sku text,
  barcode text,
  category text,
  unit text default 'piece',
  expiry_date text,
  price numeric not null,
  cost numeric not null,
  stock numeric not null default 0,
  reorder_level numeric not null default 5,
  taxable boolean not null default true
);

alter table products add column if not exists expiry_date text;

create table if not exists app_users (
  id uuid references auth.users(id) on delete cascade,
  email text primary key,
  name text,
  role text not null default 'Cashier' check (role in ('Admin', 'Cashier')),
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id text primary key,
  name text not null,
  phone text,
  balance numeric not null default 0
);

create table if not exists sales (
  id text primary key,
  "receiptNo" text not null,
  customer text,
  cashier text,
  "paymentMethod" text,
  subtotal numeric not null,
  discount numeric not null,
  tax numeric not null,
  total numeric not null,
  cogs numeric not null,
  "grossProfit" numeric not null,
  "createdAt" text not null
);

create table if not exists sale_items (
  id text primary key,
  sale_id text references sales(id) on delete cascade,
  "productId" text references products(id),
  name text not null,
  sku text,
  qty numeric not null,
  price numeric not null,
  cost numeric not null,
  discount numeric not null default 0
);

create table if not exists expenses (
  id text primary key,
  title text not null,
  category text,
  amount numeric not null,
  "createdAt" text not null
);

alter table products enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table expenses enable row level security;
alter table app_users enable row level security;

create policy "public products access" on products for all to anon using (true) with check (true);
create policy "public customers access" on customers for all to anon using (true) with check (true);
create policy "public sales access" on sales for all to anon using (true) with check (true);
create policy "public sale items access" on sale_items for all to anon using (true) with check (true);
create policy "public expenses access" on expenses for all to anon using (true) with check (true);
create policy "users can read own role" on app_users for select to authenticated using (lower(email) = lower(auth.email()));`;

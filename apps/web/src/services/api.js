import { useAuthStore } from '../stores/authStore';

const API_BASE = '/api';

let refreshPromise = null;

function buildHeaders(extra = {}) {
  const token = useAuthStore.getState().accessToken;
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function handleResponse(res) {
  if (!res.ok) {
    const data = await parseJsonSafe(res);
    const error = new Error(data?.error || 'Ha ocurrido un error inesperado');
    error.status = res.status;
    error.code = data?.error;
    throw error;
  }
  return res.json();
}

/**
 * Convierte cualquier respuesta de "lista" a un arreglo real,
 * sin importar si el backend la envuelve en paginacion o no.
 * Evita el crash "n.filter is not a function" en las paginas.
 * NOTA: No se aplica a sales.list ni sales.mySales porque estos 
 * requieren el objeto completo { data: [...], pagination: {...} }
 */
function normalizeList(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  console.warn('[API] Se esperaba una lista y llego esto:', result);
  return [];
}

/**
 * Renueva el access token una sola vez aunque varias peticiones
 * fallen con 401 al mismo tiempo (evita la carrera con la rotacion
 * de refresh token que hace el backend).
 */
function doRefresh() {
  if (refreshPromise) return refreshPromise;

  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    console.warn('[AUTH] No hay refresh token disponible.');
    useAuthStore.getState().logout();
    return Promise.reject(new Error('NO_REFRESH_TOKEN'));
  }

  console.log('[AUTH] Access token expirado, intentando renovar sesion...');

  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        console.error('[AUTH] Fallo la renovacion:', data?.error || res.status);
        useAuthStore.getState().logout();
        throw new Error(data?.error || 'REFRESH_FAILED');
      }
      console.log('[AUTH] Sesion renovada correctamente.');
      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Wrapper central: adjunta el token y, si recibe 401, intenta
 * UNA renovacion silenciosa y reintenta la peticion original.
 */
async function request(path, options = {}, { isRetry = false } = {}) {
  const { accessToken, refreshToken } = useAuthStore.getState();

  // Si no tenemos accessToken pero sí refreshToken, renovamos antes de enviar
  if (!accessToken && refreshToken && !isRetry) {
    try {
      await doRefresh();
    } catch {
      // Si falla doRefresh, deslogueará automáticamente
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildHeaders(options.headers),
  });

  if (res.status === 401 && !isRetry) {
    try {
      await doRefresh();
      return request(path, options, { isRetry: true });
    } catch {
      useAuthStore.getState().logout();
      const error = new Error('Tu sesion ha expirado. Por favor inicia sesion de nuevo.');
      error.status = 401;
      error.code = 'SESSION_EXPIRED';
      throw error;
    }
  }

  return handleResponse(res);
}

export const api = {
  auth: {
    async login(username, password) {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await handleResponse(res);
      console.log('[AUTH] Login correcto para:', data.user?.username);
      return data;
    },

    async logout() {
      const { refreshToken } = useAuthStore.getState();
      if (refreshToken) {
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
        } catch {
          // best-effort: el estado local se limpia igual
        }
      }
    },

    getMe: () => request('/auth/me'),
    getUsers: async (params = {}) =>
      normalizeList(await request(`/auth/users?${new URLSearchParams(params).toString()}`)),
    createUser: (payload) => request('/auth/users', { method: 'POST', body: JSON.stringify(payload) }),
    updateUser: (id, payload) => request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
    changePassword: (oldPassword, newPassword) =>
      request('/auth/password', { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) }),
  },

  categories: {
    list: async (params = {}) =>
      normalizeList(await request(`/categories?${new URLSearchParams(params).toString()}`)),
    get: (id) => request(`/categories/${id}`),
    create: (name, description) => request('/categories', { method: 'POST', body: JSON.stringify({ name, description }) }),
    update: (id, name, description) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) }),
    delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: async (params = {}) =>
      normalizeList(await request(`/products?${new URLSearchParams(params).toString()}`)),
    get: (id) => request(`/products/${id}`),
    create: (payload) => request('/products', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
    adjustStock: (payload) => request('/products/adjust-stock', { method: 'POST', body: JSON.stringify(payload) }),
    getLowStock: async () => normalizeList(await request('/products/low-stock')),
  },

  customers: {
    list: async (params = {}) =>
      normalizeList(await request(`/customers?${new URLSearchParams(params).toString()}`)),
    getForPOS: async () => normalizeList(await request('/customers/pos')),
    get: (id) => request(`/customers/${id}`),
    create: (payload) => request('/customers', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
  },

  sales: {
    // Se elimina normalizeList para preservar la estructura { data: [...], pagination: {...} }
    list: (params = {}) =>
      request(`/sales?${new URLSearchParams(params).toString()}`),

    get: (id) => request(`/sales/${id}`),

    create: (payload) => request('/sales', { method: 'POST', body: JSON.stringify(payload) }),

    createCreditNote: (id, payload) =>
      request(`/sales/${id}/credit-note`, { method: 'POST', body: JSON.stringify(payload) }),

    // Se elimina normalizeList para preservar la estructura { data: [...], pagination: {...} }
    mySales: (params = {}) =>
      request(`/sales/my-sales?${new URLSearchParams(params).toString()}`),

    vendorStats: () => request('/sales/vendor-stats'),
  },

  inventory: {
    logs: async (params = {}) =>
      normalizeList(await request(`/inventory/logs?${new URLSearchParams(params).toString()}`)),
    getKardex: (productId, params = {}) => request(`/inventory/kardex/${productId}?${new URLSearchParams(params).toString()}`),
    adjust: (payload) => request('/inventory/adjust', { method: 'POST', body: JSON.stringify(payload) }),
    purchase: (payload) => request('/inventory/purchase', { method: 'POST', body: JSON.stringify(payload) }),
    getSummary: () => request('/inventory/summary'),
  },

  reports: {
    dashboard: () => request('/reports/dashboard'),
    sales: (params = {}) => request(`/reports/sales?${new URLSearchParams(params).toString()}`),
    products: (params = {}) => request(`/reports/products?${new URLSearchParams(params).toString()}`),
    customers: (params = {}) => request(`/reports/customers?${new URLSearchParams(params).toString()}`),
    tax: (params = {}) => request(`/reports/tax?${new URLSearchParams(params).toString()}`),
    lowStock: () => request('/reports/low-stock'),
    topSoldProducts: (params = {}) => request(`/reports/products/top-sold?${new URLSearchParams(params).toString()}`),
    mostProfitableProducts: (params = {}) => request(`/reports/products/most-profitable?${new URLSearchParams(params).toString()}`),
    lowMarginProducts: (params = {}) => request(`/reports/products/low-margin?${new URLSearchParams(params).toString()}`),
    productsByCategory: (params = {}) => request(`/reports/products/by-category?${new URLSearchParams(params).toString()}`),
    topCustomersByAmount: (params = {}) => request(`/reports/customers/top-by-amount?${new URLSearchParams(params).toString()}`),
    topCustomersByFrequency: (params = {}) => request(`/reports/customers/top-by-frequency?${new URLSearchParams(params).toString()}`),
    customerHistory: (id, params = {}) => request(`/reports/customers/${id}/history?${new URLSearchParams(params).toString()}`),
    staffPerformance: (params = {}) => request(`/reports/staff/performance?${new URLSearchParams(params).toString()}`),
    staffPaymentMethods: (params = {}) => request(`/reports/staff/payment-methods?${new URLSearchParams(params).toString()}`),
  },

  finance: {
    cashflow: (params = {}) => request(`/finance/cashflow?${new URLSearchParams(params).toString()}`),
  },
};
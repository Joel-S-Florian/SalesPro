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
    const detail = Array.isArray(data?.details)
      ? data.details.map(d => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ')
      : '';
    const error = new Error(
      (data?.error || 'Ha ocurrido un error inesperado') + (detail ? ` (${detail})` : '')
    );
    error.status = res.status;
    error.code = data?.code;
    error.data = data;
    // Tope o función del plan: avisa a la aplicación para ofrecer «Ver planes» y refrescar el uso
    if (data?.code === 'PLAN_LIMIT' || data?.code === 'PLAN_FEATURE') {
      window.dispatchEvent(new CustomEvent('factos:plan-error', { detail: data }));
    }
    throw error;
  }
  return res.json();
}

/**
 * Construye un query string sanitizado: omite valores undefined, null,
 * strings vacíos y las cadenas literales "undefined"/"null".
 * Evita que Prisma reciba filtros inválidos como userId="undefined".
 */
function toQuery(params = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const str = String(value);
    if (str === '' || str === 'undefined' || str === 'null') continue;
    clean[key] = value;
  }
  return new URLSearchParams(clean).toString();
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


  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        useAuthStore.getState().logout();
        throw new Error(data?.error || 'REFRESH_FAILED');
      }
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

  // Descargas (p. ej. Excel): devuelve el archivo en vez de JSON
  if (options.responseType === 'blob' && res.ok) return res.blob();
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

    // Recuperación de contraseña (sin sesión)
    async forgotPassword(identifier) {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      return handleResponse(res);
    },
    async resetPassword(token, newPassword) {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      return handleResponse(res);
    },

    getMe: () => request('/auth/me'),
    getUsersPage: (params = {}) => request(`/auth/users?${toQuery(params)}`),
    getUsers: async (params = {}) =>
      normalizeList(await request(`/auth/users?${toQuery(params)}`)),
    createUser: (payload) => request('/auth/users', { method: 'POST', body: JSON.stringify(payload) }),
    updateUser: (id, payload) => request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    resetUserPassword: id => request(`/auth/users/${id}/reset-password`, { method: 'POST' }),
    deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
    changePassword: (oldPassword, newPassword) =>
      request('/auth/password', { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) }),
  },

  categories: {
    page: (params = {}) => request(`/categories?${toQuery(params)}`),
    list: async (params = {}) =>
      normalizeList(await request(`/categories?${toQuery(params)}`)),
    get: (id) => request(`/categories/${id}`),
    create: (name, description) => request('/categories', { method: 'POST', body: JSON.stringify({ name, description }) }),
    update: (id, name, description) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) }),
    delete: (id, moveTo) => request(`/categories/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`, { method: 'DELETE' }),
  },

  products: {
    list: async (params = {}) =>
      normalizeList(await request(`/products?${toQuery(params)}`)),
    // Respuesta completa { data, pagination } (el POS pagina en el servidor)
    page: (params = {}) => request(`/products?${toQuery(params)}`),
    get: (id) => request(`/products/${id}`),
    create: (payload) => request('/products', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
    adjustStock: (payload) => request('/products/adjust-stock', { method: 'POST', body: JSON.stringify(payload) }),
    getLowStock: async () => normalizeList(await request('/products/low-stock')),
  },

  customers: {
    page: (params = {}) => request(`/customers?${toQuery(params)}`),
    list: async (params = {}) =>
      normalizeList(await request(`/customers?${toQuery(params)}`)),
    getForPOS: async () => normalizeList(await request('/customers/pos')),
    get: (id) => request(`/customers/${id}`),
    create: (payload) => request('/customers', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
  },

  public: {
    // Registro autónomo: devuelve la sesión iniciada de la cuenta recién creada
    signup: (payload) => request('/public/signup', { method: 'POST', body: JSON.stringify(payload) }),
    // Canal de contacto (WhatsApp Business) configurado en el servidor
    contact: () => request('/public/contact'),
  },

  platform: {
    stats: () => request('/platform/stats'),
    analytics: () => request('/platform/analytics'),
    companies: (params = {}) => request(`/platform/companies?${toQuery(params)}`),
    company: (id) => request(`/platform/companies/${id}`),
    leads: (params = {}) => request(`/platform/leads?${toQuery(params)}`),
    approveLead: (id, payload) => request(`/platform/leads/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) }),
    rejectLead: (id) => request(`/platform/leads/${id}/reject`, { method: 'POST' }),
    createCompany: (payload) => request('/platform/companies', { method: 'POST', body: JSON.stringify(payload) }),
    updateCompany: (id, payload) =>
      request(`/platform/companies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    resetUserPassword: (companyId, userId) =>
      request(`/platform/companies/${companyId}/users/${userId}/reset-password`, { method: 'POST' }),
  },

  inventoryImport: {
    stage: (payload) => request('/inventory-import', { method: 'POST', body: JSON.stringify(payload) }),
    preview: (id, payload) =>
      request(`/inventory-import/${id}/preview`, { method: 'POST', body: JSON.stringify(payload) }),
    apply: (id) => request(`/inventory-import/${id}/apply`, { method: 'POST' }),
    cancel: (id) => request(`/inventory-import/${id}`, { method: 'DELETE' }),
  },

  config: {
    get: () => request('/config'),
    update: (payload) => request('/config', { method: 'PUT', body: JSON.stringify(payload) }),
  },

  payments: {
    cardConfig: () => request('/payments/card/config'),
    saveCardConfig: payload => request('/payments/card/config', { method: 'PUT', body: JSON.stringify(payload) }),
    chargeCard: payload => request('/payments/card/charge', { method: 'POST', body: JSON.stringify(payload) }),
    voidCard: id => request(`/payments/card/${id}/void`, { method: 'POST' }),
  },

  terminals: {
    list: () => request('/terminals'),
    mine: () => request('/terminals/my'),
    create: (payload) => request('/terminals', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/terminals/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    setDefault: (terminalId) =>
      request('/terminals/my/default', { method: 'PUT', body: JSON.stringify({ terminalId }) }),
  },

  company: {
    planUsage: () => request('/company/plan-usage'),
  },

  exports: {
    options: () => request('/exports/options'),
    list: () => request('/exports'),
    create: payload => request('/exports', { method: 'POST', body: JSON.stringify(payload) }),
    link: id => request(`/exports/${id}/link`, { method: 'POST' }),
    remove: id => request(`/exports/${id}`, { method: 'DELETE' }),
  },

  cashier: {
    current: (terminalId) => request(`/cashier/current?terminalId=${terminalId}`),
    open: (payload) => request('/cashier/open', { method: 'POST', body: JSON.stringify(payload) }),
    close: (id, payload) => request(`/cashier/${id}/close`, { method: 'POST', body: JSON.stringify(payload) }),
    list: (params = {}) => request(`/cashier?${toQuery(params)}`),
    get: (id) => request(`/cashier/${id}`),
    drawer: (id) => request(`/cashier/${id}/drawer`),
  },

  suppliers: {
    list: (params = {}) => request(`/suppliers?${toQuery(params)}`),
    get: (id) => request(`/suppliers/${id}`),
    create: (payload) => request('/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    purchases: (id, params = {}) => request(`/suppliers/${id}/purchases?${toQuery(params)}`),
    reorderProducts: id => request(`/suppliers/${id}/reorder-products`),
  },

  sales: {
    // Se elimina normalizeList para preservar la estructura { data: [...], pagination: {...} }
    list: (params = {}) =>
      request(`/sales?${toQuery(params)}`),

    get: (id) => request(`/sales/${id}`),

    create: (payload) => request('/sales', { method: 'POST', body: JSON.stringify(payload) }),

    createCreditNote: (id, payload) =>
      request(`/sales/${id}/credit-note`, { method: 'POST', body: JSON.stringify(payload) }),

    // Se elimina normalizeList para preservar la estructura { data: [...], pagination: {...} }
    mySales: (params = {}) =>
      request(`/sales/my-sales?${toQuery(params)}`),

    vendorStats: () => request('/sales/vendor-stats'),

    logCartRemoval: (payload) =>
      request('/sales/cart-removal', { method: 'POST', body: JSON.stringify(payload) }),
  },

  inventory: {
    logsPage: (params = {}) => request(`/inventory/logs?${toQuery(params)}`),
    logs: async (params = {}) =>
      normalizeList(await request(`/inventory/logs?${toQuery(params)}`)),
    getKardex: (productId, params = {}) => request(`/inventory/kardex/${productId}?${toQuery(params)}`),
    adjust: (payload) => request('/inventory/adjust', { method: 'POST', body: JSON.stringify(payload) }),
    purchase: (payload) => request('/inventory/purchase', { method: 'POST', body: JSON.stringify(payload) }),
    getSummary: () => request('/inventory/summary'),
    expiring: (params = {}) => request(`/inventory/expiring?${toQuery(params)}`),
    expiringSummary: () => request('/inventory/expiring/summary'),
    batches: (productId, params = {}) => request(`/inventory/batches/${productId}?${toQuery(params)}`),
  },

  reports: {
    dashboard: () => request('/reports/dashboard'),
    sales: (params = {}) => request(`/reports/sales?${toQuery(params)}`),
    products: (params = {}) => request(`/reports/products?${toQuery(params)}`),
    customers: (params = {}) => request(`/reports/customers?${toQuery(params)}`),
    tax: (params = {}) => request(`/reports/tax?${toQuery(params)}`),
    lowStock: () => request('/reports/low-stock'),
    topSoldProducts: (params = {}) => request(`/reports/products/top-sold?${toQuery(params)}`),
    mostProfitableProducts: (params = {}) => request(`/reports/products/most-profitable?${toQuery(params)}`),
    lowMarginProducts: (params = {}) => request(`/reports/products/low-margin?${toQuery(params)}`),
    productsByCategory: (params = {}) => request(`/reports/products/by-category?${toQuery(params)}`),
    topCustomersByAmount: (params = {}) => request(`/reports/customers/top-by-amount?${toQuery(params)}`),
    topCustomersByFrequency: (params = {}) => request(`/reports/customers/top-by-frequency?${toQuery(params)}`),
    customerHistory: (id, params = {}) => request(`/reports/customers/${id}/history?${toQuery(params)}`),
    staffPerformance: (params = {}) => request(`/reports/staff/performance?${toQuery(params)}`),
    staffPaymentMethods: (params = {}) => request(`/reports/staff/payment-methods?${toQuery(params)}`),
    overview: (params = {}) => request(`/reports/overview?${toQuery(params)}`),
    salesBreakdown: (params = {}) => request(`/reports/sales-breakdown?${toQuery(params)}`),
    profitability: (params = {}) => request(`/reports/profitability?${toQuery(params)}`),
    fiscal: (params = {}) => request(`/reports/fiscal?${toQuery(params)}`),
    inventory: (params = {}) => request(`/reports/inventory?${toQuery(params)}`),
    kardex: (productId, params = {}) => request(`/reports/kardex/${productId}?${toQuery(params)}`),
    purchases: (params = {}) => request(`/reports/purchases?${toQuery(params)}`),
    expiry: (params = {}) => request(`/reports/expiry?${toQuery(params)}`),
    bulk: (params = {}) => request(`/reports/bulk?${toQuery(params)}`),
    cash: (params = {}) => request(`/reports/cash?${toQuery(params)}`),
    customerInsights: (params = {}) => request(`/reports/customer-insights?${toQuery(params)}`),
    exportXlsx: payload =>
      request('/reports/export/xlsx', { method: 'POST', body: JSON.stringify(payload), responseType: 'blob' }),
  },

  ecf: {
    config: () => request('/ecf/config'),
    certificateUsage: () => request('/ecf/certificate-usage'),
    saveConfig: payload => request('/ecf/config', { method: 'PUT', body: JSON.stringify(payload) }),
    uploadCertificate: payload => request('/ecf/certificate', { method: 'POST', body: JSON.stringify(payload) }),
    removeCertificate: () => request('/ecf/certificate', { method: 'DELETE' }),
    testConnection: () => request('/ecf/test-connection', { method: 'POST' }),
    sequences: () => request('/ecf/sequences'),
    createSequence: payload => request('/ecf/sequences', { method: 'POST', body: JSON.stringify(payload) }),
    updateSequence: (id, payload) => request(`/ecf/sequences/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteSequence: id => request(`/ecf/sequences/${id}`, { method: 'DELETE' }),
    summary: () => request('/ecf/summary'),
    inbox: (params = {}) => request(`/ecf/inbox?${toQuery(params)}`),
    inboxXml: id => request(`/ecf/inbox/${id}/xml`, { responseType: 'blob' }),
    respondInbox: (id, payload) => request(`/ecf/inbox/${id}/respond`, { method: 'POST', body: JSON.stringify(payload) }),
    voidRanges: ranges => request('/ecf/void-ranges', { method: 'POST', body: JSON.stringify({ ranges }) }),
    checkCustomer: (id, force = false) => request(`/ecf/customers/${id}/check`, { method: 'POST', body: JSON.stringify({ force }) }),
    documents: (params = {}) => request(`/ecf/documents?${toQuery(params)}`),
    saleStatus: id => request(`/ecf/sales/${id}/status`),
    saleDetail: id => request(`/ecf/sales/${id}`),
    retry: id => request(`/ecf/sales/${id}/retry`, { method: 'POST' }),
    downloadXml: (id, kind = 'ECF') => request(`/ecf/sales/${id}/xml?kind=${kind}`, { responseType: 'blob' }),
  },

  finance: {
    cashflow: (params = {}) => request(`/finance/cashflow?${toQuery(params)}`),
  },
};
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

// Query Keys
export const queryKeys = {
  auth: {
    me: ['auth', 'me'],
    users: (params) => ['auth', 'users', params],
  },
  categories: {
    list: (params) => ['categories', 'list', params],
    detail: (id) => ['categories', 'detail', id],
  },
  products: {
    list: (params) => ['products', 'list', params],
    detail: (id) => ['products', 'detail', id],
    lowStock: ['products', 'lowStock'],
  },
  customers: {
    list: (params) => ['customers', 'list', params],
    pos: ['customers', 'pos'],
    detail: (id) => ['customers', 'detail', id],
  },
  sales: {
    list: (params) => ['sales', 'list', params],
    detail: (id) => ['sales', 'detail', id],
  },
  inventory: {
    logs: (params) => ['inventory', 'logs', params],
    kardex: (productId, params) => ['inventory', 'kardex', productId, params],
    summary: ['inventory', 'summary'],
  },
  reports: {
    dashboard: ['reports', 'dashboard'],
    sales: (params) => ['reports', 'sales', params],
    products: (params) => ['reports', 'products', params],
    customers: (params) => ['reports', 'customers', params],
    tax: (params) => ['reports', 'tax', params],
  },
};

// Auth hooks
export const useAuthMe = () => {
  const hasToken = useAuthStore((state) => !!state.accessToken);
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: api.auth.getMe,
    staleTime: 5 * 60 * 1000,
    enabled: hasToken,
    retry: false,
  });
};

export const useAuthUsers = (params) => useQuery({
  queryKey: queryKeys.auth.users(params),
  queryFn: () => api.auth.getUsers(params),
  placeholderData: [],
});

// Categories hooks
export const useCategories = (params) => useQuery({
  queryKey: queryKeys.categories.list(params),
  queryFn: () => api.categories.list(params),
  placeholderData: [],
});

export const useCategory = (id) => useQuery({
  queryKey: queryKeys.categories.detail(id),
  queryFn: () => api.categories.get(id),
  enabled: !!id,
});

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }) => api.categories.create(name, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, description }) => api.categories.update(id, name, description),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: queryKeys.categories.detail(id) });
    },
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.categories.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
};

// Products hooks
export const useProducts = (params) => useQuery({
  queryKey: queryKeys.products.list(params),
  queryFn: () => api.products.list(params),
  placeholderData: [],
});

export const useProduct = (id) => useQuery({
  queryKey: queryKeys.products.detail(id),
  queryFn: () => api.products.get(id),
  enabled: !!id,
});

export const useLowStockProducts = () => useQuery({
  queryKey: queryKeys.products.lowStock,
  queryFn: api.products.getLowStock,
  placeholderData: [],
});

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.products.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => api.products.update(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
    },
  });
};

export const useDeleteProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.products.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

export const useAdjustStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.products.adjustStock,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

// Customers hooks
export const useCustomers = (params) => useQuery({
  queryKey: queryKeys.customers.list(params),
  queryFn: () => api.customers.list(params),
  placeholderData: [],
});

export const useCustomersForPOS = () => useQuery({
  queryKey: queryKeys.customers.pos,
  queryFn: api.customers.getForPOS,
  placeholderData: [],
});

export const useCustomer = (id) => useQuery({
  queryKey: queryKeys.customers.detail(id),
  queryFn: () => api.customers.get(id),
  enabled: !!id,
});

export const useCreateCustomer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.customers.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: queryKeys.customers.pos });
    },
  });
};

export const useUpdateCustomer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => api.customers.update(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: queryKeys.customers.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.customers.pos });
    },
  });
};

export const useDeleteCustomer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.customers.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: queryKeys.customers.pos });
    },
  });
};

// Sales hooks
export const useSales = (params) => useQuery({
  queryKey: queryKeys.sales.list(params),
  queryFn: () => api.sales.list(params),
  placeholderData: [],
});

export const useSale = (id) => useQuery({
  queryKey: queryKeys.sales.detail(id),
  queryFn: () => api.sales.get(id),
  enabled: !!id,
});

export const useCreateSale = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.sales.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useCreateCreditNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => api.sales.createCreditNote(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

// Inventory hooks
export const useInventoryLogs = (params) => useQuery({
  queryKey: queryKeys.inventory.logs(params),
  queryFn: () => api.inventory.logs(params),
  placeholderData: [],
});

export const useProductKardex = (productId, params) => useQuery({
  queryKey: queryKeys.inventory.kardex(productId, params),
  queryFn: () => api.inventory.getKardex(productId, params),
  enabled: !!productId,
});

export const useInventorySummary = () => useQuery({
  queryKey: queryKeys.inventory.summary,
  queryFn: api.inventory.getSummary,
});

export const useAdjustInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.inventory.adjust,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

// Reports hooks
export const useDashboardStats = () => useQuery({
  queryKey: queryKeys.reports.dashboard,
  queryFn: api.reports.dashboard,
  refetchInterval: 30000,
});

export const useSalesReport = (params) => useQuery({
  queryKey: queryKeys.reports.sales(params),
  queryFn: () => api.reports.sales(params),
});

export const useProductSalesReport = (params) => useQuery({
  queryKey: queryKeys.reports.products(params),
  queryFn: () => api.reports.products(params),
});

export const useCustomerSalesReport = (params) => useQuery({
  queryKey: queryKeys.reports.customers(params),
  queryFn: () => api.reports.customers(params),
});

export const useTaxReport = (params) => useQuery({
  queryKey: queryKeys.reports.tax(params),
  queryFn: () => api.reports.tax(params),
});
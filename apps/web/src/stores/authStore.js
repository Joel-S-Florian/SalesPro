import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const ROLES = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  VENDEDOR: 'VENDEDOR',
};

const PERMISSIONS = {
  POS_ACCESS: 'pos.access',
  SALES_OWN_READ: 'sales.own.read',
  SALES_ALL_READ: 'sales.all.read',
  SALES_CREATE: 'sales.create',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',
  PRODUCTS_READ: 'products.read',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',
  CATEGORIES_READ: 'categories.read',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_UPDATE: 'categories.update',
  CATEGORIES_DELETE: 'categories.delete',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_UPDATE: 'inventory.update',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  REPORTS_READ: 'reports.read',
  PROFILE_READ: 'profile.read',
  PROFILE_UPDATE: 'profile.update',
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMINISTRADOR]: Object.values(PERMISSIONS),
  [ROLES.VENDEDOR]: [
    PERMISSIONS.POS_ACCESS,
    PERMISSIONS.SALES_OWN_READ,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.PROFILE_UPDATE,
  ],
};

function hasPermission(userRole, permission) {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

function hasRole(userRole, ...allowedRoles) {
  return allowedRoles.includes(userRole);
}

function isAdministrator(userRole) {
  return userRole === ROLES.ADMINISTRADOR;
}

function isVendedor(userRole) {
  return userRole === ROLES.VENDEDOR;
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,

      login: (user, accessToken, refreshToken) => set({
        user,
        accessToken,
        refreshToken,
        isAuthenticated: !!(user && (accessToken || refreshToken)),
      }),

      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      }),

      setUser: (user) => set({ user }),

      setTokens: (accessToken, refreshToken) => set((state) => ({
        accessToken,
        refreshToken,
        isAuthenticated: !!(state.user && (accessToken || refreshToken)),
      })),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      getAccessToken: () => get().accessToken,

      getRefreshToken: () => get().refreshToken,

      hasRole: (...allowedRoles) => {
        const { user } = get();
        if (!user?.role) return false;
        return allowedRoles.includes(user.role);
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user?.role) return false;
        return hasPermission(user.role, permission);
      },

      isAdministrator: () => {
        const { user } = get();
        if (!user?.role) return false;
        return isAdministrator(user.role);
      },

      isVendedor: () => {
        const { user } = get();
        if (!user?.role) return false;
        return isVendedor(user.role);
      },
    }),
    {
      name: 'salespro-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true;
          if (!state.accessToken && !state.refreshToken) {
            state.isAuthenticated = false;
            state.user = null;
          }
        }
      },
    }
  )
);

// Fallback hydration flag
useAuthStore.setState({ hasHydrated: true });
// Si al cargar inicialmente desde storage no hay tokens, limpiar autenticación
const initialAuthState = useAuthStore.getState();
if (!initialAuthState.accessToken && !initialAuthState.refreshToken && initialAuthState.isAuthenticated) {
  useAuthStore.setState({ isAuthenticated: false, user: null });
}
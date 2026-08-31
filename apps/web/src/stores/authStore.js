import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
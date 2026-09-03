import { useAuthStore } from '../stores/authStore';
import { useMemo } from 'react';

export function useAuthorization() {
  const user = useAuthStore(state => state.user);
  const hasRole = useAuthStore(state => state.hasRole);
  const hasPermission = useAuthStore(state => state.hasPermission);
  const isAdministrator = useAuthStore(state => state.isAdministrator);
  const isVendedor = useAuthStore(state => state.isVendedor);

  const isAdmin = useMemo(() => isAdministrator(), [isAdministrator]);
  const isVend = useMemo(() => isVendedor(), [isVendedor]);

  return {
    user,
    hasRole: (...roles) => hasRole(...roles),
    hasPermission: (permission) => hasPermission(permission),
    isAdministrator: isAdmin,
    isVendedor: isVend,
  };
}
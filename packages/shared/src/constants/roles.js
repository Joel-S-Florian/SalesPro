export const ROLES = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  VENDEDOR: 'VENDEDOR',
};

export const PERMISSIONS = {
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

export const ROLE_PERMISSIONS = {
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

export function hasPermission(userRole, permission) {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function hasRole(userRole, ...allowedRoles) {
  return allowedRoles.includes(userRole);
}

export function isAdministrator(userRole) {
  return userRole === ROLES.ADMINISTRADOR;
}

export function isVendedor(userRole) {
  return userRole === ROLES.VENDEDOR;
}
import { create } from 'zustand';

const KEY = 'factos-active-branch';

const readStored = () => {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
};

/**
 * Sucursal con la que trabaja el administrador (inventario, compras, lotes). Se envía en cada petición como X-Branch-Id.
 * `override` la fija la pantalla de ventas: el catálogo debe mostrar el stock de la sucursal de la caja elegida.
 */
export const useBranchStore = create(set => ({
  activeBranchId: readStored(),
  override: null,
  reportBranchId: null, // filtro de las pantallas de reportes, ventas, cierres y finanzas (null = todas las sucursales)
  setReportBranch: id => set({ reportBranchId: id || null }),
  setActiveBranch: id => {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // sin almacenamiento: la elección solo dura la sesión de la página
    }
    set({ activeBranchId: id || null });
  },
  setOverride: id => set({ override: id || null }),
}));

/** Sucursal que viaja en el encabezado de las peticiones (o null: el servidor usa la Principal / la del usuario). */
export const effectiveBranchId = () => {
  const { override, activeBranchId } = useBranchStore.getState();
  return override || activeBranchId;
};

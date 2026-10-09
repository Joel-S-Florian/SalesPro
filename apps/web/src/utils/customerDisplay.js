export const CUSTOMER_DISPLAY_CHANNEL = 'factos-customer-display';
export const CUSTOMER_DISPLAY_URL = '/?display=customer';

/** Abre (o reutiliza) la ventana de la pantalla del cliente. */
export function openCustomerDisplay() {
  const win = window.open(CUSTOMER_DISPLAY_URL, 'factos-customer-display', 'popup,width=1280,height=720');
  win?.focus();
  return win;
}

export const isCustomerDisplayMode = () =>
  new URLSearchParams(window.location.search).get('display') === 'customer';

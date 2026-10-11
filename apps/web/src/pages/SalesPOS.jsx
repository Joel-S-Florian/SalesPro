import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Expand, Maximize2, Minimize2, Monitor } from 'lucide-react';
import { api } from '../services/api';
import { useAuthorization } from '../hooks/useAuthorization';
import { useShift } from '../hooks/useShift';
import { usePosCart } from '../hooks/usePosCart';
import { useProductCatalog } from '../hooks/useProductCatalog';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useSerialScanner } from '../hooks/useSerialScanner';
import { useCustomerDisplaySync } from '../hooks/useCustomerDisplaySync';
import { useConfigStore, formatTaxPercent } from '../stores/configStore';
import { openCustomerDisplay } from '../utils/customerDisplay';
import { printReceipt } from '../utils/receiptPdf';
import { notify } from '../utils/notify';
import ShiftBar from '../components/ShiftBar';
import CameraScannerModal from '../components/CameraScannerModal';
import ProductCatalog from '../components/pos/ProductCatalog';
import Ticket from '../components/pos/Ticket';
import MobileTicketSheet from '../components/pos/MobileTicketSheet';
import CheckoutSuccessModal from '../components/pos/CheckoutSuccessModal';
import RemoveItemModal from '../components/pos/RemoveItemModal';
import NewCustomerModal from '../components/pos/NewCustomerModal';

const CASHIER_MODE_KEY = 'factos-pos-large';

function ToolbarButton({ icon: Icon, label, active, onClick, iconOnly }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-[13px] font-medium [@media(pointer:coarse)]:h-11 cursor-pointer ${
        iconOnly ? 'w-10 [@media(pointer:coarse)]:w-11' : 'px-3'
      } ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!iconOnly && <span className="hidden 2xl:inline">{label}</span>}
    </button>
  );
}

export default function SalesPOS({ onNavigate }) {
  const { isVendedor } = useAuthorization();
  const config = useConfigStore(state => state.config);
  const shiftState = useShift();
  const catalog = useProductCatalog();
  const cart = usePosCart(config.taxRate);

  const canDiscount = !isVendedor || config.vendedorCanDiscount;
  const taxPercent = formatTaxPercent(config.taxRate);

  const [categories, setCategories] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const activePayment = config.paymentMethods.includes(paymentMethod) ? paymentMethod : config.paymentMethods[0];

  const [submitting, setSubmitting] = useState(false);
  const [recentSale, setRecentSale] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shakeId, setShakeId] = useState(null);
  const [cashierMode, setCashierMode] = useState(() => {
    try {
      return localStorage.getItem(CASHIER_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const searchRef = useRef(null);

  // Categorías para los filtros
  useEffect(() => {
    api.categories.list({ limit: 100 }).then(setCategories).catch(() => setCategories([]));
  }, []);

  // Cliente inicial: "Consumidor final" (documento 000000000) o el primero disponible
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await api.customers.list({ q: '000000000', limit: 5 });
        const fallback = found.find(c => c.documentId === '000000000') || (await api.customers.list({ limit: 1 }))[0];
        if (!cancelled) setCustomer(prev => prev || fallback || null);
      } catch {
        // el cajero puede elegir un cliente manualmente
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Agregar productos ----
  const handleAdd = product => {
    const added = cart.add(product);
    if (!added) {
      setShakeId(product.id);
      setTimeout(() => setShakeId(null), 450);
    }
    return added;
  };

  const addByCode = async code => {
    const product = await catalog.findByCode(code);
    if (!product) {
      notify.warning(`No hay ningún producto con el código ${code}.`);
      return;
    }
    handleAdd(product);
    catalog.setSearch('');
  };

  // Enter en el buscador: código exacto, o el único resultado visible
  const submitSearch = async text => {
    const query = text.trim();
    if (!query) return;
    const exact = await catalog.findByCode(query);
    const only = catalog.products.length === 1 ? catalog.products[0] : null;
    const product = exact || only;
    if (!product) {
      notify.warning(`No hay un producto único para “${query}”.`);
      return;
    }
    handleAdd(product);
    catalog.setSearch('');
  };

  const serialScanner = useSerialScanner(addByCode);
  useBarcodeScanner(addByCode, { enabled: !recentSale && !removeTarget && !newCustomerOpen });

  // ---- Quitar artículos (con autorización y auditoría) ----
  const requestRemove = productId => {
    const item = cart.find(productId);
    if (item) setRemoveTarget(item);
  };

  const confirmRemove = async credentials => {
    await api.sales.logCartRemoval({
      productId: removeTarget.product.id,
      quantity: removeTarget.quantity,
      ...credentials,
    });
    cart.remove(removeTarget.product.id);
    setRemoveTarget(null);
  };

  // ---- Cobro ----
  const handleCheckout = async () => {
    if (cart.items.length === 0 || submitting) return;
    if (!customer) {
      notify.warning('Seleccione un cliente para la venta.');
      return;
    }
    try {
      setSubmitting(true);
      const sale = await api.sales.create({
        customerId: customer.id,
        ...(shiftState.terminalId ? { terminalId: shiftState.terminalId } : {}),
        details: cart.items.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          discount: Number(item.discount || 0),
        })),
        discount: Number(cart.globalDiscount || 0),
        paymentMethod: activePayment,
      });
      catalog.applySale(cart.items);
      setRecentSale(sale);
      cart.clear();
      setPaymentMethod(config.paymentMethods[0]);
      setSheetOpen(false);
      shiftState.refreshShift();
      catalog.refresh();
    } catch (err) {
      notify.error(err.message || 'No se pudo registrar la venta.');
    } finally {
      setSubmitting(false);
    }
  };

  const startNewSale = () => {
    setRecentSale(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ---- Atajos de teclado: "/" o F2 buscan, F9 cobra ----
  const checkoutRef = useRef(handleCheckout);
  checkoutRef.current = handleCheckout;
  const blocked = !!(recentSale || removeTarget || newCustomerOpen || cameraOpen);

  useEffect(() => {
    const onKeyDown = event => {
      if (blocked) return;
      const target = event.target;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (event.key === 'F9') {
        event.preventDefault();
        checkoutRef.current();
      } else if (event.key === 'F2' || (event.key === '/' && !typing)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blocked]);

  // ---- Pantalla del cliente ----
  const displayPayload = useMemo(
    () => ({
      business: { name: config.business.name },
      taxPercent,
      items: cart.items.map(item => ({
        id: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.product.salePrice || 0),
        discount: Number(item.discount || 0),
        total: Number(item.product.salePrice || 0) * item.quantity - Number(item.discount || 0),
      })),
      totals: cart.totals,
    }),
    [cart.items, cart.totals, config.business.name, taxPercent]
  );
  useCustomerDisplaySync(displayPayload, recentSale);

  // ---- Vista de caja / pantalla completa ----
  const toggleCashierMode = () => {
    const next = !cashierMode;
    setCashierMode(next);
    try {
      localStorage.setItem(CASHIER_MODE_KEY, next ? '1' : '0');
    } catch {
      // almacenamiento no disponible
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const ticketProps = {
    cart,
    customer,
    onSelectCustomer: setCustomer,
    onCreateCustomer: () => setNewCustomerOpen(true),
    paymentMethods: config.paymentMethods,
    paymentMethod: activePayment,
    onPaymentMethod: setPaymentMethod,
    taxPercent,
    canDiscount,
    submitting,
    onRequestRemove: requestRemove,
    onCheckout: handleCheckout,
    large: cashierMode,
  };

  return (
    <>
      <div
        className={
          cashierMode
            ? 'fixed inset-0 z-40 flex flex-col gap-3 overflow-hidden bg-[#f4f6fa] p-4 dark:bg-[#090d16]'
            : 'flex flex-col gap-3 lg:h-[calc(100dvh-8.75rem)]'
        }
        id="pos-view"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white xl:pr-2">Nueva venta</h1>
          <div className="min-w-0 flex-1">
            <ShiftBar shiftState={shiftState} requireOpenShift={config.requireOpenShift} />
          </div>
          <div className={`items-center gap-2 ${cashierMode ? 'flex' : 'hidden lg:flex'}`}>
            <ToolbarButton icon={Monitor} label="Pantalla del cliente" onClick={openCustomerDisplay} />
            <ToolbarButton
              icon={cashierMode ? Minimize2 : Maximize2}
              label={cashierMode ? 'Salir de vista de caja' : 'Vista de caja'}
              active={cashierMode}
              onClick={toggleCashierMode}
            />
            <ToolbarButton icon={Expand} label="Pantalla completa" onClick={toggleFullscreen} iconOnly />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <ProductCatalog
            ref={searchRef}
            catalog={catalog}
            categories={categories}
            quantities={cart.quantities}
            shakeId={shakeId}
            onAdd={handleAdd}
            onSubmitSearch={submitSearch}
            onOpenCamera={() => setCameraOpen(true)}
            serialScanner={serialScanner}
            large={cashierMode}
            onNavigate={onNavigate}
          />

          <aside
            className={`hidden shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:block ${
              cashierMode ? 'w-[28rem] xl:w-[32rem]' : 'w-[25rem] xl:w-[27rem]'
            }`}
            aria-label="Ticket de la venta"
          >
            <Ticket scope="desktop" {...ticketProps} />
          </aside>
        </div>
      </div>

      <MobileTicketSheet
        open={sheetOpen}
        onOpen={() => setSheetOpen(true)}
        onClose={() => setSheetOpen(false)}
        units={cart.totals.units}
        total={cart.totals.total}
      >
        <Ticket scope="mobile" {...ticketProps} />
      </MobileTicketSheet>

      <CameraScannerModal isOpen={cameraOpen} onClose={() => setCameraOpen(false)} onScan={addByCode} />

      <RemoveItemModal
        item={removeTarget}
        requiresAdmin={isVendedor}
        onConfirm={confirmRemove}
        onClose={() => setRemoveTarget(null)}
      />

      <NewCustomerModal
        isOpen={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={created => {
          setCustomer(created);
          setNewCustomerOpen(false);
        }}
      />

      <CheckoutSuccessModal sale={recentSale} onPrint={() => printReceipt(recentSale)} onNewSale={startNewSale} />
    </>
  );
}

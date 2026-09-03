import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, ShoppingCart, Trash2, UserPlus, Printer, CheckCircle, FileText, Download } from 'lucide-react';
import Modal from '../components/Modal';
import { useAuthorization } from '../hooks/useAuthorization';
import { DocumentType, formatDocument, validateDocument } from '../utils/documents';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function SalesPOS() {
  const { isVendedor } = useAuthorization();
  const canApplyDiscount = !isVendedor;
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cart states
  const [cart, setCart] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');

  // Search states
  const [prodSearch, setProdSearch] = useState('');

  // Creation shortcuts modals
  const [isNewCustOpen, setIsNewCustOpen] = useState(false);
  const [newCustDocType, setNewCustDocType] = useState(DocumentType.CEDULA);
  const [newCustDoc, setNewCustDoc] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [creatingCust, setCreatingCust] = useState(false);

  // Success invoice bill modal
  const [recentSale, setRecentSale] = useState(null);
  const [submittingSale, setSubmittingSale] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [prodList, custList] = await Promise.all([
        api.products.list(),
        api.customers.list()
      ]);
      const safeProdList = Array.isArray(prodList) ? prodList : (prodList?.data || []);
      const safeCustList = Array.isArray(custList) ? custList : (custList?.data || []);
      setProducts(safeProdList.filter(p => p.active)); // POS only works for active items
      setCustomers(safeCustList);
    } catch (err) {
      setError(err.message || 'Error al inicializar POS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customers.length > 0 && !selectedCustomerId) {
      // Selecciona automáticamente el primer cliente (usualmente Consumidor Final)
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers]);

  useEffect(() => {
    loadData();
  }, []);

  const handleAddProduct = (prod) => {
    const existing = cart.find(item => item.product.id === prod.id);
    if (existing) {
      if (prod.stock <= existing.quantity) {
        alert(`No hay suficiente stock de ${prod.name}. Stock máximo: ${prod.stock}`);
        return;
      }
      setCart(cart.map(item =>
        item.product.id === prod.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      if (prod.stock < 1) {
        alert(`Producto ${prod.name} no cuenta con stock disponible.`);
        return;
      }
      setCart([...cart, { product: prod, quantity: 1, discount: 0 }]);
    }
  };

  const handleUpdateQty = (prodId, qty) => {
    const item = cart.find(x => x.product.id === prodId);
    if (!item) return;

    if (qty <= 0) {
      handleRemoveItem(prodId);
      return;
    }

    if (item.product.stock < qty) {
      alert(`No hay suficiente stock. Stock máximo disponible: ${item.product.stock}`);
      return;
    }

    setCart(cart.map(x => x.product.id === prodId ? { ...x, quantity: qty } : x));
  };

  const handleUpdateItemDiscount = (prodId, disc) => {
    const item = cart.find(x => x.product.id === prodId);
    if (!item) return;

    const maxDisc = Number(item.product.salePrice || 0) * item.quantity;
    const finalDisc = Math.min(Math.max(0, Number(disc) || 0), maxDisc);

    setCart(cart.map(x => x.product.id === prodId ? { ...x, discount: finalDisc } : x));
  };

  const handleRemoveItem = (prodId) => {
    setCart(cart.filter(x => x.product.id !== prodId));
  };

  // Calculations
  const cartSubtotal = cart.reduce((acc, item) => acc + (Number(item.product.salePrice || 0) * item.quantity), 0);
  const cartItemDiscounts = cart.reduce((acc, item) => acc + Number(item.discount || 0), 0);
  const totalDiscount = cartItemDiscounts + (Number(globalDiscount) || 0);
  const taxableAmount = Math.max(0, cartSubtotal - totalDiscount);
  const cartTax = taxableAmount * 0.18; // 18% ITBIS
  const cartTotal = taxableAmount + cartTax;

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustDoc || !newCustName) return;
    if (!validateDocument(newCustDocType, newCustDoc)) {
      alert(newCustDocType === DocumentType.CEDULA
        ? 'Cédula inválida. Formato esperado: XXX-XXXXXXX-X'
        : 'RNC inválido. Formato esperado: XXX-XXXXX-X');
      return;
    }

    try {
      setCreatingCust(true);
      const newCust = await api.customers.create({
        documentId: newCustDoc,
        name: newCustName,
        email: newCustEmail,
        phone: newCustPhone,
        address: newCustAddress
      });
      setCustomers([...customers, newCust]);
      setSelectedCustomerId(newCust.id);
      setIsNewCustOpen(false);
      // Clean form
      setNewCustDoc('');
      setNewCustName('');
      setNewCustEmail('');
      setNewCustPhone('');
      setNewCustAddress('');
    } catch (err) {
      alert(err.message || 'Error al guardar cliente');
    } finally {
      setCreatingCust(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('El carrito de compras se encuentra vacío.');
      return;
    }

    if (!selectedCustomerId) {
      alert('Por favor seleccione un cliente para la venta.');
      return;
    }

    try {
      setSubmittingSale(true);
      const details = cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        discount: Number(item.discount || 0)
      }));

      const payload = {
        customerId: selectedCustomerId,
        details,
        discount: Number(globalDiscount || 0),
        paymentMethod: (paymentMethod || 'EFECTIVO').toUpperCase()
      };

      const saleReceipt = await api.sales.create(payload);
      setRecentSale(saleReceipt);
      setCart([]);
      setGlobalDiscount(0);
      setPaymentMethod('EFECTIVO');
      // Reload stocks
      loadData();
    } catch (err) {
      alert(err.message || 'Error al procesar venta');
    } finally {
      setSubmittingSale(false);
    }
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const filteredProducts = safeProducts.filter(p =>
    (p.name || '').toLowerCase().includes((prodSearch || '').toLowerCase()) ||
    (p.code || '').toLowerCase().includes((prodSearch || '').toLowerCase())
  );

  /**
   * Genera comprobante fiscal / factura oficial en formato PDF profesional usando jsPDF y jspdf-autotable.
   */
  const handlePrint = () => {
    if (!recentSale) return;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      // Top decorative bar
      doc.setFillColor(79, 70, 229); // Indigo 600
      doc.rect(0, 0, pageWidth, 5, 'F');

      // Header: Business Information
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(30, 41, 59); // Slate 800
      doc.text('SALESPRO v2', 14, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text('Sistema de Facturación & Control de Inventarios', 14, 23);
      doc.text('RNC: 1-31-88942-1 | Registro Mercantil: 104299', 14, 27.5);
      doc.text('Av. 27 de Febrero #100, Santo Domingo, Rep. Dom.', 14, 32);
      doc.text('Tel: (809) 555-0199 | Email: ventas@salespro.com', 14, 36.5);

      // NCF / Invoice Badge Box (Right side)
      const badgeX = pageWidth - 80;
      const badgeY = 12;
      const badgeWidth = 66;
      const badgeHeight = 27;

      doc.setFillColor(248, 250, 252); // Slate 50
      doc.setDrawColor(199, 210, 254); // Indigo 200
      doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(79, 70, 229); // Indigo 600
      doc.text('FACTURA / COMPROBANTE FISCAL', badgeX + badgeWidth / 2, badgeY + 6, { align: 'center' });

      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(recentSale.invoiceNumber || 'B0200000001', badgeX + badgeWidth / 2, badgeY + 13.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const ncfLabel = recentSale.ncfType === 'B01'
        ? 'Crédito Fiscal (B01)'
        : recentSale.ncfType === 'B02'
          ? 'Consumo Final (B02)'
          : `Tipo NCF: ${recentSale.ncfType || 'B02'}`;
      doc.text(ncfLabel, badgeX + badgeWidth / 2, badgeY + 19, { align: 'center' });
      doc.text('Válido para fines tributarios', badgeX + badgeWidth / 2, badgeY + 23.5, { align: 'center' });

      // Horizontal Divider
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.setLineWidth(0.5);
      doc.line(14, 43, pageWidth - 14, 43);

      // Metadata Grid: Customer Info & Transaction Info
      const custName = recentSale.customerName || recentSale.customer?.name || 'CONSUMIDOR FINAL';
      const custDoc = recentSale.customer?.documentId || recentSale.customer?.rnc || '000-0000000-0';
      const custPhone = recentSale.customer?.phone || recentSale.customer?.address || 'N/D';

      const saleDate = new Date(recentSale.createdAt || Date.now()).toLocaleString('es-DO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const payment = recentSale.paymentMethod || 'EFECTIVO';
      const cashier = recentSale.userName || recentSale.user?.fullName || 'Cajero Principal';

      // Column 1: Customer Details
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('DATOS DEL CLIENTE', 14, 48);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`Nombre / Razón:`, 14, 53);
      doc.setFont('helvetica', 'bold');
      doc.text(custName.substring(0, 35), 40, 53);

      doc.setFont('helvetica', 'normal');
      doc.text(`RNC / Cédula:`, 14, 58);
      doc.setFont('helvetica', 'bold');
      doc.text(custDoc, 40, 58);

      doc.setFont('helvetica', 'normal');
      doc.text(`Contacto:`, 14, 63);
      doc.text(custPhone.substring(0, 35), 40, 63);

      // Column 2: Sale & Fiscal Details
      const col2X = 118;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('DATOS DE EMISIÓN', col2X, 48);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`Fecha Emisión:`, col2X, 53);
      doc.text(saleDate, col2X + 26, 53);

      doc.text(`Método Pago:`, col2X, 58);
      doc.setFont('helvetica', 'bold');
      doc.text(payment, col2X + 26, 58);

      doc.setFont('helvetica', 'normal');
      doc.text(`Vendedor/Caja:`, col2X, 63);
      doc.text(cashier, col2X + 26, 63);

      // Detailed Items Table
      const tableRows = (recentSale.details || []).map((det, index) => {
        const qty = det.quantity || 1;
        const unit = Number(det.unitPrice || 0);
        const disc = Number(det.discount || 0);
        const sub = Number(det.subtotal || (unit * qty - disc));

        return [
          index + 1,
          det.productName || det.product?.name || `Artículo #${index + 1}`,
          qty,
          `$${unit.toFixed(2)}`,
          disc > 0 ? `-$${disc.toFixed(2)}` : '$0.00',
          `$${sub.toFixed(2)}`
        ];
      });

      autoTable(doc, {
        startY: 68,
        head: [['#', 'Descripción del Producto', 'Cant.', 'Precio Unit.', 'Desc.', 'Total']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [79, 70, 229], // Indigo 600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'left',
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 'auto', halign: 'left' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 26, halign: 'right' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
        },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2.5,
          textColor: [30, 41, 59],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 14, right: 14 },
      });

      // Totals Calculations Box
      let finalY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 6 : 120;
      if (finalY > 235) {
        doc.addPage();
        finalY = 20;
      }

      const totalBoxX = pageWidth - 80;
      const totalBoxWidth = 66;

      const subtotalVal = Number(recentSale.subtotal || 0);
      const discountVal = Number(recentSale.discount || 0);
      const taxVal = Number(recentSale.tax || 0);
      const totalVal = Number(recentSale.total || 0);

      // Left column: Commercial notes / fiscal compliance
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('TÉRMINOS & CONDICIONES', 14, finalY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.text('• Comprobante fiscal electrónico conforme a las normativas de la DGII.', 14, finalY + 9);
      doc.text('• No se aceptan devoluciones sin la presentación de este comprobante.', 14, finalY + 13.5);
      doc.text('• ¡Gracias por su compra y preferir nuestros servicios!', 14, finalY + 18);

      // Right column: Financial Summary
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105); // Slate 600

      doc.text('Subtotal:', totalBoxX, finalY + 4);
      doc.text(`$${subtotalVal.toFixed(2)}`, pageWidth - 14, finalY + 4, { align: 'right' });

      doc.text('Descuentos:', totalBoxX, finalY + 9);
      doc.setTextColor(225, 29, 72); // Rose 600
      doc.text(`-$${discountVal.toFixed(2)}`, pageWidth - 14, finalY + 9, { align: 'right' });

      doc.setTextColor(71, 85, 105);
      doc.text('ITBIS (18%):', totalBoxX, finalY + 14);
      doc.text(`$${taxVal.toFixed(2)}`, pageWidth - 14, finalY + 14, { align: 'right' });

      // Total Final Highlight Box
      doc.setFillColor(238, 242, 255); // Indigo 50
      doc.setDrawColor(199, 210, 254); // Indigo 200
      doc.roundedRect(totalBoxX - 2, finalY + 18, totalBoxWidth + 2, 9, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(79, 70, 229); // Indigo 600
      doc.text('TOTAL A PAGAR:', totalBoxX, finalY + 24);
      doc.text(`$${totalVal.toFixed(2)}`, pageWidth - 14, finalY + 24, { align: 'right' });

      // Page Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `SalesPro v2 — Documento Fiscal Digital • Página ${i} de ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 7,
          { align: 'center' }
        );
      }

      // Download / Open PDF directly
      const invoiceFileName = `Factura_${recentSale.invoiceNumber || 'POS'}.pdf`;
      doc.save(invoiceFileName);

      // Open in preview tab for direct printing
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error('Error al generar PDF de factura:', err);
      alert('Ocurrió un error al generar el PDF del comprobante.');
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Iniciando Terminal de Ventas (POS)...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="pos-view">
      {/* Products Column (7/12) */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-md flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-500" />
              Terminal de Facturación
            </h3>
            <p className="text-xs text-slate-400">Selecciona los productos y cantidades para el cliente.</p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[650px] overflow-y-auto pr-1">
          {filteredProducts.map((p) => {
            const isLow = p.stock <= p.minStock;
            return (
              <div
                key={p.id}
                onClick={() => handleAddProduct(p)}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-sm hover:shadow-md cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">{p.code}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${p.stock === 0 ? 'bg-red-50 dark:bg-red-950/20 text-red-600' :
                      isLow ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600' :
                        'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
                      }`}>
                      Stock: {p.stock}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                    {p.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 line-clamp-1">{p.description}</p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    ${p.salePrice.toFixed(2)}
                  </span>
                  <button className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 p-1.5 rounded-lg transition-colors cursor-pointer">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 font-mono text-xs">
              No se encontraron productos disponibles.
            </div>
          )}
        </div>
      </div>

      {/* Cart Column (5/12) */}
      <div className="lg:col-span-5 space-y-4">
        {/* Customer Selector card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="customer-select" className="text-xs font-bold text-slate-700 dark:text-slate-300">Cliente de la Factura</label>
            <button
              onClick={() => {
                setNewCustDocType(DocumentType.CEDULA);
                setIsNewCustOpen(true);
              }}
              className="text-xs text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" /> Nuevo Cliente
            </button>
          </div>
          <select
            id="customer-select"
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id} className="dark:bg-slate-950 text-xs">
                {c.name} ({c.documentId})
              </option>
            ))}
          </select>
        </div>

        {/* Selected Items List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm p-4 flex flex-col justify-between min-h-[450px]">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider font-mono">
              Detalle de Compra ({cart.length} items)
            </h4>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{item.product.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">${item.product.salePrice.toFixed(2)} c/u</p>
                    </div>

                    {/* Quantity controls & Line discount */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">Cant:</span>
                        <input
                          type="number"
                          min="1"
                          max={item.product.stock}
                          value={item.quantity}
                          onChange={(e) => handleUpdateQty(item.product.id, parseInt(e.target.value) || 1)}
                          className="w-12 text-center p-0.5 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono bg-transparent"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">Desc:</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="0.00"
                          disabled={!canApplyDiscount}
                          title={!canApplyDiscount ? 'Descuentos solo disponibles para administradores' : undefined}
                          value={item.discount || ''}
                          onChange={(e) => handleUpdateItemDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                          className="w-16 text-center p-0.5 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono bg-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/40"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pricing action Column */}
                  <div className="flex flex-col items-end justify-between self-stretch">
                    <button
                      onClick={() => handleRemoveItem(item.product.id)}
                      className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Quitar producto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                      ${((item.product.salePrice * item.quantity) - item.discount).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center space-y-2">
                  <ShoppingCart className="w-10 h-10 text-slate-300 stroke-1" />
                  <p className="text-xs font-mono">El carrito está vacío.</p>
                </div>
              )}
            </div>
          </div>

          {/* Pricing aggregates summary */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 space-y-3.5">
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-500">
                <span>Descuento Aplicado</span>
                <span className="font-mono">-${totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>ITBIS (18%)</span>
                <span className="font-mono">${cartTax.toFixed(2)}</span>
              </div>

              {/* Global Discount input */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-semibold text-slate-500">Descuento Global Adicional ($):</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  disabled={!canApplyDiscount}
                  title={!canApplyDiscount ? 'Descuentos solo disponibles para administradores' : undefined}
                  value={globalDiscount || ''}
                  onChange={(e) => setGlobalDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-20 text-right px-1.5 py-0.5 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono bg-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/40"
                />
              </div>

              {/* Payment Method - Only Efectivo & Tarjeta */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-semibold text-slate-500">Método de Pago:</span>
                <div className="flex gap-2">
                  {[
                    { id: 'EFECTIVO', label: 'Efectivo' },
                    { id: 'TARJETA', label: 'Tarjeta' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPaymentMethod(item.id)}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${paymentMethod === item.id
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">TOTAL FACTURADO</span>
              <span className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                ${cartTotal.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={submittingSale || cart.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 py-3 rounded-lg text-white font-bold text-sm transition-all shadow hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {submittingSale ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando Cobro...
                </>
              ) : (
                'Completar Venta & Generar Factura'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Form Dialog for New Client */}
      <Modal
        isOpen={isNewCustOpen}
        onClose={() => setIsNewCustOpen(false)}
        title="Registrar Nuevo Cliente"
        maxWidth="md"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="client-doctype" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tipo de Documento *
              </label>
              <select
                id="client-doctype"
                value={newCustDocType}
                onChange={(e) => {
                  const next = e.target.value;
                  setNewCustDocType(next);
                  setNewCustDoc(formatDocument(next, newCustDoc));
                }}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value={DocumentType.CEDULA} className="dark:bg-slate-950">Cédula</option>
                <option value={DocumentType.RNC} className="dark:bg-slate-950">RNC (Empresa)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="client-doc" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Nro. Documento *
              </label>
              <input
                id="client-doc"
                type="text"
                required
                placeholder={newCustDocType === DocumentType.CEDULA ? 'XXX-XXXXXXX-X' : 'XXX-XXXXX-X'}
                maxLength={newCustDocType === DocumentType.CEDULA ? 13 : 11}
                value={newCustDoc}
                onChange={(e) => setNewCustDoc(formatDocument(newCustDocType, e.target.value))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="client-name" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Nombre Completo / Razón Social *
              </label>
              <input
                id="client-name"
                type="text"
                required
                placeholder="Ej. Juan Pérez / Empresa SRL"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="client-email" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Correo Electrónico
              </label>
              <input
                id="client-email"
                type="email"
                placeholder="ejemplo@email.com"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="client-phone" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Teléfono / Celular
              </label>
              <input
                id="client-phone"
                type="text"
                placeholder="Ej. 8095551234"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1.5">
              <label htmlFor="client-addr" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Dirección Fiscal
              </label>
              <input
                id="client-addr"
                type="text"
                placeholder="Av. Winston Churchill #45"
                value={newCustAddress}
                onChange={(e) => setNewCustAddress(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3 justify-end">
            <button
              type="button"
              onClick={() => setIsNewCustOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingCust}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {creatingCust ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                'Registrar Cliente'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bill receipt printer modal */}
      <Modal
        isOpen={recentSale !== null}
        onClose={() => setRecentSale(null)}
        title="Facturación Completada Correctamente"
        maxWidth="lg"
      >
        {recentSale && (
          <div className="space-y-6">
            <div className="text-center space-y-1 text-slate-800 dark:text-slate-200 py-2 border-b border-slate-100 dark:border-slate-800">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-1" />
              <h4 className="text-md font-bold font-sans">¡Transacción Exitosa!</h4>
              <p className="text-xs text-slate-400">Comprobante fiscal generado con validez comercial.</p>
            </div>

            {/* Print Preview Layout */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-slate-50/50 dark:bg-slate-900/50 space-y-4 font-mono text-xs">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="font-sans font-extrabold text-slate-900 dark:text-slate-100 text-sm tracking-wider">SALESPRO v2</h3>
                  <p className="text-[10px] text-slate-400">Av. 27 de Febrero #100</p>
                  <p className="text-[10px] text-slate-400">Santo Domingo, D.N. - Rep. Dom.</p>
                  <p className="text-[10px] text-slate-400">RNC: 1-31-88942-1</p>
                </div>
                <div className="border border-indigo-200 dark:border-indigo-900/50 px-3 py-2 text-center rounded-lg bg-white dark:bg-slate-900">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 text-[11px]">COMPROBANTE FISCAL</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">{recentSale.invoiceNumber}</p>
                  <span className="text-[9px] text-slate-400 font-sans">
                    {recentSale.ncfType === 'B01' ? 'Crédito Fiscal' : 'Consumidor Final'}
                  </span>
                </div>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-slate-400">CLIENTE:</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{recentSale.customerName}</p>
                </div>
                <div>
                  <p className="text-slate-400">FECHA EMISIÓN:</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{new Date(recentSale.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400">MÉTODO PAGO:</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{recentSale.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-slate-400">VENDEDOR:</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{recentSale.userName}</p>
                </div>
              </div>

              {/* Items details table */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                      <th className="pb-1.5 font-medium">Descripción</th>
                      <th className="pb-1.5 text-center font-medium">Cant.</th>
                      <th className="pb-1.5 text-right font-medium">Precio</th>
                      <th className="pb-1.5 text-right font-medium">Desc.</th>
                      <th className="pb-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {recentSale.details.map((det, index) => (
                      <tr key={index} className="text-slate-800 dark:text-slate-200">
                        <td className="py-2 pr-2">{det.productName}</td>
                        <td className="py-2 text-center">{det.quantity}</td>
                        <td className="py-2 text-right">${det.unitPrice.toFixed(2)}</td>
                        <td className="py-2 text-right text-rose-500">
                          {det.discount > 0 ? `-$${det.discount.toFixed(2)}` : '$0.00'}
                        </td>
                        <td className="py-2 text-right font-semibold">${det.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bill totals calculations */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-right text-[11px] ml-auto max-w-[220px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">SUBTOTAL:</span>
                  <span>${recentSale.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-500">
                  <span className="text-slate-400">DESCUENTOS:</span>
                  <span>-${recentSale.discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ITBIS (18%):</span>
                  <span>${recentSale.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5 font-bold text-slate-900 dark:text-slate-100">
                  <span>TOTAL FACTURADO:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">${recentSale.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRecentSale(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cerrar Terminal
              </button>
              <button
                onClick={handlePrint}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Descargar / Imprimir Factura (PDF)
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

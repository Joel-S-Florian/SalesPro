import { motion, AnimatePresence } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { X, FileText, User, Printer } from 'lucide-react';
import { api } from '../services/api';

export default function SaleDetailModal({ isOpen, onClose, saleId }) {
  const { data: queryResult, isLoading, error } = useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: () => api.sales.get(saleId),
    enabled: !!saleId && isOpen,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  // Normalizar la respuesta: el backend puede devolver { data: sale } o el objeto directo
  const sale = queryResult?.data || queryResult;

  const formatCurrency = (val) => `$${Number(val || 0).toFixed(2)}`;
  const formatDate = (date) =>
    new Date(date).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (!isOpen || !saleId) return null;

  // Cálculos de totales
  const subtotal = Number(sale?.subtotal || 0);
  const discount = Number(sale?.discount || 0);
  const tax = Number(sale?.tax || 0);
  const total = Number(sale?.total || 0);
  const taxableAmount = Math.max(0, subtotal - discount);

  // Componente reutilizable para estados internos (carga, error, vacío)
  const StatusView = ({ children }) => (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
              <div className="p-6 text-center">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (isLoading) {
    return (
      <StatusView>
        <div className="animate-spin w-8 h-8 mx-auto mb-4 border-4 border-indigo-600 border-t-transparent rounded-full" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">Cargando detalle de factura...</p>
      </StatusView>
    );
  }

  if (error) {
    return (
      <StatusView>
        <p className="text-red-600 dark:text-red-400 text-sm">
          {error.message || 'Error al cargar el detalle'}
        </p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
        >
          Cerrar
        </button>
      </StatusView>
    );
  }

  if (!sale) {
    return (
      <StatusView>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Factura no encontrada</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
        >
          Cerrar
        </button>
      </StatusView>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
              {/* Header */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2.5 rounded-lg text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-sans">
                      Comprobante Fiscal
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {sale.invoiceNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto p-6 space-y-6 max-h-[calc(90vh-120px)]">
                {/* Meta Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                      Fecha de Emisión
                    </p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 font-mono">
                      {formatDate(sale.createdAt)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                      Método de Pago
                    </p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sale.paymentMethod === 'EFECTIVO'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700'
                          }`}
                      >
                        {sale.paymentMethod}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                      Tipo NCF
                    </p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {sale.ncfType}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                      Vendedor
                    </p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {sale.user?.fullName || sale.userName || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-4"></div>

                {/* Client Info */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono uppercase tracking-wider">
                    <User className="w-3.5 h-3.5" />
                    Datos del Cliente
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Nombre / Razón Social</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {sale.customer?.name || sale.customerName || 'Consumidor Final'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">RNC / Cédula</p>
                      <p className="font-mono font-medium text-slate-800 dark:text-slate-100">
                        {sale.customer?.documentId ||
                          sale.customer?.rnc ||
                          sale.customerRnc ||
                          'N/A'}
                      </p>
                    </div>
                    {sale.customer?.email && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Correo</p>
                        <p className="text-slate-800 dark:text-slate-100">{sale.customer.email}</p>
                      </div>
                    )}
                    {sale.customer?.phone && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Teléfono</p>
                        <p className="text-slate-800 dark:text-slate-100 font-mono">
                          {sale.customer.phone}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                    Detalle de Items
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                      <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Producto</th>
                          <th className="px-4 py-3 text-center">Cant.</th>
                          <th className="px-4 py-3 text-right">Precio Unit.</th>
                          <th className="px-4 py-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {(sale.details || sale.saleDetails || []).map((detail, idx) => (
                          <tr
                            key={detail.id || idx}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25"
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800 dark:text-slate-200">
                                {detail.productName}
                              </p>
                              {detail.product?.code && (
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {detail.product.code}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-mono">{detail.quantity}</td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatCurrency(detail.unitPrice)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold font-mono text-slate-900 dark:text-slate-100">
                              {formatCurrency(detail.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2 ml-auto max-w-[300px]">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-rose-600 dark:text-rose-400">
                      <span>Descuento</span>
                      <span className="font-mono">-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Base Imponible</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {formatCurrency(taxableAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">ITBIS (18%)</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {formatCurrency(tax)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-lg font-bold text-slate-900 dark:text-slate-100">
                    <span>Total</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-2xl">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
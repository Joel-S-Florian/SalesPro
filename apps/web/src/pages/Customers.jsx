import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Edit2, Trash2, History, Calendar, FileText, ShoppingBag } from 'lucide-react';
import Modal from '../components/Modal';
import { DocumentType, formatDocument, validateDocument } from '../utils/documents';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search filter
  const [search, setSearch] = useState('');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [docType, setDocType] = useState(DocumentType.CEDULA);
  const [documentId, setDocumentId] = useState('');
  const [docError, setDocError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // History states
  const [selectedCustHistory, setSelectedCustHistory] = useState(null);
  const [custSales, setCustSales] = useState([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [cList, sList] = await Promise.all([
        api.customers.list(),
        api.sales.list()
      ]);
      setCustomers(Array.isArray(cList) ? cList : (cList?.data || []));
      setSales(Array.isArray(sList) ? sList : (sList?.data || []));
    } catch (err) {
      setError(err.message || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setDocType(DocumentType.CEDULA);
    setDocumentId('');
    setDocError('');
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setIsFormOpen(true);
  };

  const openEditModal = (c) => {
    setEditingId(c.id);
    const digits = (c.documentId || '').replace(/\D/g, '');
    setDocType(digits.length === 9 ? DocumentType.RNC : DocumentType.CEDULA);
    setDocumentId(c.documentId || '');
    setDocError('');
    setName(c.name || '');
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setIsFormOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!documentId.trim() || !name.trim()) return;
    if (!validateDocument(docType, documentId.trim())) {
      setDocError(docType === DocumentType.CEDULA
        ? 'Cédula inválida. Formato esperado: XXX-XXXXXXX-X'
        : 'RNC inválido. Formato esperado: XXX-XXXXX-X');
      return;
    }
    setDocError('');

    try {
      setSaving(true);
      const payload = { documentId, name, email, phone, address };
      if (editingId) {
        await api.customers.update(editingId, payload);
      } else {
        await api.customers.create(payload);
      }
      setIsFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al guardar cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (id) => {
    if (!confirm('¿Está seguro de eliminar este cliente?')) return;

    try {
      await api.customers.delete(id);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al eliminar cliente');
    }
  };

  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeSales = Array.isArray(sales) ? sales : [];

  const openHistoryModal = (c) => {
    const filteredSales = safeSales.filter(s => s.customerId === c.id);
    setSelectedCustHistory(c);
    setCustSales(filteredSales);
  };

  const filteredCustomers = safeCustomers.filter(c =>
    (c.name || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (c.documentId || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (c.email || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (c.phone || '').includes(search || '')
  );

  if (loading && safeCustomers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando catálogo de clientes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="customers-view">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Directorio de Clientes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Administra los perfiles de facturación y supervisa el historial de compras de tus clientes.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all w-full sm:w-auto justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Agregar Cliente
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por DNI/RUC, nombre o correo de cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Table grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4">Doc. Identidad</th>
                <th className="px-6 py-4">Nombre Completo</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4">Dirección Fiscal</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                  <td className="px-6 py-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {c.documentId}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</span>
                    {c.id === 'cust_final' && (
                      <span className="ml-2 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono uppercase font-bold">Comodín</span>
                    )}
                  </td>
                  <td className="px-6 py-4 space-y-0.5">
                    <p className="text-slate-700 dark:text-slate-300 font-medium">{c.email || '-'}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{c.phone || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-500 max-w-xs truncate">{c.address || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openHistoryModal(c)}
                        className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Ver Historial de Compras"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(c)}
                        disabled={c.id === 'cust_final'}
                        className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(c.id)}
                        disabled={c.id === 'cust_final'}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-30 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400 font-mono">
                    Ningún cliente coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Editar Perfil del Cliente' : 'Nuevo Registro de Cliente'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="form-doctype" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tipo de Documento *
              </label>
              <select
                id="form-doctype"
                value={docType}
                onChange={(e) => {
                  const next = e.target.value;
                  setDocType(next);
                  setDocumentId(formatDocument(next, documentId));
                  setDocError('');
                }}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value={DocumentType.CEDULA} className="dark:bg-slate-950">Cédula</option>
                <option value={DocumentType.RNC} className="dark:bg-slate-950">RNC (Empresa)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="form-doc" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Número de Documento *
              </label>
              <input
                id="form-doc"
                type="text"
                required
                placeholder={docType === DocumentType.CEDULA ? 'XXX-XXXXXXX-X' : 'XXX-XXXXX-X'}
                maxLength={docType === DocumentType.CEDULA ? 13 : 11}
                value={documentId}
                onChange={(e) => {
                  setDocumentId(formatDocument(docType, e.target.value));
                  setDocError('');
                }}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
              {docError && (
                <p className="text-[10px] text-rose-500">{docError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="form-name" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Nombre Completo o Razón Social *
              </label>
              <input
                id="form-name"
                type="text"
                required
                placeholder="Ej. Soluciones Perú S.A.C."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="form-email" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Dirección de Correo Electrónico
              </label>
              <input
                id="form-email"
                type="email"
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="form-phone" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Nro. Teléfono / Móvil
              </label>
              <input
                id="form-phone"
                type="text"
                placeholder="Ej. 987654321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1.5">
              <label htmlFor="form-address" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Dirección Habitual / Oficina
              </label>
              <input
                id="form-address"
                type="text"
                placeholder="Calle Las Palmeras 124, San Isidro"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3 justify-end">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                'Guardar Perfil'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase History Modal */}
      <Modal
        isOpen={selectedCustHistory !== null}
        onClose={() => setSelectedCustHistory(null)}
        title={`Historial de Compras: ${selectedCustHistory?.name}`}
        maxWidth="lg"
      >
        {selectedCustHistory && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px] font-mono grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <p className="text-slate-400">DOCUMENTO ID:</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{selectedCustHistory.documentId}</p>
              </div>
              <div>
                <p className="text-slate-400">TELÉFONO:</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{selectedCustHistory.phone || '-'}</p>
              </div>
              <div>
                <p className="text-slate-400">TOTAL FACTURADO:</p>
                <p className="font-bold text-indigo-600 dark:text-indigo-400">
                  ${custSales.reduce((acc, x) => acc + Number(x.total || 0), 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-slate-400">BOLETAS TOTALES:</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{custSales.length} comprobantes</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {custSales.map((sale) => (
                <div key={sale.id} className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="bg-slate-100/50 dark:bg-slate-800/40 px-4 py-2.5 flex items-center justify-between text-xs border-b border-slate-200 dark:border-slate-800">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" /> {sale.invoiceNumber || 'Comprobante'}
                    </span>
                    <span className="text-slate-500 font-mono flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                      Total: ${Number(sale.total || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 text-[11px] space-y-1 bg-white dark:bg-slate-900">
                    {(sale.details || []).map((det, dIdx) => (
                      <div key={dIdx} className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-mono">
                        <span className="truncate max-w-[70%]">{det.productName || 'Item'}</span>
                        <span>{det.quantity || 1} uds x ${Number(det.unitPrice || 0).toFixed(2)} = ${Number(det.subtotal || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-slate-100 dark:border-slate-800/50 pt-2 text-[10px] text-slate-400">
                      <span>Método Pago: {sale.paymentMethod || 'Efectivo'}</span>
                      <span>Responsable: {sale.userName || 'Sistema'}</span>
                    </div>
                  </div>
                </div>
              ))}

              {custSales.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center space-y-2">
                  <ShoppingBag className="w-10 h-10 stroke-1 text-slate-300" />
                  <p className="text-xs font-mono">Este cliente no registra compras históricas.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCustHistory(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                Cerrar Historial
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../services/api';
import { DocumentType, formatDocument, validateDocument } from '../../utils/documents';
import { notify } from '../../utils/notify';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/form';

const EMPTY = { docType: DocumentType.CEDULA, documentId: '', name: '', email: '', phone: '', address: '' };

/** Alta rápida de cliente desde el POS. Al guardar devuelve el cliente creado ya seleccionado. */
export default function NewCustomerModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const close = () => {
    if (busy) return;
    setForm(EMPTY);
    onClose();
  };

  const submit = async event => {
    event.preventDefault();
    if (!validateDocument(form.docType, form.documentId)) {
      notify.warning(
        form.docType === DocumentType.CEDULA
          ? 'La cédula no es válida. Formato: 000-0000000-0.'
          : 'El RNC no es válido. Formato: 000-00000-0.'
      );
      return;
    }
    try {
      setBusy(true);
      const created = await api.customers.create({
        documentId: form.documentId,
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
      });
      notify.success('Cliente registrado');
      setForm(EMPTY);
      onCreated(created);
    } catch (err) {
      notify.error(err.message || 'No se pudo registrar el cliente');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Cliente nuevo" maxWidth="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="nc-doctype" label="Tipo de documento">
            <select
              id="nc-doctype"
              value={form.docType}
              onChange={e => setForm(prev => ({ ...prev, docType: e.target.value, documentId: formatDocument(e.target.value, prev.documentId) }))}
              className={inputClass}
            >
              <option value={DocumentType.CEDULA}>Cédula</option>
              <option value={DocumentType.RNC}>RNC (empresa)</option>
            </select>
          </Field>
          <Field id="nc-doc" label="Número">
            <input
              id="nc-doc"
              type="text"
              inputMode="numeric"
              name="document"
              autoComplete="off"
              required
              placeholder={form.docType === DocumentType.CEDULA ? '000-0000000-0' : '000-00000-0'}
              maxLength={form.docType === DocumentType.CEDULA ? 13 : 11}
              value={form.documentId}
              onChange={e => set('documentId', formatDocument(form.docType, e.target.value))}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field id="nc-name" label="Nombre o razón social" className="sm:col-span-2">
            <input
              id="nc-name"
              type="text"
              name="name"
              autoComplete="off"
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="nc-email" label="Correo electrónico (opcional)">
            <input id="nc-email" type="email" name="email" autoComplete="off" value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} />
          </Field>
          <Field id="nc-phone" label="Teléfono (opcional)">
            <input id="nc-phone" type="tel" name="phone" autoComplete="off" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} />
          </Field>
          <Field id="nc-address" label="Dirección (opcional)" className="sm:col-span-2">
            <input id="nc-address" type="text" name="address" autoComplete="off" value={form.address} onChange={e => set('address', e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Guardando…' : 'Registrar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CircleAlert, Copy, FileKey2, Loader2, PlugZap, Plus, Power, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { api } from '../../services/api';
import Modal from '../Modal';
import { Skeleton } from '../Skeleton';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/form';
import { dateTime } from '../../utils/format';
import { notify } from '../../utils/notify';

const MODES = [
  { id: 'OFF', label: 'Apagado', help: 'Solo comprobantes de papel (serie B). Es lo normal hasta que la DGII autorice a la empresa.' },
  { id: 'PRECERT', label: 'Pruebas (pre-certificación)', help: 'Envía a testecf para practicar y completar el set de pruebas. Sin validez fiscal.' },
  { id: 'CERT', label: 'Certificación', help: 'Ambiente certecf de la DGII. Sin validez fiscal.' },
  { id: 'PROD', label: 'Producción', help: 'Los comprobantes tienen validez fiscal. Actívelo solo después de que la DGII habilite a la empresa.' },
];

const card = 'rounded-xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const dateOnly = value => (value ? new Date(value).toLocaleDateString('es-DO') : '—');

function Step({ number, title, done, children, aside }) {
  return (
    <section className={card}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
            {done ? <BadgeCheck className="h-4 w-4" aria-label="Completado" /> : number}
          </span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Notice({ tone = 'amber', children }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400',
    blue: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300',
  };
  return (
    <div role={tone === 'red' ? 'alert' : undefined} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${tones[tone]}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------ 1. Datos fiscales ------------------------------ */

function FiscalData({ config, onSaved }) {
  const [form, setForm] = useState({
    legalName: config.legalName,
    tradeName: config.tradeName,
    address: config.address,
    municipalityCode: config.municipalityCode,
    provinceCode: config.provinceCode,
    economicActivity: config.economicActivity,
  });
  const [saving, setSaving] = useState(false);
  const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));

  const save = async event => {
    event.preventDefault();
    try {
      setSaving(true);
      onSaved(await api.ecf.saveConfig(form));
      notify.success('Datos fiscales guardados');
    } catch (err) {
      notify.error(err.message || 'No se pudieron guardar los datos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Step number={1} title="Datos fiscales" done={Boolean(config.rnc && config.legalName)}>
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field id="ecf-rnc" label="RNC de la empresa" hint="Se toma del registro de la empresa. Debe coincidir con el titular del certificado.">
          <input id="ecf-rnc" value={config.rnc || 'Sin RNC registrado'} readOnly className={`${inputClass} font-mono`} />
        </Field>
        <Field id="ecf-legal" label="Razón social">
          <input id="ecf-legal" value={form.legalName} onChange={set('legalName')} maxLength={150} className={inputClass} required />
        </Field>
        <Field id="ecf-trade" label="Nombre comercial (opcional)">
          <input id="ecf-trade" value={form.tradeName} onChange={set('tradeName')} maxLength={150} className={inputClass} />
        </Field>
        <Field id="ecf-address" label="Dirección fiscal">
          <input id="ecf-address" value={form.address} onChange={set('address')} maxLength={250} className={inputClass} />
        </Field>
        <Field id="ecf-province" label="Código de provincia" hint="Según la tabla de la DGII (por ejemplo 01).">
          <input id="ecf-province" value={form.provinceCode} onChange={set('provinceCode')} maxLength={10} inputMode="numeric" className={`${inputClass} font-mono`} />
        </Field>
        <Field id="ecf-municipality" label="Código de municipio" hint="Según la tabla de la DGII (por ejemplo 010101).">
          <input id="ecf-municipality" value={form.municipalityCode} onChange={set('municipalityCode')} maxLength={10} inputMode="numeric" className={`${inputClass} font-mono`} />
        </Field>
        <div className="flex justify-end md:col-span-2">
          <button type="submit" disabled={saving} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar datos
          </button>
        </div>
      </form>
    </Step>
  );
}

/* ------------------------------- 2. Certificado -------------------------------- */

function Certificate({ config, onSaved }) {
  const cert = config.certificate;
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const readBase64 = selected =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(selected);
    });

  const upload = async event => {
    event.preventDefault();
    if (!file) return notify.warning('Seleccione el archivo del certificado (.p12)');
    try {
      setBusy(true);
      const result = await api.ecf.uploadCertificate({ fileBase64: await readBase64(file), password });
      onSaved(result.config);
      setFile(null);
      setPassword('');
      if (result.warning) notify.warning(result.warning);
      else notify.success('Certificado guardado de forma segura');
    } catch (err) {
      notify.error(err.message || 'No se pudo guardar el certificado');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      setBusy(true);
      onSaved(await api.ecf.removeCertificate());
      setConfirmRemove(false);
      notify.success('Certificado eliminado; la facturación electrónica quedó apagada');
    } catch (err) {
      notify.error(err.message || 'No se pudo eliminar el certificado');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Step number={2} title="Certificado digital" done={cert.loaded}>
      {!config.encryptionReady && (
        <div className="mb-3">
          <Notice tone="red">El servidor no tiene configurada la llave de cifrado (<code>ECF_MASTER_KEY</code>). No se pueden guardar certificados hasta configurarla.</Notice>
        </div>
      )}

      {cert.loaded ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
            <FileKey2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
            <dl className="min-w-0 flex-1 space-y-1 text-xs">
              <div className="flex flex-wrap gap-x-2"><dt className="text-slate-400">Titular</dt><dd className="break-all font-medium text-slate-700 dark:text-slate-200">{cert.subject}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="text-slate-400">Emitido por</dt><dd className="break-all text-slate-600 dark:text-slate-300">{cert.issuer}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="text-slate-400">Vigencia</dt><dd className="text-slate-600 dark:text-slate-300">{dateOnly(cert.notBefore)} al {dateOnly(cert.notAfter)}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="text-slate-400">Huella</dt><dd className="break-all font-mono text-[11px] text-slate-500">{cert.fingerprint}</dd></div>
            </dl>
          </div>
          {cert.daysLeft !== null && cert.daysLeft < 0 && <Notice tone="red">El certificado está vencido. Cargue uno vigente.</Notice>}
          {cert.daysLeft !== null && cert.daysLeft >= 0 && cert.daysLeft < 30 && <Notice>El certificado vence en {cert.daysLeft} {cert.daysLeft === 1 ? 'día' : 'días'}. Renuévelo con tiempo.</Notice>}
          {cert.rncMatch === false && <Notice>El titular del certificado no parece corresponder al RNC de la empresa; la DGII lo rechazará en producción.</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setConfirmRemove(true)} className={`${secondaryButtonClass} inline-flex items-center gap-2 text-rose-600`}>
              <Trash2 className="h-4 w-4" /> Eliminar certificado
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={upload} className="grid gap-4 md:grid-cols-2">
          <Field id="ecf-cert-file" label="Archivo del certificado (.p12 o .pfx)" hint="Lo entrega la entidad certificadora (por ejemplo Avansi, DigiFirma o Cámara de Comercio).">
            <input id="ecf-cert-file" type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={event => setFile(event.target.files?.[0] || null)} className={`${inputClass} py-1.5`} />
          </Field>
          <Field id="ecf-cert-pass" label="Contraseña del certificado">
            <input id="ecf-cert-pass" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} className={inputClass} />
          </Field>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" /> Se guarda cifrado en el servidor; la llave privada nunca vuelve al navegador.</p>
            <button type="submit" disabled={busy || !file || !password || !config.encryptionReady} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Guardar certificado
            </button>
          </div>
        </form>
      )}

      <Modal isOpen={confirmRemove} onClose={() => !busy && setConfirmRemove(false)} title="Eliminar certificado" maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Se borrará el certificado y la facturación electrónica quedará <strong>apagada</strong>. Los comprobantes ya emitidos no se afectan.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy} className={secondaryButtonClass}>Cancelar</button>
            <button type="button" onClick={remove} disabled={busy} className={`${primaryButtonClass} !bg-rose-600 hover:!bg-rose-700`}>Eliminar</button>
          </div>
        </div>
      </Modal>
    </Step>
  );
}

/* --------------------------- 3. Secuencias autorizadas --------------------------- */

function Sequences({ types }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ ecfType: 'E32', rangeFrom: '1', rangeTo: '', validUntil: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.ecf.sequences());
    } catch (err) {
      notify.error(err.message || 'No se pudieron cargar los rangos');
      setRows([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async event => {
    event.preventDefault();
    try {
      setBusy(true);
      await api.ecf.createSequence({
        ecfType: form.ecfType,
        rangeFrom: Number(form.rangeFrom),
        rangeTo: Number(form.rangeTo),
        validUntil: form.validUntil || null,
      });
      setForm(prev => ({ ...prev, rangeFrom: '1', rangeTo: '', validUntil: '' }));
      await load();
      notify.success('Rango agregado');
    } catch (err) {
      notify.error(err.message || 'No se pudo agregar el rango');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async row => {
    try {
      await api.ecf.updateSequence(row.id, { active: !row.active });
      await load();
    } catch (err) {
      notify.error(err.message);
    }
  };

  const remove = async row => {
    try {
      await api.ecf.deleteSequence(row.id);
      await load();
    } catch (err) {
      notify.error(err.message);
    }
  };

  const label = code => types.find(t => t.code === code)?.label || code;

  return (
    <Step number={3} title="Secuencias de e-NCF autorizadas" done={Boolean(rows?.length)}>
      <p className="mb-3 text-xs text-slate-500">Son los rangos que la DGII autoriza a la empresa por tipo de comprobante (en pruebas: 1 a 10,000,000; consumo: 1 a 50,000,000).</p>
      {rows === null ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left font-mono text-slate-400 dark:border-slate-800">
                <th className="pb-2 pr-3 font-normal">Tipo</th>
                <th className="pb-2 pr-3 font-normal">Rango</th>
                <th className="pb-2 pr-3 text-right font-normal">Usados</th>
                <th className="pb-2 pr-3 text-right font-normal">Quedan</th>
                <th className="pb-2 pr-3 font-normal">Vence</th>
                <th className="pb-2 pr-3 font-normal">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {rows.map(row => (
                <tr key={row.id} className="text-slate-600 dark:text-slate-300">
                  <td className="py-2 pr-3"><span className="font-semibold">{row.ecfType}</span> <span className="text-slate-400">{label(row.ecfType)}</span></td>
                  <td className="py-2 pr-3 font-mono">{row.rangeFrom.toLocaleString('es-DO')} – {row.rangeTo.toLocaleString('es-DO')}</td>
                  <td className="py-2 pr-3 text-right font-mono">{Math.max(0, row.current - row.rangeFrom + 1).toLocaleString('es-DO')}</td>
                  <td className={`py-2 pr-3 text-right font-mono ${row.remaining < 100 ? 'font-semibold text-rose-600' : ''}`}>{row.remaining.toLocaleString('es-DO')}</td>
                  <td className={`py-2 pr-3 ${row.expired ? 'font-semibold text-rose-600' : ''}`}>{dateOnly(row.validUntil)}{row.expired && ' (vencido)'}</td>
                  <td className="py-2 pr-3">{row.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => toggle(row)} className="mr-3 cursor-pointer text-[11px] font-semibold text-indigo-500 hover:text-indigo-600">{row.active ? 'Desactivar' : 'Activar'}</button>
                    {row.current < row.rangeFrom && (
                      <button type="button" onClick={() => remove(row)} aria-label={`Eliminar rango ${row.ecfType}`} className="cursor-pointer text-[11px] font-semibold text-rose-500 hover:text-rose-600">Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">Aún no hay rangos. Agregue los que la DGII autorizó.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={add} className="mt-4 grid items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 md:grid-cols-5">
        <Field id="seq-type" label="Tipo">
          <select id="seq-type" value={form.ecfType} onChange={event => setForm(prev => ({ ...prev, ecfType: event.target.value }))} className={inputClass}>
            {types.map(t => <option key={t.code} value={t.code}>{t.code} · {t.label}</option>)}
          </select>
        </Field>
        <Field id="seq-from" label="Desde"><input id="seq-from" type="number" min="1" value={form.rangeFrom} onChange={event => setForm(prev => ({ ...prev, rangeFrom: event.target.value }))} className={inputClass} required /></Field>
        <Field id="seq-to" label="Hasta"><input id="seq-to" type="number" min="1" value={form.rangeTo} onChange={event => setForm(prev => ({ ...prev, rangeTo: event.target.value }))} className={inputClass} required /></Field>
        <Field id="seq-valid" label="Vence (opcional)"><input id="seq-valid" type="date" value={form.validUntil} onChange={event => setForm(prev => ({ ...prev, validUntil: event.target.value }))} className={inputClass} /></Field>
        <button type="submit" disabled={busy} className={`${primaryButtonClass} inline-flex items-center justify-center gap-2`}>
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </form>
    </Step>
  );
}

/* ------------------------------ 4. URL a registrar ------------------------------- */

function ReceiverUrls({ urls }) {
  const copy = async value => {
    try {
      await navigator.clipboard.writeText(value);
      notify.success('Copiado');
    } catch {
      notify.warning('No se pudo copiar automáticamente; selecciónelo y cópielo a mano');
    }
  };
  const rows = [
    ['Recepción de e-CF', urls.reception],
    ['Aprobación comercial', urls.commercialApproval],
    ['Autenticación (opcional)', urls.authentication],
  ];
  return (
    <Step number={4} title="Direcciones para registrar ante la DGII" done={urls.isPublic}>
      <p className="mb-3 text-xs text-slate-500">Se indican en la postulación como emisor electrónico. Para recibir comprobantes de otras empresas deben ser direcciones públicas con HTTPS.</p>
      {!urls.isPublic && <div className="mb-3"><Notice tone="blue">Hoy apuntan a este equipo (desarrollo). En producción defina <code>PUBLIC_API_URL</code> con el dominio público del servicio.</Notice></div>}
      <ul className="space-y-2">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className="truncate font-mono text-xs text-slate-700 dark:text-slate-200" title={value}>{value}</p>
            </div>
            <button type="button" onClick={() => copy(value)} aria-label={`Copiar dirección de ${label}`} className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <Copy className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Step>
  );
}

/* ------------------------------ 5. Probar conexión ------------------------------- */

function Connection({ config, onChecked }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const conn = config.connection;

  const test = async () => {
    try {
      setBusy(true);
      const outcome = await api.ecf.testConnection();
      setResult(outcome);
      onChecked();
    } catch (err) {
      setResult({ ok: false, note: err.message });
    } finally {
      setBusy(false);
    }
  };

  const ok = result ? result.ok : conn.ok;
  const note = result ? result.note : conn.note;
  return (
    <Step number={5} title="Probar la conexión con la DGII" done={conn.ok === true}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-slate-500">
          Pide un token a la DGII firmando una semilla con el certificado. El token dura 1 hora y el sistema lo renueva solo; pertenece a la empresa, no a cada usuario.
        </p>
        <button type="button" onClick={test} disabled={busy || !config.certificate.loaded} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Probar conexión
        </button>
      </div>
      <div aria-live="polite" className="mt-3">
        {ok !== null && ok !== undefined && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400'}`}>
            {ok ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="font-semibold">{ok ? 'Conectado' : 'No se pudo conectar'}</p>
              <p>{note}</p>
              {result?.expiresAt && <p className="opacity-80">El token vence {dateTime(result.expiresAt)}.</p>}
              {!result && conn.checkedAt && <p className="opacity-80">Última prueba: {dateTime(conn.checkedAt)}.</p>}
            </div>
          </div>
        )}
      </div>
    </Step>
  );
}

/* ------------------------------------ 6. Modo ------------------------------------ */

function Mode({ config, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [confirmProd, setConfirmProd] = useState(false);

  const change = async mode => {
    try {
      setBusy(true);
      onSaved(await api.ecf.saveConfig({ mode }));
      setConfirmProd(false);
      notify.success(mode === 'OFF' ? 'Facturación electrónica apagada' : 'Modo actualizado');
    } catch (err) {
      notify.error(err.message || 'No se pudo cambiar el modo');
    } finally {
      setBusy(false);
    }
  };

  const select = mode => {
    if (mode === config.mode) return;
    if (mode === 'PROD') setConfirmProd(true);
    else change(mode);
  };

  return (
    <Step number={6} title="Modo de operación" done={config.mode !== 'OFF'} aside={<span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Actual: {MODES.find(m => m.id === config.mode)?.label}</span>}>
      <div role="radiogroup" aria-label="Modo de facturación electrónica" className="grid gap-2 md:grid-cols-2">
        {MODES.map(mode => {
          const selected = config.mode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy}
              onClick={() => select(mode.id)}
              className={`cursor-pointer rounded-lg border p-3 text-left transition active:scale-[0.99] disabled:opacity-60 ${selected ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40'}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Power className={`h-4 w-4 ${selected ? 'text-indigo-500' : 'text-slate-400'}`} aria-hidden="true" /> {mode.label}
              </span>
              <span className="mt-1 block text-xs text-slate-500">{mode.help}</span>
            </button>
          );
        })}
      </div>

      <Modal isOpen={confirmProd} onClose={() => !busy && setConfirmProd(false)} title="Activar producción" maxWidth="sm">
        <div className="space-y-4">
          <Notice>Desde este momento los comprobantes tendrán <strong>validez fiscal</strong> y la DGII los recibirá como oficiales. Confirme que la empresa ya fue habilitada como emisor electrónico.</Notice>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmProd(false)} disabled={busy} className={secondaryButtonClass}>Cancelar</button>
            <button type="button" onClick={() => change('PROD')} disabled={busy} className={primaryButtonClass}>Activar producción</button>
          </div>
        </div>
      </Modal>
    </Step>
  );
}

/* ----------------------------------- Pantalla ----------------------------------- */

export default function EcfSettings() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setConfig(await api.ecf.config());
    } catch (err) {
      setError(err.message || 'No se pudo cargar la configuración');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!config) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4" id="ecf-settings">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Facturación electrónica (e-CF)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Prepare la empresa para emitir comprobantes fiscales electrónicos ante la DGII.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${config.mode === 'OFF' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : config.mode === 'PROD' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {MODES.find(m => m.id === config.mode)?.label}
        </span>
      </div>

      {config.environment.usingSimulator && (
        <Notice tone="blue">Este servidor usa el <strong>simulador de la DGII</strong> (<code>ECF_BASE_URL_OVERRIDE</code>): nada de lo que se envíe llega a la DGII real.</Notice>
      )}

      <FiscalData key={`${config.legalName}-${config.provinceCode}`} config={config} onSaved={setConfig} />
      <Certificate config={config} onSaved={setConfig} />
      <Sequences types={config.types} />
      <ReceiverUrls urls={config.receiverUrls} />
      <Connection config={config} onChecked={load} />
      <Mode config={config} onSaved={setConfig} />
    </div>
  );
}

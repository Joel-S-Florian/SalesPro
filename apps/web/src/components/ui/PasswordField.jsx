import React, { useState } from 'react';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { generatePassword, minLengthFor, passwordProblem, passwordStrength } from '../../utils/passwordPolicy';

const LEVELS = [
  { label: '', bar: 'bg-slate-200 dark:bg-slate-700' },
  { label: 'Débil', bar: 'bg-rose-500' },
  { label: 'Aceptable', bar: 'bg-amber-500' },
  { label: 'Buena', bar: 'bg-emerald-500' },
  { label: 'Muy buena', bar: 'bg-emerald-600' },
];

/**
 * Campo de contraseña nueva: mostrar/ocultar, medidor de fuerza y el motivo si no cumple la política.
 * `context` = { role, username, email, companyName } para avisar si la clave los contiene; `generate` agrega el botón de clave aleatoria.
 * Con `generate`, la clave generada se muestra a la vista para poder copiarla.
 */
export default function PasswordField({ id, value, onChange, context, className = '', required = true, generate = false, autoFocus = false, placeholder }) {
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value, context);
  const problem = value ? passwordProblem(value, context) : null;
  const level = LEVELS[strength];

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
          className={`${className} ${generate ? 'pr-[4.5rem]' : 'pr-9'}`}
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {generate && (
            <button
              type="button"
              aria-label="Generar una contraseña segura"
              title="Generar una contraseña segura"
              onClick={() => {
                onChange(generatePassword());
                setVisible(true);
              }}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:text-indigo-600"
            >
              <Wand2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setVisible(v => !v)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:text-slate-600"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2" id={`${id}-hint`}>
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map(n => (
            <span key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= strength ? level.bar : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
        <span className={`text-[11px] ${problem ? 'text-rose-500' : 'text-slate-500'}`} aria-live="polite">
          {!value ? `Mínimo ${minLengthFor(context?.role)} caracteres. Mejor una frase larga que algo corto y complicado` : problem || level.label}
        </span>
      </div>
    </div>
  );
}

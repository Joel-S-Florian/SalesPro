import { useEffect, useRef } from 'react';
import { createScanDedupe } from '../utils/scanDedupe';

const MAX_KEY_GAP_MS = 50; // un escáner HID teclea mucho más rápido que una persona
const MIN_LENGTH = 3;

const isEditable = el =>
  !!el &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) &&
  !el.hasAttribute('data-scan-target');

/**
 * Escucha globalmente el teclado y detecta lecturas de escáner de código de barras:
 * caracteres con menos de 50 ms entre sí que terminan en Enter.
 * Los campos de texto normales se ignoran, salvo los marcados con `data-scan-target`.
 *
 * @param {(code: string) => void} onScan
 * @param {{ enabled?: boolean }} options
 */
export function useBarcodeScanner(onScan, { enabled = true } = {}) {
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;

    let buffer = '';
    let lastKeyAt = 0;
    const accept = createScanDedupe();

    const onKeyDown = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;

      const now = Date.now();
      if (now - lastKeyAt > MAX_KEY_GAP_MS) buffer = '';
      lastKeyAt = now;

      if (e.key === 'Enter') {
        const code = buffer;
        buffer = '';
        if (code.length < MIN_LENGTH) return;
        if (!accept(code)) return;
        e.preventDefault();
        handlerRef.current(code);
        return;
      }

      if (e.key.length === 1) buffer += e.key;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}

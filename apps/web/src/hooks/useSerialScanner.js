import { useCallback, useEffect, useRef, useState } from 'react';
import { createScanDedupe } from '../utils/scanDedupe';

/**
 * Lector de código de barras por puerto serie/COM (Web Serial API, solo Chrome/Edge sobre HTTPS o localhost).
 * Los lectores seriales envían el código seguido de un salto de línea.
 */
export function useSerialScanner(onScan, { baudRate = 9600 } = {}) {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;
  const sessionRef = useRef(null);

  const disconnect = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setConnected(false);
    if (!session) return;
    session.stopped = true;
    try {
      await session.reader.cancel();
      await session.closed;
      await session.port.close();
    } catch {
      // el puerto ya estaba cerrado o desconectado
    }
  }, []);

  const connect = useCallback(async () => {
    if (!supported) return;
    try {
      setError('');
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });

      const decoder = new TextDecoderStream();
      const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      const session = { port, reader, closed, stopped: false };
      sessionRef.current = session;
      setConnected(true);

      const accept = createScanDedupe();
      let buffer = '';
      (async () => {
        try {
          while (!session.stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const parts = buffer.split(/[\r\n]+/);
            buffer = parts.pop();
            parts
              .map(part => part.trim())
              .filter(code => code.length >= 3 && accept(code))
              .forEach(code => handlerRef.current(code));
          }
        } catch {
          setError('Se perdió la conexión con el lector');
        } finally {
          if (sessionRef.current === session) disconnect();
        }
      })();
    } catch (err) {
      // Si el usuario cierra el selector de puertos no es un error
      if (err?.name !== 'NotFoundError') setError(err?.message || 'No se pudo abrir el puerto');
      setConnected(false);
    }
  }, [supported, baudRate, disconnect]);

  useEffect(() => () => void disconnect(), [disconnect]);

  return { supported, connected, error, connect, disconnect };
}

import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { createScanDedupe } from '../utils/scanDedupe';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

/**
 * Lee códigos de barras (EAN-13/8, UPC, Code 128/39) y QR con la cámara.
 * Usa BarcodeDetector nativo cuando existe y ZXing como respaldo. Permanece abierto para escanear varios.
 */
export default function CameraScannerModal({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState('');
  const [last, setLast] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    let stopDecoder = () => {};
    const accept = createScanDedupe();

    const handle = code => {
      if (!accept(code)) return;
      setLast(code);
      onScanRef.current(code);
    };

    (async () => {
      setError('');
      setLast('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite acceder a la cámara (se requiere HTTPS o localhost).');
        return;
      }
      try {
        // El video se monta con el modal: se espera un ciclo de render
        await new Promise(resolve => setTimeout(resolve, 50));
        if (cancelled || !videoRef.current) return;

        if ('BarcodeDetector' in window) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
          if (cancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play();
          const detector = new window.BarcodeDetector({ formats: FORMATS });
          const timer = setInterval(async () => {
            try {
              const [found] = await detector.detect(video);
              if (found?.rawValue) handle(found.rawValue);
            } catch {
              // fotograma no listo todavía
            }
          }, 250);
          stopDecoder = () => {
            clearInterval(timer);
            stream.getTracks().forEach(t => t.stop());
          };
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, result => {
            if (result) handle(result.getText());
          });
          if (cancelled) controls.stop();
          else stopDecoder = () => controls.stop();
        }
      } catch (err) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Habilítelo en el navegador.'
            : err?.message || 'No se pudo iniciar la cámara'
        );
      }
    })();

    return () => {
      cancelled = true;
      stopDecoder();
    };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Escanear con cámara" maxWidth="md">
      <div className="space-y-3">
        <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-black aspect-video object-cover" />
        {error ? (
          <p className="text-xs text-rose-500">{error}</p>
        ) : (
          <p className="text-xs text-slate-500">
            Apunte al código de barras. {last && <>Último: <strong className="font-mono">{last}</strong></>}
          </p>
        )}
      </div>
    </Modal>
  );
}

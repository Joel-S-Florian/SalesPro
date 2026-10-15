/**
 * Ejecuta la generación de PDF de etiquetas en un Worker. Cada llamada crea el suyo: cancelar es terminarlo.
 * `run(job, onProgress)` devuelve { promise, cancel }; la promesa se resuelve con [{ name, bytes, labels }]
 * o con null si se canceló.
 */
export function runLabelJob(job, onProgress) {
  const worker = new Worker(new URL('../workers/labelWorker.js', import.meta.url), { type: 'module' });
  let finish;
  const promise = new Promise((resolve, reject) => {
    finish = { resolve, reject };
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'progress') onProgress?.(message.done, message.total);
      else if (message.type === 'done') {
        worker.terminate();
        resolve(message.result);
      } else if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'No se pudo generar el PDF'));
    };
    worker.postMessage({ id: 1, ...job });
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      finish.resolve(null);
    },
  };
}

/** Descarga un archivo generado en el navegador. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

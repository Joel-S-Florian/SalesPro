import { buildLabelPdfs } from '../utils/labelPdf';

/**
 * Genera los PDF de etiquetas fuera del hilo principal para que la pantalla no se congele.
 * Entrada: { id, files, grid, options }. Salida: { id, type: 'progress' | 'done' | 'error', ... }.
 * Para cancelar, la pantalla termina el Worker (`worker.terminate()`).
 */
self.onmessage = async event => {
  const { id, files, grid, options } = event.data;
  try {
    const result = await buildLabelPdfs({ files, grid, options }, { onProgress: (done, total) => self.postMessage({ id, type: 'progress', done, total }) });
    self.postMessage({ id, type: 'done', result }, result.map(file => file.bytes.buffer));
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || 'No se pudo generar el PDF' });
  }
};

/**
 * Evita lecturas múltiples accidentales del mismo código en una ventana de tiempo.
 * Devuelve una función que responde true si el código debe procesarse.
 */
export function createScanDedupe(windowMs = 3000) {
  let last = { code: '', at: 0 };
  return code => {
    const now = Date.now();
    if (code === last.code && now - last.at < windowMs) return false;
    last = { code, at: now };
    return true;
  };
}

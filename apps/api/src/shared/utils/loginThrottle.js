/**
 * Retraso progresivo para los inicios de sesión fallidos, por CUENTA (usuario escrito) y por IP. No hay bloqueo permanente.
 *
 *  - 5 fallos seguidos de una cuenta (20 de una misma IP, que suele ser un local con varias cajas) → espera de 15 minutos.
 *  - Cada vez que se vuelve a bloquear sin haber pasado 24 h limpias, la espera se duplica: 15, 30, 60 minutos... hasta 24 h.
 *  - Un inicio de sesión correcto borra el contador de esa cuenta.
 *  - La llave es lo que se ESCRIBIÓ, exista o no el usuario: la respuesta es idéntica y no revela qué usuarios existen.
 *
 * Vive en memoria del proceso (se reinicia con el servidor). Con varios procesos detrás de un balanceador habría que
 * moverlo a la base de datos o a Redis (ver Doc/Acceso_y_Sesion.md).
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export function createLoginThrottle({ maxFails = 5, ipMaxFails = 20, baseLockMs = 15 * MINUTE, maxLockMs = 24 * HOUR, resetAfterMs = 24 * HOUR, now = Date.now } = {}) {
  const entries = new Map(); // «a:usuario» | «i:ip» → { fails, level, lockedUntil, lastFailAt }

  const accountKey = username => `a:${String(username || '').trim().toLowerCase().slice(0, 100)}`;
  const ipKey = ip => (ip ? `i:${ip}` : null);

  /** Sin intentos fallidos recientes la cuenta vuelve a empezar de cero (también el nivel de espera). */
  function fresh(entry) {
    if (entry && now() - entry.lastFailAt > resetAfterMs && now() >= entry.lockedUntil) {
      entries.delete(entry.key);
      return null;
    }
    return entry || null;
  }

  /** ¿Está bloqueado este usuario o esta IP? → { locked: false } | { locked: true, retryAfterMs, scope } */
  function check(username, ip) {
    const t = now();
    let worst = null;
    for (const key of [accountKey(username), ipKey(ip)]) {
      if (!key) continue;
      const entry = fresh(entries.get(key));
      if (entry && entry.lockedUntil > t) {
        const retryAfterMs = entry.lockedUntil - t;
        if (!worst || retryAfterMs > worst.retryAfterMs) worst = { locked: true, retryAfterMs, scope: key.startsWith('a:') ? 'account' : 'ip' };
      }
    }
    return worst || { locked: false };
  }

  /** Anota un fallo. Devuelve los bloqueos nuevos que provocó: [{ scope, level, lockMs, key }]. */
  function recordFailure(username, ip) {
    const t = now();
    const events = [];
    for (const [key, limit] of [[accountKey(username), maxFails], [ipKey(ip), ipMaxFails]]) {
      if (!key) continue;
      let entry = fresh(entries.get(key));
      if (!entry) entry = { key, fails: 0, level: 0, lockedUntil: 0, lastFailAt: t };
      entry.lastFailAt = t;
      if (entry.lockedUntil <= t) {
        entry.fails += 1;
        if (entry.fails >= limit) {
          entry.level += 1;
          entry.fails = 0;
          const lockMs = Math.min(maxLockMs, baseLockMs * 2 ** (entry.level - 1));
          entry.lockedUntil = t + lockMs;
          events.push({ scope: key.startsWith('a:') ? 'account' : 'ip', level: entry.level, lockMs, key });
        }
      }
      entries.set(key, entry);
    }
    return events;
  }

  /** Un inicio de sesión correcto limpia la cuenta (y los fallos sueltos de la IP). */
  function recordSuccess(username, ip) {
    entries.delete(accountKey(username));
    const key = ipKey(ip);
    const entry = key && entries.get(key);
    if (entry && entry.lockedUntil <= now()) entry.fails = 0;
  }

  /** Quita los registros viejos (se llama de vez en cuando para no crecer sin límite). */
  function sweep() {
    for (const [key, entry] of entries) if (entry.lockedUntil <= now() && now() - entry.lastFailAt > resetAfterMs) entries.delete(key);
  }

  return { check, recordFailure, recordSuccess, sweep, size: () => entries.size, clear: () => entries.clear() };
}

/** Instancia única del servidor. */
export const loginThrottle = createLoginThrottle();
const sweeper = setInterval(() => loginThrottle.sweep(), HOUR);
sweeper.unref?.();

/** «15 minutos», «1 hora», «2 horas y 30 minutos»... para el mensaje al usuario. */
export function humanizeWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}${rest ? ` y ${rest} minutos` : ''}`;
}

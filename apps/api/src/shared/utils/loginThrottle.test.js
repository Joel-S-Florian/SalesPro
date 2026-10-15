import { describe, expect, it } from 'vitest';
import { createLoginThrottle, humanizeWait } from './loginThrottle.js';

const MIN = 60 * 1000;
function setup(options) {
  let t = 1_000_000;
  const throttle = createLoginThrottle({ now: () => t, ...options });
  return { throttle, advance: ms => (t += ms), at: () => t };
}
const fail = (throttle, username, ip, times) => {
  const events = [];
  for (let i = 0; i < times; i++) events.push(...throttle.recordFailure(username, ip));
  return events;
};

describe('retraso progresivo de inicios de sesión', () => {
  it('5 fallos de una cuenta bloquean 15 minutos; el cuarto todavía no', () => {
    const { throttle } = setup();
    fail(throttle, 'maria', '1.1.1.1', 4);
    expect(throttle.check('maria', '1.1.1.1').locked).toBe(false);
    const events = fail(throttle, 'maria', '1.1.1.1', 1);
    expect(events).toEqual([expect.objectContaining({ scope: 'account', level: 1, lockMs: 15 * MIN })]);
    const state = throttle.check('maria', '1.1.1.1');
    expect(state).toMatchObject({ locked: true, scope: 'account' });
    expect(state.retryAfterMs).toBe(15 * MIN);
  });

  it('no es permanente: pasados 15 minutos se puede volver a intentar', () => {
    const { throttle, advance } = setup();
    fail(throttle, 'maria', '1.1.1.1', 5);
    advance(15 * MIN - 1);
    expect(throttle.check('maria', '1.1.1.1').locked).toBe(true);
    advance(2);
    expect(throttle.check('maria', '1.1.1.1').locked).toBe(false);
  });

  it('la espera crece: 15, 30, 60 minutos... con tope de 24 horas', () => {
    const { throttle, advance } = setup();
    const waits = [];
    for (let round = 0; round < 9; round++) {
      const events = fail(throttle, 'maria', null, 5);
      waits.push(events.find(e => e.scope === 'account').lockMs / MIN);
      advance(throttle.check('maria', null).retryAfterMs + 1);
    }
    expect(waits.slice(0, 4)).toEqual([15, 30, 60, 120]);
    expect(Math.max(...waits)).toBe(24 * 60);
  });

  it('un inicio correcto limpia la cuenta', () => {
    const { throttle } = setup();
    fail(throttle, 'maria', '1.1.1.1', 4);
    throttle.recordSuccess('maria', '1.1.1.1');
    expect(fail(throttle, 'maria', '1.1.1.1', 4)).toEqual([]);
    expect(throttle.check('maria', '1.1.1.1').locked).toBe(false);
  });

  it('sin fallos durante 24 horas se vuelve a empezar de cero (también el nivel)', () => {
    const { throttle, advance } = setup();
    fail(throttle, 'maria', null, 5);
    advance(24 * 60 * MIN + 1);
    const events = fail(throttle, 'maria', null, 5);
    expect(events[0].level).toBe(1);
    expect(events[0].lockMs).toBe(15 * MIN);
  });

  it('el nombre se compara sin mayúsculas ni espacios y no distingue si el usuario existe', () => {
    const { throttle } = setup();
    fail(throttle, 'Maria ', null, 3);
    fail(throttle, 'maria', null, 2);
    expect(throttle.check('MARIA', null).locked).toBe(true);
    // un usuario que NO existe se bloquea exactamente igual
    fail(throttle, 'no_existe', null, 5);
    expect(throttle.check('no_existe', null).locked).toBe(true);
  });

  it('otro usuario desde la misma IP no se bloquea por el de otro', () => {
    const { throttle } = setup();
    fail(throttle, 'maria', '2.2.2.2', 5);
    expect(throttle.check('pedro', '2.2.2.2').locked).toBe(false);
  });

  it('una IP con 20 fallos (usuarios distintos) se bloquea, y desbloquea sola', () => {
    const { throttle, advance } = setup();
    let events = [];
    for (let i = 0; i < 20; i++) events = events.concat(throttle.recordFailure(`usuario${i}`, '3.3.3.3'));
    expect(events.some(e => e.scope === 'ip')).toBe(true);
    expect(throttle.check('otro_usuario', '3.3.3.3')).toMatchObject({ locked: true, scope: 'ip' });
    advance(15 * MIN + 1);
    expect(throttle.check('otro_usuario', '3.3.3.3').locked).toBe(false);
  });

  it('un fallo durante el bloqueo no lo alarga ni sube el nivel', () => {
    const { throttle } = setup();
    fail(throttle, 'maria', null, 5);
    const events = fail(throttle, 'maria', null, 3);
    expect(events).toEqual([]);
    expect(throttle.check('maria', null).retryAfterMs).toBeLessThanOrEqual(15 * MIN);
  });

  it('sweep quita los registros viejos', () => {
    const { throttle, advance } = setup();
    fail(throttle, 'maria', null, 1);
    expect(throttle.size()).toBe(1);
    advance(25 * 60 * MIN);
    throttle.sweep();
    expect(throttle.size()).toBe(0);
  });
});

describe('humanizeWait', () => {
  it('redondea hacia arriba y usa horas', () => {
    expect(humanizeWait(15 * MIN)).toBe('15 minutos');
    expect(humanizeWait(1000)).toBe('1 minuto');
    expect(humanizeWait(60 * MIN)).toBe('1 hora');
    expect(humanizeWait(150 * MIN)).toBe('2 horas y 30 minutos');
  });
});

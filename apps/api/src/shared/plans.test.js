import { describe, expect, it } from 'vitest';
import {
  AUTO_BACKUP_FREQUENCY,
  AUTO_BACKUP_KEEP,
  BACKUP_FREQUENCY_DAYS,
  FALLBACK_PLAN,
  PLANS,
  PLAN_IDS,
  TRIAL_GRACE_DAYS,
  describeLimit,
  getEffectivePlan,
  limitOf,
  minPlanForFeature,
  planHasFeature,
  usageLevel,
} from '@factos/shared/plans.js';
import { monthStartDr } from './plans.js';

const DAY = 24 * 60 * 60 * 1000;
const at = iso => new Date(iso);

describe('catálogo de planes', () => {
  it('tiene exactamente FREE, STARTER y BUSINESS', () => {
    expect(PLAN_IDS).toEqual(['FREE', 'STARTER', 'BUSINESS']);
    expect(Object.keys(PLANS)).toEqual(PLAN_IDS);
  });

  it('los límites coinciden con lo decidido', () => {
    expect(PLANS.FREE.limits).toEqual({ terminals: 1, users: 2, branches: 1, products: 200, salesPerMonth: 300 });
    expect(PLANS.STARTER.limits).toEqual({ terminals: 3, users: 6, branches: 1, products: 3000, salesPerMonth: 2000 });
    expect(PLANS.BUSINESS.limits).toEqual({ terminals: 10, users: 25, branches: 3, products: null, salesPerMonth: 10000 });
  });

  it('las funciones por plan', () => {
    expect(['ecf', 'labels', 'perishables', 'fullBackup'].map(f => planHasFeature('FREE', f))).toEqual([false, false, false, false]);
    expect(['ecf', 'labels', 'perishables', 'fullBackup'].map(f => planHasFeature('STARTER', f))).toEqual([true, true, true, true]);
    expect(['ecf', 'labels', 'perishables', 'fullBackup'].map(f => planHasFeature('BUSINESS', f))).toEqual([true, true, true, true]);
    expect(PLANS.FREE.features.backup).toBe('csv');
    expect(PLANS.FREE.features.whatsappLink && PLANS.STARTER.features.whatsappLink && PLANS.BUSINESS.features.whatsappLink).toBe(true);
    expect(PLANS.BUSINESS.features.whatsappApi).toBe(true);
    expect(PLANS.STARTER.features.whatsappApi).toBe(false);
    expect(minPlanForFeature('ecf')).toBe('STARTER');
  });

  it('precios provisionales decididos y respaldo automático solo en BUSINESS', () => {
    expect([PLANS.FREE.priceMonthlyDop, PLANS.STARTER.priceMonthlyDop, PLANS.BUSINESS.priceMonthlyDop]).toEqual([0, 1200, 2500]);
    expect(PLANS.STARTER.priceProvisional && PLANS.BUSINESS.priceProvisional).toBe(true);
    expect(['FREE', 'STARTER', 'BUSINESS'].map(p => planHasFeature(p, 'autoBackup'))).toEqual([false, false, true]);
    expect(AUTO_BACKUP_FREQUENCY).toBe('weekly');
    expect(BACKUP_FREQUENCY_DAYS).toEqual({ daily: 1, weekly: 7 });
    expect(AUTO_BACKUP_KEEP).toBe(4);
  });

  it('un plan desconocido cae a FREE', () => {
    expect(limitOf('PRO', 'users')).toBe(2);
    expect(planHasFeature('ENTERPRISE', 'ecf')).toBe(false);
  });

  it('usageLevel avisa al 80 % y al 100 %', () => {
    expect(usageLevel(79, 100)).toBeNull();
    expect(usageLevel(80, 100)).toBe('WARN');
    expect(usageLevel(99, 100)).toBe('WARN');
    expect(usageLevel(100, 100)).toBe('FULL');
    expect(usageLevel(500, 100)).toBe('FULL');
    expect(usageLevel(10, null)).toBeNull();
  });

  it('describeLimit usa singular y plural', () => {
    expect(describeLimit('terminals', 1)).toBe('1 caja');
    expect(describeLimit('terminals', 3)).toBe('3 cajas');
    expect(describeLimit('products', null)).toBe('Sin tope');
  });
});

describe('getEffectivePlan', () => {
  const trialEnds = at('2026-11-01T12:00:00Z');
  const company = { plan: 'STARTER', trialEndsAt: trialEnds };

  it('TRIAL: la prueba sigue, con los límites del plan contratado y los días que faltan', () => {
    const s = getEffectivePlan(company, at('2026-10-25T12:00:00Z'));
    expect(s).toMatchObject({ status: 'TRIAL', effectivePlan: 'STARTER', daysLeft: 7, downgraded: false });
  });

  it('TRIAL: un instante antes de terminar sigue siendo prueba (1 día)', () => {
    const s = getEffectivePlan(company, new Date(trialEnds.getTime() - 1));
    expect(s.status).toBe('TRIAL');
    expect(s.daysLeft).toBe(1);
  });

  it('GRACE: justo al terminar la prueba empieza la gracia, con los mismos límites y la cuenta regresiva', () => {
    const s = getEffectivePlan(company, trialEnds);
    expect(s).toMatchObject({ status: 'GRACE', effectivePlan: 'STARTER', graceDaysLeft: TRIAL_GRACE_DAYS, downgraded: false });
  });

  it('GRACE: dura 7 días y el último instante todavía cuenta', () => {
    const s = getEffectivePlan(company, new Date(trialEnds.getTime() + TRIAL_GRACE_DAYS * DAY - 1));
    expect(s.status).toBe('GRACE');
    expect(s.graceDaysLeft).toBe(1);
  });

  it('EXPIRED: pasada la gracia se aplican los límites de FREE (y se marca como rebajado)', () => {
    const s = getEffectivePlan(company, new Date(trialEnds.getTime() + TRIAL_GRACE_DAYS * DAY));
    expect(s).toMatchObject({ status: 'EXPIRED', effectivePlan: FALLBACK_PLAN, plan: 'STARTER', downgraded: true });
  });

  it('EXPIRED en un plan FREE no cuenta como rebaja', () => {
    const s = getEffectivePlan({ plan: 'FREE', trialEndsAt: trialEnds }, at('2027-01-01T00:00:00Z'));
    expect(s).toMatchObject({ status: 'EXPIRED', effectivePlan: 'FREE', downgraded: false });
  });

  it('ACTIVE: sin fecha de prueba (plan asignado a mano) rige el plan, sin vencimiento', () => {
    expect(getEffectivePlan({ plan: 'BUSINESS', trialEndsAt: null }, at('2030-01-01T00:00:00Z'))).toMatchObject({ status: 'ACTIVE', effectivePlan: 'BUSINESS', daysLeft: null });
  });

  it('acepta la fecha como texto ISO y un plan inválido cae a FREE', () => {
    expect(getEffectivePlan({ plan: 'PRO', trialEndsAt: '2026-11-01T12:00:00Z' }, at('2026-10-31T12:00:00Z'))).toMatchObject({ plan: 'FREE', status: 'TRIAL' });
  });
});

describe('getEffectivePlan con pagos (paidUntil)', () => {
  it('un pago vigente deja el plan en PAID con los días que faltan', () => {
    const s = getEffectivePlan({ plan: 'STARTER', trialEndsAt: null, paidUntil: at('2026-11-15T12:00:00Z') }, at('2026-10-16T12:00:00Z'));
    expect(s).toMatchObject({ status: 'PAID', effectivePlan: 'STARTER', daysLeft: 30, paid: true });
  });

  it('vale la fecha más tardía entre la prueba y el pago', () => {
    const company = { plan: 'BUSINESS', trialEndsAt: at('2026-12-01T12:00:00Z'), paidUntil: at('2026-11-01T12:00:00Z') };
    expect(getEffectivePlan(company, at('2026-11-20T12:00:00Z'))).toMatchObject({ status: 'TRIAL', paid: false });
    const paidLater = { ...company, paidUntil: at('2027-01-01T12:00:00Z') };
    expect(getEffectivePlan(paidLater, at('2026-12-10T12:00:00Z'))).toMatchObject({ status: 'PAID', paid: true });
  });

  it('al vencer el pago hay 7 días de gracia y luego FREE, sin perder el plan guardado', () => {
    const company = { plan: 'BUSINESS', trialEndsAt: null, paidUntil: at('2026-11-01T12:00:00Z') };
    expect(getEffectivePlan(company, at('2026-11-01T12:00:00Z'))).toMatchObject({ status: 'GRACE', effectivePlan: 'BUSINESS', graceDaysLeft: 7, paid: true });
    expect(getEffectivePlan(company, at('2026-11-08T11:59:59Z'))).toMatchObject({ status: 'GRACE', effectivePlan: 'BUSINESS' });
    expect(getEffectivePlan(company, at('2026-11-08T12:00:00Z'))).toMatchObject({ status: 'EXPIRED', effectivePlan: 'FREE', downgraded: true, plan: 'BUSINESS' });
  });

  it('sin paidUntil nada cambia', () => {
    expect(getEffectivePlan({ plan: 'STARTER', trialEndsAt: null }, at('2027-01-01T00:00:00Z'))).toMatchObject({ status: 'ACTIVE', paid: false, paidUntil: null });
  });
});

describe('monthStartDr', () => {
  it('el mes empieza a las 00:00 de República Dominicana (04:00 UTC)', () => {
    expect(monthStartDr(at('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });

  it('a las 02:00 UTC del día 1 todavía es el mes anterior en Santo Domingo', () => {
    expect(monthStartDr(at('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(monthStartDr(at('2026-11-01T04:00:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });
});

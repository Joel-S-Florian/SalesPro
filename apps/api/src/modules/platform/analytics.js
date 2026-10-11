import { basePrisma } from '../../config/db.js';
import { round2 } from '../../shared/utils/helpers.js';
import { dayKey, weekKey, addDays, diffDays } from '../../shared/utils/tz.js';

/**
 * Métricas de la plataforma para el equipo de FACTOS: crecimiento, embudo de solicitudes y salud de las empresas.
 * Usa `basePrisma` (sin aislamiento) a propósito: solo se expone en rutas de SUPERADMIN.
 */
export async function getPlatformAnalytics() {
  const now = new Date();
  const today = dayKey(now);
  const since30 = new Date(now.getTime() - 30 * 86400000);

  const [companies, leadGroups, leads, sales30] = await Promise.all([
    basePrisma.company.findMany({ select: { id: true, name: true, plan: true, active: true, createdAt: true, trialEndsAt: true } }),
    basePrisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    basePrisma.lead.findMany({ select: { companyId: true } }),
    basePrisma.sale.groupBy({ by: ['companyId'], where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { total: true } }),
  ]);

  const salesByCompany = new Map(sales30.map(s => [s.companyId, s]));
  const leadCompanyIds = new Set(leads.map(l => l.companyId).filter(Boolean));
  const leadCount = status => leadGroups.find(g => g.status === status)?._count._all || 0;
  const totalLeads = leadGroups.reduce((s, g) => s + g._count._all, 0);

  const byPlan = new Map();
  companies.forEach(c => byPlan.set(c.plan, (byPlan.get(c.plan) || 0) + 1));

  // Altas por semana, últimas 12
  const weeks = [];
  const thisMonday = weekKey(now);
  for (let i = 11; i >= 0; i--) weeks.push(addDays(thisMonday, -7 * i));
  const signups = new Map(weeks.map(w => [w, 0]));
  companies.forEach(c => {
    const key = weekKey(c.createdAt);
    if (signups.has(key)) signups.set(key, signups.get(key) + 1);
  });

  const activeCompanies = companies.filter(c => c.active);
  const inactive = activeCompanies
    .filter(c => !salesByCompany.has(c.id) && diffDays(dayKey(c.createdAt), today) >= 7)
    .map(c => ({ id: c.id, name: c.name, plan: c.plan, daysSinceSignup: diffDays(dayKey(c.createdAt), today) }))
    .sort((a, b) => b.daysSinceSignup - a.daysSinceSignup);

  const trialsEnding = activeCompanies
    .filter(c => c.trialEndsAt && diffDays(today, dayKey(c.trialEndsAt)) <= 7)
    .map(c => ({ id: c.id, name: c.name, plan: c.plan, daysLeft: diffDays(today, dayKey(c.trialEndsAt)) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    summary: {
      companies: companies.length,
      active: activeCompanies.length,
      suspended: companies.length - activeCompanies.length,
      withSales30: activeCompanies.filter(c => salesByCompany.has(c.id)).length,
      signupsLast30: companies.filter(c => c.createdAt >= since30).length,
    },
    byPlan: Array.from(byPlan.entries()).map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count),
    signups: Array.from(signups.entries()).map(([week, count]) => ({ week, count })),
    funnel: {
      leads: totalLeads,
      new: leadCount('NEW'),
      approved: leadCount('APPROVED'),
      rejected: leadCount('REJECTED'),
      selfSignup: companies.filter(c => !leadCompanyIds.has(c.id)).length,
      approvalRate: totalLeads > 0 ? round2((leadCount('APPROVED') / totalLeads) * 100) : 0,
    },
    topCompanies: activeCompanies
      .filter(c => salesByCompany.has(c.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        plan: c.plan,
        invoices: salesByCompany.get(c.id)._count._all,
        total: round2(salesByCompany.get(c.id)._sum.total || 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    inactive: inactive.slice(0, 20),
    trialsEnding,
  };
}

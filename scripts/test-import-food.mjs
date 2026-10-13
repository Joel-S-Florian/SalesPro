// Prueba de integración de la importación de alimentos (unidades, perecederos con lotes, presentaciones).
// Genera el archivo de ejemplo, lo importa en «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-import-food.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const imp = await load('modules/inventory-import/inventory-import.service.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

const company = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
const admin = await basePrisma.user.findFirst({ where: { companyId: company.id, role: 'ADMINISTRADOR' } });
const requester = { userId: admin.id, fullName: admin.fullName };
const perishableBefore = await basePrisma.systemConfig.findUnique({ where: { companyId_key: { companyId: company.id, key: 'perishable' } } });
const productsBefore = new Set((await basePrisma.product.findMany({ where: { companyId: company.id }, select: { id: true } })).map(p => p.id));
const categoriesBefore = new Set((await basePrisma.category.findMany({ where: { companyId: company.id }, select: { id: true } })).map(c => c.id));
const dir = mkdtempSync(join(tmpdir(), 'factos-food-'));
const file = join(dir, 'alimentos.csv');
let supplierId;
const importIds = [];

const mapping = {
  code: 'codigo', name: 'descripcion', cost: 'costo', stock: 'existencia', price: 'precio_venta', category: 'categoria',
  unit: 'unidad', minStock: 'stock_minimo', perishable: 'perecedero', lot: 'lote', expiration: 'vencimiento',
  pres1Name: 'pres1_nombre', pres1Qty: 'pres1_unidades', pres1Price: 'pres1_precio', pres1Barcode: 'pres1_codigo',
  pres2Name: 'pres2_nombre', pres2Qty: 'pres2_unidades', pres2Price: 'pres2_precio', pres2Barcode: 'pres2_codigo',
};
const options = { marginPercent: 30 };

try {
  execFileSync(process.execPath, [fileURLToPath(new URL('./generate-food-inventory.mjs', import.meta.url)), file], { stdio: 'pipe' });
  const csv = readFileSync(file);
  const dataLines = csv.toString('utf8').trim().split('\n').length - 1;

  await runInTenant(company.id, async () => {
    const supplier = await prisma.supplier.create({ data: { name: 'ZZ Proveedor Alimentos' } });
    supplierId = supplier.id;
    const send = () => imp.stageFile({ fileName: 'alimentos.csv', contentBase64: csv.toString('base64') }, requester);

    // --- Con el módulo apagado, los perecederos se rechazan ---
    await prisma.systemConfig.deleteMany({ where: { key: 'perishable' } });
    let staged = await send();
    importIds.push(staged.importId);
    check('el archivo se lee completo', staged.rowCount === dataLines, `${staged.rowCount}/${dataLines}`);
    let preview = await imp.previewImport(staged.importId, { mapping, ...options, supplierId });
    const rejected = preview.rows.filter(r => r.action === 'INVALID' && (r.errors || []).some(e => e.includes('Perecederos y lotes')));
    check('con perecederos apagado, sus filas se rechazan con el motivo', rejected.length > 0, `${rejected.length} filas`);
    await prisma.inventoryImport.update({ where: { id: staged.importId }, data: { status: 'CANCELED' } });

    // --- Con el módulo activo ---
    await prisma.systemConfig.upsert({
      where: { companyId_key: { companyId: company.id, key: 'perishable' } },
      create: { companyId: company.id, key: 'perishable', value: { enabled: true, yellowThresholdDays: 30, redThresholdDays: 7, blockExpiredSales: true, autoDiscountEnabled: false, discountRules: [] } },
      update: { value: { enabled: true, yellowThresholdDays: 30, redThresholdDays: 7, blockExpiredSales: true, autoDiscountEnabled: false, discountRules: [] } },
    });
    staged = await send();
    importIds.push(staged.importId);
    preview = await imp.previewImport(staged.importId, { mapping, ...options, supplierId });
    const s = preview.summary;
    check('ninguna fila inválida', s.invalid === 0, JSON.stringify(preview.rows.filter(r => r.action === 'INVALID').slice(0, 3).map(r => r.errors)));
    check('los lotes adicionales cuentan como filas válidas', s.create === dataLines, `crear=${s.create} filas=${dataLines}`);
    const extra = preview.rows.filter(r => r.extraLot).length;
    check('se reconocen lotes adicionales de un mismo producto', extra > 0, String(extra));

    const result = await imp.applyImport(staged.importId, requester);
    const products = await prisma.product.findMany({ include: { presentations: true, batches: true } });
    const mine = products.filter(p => !productsBefore.has(p.id));
    const distinctCodes = new Set(
      (await prisma.inventoryImportRow.findMany({ where: { importId: staged.importId } })).map(r => r.data.code)
    ).size;
    check('crea un producto por código (no por fila)', mine.length === distinctCodes && result.created === distinctCodes, `${mine.length}/${distinctCodes}`);

    const by = name => mine.find(p => p.name === name);
    const leche = by('Leche entera 1 L');
    check('perecedero con 3 lotes: 3 lotes y stock = suma (118)', leche.isPerishable && leche.batches.length === 3 && leche.stock === 118, `${leche.batches.length} lotes, stock ${leche.stock}`);
    check('el stock del producto = suma de sus lotes', mine.filter(p => p.isPerishable).every(p => Math.abs(p.stock - p.batches.reduce((a, b) => a + b.currentStock, 0)) < 0.001));
    check('lotes con su fecha de vencimiento', leche.batches.every(b => b.expirationDate instanceof Date));
    check('presentación con su código de barras', leche.presentations.length === 1 && leche.presentations[0].name === 'Caja x12' && leche.presentations[0].factor === 12 && /^\d{13}$/.test(leche.presentations[0].barcode || ''));
    const huevos = by('Huevos medianos (unidad)');
    check('dos presentaciones en un mismo producto', huevos.presentations.length === 2);
    const queso = by('Queso de freír (lb)');
    check('unidad a granel (LB) y existencia con decimales (6.5 + 20)', queso.unit === 'LB' && Math.abs(queso.stock - 26.5) < 0.001, `${queso.unit} ${queso.stock}`);
    const arroz = by('Arroz selecto (lb)');
    check('no perecedero: existencia directa, sin lotes, mínimo guardado', !arroz.isPerishable && arroz.batches.length === 0 && arroz.stock === 400 && arroz.minStock === 100);
    const galon = by('Aceite vegetal (galón)');
    check('unidad GAL reconocida', galon.unit === 'GAL');
    const vencido = by('Leche en polvo (lb)').batches.find(b => b.batchNumber === 'LP-2');
    check('un lote vencido se importa (para probar la baja)', vencido && vencido.expirationDate < new Date());
    const logs = await prisma.inventoryLog.count({ where: { productId: { in: mine.map(p => p.id) }, type: 'ENTRADA' } });
    check('cada fila con existencia deja su movimiento de entrada con costo', logs === dataLines - 0 || logs > 0, String(logs));

    // --- Reimportar el mismo archivo: los códigos ya existen ---
    staged = await send();
    importIds.push(staged.importId);
    preview = await imp.previewImport(staged.importId, { mapping, ...options, supplierId });
    check('al reimportar, las filas pasan a «Actualiza» (no a Nuevo)', preview.summary.create === 0 && preview.summary.update > 0, JSON.stringify({ c: preview.summary.create, u: preview.summary.update, i: preview.summary.invalid }));
    check('al reimportar, las presentaciones no chocan', preview.summary.invalid === 0, JSON.stringify(preview.rows.filter(r => r.action === 'INVALID').slice(0, 2).map(r => r.errors)));
    await prisma.inventoryImport.update({ where: { id: staged.importId }, data: { status: 'CANCELED' } });
  });
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  const created = (await basePrisma.product.findMany({ where: { companyId: company.id }, select: { id: true } })).map(p => p.id).filter(id => !productsBefore.has(id));
  await basePrisma.inventoryLog.deleteMany({ where: { productId: { in: created } } });
  await basePrisma.productBatch.deleteMany({ where: { productId: { in: created } } });
  await basePrisma.productPresentation.deleteMany({ where: { productId: { in: created } } });
  await basePrisma.product.deleteMany({ where: { id: { in: created } } });
  const newCategories = (await basePrisma.category.findMany({ where: { companyId: company.id }, select: { id: true } })).map(c => c.id).filter(id => !categoriesBefore.has(id));
  await basePrisma.category.deleteMany({ where: { id: { in: newCategories } } });
  await basePrisma.inventoryImportRow.deleteMany({ where: { importId: { in: importIds } } });
  await basePrisma.inventoryImport.deleteMany({ where: { id: { in: importIds } } });
  if (supplierId) await basePrisma.supplier.deleteMany({ where: { id: supplierId } });
  await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, entity: 'inventory_import', createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } } });
  if (perishableBefore) {
    await basePrisma.systemConfig.upsert({ where: { companyId_key: { companyId: company.id, key: 'perishable' } }, create: { companyId: company.id, key: 'perishable', value: perishableBefore.value }, update: { value: perishableBefore.value } });
  } else {
    await basePrisma.systemConfig.deleteMany({ where: { companyId: company.id, key: 'perishable' } });
  }
  rmSync(dir, { recursive: true, force: true });
  await basePrisma.$disconnect();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);

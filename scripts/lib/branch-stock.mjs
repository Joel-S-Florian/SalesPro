// Ayudas para los scripts de prueba que siembran productos directo en la base (sin pasar por el API):
// el stock vive por sucursal, así que cada producto sembrado con `stock` necesita su fila en la sucursal Principal.

/** Fila de stock en la Principal igual a `product.stock` (también sirve con el cliente con aislamiento por empresa). */
export async function giveStock(client, product, branchId) {
  const main = branchId || (await client.branch.findFirst({ where: { companyId: product.companyId, isMain: true }, select: { id: true } }))?.id;
  if (!main) throw new Error(`La empresa ${product.companyId} no tiene sucursal Principal`);
  await client.branchStock.upsert({
    where: { branchId_productId: { branchId: main, productId: product.id } },
    create: { productId: product.id, branchId: main, stock: product.stock, companyId: product.companyId },
    update: { stock: product.stock },
  });
  return main;
}

/** Iguala el stock de la Principal al de cada producto de la empresa (para siembras con `createMany`). */
export async function syncMainBranchStock(client, companyId) {
  const main = await client.branch.findFirst({ where: { companyId, isMain: true }, select: { id: true } });
  if (!main) throw new Error(`La empresa ${companyId} no tiene sucursal Principal`);
  const products = await client.product.findMany({ where: { companyId }, select: { id: true, stock: true, companyId: true } });
  for (const product of products) await giveStock(client, product, main.id);
  return main.id;
}

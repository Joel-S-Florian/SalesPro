import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Hash passwords
  const adminPassword = await bcrypt.hash('admin', 12);
  const sellerPassword = await bcrypt.hash('vendedor', 12);

  // Create users
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      fullName: 'Administrador de Ventas',
      role: 'ADMINISTRADOR',
      passwordHash: adminPassword,
      active: true,
    },
  });

  const seller = await prisma.user.upsert({
    where: { username: 'vendedor' },
    update: {},
    create: {
      username: 'vendedor',
      fullName: 'María Fernanda Ruiz',
      role: 'VENDEDOR',
      passwordHash: sellerPassword,
      active: true,
    },
  });

  console.log('✅ Users created:', { admin: admin.username, seller: seller.username });

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Electrónica' },
      update: {},
      create: { name: 'Electrónica', description: 'Dispositivos tecnológicos, accesorios y gadgets' },
    }),
    prisma.category.upsert({
      where: { name: 'Ropa & Calzado' },
      update: {},
      create: { name: 'Ropa & Calzado', description: 'Vestimenta de toda temporada y zapatos' },
    }),
    prisma.category.upsert({
      where: { name: 'Hogar' },
      update: {},
      create: { name: 'Hogar', description: 'Electrodomésticos y decoración del hogar' },
    }),
    prisma.category.upsert({
      where: { name: 'Abarrotes' },
      update: {},
      create: { name: 'Abarrotes', description: 'Alimentos y provisiones diarias' },
    }),
  ]);

  console.log('✅ Categories created:', categories.map(c => c.name).join(', '));

  const [catElectro, catClothes, catHome, catGroceries] = categories;

  // Create products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { code: 'PROD-001' },
      update: {},
      create: {
        code: 'PROD-001',
        name: 'Laptop Asus Zenbook Pro 14',
        description: 'AMD Ryzen 7, 16GB RAM, 512GB SSD OLED',
        categoryId: catElectro.id,
        costPrice: 850.00,
        salePrice: 1249.99,
        stock: 12,
        minStock: 5,
        active: true,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PROD-002' },
      update: {},
      create: {
        code: 'PROD-002',
        name: 'Smartphone Samsung Galaxy S24',
        description: '128GB Almacenamiento, Cámara de 50MP',
        categoryId: catElectro.id,
        costPrice: 550.00,
        salePrice: 799.99,
        stock: 8,
        minStock: 3,
        active: true,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PROD-003' },
      update: {},
      create: {
        code: 'PROD-003',
        name: 'Audífonos Sony WH-1000XM5',
        description: 'Cancelación de ruido activa, Inalámbricos',
        categoryId: catElectro.id,
        costPrice: 190.00,
        salePrice: 299.99,
        stock: 20,
        minStock: 6,
        active: true,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PROD-004' },
      update: {},
      create: {
        code: 'PROD-004',
        name: 'Camisa Casual Oxford Slim Fit',
        description: '100% Algodón, color azul claro',
        categoryId: catClothes.id,
        costPrice: 15.00,
        salePrice: 35.00,
        stock: 4,
        minStock: 6,
        active: true,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PROD-005' },
      update: {},
      create: {
        code: 'PROD-005',
        name: 'Zapatos Oxford de Cuero Marrón',
        description: 'Zapatos de cuero italiano formal para oficina',
        categoryId: catClothes.id,
        costPrice: 35.00,
        salePrice: 79.90,
        stock: 3,
        minStock: 5,
        active: true,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PROD-006' },
      update: {},
      create: {
        code: 'PROD-006',
        name: 'Cafetera Oster de Filtro 12 Tazas',
        description: 'Programable con jarra de vidrio resistente',
        categoryId: catHome.id,
        costPrice: 22.00,
        salePrice: 49.90,
        stock: 15,
        minStock: 4,
        active: true,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PROD-007' },
      update: {},
      create: {
        code: 'PROD-007',
        name: 'Saco de Arroz Premium Extra 5kg',
        description: 'Arroz seleccionado de alta calidad',
        categoryId: catGroceries.id,
        costPrice: 4.50,
        salePrice: 8.90,
        stock: 45,
        minStock: 10,
        active: true,
      },
    }),
  ]);

  console.log('✅ Products created:', products.length);

  // Create customers
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { documentId: '000000000' },
      update: {},
      create: {
        documentId: '000000000',
        name: 'Consumidor Final',
        email: 'consumidor@salespro.com',
        phone: '999999999',
        address: 'Venta presencial',
      },
    }),
    prisma.customer.upsert({
      where: { documentId: '45829103' },
      update: {},
      create: {
        documentId: '45829103',
        name: 'Juan Antonio Pérez',
        email: 'juan.perez@email.com',
        phone: '951234567',
        address: 'Av. Las Gardenias 420, Surco',
      },
    }),
    prisma.customer.upsert({
      where: { documentId: '20459382' },
      update: {},
      create: {
        documentId: '20459382',
        name: 'María Alejandra Gómez',
        email: 'maria.gomez@email.com',
        phone: '984561230',
        address: 'Jr. Junín 148, Miraflores',
      },
    }),
    prisma.customer.upsert({
      where: { documentId: '20608594231' },
      update: {},
      create: {
        documentId: '20608594231',
        name: 'Soluciones Tecnológicas SAC',
        email: 'ventas@soluciones-tech.com',
        phone: '014285960',
        address: 'Calle Las Orquídeas 210, San Isidro',
        rnc: '20608594231',
      },
    }),
  ]);

  console.log('✅ Customers created:', customers.length);

  // Initialize NCF sequences
  const ncfTypes = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16'];
  for (const type of ncfTypes) {
    await prisma.nCFSequence.upsert({
      where: { ncfType: type },
      update: {},
      create: { ncfType: type, prefix: type, current: 0, max: 99999999 },
    });
  }

  console.log('✅ NCF sequences initialized');

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Cada empresa existente recibe su «Proveedor general»
INSERT INTO "suppliers" ("id", "name", "paymentTerms", "isDefault", "active", "createdAt", "updatedAt", "companyId")
SELECT 'sup' || substr(md5(random()::text || c."id"), 1, 22), 'Proveedor general', 'Contado', true, true, now(), now(), c."id"
FROM "companies" c
WHERE NOT EXISTS (SELECT 1 FROM "suppliers" s WHERE s."companyId" = c."id" AND s."isDefault");

-- Claves temporales con caducidad
ALTER TABLE "users" ADD COLUMN "tempPasswordExpiresAt" TIMESTAMP(3);

-- «Proveedor general» pasa a ser «Compra sin proveedor», de sistema (isDefault → isSystem). Se conservan los datos.
-- Para revertir: renombrar la columna de vuelta a "isDefault" y el nombre a «Proveedor general».
ALTER TABLE "suppliers" RENAME COLUMN "isDefault" TO "isSystem";
UPDATE "suppliers" SET "name" = 'Compra sin proveedor' WHERE "isSystem" = true;

-- Aceptación de los términos al registrarse
ALTER TABLE "companies" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3), ADD COLUMN "termsVersion" TEXT;

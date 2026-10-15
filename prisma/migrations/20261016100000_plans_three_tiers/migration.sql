-- Los planes pasan a ser FREE, STARTER y BUSINESS. Las empresas con PRO o ENTERPRISE pasan a BUSINESS (no se pierde ningún dato).
-- Para revertir: crear de nuevo los valores (ALTER TYPE "PlanType" ADD VALUE 'PRO'; ... 'ENTERPRISE';). Las empresas que ya
-- estaban en PRO/ENTERPRISE se quedan en BUSINESS: esa información no se conserva.
UPDATE "companies" SET "plan" = 'BUSINESS' WHERE "plan" IN ('PRO', 'ENTERPRISE');

ALTER TYPE "PlanType" RENAME TO "PlanType_old";
CREATE TYPE "PlanType" AS ENUM ('FREE', 'STARTER', 'BUSINESS');
ALTER TABLE "companies" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "plan" TYPE "PlanType" USING ("plan"::text::"PlanType");
ALTER TABLE "companies" ALTER COLUMN "plan" SET DEFAULT 'STARTER';
DROP TYPE "PlanType_old";

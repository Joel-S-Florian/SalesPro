-- CreateEnum
CREATE TYPE "CloseStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cashierCloseId" TEXT,
ADD COLUMN     "terminalId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "defaultTerminalId" TEXT;

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "companyId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_closes" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedCash" DOUBLE PRECISION,
    "declaredCash" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "status" "CloseStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "summary" JSONB,

    CONSTRAINT "cashier_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TerminalUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TerminalUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "terminals_name_key" ON "terminals"("name");

-- CreateIndex
CREATE INDEX "_TerminalUsers_B_index" ON "_TerminalUsers"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_defaultTerminalId_fkey" FOREIGN KEY ("defaultTerminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashierCloseId_fkey" FOREIGN KEY ("cashierCloseId") REFERENCES "cashier_closes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_closes" ADD CONSTRAINT "cashier_closes_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_closes" ADD CONSTRAINT "cashier_closes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminalUsers" ADD CONSTRAINT "_TerminalUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminalUsers" ADD CONSTRAINT "_TerminalUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

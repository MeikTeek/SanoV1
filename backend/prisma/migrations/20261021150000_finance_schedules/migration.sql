-- CreateTable
CREATE TABLE "FinanceSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "accountId" TEXT NOT NULL,
    "payee" VARCHAR(200),
    "categoryId" TEXT,
    "transferAccountId" TEXT,
    "amount" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "nextDate" VARCHAR(10) NOT NULL,
    "anchorDay" INTEGER NOT NULL DEFAULT 1,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceSchedule_userId_active_nextDate_idx" ON "FinanceSchedule"("userId", "active", "nextDate");

-- AddForeignKey
ALTER TABLE "FinanceSchedule" ADD CONSTRAINT "FinanceSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSchedule" ADD CONSTRAINT "FinanceSchedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


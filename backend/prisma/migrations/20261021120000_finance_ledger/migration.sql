-- CreateTable
CREATE TABLE "FinanceSettings" (
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "initializedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHECKING',
    "offBudget" BOOLEAN NOT NULL DEFAULT false,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategoryGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isIncome" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceCategoryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePayee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "lastCategoryId" TEXT,

    CONSTRAINT "FinancePayee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "amount" INTEGER NOT NULL,
    "payeeId" TEXT,
    "categoryId" TEXT,
    "notes" VARCHAR(500),
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "transferId" TEXT,
    "importHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "budgeted" INTEGER NOT NULL DEFAULT 0,
    "carryover" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAccount_userId_sortOrder_idx" ON "FinanceAccount"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "FinanceCategoryGroup_userId_sortOrder_idx" ON "FinanceCategoryGroup"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "FinanceCategory_userId_idx" ON "FinanceCategory"("userId");

-- CreateIndex
CREATE INDEX "FinanceCategory_groupId_sortOrder_idx" ON "FinanceCategory"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayee_userId_name_key" ON "FinancePayee"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransaction_transferId_key" ON "FinanceTransaction"("transferId");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_date_idx" ON "FinanceTransaction"("userId", "date");

-- CreateIndex
CREATE INDEX "FinanceTransaction_accountId_date_idx" ON "FinanceTransaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "FinanceTransaction_categoryId_date_idx" ON "FinanceTransaction"("categoryId", "date");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_importHash_idx" ON "FinanceTransaction"("userId", "importHash");

-- CreateIndex
CREATE INDEX "FinanceBudget_userId_month_idx" ON "FinanceBudget"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudget_categoryId_month_key" ON "FinanceBudget"("categoryId", "month");

-- AddForeignKey
ALTER TABLE "FinanceSettings" ADD CONSTRAINT "FinanceSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategoryGroup" ADD CONSTRAINT "FinanceCategoryGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceCategoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayee" ADD CONSTRAINT "FinancePayee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayee" ADD CONSTRAINT "FinancePayee_lastCategoryId_fkey" FOREIGN KEY ("lastCategoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "FinancePayee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;


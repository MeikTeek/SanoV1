-- CreateTable
CREATE TABLE "DietPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "carbG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,
    "meals" TEXT,
    "rationale" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DietPlan_userId_day_key" ON "DietPlan"("userId", "day");

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Colunas que fazem o plano variar de pessoa para pessoa (adaptatividade).
ALTER TABLE "TrainingProfile" ADD COLUMN     "somatotype" TEXT,
ADD COLUMN     "experience" TEXT NOT NULL DEFAULT 'BEGINNER',
ADD COLUMN     "trainingDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "sleepHours" DOUBLE PRECISION NOT NULL DEFAULT 7,
ADD COLUMN     "waterLiters" DOUBLE PRECISION NOT NULL DEFAULT 2,
ADD COLUMN     "mealsPerDay" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "dietQuality" TEXT NOT NULL DEFAULT 'FAIR',
ADD COLUMN     "dietNotes" TEXT,
ADD COLUMN     "dietRestrictions" TEXT[];
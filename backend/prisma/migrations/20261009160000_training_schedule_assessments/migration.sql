ALTER TABLE "TrainingProfile"
  ADD COLUMN "trainingWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 3, 5],
  ADD COLUMN "trainingLocation" TEXT NOT NULL DEFAULT 'GYM',
  ADD COLUMN "targetWeightKg" DOUBLE PRECISION,
  ADD COLUMN "pregnancy" BOOLEAN,
  ADD COLUMN "heartCondition" BOOLEAN,
  ADD COLUMN "medicationUse" BOOLEAN,
  ADD COLUMN "parqAnswers" JSONB;

ALTER TABLE "WorkoutLog"
  ADD COLUMN "exerciseKey" TEXT,
  ADD COLUMN "muscleGroup" TEXT;

UPDATE "TrainingProfile"
SET "trainingDays" = GREATEST(2, LEAST(6, "trainingDays")),
    "trainingWeekdays" = CASE
  WHEN "trainingDays" <= 2 THEN ARRAY[1, 4]
  WHEN "trainingDays" = 3 THEN ARRAY[1, 3, 5]
  WHEN "trainingDays" = 4 THEN ARRAY[1, 2, 4, 5]
  WHEN "trainingDays" = 5 THEN ARRAY[1, 2, 3, 4, 5]
  ELSE ARRAY[1, 2, 3, 4, 5, 6]
END;

CREATE TABLE "BodyAssessment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "weightKg" DOUBLE PRECISION NOT NULL,
  "bodyFatPercent" DOUBLE PRECISION,
  "waistCm" DOUBLE PRECISION,
  "neckCm" DOUBLE PRECISION,
  "hipCm" DOUBLE PRECISION,
  "chestCm" DOUBLE PRECISION,
  "armCm" DOUBLE PRECISION,
  "thighCm" DOUBLE PRECISION,
  "calfCm" DOUBLE PRECISION,
  "wristCm" DOUBLE PRECISION,
  "restingHeartRate" INTEGER,
  "sleepHours" DOUBLE PRECISION,
  "fatigue" INTEGER,
  "muscleSoreness" INTEGER,
  "nutritionAdherence" INTEGER,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BodyAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BodyAssessment_userId_day_key"
  ON "BodyAssessment"("userId", "day");
CREATE INDEX "BodyAssessment_userId_createdAt_idx"
  ON "BodyAssessment"("userId", "createdAt");
ALTER TABLE "BodyAssessment"
  ADD CONSTRAINT "BodyAssessment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "TrainingProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BodyAssessment" ("id", "userId", "day", "weightKg", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       "userId",
       ("onboardedAt" AT TIME ZONE 'America/Sao_Paulo')::date::text,
       "weightKg",
       "onboardedAt",
       CURRENT_TIMESTAMP
FROM "TrainingProfile";

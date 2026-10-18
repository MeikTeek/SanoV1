CREATE TABLE "WorkoutSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "notes" VARCHAR(500),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSet" (
  "id" TEXT NOT NULL,
  "workoutLogId" TEXT NOT NULL,
  "setNumber" INTEGER NOT NULL,
  "reps" INTEGER NOT NULL,
  "loadKg" DOUBLE PRECISION,
  "rir" INTEGER,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkoutLog" ADD COLUMN "sessionId" TEXT;

CREATE INDEX "WorkoutSession_userId_day_idx" ON "WorkoutSession"("userId", "day");
CREATE INDEX "WorkoutSession_userId_createdAt_idx" ON "WorkoutSession"("userId", "createdAt");
CREATE INDEX "WorkoutLog_sessionId_idx" ON "WorkoutLog"("sessionId");
CREATE UNIQUE INDEX "WorkoutSet_workoutLogId_setNumber_key"
  ON "WorkoutSet"("workoutLogId", "setNumber");

ALTER TABLE "WorkoutSession"
  ADD CONSTRAINT "WorkoutSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutLog"
  ADD CONSTRAINT "WorkoutLog_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkoutSet"
  ADD CONSTRAINT "WorkoutSet_workoutLogId_fkey"
  FOREIGN KEY ("workoutLogId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "allDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" VARCHAR(200),
ADD COLUMN     "recurrence" TEXT,
ADD COLUMN     "recurrenceUntil" TIMESTAMP(3),
ADD COLUMN     "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_userId_seriesId_idx" ON "Appointment"("userId", "seriesId");


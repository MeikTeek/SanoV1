-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "discordRemindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscordLink" (
    "userId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordUsername" VARCHAR(100),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLink_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DiscordLinkCode" (
    "code" VARCHAR(12) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLinkCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_discordId_key" ON "DiscordLink"("discordId");

-- CreateIndex
CREATE INDEX "DiscordLinkCode_userId_idx" ON "DiscordLinkCode"("userId");

-- AddForeignKey
ALTER TABLE "DiscordLink" ADD CONSTRAINT "DiscordLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordLinkCode" ADD CONSTRAINT "DiscordLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


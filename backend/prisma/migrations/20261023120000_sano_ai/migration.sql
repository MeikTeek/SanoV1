-- CreateTable
CREATE TABLE "SanoAiConfig" (
    "userId" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "keyHint" VARCHAR(24) NOT NULL,
    "model" VARCHAR(120) NOT NULL DEFAULT 'openrouter/free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanoAiConfig_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "SanoAiConfig" ADD CONSTRAINT "SanoAiConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

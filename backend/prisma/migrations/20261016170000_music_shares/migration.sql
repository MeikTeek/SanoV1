CREATE TABLE "MusicShare" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    CONSTRAINT "MusicShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicShare_codeHash_key" ON "MusicShare"("codeHash");
CREATE UNIQUE INDEX "MusicShare_objectKey_key" ON "MusicShare"("objectKey");
CREATE INDEX "MusicShare_expiresAt_status_idx" ON "MusicShare"("expiresAt", "status");
ALTER TABLE "MusicShare" ADD CONSTRAINT "MusicShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

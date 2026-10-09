CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "showOnlineStatus" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showActivityStatus" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "currentActivity" TEXT;

CREATE TABLE "FriendRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FriendRequest_pairKey_key"
  ON "FriendRequest"("pairKey");
CREATE INDEX "FriendRequest_recipientId_status_idx"
  ON "FriendRequest"("recipientId", "status");

INSERT INTO "FriendRequest" ("id", "requesterId", "recipientId", "pairKey", "status", "updatedAt")
SELECT gen_random_uuid()::text,
       f."followerId", f."followingId",
       LEAST(f."followerId", f."followingId") || ':' || GREATEST(f."followerId", f."followingId"),
       'ACCEPTED', CURRENT_TIMESTAMP
FROM "Follow" f
WHERE f."followerId" < f."followingId"
  AND EXISTS (
    SELECT 1 FROM "Follow" reciprocal
    WHERE reciprocal."followerId" = f."followingId"
      AND reciprocal."followingId" = f."followerId"
  );

INSERT INTO "FriendRequest" ("id", "requesterId", "recipientId", "pairKey", "status", "updatedAt")
SELECT gen_random_uuid()::text,
       f."followerId", f."followingId",
       LEAST(f."followerId", f."followingId") || ':' || GREATEST(f."followerId", f."followingId"),
       'PENDING', CURRENT_TIMESTAMP
FROM "Follow" f
WHERE NOT EXISTS (
  SELECT 1 FROM "Follow" reciprocal
  WHERE reciprocal."followerId" = f."followingId"
    AND reciprocal."followingId" = f."followerId"
);

ALTER TABLE "FriendRequest"
  ADD CONSTRAINT "FriendRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FriendRequest_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "Follow";

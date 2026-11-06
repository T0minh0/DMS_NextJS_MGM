ALTER TABLE "AuthRefreshSession" ADD COLUMN "revokedAt" TIMESTAMP(3);
CREATE TABLE "AuthRefreshToken" ("tokenHash" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AuthRefreshToken_sessionId_idx" ON "AuthRefreshToken"("sessionId");
INSERT INTO "AuthRefreshToken" ("tokenHash", "sessionId") SELECT "tokenHash", "id" FROM "AuthRefreshSession";
CREATE TABLE "AuthMailOutbox" ("id" TEXT PRIMARY KEY, "payload" TEXT NOT NULL, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedUntil" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

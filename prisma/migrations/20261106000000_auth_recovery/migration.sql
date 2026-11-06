ALTER TABLE "Workers" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "recoveryEmail" TEXT, ADD COLUMN "recoveryEmailVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "AuthRefreshSession" ("id" TEXT PRIMARY KEY, "workerId" BIGINT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "authVersion" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AuthRefreshSession_workerId_idx" ON "AuthRefreshSession"("workerId");
CREATE TABLE "AuthRecoveryToken" ("authVersion" INTEGER NOT NULL DEFAULT 0, "id" TEXT PRIMARY KEY, "workerId" BIGINT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "purpose" TEXT NOT NULL, "email" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AuthRecoveryToken_workerId_purpose_idx" ON "AuthRecoveryToken"("workerId", "purpose");
CREATE TABLE "AuthAttemptLimit" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "AuthAssistanceAudit" ("id" TEXT PRIMARY KEY, "managerId" BIGINT NOT NULL, "workerId" BIGINT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

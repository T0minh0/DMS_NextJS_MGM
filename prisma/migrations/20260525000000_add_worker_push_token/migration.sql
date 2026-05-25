-- Adds the `worker_push_token` table consumed by the mobile backend
-- (`Mobile/DMS-app-Backend`) to send Expo push notifications when a manager
-- registers a weighing for a wastepicker.
--
-- The portal web does not use this table directly; it lives in the
-- authoritative schema so all three systems stay in sync.

-- CreateTable
CREATE TABLE "worker_push_token" (
    "id" BIGSERIAL NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "last_seen" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_push_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_push_token_token_key" ON "worker_push_token"("token");

-- CreateIndex
CREATE INDEX "worker_push_token_worker_id_idx" ON "worker_push_token"("worker_id");

-- AddForeignKey
ALTER TABLE "worker_push_token"
    ADD CONSTRAINT "worker_push_token_worker_id_fkey"
    FOREIGN KEY ("worker_id") REFERENCES "Workers"("Worker_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

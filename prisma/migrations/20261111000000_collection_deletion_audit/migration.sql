-- Keep an immutable snapshot even after the operational measurement is removed.
CREATE TABLE "collection_deletion_audit" (
  "id" BIGSERIAL PRIMARY KEY,
  "measurement_id" BIGINT NOT NULL UNIQUE,
  "cooperative_id" BIGINT NOT NULL,
  "actor_worker_id" BIGINT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "measurement" JSONB NOT NULL,
  "before_state" JSONB NOT NULL,
  "after_state" JSONB NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_deletion_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500)
);
CREATE INDEX "collection_deletion_audit_cooperative_created_idx"
  ON "collection_deletion_audit" ("cooperative_id", "created_at");

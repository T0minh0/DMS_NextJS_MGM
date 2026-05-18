-- S2-01 buyers case-insensitive unique constraint.
-- Adds a functional unique index on lower("Buyer_name") to prevent duplicate buyer rows
-- from concurrent find-or-create operations in the sales routes.
-- Prisma schema keeps @unique on buyerName (case-sensitive) for introspection awareness;
-- the actual enforcement is done by this lower() index at the DB level.

CREATE UNIQUE INDEX IF NOT EXISTS "Buyers_buyer_name_ci_unique"
  ON "Buyers" (lower("Buyer_name"));

-- Persist optional worker contact phone collected by profile and team-management forms.
ALTER TABLE "Workers"
  ADD COLUMN "Phone" TEXT;

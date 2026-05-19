-- Allow notice priorities 4 and 5, matching the application UI/API contract.
ALTER TABLE "notice_board"
  DROP CONSTRAINT "notice_board_priority_check";

ALTER TABLE "notice_board"
  ADD CONSTRAINT "notice_board_priority_check"
  CHECK ("priority" BETWEEN 1 AND 5);

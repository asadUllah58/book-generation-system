-- Reshape book status values for the 3-step stepper flow.
--
-- New book statuses: created → outline_review → drafting → complete (+ failed).
-- Mapping from the old graph-driven set:
--   outline_pending         → created
--   outline_review          → outline_review   (unchanged)
--   drafting                → drafting         (unchanged)
--   chapter_review          → drafting
--   compiling               → drafting
--   complete / failed       → unchanged
--
-- Outline + chapter status values (pending/approved/revised/rejected/superseded)
-- are kept as-is. Reject stays as a valid DB value even though the UI no
-- longer exposes it — may be re-surfaced later.
--
-- current_node is retained on the books table but is no longer populated by
-- the backend (LangGraph is gone). Kept for migration safety; can be dropped
-- in a later cleanup migration.

-- =============================================================
-- books.status — drop old CHECK, remap, re-add with new set
-- =============================================================

alter table books drop constraint if exists books_status_check;

update books set status = 'created'  where status = 'outline_pending';
update books set status = 'drafting' where status in ('chapter_review', 'compiling');

alter table books
  add constraint books_status_check check (status in (
    'created',
    'outline_review',
    'drafting',
    'complete',
    'failed'
  ));

alter table books alter column status set default 'created';

-- current_node is no longer meaningful under the new flow — clear it so stale
-- graph node names don't bleed into the UI. Column stays for now.
update books set current_node = null where current_node is not null;

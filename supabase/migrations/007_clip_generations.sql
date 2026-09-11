-- ============================================================
-- Clip generations — re-running identify can keep previous clips.
-- Each identify run gets a generation number; "keep" runs increment it,
-- "delete" runs wipe old clips and start back at 1.
-- ============================================================

alter table clips
  add column if not exists generation integer not null default 1;

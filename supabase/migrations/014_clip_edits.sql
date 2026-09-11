-- ============================================================
-- CLIP EDITS  (cached face-tracked portrait — the expensive "edit" stage)
-- ============================================================
-- One row per (clip, aspect_ratio, cuts_hash). The clean portrait MP4 is
-- computed once and reused across unlimited styled exports. cuts_hash is a
-- web-side fingerprint of clip.cuts + FACE_TRACK_VERSION: change the cut (or
-- the portrait algorithm) and the key changes, forcing a rebuild.
create table if not exists clip_edits (
  id            uuid primary key default gen_random_uuid(),
  clip_id       uuid not null references clips(id) on delete cascade,
  user_id       text not null,
  aspect_ratio  text not null default '9:16'
                check (aspect_ratio in ('9:16','16:9','1:1')),
  cuts_hash     text not null,                       -- fingerprint of cuts + face-track version
  r2_key        text,                                -- clean portrait MP4 in R2 (no styling)
  status        text not null default 'queued'
                check (status in ('queued','processing','done','error')),
  error_msg     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Cache key: one edit per clip + aspect ratio + cut fingerprint. The export
-- route relies on this for an atomic on-conflict insert under concurrent misses.
create unique index clip_edits_key_idx on clip_edits (clip_id, aspect_ratio, cuts_hash);
create index clip_edits_user_id_idx on clip_edits (user_id);

-- Styled exports now reference the cached edit they were composited from.
alter table exports add column if not exists edit_id uuid references clip_edits(id);

-- New job types for the split: edit_clip (expensive portrait) → style_clip (cheap composite).
alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('transcribe','identify_clips','cut_clip','export_clip','edit_clip','style_clip'));

-- RLS + updated_at trigger, mirroring exports.
alter table clip_edits enable row level security;
create policy "clip_edits_owner" on clip_edits for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');
create trigger clip_edits_updated_at before update on clip_edits for each row execute procedure set_updated_at();

-- service_role bypasses RLS but still needs table grants.
grant all on clip_edits to service_role;
grant all on clip_edits to authenticated;

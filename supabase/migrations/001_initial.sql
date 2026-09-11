-- ============================================================
-- Video Repurposing Platform — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- VIDEOS
-- ============================================================
create table if not exists videos (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,                          -- Clerk user_id
  youtube_url   text not null,
  youtube_id    text not null,
  title         text not null,
  thumbnail_url text,
  duration_sec  integer,
  channel_name  text,
  tags          text[] default '{}',
  status        text not null default 'pending'         -- pending | transcribing | ready | error
                check (status in ('pending','transcribing','ready','error')),
  error_msg     text,
  source_r2_key text,                                   -- R2 key for downloaded video file
  audio_r2_key  text,                                   -- R2 key for extracted audio (WAV)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index videos_user_id_idx on videos (user_id);
create index videos_status_idx on videos (status);

-- ============================================================
-- TRANSCRIPTS
-- ============================================================
create table if not exists transcripts (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references videos(id) on delete cascade,
  user_id       text not null,
  language      text,
  raw_words     jsonb not null default '[]',            -- WhisperX word-level output
  segments      jsonb not null default '[]',            -- WhisperX segments
  full_text     text,
  r2_key        text,                                   -- R2 key for full JSON blob
  replicate_id  text,                                   -- Replicate prediction ID
  created_at    timestamptz not null default now()
);

create unique index transcripts_video_id_idx on transcripts (video_id);

-- ============================================================
-- CLIPS
-- ============================================================
create table if not exists clips (
  id               uuid primary key default gen_random_uuid(),
  video_id         uuid not null references videos(id) on delete cascade,
  user_id          text not null,
  hook             text,                                -- strongest sentence, used as title
  text             text,                               -- full clip text
  cuts             jsonb not null default '[]',        -- [{start, end}, ...] acoustically snapped
  duration_sec     numeric(10,3),
  score            numeric(4,3),                       -- 0.0-1.0 LLM confidence
  tone             text,                               -- hook|educational|entertaining|emotional|cta|story|controversy
  sentence_groups  jsonb default '[]',                 -- preserved for debugging
  reasoning        text,
  source           text not null default 'ai'          -- ai | manual
                   check (source in ('ai','manual')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index clips_video_id_idx on clips (video_id);
create index clips_user_id_idx on clips (user_id);

-- ============================================================
-- EXPORTS  (cut + sized + subtitled output per clip)
-- ============================================================
create table if not exists exports (
  id              uuid primary key default gen_random_uuid(),
  clip_id         uuid not null references clips(id) on delete cascade,
  user_id         text not null,
  aspect_ratio    text not null default '9:16'         -- 9:16 | 16:9 | 1:1
                  check (aspect_ratio in ('9:16','16:9','1:1')),
  resolution      text not null default '1080p'        -- 720p | 1080p
                  check (resolution in ('720p','1080p')),
  preset_id       uuid,                                -- subtitle preset applied (nullable = no subtitles)
  r2_key          text,                                -- final exported MP4 in R2
  r2_url          text,                                -- signed/public URL
  status          text not null default 'queued'
                  check (status in ('queued','processing','done','error')),
  error_msg       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index exports_clip_id_idx on exports (clip_id);
create index exports_user_id_idx on exports (user_id);

-- ============================================================
-- JOBS  (async job queue — all processing goes through here)
-- ============================================================
create table if not exists jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  type         text not null                           -- transcribe | identify_clips | cut_clip | export_clip
               check (type in ('transcribe','identify_clips','cut_clip','export_clip')),
  status       text not null default 'queued'
               check (status in ('queued','processing','done','error')),
  entity_id    uuid not null,                         -- video_id or clip_id or export_id
  payload      jsonb default '{}',                    -- job-specific input params
  result       jsonb default '{}',                    -- job-specific output
  error_msg    text,
  attempts     integer not null default 0,
  worker_id    text,                                  -- which worker instance picked this up
  queued_at    timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index jobs_status_type_idx on jobs (status, type);
create index jobs_entity_id_idx on jobs (entity_id);
create index jobs_user_id_idx on jobs (user_id);

-- ============================================================
-- SUBTITLE PRESETS
-- ============================================================
create table if not exists presets (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  name          text not null,
  is_default    boolean not null default false,
  config        jsonb not null default '{}'           -- full CSS vars + GSAP config
                -- shape: { typography, color, layout, animation }
                -- see PresetConfig type in web/lib/types.ts
  ,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index presets_user_id_idx on presets (user_id);

-- Enforce single default per user
create unique index presets_user_default_idx on presets (user_id) where is_default = true;

-- ============================================================
-- SUBTITLE SEGMENTS  (per-clip editable subtitle data)
-- ============================================================
create table if not exists subtitle_segments (
  id          uuid primary key default gen_random_uuid(),
  clip_id     uuid not null references clips(id) on delete cascade,
  user_id     text not null,
  segments    jsonb not null default '[]',            -- [{text, start, end, words:[]}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index subtitle_segments_clip_id_idx on subtitle_segments (clip_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table videos           enable row level security;
alter table transcripts      enable row level security;
alter table clips            enable row level security;
alter table exports          enable row level security;
alter table jobs             enable row level security;
alter table presets          enable row level security;
alter table subtitle_segments enable row level security;

-- Videos: users see only their own
create policy "videos_owner" on videos for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "transcripts_owner" on transcripts for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "clips_owner" on clips for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "exports_owner" on exports for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "jobs_owner" on jobs for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "presets_owner" on presets for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "subtitle_segments_owner" on subtitle_segments for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

-- ============================================================
-- REALTIME  (enable for live job status updates)
-- ============================================================
-- Run in Supabase dashboard: Realtime > Tables > enable for 'jobs', 'exports', 'videos'
-- Or via CLI: supabase realtime enable jobs exports videos

-- ============================================================
-- UPDATED_AT trigger
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger videos_updated_at           before update on videos           for each row execute procedure set_updated_at();
create trigger clips_updated_at            before update on clips            for each row execute procedure set_updated_at();
create trigger exports_updated_at          before update on exports          for each row execute procedure set_updated_at();
create trigger presets_updated_at          before update on presets          for each row execute procedure set_updated_at();
create trigger subtitle_segments_updated_at before update on subtitle_segments for each row execute procedure set_updated_at();

-- ============================================================
-- GRANTS  (service_role bypasses RLS but still needs table grants)
-- ============================================================
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

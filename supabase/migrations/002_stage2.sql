-- ============================================================
-- Stage 2 Migration — adds new columns and tables
-- ============================================================

-- ============================================================
-- TRANSCRIPTS — Stage 2 additions
-- ============================================================
alter table transcripts
  add column if not exists speaker_labels jsonb default '{}',   -- { "SPEAKER_00": "John", ... }
  add column if not exists model_size     text;                 -- base | medium | large


-- ============================================================
-- CLIPS — Stage 2 additions
-- ============================================================
alter table clips
  add column if not exists social_title       text,             -- AI-generated social title
  add column if not exists social_description text,             -- AI-generated caption + hashtags
  add column if not exists approved           boolean,          -- null=unreviewed, true=approved, false=rejected
  add column if not exists series_id          uuid;             -- optional series grouping

create index if not exists clips_approved_idx on clips (user_id, approved);


-- ============================================================
-- EXPORTS — Stage 2 additions
-- Drop and recreate the check constraint to add 4:5
-- ============================================================
alter table exports
  add column if not exists frame_rate integer default 30,       -- 24 | 30 | 60
  add column if not exists quality    text    default 'standard'; -- draft | standard | high

-- Update aspect_ratio constraint to include 4:5
alter table exports drop constraint if exists exports_aspect_ratio_check;
alter table exports add constraint exports_aspect_ratio_check
  check (aspect_ratio in ('9:16','16:9','1:1','4:5'));

-- Update resolution constraint to include 4K
alter table exports drop constraint if exists exports_resolution_check;
alter table exports add constraint exports_resolution_check
  check (resolution in ('720p','1080p','4K'));


-- ============================================================
-- JOBS — add 'cancelled' status
-- ============================================================
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('queued','processing','done','error','cancelled'));


-- ============================================================
-- USER PROFILES — niche / audience configuration
-- ============================================================
create table if not exists user_profiles (
  user_id            text primary key,                           -- Clerk user_id
  niche              text default '',
  audience           text default '',
  hook_style         text default '',
  clip_duration_min  integer default 30,
  clip_duration_max  integer default 90,
  preferred_tones    text[] default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table user_profiles enable row level security;
create policy "user_profiles_owner" on user_profiles
  for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

grant all on user_profiles to service_role;
grant all on user_profiles to authenticated;

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute procedure set_updated_at();


-- ============================================================
-- CLIP SERIES — optional grouping for related clips
-- ============================================================
create table if not exists clip_series (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  video_id    uuid not null references videos(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table clip_series enable row level security;
create policy "clip_series_owner" on clip_series
  for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

grant all on clip_series to service_role;
grant all on clip_series to authenticated;

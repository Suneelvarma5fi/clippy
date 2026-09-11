-- ============================================================
-- COLLECTIONS — playlist-style containers for videos
-- ============================================================

create table if not exists collections (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        not null,
  name       text        not null,
  created_at timestamptz not null default now()
);

alter table collections enable row level security;

create policy "collections_owner" on collections
  for all using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

grant all on collections to service_role;
grant all on collections to authenticated;

-- Add collection_id to videos (nullable — videos without a collection are uncategorised)
alter table videos
  add column if not exists collection_id uuid references collections(id) on delete set null;

-- Add face_url to videos (worker uploads face-crop from YouTube thumbnail)
alter table videos
  add column if not exists face_url text;

-- Add thumbnail_url to clips (worker uploads best-face frame from source video)
alter table clips
  add column if not exists thumbnail_url text;

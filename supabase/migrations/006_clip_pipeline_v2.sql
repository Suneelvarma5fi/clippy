-- ============================================================
-- Clip pipeline v2 — agent architecture (clip-pipeline-requirements.md)
-- New per-clip fields: checklist scoring, tension/knowledge-gap metadata,
-- stitching chunks with precise ms cut points, crosstalk flag.
-- `score` keeps its 0-1 normalized meaning (score_total / 11) for the UI.
-- ============================================================

alter table clips
  add column if not exists label             text
                           check (label in ('hero','strong','decent')),
  add column if not exists tension_type      text
                           check (tension_type in ('belief_vs_reality','before_vs_after','known_vs_unknown')),
  add column if not exists knowledge_gap     smallint,      -- 1-3 (Agent 3)
  add column if not exists must_haves        smallint,      -- 0-5 checklist must-haves passed
  add column if not exists signals           smallint,      -- 0-6 quality signals passed
  add column if not exists score_total       smallint,      -- must_haves + signals, out of 11
  add column if not exists stitched          boolean not null default false,
  add column if not exists chunks            jsonb not null default '[]',  -- [{start_ms, end_ms, crosstalk_flagged}]
  add column if not exists crosstalk_flagged boolean not null default false;

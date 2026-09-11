-- ============================================================
-- EXPORTS.clip_spec — canonical ClipSpec v1 record
-- ============================================================
-- Every export records the canonical ClipSpec it was rendered from (cuts in
-- play order, output dims, analysis_ref/cache_ref pointers, declarative style
-- layers, all coords normalized 0-1). This is the source-of-truth object the
-- ADRs define; the renderer and preview migrate onto it incrementally.
alter table exports add column if not exists clip_spec jsonb;

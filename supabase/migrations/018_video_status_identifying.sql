-- The worker sets videos.status = 'identifying' between transcription and
-- clip identification, and the UI shows it as an active state. The check
-- constraint from 001 never allowed it: the original database had been
-- widened by hand, so fresh installs rejected the update on every video.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check;
ALTER TABLE videos ADD CONSTRAINT videos_status_check
  CHECK (status IN ('pending', 'transcribing', 'identifying', 'ready', 'error'));

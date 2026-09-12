-- Candidates the Crafter rejects (don't stand alone, too few must-haves,
-- outside the duration range) are now kept as clips on the Scout's span,
-- labelled 'weak' with the reason in `reasoning`, instead of being dropped.
ALTER TABLE clips DROP CONSTRAINT IF EXISTS clips_label_check;
ALTER TABLE clips ADD CONSTRAINT clips_label_check
  CHECK (label IN ('hero', 'strong', 'decent', 'weak'));

-- dodo_customer_id is now part of 004_credits.sql for fresh databases.
-- This migration safely adds the column for existing databases that ran 004 before this column existed.
ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT;

CREATE INDEX IF NOT EXISTS user_credits_dodo_customer_id_idx
  ON user_credits (dodo_customer_id);

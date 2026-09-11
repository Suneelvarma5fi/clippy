-- Track video processing usage per billing period
ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS video_seconds_used INTEGER NOT NULL DEFAULT 0;

-- Atomically add processed seconds to the user's usage counter
CREATE OR REPLACE FUNCTION deduct_video_seconds(p_user_id TEXT, p_seconds INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_credits
  SET video_seconds_used = video_seconds_used + p_seconds
  WHERE user_id = p_user_id;
END;
$$;

-- Reset usage when subscription renews or activates
CREATE OR REPLACE FUNCTION reset_video_usage(p_user_id TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_credits SET video_seconds_used = 0 WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_video_seconds(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION reset_video_usage(TEXT) TO service_role;

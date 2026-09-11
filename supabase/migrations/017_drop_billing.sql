-- Remove the billing/credits system.
--
-- The open-source build has no payment gateway: every install runs on the
-- operator's own API keys, so exports and video hours are not metered.
--
-- Migrations 004, 008, 009, 010, 012 and 013 are left in place so databases
-- that already ran them stay reproducible — this migration undoes their
-- effects rather than rewriting history.

-- Credit accounting functions (004, 008)
DROP FUNCTION IF EXISTS deduct_credit(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS add_credits(TEXT, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS init_user_credits(TEXT);
DROP FUNCTION IF EXISTS deduct_video_seconds(TEXT, INTEGER);
DROP FUNCTION IF EXISTS reset_video_usage(TEXT);

-- Webhook replay guard (013) — only the payment webhook wrote here
DROP TABLE IF EXISTS webhook_events;

-- Ledger first: credit_transactions references user_credits
DROP TABLE IF EXISTS credit_transactions;
DROP TABLE IF EXISTS user_credits;

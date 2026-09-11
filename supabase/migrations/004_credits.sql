-- ── user_credits: current balance per user ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_credits (
  user_id          TEXT PRIMARY KEY,
  balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  plan             TEXT    NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'creator')),
  subscription_id  TEXT,
  plan_expires_at  TIMESTAMPTZ,
  dodo_customer_id TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_credits_dodo_customer_id_idx ON user_credits (dodo_customer_id);

-- ── credit_transactions: full audit log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  amount       INTEGER     NOT NULL,
  type         TEXT        NOT NULL CHECK (type IN ('signup_bonus', 'purchase', 'subscription', 'upload', 'export', 'refund')),
  description  TEXT,
  reference_id TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON credit_transactions (user_id);
CREATE INDEX IF NOT EXISTS credit_transactions_created_at_idx ON credit_transactions (user_id, created_at DESC);

-- ── Atomic deduct: subtract 1 credit + log, returns FALSE if insufficient ─────
CREATE OR REPLACE FUNCTION deduct_credit(
  p_user_id      TEXT,
  p_type         TEXT,
  p_reference_id TEXT,
  p_description  TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < 1 THEN
    RETURN FALSE;
  END IF;
  UPDATE user_credits SET balance = balance - 1, updated_at = NOW() WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, type, description, reference_id)
    VALUES (p_user_id, -1, p_type, p_description, p_reference_id);
  RETURN TRUE;
END;
$$;

-- ── Atomic add: increment balance + log ──────────────────────────────────────
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id      TEXT,
  p_amount       INTEGER,
  p_type         TEXT,
  p_description  TEXT,
  p_reference_id TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_credits (user_id, balance, updated_at)
    VALUES (p_user_id, p_amount, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET balance = user_credits.balance + p_amount, updated_at = NOW();
  INSERT INTO credit_transactions (user_id, amount, type, description, reference_id)
    VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id);
END;
$$;

-- ── Initialise new user with signup bonus (idempotent) ────────────────────────
CREATE OR REPLACE FUNCTION init_user_credits(p_user_id TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_credits WHERE user_id = p_user_id) THEN
    INSERT INTO user_credits (user_id, balance) VALUES (p_user_id, 10);
    INSERT INTO credit_transactions (user_id, amount, type, description)
      VALUES (p_user_id, 10, 'signup_bonus', 'Welcome gift — 10 free credits');
  END IF;
END;
$$;

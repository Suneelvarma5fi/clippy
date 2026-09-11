-- The original CHECK only allowed ('free','starter','creator'), but the app
-- sells an enterprise plan — the billing webhook's upsert would violate it.
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_plan_check;
ALTER TABLE user_credits
  ADD CONSTRAINT user_credits_plan_check
  CHECK (plan IN ('free', 'starter', 'creator', 'enterprise'));

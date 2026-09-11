-- ============================================================
-- Enable RLS on the billing tables.
--
-- user_credits and credit_transactions shipped in 004 WITHOUT row level
-- security, unlike every other user-data table. The Supabase anon key is
-- public (NEXT_PUBLIC_SUPABASE_ANON_KEY) and PostgREST is internet-reachable,
-- so without RLS anyone holding that key could read every user's balance and
-- transaction history — or write their own balance — directly, bypassing the
-- Next.js API routes entirely.
--
-- The app only ever touches these tables through the service-role client
-- (which bypasses RLS) and the SECURITY-bypassing RPCs, so locking them down
-- to "owner can SELECT, nobody else can do anything" changes no app behaviour.
-- Crucially we do NOT grant owners write access — balances must only change
-- through deduct_credit / add_credits, called server-side with the service role.
-- ============================================================

alter table user_credits        enable row level security;
alter table credit_transactions enable row level security;

-- Owners may read their own rows (defense-in-depth for any future client use).
-- No INSERT/UPDATE/DELETE policy: writes are service-role only.
create policy "user_credits_select_own" on user_credits
  for select using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy "credit_transactions_select_own" on credit_transactions
  for select using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

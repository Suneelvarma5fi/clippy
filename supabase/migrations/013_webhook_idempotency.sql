-- ============================================================
-- Webhook idempotency ledger.
--
-- The Dodo billing webhook grants credits on subscription.active/renewed and
-- payment.succeeded. Payment providers retry deliveries (on timeout or any
-- non-2xx), and a captured request replays with a still-valid signature, so
-- processing an event more than once double-grants credits.
--
-- The handler records each event's Standard Webhooks `webhook-id` here before
-- granting; the primary key makes the claim atomic, so a duplicate delivery
-- hits a unique violation and is skipped.
-- ============================================================

create table if not exists webhook_events (
  id           text        primary key,   -- Standard Webhooks `webhook-id` header
  processed_at timestamptz not null default now()
);

alter table webhook_events enable row level security;
-- No policies: service-role only (it bypasses RLS). No client ever reads this.

grant all on webhook_events to service_role;

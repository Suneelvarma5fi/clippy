import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. Server-side only.
 * Every route uses this; there is no anon/browser client because the UI
 * never talks to Supabase directly (it polls the API routes instead).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

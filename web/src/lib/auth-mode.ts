/**
 * Client-safe half of the auth seam: just the mode flag, no Clerk import.
 * Client components import from here; server code imports from ./auth.
 */
export const LOCAL_AUTH = process.env.NEXT_PUBLIC_AUTH_MODE === "local";

/**
 * The user_id every row is written under in local mode. Stable across restarts
 * so a local library survives them.
 */
export const LOCAL_USER_ID = "local-user";

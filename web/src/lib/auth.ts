/**
 * Auth seam (server side).
 *
 * Self-hosted installs set NEXT_PUBLIC_AUTH_MODE=local: the app then runs as a
 * single fixed user and needs no Clerk account, no keys, and no network. Any
 * other value keeps real Clerk auth, so the same code deploys multi-user.
 *
 * The flag itself lives in ./auth-mode so client components can read it
 * without pulling Clerk's server-only code into the browser bundle.
 */
import "server-only";
export { LOCAL_AUTH, LOCAL_USER_ID } from "./auth-mode";
import { LOCAL_AUTH, LOCAL_USER_ID } from "./auth-mode";

export async function auth(): Promise<{ userId: string | null }> {
  if (LOCAL_AUTH) return { userId: LOCAL_USER_ID };
  // Imported lazily so local installs never load the SDK or trip its key checks.
  const { auth: clerkAuth } = await import("@clerk/nextjs/server");
  return clerkAuth();
}

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { detectBot, clientIp, RateLimiter } from "@/lib/bot-detection";
import { LOCAL_AUTH } from "@/lib/auth";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

// Webhook senders are legitimate non-browser clients (signature-verified) —
// they must bypass the bot checks entirely.
const isWebhookRoute = createRouteMatcher([
  "/api/webhooks(.*)",
]);

// Per-IP, per-instance fixed windows. APIs are tighter than page loads
// (a page render fans out into several API calls, hence the higher page allowance).
const apiLimiter  = new RateLimiter(120, 60_000); // 120 API requests / min / IP
const pageLimiter = new RateLimiter(300, 60_000); // 300 page requests / min / IP

// Bot + rate-limit gate, applied in both auth modes. Returns a response to
// short-circuit the request, or null to let it continue.
function gate(req: NextRequest): NextResponse | null {
  if (isWebhookRoute(req)) return null;

  const verdict = detectBot(req.headers);
  if (verdict.isBot) {
    return new NextResponse("Automated access is not allowed", {
      status: 403,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const isApi = req.nextUrl.pathname.startsWith("/api");
  const limiter = isApi ? apiLimiter : pageLimiter;
  const { allowed, retryAfterSec } = limiter.check(`${clientIp(req.headers)}:${isApi ? "api" : "page"}`);
  if (!allowed) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    });
  }

  return null;
}

// Local mode never calls clerkMiddleware, so the app runs without Clerk keys.
export default LOCAL_AUTH
  ? (req: NextRequest) => gate(req) ?? NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      const blocked = gate(req);
      if (blocked) return blocked;
      if (!isPublicRoute(req)) await auth.protect();
    });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

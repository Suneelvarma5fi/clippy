/**
 * Bot detection + rate limiting, applied in the Clerk middleware (proxy.ts)
 * before any route handler runs. Edge-runtime safe (no Node APIs).
 *
 * Layers:
 *  1. User-Agent signature check — blocks crawlers, scrapers, HTTP libraries
 *     and headless browsers outright.
 *  2. Header sanity check — real browsers always send an Accept header.
 *  3. Per-IP rate limiting — fixed-window counters; a scripted real-browser
 *     session still can't hammer the APIs.
 *
 * Webhook routes are exempted by the caller (their senders are legitimate
 * non-browser clients, verified by signature instead).
 */

// Crawlers, scrapers, CLI tools, HTTP libraries, headless/automated browsers.
// "java(?!script)" avoids matching the "JavaScript" token in some legit UAs.
export const BOT_UA_PATTERN =
  /bot\b|crawl|spider|scrap[ei]|slurp|curl|wget|python|httpx|aiohttp|requests\/|scrapy|java(?!script)|libwww|perl|php\/|go-http|okhttp|node-fetch|axios|undici|got\/|headless|phantomjs|puppeteer|playwright|selenium|chromedriver|http[-_ ]?client|postman|insomnia|facebookexternalhit|bytespider|petalbot|semrush|ahrefs|mj12/i;

export interface BotVerdict {
  isBot: boolean;
  reason?: string;
}

interface HeaderLike {
  get(name: string): string | null;
}

export function detectBot(headers: HeaderLike): BotVerdict {
  const ua = (headers.get("user-agent") ?? "").trim();

  if (!ua) return { isBot: true, reason: "missing user-agent" };

  const match = ua.match(BOT_UA_PATTERN);
  if (match) return { isBot: true, reason: `ua:${match[0].toLowerCase()}` };

  // Every real browser sends Accept; HTTP libraries with spoofed UAs often don't
  if (!headers.get("accept")) return { isBot: true, reason: "missing accept header" };

  return { isBot: false };
}

/** Fixed-window per-key rate limiter. In-memory — limits apply per server
 *  instance, which is the right first layer; put a WAF in front for global. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    const w = this.windows.get(key);

    if (!w || t - w.start >= this.windowMs) {
      this.gc(t);
      this.windows.set(key, { start: t, count: 1 });
      return { allowed: true, retryAfterSec: 0 };
    }

    w.count += 1;
    if (w.count <= this.max) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.ceil((w.start + this.windowMs - t) / 1000) };
  }

  /** Drop expired windows so the map can't grow unbounded. */
  private gc(t: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, w] of this.windows) {
      if (t - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

/**
 * Best-effort client IP for rate-limit keying.
 *
 * Prefer x-real-ip: it's a single value set by the immediate reverse proxy and
 * isn't a client-suppliable list, so it can't be padded to forge a fresh IP per
 * request. X-Forwarded-For is a comma list a client can prefill to evade the
 * limiter, so fall back to its *last* hop (the entry the trusted proxy appended)
 * rather than the first (which is whatever the client sent).
 *
 * NOTE: this still assumes a single trusted proxy in front. For a hard
 * guarantee, pin to the hosting platform's verified header
 * (e.g. cf-connecting-ip / x-vercel-forwarded-for) and treat all others as
 * untrusted.
 */
export function clientIp(headers: HeaderLike): string {
  const real = (headers.get("x-real-ip") ?? "").trim();
  if (real) return real;
  const xff = headers.get("x-forwarded-for") ?? "";
  const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] || "unknown";
}

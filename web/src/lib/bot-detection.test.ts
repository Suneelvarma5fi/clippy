import { describe, it, expect } from "vitest";
import { detectBot, clientIp, RateLimiter } from "./bot-detection";

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("detectBot", () => {
  it("flags scrapers, CLI tools, HTTP libraries, and crawlers by user-agent", () => {
    for (const ua of [
      "curl/8.4.0",
      "Wget/1.21",
      "python-requests/2.31.0",
      "Python/3.11 aiohttp/3.9",
      "Scrapy/2.11 (+https://scrapy.org)",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
      "axios/1.6.8",
      "okhttp/4.12.0",
      "PostmanRuntime/7.36.0",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0.0.0",
      "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    ]) {
      expect(detectBot(headers({ "user-agent": ua, accept: "*/*" })).isBot, ua).toBe(true);
    }
  });

  it("flags a missing user-agent and a browser UA without an Accept header", () => {
    expect(detectBot(headers({ accept: "*/*" })).isBot).toBe(true);
    expect(detectBot(headers({ "user-agent": CHROME_UA })).isBot).toBe(true);
  });

  it("passes real browsers", () => {
    expect(detectBot(headers({ "user-agent": CHROME_UA, accept: "text/html" })).isBot).toBe(false);
    const safari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(detectBot(headers({ "user-agent": safari, accept: "*/*" })).isBot).toBe(false);
    // "JavaScript" in a UA must not trip the java rule
    expect(detectBot(headers({ "user-agent": CHROME_UA + " JavaScript", accept: "*/*" })).isBot).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit then blocks with a Retry-After", () => {
    let t = 0;
    const rl = new RateLimiter(3, 60_000, () => t);
    expect(rl.check("ip1").allowed).toBe(true);
    expect(rl.check("ip1").allowed).toBe(true);
    expect(rl.check("ip1").allowed).toBe(true);
    const blocked = rl.check("ip1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    t = 30_000;
    expect(rl.check("ip1").retryAfterSec).toBe(30);
  });

  it("resets after the window and isolates keys", () => {
    let t = 0;
    const rl = new RateLimiter(1, 60_000, () => t);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);   // different key unaffected
    t = 60_000;
    expect(rl.check("a").allowed).toBe(true);   // window rolled over
  });
});

describe("clientIp", () => {
  it("takes the last hop of X-Forwarded-For (the one the trusted proxy appended)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("10.0.0.1");
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(headers({}))).toBe("unknown");
  });
});

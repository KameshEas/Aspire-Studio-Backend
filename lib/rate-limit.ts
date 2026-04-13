import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, SECURITY_HEADERS } from "./cors";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

function getClientKey(req: NextRequest): string {
  return req.headers.get("authorization")?.slice(0, 50) || req.headers.get("x-forwarded-for") || "anonymous";
}

export function rateLimit(limit: number, windowMs: number) {
  return function <T extends (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>>(fn: T): T {
    return (async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
      cleanup();
      const key = `${getClientKey(req)}:${req.nextUrl.pathname}`;
      const now = Date.now();
      const entry = store.get(key);

      if (entry && entry.resetAt > now) {
        if (entry.count >= limit) {
          const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
          return NextResponse.json(
            { error: "Rate limit exceeded" },
            {
              status: 429,
              headers: {
                ...CORS_HEADERS,
                ...SECURITY_HEADERS,
                "Retry-After": String(retryAfter),
              },
            },
          );
        }
        entry.count++;
      } else {
        store.set(key, { count: 1, resetAt: now + windowMs });
      }

      return fn(req, ctx);
    }) as T;
  };
}

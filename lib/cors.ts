import { NextResponse } from "next/server";

export const ALLOWED_ORIGIN = (() => {
  const url = process.env.FRONTEND_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FRONTEND_URL must be set in production");
    }
    return "http://localhost:3000";
  }
  try {
    new URL(url);
    return url;
  } catch {
    throw new Error(`Invalid FRONTEND_URL: ${url}`);
  }
})();

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Org-Id",
  "Access-Control-Allow-Credentials": "true",
};

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

export function corsPreflightResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, ...SECURITY_HEADERS },
  });
}

export function applyCorsHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries({ ...CORS_HEADERS, ...SECURITY_HEADERS })) {
    res.headers.set(k, v);
  }
  return res;
}

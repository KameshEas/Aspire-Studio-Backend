import crypto from "crypto";

const DEV_FALLBACK_SECRET = "aspire-studio-dev-only-signing-secret";

function secret(): string {
  const configured = process.env.STORAGE_SIGNING_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("STORAGE_SIGNING_SECRET must be set in production");
  }
  return DEV_FALLBACK_SECRET;
}

function sign(storageKey: string, expires: number): string {
  return crypto.createHmac("sha256", secret()).update(`${storageKey}\n${expires}`).digest("hex");
}

/** Base URL that browsers on another origin can reach the API on. */
export function publicBaseUrl(): string {
  return (process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3002}`).replace(/\/$/, "");
}

export function signStorageUrl(storageKey: string, expiresInSeconds = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = sign(storageKey, expires);
  return `${publicBaseUrl()}/api/v1/storage/${storageKey}?exp=${expires}&sig=${sig}`;
}

export function verifyStorageSignature(storageKey: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(sign(storageKey, expires), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBaseUrl, signStorageUrl, verifyStorageSignature } from "@/lib/storage/signing";

const KEY = "orgs/o1/projects/p1/generations/g1/output.txt";

function parts(url: string) {
  const parsed = new URL(url);
  return { path: parsed.pathname, exp: parsed.searchParams.get("exp"), sig: parsed.searchParams.get("sig") };
}

beforeEach(() => {
  process.env.STORAGE_SIGNING_SECRET = "test-secret";
  delete process.env.BACKEND_PUBLIC_URL;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.STORAGE_SIGNING_SECRET;
});

describe("signStorageUrl", () => {
  it("returns an absolute URL on the backend origin so other origins can load it", () => {
    expect(signStorageUrl(KEY)).toMatch(/^http:\/\/localhost:3002\/api\/v1\/storage\/orgs\/o1\//);
  });

  it("honours BACKEND_PUBLIC_URL and strips a trailing slash", () => {
    process.env.BACKEND_PUBLIC_URL = "https://api.example.com/";
    expect(publicBaseUrl()).toBe("https://api.example.com");
    expect(signStorageUrl(KEY).startsWith("https://api.example.com/api/v1/storage/")).toBe(true);
  });
});

describe("verifyStorageSignature", () => {
  it("accepts a freshly signed URL", () => {
    const { exp, sig } = parts(signStorageUrl(KEY));
    expect(verifyStorageSignature(KEY, exp, sig)).toBe(true);
  });

  it("rejects missing parameters", () => {
    expect(verifyStorageSignature(KEY, null, null)).toBe(false);
    const { exp } = parts(signStorageUrl(KEY));
    expect(verifyStorageSignature(KEY, exp, null)).toBe(false);
  });

  it("rejects a signature issued for a different file", () => {
    const { exp, sig } = parts(signStorageUrl(KEY));
    expect(verifyStorageSignature("orgs/o2/projects/p9/generations/g1/output.txt", exp, sig)).toBe(false);
  });

  it("rejects a tampered expiry", () => {
    const { exp, sig } = parts(signStorageUrl(KEY, 60));
    expect(verifyStorageSignature(KEY, String(Number(exp) + 3600), sig)).toBe(false);
  });

  it("rejects malformed signatures without throwing", () => {
    const { exp } = parts(signStorageUrl(KEY));
    expect(verifyStorageSignature(KEY, exp, "not-hex")).toBe(false);
    expect(verifyStorageSignature(KEY, exp, "ab")).toBe(false);
  });

  it("rejects an expired link", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { exp, sig } = parts(signStorageUrl(KEY, 60));
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    expect(verifyStorageSignature(KEY, exp, sig)).toBe(false);
  });

  it("rejects signatures made with a different secret", () => {
    const { exp, sig } = parts(signStorageUrl(KEY));
    process.env.STORAGE_SIGNING_SECRET = "another-secret";
    expect(verifyStorageSignature(KEY, exp, sig)).toBe(false);
  });
});

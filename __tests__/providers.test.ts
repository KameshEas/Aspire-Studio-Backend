import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  calculateGenerationCost,
  getModelInfo,
  getProviderForModel,
  isImageModel,
  listAllModels,
} from "@/lib/providers";
import { computeTextCostUsd } from "@/lib/providers/types";

const KEYS = ["GROQ_API_KEY", "OPENAI_API_KEY", "HF_TOKEN"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
});

afterEach(() => {
  KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

describe("provider registry", () => {
  it("lists no models when no provider is configured", () => {
    expect(listAllModels()).toEqual([]);
  });

  it("lists only models of configured providers", () => {
    process.env.GROQ_API_KEY = "test-groq";
    const providers = new Set(listAllModels().map((m) => m.provider));
    expect(providers).toEqual(new Set(["groq"]));
  });

  it("routes a model id to the provider that owns it, even with an openai/ prefix", () => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENAI_API_KEY = "test-openai";
    expect(getProviderForModel("openai/gpt-oss-120b").name).toBe("groq");
    expect(getProviderForModel("gpt-4o").name).toBe("openai");
  });

  it("throws for an unknown model", () => {
    process.env.GROQ_API_KEY = "test-groq";
    expect(() => getModelInfo("nope")).toThrow(/Unknown model/);
  });

  it("throws for a model whose provider has no key configured", () => {
    expect(() => getProviderForModel("gpt-4o")).toThrow(/Unknown model/);
  });

  it("identifies image models", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    expect(isImageModel("dall-e-3")).toBe(true);
    expect(isImageModel("gpt-4o")).toBe(false);
  });

  it("computes cost from per-1M pricing", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    // gpt-4o: $2.5 in / $10 out per 1M tokens
    expect(calculateGenerationCost("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(12.5);
  });
});

describe("computeTextCostUsd", () => {
  it("returns 0 for an unknown model", () => {
    expect(computeTextCostUsd(undefined, 100, 100)).toBe(0);
  });
});

import { ApiError } from "./auth";

interface StringRules {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
}

const RULES: Record<string, StringRules> = {
  name: { minLength: 1, maxLength: 255 },
  slug: { minLength: 1, maxLength: 100, pattern: /^[a-z0-9-]+$/, patternMessage: "must be lowercase alphanumeric with hyphens" },
  prompt: { minLength: 1, maxLength: 50000 },
  description: { maxLength: 2000 },
  email: { minLength: 3, maxLength: 254 },
};

export function validateString(value: unknown, field: string, rules?: StringRules): string {
  const r = rules ?? RULES[field as keyof typeof RULES];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required`);
  }
  const trimmed = value.trim();
  if (r) {
    if (r.minLength !== undefined && trimmed.length < r.minLength) {
      throw new ApiError(400, `${field} must be at least ${r.minLength} characters`);
    }
    if (r.maxLength !== undefined && trimmed.length > r.maxLength) {
      throw new ApiError(400, `${field} must be at most ${r.maxLength} characters`);
    }
    if (r.pattern && !r.pattern.test(trimmed)) {
      throw new ApiError(400, `${field} ${r.patternMessage ?? "format is invalid"}`);
    }
  }
  return trimmed;
}

export function validateOptionalString(value: unknown, field: string, rules?: StringRules): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return validateString(value, field, rules);
}

const VALID_GENERATION_STATUSES = ["pending", "running", "succeeded", "failed", "cancelled"] as const;
const VALID_JOB_TYPES = ["text", "image", "code", "branding", "ui", "blueprint", "embeddings"] as const;

export function validateEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(400, `Invalid ${field}. Allowed: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function validateOptionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return validateEnum(value, field, allowed);
}

export { VALID_GENERATION_STATUSES, VALID_JOB_TYPES };

import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  extractVariablesFromPrompt,
  interpolateTemplate,
  mergeVariablesSchema,
  validateVariables,
} from "@/lib/templates";

describe("interpolateTemplate", () => {
  it("replaces every occurrence of a variable", () => {
    const { interpolatedPrompt } = interpolateTemplate("{{a}} and {{a}}", { a: "x" });
    expect(interpolatedPrompt).toBe("x and x");
  });

  it("inserts values containing $, \\ and & verbatim", () => {
    const { interpolatedPrompt } = interpolateTemplate("Price: {{p}}", { p: "$100 & $& \\ $1" });
    expect(interpolatedPrompt).toBe("Price: $100 & $& \\ $1");
  });

  it("warns and leaves a placeholder for a missing variable", () => {
    const { interpolatedPrompt, warnings } = interpolateTemplate("Hi {{name}}", {});
    expect(interpolatedPrompt).toBe("Hi [name]");
    expect(warnings).toEqual([expect.objectContaining({ type: "missing_variable", variable: "name" })]);
  });

  it("warns about provided variables the prompt never uses", () => {
    const { warnings } = interpolateTemplate("Hi", { extra: "1" }, { extra: { type: "text" } as any });
    expect(warnings).toEqual([expect.objectContaining({ type: "unused_variable", variable: "extra" })]);
  });
});

describe("extractVariablesFromPrompt", () => {
  it("returns unique variable names, sorted", () => {
    expect(extractVariablesFromPrompt("{{b}} {{a}} {{b}}")).toEqual(["a", "b"]);
  });
});

describe("validateVariables", () => {
  it("rejects a missing required variable", () => {
    const result = validateVariables({}, { name: { type: "text", required: true } as any });
    expect(result.isValid).toBe(false);
  });

  it("accepts a provided required variable", () => {
    const result = validateVariables({ name: "Ada" }, { name: { type: "text", required: true } as any });
    expect(result.isValid).toBe(true);
  });
});

describe("mergeVariablesSchema", () => {
  it("keeps existing definitions and adds detected ones", () => {
    const merged = mergeVariablesSchema(["a", "b"], { a: { type: "number", required: false } as any });
    expect(merged.a.type).toBe("number");
    expect(merged.b).toBeDefined();
  });

  it("works without an existing schema", () => {
    expect(Object.keys(mergeVariablesSchema(["a"]))).toEqual(["a"]);
  });
});

describe("estimateTokens", () => {
  it("grows with text length and is never negative", () => {
    expect(estimateTokens("")).toBeGreaterThanOrEqual(0);
    expect(estimateTokens("word ".repeat(100))).toBeGreaterThan(estimateTokens("word ".repeat(10)));
  });
});

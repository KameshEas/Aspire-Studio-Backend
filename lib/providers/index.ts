/**
 * Provider registry — routes a model ID to the adapter that serves it.
 *
 * A provider is "enabled" when its API key env var is set. Only enabled
 * providers appear in model listings; asking for a model whose provider is
 * not configured fails with a clear error.
 */
import { GroqAdapter } from "./groq";
import { HuggingFaceAdapter } from "./huggingface";
import { OpenAIAdapter } from "./openai";
import { computeTextCostUsd } from "./types";
import type { ModelInfo, ProviderAdapter } from "./types";

export * from "./types";

interface ProviderEntry {
  name: string;
  envVar: string;
  create: () => ProviderAdapter;
}

const REGISTRY: ProviderEntry[] = [
  { name: "groq", envVar: "GROQ_API_KEY", create: () => new GroqAdapter() },
  { name: "openai", envVar: "OPENAI_API_KEY", create: () => new OpenAIAdapter() },
  { name: "huggingface", envVar: "HF_TOKEN", create: () => new HuggingFaceAdapter() },
];

const instances = new Map<string, ProviderAdapter>();

function isEnabled(entry: ProviderEntry): boolean {
  return Boolean(process.env[entry.envVar]);
}

function getAdapter(entry: ProviderEntry): ProviderAdapter {
  let adapter = instances.get(entry.name);
  if (!adapter) {
    adapter = entry.create();
    instances.set(entry.name, adapter);
  }
  return adapter;
}

/** All models from every provider whose API key is configured. */
export function listAllModels(): ModelInfo[] {
  return REGISTRY.filter(isEnabled).flatMap((entry) => getAdapter(entry).listModels());
}

/** Look up a model by ID across enabled providers. Throws if unknown. */
export function getModelInfo(modelId: string): ModelInfo {
  const model = listAllModels().find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model;
}

export function isImageModel(modelId: string): boolean {
  return getModelInfo(modelId).capabilities.includes("image");
}

/** Resolve the adapter serving a model ID. */
export function getProviderForModel(modelId: string): ProviderAdapter {
  const model = getModelInfo(modelId);
  const entry = REGISTRY.find((e) => e.name === model.provider);
  if (!entry) throw new Error(`No adapter registered for provider: ${model.provider}`);
  return getAdapter(entry);
}

/** Estimated USD cost of a text generation on the given model. */
export function calculateGenerationCost(modelId: string, tokensIn: number, tokensOut: number): number {
  return computeTextCostUsd(getModelInfo(modelId), tokensIn, tokensOut);
}

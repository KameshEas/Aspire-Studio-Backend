/**
 * Provider registry — central point for getting the right provider adapter
 * based on a model ID. Add new providers here as they're integrated.
 */
import { GroqAdapter } from "./groq";
import { HuggingFaceAdapter } from "./huggingface";
import type { ProviderAdapter, ModelInfo } from "./types";

export type { ProviderAdapter, ModelInfo };
export type {
  TextGenerationRequest,
  TextGenerationResult,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "./types";

// Singleton adapter instances
let groqAdapter: GroqAdapter | null = null;
let hfAdapter: HuggingFaceAdapter | null = null;

function getGroq(): GroqAdapter {
  if (!groqAdapter) groqAdapter = new GroqAdapter();
  return groqAdapter;
}

function getHuggingFace(): HuggingFaceAdapter {
  if (!hfAdapter) hfAdapter = new HuggingFaceAdapter();
  return hfAdapter;
}

/**
 * Get provider adapter for a given model ID.
 * Falls back to Groq for unknown text models.
 */
export function getProviderForModel(modelId: string): ProviderAdapter {
  if (
    modelId.startsWith("black-forest-labs/") ||
    modelId.startsWith("stabilityai/") ||
    modelId.startsWith("runwayml/")
  ) {
    return getHuggingFace();
  }
  // Default to Groq for all text/LLM models
  return getGroq();
}

/**
 * List all known models across all providers.
 */
export function listAllModels(): ModelInfo[] {
  return [
    ...getGroq().listModels!(),
    ...getHuggingFace().listModels!(),
  ];
}

/**
 * Determine if a model is an image model.
 */
export function isImageModel(modelId: string): boolean {
  const all = listAllModels();
  const found = all.find((m) => m.id === modelId);
  return found?.capabilities.includes("image") ?? false;
}

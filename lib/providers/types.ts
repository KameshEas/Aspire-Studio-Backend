/**
 * Provider abstraction types
 * Unified interface for all LLM / image providers.
 */

export type ModelCapability = "text" | "image" | "embeddings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TextGenerationRequest {
  model: string;
  /** Either `prompt` or `messages` must be supplied. */
  prompt?: string;
  messages?: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface TextGenerationResult {
  text: string;
  model: string;
  provider: string;
  usage: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
  latencyMs: number;
  finishReason?: "stop" | "length" | "error" | "unknown";
}

export interface ImageGenerationRequest {
  model?: string;
  prompt: string;
  width?: number;
  height?: number;
}

export interface ImageGenerationResult {
  imageBase64: string;
  mimeType: string;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  /** USD per 1M input tokens (0 for image models). */
  costInputPer1M: number;
  /** USD per 1M output tokens (0 for image models). */
  costOutputPer1M: number;
  /** Flat USD cost per generated image (image models only). */
  costPerImage?: number;
  description?: string;
  deprecated?: boolean;
}

export interface ProviderAdapter {
  readonly name: string;
  listModels(): ModelInfo[];
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
  generateImage?(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

/** Map an OpenAI-style finish_reason to our normalized value. */
export function normalizeFinishReason(reason: string | null | undefined): TextGenerationResult["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case null:
    case undefined:
      return "unknown";
    default:
      return "unknown";
  }
}

/** Compute USD cost for a text generation given a model's pricing. */
export function computeTextCostUsd(model: ModelInfo | undefined, tokensIn: number, tokensOut: number): number {
  if (!model) return 0;
  return (tokensIn * model.costInputPer1M) / 1_000_000 + (tokensOut * model.costOutputPer1M) / 1_000_000;
}

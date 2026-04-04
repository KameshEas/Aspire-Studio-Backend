/**
 * Shared types for AI provider adapters.
 */

export interface TextGenerationRequest {
  model: string;
  prompt?: string;
  messages?: { role: "system" | "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
}

export interface TextGenerationResult {
  text: string;
  model: string;
  provider: string;
  usage: {
    tokensIn: number;
    tokensOut: number;
    /** Estimated cost in USD */
    costUsd: number;
  };
  latencyMs: number;
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  numImages?: number;
}

export interface ImageGenerationResult {
  /** Base64-encoded PNG/JPEG */
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
  capabilities: ("text" | "image" | "embedding")[];
  contextWindow: number;
  /** Cost per 1M input tokens in USD */
  costInputPer1M: number;
  /** Cost per 1M output tokens in USD */
  costOutputPer1M: number;
  description?: string;
}

export interface ProviderAdapter {
  readonly name: string;
  generateText(req: TextGenerationRequest): Promise<TextGenerationResult>;
  generateImage?(req: ImageGenerationRequest): Promise<ImageGenerationResult>;
  listModels?(): ModelInfo[];
}

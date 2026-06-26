/**
 * Provider abstraction types
 * Unified interface for all LLM providers
 */

export interface GenerateTextRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface GenerateTextResponse {
  text: string;
  usage: {
    tokensIn: number;
    tokensOut: number;
  };
  model: string;
  provider: string;
  finishReason?: 'stop' | 'length' | 'error' | 'unknown';
}

export interface GenerateImageRequest {
  prompt: string;
  size?: 'small' | 'medium' | 'large';
  quantity?: number;
}

export interface GenerateImageResponse {
  images: Array<{
    url: string;
    base64?: string;
  }>;
  usage: {
    imageCount: number;
  };
  model: string;
  provider: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  capabilities: ('text-generation' | 'image-generation' | 'embeddings')[];
  contextWindow: number;
  costPer1kTokensIn: number;
  costPer1kTokensOut: number;
  deprecated?: boolean;
}

export interface ProviderAdapter {
  generateText(request: GenerateTextRequest): Promise<GenerateTextResponse>;
  generateImage(request: GenerateImageRequest): Promise<GenerateImageResponse>;
  listModels(): Promise<ModelInfo[]>;
  getModelInfo(modelId: string): Promise<ModelInfo>;
}

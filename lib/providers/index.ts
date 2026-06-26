/**
 * Provider Registry & Factory
 * Manages all LLM provider instances and routing
 */

import { createOpenAIProvider } from './openai';
import { ProviderAdapter, ModelInfo } from './types';

// Singleton instances
let openaiProvider: ProviderAdapter | null = null;

/**
 * Get OpenAI provider instance (singleton)
 */
export function getOpenAI(): ProviderAdapter {
  if (!openaiProvider) {
    openaiProvider = createOpenAIProvider();
  }
  return openaiProvider;
}

/**
 * Get provider for a specific model ID
 * Format: "provider/model-name" e.g., "openai/gpt-4-turbo"
 */
export function getProviderForModel(modelId: string): ProviderAdapter {
  const [provider] = modelId.split('/');

  switch (provider) {
    case 'openai':
      return getOpenAI();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * List all available models across all providers
 */
export async function listAllModels(): Promise<ModelInfo[]> {
  try {
    const openaiModels = await getOpenAI().listModels();
    return [...openaiModels];
  } catch (error) {
    console.error('Error listing models:', error);
    return [];
  }
}

/**
 * Get detailed model info from any provider
 */
export async function getModelInfo(modelId: string): Promise<ModelInfo> {
  const provider = getProviderForModel(modelId);
  return provider.getModelInfo(modelId);
}

/**
 * Calculate cost for a generation
 */
export async function calculateGenerationCost(
  modelId: string,
  tokensIn: number,
  tokensOut: number
): Promise<number> {
  const modelInfo = await getModelInfo(modelId);
  const costIn = (tokensIn / 1000) * modelInfo.costPer1kTokensIn;
  const costOut = (tokensOut / 1000) * modelInfo.costPer1kTokensOut;
  return costIn + costOut;
}

/**
 * Export all providers for convenience
 */
export const providers = {
  getOpenAI,
  getProviderForModel,
  listAllModels,
  getModelInfo,
  calculateGenerationCost,
};

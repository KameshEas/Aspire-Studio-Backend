/**
 * OpenAI Provider Adapter
 * Implements unified ProviderAdapter interface for OpenAI APIs
 */

import OpenAI from 'openai';
import {
  GenerateTextRequest,
  GenerateTextResponse,
  GenerateImageRequest,
  GenerateImageResponse,
  ModelInfo,
  ProviderAdapter,
} from './types';

class OpenAIProvider implements ProviderAdapter {
  private client: OpenAI;
  private apiKey: string;
  private defaultModel = 'gpt-4-turbo';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    this.apiKey = key;
    this.client = new OpenAI({ apiKey: key });
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    const messages: OpenAI.Messages.MessageParam[] = [
      {
        role: 'user',
        content: request.prompt,
      },
    ];

    try {
      const response = await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.7,
        system: request.systemPrompt,
        messages,
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const text = textContent && 'text' in textContent ? textContent.text : '';

      return {
        text,
        usage: {
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
        },
        model: response.model,
        provider: 'openai',
        finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'unknown',
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateImage(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    try {
      const response = await this.client.images.generate({
        prompt: request.prompt,
        n: request.quantity || 1,
        size: this.mapSize(request.size),
        model: 'dall-e-3',
      });

      return {
        images: response.data.map((img) => ({
          url: img.url || '',
        })),
        usage: {
          imageCount: response.data.length,
        },
        model: 'dall-e-3',
        provider: 'openai',
      };
    } catch (error) {
      throw new Error(
        `OpenAI image generation error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        capabilities: ['text-generation'],
        contextWindow: 128000,
        costPer1kTokensIn: 0.01,
        costPer1kTokensOut: 0.03,
      },
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        capabilities: ['text-generation'],
        contextWindow: 8192,
        costPer1kTokensIn: 0.03,
        costPer1kTokensOut: 0.06,
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: ['text-generation'],
        contextWindow: 16385,
        costPer1kTokensIn: 0.0005,
        costPer1kTokensOut: 0.0015,
      },
      {
        id: 'openai/dall-e-3',
        name: 'DALL-E 3',
        provider: 'openai',
        capabilities: ['image-generation'],
        contextWindow: 0,
        costPer1kTokensIn: 0,
        costPer1kTokensOut: 0.08,
      },
    ];
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const models = await this.listModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }
    return model;
  }

  private mapSize(size?: 'small' | 'medium' | 'large'): '256x256' | '512x512' | '1024x1024' {
    switch (size) {
      case 'small':
        return '256x256';
      case 'medium':
        return '512x512';
      case 'large':
        return '1024x1024';
      default:
        return '1024x1024';
    }
  }
}

export function createOpenAIProvider(apiKey?: string): OpenAIProvider {
  return new OpenAIProvider(apiKey);
}

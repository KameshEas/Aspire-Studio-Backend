import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { HuggingFaceInference } from "@langchain/community/llms/hf";

export type LLMProvider = "ollama" | "openai" | "huggingface";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * LLM Factory
 * Creates and configures LLM instances for different providers
 * Supports: Ollama (local), OpenAI, HuggingFace Inference
 */
export class LLMFactory {
  /**
   * Get LLM instance based on configuration
   * Defaults to Ollama for local open-source development
   */
  static getLLM(config?: Partial<LLMConfig>): BaseLanguageModel {
    const defaultConfig: LLMConfig = {
      provider: process.env.LLM_PROVIDER as LLMProvider || "ollama",
      model: process.env.LLM_MODEL || "mistral",
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "2048"),
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    };

    const finalConfig = { ...defaultConfig, ...config };

    switch (finalConfig.provider) {
      case "ollama":
        return this.createOllamaLLM(finalConfig);
      case "openai":
        return this.createOpenAILLM(finalConfig);
      case "huggingface":
        return this.createHuggingFaceLLM(finalConfig);
      default:
        throw new Error(`Unknown LLM provider: ${finalConfig.provider}`);
    }
  }

  private static createOllamaLLM(config: LLMConfig): BaseLanguageModel {
    return new ChatOllama({
      model: config.model,
      baseUrl: config.baseUrl || "http://localhost:11434",
      temperature: config.temperature,
      numCtx: config.maxTokens,
    });
  }

  private static createOpenAILLM(config: LLMConfig): BaseLanguageModel {
    return new ChatOpenAI({
      modelName: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    });
  }

  private static createHuggingFaceLLM(config: LLMConfig): BaseLanguageModel {
    return new HuggingFaceInference({
      model: config.model,
      apiKey: config.apiKey || process.env.HUGGINGFACE_API_KEY,
    }) as unknown as BaseLanguageModel;
  }

  /**
   * Get configuration from environment
   */
  static getConfigFromEnv(): LLMConfig {
    return {
      provider: (process.env.LLM_PROVIDER as LLMProvider) || "ollama",
      model: process.env.LLM_MODEL || "mistral",
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "2048"),
      baseUrl: process.env.OLLAMA_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
    };
  }

  /**
   * Get all available models for a provider
   */
  static getAvailableModels(provider: LLMProvider): string[] {
    const models: Record<LLMProvider, string[]> = {
      ollama: ["mistral", "llama2", "neural-chat", "dolphin-mixtral"],
      openai: ["gpt-4", "gpt-3.5-turbo"],
      huggingface: ["mistral-7b", "neural-chat-7b", "dolphin-2.5-mixtral-8x7b"],
    };
    return models[provider] || [];
  }
}

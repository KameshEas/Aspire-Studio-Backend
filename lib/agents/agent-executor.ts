import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { Tool } from "@langchain/core/tools";
import { LLMFactory } from "./llm-factory";
import { getPromptForAgent } from "./prompts";

export interface AgentExecutorConfig {
  name: string;
  description: string;
  agentType?: string;
  tools: Tool[];
  temperature?: number;
  maxRetries?: number;
  fallbackResponse?: unknown;
}

export interface AgentExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  toolsCalled?: string[];
  executionTimeMs?: number;
}

export interface CostTracker {
  agentName: string;
  totalTokensUsed: number;
  totalInvocations: number;
  averageTokensPerInvocation: number;
  estimatedCostUSD?: number;
}

/**
 * Base Agent Executor
 * Handles LLM invocations, tool use, retry logic, and cost tracking
 * Subclass this for specialized agents (Brand, UI, Content, Code, SEO, Deployment)
 */
export abstract class BaseAgentExecutor {
  protected name: string;
  protected description: string;
  protected agentType: string;
  protected tools: Tool[];
  protected llm: BaseLanguageModel;
  protected temperature: number;
  protected maxRetries: number;
  protected fallbackResponse?: unknown;
  protected costTracker: CostTracker;

  constructor(config: AgentExecutorConfig) {
    this.name = config.name;
    this.description = config.description;
    this.agentType = config.agentType || config.name.toLowerCase().replace(/\s+agent/i, "");
    this.tools = config.tools;
    this.temperature = config.temperature || 0.7;
    this.maxRetries = config.maxRetries || 2;
    this.fallbackResponse = config.fallbackResponse;
    this.llm = LLMFactory.getLLM({ temperature: this.temperature });

    this.costTracker = {
      agentName: this.name,
      totalTokensUsed: 0,
      totalInvocations: 0,
      averageTokensPerInvocation: 0,
      estimatedCostUSD: 0,
    };
  }

  /**
   * Execute agent with given input
   */
  async execute(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        const result = await this.executeWithTools(input);

        // Track execution
        this.costTracker.totalInvocations++;
        this.updateCostTracking(result.tokensUsed?.input || 0, result.tokensUsed?.output || 0);

        return {
          ...result,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        attempt++;

        if (attempt === this.maxRetries) {
          console.error(`[${this.name}] Failed after ${this.maxRetries} attempts:`, error);

          // Return fallback response if available
          if (this.fallbackResponse) {
            return {
              success: true,
              data: this.fallbackResponse,
              error: `Fallback response used: ${(error as Error).message}`,
              executionTimeMs: Date.now() - startTime,
            };
          }

          return {
            success: false,
            error: `${this.name} execution failed: ${(error as Error).message}`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // Retry with higher temperature
        console.warn(`[${this.name}] Attempt ${attempt} failed, retrying with higher temperature...`);
        this.temperature = Math.min(1.0, this.temperature + 0.2);
      }
    }

    return {
      success: false,
      error: `${this.name} execution failed after all retries`,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Abstract method: implement in subclasses to define agent-specific logic
   */
  protected abstract executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult>;

  /**
   * Invoke a tool
   */
  protected async invokeTool(toolName: string, toolInput: Record<string, unknown>): Promise<string> {
    const tool = this.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    // LangChain DynamicTool's func accepts string input
    const inputStr = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput);
    const result = await (tool as any).func(inputStr);
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  /**
   * Update cost tracking
   */
  private updateCostTracking(inputTokens: number, outputTokens: number): void {
    const totalTokens = inputTokens + outputTokens;
    this.costTracker.totalTokensUsed += totalTokens;
    this.costTracker.averageTokensPerInvocation = Math.round(
      this.costTracker.totalTokensUsed / this.costTracker.totalInvocations
    );

    // For open-source (Ollama): cost is local compute, no USD cost
    // For paid APIs: uncomment cost calculation based on model pricing
    // this.costTracker.estimatedCostUSD = this.calculateCost(totalTokens);
  }

  /**
   * Get cost tracking data
   */
  getCostTracking(): CostTracker {
    return { ...this.costTracker };
  }

  /**
   * Reset cost tracking
   */
  resetCostTracking(): void {
    this.costTracker = {
      agentName: this.name,
      totalTokensUsed: 0,
      totalInvocations: 0,
      averageTokensPerInvocation: 0,
      estimatedCostUSD: 0,
    };
  }

  /**
   * Get system prompt for this agent
   */
  protected getSystemPrompt(): string {
    return getPromptForAgent(this.agentType);
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      tools: this.tools.map((t) => ({ name: t.name, description: t.description })),
    };
  }
}

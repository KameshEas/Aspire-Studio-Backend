import { BrandAgent } from "./specialized/brand-agent";
import { UIAgent } from "./specialized/ui-agent";
import { ContentAgent } from "./specialized/content-agent";
import { CodeAgent } from "./specialized/code-agent";
import { SEOAgent } from "./specialized/seo-agent";
import { DeploymentAgent } from "./specialized/deployment-agent";
import { AgentExecutionResult, CostTracker } from "./agent-executor";

export type TaskType = "brand" | "ui" | "content" | "code" | "seo" | "deployment" | "multi-step";

export interface CoordinatorInput {
  taskType: TaskType;
  agentInputs: Record<string, unknown>;
  dependencies?: TaskType[]; // For multi-step workflows
}

export interface CoordinatorResult {
  success: boolean;
  taskType: TaskType;
  results?: Partial<Record<TaskType, AgentExecutionResult>>;
  aggregatedCost?: CostTracker;
  executionOrder?: TaskType[];
  error?: string;
}

/**
 * Coordinator Agent
 * Routes tasks to specialized agents, manages dependencies, aggregates results
 * Orchestrates multi-step workflows based on task dependencies
 */
export class CoordinatorAgent {
  private agents: Record<TaskType, any> = {
    brand: new BrandAgent(),
    ui: new UIAgent(),
    content: new ContentAgent(),
    code: new CodeAgent(),
    seo: new SEOAgent(),
    deployment: new DeploymentAgent(),
    "multi-step": null, // Placeholder
  };

  private executedTasks: Map<TaskType, AgentExecutionResult> = new Map();
  private aggregatedCost: CostTracker = {
    agentName: "Coordinator",
    totalTokensUsed: 0,
    totalInvocations: 0,
    averageTokensPerInvocation: 0,
  };

  /**
   * Execute a task or multi-step workflow
   */
  async execute(input: CoordinatorInput): Promise<CoordinatorResult> {
    try {
      this.executedTasks.clear();
      const results: Partial<Record<TaskType, AgentExecutionResult>> = {};
      const executionOrder: TaskType[] = [];

      // Handle single-task or multi-step workflows
      if (input.taskType === "multi-step" && input.dependencies && input.dependencies.length > 0) {
        return await this.executeMultiStepWorkflow(input, results, executionOrder);
      }

      // Single task execution
      return await this.executeSingleTask(input, results, executionOrder);
    } catch (error) {
      return {
        success: false,
        taskType: input.taskType,
        error: `Coordinator execution failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Execute a single task
   */
  private async executeSingleTask(
    input: CoordinatorInput,
    results: Partial<Record<TaskType, AgentExecutionResult>>,
    executionOrder: TaskType[]
  ): Promise<CoordinatorResult> {
    const taskType = input.taskType as Exclude<TaskType, "multi-step">;
    const agent = this.agents[taskType];

    if (!agent) {
      return {
        success: false,
        taskType: input.taskType,
        error: `Unknown task type: ${taskType}`,
      };
    }

    console.log(`[Coordinator] Executing single task: ${taskType}`);
    const result = await agent.execute(input.agentInputs);
    results[taskType] = result;
    executionOrder.push(taskType);

    // Update aggregated cost
    const agentCost = agent.getCostTracking();
    this.aggregatedCost.totalTokensUsed += agentCost.totalTokensUsed;
    this.aggregatedCost.totalInvocations += agentCost.totalInvocations;

    return {
      success: result.success,
      taskType: input.taskType,
      results,
      aggregatedCost: this.aggregatedCost,
      executionOrder,
    };
  }

  /**
   * Execute multi-step workflow with dependency management
   */
  private async executeMultiStepWorkflow(
    input: CoordinatorInput,
    results: Partial<Record<TaskType, AgentExecutionResult>>,
    executionOrder: TaskType[]
  ): Promise<CoordinatorResult> {
    const dependencies = input.dependencies || [];
    console.log(`[Coordinator] Executing multi-step workflow with ${dependencies.length} tasks`);

    for (const taskType of dependencies) {
      if (this.executedTasks.has(taskType)) {
        console.log(`[Coordinator] Task ${taskType} already executed, skipping`);
        continue;
      }

      const agent = this.agents[taskType];
      if (!agent) {
        console.warn(`[Coordinator] Unknown task type: ${taskType}, skipping`);
        continue;
      }

      console.log(`[Coordinator] Executing task: ${taskType}`);
      try {
        const result = await agent.execute(input.agentInputs);
        results[taskType] = result;
        executionOrder.push(taskType);
        this.executedTasks.set(taskType, result);

        // Update aggregated cost
        const agentCost = agent.getCostTracking();
        this.aggregatedCost.totalTokensUsed += agentCost.totalTokensUsed;
        this.aggregatedCost.totalInvocations += agentCost.totalInvocations;

        // Stop on first failure (or continue based on error handling strategy)
        if (!result.success) {
          console.warn(`[Coordinator] Task ${taskType} failed: ${result.error}`);
          // Continue to next task (resilience strategy)
        }
      } catch (error) {
        console.error(`[Coordinator] Error executing task ${taskType}:`, error);
        results[taskType] = {
          success: false,
          error: `Task ${taskType} failed: ${(error as Error).message}`,
        };
      }
    }

    // Recalculate average
    if (this.aggregatedCost.totalInvocations > 0) {
      this.aggregatedCost.averageTokensPerInvocation = Math.round(
        this.aggregatedCost.totalTokensUsed / this.aggregatedCost.totalInvocations
      );
    }

    return {
      success: Object.values(results).every((r) => r.success),
      taskType: "multi-step",
      results,
      aggregatedCost: this.aggregatedCost,
      executionOrder,
    };
  }

  /**
   * Get aggregated cost tracking
   */
  getAggregatedCost(): CostTracker {
    return { ...this.aggregatedCost };
  }

  /**
   * Reset coordinator state
   */
  reset(): void {
    this.executedTasks.clear();
    this.aggregatedCost = {
      agentName: "Coordinator",
      totalTokensUsed: 0,
      totalInvocations: 0,
      averageTokensPerInvocation: 0,
    };
    Object.values(this.agents).forEach((agent) => agent?.resetCostTracking?.());
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): string[] {
    return Object.keys(this.agents).filter((key) => key !== "multi-step");
  }
}

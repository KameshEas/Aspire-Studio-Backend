import { CoordinatorAgent, TaskType, CoordinatorInput, CoordinatorResult } from "./agents";

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  tasks: TaskType[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  input: CoordinatorInput;
  result?: CoordinatorResult;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

/**
 * Simple Orchestration Manager
 * Manages workflow execution without Temporal (for MVP)
 * Future: Replace with Temporal for production scalability
 */
export class OrchestrationManager {
  private coordinator = new CoordinatorAgent();
  private executions: Map<string, WorkflowExecution> = new Map();
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Execute a workflow
   * Async execution - returns immediately with execution ID
   */
  async executeWorkflow(input: CoordinatorInput): Promise<string> {
    const executionId = this.generateId();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: `workflow-${this.generateId()}`,
      status: "pending",
      input,
      startedAt: new Date(),
    };

    this.executions.set(executionId, execution);

    // Execute asynchronously in the background
    this.runWorkflowInBackground(executionId, execution, input);

    return executionId;
  }

  /**
   * Run workflow in background
   * Non-blocking execution
   */
  private async runWorkflowInBackground(
    executionId: string,
    execution: WorkflowExecution,
    input: CoordinatorInput
  ): Promise<void> {
    try {
      execution.status = "running";

      const result = await this.coordinator.execute(input);

      execution.status = result.success ? "completed" : "failed";
      execution.result = result;
      execution.completedAt = new Date();
      execution.durationMs = execution.completedAt.getTime() - (execution.startedAt?.getTime() || 0);

      // Clean up aggregated cost after execution
      this.coordinator.reset();
    } catch (error) {
      execution.status = "failed";
      execution.error = (error as Error).message;
      execution.completedAt = new Date();
      execution.durationMs = execution.completedAt.getTime() - (execution.startedAt?.getTime() || 0);
    }
  }

  /**
   * Get workflow execution status
   */
  getExecutionStatus(executionId: string): WorkflowExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Get all executions
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Create a workflow definition for reuse
   */
  createWorkflow(definition: Omit<WorkflowDefinition, "createdAt" | "updatedAt">): WorkflowDefinition {
    const workflow: WorkflowDefinition = {
      ...definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workflows.set(definition.id, workflow);
    return workflow;
  }

  /**
   * Get workflow definition
   */
  getWorkflow(workflowId: string): WorkflowDefinition | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): string[] {
    return this.coordinator.getAvailableAgents();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global orchestration manager instance
export const orchestrationManager = new OrchestrationManager();

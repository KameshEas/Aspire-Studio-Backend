import { BaseAgentExecutor, AgentExecutorConfig, AgentExecutionResult } from "../agent-executor";
import { codeGenerationTool } from "../base-tools";

/**
 * Code Agent
 * Generates React components, tests, TypeScript types, linting validation
 */
export class CodeAgent extends BaseAgentExecutor {
  constructor(config?: Partial<AgentExecutorConfig>) {
    super({
      name: "Code Agent",
      description: "Generates React components, TypeScript types, unit tests, and validates code quality",
      tools: [codeGenerationTool],
      temperature: 0.5, // Lower temperature for more deterministic code
      ...config,
    });
  }

  protected async executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    try {
      const { componentName, functionality, props } = input;

      if (!componentName || !functionality) {
        return {
          success: false,
          error: "Missing required inputs: componentName, functionality",
        };
      }

      // Call the code generation tool
      const result = await this.invokeTool("generate_code", {
        componentName,
        functionality,
        props: (props as Array<{ name: string; type: string }>) || [],
      });

      const parsedResult = JSON.parse(result);

      return {
        success: true,
        data: {
          component: parsedResult.component,
          types: parsedResult.types,
          tests: parsedResult.tests,
          lintStatus: parsedResult.lintStatus,
        },
        toolsCalled: ["generate_code"],
        tokensUsed: {
          input: Math.ceil((JSON.stringify(input).length / 4) * 1.33),
          output: Math.ceil((result.length / 4) * 1.33),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Code Agent execution failed: ${(error as Error).message}`,
      };
    }
  }
}

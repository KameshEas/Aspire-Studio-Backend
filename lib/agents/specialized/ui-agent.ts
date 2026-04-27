import { BaseAgentExecutor, AgentExecutorConfig, AgentExecutionResult } from "../agent-executor";
import { uiGenerationTool } from "../base-tools";

/**
 * UI/UX Agent
 * Generates layouts, component specifications, mockups, HTML/CSS code
 */
export class UIAgent extends BaseAgentExecutor {
  constructor(config?: Partial<AgentExecutorConfig>) {
    super({
      name: "UI/UX Agent",
      description: "Generates UI/UX designs including layouts, component specs, mockups, and HTML/CSS code",
      tools: [uiGenerationTool],
      temperature: 0.75,
      ...config,
    });
  }

  protected async executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    try {
      const { pageType, components, colorScheme } = input;

      if (!pageType || !components || !colorScheme) {
        return {
          success: false,
          error: "Missing required inputs: pageType, components, colorScheme",
        };
      }

      // Call the UI generation tool
      const result = await this.invokeTool("generate_ui", {
        pageType,
        components,
        colorScheme,
      });

      const parsedResult = JSON.parse(result);

      return {
        success: true,
        data: {
          layout: parsedResult.layout,
          components: parsedResult.components,
          htmlCss: parsedResult.htmlCss,
        },
        toolsCalled: ["generate_ui"],
        tokensUsed: {
          input: Math.ceil((JSON.stringify(input).length / 4) * 1.33),
          output: Math.ceil((result.length / 4) * 1.33),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `UI Agent execution failed: ${(error as Error).message}`,
      };
    }
  }
}

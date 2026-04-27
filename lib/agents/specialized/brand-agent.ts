import { BaseAgentExecutor, AgentExecutorConfig, AgentExecutionResult } from "../agent-executor";
import { brandGenerationTool } from "../base-tools";
import { Tool } from "@langchain/core/tools";

/**
 * Brand Agent
 * Generates brand assets: name, tagline, color palette, logo, brand guide
 */
export class BrandAgent extends BaseAgentExecutor {
  constructor(config?: Partial<AgentExecutorConfig>) {
    super({
      name: "Brand Agent",
      description: "Generates brand identity assets including name, tagline, colors, logo description, and brand guidelines",
      tools: [brandGenerationTool],
      temperature: 0.8, // Higher creativity for branding
      ...config,
    });
  }

  protected async executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    try {
      const { industry, targetAudience, tone, keywords } = input;

      if (!industry || !targetAudience || !tone) {
        return {
          success: false,
          error: "Missing required inputs: industry, targetAudience, tone",
        };
      }

      // Call the brand generation tool
      const result = await this.invokeTool("generate_brand", {
        industry,
        targetAudience,
        tone,
        keywords: (keywords as string[]) || [],
      });

      const parsedResult = JSON.parse(result);

      return {
        success: true,
        data: {
          brandName: parsedResult.brandName,
          tagline: parsedResult.tagline,
          colors: parsedResult.colors,
          logoDescription: parsedResult.logoDescription,
          brandGuide: parsedResult.brandGuide,
        },
        toolsCalled: ["generate_brand"],
        tokensUsed: {
          input: Math.ceil((JSON.stringify(input).length / 4) * 1.33), // Rough estimate
          output: Math.ceil((result.length / 4) * 1.33),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Brand Agent execution failed: ${(error as Error).message}`,
      };
    }
  }
}

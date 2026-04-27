import { BaseAgentExecutor, AgentExecutorConfig, AgentExecutionResult } from "../agent-executor";
import { contentGenerationTool } from "../base-tools";

/**
 * Content Agent
 * Generates marketing content: hero copy, CTAs, SEO metadata, email sequences, social variants
 */
export class ContentAgent extends BaseAgentExecutor {
  constructor(config?: Partial<AgentExecutorConfig>) {
    super({
      name: "Content Agent",
      description: "Generates marketing content including hero copy, CTAs, SEO metadata, email sequences, and social variants",
      tools: [contentGenerationTool],
      temperature: 0.8,
      ...config,
    });
  }

  protected async executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    try {
      const { productName, productDescription, targetAudience, tone } = input;

      if (!productName || !productDescription || !targetAudience || !tone) {
        return {
          success: false,
          error: "Missing required inputs: productName, productDescription, targetAudience, tone",
        };
      }

      // Call the content generation tool
      const result = await this.invokeTool("generate_content", {
        productName,
        productDescription,
        targetAudience,
        tone,
      });

      const parsedResult = JSON.parse(result);

      return {
        success: true,
        data: {
          heroCopy: parsedResult.heroCopy,
          cta: parsedResult.cta,
          seoMetadata: parsedResult.seoMetadata,
          emailSequence: parsedResult.emailSequence,
          socialVariants: parsedResult.socialVariants,
        },
        toolsCalled: ["generate_content"],
        tokensUsed: {
          input: Math.ceil((JSON.stringify(input).length / 4) * 1.33),
          output: Math.ceil((result.length / 4) * 1.33),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Content Agent execution failed: ${(error as Error).message}`,
      };
    }
  }
}

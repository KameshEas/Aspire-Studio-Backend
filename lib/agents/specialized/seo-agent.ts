import { BaseAgentExecutor, AgentExecutorConfig, AgentExecutionResult } from "../agent-executor";
import { seoAnalyticsTool } from "../base-tools";

/**
 * SEO/Analytics Agent
 * Analyzes competitors, keyword strategy, meta descriptions, link structure
 */
export class SEOAgent extends BaseAgentExecutor {
  constructor(config?: Partial<AgentExecutorConfig>) {
    super({
      name: "SEO/Analytics Agent",
      description: "Analyzes SEO strategy including competitors, keywords, meta descriptions, and link structure",
      tools: [seoAnalyticsTool],
      temperature: 0.6,
      ...config,
    });
  }

  protected async executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    try {
      const { targetKeywords, competitorUrls, contentTopic } = input;

      if (!targetKeywords || !contentTopic) {
        return {
          success: false,
          error: "Missing required inputs: targetKeywords, contentTopic",
        };
      }

      // Call the SEO analysis tool
      const result = await this.invokeTool("analyze_seo", {
        targetKeywords,
        competitorUrls: (competitorUrls as string[]) || [],
        contentTopic,
      });

      const parsedResult = JSON.parse(result);

      return {
        success: true,
        data: {
          keywordStrategy: parsedResult.keywordStrategy,
          metaDescription: parsedResult.metaDescription,
          linkStructure: parsedResult.linkStructure,
          competitors: parsedResult.competitors,
          recommendations: parsedResult.recommendations,
        },
        toolsCalled: ["analyze_seo"],
        tokensUsed: {
          input: Math.ceil((JSON.stringify(input).length / 4) * 1.33),
          output: Math.ceil((result.length / 4) * 1.33),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `SEO Agent execution failed: ${(error as Error).message}`,
      };
    }
  }
}

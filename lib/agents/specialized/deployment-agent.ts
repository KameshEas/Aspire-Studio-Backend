import { BaseAgentExecutor, AgentExecutorConfig, AgentExecutionResult } from "../agent-executor";
import { deploymentTool } from "../base-tools";

/**
 * Deployment Agent
 * Handles deployment: GitHub setup, Vercel deployment, DNS, SSL certificates
 */
export class DeploymentAgent extends BaseAgentExecutor {
  constructor(config?: Partial<AgentExecutorConfig>) {
    super({
      name: "Deployment Agent",
      description: "Handles deployment including GitHub setup, Vercel deployment, DNS configuration, and SSL certificates",
      tools: [deploymentTool],
      temperature: 0.3, // Very low temperature for deterministic deployment steps
      ...config,
    });
  }

  protected async executeWithTools(input: Record<string, unknown>): Promise<AgentExecutionResult> {
    try {
      const { projectName, repositoryUrl, environment, customDomain } = input;

      if (!projectName || !environment) {
        return {
          success: false,
          error: "Missing required inputs: projectName, environment",
        };
      }

      // Call the deployment tool
      const result = await this.invokeTool("deploy_project", {
        projectName,
        repositoryUrl: (repositoryUrl as string) || undefined,
        environment,
        customDomain: (customDomain as string) || undefined,
      });

      const parsedResult = JSON.parse(result);

      return {
        success: true,
        data: {
          githubStatus: parsedResult.githubStatus,
          deploymentUrl: parsedResult.deploymentUrl,
          dnsStatus: parsedResult.dnsStatus,
          sslStatus: parsedResult.sslStatus,
        },
        toolsCalled: ["deploy_project"],
        tokensUsed: {
          input: Math.ceil((JSON.stringify(input).length / 4) * 1.33),
          output: Math.ceil((result.length / 4) * 1.33),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Deployment Agent execution failed: ${(error as Error).message}`,
      };
    }
  }
}

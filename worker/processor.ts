/**
 * Job Worker Processor
 * Processes jobs from Bull queue and executes corresponding workflows
 */

import { Job } from 'bull';
import { WorkflowType, updateWorkflowResults, markWorkflowFailed } from '../lib/workflow/engine';
import { WorkflowInput, WorkflowOutput } from '../lib/workflow/engine';
import { brandGenerateWorkflow } from './workflows/brandGenerate';
import { contentGenerateWorkflow } from './workflows/contentGenerate';
import { uiGenerateWorkflow } from './workflows/uiGenerate';
import { codeGenerateWorkflow } from './workflows/codeGenerate';
import { projectBuildWorkflow } from './workflows/projectBuild';

export async function processJob(job: Job): Promise<WorkflowOutput> {
  const { jobId, workflowType, input } = job.data as {
    jobId: string;
    workflowType: WorkflowType;
    input: WorkflowInput;
  };

  let result: WorkflowOutput;

  try {
    console.log(
      `[Worker] Processing job ${jobId} - type: ${workflowType}`,
      {
        projectId: input.projectId,
        timestamp: new Date().toISOString(),
      }
    );

    // Route to appropriate workflow
    switch (workflowType) {
      case 'brand-generate':
        result = await brandGenerateWorkflow(input);
        break;
      case 'content-generate':
        result = await contentGenerateWorkflow(input);
        break;
      case 'ui-generate':
        result = await uiGenerateWorkflow(input);
        break;
      case 'code-generate':
        result = await codeGenerateWorkflow(input);
        break;
      case 'project-build':
        result = await projectBuildWorkflow(input);
        break;
      default:
        throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    // Check if workflow succeeded
    if (result.errors && result.errors.length > 0) {
      console.warn(`[Worker] Job ${jobId} completed with errors:`, result.errors);
    } else {
      console.log(`[Worker] Job ${jobId} completed successfully`, {
        artifactCount: result.artifacts.length,
        duration: result.metrics?.totalDurationMs,
      });
    }

    // Update job record with results
    await updateWorkflowResults(jobId, result);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Job ${jobId} failed:`, errorMessage);

    // Mark as failed and move to DLQ
    await markWorkflowFailed(jobId, errorMessage, true);

    throw error; // Bull will handle retry based on job config
  }
}

/**
 * Register job processor for all task queues
 */
export async function registerJobProcessors(queues: Map<string, any>): Promise<void> {
  for (const [taskQueueName, queue] of queues.entries()) {
    console.log(`[Worker] Registering processor for task queue: ${taskQueueName}`);

    // Process jobs with concurrency of 2
    queue.process(2, async (job: Job) => {
      return await processJob(job);
    });

    // Event listeners
    queue.on('completed', (job: Job) => {
      console.log(`[Worker] Job ${job.id} completed`);
    });

    queue.on('failed', (job: Job, error: Error) => {
      console.error(`[Worker] Job ${job.id} failed:`, error.message);
    });

    queue.on('error', (error: Error) => {
      console.error(`[Worker] Queue ${taskQueueName} error:`, error);
    });
  }
}

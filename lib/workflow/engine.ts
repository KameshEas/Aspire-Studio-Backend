/**
 * Workflow Engine - Abstraction layer for async job orchestration
 * Currently uses Bull + Redis; can be replaced with Temporal in production
 */

import Queue, { Job } from 'bull';
import { v4 as uuidv4 } from 'nanoid';
import { prisma } from '../prisma';

export type WorkflowType = 
  | 'brand-generate'
  | 'content-generate'
  | 'ui-generate'
  | 'code-generate'
  | 'project-build';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowInput {
  idempotencyKey: string;
  tenantId: string;
  projectId: string;
  payload: Record<string, any>;
  options?: Record<string, any>;
}

export interface WorkflowOutput {
  artifacts: Array<{
    id: string;
    type: 'text' | 'image' | 'pdf' | 'html' | 'code';
    url?: string;
    mimeType?: string;
    metadata?: Record<string, any>;
  }>;
  errors?: Array<{
    activity: string;
    message: string;
    timestamp: string;
  }>;
  metrics?: {
    totalDurationMs: number;
    startedAt: string;
    completedAt: string;
  };
}

export interface TemporalJobRecord {
  id: string;
  workflowId: string;
  workflowType: WorkflowType;
  tenantId: string;
  projectId: string;
  status: JobStatus;
  input: WorkflowInput;
  output?: WorkflowOutput;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Queue instances per task queue
const queues: Map<string, Queue.Queue> = new Map();
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

function getQueue(taskQueue: string): Queue.Queue {
  if (!queues.has(taskQueue)) {
    queues.set(
      taskQueue,
      new Queue(taskQueue, {
        redis: {
          host: REDIS_HOST,
          port: REDIS_PORT,
        },
      })
    );
  }
  return queues.get(taskQueue)!;
}

/**
 * Submit a workflow for execution
 */
export async function submitWorkflow(
  workflowType: WorkflowType,
  input: WorkflowInput
): Promise<{ jobId: string; executionId: string }> {
  const jobId = uuidv4();
  const workflowId = input.idempotencyKey; // Use idempotency key as dedup

  // Create record in database
  const jobRecord = await prisma.temporalJob.create({
    data: {
      id: jobId,
      workflowId,
      workflowType,
      tenantId: input.tenantId,
      projectId: input.projectId,
      status: 'pending',
      input,
      retryCount: 0,
      maxRetries: 3,
    },
  });

  // Submit to appropriate task queue based on workflow type
  const taskQueue = getTaskQueueForWorkflow(workflowType);
  const queue = getQueue(taskQueue);

  // Add job to queue with idempotency
  const queuedJob = await queue.add(
    {
      jobId,
      workflowId,
      workflowType,
      input,
    },
    {
      jobId: workflowId, // Use workflowId as queue job ID for dedup
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    }
  );

  return {
    jobId,
    executionId: queuedJob.id.toString(),
  };
}

/**
 * Get workflow job status
 */
export async function getWorkflowStatus(jobId: string): Promise<TemporalJobRecord | null> {
  return await prisma.temporalJob.findUnique({
    where: { id: jobId },
  });
}

/**
 * List workflow jobs for a project
 */
export async function listWorkflowJobs(
  projectId: string,
  limit = 50,
  offset = 0
): Promise<{ jobs: TemporalJobRecord[]; total: number }> {
  const [jobs, total] = await Promise.all([
    prisma.temporalJob.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.temporalJob.count({
      where: { projectId },
    }),
  ]);

  return { jobs, total };
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflow(jobId: string): Promise<boolean> {
  const job = await prisma.temporalJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return false;

  const taskQueue = getTaskQueueForWorkflow(job.workflowType);
  const queue = getQueue(taskQueue);

  // Remove from queue if pending
  const queuedJob = await queue.getJob(job.workflowId);
  if (queuedJob) {
    await queuedJob.remove();
  }

  // Update status
  await prisma.temporalJob.update({
    where: { id: jobId },
    data: { status: 'cancelled' },
  });

  return true;
}

/**
 * Update workflow job with results
 */
export async function updateWorkflowResults(
  jobId: string,
  output: WorkflowOutput
): Promise<TemporalJobRecord> {
  return await prisma.temporalJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      output,
      completedAt: new Date(),
    },
  });
}

/**
 * Mark workflow job as failed
 */
export async function markWorkflowFailed(
  jobId: string,
  error: string,
  moveToDeadLetter = true
): Promise<TemporalJobRecord> {
  const job = await prisma.temporalJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      error,
    },
  });

  if (moveToDeadLetter) {
    await prisma.deadLetterQueue.create({
      data: {
        jobId,
        reason: 'Workflow failed after retries',
        lastError: error,
        retryCount: job.retryCount,
        manualReview: true,
      },
    });
  }

  return job;
}

/**
 * Get queue name for workflow type
 */
function getTaskQueueForWorkflow(workflowType: WorkflowType): string {
  switch (workflowType) {
    case 'brand-generate':
    case 'content-generate':
    case 'ui-generate':
    case 'code-generate':
      return 'light-worker'; // Text-based generation
    case 'project-build':
      return 'orchestrator';
    default:
      return 'light-worker';
  }
}

/**
 * Close all queue connections
 */
export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
}

/**
 * Get all queues (for worker registration)
 */
export function getAllQueues(): Map<string, Queue.Queue> {
  return queues;
}

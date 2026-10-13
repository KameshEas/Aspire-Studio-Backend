/**
 * DLQ Entry Detail Endpoint (platform admins only)
 * GET /api/v1/admin/dlq/[dlqId] - Get DLQ entry
 * PATCH /api/v1/admin/dlq/[dlqId] - Update DLQ entry (mark reviewed, resubmit)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePlatformAdmin, handler, ApiError } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { submitWorkflow, WorkflowType } from '@/lib/workflow/engine';

export const GET = handler(async (req: NextRequest, ctx) => {
  const { dlqId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requirePlatformAdmin(userId);

  const entry = await prisma.deadLetterQueue.findUnique({ where: { id: dlqId } });
  if (!entry) throw new ApiError(404, 'DLQ entry not found');

  const job = await prisma.temporalJob.findUnique({ where: { id: entry.jobId } });

  return NextResponse.json({
    id: entry.id,
    jobId: entry.jobId,
    reason: entry.reason,
    lastError: entry.lastError,
    retryCount: entry.retryCount,
    manualReview: entry.manualReview,
    reviewedAt: entry.reviewedAt,
    resolutionNotes: entry.resolutionNotes,
    createdAt: entry.createdAt,
    job: job
      ? {
          workflowId: job.workflowId,
          workflowType: job.workflowType,
          status: job.status,
          createdAt: job.createdAt,
        }
      : null,
  });
});

export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { dlqId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requirePlatformAdmin(userId);

  const body = (await req.json()) as { action?: string; notes?: string };

  const dlqEntry = await prisma.deadLetterQueue.findUnique({ where: { id: dlqId } });
  if (!dlqEntry) throw new ApiError(404, 'DLQ entry not found');

  if (body.action === 'mark-reviewed') {
    const updated = await prisma.deadLetterQueue.update({
      where: { id: dlqId },
      data: {
        manualReview: false,
        reviewedAt: new Date(),
        resolutionNotes: body.notes || '',
      },
    });
    return NextResponse.json({
      id: updated.id,
      reviewedAt: updated.reviewedAt,
      resolutionNotes: updated.resolutionNotes,
    });
  }

  if (body.action === 'resubmit') {
    const job = await prisma.temporalJob.findUnique({ where: { id: dlqEntry.jobId } });
    if (!job) throw new ApiError(404, 'Job not found');

    let newJobId: string;
    try {
      ({ jobId: newJobId } = await submitWorkflow(job.workflowType as WorkflowType, {
        idempotencyKey: `${job.workflowId}-retry-${Date.now()}`,
        tenantId: job.tenantId,
        projectId: job.projectId,
        payload: (job.input as Record<string, any>) || {},
        options: {},
      }));
    } catch (error) {
      console.error('[API] DLQ resubmit failed:', error);
      throw new ApiError(400, 'Failed to resubmit job');
    }

    await prisma.deadLetterQueue.update({
      where: { id: dlqId },
      data: { resolvedAt: new Date(), resolutionNotes: `Resubmitted as job ${newJobId}` },
    });

    return NextResponse.json({ id: dlqId, newJobId, resubmittedAt: new Date().toISOString() });
  }

  throw new ApiError(400, 'Invalid action');
});

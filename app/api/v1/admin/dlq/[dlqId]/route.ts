/**
 * DLQ Entry Detail Endpoint
 * GET /api/v1/admin/dlq/[dlqId] - Get DLQ entry
 * PATCH /api/v1/admin/dlq/[dlqId] - Update DLQ entry (mark reviewed, resolve, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { submitWorkflow } from '../../../../../../lib/workflow/engine';

export async function GET(
  request: NextRequest,
  { params }: { params: { dlqId: string } }
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dlqId } = params;

    const entry = await prisma.deadLetterQueue.findUnique({
      where: { id: dlqId },
    });

    if (!entry) {
      return NextResponse.json({ error: 'DLQ entry not found' }, { status: 404 });
    }

    // Get associated job for more context
    const job = await prisma.temporalJob.findUnique({
      where: { id: entry.jobId },
    });

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
  } catch (error) {
    console.error('[API] DLQ detail error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { dlqId: string } }
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dlqId } = params;
    const body: any = await request.json();
    const action = body.action;

    const dlqEntry = await prisma.deadLetterQueue.findUnique({
      where: { id: dlqId },
    });

    if (!dlqEntry) {
      return NextResponse.json({ error: 'DLQ entry not found' }, { status: 404 });
    }

    if (action === 'mark-reviewed') {
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

    if (action === 'resubmit') {
      // Get the original job to resubmit
      const job = await prisma.temporalJob.findUnique({
        where: { id: dlqEntry.jobId },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Resubmit workflow
      try {
        const { jobId: newJobId } = await submitWorkflow(job.workflowType as any, {
          idempotencyKey: `${job.workflowId}-retry-${Date.now()}`,
          tenantId: job.tenantId,
          projectId: job.projectId,
          payload: job.input as any,
          options: {},
        });

        // Update DLQ entry
        await prisma.deadLetterQueue.update({
          where: { id: dlqId },
          data: {
            resolvedAt: new Date(),
            resolutionNotes: `Resubmitted as job ${newJobId}`,
          },
        });

        return NextResponse.json({
          id: dlqId,
          newJobId,
          resubmittedAt: new Date().toISOString(),
        });
      } catch (error) {
        return NextResponse.json(
          { error: 'Failed to resubmit job' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] DLQ update error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

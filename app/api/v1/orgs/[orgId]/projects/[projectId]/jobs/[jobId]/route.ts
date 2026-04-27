/**
 * Job Detail Endpoint
 * GET /api/v1/orgs/[orgId]/projects/[projectId]/jobs/[jobId] - Get job status
 * PATCH /api/v1/orgs/[orgId]/projects/[projectId]/jobs/[jobId] - Cancel job
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../../../lib/auth';
import { getWorkflowStatus, cancelWorkflow } from '../../../../../../lib/workflow/engine';
import { prisma } from '../../../../../../lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string; jobId: string } }
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;

    // Get job status
    const job = await getWorkflowStatus(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Parse output if it's JSON
    let output: any = null;
    if (job.output && typeof job.output === 'object') {
      output = job.output;
    }

    return NextResponse.json({
      id: job.id,
      workflowId: job.workflowId,
      workflowType: job.workflowType,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error,
      output,
    });
  } catch (error) {
    console.error('[API] Job detail error:', error);
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
  { params }: { params: { orgId: string; projectId: string; jobId: string } }
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;
    const body: any = await request.json();
    const action = body.action;

    if (action === 'cancel') {
      const cancelled = await cancelWorkflow(jobId);

      if (!cancelled) {
        return NextResponse.json({ error: 'Job not found or already completed' }, { status: 404 });
      }

      return NextResponse.json({
        id: jobId,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] Job cancel error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

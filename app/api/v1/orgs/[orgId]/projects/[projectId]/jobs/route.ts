/**
 * Job Submission & Listing Endpoint
 * POST /api/v1/orgs/[orgId]/projects/[projectId]/jobs - Submit job
 * GET /api/v1/orgs/[orgId]/projects/[projectId]/jobs - List jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/auth';
import { submitWorkflow, listWorkflowJobs, WorkflowType } from '../../../../../lib/workflow/engine';
import { prisma } from '../../../../../lib/prisma';
import { z } from 'zod';

// Validation schema for job submission
const jobSubmissionSchema = z.object({
  jobType: z.enum([
    'brand-generate',
    'content-generate',
    'ui-generate',
    'code-generate',
    'project-build',
  ] as const),
  templateId: z.string().optional(),
  payload: z.record(z.any()),
  idempotencyKey: z.string(),
  options: z.record(z.any()).optional(),
});

type JobSubmissionRequest = z.infer<typeof jobSubmissionSchema>;

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string } }
): Promise<NextResponse> {
  try {
    // Authenticate and authorize
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId, projectId } = params;

    // Verify project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        orgId,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse and validate request
    const body: unknown = await request.json();
    const validation = jobSubmissionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const jobData: JobSubmissionRequest = validation.data;

    // Submit workflow
    const { jobId, executionId } = await submitWorkflow(
      jobData.jobType as WorkflowType,
      {
        idempotencyKey: jobData.idempotencyKey,
        tenantId: orgId,
        projectId,
        payload: jobData.payload,
        options: jobData.options,
      }
    );

    return NextResponse.json(
      {
        jobId,
        executionId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[API] Job submission error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string } }
): Promise<NextResponse> {
  try {
    // Authenticate
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = params;

    // Get pagination params
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status');

    // List jobs
    let jobs = await prisma.temporalJob.findMany({
      where: {
        projectId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.temporalJob.count({
      where: {
        projectId,
        ...(status && { status }),
      },
    });

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        workflowType: job.workflowType,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
      })),
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    console.error('[API] Job listing error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Job Submission & Listing Endpoint
 * POST /api/v1/orgs/[orgId]/projects/[projectId]/jobs - Submit job
 * GET /api/v1/orgs/[orgId]/projects/[projectId]/jobs - List jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireOrgRole, requireProject, handler, ApiError } from '@/lib/auth';
import { submitWorkflow, WorkflowType } from '@/lib/workflow/engine';
import { prisma } from '@/lib/prisma';
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

export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);
  await requireProject(orgId, projectId);

  const validation = jobSubmissionSchema.safeParse(await req.json());
  if (!validation.success) {
    throw new ApiError(400, 'Invalid request', validation.error.errors);
  }
  const jobData = validation.data;

  const { jobId, executionId } = await submitWorkflow(jobData.jobType as WorkflowType, {
    idempotencyKey: jobData.idempotencyKey,
    tenantId: orgId,
    projectId,
    payload: jobData.payload,
    options: jobData.options,
  });

  return NextResponse.json(
    { jobId, executionId, status: 'pending', createdAt: new Date().toISOString() },
    { status: 202 }
  );
});

export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);
  await requireProject(orgId, projectId);

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  const where = { projectId, ...(status && { status }) };
  const [jobs, total] = await Promise.all([
    prisma.temporalJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.temporalJob.count({ where }),
  ]);

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      workflowType: job.workflowType,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error,
    })),
    pagination: { limit, offset, total },
  });
});

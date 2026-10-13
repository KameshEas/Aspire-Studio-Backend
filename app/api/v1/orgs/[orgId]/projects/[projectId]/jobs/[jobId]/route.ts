/**
 * Job Detail Endpoint
 * GET /api/v1/orgs/[orgId]/projects/[projectId]/jobs/[jobId] - Get job status
 * PATCH /api/v1/orgs/[orgId]/projects/[projectId]/jobs/[jobId] - Cancel job
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireOrgRole, requireProject, handler, ApiError } from '@/lib/auth';
import { getWorkflowStatus, cancelWorkflow } from '@/lib/workflow/engine';

/** Load a job and make sure it belongs to the project in the URL. */
async function loadProjectJob(projectId: string, jobId: string) {
  const job = await getWorkflowStatus(jobId);
  if (!job || job.projectId !== projectId) throw new ApiError(404, 'Job not found');
  return job;
}

export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, jobId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);
  await requireProject(orgId, projectId);

  const job = await loadProjectJob(projectId, jobId);

  return NextResponse.json({
    id: job.id,
    workflowId: job.workflowId,
    workflowType: job.workflowType,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    output: job.output && typeof job.output === 'object' ? job.output : null,
  });
});

export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, jobId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);
  await requireProject(orgId, projectId);
  await loadProjectJob(projectId, jobId);

  const body = (await req.json()) as { action?: string };
  if (body.action !== 'cancel') throw new ApiError(400, 'Invalid action');

  const cancelled = await cancelWorkflow(jobId);
  if (!cancelled) throw new ApiError(404, 'Job not found or already completed');

  return NextResponse.json({ id: jobId, status: 'cancelled', cancelledAt: new Date().toISOString() });
});

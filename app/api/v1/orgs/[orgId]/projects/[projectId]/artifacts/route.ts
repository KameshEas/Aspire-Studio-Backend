import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, handler, ApiError } from '@/lib/auth';
import { z } from 'zod';

// ─── Validation Schema ───────────────────────────────────
const ListArtifactsSchema = z.object({
  type: z.enum(['text', 'image', 'html', 'zip', 'embedding']).optional(),
  status: z.enum(['draft', 'approved', 'archived']).optional(),
  jobType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── GET: List Artifacts with Filters ────────────────────
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);

  const { searchParams } = new URL(req.url);
  const params = {
    type: searchParams.get('type') || undefined,
    status: searchParams.get('status') || 'approved', // Default to approved
    jobType: searchParams.get('jobType') || undefined,
    limit: parseInt(searchParams.get('limit') || '50'),
    offset: parseInt(searchParams.get('offset') || '0'),
  };

  const validatedParams = ListArtifactsSchema.parse(params);

  const artifacts = await prisma.artifact.findMany({
    where: {
      projectId,
      orgId,
      ...(validatedParams.type && { type: validatedParams.type }),
      ...(validatedParams.status && { status: validatedParams.status }),
      generation: validatedParams.jobType ? { jobType: validatedParams.jobType } : undefined,
    },
    include: {
      generation: {
        select: {
          id: true,
          jobType: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: validatedParams.limit,
    skip: validatedParams.offset,
  });

  const total = await prisma.artifact.count({
    where: {
      projectId,
      orgId,
      ...(validatedParams.type && { type: validatedParams.type }),
      ...(validatedParams.status && { status: validatedParams.status }),
    },
  });

  return NextResponse.json({
    artifacts: artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes?.toString(),
      status: a.status,
      rating: a.rating,
      tags: a.tags,
      generation: a.generation,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      downloadUrl: `/api/v1/orgs/${orgId}/projects/${projectId}/artifacts/${a.id}/download`,
    })),
    total,
    limit: validatedParams.limit,
    offset: validatedParams.offset,
  });
});

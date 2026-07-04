import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, handler, ApiError } from '@/lib/auth';
import { z } from 'zod';

// ─── Validation Schema ───────────────────────────────────
const UpdateArtifactSchema = z.object({
  status: z.enum(['draft', 'approved', 'archived']).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
});

// ─── GET: Artifact Detail ────────────────────────────────
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, artifactId } = await ctx.params;
  const { userId } = await requireAuth(req);

  const artifact = await prisma.artifact.findFirst({
    where: { id: artifactId, projectId, orgId },
    include: {
      generation: {
        select: {
          id: true,
          jobType: true,
          status: true,
          input: true,
          createdAt: true,
        },
      },
      parent: {
        select: { id: true, fileName: true },
      },
      derivatives: {
        select: { id: true, fileName: true },
      },
    },
  });

  if (!artifact) throw new ApiError(404, 'Artifact not found');

  return NextResponse.json({
    id: artifact.id,
    type: artifact.type,
    fileName: artifact.fileName,
    sizeBytes: artifact.sizeBytes?.toString(),
    status: artifact.status,
    rating: artifact.rating,
    tags: artifact.tags,
    metadata: artifact.metadata,
    generation: artifact.generation,
    parent: artifact.parent,
    derivatives: artifact.derivatives,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    downloadUrl: `/api/v1/orgs/${orgId}/projects/${projectId}/artifacts/${artifactId}/download`,
  });
});

// ─── PATCH: Update Artifact Metadata ─────────────────────
export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, artifactId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);

  const artifact = await prisma.artifact.findFirst({
    where: { id: artifactId, projectId, orgId },
  });

  if (!artifact) throw new ApiError(404, 'Artifact not found');

  const body = await req.json();
  const validatedData = UpdateArtifactSchema.parse(body);

  const updated = await prisma.artifact.update({
    where: { id: artifactId },
    data: {
      ...(validatedData.status && { status: validatedData.status }),
      ...(validatedData.rating !== undefined && { rating: validatedData.rating }),
      ...(validatedData.tags && { tags: validatedData.tags }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    rating: updated.rating,
    tags: updated.tags,
    updatedAt: updated.updatedAt,
    message: 'Artifact updated successfully',
  });
});

// ─── DELETE: Archive Artifact ────────────────────────────
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, artifactId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin']);

  const artifact = await prisma.artifact.findFirst({
    where: { id: artifactId, projectId, orgId },
  });

  if (!artifact) throw new ApiError(404, 'Artifact not found');

  // Soft delete by marking archived
  await prisma.artifact.update({
    where: { id: artifactId },
    data: { status: 'archived' },
  });

  return new NextResponse('', { status: 204 });
});

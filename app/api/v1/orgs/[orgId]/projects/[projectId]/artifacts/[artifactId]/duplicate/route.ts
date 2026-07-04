import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, handler, ApiError } from '@/lib/auth';

// ─── POST: Duplicate Artifact ────────────────────────────
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, artifactId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);

  const original = await prisma.artifact.findFirst({
    where: { id: artifactId, projectId, orgId },
  });

  if (!original) throw new ApiError(404, 'Artifact not found');

  // Create duplicate artifact pointing to same storage
  const duplicate = await prisma.artifact.create({
    data: {
      generationId: original.generationId,
      projectId: original.projectId,
      orgId: original.orgId,
      type: original.type,
      storageUrl: original.storageUrl,
      fileName: original.fileName ? `${original.fileName.replace(/\.[^/.]+$/, '')}_copy.${original.fileName.split('.').pop()}` : null,
      sizeBytes: original.sizeBytes,
      metadata: original.metadata,
      parentArtifactId: original.id, // Link to original
      status: 'draft',
      tags: original.tags.length > 0 ? [...original.tags, 'duplicated'] : ['duplicated'],
    },
  });

  return NextResponse.json(
    {
      id: duplicate.id,
      type: duplicate.type,
      fileName: duplicate.fileName,
      status: duplicate.status,
      parentArtifactId: duplicate.parentArtifactId,
      tags: duplicate.tags,
      createdAt: duplicate.createdAt,
      message: 'Artifact duplicated successfully',
    },
    { status: 201 }
  );
});

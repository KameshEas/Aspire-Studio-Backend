import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/artifacts/[artifactId] */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, artifactId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const artifact = await prisma.artifact.findFirst({
    where: { id: artifactId, projectId, orgId },
  });
  if (!artifact) throw new ApiError(404, "Artifact not found");

  const storage = getStorage();
  const downloadUrl = await storage.getSignedUrl(artifact.storageUrl);

  return NextResponse.json({
    id: artifact.id,
    type: artifact.type,
    fileName: artifact.fileName,
    sizeBytes: artifact.sizeBytes?.toString() ?? null,
    metadata: artifact.metadata,
    downloadUrl,
    generationId: artifact.generationId,
    version: artifact.version,
    createdAt: artifact.createdAt,
  });
});

/** DELETE /api/v1/orgs/[orgId]/projects/[projectId]/artifacts/[artifactId] */
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, artifactId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const artifact = await prisma.artifact.findFirst({
    where: { id: artifactId, projectId, orgId },
  });
  if (!artifact) throw new ApiError(404, "Artifact not found");

  const storage = getStorage();
  await storage.delete(artifact.storageUrl);
  await prisma.artifact.delete({ where: { id: artifactId } });

  return NextResponse.json({ deleted: true });
});

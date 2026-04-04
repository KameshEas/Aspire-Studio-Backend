import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/generations/[generationId] */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, generationId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const generation = await prisma.generation.findFirst({
    where: { id: generationId, projectId, orgId },
    include: {
      artifacts: true,
      templateVersion: {
        select: {
          id: true,
          version: true,
          prompt: true,
          variablesSchema: true,
          template: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!generation) throw new ApiError(404, "Generation not found");

  const storage = getStorage();
  const artifacts = await Promise.all(
    generation.artifacts.map(async (a) => ({
      id: a.id,
      type: a.type,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes?.toString() ?? null,
      metadata: a.metadata,
      downloadUrl: await storage.getSignedUrl(a.storageUrl),
      version: a.version,
      createdAt: a.createdAt,
    }))
  );

  return NextResponse.json({
    id: generation.id,
    jobType: generation.jobType,
    status: generation.status,
    input: generation.input,
    options: generation.options,
    error: generation.error,
    templateVersion: generation.templateVersion
      ? {
          id: generation.templateVersion.id,
          version: generation.templateVersion.version,
          prompt: generation.templateVersion.prompt,
          template: generation.templateVersion.template,
        }
      : null,
    artifacts,
    startedAt: generation.startedAt,
    finishedAt: generation.finishedAt,
    createdAt: generation.createdAt,
  });
});

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/artifacts — list artifacts */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const artifacts = await prisma.artifact.findMany({
    where: {
      projectId,
      orgId,
      ...(type && { type }),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = artifacts.length > limit;
  const items = hasMore ? artifacts.slice(0, limit) : artifacts;

  const storage = getStorage();
  const results = await Promise.all(
    items.map(async (a) => ({
      id: a.id,
      type: a.type,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes?.toString() ?? null,
      metadata: a.metadata,
      downloadUrl: await storage.getSignedUrl(a.storageUrl),
      generationId: a.generationId,
      version: a.version,
      createdAt: a.createdAt,
    }))
  );

  return NextResponse.json({
    items: results,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

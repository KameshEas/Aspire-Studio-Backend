import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/generations — list generations (paginated) */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const jobType = url.searchParams.get("jobType") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const generations = await prisma.generation.findMany({
    where: {
      projectId,
      orgId,
      ...(status && { status }),
      ...(jobType && { jobType }),
    },
    include: {
      _count: { select: { artifacts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = generations.length > limit;
  const items = hasMore ? generations.slice(0, limit) : generations;

  return NextResponse.json({
    items: items.map((g) => ({
      id: g.id,
      jobType: g.jobType,
      status: g.status,
      artifactCount: g._count.artifacts,
      error: g.error,
      startedAt: g.startedAt,
      finishedAt: g.finishedAt,
      createdAt: g.createdAt,
    })),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

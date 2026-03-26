import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId]/projects/[projectId] — project detail */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId },
    include: {
      _count: {
        select: { generations: true, assets: true, deployments: true, members: true },
      },
      members: {
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!project) throw new ApiError(404, "Project not found");

  return NextResponse.json({
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description,
    settings: project.settings,
    generationCount: project._count.generations,
    assetCount: project._count.assets,
    deploymentCount: project._count.deployments,
    members: project.members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
});

/** PATCH /api/v1/orgs/[orgId]/projects/[projectId] — update project */
export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const body = await req.json();
  const { name, description, settings } = body as {
    name?: string;
    description?: string;
    settings?: Record<string, unknown>;
  };

  const project = await prisma.project.updateMany({
    where: { id: projectId, orgId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(settings !== undefined && { settings: settings as unknown as import("@prisma/client").Prisma.InputJsonValue }),
    },
  });

  if (project.count === 0) throw new ApiError(404, "Project not found");

  const updated = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    name: updated.name,
    description: updated.description,
  });
});

/** DELETE /api/v1/orgs/[orgId]/projects/[projectId] — delete project */
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const result = await prisma.project.deleteMany({
    where: { id: projectId, orgId },
  });

  if (result.count === 0) throw new ApiError(404, "Project not found");

  return NextResponse.json({ deleted: true });
});

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/templates — list templates */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  // Verify project belongs to org
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  const templates = await prisma.template.findMany({
    where: { projectId },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      _count: { select: { versions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      versionCount: t._count.versions,
      createdBy: t.creator
        ? { id: t.creator.id, name: t.creator.name, email: t.creator.email }
        : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  );
});

/** POST /api/v1/orgs/[orgId]/projects/[projectId]/templates — create template */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await req.json() as {
    name: string;
    description?: string;
    prompt: string;
    variablesSchema?: Record<string, unknown>;
  };

  if (!body.name?.trim()) throw new ApiError(400, "Template name is required");
  if (!body.prompt?.trim()) throw new ApiError(400, "Prompt text is required");

  const template = await prisma.template.create({
    data: {
      projectId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      createdBy: userId,
      versions: {
        create: {
          version: 1,
          prompt: body.prompt.trim(),
          variablesSchema: body.variablesSchema ?? undefined,
        },
      },
    },
    include: {
      _count: { select: { versions: true } },
    },
  });

  return NextResponse.json(
    {
      id: template.id,
      name: template.name,
      description: template.description,
      versionCount: template._count.versions,
      createdAt: template.createdAt,
    },
    { status: 201 }
  );
});

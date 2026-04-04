import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/templates/[templateId] — template detail with versions */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId, project: { orgId } },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      versions: { orderBy: { version: "desc" } },
    },
  });

  if (!template) throw new ApiError(404, "Template not found");

  return NextResponse.json({
    id: template.id,
    name: template.name,
    description: template.description,
    createdBy: template.creator
      ? { id: template.creator.id, name: template.creator.name, email: template.creator.email }
      : null,
    versions: template.versions.map((v) => ({
      id: v.id,
      version: v.version,
      prompt: v.prompt,
      variablesSchema: v.variablesSchema,
      metadata: v.metadata,
      createdAt: v.createdAt,
    })),
    latestVersion: template.versions[0] ?? null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
});

/** PATCH /api/v1/orgs/[orgId]/projects/[projectId]/templates/[templateId] — update name/description */
export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const body = await req.json() as { name?: string; description?: string };

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId, project: { orgId } },
  });
  if (!template) throw new ApiError(404, "Template not found");

  const updated = await prisma.template.update({
    where: { id: templateId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() || null }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    updatedAt: updated.updatedAt,
  });
});

/** DELETE /api/v1/orgs/[orgId]/projects/[projectId]/templates/[templateId] */
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId, project: { orgId } },
  });
  if (!template) throw new ApiError(404, "Template not found");

  await prisma.template.delete({ where: { id: templateId } });

  return NextResponse.json({ deleted: true });
});

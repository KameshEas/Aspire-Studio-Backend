import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/**
 * POST /api/v1/orgs/[orgId]/projects/[projectId]/templates/[templateId]/versions
 * Create a new version of a template (immutable prompt history).
 */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId, project: { orgId } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!template) throw new ApiError(404, "Template not found");

  const body = await req.json() as {
    prompt: string;
    variablesSchema?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };

  if (!body.prompt?.trim()) throw new ApiError(400, "Prompt text is required");

  const nextVersion = (template.versions[0]?.version ?? 0) + 1;

  const version = await prisma.templateVersion.create({
    data: {
      templateId,
      version: nextVersion,
      prompt: body.prompt.trim(),
      variablesSchema: (body.variablesSchema as Prisma.InputJsonValue) ?? undefined,
      metadata: (body.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  });

  // Touch the template updatedAt
  await prisma.template.update({
    where: { id: templateId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(
    {
      id: version.id,
      version: version.version,
      prompt: version.prompt,
      variablesSchema: version.variablesSchema,
      createdAt: version.createdAt,
    },
    { status: 201 }
  );
});

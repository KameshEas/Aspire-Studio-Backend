import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { validateString, validateOptionalString } from "@/lib/validation";

/** GET /api/v1/orgs/[orgId]/projects — list projects */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const projects = await prisma.project.findMany({
    where: { orgId },
    include: {
      _count: { select: { generations: true, assets: true, members: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    projects.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      generationCount: p._count.generations,
      assetCount: p._count.assets,
      memberCount: p._count.members,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))
  );
});

/** POST /api/v1/orgs/[orgId]/projects — create a project */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const body = await req.json();
  const name = validateString(body.name, "name");
  const slug = validateString(body.slug, "slug");
  const description = validateOptionalString(body.description, "description");

  const existing = await prisma.project.findUnique({
    where: { orgId_slug: { orgId, slug } },
  });
  if (existing) throw new ApiError(409, "Project slug already exists in this org");

  const project = await prisma.project.create({
    data: {
      orgId,
      name,
      slug,
      description,
      createdBy: userId,
      members: { create: { userId, role: "owner" } },
    },
  });

  return NextResponse.json(
    { id: project.id, slug: project.slug, name: project.name },
    { status: 201 }
  );
});

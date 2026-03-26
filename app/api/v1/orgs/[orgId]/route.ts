import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId] — org detail */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: {
      _count: { select: { projects: true, members: true } },
      subscriptions: {
        where: { status: "active" },
        include: { plan: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    id: org.id,
    slug: org.slug,
    name: org.name,
    billingInfo: org.billingInfo,
    projectCount: org._count.projects,
    memberCount: org._count.members,
    plan: org.subscriptions[0]?.plan ?? null,
    createdAt: org.createdAt,
  });
});

/** PATCH /api/v1/orgs/[orgId] — update org */
export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const body = await req.json();
  const { name } = body as { name?: string };

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { ...(name && { name }) },
  });

  return NextResponse.json({ id: org.id, slug: org.slug, name: org.name });
});

/** DELETE /api/v1/orgs/[orgId] — delete org (owner only) */
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "owner");

  await prisma.organization.delete({ where: { id: orgId } });

  return NextResponse.json({ deleted: true });
});

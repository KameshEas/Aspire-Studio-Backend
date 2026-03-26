import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/members */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(
    members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    }))
  );
});

/** POST /api/v1/orgs/[orgId]/projects/[projectId]/members — add member */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const body = await req.json();
  const { userId: targetUserId, role = "developer" } = body as {
    userId: string;
    role?: string;
  };

  if (!targetUserId) throw new ApiError(400, "userId is required");

  // Ensure target is an org member
  const orgMember = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: targetUserId } },
  });
  if (!orgMember) throw new ApiError(400, "User must be an org member first");

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (existing) throw new ApiError(409, "User is already a project member");

  await prisma.projectMember.create({
    data: { projectId, userId: targetUserId, role },
  });

  return NextResponse.json({ added: true }, { status: 201 });
});

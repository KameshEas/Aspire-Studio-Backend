import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId]/members — list members */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const members = await prisma.organizationMember.findMany({
    where: { orgId },
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.createdAt,
    }))
  );
});

/** POST /api/v1/orgs/[orgId]/members — invite member */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const body = await req.json();
  const { email, role = "developer" } = body as { email: string; role?: string };

  if (!email) throw new ApiError(400, "email is required");
  if (!["viewer", "developer", "admin"].includes(role)) {
    throw new ApiError(400, "Invalid role");
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) throw new ApiError(404, "User not found. They must sign up first.");

  const existing = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: targetUser.id } },
  });
  if (existing) throw new ApiError(409, "User is already a member");

  await prisma.organizationMember.create({
    data: { orgId, userId: targetUser.id, role },
  });

  return NextResponse.json({ added: true, userId: targetUser.id, role }, { status: 201 });
});

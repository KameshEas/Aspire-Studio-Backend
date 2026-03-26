import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, handler } from "@/lib/auth";

/** GET /api/v1/me — current user profile + orgs */
export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireAuth(req);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      orgMembers: {
        include: { org: { select: { id: true, slug: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    organizations: user.orgMembers.map((m) => ({
      id: m.org.id,
      slug: m.org.slug,
      name: m.org.name,
      role: m.role,
    })),
  });
});

/** PATCH /api/v1/me — update profile */
export const PATCH = handler(async (req: NextRequest) => {
  const { userId } = await requireAuth(req);
  const body = await req.json();
  const { name, avatarUrl } = body as { name?: string; avatarUrl?: string };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined && { name }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
});

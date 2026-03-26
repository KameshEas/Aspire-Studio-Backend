import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs — list orgs the user belongs to */
export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireAuth(req);

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      org: {
        include: {
          _count: { select: { projects: true, members: true } },
        },
      },
    },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.org.id,
      slug: m.org.slug,
      name: m.org.name,
      role: m.role,
      projectCount: m.org._count.projects,
      memberCount: m.org._count.members,
    }))
  );
});

/** POST /api/v1/orgs — create a new organization */
export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireAuth(req);
  const body = await req.json();
  const { name, slug } = body as { name: string; slug: string };

  if (!name || !slug) throw new ApiError(400, "name and slug are required");
  if (!/^[a-z0-9-]+$/.test(slug)) throw new ApiError(400, "slug must be lowercase alphanumeric with hyphens");

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) throw new ApiError(409, "Organization slug already taken");

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      members: { create: { userId, role: "owner" } },
    },
  });

  return NextResponse.json(
    { id: org.id, slug: org.slug, name: org.name }, 
    { status: 201 }
  );
});

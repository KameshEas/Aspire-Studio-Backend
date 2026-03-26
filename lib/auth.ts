import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import prisma from "./prisma";

export interface AuthContext {
  userId: string; // local DB user id
  clerkId: string;
  orgId: string | null; // active org from header
}

/**
 * Resolve Clerk session → local User. Creates user lazily on first call.
 * Reads X-Org-Id header for multi-tenant scoping.
 */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    throw new ApiError(401, "Not authenticated");
  }

  let user = await prisma.user.findUnique({ where: { clerkId } });

  if (!user) {
    // Lazy-create: Clerk webhook may not have fired yet
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    const clerkUser = await clerkRes.json();

    user = await prisma.user.upsert({
      where: { clerkId },
      update: {},
      create: {
        clerkId,
        email: clerkUser.email_addresses?.[0]?.email_address ?? `${clerkId}@unknown`,
        name: [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || null,
        avatarUrl: clerkUser.image_url ?? null,
      },
    });
  }

  const orgId = req.headers.get("x-org-id") ?? null;

  return { userId: user.id, clerkId, orgId };
}

/**
 * Verify user is member of the given org with at least `minRole`.
 */
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  developer: 1,
  admin: 2,
  owner: 3,
};

export async function requireOrgRole(
  userId: string,
  orgId: string,
  minRole: string = "viewer"
): Promise<void> {
  const member = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });

  if (!member || (ROLE_RANK[member.role] ?? -1) < (ROLE_RANK[minRole] ?? 0)) {
    throw new ApiError(403, "Insufficient permissions");
  }
}

/**
 * Lightweight API error class for consistent JSON error responses.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Wrap a route handler with error handling.
 */
export function handler(
  fn: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("[API]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

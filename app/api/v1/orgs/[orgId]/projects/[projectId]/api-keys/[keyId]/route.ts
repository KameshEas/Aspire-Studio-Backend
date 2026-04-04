import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** DELETE /api/v1/orgs/[orgId]/projects/[projectId]/api-keys/[keyId] — revoke key */
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, keyId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key || key.projectId !== projectId) throw new ApiError(404, "API key not found");

  await prisma.apiKey.update({ where: { id: keyId }, data: { revoked: true } });

  return NextResponse.json({ revoked: true });
});

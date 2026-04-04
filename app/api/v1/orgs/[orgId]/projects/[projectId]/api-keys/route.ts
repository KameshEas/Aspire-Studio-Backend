import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/api-keys */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  // ensure project belongs to org
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== orgId) throw new ApiError(404, "Project not found");

  const keys = await prisma.apiKey.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });

  return NextResponse.json(
    keys.map((k) => ({ id: k.id, description: k.description, scopes: k.scopes, createdAt: k.createdAt, revoked: k.revoked }))
  );
});

/** POST /api/v1/orgs/[orgId]/projects/[projectId]/api-keys — create */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "admin");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== orgId) throw new ApiError(404, "Project not found");

  const body = await req.json();
  const { description, scopes } = body as { description?: string; scopes?: string[] };

  if (scopes && !Array.isArray(scopes)) throw new ApiError(400, "scopes must be an array of strings");

  // generate a secret key (only returned once)
  const raw = `${projectId}_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(raw).digest("hex");

  const created = await prisma.apiKey.create({
    data: { projectId, keyHash, description: description ?? null, scopes: scopes ?? [] },
  });

  return NextResponse.json({ id: created.id, key: raw, description: created.description, scopes: created.scopes }, { status: 201 });
});

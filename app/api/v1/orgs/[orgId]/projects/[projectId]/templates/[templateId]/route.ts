import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, handler, ApiError } from '@/lib/auth';
import { z } from 'zod';

// ─── Validation Schemas ──────────────────────────────────
const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// ─── GET: Fetch Single Template ──────────────────────────
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
    include: {
      versions: {
        orderBy: { version: 'desc' },
      },
      _count: { select: { generations: true } },
    },
  });

  if (!template) throw new ApiError(404, 'Template not found');

  return NextResponse.json({
    id: template.id,
    name: template.name,
    description: template.description,
    tags: template.tags,
    isArchived: template.isArchived,
    currentVersionId: template.currentVersionId,
    versions: template.versions.map((v) => ({
      id: v.id,
      version: v.version,
      prompt: v.prompt,
      systemPrompt: v.systemPrompt,
      variablesSchema: v.variablesSchema,
      testData: v.testData,
      isActive: v.isActive,
      generationCount: v.generationCount,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    })),
    generationCount: template._count.generations,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
});

// ─── PATCH: Update Template Metadata ─────────────────────
export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
  });

  if (!template) throw new ApiError(404, 'Template not found');

  const body = await req.json();
  const validatedData = UpdateTemplateSchema.parse(body);

  try {
    const updated = await prisma.template.update({
      where: { id: templateId },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.description !== undefined && {
          description: validatedData.description,
        }),
        ...(validatedData.tags && { tags: validatedData.tags }),
      },
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      tags: updated.tags,
      currentVersion: updated.versions[0] || null,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new ApiError(409, 'Template name already exists in this project');
    }
    throw error;
  }
});

// ─── DELETE: Archive Template ────────────────────────────
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin']);

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
  });

  if (!template) throw new ApiError(404, 'Template not found');

  await prisma.template.update({
    where: { id: templateId },
    data: { isArchived: true },
  });

  return new NextResponse('', { status: 204 });
});

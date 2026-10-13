import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, requireProject, handler } from '@/lib/auth';
import { validateVariablesSchema, extractVariablesFromPrompt } from '@/lib/templates';
import { z } from 'zod';

// ─── Request Validation ────────────────────────────────────
const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  prompt: z.string().min(10),
  systemPrompt: z.string().optional(),
  variablesSchema: z.record(z.any()).optional(),
});

// ─── GET: List Templates ────────────────────────────────────
export const GET = handler(async (req: NextRequest, ctx) => {
  const auth = await requireAuth(req);
  const { orgId, projectId } = await ctx.params;

  await requireOrgRole(auth.userId, orgId);
  await requireProject(orgId, projectId);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
  const offset = Number(searchParams.get('offset') || 0);
  const tags = searchParams.get('tags')?.split(',') || [];
  const archived = searchParams.get('archived') === 'true';

  try {
    const templates = await prisma.template.findMany({
      where: {
        projectId,
        isArchived: archived,
        ...(tags.length > 0 && { tags: { hasSome: tags } }),
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.template.count({
      where: {
        projectId,
        isArchived: archived,
        ...(tags.length > 0 && { tags: { hasSome: tags } }),
      },
    });

    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tags: t.tags,
        currentVersion: t.versions.find((v) => v.isActive) ?? null,
        generationCount: t.versions.reduce((sum, v) => sum + v.generationCount, 0),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json(
      { error: 'Failed to list templates' },
      { status: 500 }
    );
  }
});

// ─── POST: Create Template ──────────────────────────────────
export const POST = handler(async (req: NextRequest, ctx) => {
  const auth = await requireAuth(req);
  const { orgId, projectId } = await ctx.params;

  // Require developer+ role
  await requireOrgRole(auth.userId, orgId, ['owner', 'admin', 'developer']);
  await requireProject(orgId, projectId);

  try {
    const body = await req.json();
    const validatedData = CreateTemplateSchema.parse(body);

    // Validate schema
    if (validatedData.variablesSchema) {
      const schemaValidation = validateVariablesSchema(validatedData.variablesSchema);
      if (!schemaValidation.isValid) {
        return NextResponse.json(
          { error: 'Invalid variables schema', details: schemaValidation.errors },
          { status: 400 }
        );
      }
    }

    // Auto-detect variables from prompt
    const detectedVariables = extractVariablesFromPrompt(validatedData.prompt);

    const template = await prisma.template.create({
      data: {
        projectId,
        name: validatedData.name,
        description: validatedData.description,
        tags: validatedData.tags,
        createdBy: auth.userId,
        versions: {
          create: {
            version: 1,
            prompt: validatedData.prompt,
            systemPrompt: validatedData.systemPrompt,
            variablesSchema: validatedData.variablesSchema || 
              Object.fromEntries(
                detectedVariables.map((v) => [v, { type: 'text', required: true }])
              ),
            isActive: true,
          },
        },
      },
      include: { versions: true },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.includes('P2002')) {
      return NextResponse.json(
        { error: 'Template name already exists in this project' },
        { status: 409 }
      );
    }
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
});

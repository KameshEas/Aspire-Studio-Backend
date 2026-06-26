import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole } from '@/lib/auth';
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
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; projectId: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth) return new NextResponse('Unauthorized', { status: 401 });

  const { orgId, projectId } = await params;

  // Check org membership
  const orgMember = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: auth.userId } },
  });
  if (!orgMember) return new NextResponse('Forbidden', { status: 403 });

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
          where: { isActive: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
        _count: { select: { generations: true } },
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
        currentVersion: t.versions[0] || null,
        generationCount: t._count.generations,
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
}

// ─── POST: Create Template ──────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; projectId: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth) return new NextResponse('Unauthorized', { status: 401 });

  const { orgId, projectId } = await params;

  // Require developer+ role
  try {
    await requireOrgRole(orgId, auth.userId, ['owner', 'admin', 'developer']);
  } catch {
    return new NextResponse('Insufficient permissions', { status: 403 });
  }

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
}

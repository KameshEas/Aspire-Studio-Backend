import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, handler, ApiError } from '@/lib/auth';
import { validateVariablesSchema, extractVariablesFromPrompt } from '@/lib/templates';
import { z } from 'zod';

// ─── Validation Schema ───────────────────────────────────
const CreateVersionSchema = z.object({
  prompt: z.string().min(10),
  systemPrompt: z.string().optional(),
  variablesSchema: z.record(z.any()).optional(),
  testData: z.record(z.any()).optional(),
});

// ─── GET: List Template Versions ────────────────────────
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
  });

  if (!template) throw new ApiError(404, 'Template not found');

  const versions = await prisma.templateVersion.findMany({
    where: { templateId },
    orderBy: { version: 'desc' },
  });

  return NextResponse.json({
    templateId,
    versions: versions.map((v) => ({
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
    currentVersionId: template.currentVersionId,
  });
});

// ─── POST: Create New Template Version ───────────────────
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
  });

  if (!template) throw new ApiError(404, 'Template not found');

  const body = await req.json();
  const validatedData = CreateVersionSchema.parse(body);

  // Validate schema if provided
  if (validatedData.variablesSchema) {
    const schemaValidation = validateVariablesSchema(validatedData.variablesSchema);
    if (!schemaValidation.isValid) {
      throw new ApiError(400, 'Invalid variables schema', {
        details: schemaValidation.errors,
      });
    }
  }

  // Auto-detect variables if schema not provided
  const detectedVars = extractVariablesFromPrompt(validatedData.prompt);
  const finalSchema =
    validatedData.variablesSchema ||
    Object.fromEntries(
      detectedVars.map((v) => [v, { type: 'text', required: true }])
    );

  // Get latest version number
  const latestVersion = await prisma.templateVersion.findFirst({
    where: { templateId },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Deactivate previous active version
  await prisma.templateVersion.updateMany({
    where: { templateId, isActive: true },
    data: { isActive: false },
  });

  // Create new version
  const version = await prisma.templateVersion.create({
    data: {
      templateId,
      version: nextVersion,
      prompt: validatedData.prompt,
      systemPrompt: validatedData.systemPrompt,
      variablesSchema: finalSchema,
      testData: validatedData.testData,
      isActive: true,
    },
  });

  // Update template's currentVersionId
  await prisma.template.update({
    where: { id: templateId },
    data: { currentVersionId: version.id },
  });

  return NextResponse.json(
    {
      id: version.id,
      version: version.version,
      prompt: version.prompt,
      systemPrompt: version.systemPrompt,
      variablesSchema: version.variablesSchema,
      testData: version.testData,
      isActive: version.isActive,
      generationCount: version.generationCount,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    },
    { status: 201 }
  );
});

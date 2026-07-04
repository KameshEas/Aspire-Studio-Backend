import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, handler, ApiError } from '@/lib/auth';
import { validateVariablesSchema } from '@/lib/templates';
import { z } from 'zod';

// ─── Validation Schema ───────────────────────────────────
const UpdateVersionSchema = z.object({
  prompt: z.string().min(10).optional(),
  systemPrompt: z.string().optional(),
  variablesSchema: z.record(z.any()).optional(),
  testData: z.record(z.any()).optional(),
});

// ─── PATCH: Update Version Content ──────────────────────
export const PATCH = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId, versionId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);

  const version = await prisma.templateVersion.findFirst({
    where: { id: versionId, template: { projectId } },
    include: { template: true },
  });

  if (!version) throw new ApiError(404, 'Version not found');

  const body = await req.json();
  const validatedData = UpdateVersionSchema.parse(body);

  // Validate schema if provided
  if (validatedData.variablesSchema) {
    const schemaValidation = validateVariablesSchema(validatedData.variablesSchema);
    if (!schemaValidation.isValid) {
      throw new ApiError(400, 'Invalid variables schema', {
        details: schemaValidation.errors,
      });
    }
  }

  const updated = await prisma.templateVersion.update({
    where: { id: versionId },
    data: {
      ...(validatedData.prompt && { prompt: validatedData.prompt }),
      ...(validatedData.systemPrompt !== undefined && {
        systemPrompt: validatedData.systemPrompt,
      }),
      ...(validatedData.variablesSchema && {
        variablesSchema: validatedData.variablesSchema,
      }),
      ...(validatedData.testData !== undefined && {
        testData: validatedData.testData,
      }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    version: updated.version,
    prompt: updated.prompt,
    systemPrompt: updated.systemPrompt,
    variablesSchema: updated.variablesSchema,
    testData: updated.testData,
    isActive: updated.isActive,
    updatedAt: updated.updatedAt,
  });
});

// ─── DELETE: Soft-Delete Version ────────────────────────
export const DELETE = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId, versionId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin']);

  const version = await prisma.templateVersion.findFirst({
    where: { id: versionId, template: { projectId } },
  });

  if (!version) throw new ApiError(404, 'Version not found');

  // Don't allow deleting active version
  if (version.isActive) {
    throw new ApiError(400, 'Cannot delete active version. Activate a different version first.');
  }

  // Soft delete by marking inactive
  await prisma.templateVersion.update({
    where: { id: versionId },
    data: { isActive: false },
  });

  return new NextResponse('', { status: 204 });
});

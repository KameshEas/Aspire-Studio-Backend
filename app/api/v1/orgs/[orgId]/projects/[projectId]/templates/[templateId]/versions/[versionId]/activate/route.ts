import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, handler, ApiError } from '@/lib/auth';

// ─── POST: Activate Version ──────────────────────────────
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId, versionId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ['owner', 'admin', 'developer']);

  // Verify template & version exist
  const version = await prisma.templateVersion.findFirst({
    where: { id: versionId, template: { projectId } },
    include: { template: true },
  });

  if (!version) throw new ApiError(404, 'Version not found');

  // Deactivate all other versions
  await prisma.templateVersion.updateMany({
    where: { templateId, id: { not: versionId } },
    data: { isActive: false },
  });

  // Activate this version
  const activated = await prisma.templateVersion.update({
    where: { id: versionId },
    data: { isActive: true },
  });

  // Update template's currentVersionId
  await prisma.template.update({
    where: { id: templateId },
    data: { currentVersionId: versionId },
  });

  return NextResponse.json({
    id: activated.id,
    version: activated.version,
    isActive: activated.isActive,
    prompt: activated.prompt,
    systemPrompt: activated.systemPrompt,
    variablesSchema: activated.variablesSchema,
    message: `Version ${activated.version} is now active`,
  });
});

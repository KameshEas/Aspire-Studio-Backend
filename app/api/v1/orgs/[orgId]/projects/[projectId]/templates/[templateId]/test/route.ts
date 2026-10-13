import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireOrgRole, requireProject, handler, ApiError } from '@/lib/auth';
import { interpolateTemplate, validateVariables, estimateTokens } from '@/lib/templates';

// ─── POST: Test Template Preview ────────────────────────────
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId, templateId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);
  await requireProject(orgId, projectId);

  const body = await req.json();
  const { variables = {} } = body;

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
    include: {
      versions: {
        where: { isActive: true },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  if (!template) throw new ApiError(404, 'Template not found');

  const version = template.versions[0];
  if (!version) throw new ApiError(404, 'No active version found');

  const schema = (version.variablesSchema as any) || {};
  const validation = validateVariables(variables, schema);
  const { interpolatedPrompt, warnings } = interpolateTemplate(version.prompt, variables, schema);

  return NextResponse.json({
    interpolatedPrompt,
    systemPrompt: version.systemPrompt,
    tokenEstimate: estimateTokens(interpolatedPrompt),
    validation: {
      isValid: validation.isValid,
      errors: validation.errors,
    },
    warnings,
  });
});

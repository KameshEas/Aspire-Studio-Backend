import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { interpolateTemplate, validateVariables, estimateTokens } from '@/lib/templates';

// ─── POST: Test Template Preview ────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; projectId: string; templateId: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth) return new NextResponse('Unauthorized', { status: 401 });

  const { templateId } = await params;

  try {
    const body = await req.json();
    const { variables = {} } = body;

    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const version = template.versions[0];
    if (!version) {
      return NextResponse.json(
        { error: 'No active version found' },
        { status: 404 }
      );
    }

    // Validate variables
    const schema = (version.variablesSchema as any) || {};
    const validation = validateVariables(variables, schema);

    // Interpolate
    const { interpolatedPrompt, warnings } = interpolateTemplate(
      version.prompt,
      variables,
      schema
    );

    const tokenEstimate = estimateTokens(interpolatedPrompt);

    return NextResponse.json({
      interpolatedPrompt,
      systemPrompt: version.systemPrompt,
      tokenEstimate,
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
      },
      warnings,
    });
  } catch (error) {
    console.error('Error testing template:', error);
    return NextResponse.json(
      { error: 'Failed to test template' },
      { status: 500 }
    );
  }
}

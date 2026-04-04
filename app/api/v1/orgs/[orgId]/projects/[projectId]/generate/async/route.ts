import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { listAllModels, isImageModel } from "@/lib/providers";

/**
 * POST /api/v1/orgs/[orgId]/projects/[projectId]/generate/async
 *
 * Creates a Generation record with status `pending` and returns a job id.
 * A background worker (poller) will pick up pending jobs and process them.
 */
export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, "developer");

  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await req.json() as {
    model: string;
    templateId?: string;
    templateVersionId?: string;
    prompt?: string;
    variables?: Record<string, string>;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    jobType?: string;
  };

  if (!body.model) throw new ApiError(400, "model is required");

  // Validate model exists
  const knownModels = listAllModels();
  if (!knownModels.find((m) => m.id === body.model)) {
    throw new ApiError(400, `Unknown model: ${body.model}`);
  }

  // Resolve prompt text
  let promptText = body.prompt ?? "";
  let templateVersionId: string | null = null;

  if (body.templateId) {
    const query = body.templateVersionId
      ? { id: body.templateVersionId, templateId: body.templateId }
      : undefined;

    const version = query
      ? await prisma.templateVersion.findFirst({ where: query })
      : await prisma.templateVersion.findFirst({
          where: { template: { id: body.templateId, projectId } },
          orderBy: { version: "desc" },
        });

    if (!version) throw new ApiError(404, "Template version not found");
    templateVersionId = version.id;
    promptText = version.prompt;
  }

  if (!promptText.trim()) throw new ApiError(400, "prompt is required (or specify templateId)");

  const variables = body.variables ?? {};
  const finalPrompt = promptText.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  const jobType = body.jobType ?? (isImageModel(body.model) ? "image" : "text");

  // Create a pending Generation record; the worker will pick this up
  const generation = await prisma.generation.create({
    data: {
      orgId,
      projectId,
      templateVersionId,
      jobType,
      status: "pending",
      input: { prompt: finalPrompt, variables } as unknown as import("@prisma/client").Prisma.InputJsonValue,
      options: { model: body.model, maxTokens: body.maxTokens, temperature: body.temperature } as unknown as import("@prisma/client").Prisma.InputJsonValue,
      // startedAt will be set by the worker when processing
    },
  });

  return NextResponse.json({ generationId: generation.id, status: "queued" });
});

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import {
  getProviderForModel,
  isImageModel,
  listAllModels,
} from "@/lib/providers";
import { getStorage } from "@/lib/storage";

/**
 * Replace {{variableName}} placeholders in a prompt template string.
 */
function interpolatePrompt(
  prompt: string,
  variables: Record<string, string>
): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

/**
 * POST /api/v1/orgs/[orgId]/projects/[projectId]/generate
 *
 * Synchronous AI generation. Accepts a templateId or raw prompt.
 * Persists a Generation + Artifact record. Emits a UsageRecord.
 *
 * Body:
 *   model          string   — required
 *   templateId     string   — optional (use existing template version)
 *   templateVersionId string — optional (pin to specific version)
 *   prompt         string   — required if no templateId
 *   variables      object   — key/value pairs for {{variable}} interpolation
 *   systemPrompt   string   — optional system instruction
 *   maxTokens      number
 *   temperature    number
 *   jobType        string   — e.g. "text", "brand-name", "hero-copy", "image"
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
  const finalPrompt = interpolatePrompt(promptText, variables);
  const jobType = body.jobType ?? (isImageModel(body.model) ? "image" : "text");

  // Create Generation record
  const generation = await prisma.generation.create({
    data: {
      orgId,
      projectId,
      templateVersionId,
      jobType,
      status: "running",
      input: { prompt: finalPrompt, variables } as unknown as import("@prisma/client").Prisma.InputJsonValue,
      options: { model: body.model, maxTokens: body.maxTokens, temperature: body.temperature } as unknown as import("@prisma/client").Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });

  try {
    const provider = getProviderForModel(body.model);
    const storage = getStorage();

    let artifactType: string;
    let artifactBuffer: Buffer;
    let mimeType: string;
    let resultText: string;
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;
    let latencyMs = 0;

    if (isImageModel(body.model)) {
      // Image generation
      if (!provider.generateImage) throw new ApiError(500, "Provider does not support image generation");
      const result = await provider.generateImage({
        model: body.model,
        prompt: finalPrompt,
        width: 1024,
        height: 1024,
      });
      artifactBuffer = Buffer.from(result.imageBase64, "base64");
      mimeType = result.mimeType;
      artifactType = "image";
      resultText = `[image: ${body.model}]`;
      latencyMs = result.latencyMs;
    } else {
      // Text generation
      const result = await provider.generateText({
        model: body.model,
        prompt: finalPrompt,
        systemPrompt: body.systemPrompt,
        maxTokens: body.maxTokens ?? 2048,
        temperature: body.temperature ?? 0.7,
      });
      artifactBuffer = Buffer.from(result.text, "utf-8");
      mimeType = "text/plain";
      artifactType = "text";
      resultText = result.text;
      tokensIn = result.usage.tokensIn;
      tokensOut = result.usage.tokensOut;
      costUsd = result.usage.costUsd;
      latencyMs = result.latencyMs;
    }

    // Store artifact
    const ext = mimeType === "text/plain" ? "txt" : mimeType.split("/")[1] ?? "bin";
    const storageKey = `orgs/${orgId}/projects/${projectId}/generations/${generation.id}/output.${ext}`;
    const storageResult = await storage.upload(storageKey, artifactBuffer, mimeType);

    // Create Artifact record
    const artifact = await prisma.artifact.create({
      data: {
        generationId: generation.id,
        projectId,
        orgId,
        type: artifactType,
        storageUrl: storageResult.storageKey,
        fileName: `output.${ext}`,
        sizeBytes: BigInt(storageResult.sizeBytes),
        metadata: { model: body.model, provider: provider.name, latencyMs } as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    // Update generation to succeeded
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });

    // Emit UsageRecord
    if (tokensIn > 0 || tokensOut > 0) {
      const [modelProvider, ...modelNameParts] = body.model.includes("/")
        ? body.model.split("/")
        : [provider.name, body.model];
      const modelName = modelNameParts.join("/") || body.model;
      await prisma.usageRecord.create({
        data: {
          orgId,
          projectId,
          generationId: generation.id,
          modelProvider,
          modelName,
          tokensIn: BigInt(tokensIn),
          tokensOut: BigInt(tokensOut),
          // costCents = costUsd * 100 rounded to nearest cent
          costCents: BigInt(Math.round(costUsd * 100)),
        },
      });
    }

    const downloadUrl = await storage.getSignedUrl(storageResult.storageKey);

    return NextResponse.json({
      generationId: generation.id,
      status: "succeeded",
      jobType,
      candidates: [
        {
          id: artifact.id,
          type: artifactType,
          text: artifactType === "text" ? resultText : null,
          downloadUrl,
          metadata: {
            model: body.model,
            provider: provider.name,
            latencyMs,
          },
        },
      ],
      usage: { tokensIn, tokensOut, costUsd },
    });
  } catch (err) {
    // Mark generation as failed
    await prisma.generation.update({
      where: { id: generation.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
});

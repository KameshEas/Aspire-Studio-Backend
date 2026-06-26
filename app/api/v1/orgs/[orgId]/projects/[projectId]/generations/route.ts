import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireOrgRole, handler, ApiError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { validateOptionalEnum, VALID_GENERATION_STATUSES, VALID_JOB_TYPES } from "@/lib/validation";
import { z } from "zod";
import { interpolateTemplate, validateVariables, estimateTokens } from "@/lib/templates";
import { getProviderForModel, getModelInfo, calculateGenerationCost } from "@/lib/providers";
import { checkTokenBudget, recordUsage } from "@/lib/rate-limit";

/** GET /api/v1/orgs/[orgId]/projects/[projectId]/generations — list generations (paginated) */
export const GET = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId);

  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  const url = new URL(req.url);
  const status = validateOptionalEnum(url.searchParams.get("status"), "status", VALID_GENERATION_STATUSES);
  const jobType = validateOptionalEnum(url.searchParams.get("jobType"), "jobType", VALID_JOB_TYPES);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const generations = await prisma.generation.findMany({
    where: {
      projectId,
      orgId,
      ...(status && { status }),
      ...(jobType && { jobType }),
    },
    include: {
      _count: { select: { artifacts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = generations.length > limit;
  const items = hasMore ? generations.slice(0, limit) : generations;

  return NextResponse.json({
    items: items.map((g) => ({
      id: g.id,
      jobType: g.jobType,
      status: g.status,
      artifactCount: g._count.artifacts,
      error: g.error,
      startedAt: g.startedAt,
      finishedAt: g.finishedAt,
      createdAt: g.createdAt,
    })),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

// ─── POST: Synchronous Text Generation ──────────────────────
const GenerateSchema = z.object({
  templateVersionId: z.string().optional(),
  prompt: z.string().min(10).optional(),
  variables: z.record(z.any()).default({}),
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().positive().max(32000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeout: z.number().int().positive().max(120).optional().default(30),
  jobType: z.string().optional(),
});

export const POST = handler(async (req: NextRequest, ctx) => {
  const { orgId, projectId } = await ctx.params;
  const { userId } = await requireAuth(req);
  await requireOrgRole(userId, orgId, ["owner", "admin", "developer"]);

  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Project not found");

  try {
    const body = await req.json();
    const validatedData = GenerateSchema.parse(body);

    // ─── Step 1: Resolve prompt from template or direct ─────────
    let finalPrompt = validatedData.prompt;
    let templateVersionId: string | null = null;
    let variablesSchema: any = null;

    if (validatedData.templateVersionId) {
      const version = await prisma.templateVersion.findUnique({
        where: { id: validatedData.templateVersionId },
        include: { template: true },
      });

      if (!version) throw new ApiError(404, "Template version not found");
      if (version.template.projectId !== projectId) {
        throw new ApiError(403, "Template does not belong to this project");
      }

      templateVersionId = version.id;
      variablesSchema = version.variablesSchema;

      // Interpolate template with variables
      const { interpolatedPrompt } = interpolateTemplate(
        version.prompt,
        validatedData.variables,
        variablesSchema
      );

      finalPrompt = interpolatedPrompt;

      // Validate variables
      const validation = validateVariables(validatedData.variables, variablesSchema);
      if (!validation.isValid) {
        throw new ApiError(400, "Invalid variables", { details: validation.errors });
      }
    } else if (!validatedData.prompt) {
      throw new ApiError(400, "Either templateVersionId or prompt is required");
    }

    // ─── Step 2: Estimate tokens ────────────────────────────────
    const estimatedTokens = estimateTokens(finalPrompt);
    console.log(`[Generation] Estimated tokens: ${estimatedTokens}`);

    // ─── Step 3: Check token budget ──────────────────────────────
    const budgetCheck = await checkTokenBudget(
      orgId,
      projectId,
      userId,
      estimatedTokens
    );

    if (!budgetCheck.allowed) {
      return NextResponse.json(
        {
          error: budgetCheck.reason,
          retryAfter: budgetCheck.retryAfter,
          status: budgetCheck.status,
        },
        {
          status: 429,
          headers: budgetCheck.retryAfter
            ? { "Retry-After": String(budgetCheck.retryAfter) }
            : {},
        }
      );
    }

    // ─── Step 4: Validate model ─────────────────────────────────
    let modelInfo: any;
    try {
      modelInfo = await getModelInfo(validatedData.model);
    } catch {
      throw new ApiError(400, `Unknown model: ${validatedData.model}`);
    }

    // ─── Step 5: Create generation record (pending) ──────────────
    const generation = await prisma.generation.create({
      data: {
        orgId,
        projectId,
        templateVersionId,
        jobType: validatedData.jobType || "text-generation",
        status: "running",
        input: {
          prompt: finalPrompt,
          systemPrompt: validatedData.systemPrompt,
          model: validatedData.model,
          temperature: validatedData.temperature,
          maxTokens: validatedData.maxTokens,
          estimatedTokens,
        },
      },
    });

    console.log(`[Generation] Created: ${generation.id}`);

    // ─── Step 6: Call provider with timeout ──────────────────────
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        validatedData.timeout * 1000
      );

      const provider = getProviderForModel(validatedData.model);
      const startTime = Date.now();

      console.log(`[Generation] Calling provider: ${modelInfo.provider}/${modelInfo.name}`);

      const result = await provider.generateText({
        prompt: finalPrompt,
        systemPrompt: validatedData.systemPrompt,
        maxTokens: validatedData.maxTokens || 2048,
        temperature: validatedData.temperature ?? 0.7,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      console.log(
        `[Generation] Provider response: ${result.usage.tokensOut} tokens in ${latencyMs}ms`
      );

      // ─── Step 7: Store artifact ─────────────────────────────────
      const artifactPath = `generations/${generation.id}/output.txt`;

      const artifact = await prisma.artifact.create({
        data: {
          generationId: generation.id,
          projectId,
          orgId,
          type: "text",
          storageUrl: `s3://aspire-studio/${artifactPath}`,
          fileName: "output.txt",
          sizeBytes: BigInt(result.text.length),
          metadata: {
            model: result.model,
            provider: result.provider,
            latencyMs,
            finishReason: result.finishReason,
          },
        },
      });

      console.log(`[Generation] Created artifact: ${artifact.id}`);

      // ─── Step 8: Calculate cost ─────────────────────────────────
      const costUsd = await calculateGenerationCost(
        validatedData.model,
        result.usage.tokensIn,
        result.usage.tokensOut
      );

      console.log(`[Generation] Cost: $${costUsd.toFixed(4)}`);

      // ─── Step 9: Record usage ───────────────────────────────────
      await recordUsage(
        orgId,
        projectId,
        generation.id,
        result.model,
        result.provider,
        result.usage.tokensIn,
        result.usage.tokensOut,
        costUsd
      );

      // ─── Step 10: Increment template version counter ──────────────
      if (templateVersionId) {
        await prisma.templateVersion.update({
          where: { id: templateVersionId },
          data: { generationCount: { increment: 1 } },
        });
      }

      // ─── Step 11: Update generation to succeeded ─────────────────
      const finalGeneration = await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
        },
      });

      console.log(`[Generation] Completed: ${generation.id}`);

      // ─── Return success response ────────────────────────────────
      return NextResponse.json(
        {
          generationId: generation.id,
          status: "succeeded",
          model: result.model,
          provider: result.provider,
          text: result.text,
          artifacts: [
            {
              id: artifact.id,
              type: artifact.type,
              fileName: artifact.fileName,
              downloadUrl: `/api/v1/orgs/${orgId}/projects/${projectId}/artifacts/${artifact.id}/download`,
              metadata: artifact.metadata,
            },
          ],
          usage: {
            tokensIn: result.usage.tokensIn,
            tokensOut: result.usage.tokensOut,
            costUsd,
          },
          timing: {
            latencyMs,
            createdAt: finalGeneration.createdAt,
          },
        },
        { status: 200 }
      );
    } catch (error: any) {
      // ─── Handle timeout ─────────────────────────────────────────
      if (error.name === "AbortError") {
        await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: "failed",
            error: "Generation timeout exceeded (>30s)",
            finishedAt: new Date(),
          },
        });

        console.warn(`[Generation] Timeout: ${generation.id}`);

        return NextResponse.json(
          {
            error: "Generation timeout exceeded",
            generationId: generation.id,
            status: "timeout",
            advise: "Consider using async /jobs endpoint for longer generations",
          },
          { status: 504 }
        );
      }

      // ─── Handle provider errors ─────────────────────────────────
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "failed",
          error: error.message || String(error),
          finishedAt: new Date(),
        },
      });

      console.error(`[Generation] Failed: ${generation.id}`, error);

      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError(400, "Validation error", {
        details: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }
    throw error;
  }
});

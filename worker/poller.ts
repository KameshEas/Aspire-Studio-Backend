import prisma from "../lib/prisma";
import { getProviderForModel, isImageModel } from "../lib/providers";
import { getStorage } from "../lib/storage";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function processGeneration(generationId: string) {
  console.log(`Picking up generation ${generationId}`);
  const generation = await prisma.generation.findUnique({ where: { id: generationId } });
  if (!generation) return;

  try {
    // Mark running (best-effort; small race possible)
    await prisma.generation.update({ where: { id: generationId }, data: { status: "running", startedAt: new Date() } });

    const input = generation.input as any;
    const options = generation.options as any;
    const model = options?.model as string;

    const provider = getProviderForModel(model);
    const storage = getStorage();

    let artifactType: string;
    let artifactBuffer: Buffer;
    let mimeType: string;
    let resultText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;
    let latencyMs = 0;

    if (isImageModel(model)) {
      if (!provider.generateImage) throw new Error("Provider does not support image generation");
      const result = await provider.generateImage({ model, prompt: input.prompt, width: 1024, height: 1024 });
      artifactBuffer = Buffer.from(result.imageBase64, "base64");
      mimeType = result.mimeType;
      artifactType = "image";
      resultText = `[image: ${model}]`;
      latencyMs = result.latencyMs;
    } else {
      const result = await provider.generateText({ model, prompt: input.prompt, systemPrompt: input.systemPrompt, maxTokens: options?.maxTokens ?? 2048, temperature: options?.temperature ?? 0.7 });
      artifactBuffer = Buffer.from(result.text, "utf-8");
      mimeType = "text/plain";
      artifactType = "text";
      resultText = result.text;
      tokensIn = result.usage.tokensIn;
      tokensOut = result.usage.tokensOut;
      costUsd = result.usage.costUsd;
      latencyMs = result.latencyMs;
    }

    const ext = mimeType === "text/plain" ? "txt" : mimeType.split("/")[1] ?? "bin";
    const storageKey = `orgs/${generation.orgId}/projects/${generation.projectId}/generations/${generation.id}/output.${ext}`;
    const storageResult = await storage.upload(storageKey, artifactBuffer, mimeType);

    const artifact = await prisma.artifact.create({
      data: {
        generationId: generation.id,
        projectId: generation.projectId,
        orgId: generation.orgId,
        type: artifactType,
        storageUrl: storageResult.storageKey,
        fileName: `output.${ext}`,
        sizeBytes: BigInt(storageResult.sizeBytes),
        metadata: { model, provider: provider.name, latencyMs } as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    // Update generation to succeeded
    await prisma.generation.update({ where: { id: generation.id }, data: { status: "succeeded", finishedAt: new Date() } });

    // Emit UsageRecord
    if (tokensIn > 0 || tokensOut > 0) {
      const [modelProvider, ...modelNameParts] = model.includes("/") ? model.split("/") : [provider.name, model];
      const modelName = modelNameParts.join("/") || model;
      await prisma.usageRecord.create({
        data: {
          orgId: generation.orgId,
          projectId: generation.projectId,
          generationId: generation.id,
          modelProvider,
          modelName,
          tokensIn: BigInt(tokensIn),
          tokensOut: BigInt(tokensOut),
          costCents: BigInt(Math.round(costUsd * 100)),
        },
      });
    }

    const downloadUrl = await storage.getSignedUrl(storageResult.storageKey);
    console.log(`Generation ${generationId} succeeded — artifact ${artifact.id} available at ${downloadUrl}`);
  } catch (err) {
    console.error(`Generation ${generationId} failed:`, err);
    await prisma.generation.update({ where: { id: generationId }, data: { status: "failed", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) } });
  }
}

async function pollLoop() {
  console.log("Worker poller started — polling for pending generations...");
  while (true) {
    try {
      const pending = await prisma.generation.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
      if (pending) {
        await processGeneration(pending.id);
        continue; // immediately look for next
      }
    } catch (err) {
      console.error("Poller error:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

pollLoop().catch((err) => {
  console.error("Poller fatal error:", err);
  process.exit(1);
});

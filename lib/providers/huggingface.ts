/**
 * HuggingFace provider adapter — image generation via Inference API.
 * Uses FLUX.1-schnell (free tier) by default.
 */
import type {
  ProviderAdapter,
  TextGenerationRequest,
  TextGenerationResult,
  ImageGenerationRequest,
  ImageGenerationResult,
  ModelInfo,
} from "./types";

const HF_IMAGE_MODELS: ModelInfo[] = [
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1 Schnell",
    provider: "huggingface",
    capabilities: ["image"],
    contextWindow: 0,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    description: "Fast FLUX image generator — free tier, high quality.",
  },
  {
    id: "black-forest-labs/FLUX.1-dev",
    name: "FLUX.1 Dev",
    provider: "huggingface",
    capabilities: ["image"],
    contextWindow: 0,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    description: "Higher quality FLUX image generation.",
  },
];

export class HuggingFaceAdapter implements ProviderAdapter {
  readonly name = "huggingface";

  private token: string;

  constructor(token?: string) {
    const tk = token ?? process.env.HF_TOKEN;
    if (!tk) {
      throw new Error("HF_TOKEN not configured. Set the HF_TOKEN environment variable.");
    }
    this.token = tk;
  }

  listModels(): ModelInfo[] {
    return HF_IMAGE_MODELS;
  }

  // HuggingFace doesn't support text generation in this adapter
  async generateText(_req: TextGenerationRequest): Promise<TextGenerationResult> {
    throw new Error("HuggingFace adapter does not support text generation. Use GroqAdapter.");
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const start = Date.now();
    const model = req.model ?? "black-forest-labs/FLUX.1-schnell";

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "x-wait-for-model": "true",
        },
        body: JSON.stringify({
          inputs: req.prompt,
          parameters: {
            width: req.width ?? 1024,
            height: req.height ?? 1024,
            num_inference_steps: 4, // schnell works well at 4 steps
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`HuggingFace image generation failed: ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    return {
      imageBase64: base64,
      mimeType: contentType,
      model,
      provider: "huggingface",
      latencyMs: Date.now() - start,
    };
  }
}

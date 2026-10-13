/**
 * OpenAI provider adapter — chat completions + DALL·E image generation.
 */
import OpenAI from "openai";
import {
  computeTextCostUsd,
  normalizeFinishReason,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ModelInfo,
  type ProviderAdapter,
  type TextGenerationRequest,
  type TextGenerationResult,
} from "./types";

const OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    capabilities: ["text"],
    contextWindow: 128000,
    costInputPer1M: 2.5,
    costOutputPer1M: 10,
    description: "OpenAI flagship multimodal model.",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    capabilities: ["text"],
    contextWindow: 128000,
    costInputPer1M: 0.15,
    costOutputPer1M: 0.6,
    description: "Fast, low-cost model for lightweight tasks.",
  },
  {
    id: "dall-e-3",
    name: "DALL·E 3",
    provider: "openai",
    capabilities: ["image"],
    contextWindow: 0,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costPerImage: 0.04,
    description: "OpenAI image generation (1024x1024 standard).",
  },
];

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = "openai";

  private client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY not configured. Set the OPENAI_API_KEY environment variable.");
    }
    this.client = new OpenAI({ apiKey: key });
  }

  listModels(): ModelInfo[] {
    return OPENAI_MODELS;
  }

  async generateText(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const start = Date.now();

    const messages: OpenAI.ChatCompletionMessageParam[] = req.messages
      ? [...req.messages]
      : [{ role: "user", content: req.prompt ?? "" }];

    if (req.systemPrompt && !messages.some((m) => m.role === "system")) {
      messages.unshift({ role: "system", content: req.systemPrompt });
    }

    const completion = await this.client.chat.completions.create({
      model: req.model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
      top_p: req.topP ?? 1,
    });

    const choice = completion.choices[0];
    const tokensIn = completion.usage?.prompt_tokens ?? 0;
    const tokensOut = completion.usage?.completion_tokens ?? 0;
    const info = OPENAI_MODELS.find((m) => m.id === req.model);

    return {
      text: choice?.message?.content ?? "",
      model: completion.model ?? req.model,
      provider: this.name,
      usage: { tokensIn, tokensOut, costUsd: computeTextCostUsd(info, tokensIn, tokensOut) },
      latencyMs: Date.now() - start,
      finishReason: normalizeFinishReason(choice?.finish_reason),
    };
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const start = Date.now();
    const model = req.model ?? "dall-e-3";

    const response = await this.client.images.generate({
      model,
      prompt: req.prompt,
      n: 1,
      size: this.pickSize(req.width, req.height),
      response_format: "b64_json",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI image generation returned no image data");

    return {
      imageBase64: b64,
      mimeType: "image/png",
      model,
      provider: this.name,
      latencyMs: Date.now() - start,
    };
  }

  /** DALL·E 3 supports only 1024x1024, 1792x1024 and 1024x1792. */
  private pickSize(width = 1024, height = 1024): "1024x1024" | "1792x1024" | "1024x1792" {
    if (width > height) return "1792x1024";
    if (height > width) return "1024x1792";
    return "1024x1024";
  }
}

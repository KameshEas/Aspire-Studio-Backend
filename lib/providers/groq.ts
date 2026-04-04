/**
 * Groq provider adapter.
 * Uses OpenAI-compatible API at https://api.groq.com/openai/v1
 */
import OpenAI from "openai";
import type {
  ProviderAdapter,
  TextGenerationRequest,
  TextGenerationResult,
  ModelInfo,
} from "./types";

const GROQ_MODELS: ModelInfo[] = [
  {
    id: "moonshotai/kimi-k2-instruct",
    name: "Kimi K2 Instruct",
    provider: "groq",
    capabilities: ["text"],
    contextWindow: 131072,
    costInputPer1M: 1.0,
    costOutputPer1M: 3.0,
    description: "Moonshot AI's flagship — excellent at reasoning, code, and long-form content.",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "groq",
    capabilities: ["text"],
    contextWindow: 131072,
    costInputPer1M: 1.5,
    costOutputPer1M: 4.5,
    description: "OpenAI open-source 120B — high quality general purpose generation.",
  },
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B Versatile",
    provider: "groq",
    capabilities: ["text"],
    contextWindow: 131072,
    costInputPer1M: 0.59,
    costOutputPer1M: 0.79,
    description: "Meta Llama — strong general purpose model, good balance of speed and quality.",
  },
];

export class GroqAdapter implements ProviderAdapter {
  readonly name = "groq";

  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: apiKey ?? process.env.GROQ_API_KEY ?? "",
    });
  }

  listModels(): ModelInfo[] {
    return GROQ_MODELS;
  }

  async generateText(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const start = Date.now();

    const messages: OpenAI.ChatCompletionMessageParam[] = req.messages
      ? req.messages
      : [{ role: "user", content: req.prompt ?? "" }];

    if (req.systemPrompt && (!req.messages || !req.messages.find((m) => m.role === "system"))) {
      messages.unshift({ role: "system", content: req.systemPrompt });
    }

    const completion = await this.client.chat.completions.create({
      model: req.model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
      top_p: req.topP ?? 1,
    });

    const latencyMs = Date.now() - start;
    const content = completion.choices[0]?.message?.content ?? "";
    const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

    const modelInfo = GROQ_MODELS.find((m) => m.id === req.model);
    const costUsd = modelInfo
      ? (usage.prompt_tokens * modelInfo.costInputPer1M) / 1_000_000 +
        (usage.completion_tokens * modelInfo.costOutputPer1M) / 1_000_000
      : 0;

    return {
      text: content,
      model: req.model,
      provider: "groq",
      usage: {
        tokensIn: usage.prompt_tokens,
        tokensOut: usage.completion_tokens,
        costUsd,
      },
      latencyMs,
    };
  }
}

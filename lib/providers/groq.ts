/**
 * Groq provider adapter.
 * Uses OpenAI-compatible API at https://api.groq.com/openai/v1
 */
import OpenAI from "openai";
import {
  computeTextCostUsd,
  normalizeFinishReason,
  type ProviderAdapter,
  type TextGenerationRequest,
  type TextGenerationResult,
  type ModelInfo,
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
    const key = apiKey ?? process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error("GROQ_API_KEY not configured. Set the GROQ_API_KEY environment variable.");
    }
    this.client = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: key,
    });
  }

  listModels(): ModelInfo[] {
    return GROQ_MODELS;
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

    const latencyMs = Date.now() - start;
    const choice = completion.choices[0];
    const content = choice?.message?.content ?? "";
    const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

    const modelInfo = GROQ_MODELS.find((m) => m.id === req.model);
    const costUsd = computeTextCostUsd(modelInfo, usage.prompt_tokens, usage.completion_tokens);

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
      finishReason: normalizeFinishReason(choice?.finish_reason),
    };
  }
}

let groqInstance: GroqAdapter | null = null;

/** Lazily-created singleton so importing this module never throws when GROQ_API_KEY is unset. */
export function getGroq(): GroqAdapter {
  if (!groqInstance) groqInstance = new GroqAdapter();
  return groqInstance;
}

/** Facade used by worker activities; the adapter is created on first call. */
export const groq = {
  generateText: (req: TextGenerationRequest) => getGroq().generateText(req),
};

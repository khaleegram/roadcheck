import { createCerebras } from "@ai-sdk/cerebras";
import { createGroq } from "@ai-sdk/groq";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Open-weight models only, on free tiers (Cerebras preferred, Groq as an
 * alternative). Claude, GPT, Gemini and Grok are refused even if configured.
 */
const PROVIDERS = {
  cerebras: {
    keyEnv: "CEREBRAS_API_KEY",
    main: "qwen-3.8-27b",
    fast: "qwen-3.8-27b",
    strictJson: true,
  },
  groq: {
    keyEnv: "GROQ_API_KEY",
    main: "llama-3.3-70b-versatile",
    fast: "llama-3.1-8b-instant",
    strictJson: false,
  },
} as const;

type ProviderName = keyof typeof PROVIDERS;
const BLOCKED = /(anthropic|claude|gpt-[0-9]|gpt-oss|openai|gemini|grok|x-ai)/i;

function providerName(): ProviderName | null {
  if (process.env.CEREBRAS_API_KEY?.trim()) return "cerebras";
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  return null;
}

function openModel(raw: string | undefined, fallback: string) {
  const id = raw?.trim() || fallback;
  if (BLOCKED.test(id)) {
    console.warn(`RoadCheck only runs non-commercial open-weight models; ignoring "${id}".`);
    return fallback;
  }
  return id;
}

const active = providerName();
export const AI_PROVIDER = active ?? "none";
export const ROADCHECK_MODEL_ID = active
  ? openModel(process.env.ROADCHECK_MODEL, PROVIDERS[active].main)
  : "none";
export const ROADCHECK_FAST_MODEL_ID = active
  ? openModel(process.env.ROADCHECK_FAST_MODEL, PROVIDERS[active].fast)
  : "none";

export type AiMode = "live" | "rules-forced" | "no-key";
export type AiReader = "model" | "rules";

export function getAiMode(): AiMode {
  if (process.env.ROADCHECK_REHEARSAL === "1") return "rules-forced";
  if (!active) return "no-key";
  return "live";
}

let client: ((id: string) => LanguageModel) | null = null;

function model(kind: "main" | "fast"): LanguageModel | null {
  if (getAiMode() !== "live" || !active) return null;
  if (!client) {
    const apiKey = process.env[PROVIDERS[active].keyEnv];
    client =
      active === "cerebras" ? createCerebras({ apiKey }) : createGroq({ apiKey });
  }
  return client(kind === "main" ? ROADCHECK_MODEL_ID : ROADCHECK_FAST_MODEL_ID);
}

export function aiSkipReason(): string | null {
  const mode = getAiMode();
  if (mode === "rules-forced") return "ROADCHECK_REHEARSAL=1 forces keyword rules.";
  if (mode === "no-key") {
    return "No AI key. Add CEREBRAS_API_KEY (cloud.cerebras.ai) or GROQ_API_KEY to .env.local.";
  }
  return null;
}

type AiResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * The JSON shape is also described in each prompt because Groq's Llama only
 * has JSON mode (no strict schema). Validated with Zod; one retry on bad JSON.
 */
export async function aiJson<T>(options: {
  schema: z.ZodType<T>;
  name: string;
  system: string;
  prompt: string;
  timeoutMs?: number;
  kind?: "main" | "fast";
}): Promise<AiResult<T>> {
  const llm = model(options.kind ?? "main");
  if (!llm) return { ok: false, reason: aiSkipReason() ?? "AI unavailable." };

  let lastError = "unknown error";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { output } = await generateText({
        model: llm,
        output: Output.object({ schema: options.schema, name: options.name }),
        providerOptions: active === "groq" ? { groq: { structuredOutputs: false } } : undefined,
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        system: options.system,
        prompt:
          attempt === 0
            ? options.prompt
            : `${options.prompt}\n\nYour previous reply was not valid JSON for the required shape (${lastError}). Reply with the JSON object only.`,
      });
      if (output) return { ok: true, value: output };
      lastError = "empty output";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (/401|402|403|invalid api key|payment|quota|rate limit|429/i.test(lastError)) break;
    }
  }
  console.error(`[roadcheck ai] ${options.name} failed: ${lastError}`);
  return { ok: false, reason: lastError };
}

export async function aiText(options: {
  system: string;
  prompt: string;
  timeoutMs?: number;
  kind?: "main" | "fast";
}): Promise<AiResult<string>> {
  const llm = model(options.kind ?? "fast");
  if (!llm) return { ok: false, reason: aiSkipReason() ?? "AI unavailable." };
  try {
    const { text } = await generateText({
      model: llm,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      system: options.system,
      prompt: options.prompt,
    });
    const value = text.trim();
    if (!value) return { ok: false, reason: "empty reply" };
    return { ok: true, value };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[roadcheck ai] text failed: ${reason}`);
    return { ok: false, reason };
  }
}

export function aiPublicStatus() {
  const mode = getAiMode();
  return {
    mode,
    provider: AI_PROVIDER,
    model: ROADCHECK_MODEL_ID,
    fastModel: ROADCHECK_FAST_MODEL_ID,
    skipReason: aiSkipReason(),
    jobs: [
      { job: "read-report", model: ROADCHECK_MODEL_ID },
      { job: "follow-up-questions", model: ROADCHECK_MODEL_ID },
      { job: "same-event-check", model: ROADCHECK_MODEL_ID },
      { job: "busy-or-quiet-place", model: ROADCHECK_MODEL_ID },
      { job: "plain-answer", model: ROADCHECK_FAST_MODEL_ID },
    ],
  };
}

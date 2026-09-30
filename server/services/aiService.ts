/**
 * Per-organization AI access. Each organization brings its own OpenAI or Anthropic key, so the
 * platform never pays for a client's model usage. The demo deployment (DEMO_MODE=true) may fall
 * back to a platform key from the environment so the demo works out of the box.
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getOrgAiConfig, DEFAULT_AI_MODELS, type AiProvider, type OrgAiConfig } from "./orgService";
import { isDemoEnvironment } from "./demo-data";

export class AiNotConfiguredError extends Error {
  readonly code = "ai_not_configured";
  readonly status = 409;
  constructor() {
    super("This organization has no AI provider configured. An organization owner or admin can add an OpenAI or Anthropic API key under Settings > Organization > AI.");
    this.name = "AiNotConfiguredError";
  }
}

export interface ResolvedAi { provider: Exclude<AiProvider, "none">; apiKey: string; model: string; source: "organization" | "platform" }

/** The organization's own key, or (demo only) the platform key from the environment */
export async function resolveAi(organizationId: string): Promise<ResolvedAi> {
  const cfg = await getOrgAiConfig(organizationId);
  if (cfg.provider !== "none" && cfg.apiKey) {
    return { provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model || DEFAULT_AI_MODELS[cfg.provider], source: "organization" };
  }
  if (isDemoEnvironment()) {
    if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || DEFAULT_AI_MODELS.anthropic, source: "platform" };
    if (process.env.OPENAI_API_KEY) return { provider: "openai", apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || DEFAULT_AI_MODELS.openai, source: "platform" };
  }
  throw new AiNotConfiguredError();
}

export interface JsonCompletion { system: string; user: string; maxTokens?: number }

/** Pull the first JSON object out of a model reply, tolerating code fences and prose around it */
export function extractJson(text: string): any {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Model reply was not JSON");
  }
}

/** Ask the configured model for a JSON object */
export async function completeJson(ai: ResolvedAi, req: JsonCompletion): Promise<any> {
  const maxTokens = req.maxTokens ?? 1500;
  if (ai.provider === "openai") {
    const openai = new OpenAI({ apiKey: ai.apiKey });
    const response = await openai.chat.completions.create({
      model: ai.model,
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
      response_format: { type: "json_object" },
      max_completion_tokens: maxTokens,
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned an empty reply");
    return extractJson(content);
  }

  const client = new Anthropic({ apiKey: ai.apiKey });
  const response = await client.messages.create({
    model: ai.model,
    max_tokens: Math.max(maxTokens, 1024),
    system: req.system,
    messages: [{ role: "user", content: `${req.user}\n\nRespond with a single JSON object and nothing else.` }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request");
  }
  const text = response.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("\n");
  if (!text) throw new Error("Claude returned an empty reply");
  return extractJson(text);
}

/** Cheap round trip that proves a key + model pair works; returns the model that answered */
export async function testAiConfig(cfg: { provider: AiProvider; apiKey: string; model?: string | null }): Promise<{ ok: true; model: string }> {
  if (cfg.provider === "none") throw new Error("Choose a provider first");
  const ai: ResolvedAi = { provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model || DEFAULT_AI_MODELS[cfg.provider], source: "organization" };
  const reply = await completeJson(ai, { system: "You are a connectivity check.", user: 'Reply with {"ok": true}', maxTokens: 64 });
  if (!reply || reply.ok !== true) throw new Error("Unexpected reply from the model");
  return { ok: true, model: ai.model };
}

export function describeAiError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof AiNotConfiguredError) return { status: error.status, body: { message: error.message, code: error.code } };
  const msg = (error as Error).message || String(error);
  if (/401|invalid.*api key|authentication/i.test(msg)) return { status: 502, body: { message: "The AI provider rejected the organization's API key. Update it under Settings > Organization > AI.", code: "ai_auth_failed" } };
  if (/429|rate limit|quota|insufficient_quota|credit/i.test(msg)) return { status: 502, body: { message: "The AI provider reports a quota or billing problem on the organization's account.", code: "ai_quota" } };
  return { status: 502, body: { message: `AI request failed: ${msg}`, code: "ai_error" } };
}

/** Existing helper name kept for the OpenAI-era call sites */
export type { OrgAiConfig };

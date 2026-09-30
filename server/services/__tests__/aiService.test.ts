import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY ||= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.DATABASE_URL ||= "pglite://memory";
});

describe("aiService.extractJson", () => {
  it("parses plain JSON, fenced JSON and JSON wrapped in prose", async () => {
    const { extractJson } = await import("../aiService");
    expect(extractJson('{"ok":true}')).toEqual({ ok: true });
    expect(extractJson('```json\n{"summary":"fine","alerts":[]}\n```')).toEqual({ summary: "fine", alerts: [] });
    expect(extractJson('Here is the analysis:\n{"response":"x","insights":["a"]}\nHope that helps.')).toEqual({ response: "x", insights: ["a"] });
    expect(() => extractJson("no json here")).toThrow(/not JSON/);
  });

  it("maps provider failures to actionable statuses", async () => {
    const { describeAiError, AiNotConfiguredError } = await import("../aiService");
    expect(describeAiError(new AiNotConfiguredError()).status).toBe(409);
    expect(describeAiError(new Error("401 Incorrect API key provided")).body.code).toBe("ai_auth_failed");
    expect(describeAiError(new Error("429 insufficient_quota")).body.code).toBe("ai_quota");
    expect(describeAiError(new Error("boom")).body.code).toBe("ai_error");
  });
});

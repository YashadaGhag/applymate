import Anthropic from "@anthropic-ai/sdk";
import { appendAiUsage } from "../store/store.js";

// USD per million tokens. Only models the app actually calls are listed; an unknown model
// logs a null cost rather than a made-up one.
const PRICING = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
};

let client = null;
// Tests only: a stand-in for the Anthropic client ({ messages: { create } }), so the real scoring
// code runs end to end with no network and no spend. null puts the real client back.
let testClient = null;
export function setClientForTests(fake) {
  testClient = fake;
}

function getClient() {
  if (testClient) return testClient;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env");
  }
  // maxRetries: 0 — a failed call surfaces immediately and the UI falls back to manual entry.
  // No retry loops, so a bad key or outage never multiplies spend.
  client ??= new Anthropic({ maxRetries: 0, timeout: 60_000 });
  return client;
}

export function estimateCostUsd(model, usage) {
  const price = PRICING[model];
  if (!price || !usage) return null;
  const input =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.1;
  const cost = (input * price.input + (usage.output_tokens ?? 0) * price.output) / 1_000_000;
  return Number(cost.toFixed(6));
}

/**
 * The one path every Anthropic call goes through, so every call — success or failure —
 * lands in data/ai-usage.jsonl with token counts and an estimated cost.
 * `task` names the feature (e.g. "resume-extraction"); `meta` is extra context for the log.
 */
export async function callClaude({ task, meta = {}, params }) {
  const startedAt = Date.now();
  const entry = { at: new Date(startedAt).toISOString(), task, model: params.model, ...meta };

  try {
    const response = await getClient().messages.create(params);
    const usage = response.usage ?? {};
    appendAiUsage({
      ...entry,
      ok: true,
      stopReason: response.stop_reason,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      estimatedCostUsd: estimateCostUsd(params.model, usage),
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (err) {
    appendAiUsage({
      ...entry,
      ok: false,
      error: err instanceof Anthropic.APIError ? `${err.status ?? ""} ${err.message}`.trim() : err.message,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

/**
 * The streaming counterpart of callClaude, for answers shown to the person while they're written.
 * `onEvent(event)` gets every raw stream event; an error it throws stops the stream (logged as a
 * failed call). Resolves with the final message. Token counts are taken from the stream events
 * as they arrive, so a call that fails midway is still logged with what it used so far.
 */
export async function streamClaude({ task, meta = {}, params, onEvent }) {
  const startedAt = Date.now();
  const entry = { at: new Date(startedAt).toISOString(), task, model: params.model, streamed: true, ...meta };
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let stream = null;

  try {
    stream = getClient().messages.stream(params);
    for await (const event of stream) {
      if (event.type === "message_start") Object.assign(usage, event.message.usage ?? {});
      else if (event.type === "message_delta" && event.usage) usage.output_tokens = event.usage.output_tokens ?? usage.output_tokens;
      onEvent?.(event);
    }
    const message = await stream.finalMessage();
    const final = message.usage ?? usage;
    appendAiUsage({
      ...entry,
      ok: true,
      stopReason: message.stop_reason,
      inputTokens: final.input_tokens ?? 0,
      outputTokens: final.output_tokens ?? 0,
      cacheCreationInputTokens: final.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: final.cache_read_input_tokens ?? 0,
      estimatedCostUsd: estimateCostUsd(params.model, final),
      durationMs: Date.now() - startedAt,
    });
    return message;
  } catch (err) {
    stream?.abort();
    appendAiUsage({
      ...entry,
      ok: false,
      error: err instanceof Anthropic.APIError ? `${err.status ?? ""} ${err.message}`.trim() : err.message,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      estimatedCostUsd: estimateCostUsd(params.model, usage) ?? 0,
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

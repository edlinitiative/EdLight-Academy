/**
 * api/_lib/llm.ts — provider-agnostic LLM client.
 *
 * One entry point — `chatJSON()` — that returns parsed JSON from whichever
 * provider is configured. Two transports cover essentially every hosted model:
 *
 *   • "gemini"            → Google Generative Language API (native).
 *   • "openai-compatible" → the OpenAI /chat/completions contract, which
 *                           DeepSeek, OpenAI, Groq, Together, OpenRouter, Mistral
 *                           and most local servers (Ollama, LM Studio, vLLM) all
 *                           speak. Pick any by setting the base URL + model.
 *
 * Configuration (all optional — sensible auto-detection from whatever key is
 * present, so dropping in a single DEEPSEEK_API_KEY "just works"):
 *
 *   LLM_PROVIDER   "deepseek" | "openai" | "gemini" | "openai-compatible"
 *   LLM_API_KEY    generic key (overrides provider-specific keys below)
 *   LLM_BASE_URL   e.g. https://api.deepseek.com/v1  (openai-compatible only)
 *   LLM_MODEL      e.g. deepseek-chat / gpt-4o-mini / gemini-2.5-flash
 *
 *   DEEPSEEK_API_KEY / OPENAI_API_KEY / edlight_chatgpt_api / GEMINI_API_KEY
 *
 * Auto-detection order when LLM_PROVIDER is unset: DeepSeek → OpenAI → Gemini.
 */

export type LLMProvider = 'gemini' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;
  label: string; // human-readable, e.g. "deepseek (deepseek-chat)"
  apiKey: string;
  baseUrl: string; // openai-compatible only
  model: string;
}

export class LLMError extends Error {
  status: number;
  provider: string;
  constructor(message: string, status = 0, provider = '') {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.provider = provider;
  }
}

type Env = Record<string, string | undefined>;

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; transport: LLMProvider }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', transport: 'openai-compatible' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', transport: 'openai-compatible' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', transport: 'openai-compatible' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.1-70b-instruct', transport: 'openai-compatible' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', transport: 'openai-compatible' },
  gemini: { baseUrl: '', model: 'gemini-2.5-flash', transport: 'gemini' },
};

const firstNonEmpty = (...vals: Array<string | undefined>): string =>
  vals.find((v) => typeof v === 'string' && v.trim().length > 0)?.trim() || '';

/**
 * Resolve the active provider configuration from the environment, or return
 * null when no usable key is present (caller falls back to manual review).
 */
export function resolveLLMConfig(env: Env = process.env): LLMConfig | null {
  const explicit = firstNonEmpty(env.LLM_PROVIDER).toLowerCase();
  const genericKey = firstNonEmpty(env.LLM_API_KEY);

  const keyFor: Record<string, string> = {
    deepseek: firstNonEmpty(env.DEEPSEEK_API_KEY),
    openai: firstNonEmpty(env.OPENAI_API_KEY, env.edlight_chatgpt_api),
    groq: firstNonEmpty(env.GROQ_API_KEY),
    openrouter: firstNonEmpty(env.OPENROUTER_API_KEY),
    mistral: firstNonEmpty(env.MISTRAL_API_KEY),
    gemini: firstNonEmpty(env.GEMINI_API_KEY),
  };

  // Decide which named provider to use.
  let name = '';
  if (explicit && (PROVIDER_DEFAULTS[explicit] || explicit === 'openai-compatible')) {
    name = explicit;
  } else if (genericKey && firstNonEmpty(env.LLM_BASE_URL)) {
    name = 'openai-compatible';
  } else {
    // Auto-detect by whichever provider key is present (cheapest first).
    name = ['deepseek', 'openai', 'groq', 'openrouter', 'mistral', 'gemini'].find((p) => keyFor[p]) || '';
  }
  if (!name) return null;

  if (name === 'openai-compatible') {
    const apiKey = firstNonEmpty(genericKey, keyFor.openai, keyFor.deepseek);
    const baseUrl = firstNonEmpty(env.LLM_BASE_URL);
    if (!apiKey || !baseUrl) return null;
    return {
      provider: 'openai-compatible',
      label: `openai-compatible (${firstNonEmpty(env.LLM_MODEL, 'model')})`,
      apiKey,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      model: firstNonEmpty(env.LLM_MODEL, 'gpt-4o-mini'),
    };
  }

  const def = PROVIDER_DEFAULTS[name];
  const apiKey = firstNonEmpty(genericKey, keyFor[name]);
  if (!apiKey) return null;
  const model = firstNonEmpty(env.LLM_MODEL, def.model);
  return {
    provider: def.transport,
    label: `${name} (${model})`,
    apiKey,
    baseUrl: def.transport === 'openai-compatible' ? firstNonEmpty(env.LLM_BASE_URL, def.baseUrl).replace(/\/+$/, '') : '',
    model,
  };
}

/** Pull the first JSON object/array out of a model reply (handles ```json fences). */
export function extractJSON(text: string): unknown {
  if (typeof text !== 'string') throw new LLMError('Empty model response');
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
    }
    throw new LLMError('Model did not return valid JSON');
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatJSONParams {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  config?: LLMConfig | null;
}

/**
 * Send a system+user prompt and return the parsed JSON reply. Throws LLMError
 * on misconfiguration, network/timeout, non-2xx, or unparseable output.
 */
export async function chatJSON(params: ChatJSONParams): Promise<unknown> {
  const { system, user, temperature = 0, maxTokens = 1200, timeoutMs = 20000 } = params;
  const config = params.config ?? resolveLLMConfig();
  if (!config) throw new LLMError('No LLM provider configured', 0, 'none');

  if (config.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        // gemini-2.5 reasons by default; disable for fast, deterministic grading.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, timeoutMs);
    if (!res.ok) throw new LLMError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, 'gemini');
    const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return extractJSON(text);
  }

  // openai-compatible (DeepSeek / OpenAI / Groq / OpenRouter / local …)
  const url = `${config.baseUrl}/chat/completions`;
  const payload = {
    model: config.model,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(payload),
  }, timeoutMs);
  if (!res.ok) throw new LLMError(`${config.label} ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, config.provider);
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = body?.choices?.[0]?.message?.content || '';
  return extractJSON(text);
}

export interface ChatTextParams {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  config?: LLMConfig | null;
}

/**
 * Send a system prompt plus a multi-turn conversation and return the assistant
 * reply as plain text (trimmed, non-empty). Throws LLMError on
 * misconfiguration, network/timeout, non-2xx, or an empty reply.
 */
export async function chatText(params: ChatTextParams): Promise<string> {
  const { system, messages, temperature = 0.4, maxTokens = 900, timeoutMs = 30000 } = params;
  const config = params.config ?? resolveLLMConfig();
  if (!config) throw new LLMError('No LLM provider configured', 0, 'none');

  if (config.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        // gemini-2.5 reasons by default; disable for fast conversational replies.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, timeoutMs);
    if (!res.ok) throw new LLMError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, 'gemini');
    const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (body?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) throw new LLMError('Empty model response', 0, 'gemini');
    return text;
  }

  // openai-compatible (DeepSeek / OpenAI / Groq / OpenRouter / local …)
  const url = `${config.baseUrl}/chat/completions`;
  const payload = {
    model: config.model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(payload),
  }, timeoutMs);
  if (!res.ok) throw new LLMError(`${config.label} ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, config.provider);
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = (body?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new LLMError('Empty model response', 0, config.provider);
  return text;
}

/** Requested embedding dimension — must match the Firestore vector index. */
export const EMBED_DIM = 768;

const EMBED_BATCH_SIZE = 100; // Gemini batchEmbedContents hard limit.

/**
 * Embed texts with Gemini (`gemini-embedding-001`, overridable via
 * LLM_EMBED_MODEL; text-embedding-004 was retired by Google in 2026). Vectors
 * are requested at EMBED_DIM dims and re-normalized to unit length, since
 * gemini-embedding-001 outputs below 3072 dims are not normalized. Key comes
 * from GEMINI_API_KEY or LLM_API_KEY. Batches of ≤100 via batchEmbedContents;
 * returns one vector per input text, in order. Throws LLMError when no key is
 * configured or on any request failure.
 */
export async function embed(texts: string[], env: Env = process.env): Promise<number[][]> {
  const apiKey = firstNonEmpty(env.GEMINI_API_KEY, env.LLM_API_KEY);
  if (!apiKey) throw new LLMError('No Gemini API key configured for embeddings', 0, 'gemini');
  const model = firstNonEmpty(env.LLM_EMBED_MODEL, 'gemini-embedding-001');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const payload = {
      requests: batch.map((t) => ({
        model: `models/${model}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: EMBED_DIM,
      })),
    };
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 30000);
    if (!res.ok) throw new LLMError(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, 'gemini');
    const body = await res.json() as { embeddings?: Array<{ values?: number[] }> };
    const embeddings = body?.embeddings || [];
    if (embeddings.length !== batch.length) {
      throw new LLMError(`Gemini embed returned ${embeddings.length} vectors for ${batch.length} texts`, 0, 'gemini');
    }
    for (const e of embeddings) vectors.push(normalizeVector(e?.values || []));
  }
  return vectors;
}

/** Scale a vector to unit length (no-op for zero vectors). */
function normalizeVector(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm > 0 ? v.map((x) => x / norm) : v;
}

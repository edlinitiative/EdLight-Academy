import { LLMError, extractJSON, resolveLLMConfig, thinkingConfigFor } from '../../../api/_lib/llm';

describe('resolveLLMConfig — provider auto-detection', () => {
  it('auto-detects DeepSeek and defaults its base URL + model', () => {
    const c = resolveLLMConfig({ DEEPSEEK_API_KEY: 'dk-test' })!;
    expect(c.provider).toBe('openai-compatible');
    expect(c.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(c.model).toBe('deepseek-chat');
    expect(c.apiKey).toBe('dk-test');
  });

  it('prefers DeepSeek over OpenAI/Gemini when several keys are present', () => {
    const c = resolveLLMConfig({ DEEPSEEK_API_KEY: 'dk', OPENAI_API_KEY: 'oa', GEMINI_API_KEY: 'gm' })!;
    expect(c.label).toMatch(/^deepseek/);
  });

  it('detects OpenAI via the legacy edlight_chatgpt_api key', () => {
    const c = resolveLLMConfig({ edlight_chatgpt_api: 'sk-proj-x' })!;
    expect(c.provider).toBe('openai-compatible');
    expect(c.baseUrl).toBe('https://api.openai.com/v1');
    expect(c.apiKey).toBe('sk-proj-x');
  });

  it('uses the native Gemini transport when only GEMINI_API_KEY is set', () => {
    const c = resolveLLMConfig({ GEMINI_API_KEY: 'AIza-x' })!;
    expect(c.provider).toBe('gemini');
    expect(c.model).toBe('gemini-3.6-flash');
    expect(c.baseUrl).toBe('');
  });

  it('honors an explicit LLM_PROVIDER and LLM_MODEL override', () => {
    const c = resolveLLMConfig({ LLM_PROVIDER: 'groq', GROQ_API_KEY: 'gk', LLM_MODEL: 'llama-3.1-8b-instant' })!;
    expect(c.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(c.model).toBe('llama-3.1-8b-instant');
  });

  it('supports a fully custom OpenAI-compatible endpoint (e.g. local/Ollama)', () => {
    const c = resolveLLMConfig({
      LLM_API_KEY: 'none',
      LLM_BASE_URL: 'http://localhost:11434/v1/',
      LLM_MODEL: 'llama3',
    })!;
    expect(c.provider).toBe('openai-compatible');
    expect(c.baseUrl).toBe('http://localhost:11434/v1'); // trailing slash trimmed
    expect(c.model).toBe('llama3');
  });

  it('returns null when no usable key is configured', () => {
    expect(resolveLLMConfig({})).toBeNull();
    expect(resolveLLMConfig({ LLM_PROVIDER: 'deepseek' })).toBeNull(); // provider but no key
  });
});

describe('extractJSON', () => {
  it('parses a plain JSON object', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(extractJSON('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it('recovers an object embedded in prose', () => {
    expect(extractJSON('Here you go: {"a":3} thanks')).toEqual({ a: 3 });
  });
  it('throws LLMError on unparseable text', () => {
    expect(() => extractJSON('not json at all')).toThrow(LLMError);
  });
});

/**
 * Gemini 3.x will not let you switch thinking off.
 *
 * Every Gemini call in this file used to send `thinkingBudget: 0` — reasoning
 * off, because a chat reply wants to be fast and a grading pass deterministic.
 * 3.x removed the option, and a budget of 0 is REJECTED rather than ignored:
 * the whole request comes back `400 Request contains an invalid argument` with
 * nothing naming the field, which is what took Sandra down and took a payload
 * bisection to find. `thinkingLevel: 'low'` is the 3.x equivalent.
 */
describe('thinkingConfigFor', () => {
  it('uses the 3.x spelling on 3.x models', () => {
    for (const model of ['gemini-3.6-flash', 'gemini-3.0-pro', 'gemini-4-flash']) {
      expect([model, thinkingConfigFor(model)]).toEqual([model, { thinkingLevel: 'low' }]);
    }
  });

  it('keeps the 2.5 spelling for 2.x, which still accepts it', () => {
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
      expect([model, thinkingConfigFor(model)]).toEqual([model, { thinkingBudget: 0 }]);
    }
  });

  it('never sends thinkingBudget 0 to a 3.x model', () => {
    // The single assertion that would have caught the outage.
    expect(thinkingConfigFor('gemini-3.6-flash')).not.toHaveProperty('thinkingBudget');
  });
});

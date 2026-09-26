/**
 * Shared LLM plumbing for the Hindi text-repair endpoints.
 *
 * Two problems this exists to solve:
 *
 * 1. Model names rot. The Gemini model IDs this project hardcoded
 *    (gemini-2.0-flash, gemini-1.5-flash) now return 404, and 2.5-flash returns
 *    404 for newer keys. Google retires these without notice, so the list is
 *    ordered newest-first and each entry is tried in turn.
 *
 * 2. Failures were invisible. Both repair routes used to fall through to an
 *    empty result and still report `success: true`, so a completely dead API
 *    looked identical to "nothing needed fixing". `callGeminiJson` now always
 *    reports what actually happened, so a dead key or a rate-limited model is
 *    visible instead of masquerading as clean text.
 */

const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
];

export interface LlmResult {
  ok: boolean;
  data?: unknown;
  /** Human-readable reason, present whenever ok is false. */
  error?: string;
  /** Which model answered, when one did. */
  model?: string;
  /** True when every candidate model failed. */
  unavailable?: boolean;
}

export async function callGeminiJson(
  prompt: string,
  options: { temperature?: number; timeoutMs?: number } = {}
): Promise<LlmResult> {
  const { temperature = 0, timeoutMs = 30_000 } = options;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: 'GEMINI_API_KEY is not set', unavailable: true };

  const attempts: string[] = [];

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature, responseMimeType: 'application/json' },
          }),
        }
      );

      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 200);
        attempts.push(`${model}: HTTP ${res.status} ${body}`);
        // 400 means the model name or request shape is wrong; trying the rest
        // is still worthwhile because the next entry may be valid. 401/403 mean
        // the key is bad, so stop immediately.
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: `key rejected: ${attempts.join(' | ')}`, unavailable: true };
        }
        continue;
      }

      const json: any = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        attempts.push(`${model}: empty response`);
        continue;
      }
      return { ok: true, data: JSON.parse(text), model };
    } catch (err: any) {
      attempts.push(`${model}: ${err?.name === 'AbortError' ? 'timeout' : err?.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    error: attempts.join(' | '),
    unavailable: true,
  };
}

export function hasLlmKey(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

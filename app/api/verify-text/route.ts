import { NextRequest, NextResponse } from 'next/server';
import { callGeminiJson } from '../../lib/llm';

/**
 * /api/verify-text
 *
 * Token-level Devanagari spell checker.
 *
 * The line-level /api/ocr endpoint has to rewrite whole lines, which means a
 * single mistake can corrupt a sentence that was already correct. That is what
 * made clean Hindi PDFs come out garbled.
 *
 * This endpoint is deliberately narrower: it is handed a list of individual
 * words and asked to return a mapping *only* for the ones that are actually
 * misspelled. Correct words are simply omitted. The caller then swaps tokens
 * one for one, so the blast radius of a bad answer is a single word, and an
 * empty or malformed response changes nothing at all.
 *
 * This is what catches the damage no structural rule can see, e.g. "ललए"
 * (two consonants, structurally valid) where the word is "लिए".
 */

const PROMPT = `You are a Hindi (Devanagari) spelling checker for text extracted from a PDF whose font has a broken character map.

You get a list of individual words. Return a JSON object that maps ONLY the wrong words to their correct spelling.

Rules:
- Omit any word that is already spelled correctly. An omitted word means "leave it alone".
- Where more than one spelling is in common use, normalise to the standard modern Hindi spelling. For example "बनायें" and "बनाये" become "बनाएं" and "बनाए", and "बढ़ायें"/"बढ़ाये" become "बढ़ाएं"/"बढ़ाए".
- Fix words whose consonants or matras were mangled by the font, e.g. "रलए", "ललए" and "हलए" all become "लिए".
- Do NOT translate, do NOT change meaning, do NOT modernise grammar, and do NOT alter proper nouns, place names or numbers.
- Keep Devanagari script.
- This is a spelling fix only. Never rewrite a word that is already valid.

Output example: {"रलए":"लिए","बनायें":"बनाएं"}

Words: `;

export async function POST(req: NextRequest) {
  try {
    const { tokens } = await req.json();

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ success: true, corrections: {} });
    }

    // Cap the batch so one page cannot blow up the request or the context.
    const unique = [...new Set(tokens.filter((t) => typeof t === 'string' && t.trim()))].slice(0, 400);
    if (unique.length === 0) {
      return NextResponse.json({ success: true, corrections: {} });
    }

    const groqKey = process.env.GROQ_API_KEY;

    const sanitise = (raw: unknown): Record<string, string> => {
      const source =
        raw && typeof raw === 'object'
          ? ((raw as any).corrections ?? (raw as any).result ?? raw)
          : raw;
      if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof value !== 'string') continue;
        const from = key.trim();
        const to = value.trim();
        if (!from || !to || from === to) continue;
        // Only ever correct Devanagari into Devanagari. Anything else is a
        // hallucination and is discarded.
        if (!/[\u0900-\u097F]/.test(from) || !/[\u0900-\u097F]/.test(to)) continue;
        // A correction that is wildly longer is a rewrite, not a spelling fix.
        if (to.length > from.length * 2 + 2) continue;
        out[from] = to.normalize('NFC');
      }
      return out;
    };

    if (groqKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: PROMPT + JSON.stringify(unique) }],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
          return NextResponse.json({ success: true, corrections: sanitise(parsed), model: 'groq' });
        }
        console.warn(`verify-text: groq HTTP ${res.status}`);
      } catch (err) {
        console.warn('verify-text: groq failed:', err);
      }
    }

    const result = await callGeminiJson(PROMPT + JSON.stringify(unique));
    if (result.ok) {
      return NextResponse.json({
        success: true,
        corrections: sanitise(result.data),
        model: result.model,
      });
    }

    // Report the failure instead of pretending the text was clean. An empty map
    // with success:true is indistinguishable from "nothing needed fixing",
    // which is exactly how a dead model list went unnoticed.
    console.error('verify-text: no provider available:', result.error);
    return NextResponse.json({
      success: false,
      corrections: {},
      checked: unique.length,
      degraded: result.error,
    });
  } catch (error) {
    console.error('verify-text error:', error);
    return NextResponse.json({ success: false, corrections: {}, degraded: String(error) });
  }
}

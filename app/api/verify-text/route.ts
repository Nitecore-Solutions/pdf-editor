import { NextRequest, NextResponse } from 'next/server';

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

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

const PROMPT = `You are a strict Hindi (Devanagari) orthography checker.

I extracted words from a Hindi PDF. Some are correct, some are misspelled because the PDF's font has a broken character map.

For each word:
- If it is a CORRECTLY spelled Hindi word, OMIT it from the output.
- If it is MISSPELLED, output the correct spelling.
- Keep the word's meaning, length class and grammatical role. This is a spelling fix, not a rewrite.
- NEVER "correct" a word that is already valid, even if you would phrase it differently. Infinitive, polite and colloquial forms are all valid Hindi.
- NEVER change proper nouns, place names, brand names, or English words written in Latin script.
- NEVER translate. Keep Devanagari script.

Return ONLY a flat JSON object mapping the misspelled input word to its correction.
Words that need no change must be absent. Example:
{"ललए":"लिए","बढ़ाएों":"बढ़ाएं"}

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

    const geminiKey = process.env.GEMINI_API_KEY;
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
          return NextResponse.json({ success: true, corrections: sanitise(parsed) });
        }
      } catch (err) {
        console.warn('verify-text: groq failed:', err);
      }
    }

    if (geminiKey) {
      for (const model of GEMINI_MODELS) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: PROMPT + JSON.stringify(unique) }] }],
                generationConfig: { temperature: 0, responseMimeType: 'application/json' },
              }),
            }
          );
          if (!response.ok) continue;
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) continue;
          return NextResponse.json({ success: true, corrections: sanitise(JSON.parse(text)) });
        } catch (err) {
          console.warn(`verify-text: ${model} failed:`, err);
        }
      }
    }

    // No provider available. Returning an empty map is the safe outcome: the
    // caller leaves the text exactly as extracted.
    return NextResponse.json({ success: true, corrections: {} });
  } catch (error) {
    console.error('verify-text error:', error);
    return NextResponse.json({ success: true, corrections: {} });
  }
}

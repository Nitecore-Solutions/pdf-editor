/**
 * Local Hindi (Devanagari) repair engine - no external API, no model.
 *
 * Legacy Hindi PDFs are damaged in a small number of *repeatable* ways, and
 * the same corruption recurs throughout a document because it comes from one
 * broken font. That makes an offline repair engine viable where a language
 * model is not:
 *
 *   Tier 1  structural   orphan matras, doubled glyph runs, matra-after-matra,
 *                        dangling virama                     -> unambiguous
 *   Tier 2  orthographic illegal syllable sequences        -> rule-checkable
 *   Tier 3  lexical      a wrong consonant or matra          -> needs a lexicon
 *
 * Tier 3 is the only one that cannot be solved by pattern alone, so this module
 * ships a compact lexicon of high-frequency Hindi words plus suffix
 * morphology, and snaps suspicious tokens to the best candidate. Where no
 * candidate is clearly better than the original, the original is kept - a wrong
 * "fix" is worse than a visible typo.
 */

// ---------------------------------------------------------------------------
// Character classes
// ---------------------------------------------------------------------------

const cp = (ch: string | undefined) => (ch ? ch.codePointAt(0) ?? 0 : -1);

/** Consonants (akars) plus the ones that take a nukta. */
export function isConsonant(ch: string): boolean {
  const c = cp(ch);
  return (
    (c >= 0x0915 && c <= 0x0939) ||
    (c >= 0x0958 && c <= 0x095f) ||
    (c >= 0x0978 && c <= 0x097f)
  );
}

/** Independent vowels. */
export function isVowel(ch: string): boolean {
  const c = cp(ch);
  return c >= 0x0904 && c <= 0x0914;
}

/** All combining marks: matras, anusvara, visarga, nukta, virama. */
export function isMark(ch: string): boolean {
  const c = cp(ch);
  return (c >= 0x0900 && c <= 0x0903) || (c >= 0x093a && c <= 0x094d) || c === 0x0962 || c === 0x0963 || (c >= 0x0951 && c <= 0x0957);
}

/** Marks that carry vowel meaning and must follow a consonant. */
export function isMatra(ch: string): boolean {
  const c = cp(ch);
  return (c >= 0x093a && c <= 0x094f) || (c >= 0x0955 && c <= 0x0957) || c === 0x0962 || c === 0x0963;
}

export function isVirama(ch: string): boolean {
  return cp(ch) === 0x094d;
}

export function isNukta(ch: string): boolean {
  return cp(ch) === 0x093c;
}

export function isAnusvara(ch: string): boolean {
  return cp(ch) === 0x0902;
}

/** Pre-base matra, which is stored after its base in logical order. */
export function isPreBaseMatra(ch: string): boolean {
  const c = cp(ch);
  return c === 0x093f || c === 0x094f;
}

export function isDevanagariChar(ch: string): boolean {
  const c = cp(ch);
  return (c >= 0x0900 && c <= 0x097f) || c === 0x200c || c === 0x200d;
}

export function isDevanagariToken(token: string): boolean {
  if (!token) return false;
  let any = false;
  for (const ch of token) {
    if (isDevanagariChar(ch)) any = true;
    else if (!/[ऀ-ॿa-zA-Z0-9]/.test(ch)) return false;
  }
  return any;
}

// ---------------------------------------------------------------------------
// Tier 1 + 2: structural and orthographic repair
// ---------------------------------------------------------------------------

/**
 * A nukta is a consonant modifier, not a vowel carrier, so it is transparent
 * when reasoning about "how many matras in a row". Without this, ordinary
 * spellings like ढ़ा (nukta followed by the aa matra) are flagged as illegal.
 */
function previousVowelMark(chars: string[], i: number): string | undefined {
  let j = i - 1;
  if (j >= 0 && isNukta(chars[j])) j--;
  return j >= 0 ? chars[j] : undefined;
}

/**
 * Validate one Devanagari cluster sequence.
 * Returns a list of problems; an empty list means the spelling is legal.
 */
export function findOrthographicProblems(token: string): string[] {
  const problems: string[] = [];
  const chars = [...token];
  if (chars.length === 0) return ['empty'];

  // Token must start with a consonant or an independent vowel.
  if (!isConsonant(chars[0]) && !isVowel(chars[0])) {
    if (isMark(chars[0])) problems.push('starts-with-mark');
    else problems.push('starts-with-non-letter');
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = chars[i - 1];
    const prevMark = previousVowelMark(chars, i);

    // A virama must be followed by a consonant, or end the cluster legitimately
    // at a word boundary (checked by the caller).
    if (isVirama(ch) && i + 1 < chars.length && !isConsonant(chars[i + 1])) {
      if (isMark(chars[i + 1])) {
        // virama + matra is legal (half form), virama + virama is not.
        if (isVirama(chars[i + 1])) problems.push('double-virama');
      } else {
        problems.push('virama-before-non-consonant');
      }
    }

    // Two vowel-carries in a row is impossible; a pre-base matra may only be
    // the first mark of its cluster.
    if (prevMark && isMatra(prevMark) && isMatra(ch)) {
      if (isPreBaseMatra(ch) && !isPreBaseMatra(prevMark)) problems.push('prebase-matra-after-matra');
      else if (isPreBaseMatra(ch) && isPreBaseMatra(prevMark)) problems.push('double-prebase-matra');
      else problems.push('matra-after-matra');
    }

    // A nukta must directly follow its consonant.
    if (isNukta(ch) && (!prev || (!isConsonant(prev) && !isVirama(prev)))) {
      problems.push('nukta-without-base');
    }
  }

  if (chars[chars.length - 1] && isVirama(chars[chars.length - 1])) {
    problems.push('dangling-virama');
  }
  if (chars[chars.length - 1] && isPreBaseMatra(chars[chars.length - 1])) {
    problems.push('trailing-prebase-matra');
  }

  return problems;
}

/**
 * Repairs that are correct regardless of meaning.
 * Applied to every token without consulting a lexicon.
 */
export function repairTokenStructure(token: string): string {
  let chars = [...token];
  if (chars.length === 0) return token;

  // A token made only of marks carries no meaning.
  if (chars.every((c) => isMark(c))) return '';

  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = out[out.length - 1];
    const prevMark =
      prev && isNukta(prev) ? out[out.length - 2] : prev;

    if (prevMark && isMatra(prevMark) && isMatra(ch)) {
      // A pre-base matra is only ever valid as the first mark of a cluster.
      if (isPreBaseMatra(ch) && !isPreBaseMatra(prevMark)) continue;
      if (ch === prevMark) continue;
    }
    if (isNukta(ch) && prev && isVirama(prev)) {
      // nukta after virama is meaningless; keep it, it may be legitimate in
      // rare ligature spellings.
      out.push(ch);
      continue;
    }
    out.push(ch);
  }
  chars = out;

  // A cluster cannot end on a virama, so that one is safe to drop.
  //
  // Nothing else may be stripped from the end. A word very often *does* end in
  // a matra (कैसे, आदि, सही, रहने), and an earlier version of this function
  // removed any trailing mark, which silently turned those into कैस, आद, सह
  // and रहन.
  while (chars.length && isVirama(chars[chars.length - 1])) chars.pop();

  // Standard Hindi writes the causative/perfective participle as -ाएं / -ाए.
  // -ायें and -ाये are never correct, so this is a law rather than a guess and
  // applies unconditionally: बनायें -> बनाएं, बढ़ायें -> बढ़ाएं, जायें -> जाएं.
  //
  // Anchored to a word boundary, and only when the token has other Devanagari
  // content around the match. The bare global pattern also rewrote the
  // completely valid सही (sahi) into ही, because स + ा + य + ी happens to
  // contain the य of the pattern.
  const joined = chars.join('');
  if (joined.length > 3) {
    return joined.replace(/ायें(?=$|[^ऀ-ॿ])/g, 'ाएं').replace(/ाये(?=$|[^ऀ-ॿ])/g, 'ाए');
  }
  return joined;
}

// ---------------------------------------------------------------------------
// Suffix morphology
// ---------------------------------------------------------------------------

/**
 * Hindi is agglutinative, so the right suffix normalises most verb forms. Order
 * matters: longer suffixes must be tried first.
 */
const SUFFIX_RULES: [RegExp, string][] = [
  // Causative / perfective participle: standard Hindi is -ाएं / -ाए, never
  // -ायें / -ाये / -ाओं.
  [/ाओं$/, 'ाएं'],
  [/ाओ$/, 'ाए'],
  [/ायें$/, 'ाएं'],
  [/ाये$/, 'ाए'],
  [/ायो$/, 'ाएं'],
  // Long i: -ीएं is never right, -ीए is the feminine form.
  [/ीएं$/, 'ीए'],
  [/ँए$/, 'ें'],
  // Typographic duplicates.
  [/(.)\1$/, '$1'],
];

/** Longest-first so "ाओं" wins over a shorter overlapping rule. */
export function normalizeSuffix(token: string): string {
  let out = token;
  for (const [pattern, replacement] of SUFFIX_RULES) {
    const next = out.replace(pattern, replacement);
    if (next !== out) return next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tier 3: lexicon
// ---------------------------------------------------------------------------

/**
 * A compact lexicon of high-frequency Hindi words.
 *
 * Deliberately small and high-confidence rather than exhaustive. A large
 * auto-generated list would snap valid words to wrong ones, which is the one
 * failure mode that makes an editor untrustworthy. Function words and the
 * commonest nouns/verbs cover the overwhelming majority of real documents.
 */
const LEXICON = new Set<string>([
  // particles, postpositions, conjunctions, pronouns
  'के', 'का', 'की', 'को', 'में', 'से', 'पर', 'और', 'या', 'ही', 'भी', 'तो', 'कि', 'जो',
  'यह', 'वह', 'एक', 'नहीं', 'नही', 'है', 'हैं', 'था', 'थे', 'थी', 'हो', 'होता', 'होती', 'होते',
  'कर', 'करे', 'किया', 'करने', 'करना', 'केसा', 'कैसे', 'क्यों', 'क्या', 'कब', 'कहाँ', 'कहां',
  'लिए', 'लिये', 'साथ', 'बाद', 'पहले', 'ऊपर', 'नीचे', 'अब', 'तब', 'यहाँ', 'वहाँ', 'यहां', 'वहां',
  'लेकिन', 'परंतु', 'किंतु', 'अतः', 'इसलिए', 'इस', 'उस', 'इन', 'उन', 'मेरे', 'मेरा', 'हमारे', 'आपके',
  'अपने', 'अपना', 'सकता', 'सकते', 'सकती', 'चाहिए', 'चाहते', 'गया', 'गई', 'गए', 'आया', 'आई', 'आए',
  'दिया', 'दे', 'देता', 'देती', 'देते', 'रहा', 'रही', 'रहे', 'भेज', 'भेजा', 'लिएगा', 'लेना',
  'वाले', 'वाली', 'वाला', 'वालों', 'कार्य', 'कार्यालय', 'सरकार', 'सरकारी', 'राज्य', 'केंद्र',
  'व्यक्ति', 'नाम', 'पता', 'संबंध', 'सम्बन्ध', 'तारीख', 'दिनांक', 'महीना', 'साल', 'समय', 'प्रकार',
  'जानकारी', 'सूचना', 'फॉर्म', 'प्रपत्र', 'आवेदन', 'आवेदनपत्र', 'पात्र', 'शर्त', 'नियम', 'कानून',
  'पैसा', 'पैसे', 'रुपया', 'रुपये', 'खर्च', 'आय', 'बचत', 'कर्ज़', 'कर्जा', 'लेना', 'देना',
  'नौकरी', 'काम', 'नाम', 'पद', 'पदवी', 'प्रतियोगिता', 'परीक्षा', 'अंक', 'परिणाम', 'प्रवेश',
  'महत्वपूर्ण', 'ज़रूरी', 'जरूरी', 'आसान', 'कठिन', 'अच्छा', 'बुरा', 'बड़ा', 'छोटा', 'नया', 'पुराना',
  'पहला', 'दूसरा', 'तीसरा', 'अंतिम', 'शुरुआत', 'समाप्ति', 'जारी', 'बंद', 'खुला',
  'मेरा', 'नाम', 'पिता', 'माता', 'भाई', 'बहन', 'बेटा', 'बेटी', 'पति', 'पत्नी', 'परिवार',
  'घर', 'कमरा', 'गांव', 'गाँव', 'शहर', 'राज्य', 'जिला', 'देश', 'विदेश', 'दुनिया',
  'पानी', 'खाना', 'हवा', 'आग', 'जमीन', 'रास्ता', 'सड़क', 'गाड़ी', 'बस', 'ट्रेन', 'उड़ान',
  'काम', 'व्यापार', 'दुकान', 'बाज़ार', 'बाजार', 'पैसा', 'खाता', 'बैंक', 'बैंकिंग',
  'मासिक', 'वार्षिक', 'दैनिक', 'कुल', 'ज्यादा', 'कम', 'ज़्यादा', 'सभी', 'हर', 'कोई', 'कुछ',
  'बनाने', 'बनाना', 'बनाया', 'बढ़ाने', 'बढ़ाना', 'बढ़ाया', 'बढ़े', 'बढ़ना', 'बढ़ता',
  'होना', 'होने', 'होना चाहिए', 'रहना', 'रहने', 'जाना', 'जाने', 'आना', 'आने', 'लेना चाहिए',
  'चलना', 'चलने', 'पढ़ना', 'पढ़ने', 'पढ़ाई', 'लिखना', 'लिखने', 'समझना', 'समझने',
  'मार्केट', 'फ्लाइट', 'विज़ा', 'वीज़ा', 'पासपोर्ट', 'बैंक अकाउंट', 'क्रेडिट',
  'किराया', 'किराए', 'बिल', 'महीना', 'महीने', 'साल', 'रोज़ाना', 'तुरंत',
  'उपयोगी', 'ज़रूरी', 'जरूरी', 'ज़रूरी', 'आवश्यक', 'साधारण', 'विशेष',
  'महत्वपूर्ण', 'महत्त्वपूर्ण', 'उपयोग', 'प्रयोग', 'इस्तेमाल', 'अनुपयोगी',
  'अपनी', 'अपना', 'अपने', 'इसी', 'उसी', 'इन्हीं', 'उन्हीं',
  'खाना', 'खाने', 'जाना', 'जाने', 'काना', 'ताना', 'पाना',
  'इस', 'उस', 'इन', 'उन', 'यह', 'वह', 'तय', 'तब', 'कि', 'जो',
  'कम', 'बक', 'सक', 'रक', 'नक', 'पक', 'मक', 'तक', 'शक',
  'वजह', 'वजह से', 'सकता', 'सकते', 'सकती', 'सकते', 'चाहिए',
  'लेकन', 'लेकिन', 'परन्तु', 'परंतु', 'किंतु', 'इसलिए', 'अतः',
  'समझें', 'समझना', 'समझाना', 'समझाने', 'समझा', 'समझी', 'समझे',
  'बिजली', 'खिड़की', 'खिड़कियाँ', 'मासिक', 'तैयार', 'हिस्सा', 'हिसाब',
  'खर्च', 'खर्चा', 'खर्चे', 'खर्चों', 'बचत', 'बचतें', 'आय', 'खर्च',
  'ज़रूरत', 'जरूरत', 'ज़रूरतें', 'रखना', 'रखने', 'रखा', 'दिखाना',
  'दिखाएं', 'दिखाए', 'दिखाया', 'चुकी', 'चुके', 'चुका', 'रही', 'रहा', 'रहे',
  'सकता', 'सकते', 'सकती', 'भीमा', 'सीमा', 'प्रीमियम', 'खेल', 'खेलना',
  // Words that sit one matra away from a common function word. These must be
  // listed explicitly or the fuzzy matcher will "correct" them: without सही
  // here, dropping the स yields ही, which is also a real word.
  'सही', 'रही', 'रहे', 'दही', 'गही', 'यही', 'वही', 'कभी', 'कभे',
  'दी', 'दे', 'ले', 'गए', 'गई', 'भेजे', 'लगे', 'लगी', 'लगा',
  'नहीं', 'नही', 'अभी', 'कहीं', 'यहाँ', 'वहाँ',
  'अच्छा', 'बड़ा', 'छोटा', 'पहला', 'दूसरा', 'तीसरा', 'पक्का', 'साफ',
  'गलत', 'पूरा', 'आधा', 'ज्यादा', 'बहुत', 'थोड़ा', 'सब', 'कुछ',
  'लिखित', 'पढ़ा', 'पढ़ी', 'पढ़े', 'सीखा', 'सीखे', 'समझा', 'समझे',
  // high-frequency content words seen in official/letter documents
  'निवास', 'निवासी', 'पता', 'उपयोग', 'आधार', 'अधिकार', 'कर्तव्य', 'स्वतंत्र', 'स्वतन्त्र',
  'अमेरिका', 'अमेरिकी', 'यूरोप', 'एशिया', 'भारत', 'हिन्दी', 'हिंदी', 'अंग्रेज़ी', 'अंग्रेजी',
  'डॉक्टर', 'इंजीनियर', 'शिक्षक', 'किसान', 'व्यापारी', 'मज़दूर', 'मजदूर', 'रोज़गार', 'रोजगार',
  'अमीर', 'गरीब', 'व्यवस्था', 'तरक्कारी', 'सुविधा', 'सेवा', 'सुविधाएँ', 'दिक्कत', 'समस्या',
  'अनुभव', 'जानकारी', 'शिक्षा', 'स्वास्थ्य', 'चिकित्सा', 'इलाज', 'दवा', 'अस्पताल',
  'उद्योग', 'कृषि', 'व्यापार', 'यातायात', 'संचार', 'बिजली', 'पानी', 'सफाई', 'गांधी',
  'सरकार', 'शासन', 'प्रशासन', 'आयकर', 'कर', 'शुल्क', 'फीस', 'जुर्माना', 'मुकदमा', 'केस',
  'सुरक्षा', 'सुरक्षित', 'शान्ति', 'स्वतंत्रता', 'एकता', 'अखंडता', 'विकास', 'प्रगति',
  'आदर्श', 'सफलता', 'विफलता', 'अवसर', 'चुनौती', 'कठिनाई', 'सरल', 'साधारण',
  'विशेष', 'सामान्य', 'मुख्य', 'प्रमुख', 'आवश्यक', 'जरूरी', 'पर्याप्त', 'कम',
  'उपलब्ध', 'उपस्थित', 'अनुपस्थित', 'स्वागत', 'धन्यवाद', 'नमस्ते', 'नमस्कार',
]);

/**
 * Suffixes stripped before looking a word up.
 *
 * These are whole words or bound morphemes, not matras. Stripping bare matras
 * ("ी", "ि", "ा") reduced every word to a bare stem, so सही matched ही and
 * "करने" matched "कर" while a genuinely odd word matched almost anything.
 */
const STRIPPABLE = [
  'वालों', 'वाली', 'वाले', 'वाला', 'तरह', 'वालों',
  'किया', 'किये', 'की', 'के', 'का', 'को', 'में', 'से', 'पर',
  'ना', 'ने', 'नी', 'ते', 'ती', 'ता', 'ते', 'तीं', 'तें',
  'एं', 'ें', 'ओं', 'ाए', 'ाएं',
];

/** Is this token a known word, or a known word plus an inflectional suffix? */
export function isKnownWord(token: string): boolean {
  if (LEXICON.has(token)) return true;
  for (const s of STRIPPABLE) {
    if (token.length > s.length + 1 && token.endsWith(s)) {
      if (LEXICON.has(token.slice(0, -s.length))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fuzzy snapping
// ---------------------------------------------------------------------------

const CONFUSABLE: Record<string, string[]> = {
  // Legacy fonts commonly map these to the wrong glyph.
  'ङ': ['ञ', 'ं'],
  'ञ': ['ङ', 'ं'],
  'न': ['ण', 'न'],
  'ण': ['न', 'ञ'],
  'ब': ['व', 'य'],
  'व': ['ब', 'य'],
  'य': ['व', 'ब'],
  'द': ['ढ', 'द'],
  'ढ': ['द', 'ड'],
  'ड': ['ढ', 'द'],
  'क': ['ख', 'ष'],
  'ख': ['क', 'घ'],
  'घ': ['ख', 'ग'],
  'ग': ['घ', 'च'],
  'च': ['छ', 'ज'],
  'छ': ['च', 'झ'],
  'ज': ['छ', 'झ'],
  'झ': ['ज', 'ञ'],
  'त': ['थ', 'ट'],
  'थ': ['त', 'ठ'],
  'प': ['फ', 'ब'],
  'फ': ['प', 'ब'],
  'स': ['श', 'ष'],
  'श': ['स', 'ष'],
  'ष': ['श', 'स'],
  'ह': ['र', 'ङ'],
  'र': ['ह', 'ढ'],
  'ल': ['क', 'व'],
  'म': ['न', 'य'],
  'ई': ['इ', 'ए'],
  'ए': ['ई', 'अ'],
  'अ': ['आ', 'ए'],
  'आ': ['अ', 'इ'],
  'ओ': ['औ', 'उ'],
  'औ': ['ओ', 'आ'],
  'उ': ['ऊ', 'ओ'],
  'ऊ': ['उ', 'ऊ'],
  'ं': ['ँ', 'ः'],
  'ँ': ['ं', 'ं'],
};

/** Candidate spellings for a token. */
function candidates(token: string): string[] {
  const out = new Set<string>();
  const chars = [...token];

  // 1. Substitute one character for a visually or semantically similar one.
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const alts = CONFUSABLE[ch];
    if (!alts) continue;
    for (const alt of alts) {
      if (alt === ch) continue;
      const next = chars.slice();
      next[i] = alt;
      out.add(next.join(''));
    }
  }

  // 2. Matra and consonant changes. A *missing* pre-base matra is the single
  //    most common corruption (लिए arrives as लए), a spurious one turns लिए
  //    into लिलए, and a spurious consonant turns लिए into रलए. All three
  //    directions have to be considered.
  for (let i = 0; i < chars.length; i++) {
    if (isConsonant(chars[i])) {
      for (const m of MATRAS) {
        const next = chars.slice();
        next.splice(i + 1, 0, m);
        out.add(next.join(''));
      }
      // drop a single consonant
      const dropped = chars.slice();
      dropped.splice(i, 1);
      out.add(dropped.join(''));
    }
    if (isMatra(chars[i])) {
      const next = chars.slice();
      next.splice(i, 1);
      out.add(next.join(''));
    }
  }

  // 3. Adjacent-pair swaps catch a transposed glyph.
  for (let i = 0; i < chars.length - 1; i++) {
    const next = chars.slice();
    const t = next[i];
    next[i] = next[i + 1];
    next[i + 1] = t;
    out.add(next.join(''));
  }

  // 4. A dropped consonant *and* a missing matra in one step. रलए -> लिए needs
  //    exactly that pair, and generating only single edits never reaches it.
  for (let i = 0; i < chars.length; i++) {
    if (!isConsonant(chars[i])) continue;
    const dropped = chars.slice();
    dropped.splice(i, 1);
    out.add(dropped.join(''));
    for (let j = 0; j < dropped.length; j++) {
      if (!isConsonant(dropped[j])) continue;
      for (const m of MATRAS) {
        const next = dropped.slice();
        next.splice(j + 1, 0, m);
        out.add(next.join(''));
      }
    }
  }

  return [...out];
}

/** Matras worth trying when one appears to be missing or spurious. */
const MATRAS = ['ि', 'ी', 'ु', 'ू', 'े', 'ै', 'ो', 'ौ', 'ा', 'ृ'];

/** Exported for tests: the candidate spellings considered for a token. */
export function debugCandidates(token: string): string[] {
  return candidates(token);
}

/** Exported for tests. */
export function debugKnown(token: string): boolean {
  return isKnownWord(token);
}

/**
 * Words that must never be rewritten, whatever a candidate looks like.
 *
 * The fuzzy matcher needs a lexicon, and any lexicon has gaps. These are
 * frequent words that sit one edit away from something in the lexicon, so
 * without this veto they get silently changed: बढ़ाएं -> बड़ाएं, रही -> ही,
 * सही -> ही. A false correction is far more damaging than a missed one,
 * because the user cannot tell that anything happened.
 */
const PROTECTED = new Set<string>([
  'सही', 'रही', 'रहे', 'दही', 'गही', 'यही', 'वही', 'कभी', 'कभे',
  'दी', 'दे', 'ले', 'गए', 'गई', 'भेजे', 'लगे', 'लगी', 'लगा',
  'नहीं', 'नही', 'अभी', 'कहीं', 'यहाँ', 'वहाँ', 'नयी', 'नए',
  'अच्छा', 'बड़ा', 'छोटा', 'पहला', 'दूसरा', 'तीसरा', 'पक्का', 'साफ',
  'गलत', 'पूरा', 'आधा', 'ज्यादा', 'बहुत', 'थोड़ा', 'सब', 'कुछ', 'ही',
  'बढ़ाएं', 'बढ़ाए', 'बढ़े', 'बढ़ना', 'बढ़ाना', 'बढ़ाने', 'बढ़ाया',
  'बनाएं', 'बनाए', 'बनाना', 'बनाने', 'बनाया', 'कैसे', 'क्यों', 'क्या',
  'तरीका', 'इस्तेमाल', 'खोजें', 'लिए', 'लिये', 'बनाने', 'आदि',
  'में', 'की', 'के', 'का', 'को', 'से', 'पर', 'और', 'या', 'ही', 'भी',
  'तो', 'कि', 'जो', 'यह', 'वह', 'एक', 'है', 'हैं', 'था', 'थे', 'थी',
  'हो', 'होता', 'होती', 'होते', 'गया', 'आया', 'दिया', 'लिए', 'साथ',
  'बाद', 'पहले', 'ऊपर', 'नीचे', 'अब', 'तब', 'वाले', 'वाली', 'वाला',
  'वालों', 'देश', 'राज्य', 'शहर', 'गांव', 'गाँव', 'जिला', 'नाम', 'पता',
  'समय', 'पैसा', 'पैसे', 'काम', 'नौकरी', 'परीक्षा', 'अंक', 'फॉर्म',
  'सरकार', 'सरकारी', 'कार्यालय', 'व्यक्ति', 'जानकारी', 'समस्या', 'सेवा',
  'विकास', 'सुरक्षा', 'शिक्षा', 'स्वास्थ्य', 'व्यापार', 'उद्योग', 'कानून',
  'अमेरिका', 'भारत', 'हिन्दी', 'हिंदी', 'अंग्रेज़ी', 'अंग्रेजी',
]);

/** Words the lexicon would like to snap to, which must not be accepted. */
const VETOED = new Set<string>(['ही', 'की', 'के', 'का', 'को', 'से', 'बड़ा', 'गलत', 'दी', 'दे', 'ले', 'रही', 'रहे', 'यही', 'वही', 'कभी']);

/**
 * Words that must never be *reached* either, because dropping a single
 * character from a mangled word lands on them. Every one of these was a false
 * positive observed against real documents: अपनी -> अबनी, खाने -> काने,
 * उपयोगी -> उपयोग, इसी -> इस, तय -> तब, लेलकन -> लेकिन, कक -> क.
 *
 * The common thread is that these are short, high-frequency words sitting one
 * edit from broken text, so they act as attractors. Being in the lexicon is not
 * enough to justify a rewrite.
 */
const VETOED_TARGETS = new Set<string>([
  'बन', 'कब', 'कन', 'मन', 'तन', 'पन', 'सन', 'हन', 'गन', 'धन', 'फन', 'वन',
  'काने', 'काना', 'खाना', 'जाना', 'नाना',
  'उपयोग', 'इस्तेमाल', 'इसी', 'उसी', 'तब', 'तय', 'तेज', 'तेन',
  'क', 'की', 'के', 'को', 'से', 'ही', 'ले', 'दे', 'दी', 'न', 'में',
  'बड़ा', 'बड़े', 'गलत', 'सकता', 'सकते', 'सकती',
  // Attractors produced by deleting one character from mangled text.
  'समें', 'सेमें', 'समे', 'खिच', 'खिचो', 'बत', 'बता', 'बते',
  'लेकी', 'लकी', 'कबना', 'कबन', 'खाना', 'काना', 'मासि', 'मास',
  'खिचा', 'तैया', 'तैय', 'खच', 'खर्चच', 'छोच', 'मासि',
  // Single letters and one-character deletions. These are reached constantly
  // because dropping a character from a mangled word lands on one: लेकन -> क,
  // खाते -> काते, भीान -> भीना. Without this they become attractors and the
  // repair starts deleting real content.
  'क', 'ख', 'ग', 'घ', 'च', 'छ', 'ज', 'झ', 'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ',
  'द', 'ध', 'न', 'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श', 'ष', 'स', 'ह',
  'काते', 'काता', 'भीना', 'कियाने', 'कियाना', 'किवाना', 'किवाने',
]);

/**
 * Preferred spelling when two candidates are equally close, which is the normal
 * case for a mangled word. The mangled form often shares a stem with a real
 * word that is *not* the intended one (लकन resembles खर्च far more closely than
 * it resembles लेकन), so ties are broken toward the likelier target rather than
 * the nearest string.
 */
const PREFERRED = new Set<string>([
  'लेकिन', 'लेकन', 'खर्च', 'मासिक', 'हिस्सा', 'बिजली', 'समझें', 'तैयार',
  'ज़रूरत', 'जरूरत', 'खाना', 'बनाना', 'लेना', 'देना', 'रखना', 'दिखाएं',
]);

/** Exported for tests. */
export function isProtected(token: string): boolean {
  return PROTECTED.has(token);
}

/** How many characters differ. Simple Levenshtein, tokens are short. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Try to repair a single token against the lexicon.
 *
 * Returns the original token unless a candidate is *clearly* better: it must be
 * a known word, closer to it than the original is, and structurally legal. When
 * nothing wins by a margin the token is left alone, because silently changing
 * text the user can see is far more damaging than leaving a typo.
 */
export function repairTokenLexical(token: string): string {
  if (!token || !isDevanagariToken(token)) return token;
  // A one-character token is almost always the result of over-trimming, and
  // has no reliable correction. Leaving it alone is safer than guessing.
  if (token.length < 3) return token;

  // Standalone entry point: apply the unconditional structural laws first, so
  // calling this directly (rather than through repairHindiLine) gives the same
  // answer. That is what turns बनायें into बनाएं, which is a law about
  // standard Hindi spelling and needs no lexicon at all.
  const structured = repairTokenStructure(token);
  if (structured !== token) return repairTokenLexical(structured);

  // A token that is already illegal Devanagari is *known to be broken*, so
  // repairing it is always an improvement. Without this the check below would
  // refuse to touch it, which is what left धीिे and लकन unrepaired.
  const structurallyBroken = findOrthographicProblems(token).length > 0;

  // Never touch a valid, recognised word. An illegal token is exempt: it cannot
  // be a correct word, so there is nothing to protect.
  if (!structurallyBroken && (isKnownWord(token) || PROTECTED.has(token))) return token;

  let best: { word: string; distance: number; score: number } | null = null;

  for (const cand of candidates(token)) {
    if (findOrthographicProblems(cand).length > 0) continue;
    const base = normalizeSuffix(cand);
    for (const form of new Set([cand, base])) {
      if (form === token) continue;
      if (!isKnownWord(form)) continue;
      // Snapping to a short, high-frequency word is almost always a false
      // positive: the edit is a coincidence, not a recovery.
      if (VETOED.has(form) || VETOED_TARGETS.has(form)) {
        // A preferred spelling is the whole point of the repair, so the veto
        // on short function words must not apply to it.
        if (!PREFERRED.has(form)) continue;
      }
      const d = editDistance(token, form);
      if (d === 0) continue;
      // Prefer the fewest changes. Among equals, prefer a word on the preferred
      // list, then the longer word (a short coincidence is far less likely to
      // be the real word).
      let score = d - (form.length >= 4 ? 0.5 : 0);
      if (PREFERRED.has(form)) score -= 1;
      if (!best || score < best.score) best = { word: form, distance: d, score };
    }
  }

  if (!best) return token;

  // Distance budget. A legal-but-unknown token may be repaired at up to two
  // edits (रलए -> लिए). An already-illegal token is known to be broken, so it
  // gets a little more room - but no more, because a wide net is what turns a
  // repair into a mangler.
  const maxDistance = token.length > 8 ? 1 : structurallyBroken ? 3 : 2;
  if (best.distance > maxDistance) return token;

  // Finally, standardise the suffix. Only when the result is still legal and
  // does not turn a known word into an unknown one.
  const standardised = normalizeSuffix(best.word);
  if (
    standardised !== best.word &&
    findOrthographicProblems(standardised).length === 0 &&
    isKnownWord(standardised)
  ) {
    return standardised;
  }
  return best.word;
}

// ---------------------------------------------------------------------------
// Line level
// ---------------------------------------------------------------------------

const isSpace = (ch: string) => /\s/.test(ch);

/** Split into [leading punctuation][core][trailing punctuation] by code point. */
function splitToken(token: string): { prefix: string; core: string; suffix: string } {
  let start = 0;
  let end = token.length;
  const isWord = (ch: string) => {
    if (isDevanagariChar(ch)) {
      // Danda and double danda are punctuation despite living in the block.
      return cp(ch) !== 0x0964 && cp(ch) !== 0x0965;
    }
    const c = cp(ch);
    return (
      (c >= 0x0041 && c <= 0x005a) ||
      (c >= 0x0061 && c <= 0x007a) ||
      (c >= 0x0030 && c <= 0x0039)
    );
  };
  while (start < end && !isWord(token[start])) start++;
  while (end > start && !isWord(token[end - 1])) end--;
  return {
    prefix: token.slice(0, start),
    core: token.slice(start, end),
    suffix: token.slice(end),
  };
}

/** Every Devanagari word in a line, punctuation stripped. */
export function extractHindiWords(text: string): string[] {
  const out: string[] = [];
  for (const part of (text || '').split(/(\s+)/)) {
    if (!part || isSpace(part)) continue;
    const { core } = splitToken(part);
    if (core.length > 1 && isDevanagariToken(core) && /[\u0900-\u097F]/.test(core)) {
      out.push(core);
    }
  }
  return out;
}

/**
 * Repair a whole line: structural fixes first (always safe), then
 * orthographic/legal corrections, then lexicon snapping, then suffix
 * normalisation.
 */
export function repairHindiLine(text: string): { text: string; changes: number } {
  if (!text || !/[\u0900-\u097F]/.test(text)) return { text, changes: 0 };

  let changes = 0;
  const parts = text.split(/(\s+)/);
  const out = parts.map((part) => {
    if (!part || isSpace(part)) return part;
    const { prefix, core, suffix } = splitToken(part);
    if (!core || !/[\u0900-\u097F]/.test(core)) return part;

    // 1. structural
    const structured = repairTokenStructure(core);
    if (structured !== core) changes++;

    // 2. + 3. orthography and lexicon
    const lexed = repairTokenLexical(structured || core);

    // 4. suffix normalisation, only when the result is still legal
    let final = lexed;
    const suffixed = normalizeSuffix(lexed);
    if (suffixed !== lexed && findOrthographicProblems(suffixed).length === 0) {
      if (!isKnownWord(lexed) || isKnownWord(suffixed)) final = suffixed;
    }

    // A token the engine could not identify at all is left exactly as found.
    // Dropping a stray consonant is a real improvement (खर्चच -> खर्च), but a
    // token reduced to a single letter is data loss, not a repair, and "क" is
    // not a word. This is the line between correcting text and mangling it.
    if ([...final].length < 2) final = core;

    if (final !== core) changes++;
    return prefix + final + suffix;
  });

  const joined = out.join('');
  return { text: joined.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, ''), changes };
}

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

/**
 * Pre-base matra: stored after its base in logical order, drawn to its left.
 *
 * ि (U+093F) and ॅ ॆ े ै ॉ ॊ ो ौ (U+0945–U+094C). ॏ (U+094F) is post-base and
 * is not one. An earlier version tested only U+093F and U+094F, so the rules
 * below never recognised a े, a ो or a ौ as pre-base at all.
 */
export function isPreBaseMatra(ch: string): boolean {
  const c = cp(ch);
  return c === 0x093f || (c >= 0x0945 && c <= 0x094c);
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
  // A pre-base matra at the very end is *normal*: it is stored after the
  // consonant it belongs to, so ति, कि, मि, दि, रि, लि, शांति all end this way.
  // Treating it as a fault marked a large slice of the language as broken, and
  // because `structurallyBroken` is what exempts a token from the known-word
  // guard, it was quietly switching off the protection those words rely on -
  // शांति was rewritten to शांत while sitting in the lexicon. It is only a
  // fault when no consonant precedes it, which is the separated-matra artefact
  // where a matra arrives as a token of its own.
  const last = chars[chars.length - 1];
  if (last && isPreBaseMatra(last)) {
    const before = chars[chars.length - 2];
    if (!before || (!isConsonant(before) && !isNukta(before))) {
      problems.push('trailing-prebase-matra');
    }
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

  // Whitespace is not a word and must be passed through untouched: the spacing
  // between two words is the only thing holding them apart.
  if (chars.every((c) => /\s/.test(c))) return token;

  // A token made only of marks carries no meaning. It is dropped rather than
  // returned empty-string, because an empty result would blank the word
  // position in the line and merge two neighbours together. pdf.js emits these
  // as pure noise from some fonts ("ो़ों" on its own, three times in sample3).
  if (chars.every((c) => isMark(c))) return '';

  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = out[out.length - 1];
    const prevMark = prev && isNukta(prev) ? out[out.length - 2] : prev;

    // A nukta belongs to a consonant and must follow one directly. These fonts
    // routinely leave it stranded after a matra, which is why बनाएं, उठाएं and
    // बताएं all arrive with a stray nukta.
    if (isNukta(ch) && prevMark && isMatra(prevMark)) {
      continue;
    }

    if (prevMark && isMatra(prevMark) && isMatra(ch)) {
      // A pre-base matra is only ever valid as the first mark of a cluster.
      if (isPreBaseMatra(ch) && !isPreBaseMatra(prevMark)) continue;
      if (ch === prevMark) continue;
      // The same vowel sign twice in a row is a doubled sign, wherever it
      // occurs. These fonts emit the second one separated by a stray nukta, so
      // the comparison is made against the mark before the nukta. "औरो़ों" is
      // "और" plus a duplicated ो; "चीजो़ों" is "चीज़ें" mangled the same way.
      if (ch === prevMark) continue;
    }

    // (the doubled-vowel-sign case is handled in the block above)
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
  //
  // The patterns below are built from explicit code points rather than written
  // as literals on purpose. A literal "ो" is trivially corrupted into U+0913
  // (the independent vowel ओ) instead of U+094B (the o-matra), and a pattern
  // built from the wrong code point silently never matches. That exact mistake
  // shipped here first, which made the whole rule dead code.
  const AA = '\u093E'; // ा
  const E = '\u090F'; // ए
  const O = '\u094B'; // ो
  const ANUS = '\u0902'; // ं
  const YA = '\u092F'; // य
  const E_MATRA = '\u0947'; // े

  // Two separate shapes turn up in these fonts and both are wrong:
  //
  //   बनायें / बढ़ायें  ->  बनाएं / बढ़ाएं   (the य is spurious)
  //   बढाएों           ->  बढ़ाएं            (the ो is a doubled vowel sign)
  //
  // The second shape is the one the extractor actually produces, and it is
  // structurally *legal* - ए followed by ो is two valid vowel signs - so no
  // orthography check catches it. Only a spelling law can.
  //
  // Anchored to a word boundary and length-guarded, because a bare global
  // pattern matched inside perfectly valid words: सही (स + ा + य + ी) was being
  // rewritten to ही.
  const joined = chars.join('');
  if (joined.length > 3) {
    return joined
      // The locative -ाओं is a different word family from the participle and
      // must be handled first, or the participle rules turn जहाों into जहाएं.
      // Standard is -ां: जहां, वहां, यहां. Both the matra (U+094B) and the
      // independent vowel (U+0913) are accepted, because these fonts emit
      // either depending on the subset.
      .replace(
        new RegExp('(जह|वह|यह|कह|कुछ|कौन)' + AA + '[\\u094B\\u0913]' + ANUS, 'g'),
        '$1' + AA + ANUS
      )
      .replace(
        new RegExp('(जह|वह|यह|कह|कुछ|कौन)[\\u094B\\u0913]' + ANUS, 'g'),
        '$1' + AA + ANUS
      )
      // ाए + ो + ं  ->  ाए + ं      (doubled vowel sign: बढाएों -> बढाएं)
      .replace(new RegExp(AA + E + O + ANUS, 'g'), AA + E + ANUS)
      // ा + ो + ं    ->  ाए + ं
      .replace(new RegExp(AA + O + ANUS, 'g'), AA + E + ANUS)
      // ा + य + े + ं -> ाए + ं       (spurious ya:   बनायें -> बनाएं)
      .replace(new RegExp(AA + YA + E_MATRA + ANUS, 'g'), AA + E + ANUS)
      .replace(new RegExp(AA + YA + E_MATRA, 'g'), AA + E)
      // ा + य + ो     ->  ाए + ं
      .replace(new RegExp(AA + YA + O, 'g'), AA + E + ANUS)
      .replace(new RegExp(AA + E + O, 'g'), AA + E)
      .replace(new RegExp(AA + O, 'g'), AA + E);
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
// Built from code points, for the reason given above: a literal "ो" silently
// becomes U+0913 rather than U+094B and the rule becomes dead code.
const AA = 'ा';
const E = 'ए';
const O = 'ो';
const ANUS = 'ं';
const YA = 'य';
const E_MATRA = 'े';
const II = 'ी';

const SUFFIX_RULES: [RegExp, string][] = [
  // The causative/perfective family is fully handled by
  // repairTokenStructure, which applies these before any lookup. They are kept
  // here as well so a token that reaches this stage already normalised is still
  // correct, and so the function is usable on its own.
  [new RegExp(AA + E + O + ANUS + '$'), AA + E + ANUS],
  [new RegExp(AA + O + ANUS + '$'), AA + E + ANUS],
  [new RegExp(AA + YA + E_MATRA + ANUS + '$'), AA + E + ANUS],
  [new RegExp(AA + YA + E_MATRA + '$'), AA + E],
  [new RegExp(AA + YA + O + '$'), AA + E + ANUS],
  [new RegExp(AA + E + O + '$'), AA + E],
  [new RegExp(AA + O + '$'), AA + E],
  // Long i: -ीएं is never right, -ीए is the feminine form.
  [new RegExp(II + E + ANUS + '$'), II + E],
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
  // Doubled-vowel-sign forms seen in sample3. Once the duplicate is removed
  // these reduce to the plain word, which the matcher can then reach.
  'औरों', 'चीजों', 'औरोँ', 'चीज़ें', 'चीजें', 'औरं',
  // High-frequency words whose corrupted forms appear in sample2. Adding the
  // correct spelling is enough: the fuzzy matcher can then reach it, because
  // these differ from the broken form by one or two substitutions.
  'यदि', 'किए', 'किये', 'संभव', 'सोंभव', 'बड़ा', 'बडा', 'महत्वपूर्ण',
  'महत्त्वपूर्ण', 'महत्वपूणच', 'उपकरण', 'उपकण', 'उपकिण', 'बंद', 'बोंद',
  'रखना', 'रखने', 'रखना', 'सामान्यतः', 'सामान्य', 'निर्धारित', 'निर्धारण',
  'खरीद', 'खरीदना', 'खरीदने', 'अलग', 'आवश्यकता', 'आवश्यक', 'बजाय',
  'लाभ', 'हानि', 'वास्तव', 'ध्यान', 'कार्यक्रम', 'सफल', 'अनुभव', 'जमा',
  'आमदनी', 'व्यय', 'बिल', 'किराया', 'ब्याज', 'EMI', 'लेना', 'देना',
  'आदत', 'आदतें', 'सुधार', 'बदलाव', 'शुरुआत', 'अंत', 'अन्त', 'लक्ष्य',
  'उद्देश्य', 'महत्व', 'आवश्यकताएं', 'कठिनाई', 'सुविधा', 'समस्या',
  'उपलब्ध', 'चुनौती', 'अवसर', 'कौशल', 'अनुभवी', 'प्रशिक्षण', 'प्रमाण',
  'सत्यापन', 'परीक्षण', 'गुणवत्ता', 'विश्वसनीय', 'विश्वास', 'आश्वासन',
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

  // Everyday vocabulary, added after auditing three real documents. Every entry
  // here is a word the engine was actively damaging: being absent from the
  // lexicon is what let the fuzzy matcher reach for a neighbour, and the
  // substitutions it chose were not repairs. समाज became सीमा (society ->
  // border), आसमान became आसान (sky -> easy), सवाल became साल (question ->
  // year), हजार became जारी (thousand), नमक became मक (salt), बहस became बस.
  // None of those originals showed a single structural or orthographic fault -
  // they were simply missing, and a missing word is indistinguishable from a
  // broken one unless the lexicon says otherwise.
  //
  // A word being listed here is what makes `isKnownWord` true, which returns
  // early and leaves the token untouched. That is the whole mechanism.
  //
  // society, world, mind, time
  'समाज', 'समाजिक', 'मन', 'मनोरंजन', 'मनोभाव', 'महत्व', 'महत्त्व', 'महत्वपूर्ण',
  'आयु', 'समय', 'अवधि', 'अवधार', 'सीमा', 'अंतर', 'अंत', 'प्रारंभ', 'अंतिम',
  // people, roles, relations
  'आदमी', 'मनुष्य', 'महिला', 'बच्चा', 'बच्चे', 'बालक', 'बालिका', 'युवा', 'बुज़ुर्ग',
  'दोस्त', 'साथी', 'पड़ोसी', 'मेहमान', 'ग्राहक', 'कर्मचारी', 'मालिक', 'निवासी',
  'रिश्ता', 'रिश्ते', 'जिम्मेदार', 'जिम्मेदारी', 'वज़िम्मेदारी', 'सहायता', 'सहायक',
  'ताकत', 'शक्ति', 'क्षमता', 'योग्यता', 'हुनर', 'प्रतिभा', 'रुचि', 'आवश्यकता',
  // body, health, feeling
  'सेहत', 'स्वास्थ्य', 'बीमारी', 'दर्द', 'आराम', 'नींद', 'थकान', 'कमजोरी',
  'आँख', 'कान', 'नाक', 'मुँह', 'दाँत', 'बाल', 'चेहरा', 'पेट', 'हाथ', 'पैर',
  // food and household
  'नमक', 'चीनी', 'चाय', 'कॉफ़ी', 'दूध', 'दही', 'मक्खन', 'पनीर', 'मसाला', 'मसाले',
  'आटा', 'तेल', 'गुड़', 'रोटी', 'रोटियाँ', 'दाल', 'चावल', 'सब्ज़ी', 'सब्जी',
  'फल', 'फूल', 'मिठाई', 'कपड़ा', 'कपड़े', 'जूता', 'जूते', 'चादर', 'तकिया',
  'बाल्टी', 'मछली', 'अंडा', 'मांस', 'शाकाहारी', 'सात्विक',
  // nature and place
  'पेड़', 'पत्ता', 'पत्तियाँ', 'नदी', 'नाला', 'तालाब', 'झील', 'पहाड़', 'पहाड़ी',
  'जंगल', 'रेगिस्तान', 'आकाश', 'सूरज', 'चाँद', 'तारा', 'तारे', 'बादल', 'बर्फ़',
  'बारिश', 'बरसात', 'मौसम', 'धूप', 'छत', 'दीवार', 'मंज़िल', 'आँगन', 'बगीचा',
  'पड़ोस', 'मार्केट', 'बाज़ार', 'दुकान', 'ऑफ़िस', 'दफ़्तर', 'कंपनी', 'फ़ैक्ट्री',
  'स्कूल', 'कॉलेज', 'विश्वविद्यालय', 'यूनिवर्सिटी', 'अस्पताल', 'पार्क', 'एयरपोर्ट',
  'स्टेशन', 'पुलिस', 'थाना', 'कोर्ट', 'मंदिर', 'मस्जिद', 'गिरजा', 'श्मशान',
  // time
  'आज', 'कल', 'परसों', 'अभी', 'तुरंत', 'जल्दी', 'देर', 'सुबह', 'दोपहर', 'शाम',
  'रात', 'रोज़', 'रोज़ाना', 'हर दिन', 'सप्ताह', 'सप्ताहिक', 'महीना', 'साल',
  'घंटा', 'घंटे', 'मिनट', 'सेकंड', 'सदी', 'शताब्दी', 'दशक', 'सत्र', 'सेमेस्टर',
  // money, work, business
  'कीमत', 'मूल्य', 'मूल्यांकन', 'खर्च', 'आय', 'बचत', 'कर्ज़', 'कर्जा', 'ब्याज',
  'बजट', 'खरीद', 'खरीदना', 'बिक्री', 'बेचना', 'मुनाफ़ा', 'नुक़सान', 'आमदनी',
  'रोज़मर्रा', 'रोज़मरा', 'नौकरी', 'पेशा', 'व्यवसाय', 'व्यापार', 'व्यापारी',
  'फ़ैसला', 'फैसला', 'सरोकार', 'कानून', 'अधिकार', 'ज़िम्मेदारी', 'शर्त', 'शर्तें',
  // documents, study, work
  'दस्तावेज़', 'दस्तावेज', 'फ़ाइल', 'फाइल', 'फ़ॉर्म', 'फॉर्म', 'आवेदन', 'रिज्यूमे',
  'सीवी', 'प्रमाण', 'साक्ष्य', 'रिकॉर्ड', 'रिपोर्ट', 'नोट', 'नोट्स', 'पत्र', 'ईमेल',
  'पढ़ाई', 'पठन', 'लेखन', 'कक्षा', 'टीचर', 'पाठ्यक्रम', 'डिग्री', 'कोर्स', 'प्रश्न',
  'उत्तर', 'प्रश्नोत्तरी', 'अभ्यास', 'टेस्ट', 'परीक्षा', 'अंक', 'गणित', 'विज्ञान',
  // abstract nouns that the matcher kept overwriting
  'ताकत', 'बात', 'बातचीत', 'चर्चा', 'सलाह', 'सुझाव', 'मत', 'राय', 'फ़ैसला',
  'उदाहरण', 'कारण', 'नतीजा', 'परिणाम', 'फ़ायदा', 'नुक़सान', 'मौका', 'योजना',
  'लक्ष्य', 'उपाय', 'तरीका', 'तरीके', 'उपलब्धता', 'ज़रूरत', 'ज़रूरतें',
  // common adjectives
  'आसान', 'कठिन', 'मज़बूत', 'मजबूत', 'कमज़ोर', 'गरम', 'ठंडा', 'सुंदर', 'महँगा',
  'सस्ता', 'मुफ़्त', 'खास', 'ज़रूरी', 'सही', 'गलत', 'साफ़', 'पक्का', 'अस्थायी',
  'स्थायी', 'वास्तविक', 'सामान्य', 'निजी', 'सार्वजनिक', 'वैकल्पिक', 'उचित',
  'लम्बा', 'लंबा', 'लंबे', 'चौड़ा', 'संकीर्ण', 'गहरा', 'ऊँचा', 'नीचा', 'दूर',
  'पास', 'साफ़-सुथरा', 'व्यस्त', 'शांत', 'शांति', 'शान्ति', 'स्वस्थ', 'ख़ुश', 'दुखी', 'गुस्सा',
  // adverbs and connectives
  'बहुत', 'काफ़ी', 'काफी', 'लगभग', 'केवल', 'सिर्फ', 'फिर', 'तब', 'अब', 'जब',
  'ताकि', 'इसलिए', 'इसलिये', 'हालांकि', 'जबकि', 'परंतु', 'फिर भी', 'इसके अलावा',
  // Second pass. Auditing the changes the first pass left behind showed a
  // pattern worth naming: the words that survived were not the rare ones, they
  // were the everyday ones - numbers, body parts, common nouns - because those
  // are the words a speaker reaches for most and the ones the old list had no
  // reason to include. Every entry here was being rewritten to a neighbour.
  'हजार', 'लाख', 'करोड़', 'सौ', 'दस', 'बीस', 'पचास', 'सौ', 'सत्तर', 'नब्बे',
  'आसमान', 'जगह', 'जगहें', 'बहस', 'मदद', 'ताकत', 'सहायता', 'पालन', 'पालन',
  'तथा', 'सवाल', 'सवालों', 'जवाब', 'जनता', 'लगातार', 'भरतारा', 'समान',
  'उतनी', 'इतनी', 'जितनी', 'उतना', 'इतना', 'जितना', 'समझकर', 'रहकर',
  'कराती', 'करते', 'करती', 'करना', 'करने', 'करें', 'करो', 'करेंगे',
  'परेशानी', 'परेशान', 'सुख', 'दुख', 'रास्ता', 'राहत', 'सहारा',
  'बात', 'बातें', 'बातचीत', 'चर्चा', 'सलाह', 'सुझाव', 'मत', 'राय', 'फ़ैसला',
  'सीमा', 'सीमांत', 'अंतर', 'रिश्ता', 'रिश्ते', 'बंधन', 'जंजीर',
  'दुनिया', 'देश', 'गांव', 'गाँव', 'शहर', 'कस्बा', 'मोहल्ला', 'इलाका',
  'नदी', 'नदीन', 'रेगिस्तान', 'मिट्टी', 'रेत', 'पथरी', 'पहाड़', 'पहाड़ी',
  'सूरज', 'चाँद', 'तारा', 'आकाश', 'गगन', 'धरती', 'पृथ्वी', 'जल', 'अग्नि',
  'कानून', 'अधिनियम', 'संविधान', 'व्यवस्था', 'प्रणाली', 'तंत्र', 'संरचना',
  'उत्पादन', 'उपभोग', 'आपूर्ति', 'मांग', 'बाज़ार', 'मूल्य', 'मानक',
  'शैक्षणिक', 'व्यावसायिक', 'तकनीकी', 'आधुनिक', 'पारंपरिक', 'सामाजिक',
  'आर्थिक', 'राजनीतिक', 'सांस्कृतिक', 'धार्मिक', 'व्यक्तिगत',
  'अभ्यास', 'प्रशिक्षण', 'प्रशिक्षक', 'उपस्थिति', 'गैरहाज़िरी',
  'अनुशासन', 'आदत', 'व्यवहार', 'चरित्र', 'स्वभाव', 'उद्देश्य', 'लक्ष्य',
  'प्राथमिकता', 'आवश्यकता', 'संभावना', 'जोखिम', 'लाभ', 'हानि',
  'उपयोगिता', 'प्रासंगिकता', 'विश्वसनीयता', 'गुणवत्ता',
  'संग्रह', 'संचय', 'वितरण', 'भंडारण', 'विपणन', 'प्रचार',
  // Third pass. The words the second pass left still being rewritten were the
  // everyday verbs and the ordinals - the two groups a topical list forgets
  // first, because neither is a "topic". दूसरे became दूरसे, बचना became बेचना
  // (save -> sell), संग्रहीत became संग्रहती.
  'दूसरे', 'दूसरा', 'दूसरी', 'तेज़', 'तेज', 'रूई', 'नींद', 'बचना', 'बचाए',
  'बेचना', 'बेचें', 'खरीदना', 'खरीदें', 'संग्रहित', 'संग्रहीत', 'संचयित',
  'रखना', 'रखें', 'रखेंगे', 'लगाना', 'लगातार', 'लगेगा', 'भेजना', 'बुलाना',
  'सुनना', 'सुनें', 'देखना', 'देखें', 'पूछना', 'पूछें', 'ढूंढना', 'ढूंढें',
  'खोजना', 'खोजें', 'खोजते', 'खेलना', 'खेलें', 'चुनना', 'चुनें', 'तय करना',
  'सीखना', 'सिखाना', 'समझाना', 'बताना', 'बताएं', 'फैसला करना', 'रोकना',
  'रोकें', 'शुरू करना', 'शुरू', 'रुकना', 'रुकें', 'जोड़ना', 'घटाना', 'बढ़ाना',
  'कमाना', 'कमाए', 'बचाना', 'बचाएं', 'सफाई', 'धोना', 'सुविधा', 'तकलीफ',
  'परेशानी', 'आरामदायक', 'सुविधाजनक', 'ज़रूरतमंद', 'उपयोगी', 'फ़ायदेमंद',
  'प्रभावी', 'कुशल', 'चतुर', 'मेहनती', 'ईमानदार', 'वफ़ादार', 'ज़िम्मेदार',
  // Adding an inflected form puts its base form at risk, because the matcher
  // will happily stretch a correct word onto the longer one: मेहनत became
  // मेहनती, समाप्त became समाप्ति. Both bases are listed so they are recognised
  // and returned untouched. This is the standing cost of a larger lexicon, and
  // it is why the audit is run over whole documents rather than a word list.
  'मेहनत', 'मेहनती', 'समाप्त', 'समाप्ति', 'शुरुआत', 'शुरुआती',
  // The same trap, caught by the audit on sample1 and sample3: adding "बेचना"
  // put "बेचें" one matra away from "बचें" (save), and the matcher reached for it.
  'बचें', 'बचे', 'बची', 'बचता', 'बचती', 'बचते',
]);

/**
 * Verb stems, checked before the suffix strip.
 *
 * Hindi verbs inflect heavily, and a stem list is what stops the fuzzy matcher
 * from "correcting" correct words. Without it "रखें" was unknown, so the
 * matcher deleted its matra and produced "रकें"; "रहें" became "हरें"; "हकसके"
 * became "केसके". Those are not repairs, they are vandalism, and they only
 * surfaced on real documents - never on a test list written from the same
 * assumptions as the code that reads them.
 */
const VERB_STEMS = new Set<string>([
  'रख', 'रह', 'कर', 'हो', 'जा', 'आ', 'दे', 'ले', 'देख', 'बन', 'कह', 'बत',
  'सीख', 'समझ', 'लिख', 'पढ़', 'चाह', 'निकल', 'चल', 'लग', 'मिल', 'ठीक',
  'शुरू', 'खत', 'कम', 'बढ़', 'घट', 'बदल', 'जोड़', 'हट', 'रोक', 'भेज',
  'लौट', 'आत', 'उठ', 'बैठ', 'सो', 'जाग', 'सुन', 'होत', 'आन', 'देन',
  'मान', 'पान', 'खोज', 'इस्तेमाल', 'तैयार', 'जुड़', 'लग', 'कट', 'गुजर',
  'चल', 'टिक', 'रुक', 'आ', 'जान', 'पढ़', 'सुन', 'देख', 'सीख', 'भूल',
  'चुन', 'गिन', 'जोड़', 'घट', 'बढ़', 'खा', 'पी', 'साँ', 'साफ', 'धो',
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

/**
 * Does `repaired` drop anything from `original` that it had no business
 * dropping?
 *
 * A consonant vanishing is the clearest false-positive signature, but matras
 * matter too: "रखे" was being reduced to the bare stem "रख" because the stem
 * is in the lexicon, and a consonant-only check cannot see that the vowel sign
 * was deleted. Losing a matra is legitimate in exactly one case - a *spurious*
 * pre-base matra that a structural rule has already removed - so the guard
 * simply refuses any shortening, and lets the structural pass handle matra
 * removal before this is ever consulted.
 */
/** Does `ch` appear twice in a row in `s`, ignoring any matras between? */
function hasAdjacentDuplicate(s: string, ch: string): boolean {
  const chars = [...s].filter((c) => isConsonant(c));
  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === ch && chars[i - 1] === ch) return true;
  }
  return false;
}

function losesCharacters(original: string, repaired: string): boolean {
  const consonantsOf = (s: string) =>
    [...s].filter((ch) => isConsonant(ch)).sort().join('');

  const before = consonantsOf(original);
  const after = consonantsOf(repaired);
  if (!before) return false;

  // A consonant disappeared. Dropping an *adjacent duplicate* is legitimate -
  // these fonts repeat a glyph, and खर्चच -> खर्च is a repair, not a loss. Any
  // other consonant must survive.
  const counts = (s: string) => {
    const m = new Map<string, number>();
    for (const ch of s) m.set(ch, (m.get(ch) ?? 0) + 1);
    return m;
  };
  const beforeCounts = counts(before);
  const afterCounts = counts(after);
  for (const [ch, n] of beforeCounts) {
    const kept = afterCounts.get(ch) ?? 0;
    if (kept === n) continue;
    if (kept < n - 1) return true;
    // A single extra occurrence may be dropped, but only if the original really
    // had it adjacent, which is what identifies a duplicated glyph.
    if (n >= 2 && !hasAdjacentDuplicate(original, ch)) return true;
    // Losing a character outright needs the same justification. Without this,
    // any correct word that happened to be one character short of a lexicon
    // entry was silently shortened - and all of these were observed doing it on
    // a real document, with no fault of their own to show for it:
    //
    //   सवाल -> साल     (question -> year)     नमक -> मक      (salt)
    //   बहस -> बस      (debate -> but)        तथा -> था      (and -> was)
    //   समाज -> सीमा    (society -> border)     पालन -> पान    (upbringing)
    //   आसमान -> आसान  (sky -> easy)           अंतर -> अंत    (difference)
    //   जगह -> गही     (place)                 लगातार -> लगाता
    //
    // A duplicated glyph is the one case where a character legitimately
    // disappears, and the check above already covers exactly that.
    if (kept === 0) return true;
  }

  // Losing characters is forbidden, with one exception: dropping a duplicated
  // glyph shortens the word and is exactly the repair we want (खर्चच -> खर्च).
  // The count was already checked above, so this only fires when a matra went
  // missing as well.
  if ([...repaired].length < [...original].length) {
    const dropped = [...original].length - [...repaired].length;
    if (dropped > 1) return true;
    if (!(after.length < before.length)) return true;
  }

  // No invented consonants. This is the rule that matters, and it is what
  // separates a repair from a guess:
  //
  //   ललए  -> लिए     after {ल}  is a subset of before {ल, ल}   allowed
  //   खर्चच -> खर्च    after {ख,र,च} subset of {ख,र,च,च}      allowed
  //   बढाएं -> बडाएं   after has ड, which the original never had  blocked
  //
  // The last one matters because the two spellings are the same length, so no
  // length or count check catches it, and the word was never broken to begin
  // with. Substituting a consonant is exactly the guess we refuse to make.
  for (const ch of new Set(after)) {
    if (!before.includes(ch)) return true;
  }

  return false;
}

/** Is this token a known word, an inflected form, or a known stem plus ending? */
export function isKnownWord(token: string): boolean {
  if (LEXICON.has(token)) return true;
  if (VERB_STEMS.has(token)) return true;
  for (const s of STRIPPABLE) {
    if (token.length > s.length + 1 && token.endsWith(s)) {
      const stem = token.slice(0, -s.length);
      if (LEXICON.has(stem) || VERB_STEMS.has(stem)) return true;
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
  // Short words one matra away from a lexicon feminine form. "किन" is two
  // characters from "किनी" and was being rewritten to it, which is exactly the
  // silent damage this list exists to prevent - the user cannot tell that
  // anything happened. "जरूर" is a complete word in its own right and was being
  // stretched to "जरूरी" by the same mechanism.
  'किन', 'जरूर', 'कुछ', 'यहाँ',
  'सरकार', 'सरकारी', 'कार्यालय', 'व्यक्ति', 'जानकारी', 'समस्या', 'सेवा',
  'विकास', 'सुरक्षा', 'शिक्षा', 'स्वास्थ्य', 'व्यापार', 'उद्योग', 'कानून',
  'अमेरिका', 'भारत', 'हिन्दी', 'हिंदी', 'अंग्रेज़ी', 'अंग्रेजी',
]);

/** Words the lexicon would like to snap to, which must not be accepted. */
const VETOED = new Set<string>(['ही', 'की', 'के', 'का', 'को', 'से', 'बड़ा', 'गलत', 'दी', 'दे', 'ले', 'रही', 'रहे', 'यही', 'वही', 'कभी']);

/**
 * Single-glyph misreadings, keyed by the form the PDF's ToUnicode table
 * produces instead of the word that was drawn.
 *
 * These are not structural faults. Every entry is a legal Devanagari syllable, so
 * no amount of orthographic checking can tell that it is wrong - nothing in the
 * codepoints says "हकन" was set as "किन". The only evidence is that one side is
 * a Hindi word and the other is not, and that is what this table encodes.
 *
 * The source documents substitute ह for क at the start of a syllable (किन,
 * किसके, किया, हिसाब all arrive with a leading ह), and they turn a final ल into
 * a matra (इस्तेमाल arrives as इस्तेमाि). Both are per-subset ToUnicode faults
 * and neither is derivable, so they are listed rather than inferred.
 *
 * Every key MUST be a form that is not a Hindi word. A misreading that collides
 * with a real word cannot be corrected this way, because the correction would
 * damage correct text; those are handled by PHRASE_FIXES, which can see the
 * neighbouring words.
 */
const MISREADINGS: Record<string, string> = {
  हकन: 'किन', // "समय किन चीजों का ध्यान रखें"
  हकसके: 'किसके', // "1099 Form किसके लिए होता है"
  हकसी: 'किसी', // "Bank Details किसी Unknown Person को Share न करें"
  हकया: 'किया', // "Credit Check क्यों किया जाता है"
  हहसाब: 'हिसाब', // "हर Website का हिसाब"
  पहिे: 'पहले', // "सबसे पहले Bank Account Open करें"
  इस्तेमाि: 'इस्तेमाल', // "Apps का इस्तेमाल"
  खचच: 'खर्च', // "खाने का खर्च कैसे कम करें"
  ललए: 'लिए', // "रहने वालों के लिए"
  // sample6 substitutes व or ह for a leading क or हि, and swaps ो/ी for य.
  // The no-character-loss guard now refuses all of these - correctly, since on
  // its own it cannot tell a dropped व from a real repair - so the readings are
  // pinned here instead. Each was confirmed from the sentence it appears in.
  वकया: 'किया', // "Credit Check क्यों किया जाता है"
  वशक्षा: 'शिक्षा', // "शिक्षा का महत्व"
  वशक्षक: 'शिक्षक', // "शिक्षक की भूमिका"
  वहस्सा: 'हिस्सा', // "हिस्सा पूछें"
  वहंदी: 'हिंदी', // "हिंदी में"
  वपता: 'पता', // "पता चलेगा"
  कयई: 'कोई', // "कोई भी"
  दुवनया: 'दुनिया', // "दुनिया में"
  खयजना: 'खोजना', // "नौकरी खोजना"
  खयजने: 'खोजने', // "नौकरी खोजने"
  खयजते: 'खोजते', // "नौकरी खोजते"
  खयजें: 'खोजें', // "कैसे खोजें"
  खयलना: 'खेलना', // "खेलना"
  खयलने: 'खेलने', // "खेलने"
  खयलें: 'खेलें', // "खेलें"
  रयटी: 'रोटी', // "रोटी"
  दयपहर: 'दोपहर', // "दोपहर"
  ययजना: 'योजना', // "योजना"
  पारंपररक: 'पारंपरिक', // "पारंपरिक"
  दूसरे: 'दूसरे',
  हयता: 'हीता',
  हयती: 'हीती',
  हयते: 'हीते',
  हयना: 'हीना',
  हयने: 'हीने',
  गमय: 'गया',
  दस्तािेज: 'दस्तावेज़',
  संभािना: 'संभावना',
};

/**
 * The corrected spellings are protected from the fuzzy matcher as well.
 *
 * This is not belt-and-braces. pdfRenderer applies the table per piece, so by
 * the time repairHindiLine runs, "हकसके" has already become "किसके" - a token
 * that is no longer in the table and looks like any other unknown word. The
 * matcher duly improved it to "किके", dropping the स. Anything the table
 * produces is curated, so it is off limits to the guesser.
 */
for (const corrected of Object.values(MISREADINGS)) PROTECTED.add(corrected);

/**
 * Corrections that need the neighbouring words to be safe.
 *
 * "हिए" is a real Hindi word - a plural-honorific form of "है", as in "ये लोग
 * हिए" - so rewriting it to "लिए" on its own would damage correct text. But a
 * postposition followed by "हिए" is not a phrase anyone writes: "के लिए",
 * "किसके लिए", "इसके लिए" all want "लिए". Sample3 draws "के लिए" and the
 * ToUnicode table returns "के हिए", which is how the word the user reported as
 * turning into "हिए" actually arose.
 *
 * The postposition is matched in its attached forms too, since the documents
 * write "किसके लिए" as often as "के लिए". Applied to the joined line rather than
 * to single tokens, which is the whole point: the same word is left alone when
 * nothing supports the change.
 */
const PHRASE_FIXES: Array<[RegExp, string]> = [
  // "के हिए" / "किसके हिए" / "इसके हिए" -> the same with "लिए".
  [/(^|\s)(\S*के)(\s+)हिए(?=\s|$)/g, '$1$2$3लिए'],
  [/(^|\s)(\S*के)(\s+)हिये(?=\s|$)/g, '$1$2$3लिये'],
];

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

  // A curated misreading wins outright, at every entry point.
  //
  // These are verified readings of one specific font's damage, and the guards
  // below exist to *stop* the engine rewriting tokens it has no evidence about.
  // Pointing one of those guards at a table entry has the guard working against
  // the only thing that actually knows the answer: रलए and हलए are near लिए only
  // in the sense that both of them are wrong, and no amount of character
  // accounting can say which one the page meant.
  const misread = applyMisreadings(token);
  if (misread !== token) return misread;

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

  // Never *lose* a character when repairing a structurally legal token.
  //
  // Every false positive seen on real documents was of this shape: the matcher
  // deleted a matra or a consonant to reach a lexicon entry. हकसके is five code
  // points and केसके is also five - one ह became के - so comparing lengths was
  // not enough. The only reliable test is that the repair is not allowed to be
  // shorter *or* to have lost a character, so the original's consonant skeleton
  // has to survive.
  if (!structurallyBroken && losesCharacters(token, best.word)) return token;

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
/**
 * The "spurious consonant in front of लिए" family.
 *
 * Every document in this set writes लिए with one extra consonant ahead of it, and
 * which consonant varies by subset: ललए, वलए, रलए, हलए. No two of those are two
 * characters from each other, so the fuzzy matcher cannot relate them and an
 * exact-match table would need a fresh entry per document.
 *
 * `<consonant> ल ए` is not a Hindi word and लिए is, so the substitution rests on
 * the same evidence the table's entries do.
 */
const LIYE_WITH_PREFIX = /^[क-ह]लए$/;

/**
 * Apply the known single-glyph misreadings to a token.
 *
 * Exported because the ordering matters. The structural tier drops a pre-base
 * matra that follows another matra, which is right in general but destroys
 * "इस्तेमाि" - the trailing ि there is not a stray mark, it is a mis-mapped ल.
 * Since pdfRenderer runs the structural pass per styled piece *before* the line
 * ever reaches repairHindiLine, the table has to be consulted there too, or the
 * consonant it needs to restore is already gone by the time the line is read.
 */
export function applyMisreadings(token: string): string {
  const exact = MISREADINGS[token];
  if (exact) return exact;
  if (LIYE_WITH_PREFIX.test(token)) return 'लिए';
  return token;
}

export function repairHindiLine(text: string): { text: string; changes: number } {
  if (!text || !/[\u0900-\u097F]/.test(text)) return { text, changes: 0 };

  let changes = 0;
  const parts = text.split(/(\s+)/);
  const out = parts.map((part) => {
    if (!part || isSpace(part)) return part;
    const { prefix, core, suffix } = splitToken(part);
    if (!core || !/[\u0900-\u097F]/.test(core)) return part;

    // 0. known single-glyph misreadings.
    //
    // This has to run *before* the structural tier. "इस्तेमाि" is repaired
    // structurally by dropping the trailing matra, which yields "इस्तेमा" -
    // after which the intended "इस्तेमाल" is no longer reachable, because the
    // matra that needed to become a ल is already gone. Reading the table first
    // keeps the consonant the font actually drew.
    //
    // A hit is taken verbatim and skips every later stage. The table is curated
    // ground truth, and the fuzzy matcher would otherwise try to improve it:
    // "किसके" is four characters from "किके", one edit away, and lost the स
    // doing it. Letting a guess overrule the table reintroduces exactly the kind
    // of silent damage this module exists to prevent.
    const misread = applyMisreadings(core);
    if (misread !== core) {
      changes++;
      return prefix + misread + suffix;
    }
    const read = core;

    // 1. structural
    const structured = repairTokenStructure(read);
    if (structured !== read) changes++;

    // 2. + 3. orthography and lexicon
    const lexed = repairTokenLexical(structured || read);

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
    if (final && [...final].length < 2) final = read;

    // A token that was only combining marks is noise with no recoverable
    // content. Whitespace is never treated as noise, since it is the only
    // thing keeping two words apart.
    if (final === '' && core.trim() !== '') return '';

    if (final !== core) changes++;
    return prefix + final + suffix;
  });

  // Re-join, tidying only where a token actually disappeared.
  //
  // A blanket "collapse runs of spaces, strip the trailing one" pass looks
  // harmless but destroys real information. The PDF's own separators are the
  // only thing holding two words apart - in sample2, 328 of the 728 text items
  // are nothing but a space - and pdfRenderer trims the finished line anyway.
  // So the spacing is left byte-identical unless a dropped token left two
  // separators sitting next to each other.
  const kept: string[] = [];
  let dropped = false;
  for (const part of out) {
    if (part === '') {
      dropped = true;
      continue;
    }
    if (dropped && kept.length && isSpace(kept[kept.length - 1]) && isSpace(part)) {
      kept[kept.length - 1] = part;
    } else {
      kept.push(part);
    }
    dropped = false;
  }
  const tidied = kept.join('');

  // Context-sensitive corrections, applied last, to the tidied line.
  //
  // These are the repairs a token cannot make on its own. "हिए" is a real
  // Hindi word, so nothing about the token itself says it is wrong; only the
  // postposition in front of it reveals that the document drew "लिए". Applying
  // this per token would rewrite "ये लोग हिए" as well, so it has to see the
  // whole line.
  let result = tidied;
  for (const [pattern, replacement] of PHRASE_FIXES) {
    const next = result.replace(pattern, replacement);
    if (next !== result) {
      changes++;
      result = next;
    }
  }

  return { text: result, changes };
}

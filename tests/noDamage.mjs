// Damage sweep: correct, ordinary Hindi words that must survive untouched.
// Deliberately broad and drawn from everyday vocabulary rather than from the
// lexicon, so it also catches words the lexicon happens not to carry.
import { repairDevanagari } from '../app/lib/devanagari.ts';
import { repairTokenLexical, repairHindiLine, applyMisreadings } from '../app/lib/hindiRepair.ts';

const piece = (w) => {
  const read = applyMisreadings(w);
  return read !== w ? read : repairDevanagari(w).text;
};

const MUST_SURVIVE = `समाज आसमान मदद हजार लाख करोड़ कपड़े कपड़ा लगातार कीमत अंतर बड़ा बड़ी बड़े
तथा नमक पालन जगह बहस पनीर उतनी इतनी समझकर खास जनता सस्ता साबुन समुद्र सत्यता विद्यालय
योग्यता जिम्मेदार सहायता ताकत रिश्ता रिश्ते फैसला सवाल सवालों जवाब उपाय तरीका फ़ाइल
मेहनत समाप्त शांति शांत मेरा तुम्हारा हमारा उसका उनका किसका कौन क्या कब क्यों कैसे कहाँ
पानी खाना दूध चाय नमक सब्ज़ी फल मक्खन पनीर रोटी दाल चावल गुड़ आटा तेल मसाला
पेड़ पत्ता फूल नदी पहाड़ जंगल रेगिस्तान सूरज चाँद तारा बादल बारिश मौसम
आज कल अभी तुरंत जल्दी देर सुबह दोपहर शाम रात रोज़ हर दिन सप्ताह महीना साल
घंटा मिनट सेकंड शताब्दी दशक सेमेस्टर वर्ष मास तिमाही
आदमी महिला बच्चा बच्चे दोस्त साथी पड़ोसी मेहमान ग्राहक कर्मचारी मालिक पिता माता भाई बहन
घर कमरा गाँव शहर देश विदेश राज्य जिला शहर बाज़ार दुकान ऑफ़िस कंपनी स्कूल कॉलेज अस्पताल
बैंक खाता ब्रेक बिल EMI ब्याज चालान EMI बजट खरीद बिक्री मुनाफ़ा नुक़सान
डॉक्टर नर्स इंजीनियर शिक्षक टीचर किसान व्यापारी मज़दूर
छोटा बड़ा नया पुराना पहला दूसरा तीसरा अच्छा बुरा साफ़ गलत आसान कठिन मज़बूत कमज़ोर
सुंदर महँगा सस्ता मुफ़्त लंबा छोटा ऊँचा नीचा गहरा दूर पास
बहुत कम ज़्यादा सब कुछ सभी हर कोई लगभग केवल सिर्फ
जानना जाने आना आने करना करने रखना रखें देना लेना देखना सुनना पूछना समझना पढ़ना लिखना
खोजना खेलना चुनना बनाना बताना सीखना पीना खाना सोना उठना बैठना
कब जब तब यदि अगर लेकिन परंतु इसलिए क्योंकि इसलिए
रिश्ता जरूरत मौका अवसर योजना लक्ष्य उपाय तरीका उदाहरण कारण नतीजा परिणाम फ़ायदा
मैं तुम आप हम वह यह कौन जो कि जिस जिन उनके उनकी इसके इसकी
कल बीता आज वाला वाली वाले वालों वाला जैसा जैसे सा सी से
बुरा भला अच्छा मतदान सरकार प्रधानमंत्री राष्ट्रपति मंत्री अधिकारी कर्मचारी
`.split(/\s+/).filter(Boolean);

let bad = 0;
for (const w of MUST_SURVIVE) {
  const structural = piece(w);
  if (structural !== w) {
    bad++;
    console.log('FAIL struct ', w, '->', structural);
    continue;
  }
  const out = repairHindiLine(structural).text;
  if (out !== w) {
    bad++;
    console.log('FAIL lexical', w, '->', out, '| token:', repairTokenLexical(w));
  }
}
console.log(`${MUST_SURVIVE.length} words checked, ${bad} damaged`);
process.exit(bad ? 1 : 0);

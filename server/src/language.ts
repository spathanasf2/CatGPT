// Which language a message is in, so the prompt can name it. Measured 2026-09-23: told only "reply
// in the human's language", gemini-2.5-flash-lite answered French, German and Japanese in English
// nearly every time; told "reply in French", it complied every time. No dependency -- scripts give
// most languages away outright, and for Latin-alphabet ones a handful of very common words plus
// telltale accents is enough for the short, casual messages this app gets. Returns null for English
// (the default -- nothing added to the prompt) and "unknown" when it can't tell.

const SCRIPTS: [RegExp, string][] = [
  [/[぀-ヿ]/, "Japanese"], // hiragana/katakana before the shared CJK ideographs
  [/[가-힯]/, "Korean"],
  [/[一-鿿]/, "Chinese"],
  [/[Ѐ-ӿ]/, "CYRILLIC"],
  [/[؀-ۿ]/, "ARABIC"],
  [/[֐-׿]/, "Hebrew"],
  [/[Ͱ-Ͽ]/, "Greek"],
  [/[฀-๿]/, "Thai"],
  [/[ऀ-ॿ]/, "Hindi"],
];

const WORDS: Record<string, string[]> = {
  English: "the a an is are you i to and it my your what who do don't not it's i'm we this that for with on in of good dinner".split(" "),
  Spanish: "el la los las que y en un una es no por para con se lo mi tu te hoy pero quieres qué cómo está estás gracias hola sí muy perro gato bueno".split(" "),
  French: "le la les des du et est un une je tu il elle pas ne pour dans avec ça qui que mon ton ce soir bonjour merci oui très sera tu es".split(" "),
  German: "der die das und ist nicht ein eine ich du er sie es mit für auf den dem wer wie was ja nein guter heute bitte danke hallo".split(" "),
  Portuguese: "o os as que e em um uma é não por para com você eu meu minha hoje obrigado obrigada olá sim muito está cachorro gato".split(" "),
  Italian: "il lo gli di che è un una non per con io mi ti oggi ciao grazie sì molto sei cane gatto".split(" "),
  Dutch: "het een en is niet ik je jij wij met voor op van dat wat wie hoi dank ja nee goed vandaag".split(" "),
};

// Characters that only (or mostly) one of the Latin-alphabet languages uses. Letters shared across
// them (é, ê, ô, à, ç...) are deliberately left out -- they made Portuguese and Vietnamese messages
// tie with French.
const ACCENTS: [RegExp, string][] = [
  [/[ñ¿¡]/, "Spanish"],
  [/[ãõ]/, "Portuguese"],
  [/[äöüß]/, "German"],
  [/[ăđơưẠ-ỹ]/, "Vietnamese"],
  [/[ëîïûœ]/, "French"],
  [/[ìò]/, "Italian"],
];

export function detectLanguage(text: string): string | null {
  for (const [re, lang] of SCRIPTS) {
    if (!re.test(text)) continue;
    if (lang === "CYRILLIC") return /[їєіґ]/i.test(text) ? "Ukrainian" : "Russian";
    if (lang === "ARABIC") return /[پچژگ]/.test(text) ? "Persian" : "Arabic";
    return lang;
  }
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^\p{L}']+/u).filter(Boolean);
  const scores: Record<string, number> = {};
  for (const [lang, words] of Object.entries(WORDS)) scores[lang] = tokens.filter((t) => words.includes(t)).length;
  for (const [re, lang] of ACCENTS) if (re.test(lower)) scores[lang] = (scores[lang] ?? 0) + 2;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0]!;
  const runnerUp = ranked[1]?.[1] ?? 0;
  if (bestScore === 0) return /[^\x00-\x7f]/.test(text) ? "unknown" : null;
  if (bestScore === runnerUp) return best === "English" || ranked[1]![0] === "English" ? null : "unknown";
  return best === "English" ? null : best;
}

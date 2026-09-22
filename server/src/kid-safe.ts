// Real animal words that sound rude when a kid reads a reply out loud (Frank, 2026-09-22: "don't
// want kids saying that out loud in front of their parents' friends"). The prompt asks the model to
// avoid them; this is the guarantee, applied to every reply and to history echoed back into the
// prompt (chats saved before this existed may still contain them). Add to the list, not the prompt.
const SWAPS: [RegExp, (match: string) => string][] = [
  [/\bnicker(s|ed|ing)?\b/gi, (m) => ({ s: "whinnies", ed: "whinnied", ing: "whinnying" })[suffix(m, "nicker")] ?? "whinny"],
  [/\bpussycats?\b/gi, (m) => (/s$/i.test(m) ? "kitties" : "kitty")],
  [/\bpussy\b/gi, () => "kitty"],
  [/\bhorny\b/gi, () => "horned"],
];

function suffix(match: string, stem: string): string {
  return match.slice(stem.length).toLowerCase();
}

// Keep the original's shouting/capitalization: "NICKER!" -> "WHINNY!", "Nicker" -> "Whinny".
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && /[A-Z]/.test(original)) return replacement.toUpperCase();
  if (/^[A-Z]/.test(original)) return replacement[0]!.toUpperCase() + replacement.slice(1);
  return replacement;
}

export function kidSafe(text: string): string {
  return SWAPS.reduce((out, [pattern, pick]) => out.replace(pattern, (m) => matchCase(m, pick(m))), text);
}

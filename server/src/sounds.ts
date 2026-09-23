import type { SpeciesId } from "./animals.js";

// How other languages spell animal noises. With a language detected (language.ts), the animal's
// English sound list is swapped for these -- naming the language alone wasn't enough for characters
// whose English sounds are baked in: Hayley kept answering French with "MEOW MEOW MEOW". Species
// or languages missing here fall back to the English list plus the "respell them" instruction.
export const LOCALIZED_SOUNDS: Partial<Record<SpeciesId, Record<string, string[]>>> = {
  cat: {
    French: ["Miaou", "MIAOU MIAOU MIAOU", "Mrrr", "Ronron", "Pfff"],
    Spanish: ["Miau", "MIAU MIAU MIAU", "Rrrr", "Ronroneo", "Fff"],
    German: ["Miau", "MIAU MIAU MIAU", "Schnurr", "Mrrr", "Fauch"],
    Portuguese: ["Miau", "MIAU MIAU MIAU", "Rrrr", "Ronrom"],
    Italian: ["Miao", "MIAO MIAO MIAO", "Frrr", "Ron ron"],
    Dutch: ["Miauw", "MIAUW MIAUW", "Spin spin", "Mrrr"],
    Japanese: ["ニャー", "ニャーニャーニャー", "ゴロゴロ", "シャー"],
    Korean: ["야옹", "야옹야옹", "그르릉"],
    Chinese: ["喵", "喵喵喵", "呼噜呼噜"],
    Russian: ["Мяу", "МЯУ МЯУ", "Мррр"],
  },
  dog: {
    French: ["Ouaf", "OUAF OUAF", "Wouf", "Grrr", "Ouuuh"],
    Spanish: ["Guau", "¡GUAU GUAU!", "Grrr", "Auuu"],
    German: ["Wuff", "WUFF WUFF", "Wau", "Grrr", "Jaul"],
    Portuguese: ["Au au", "AU AU AU", "Grrr", "Auuu"],
    Italian: ["Bau", "BAU BAU", "Grrr", "Uuuh"],
    Dutch: ["Woef", "WOEF WOEF", "Grrr"],
    Japanese: ["ワン", "ワンワン", "ウー", "クーン"],
    Korean: ["멍", "멍멍", "왈왈"],
    Chinese: ["汪", "汪汪", "呜呜"],
    Russian: ["Гав", "ГАВ ГАВ", "Ррр"],
  },
  duck: {
    French: ["Coin coin", "COIN COIN COIN"],
    Spanish: ["Cuac", "CUAC CUAC"],
    German: ["Quak", "QUAK QUAK"],
    Portuguese: ["Quá quá", "QUÁ QUÁ"],
    Italian: ["Qua qua", "QUA QUA"],
    Dutch: ["Kwak", "KWAK KWAK"],
    Japanese: ["ガー", "ガーガー"],
    Korean: ["꽥", "꽥꽥"],
    Chinese: ["嘎", "嘎嘎"],
  },
  cow: {
    French: ["Meuh", "MEUUUH"],
    Spanish: ["Muu", "MUUUU"],
    German: ["Muh", "MUUUH"],
    Portuguese: ["Muu", "MUUUU"],
    Italian: ["Muu", "MUUUU"],
    Dutch: ["Boe", "BOEEE"],
    Japanese: ["モー", "モーーー"],
    Korean: ["음메", "음메에"],
    Chinese: ["哞", "哞哞"],
  },
  horse: {
    French: ["Hiii", "Hennissement", "Pfrrr"],
    Spanish: ["Iiih", "Relincho", "Pfrrr"],
    German: ["Wieher", "Hüüü", "Prust"],
    Japanese: ["ヒヒーン", "ブルル"],
  },
  goat: {
    French: ["Bêê", "BÊÊÊÊ"],
    Spanish: ["Beee", "BEEEE"],
    German: ["Mäh", "MÄÄÄH"],
    Japanese: ["メェー", "メェェェ"],
  },
  fish: {
    French: ["Bloup", "bloup bloup", "..."],
    Spanish: ["Glu glu", "glu", "..."],
    Japanese: ["ブクブク", "..."],
  },
};

export function localizedSounds(species: SpeciesId, language: string | null): string[] | null {
  if (!language || language === "unknown") return null;
  return LOCALIZED_SOUNDS[species]?.[language] ?? null;
}

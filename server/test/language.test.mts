import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../src/language.ts";

test("names the language of real test messages", () => {
  const cases: [string, string | null][] = [
    ["Le dîner sera en retard ce soir", "French"],
    ["ただいま！ごはんの時間だよ", "Japanese"],
    ["Wer ist ein guter Junge?", "German"],
    ["Lo siento, hoy no traje pan", "Spanish"],
    ["¿Quieres ir a pasear?", "Spanish"],
    ["Você quer passear hoje?", "Portuguese"],
    ["Ciao, sei un gatto molto bello", "Italian"],
    ["Wie is een goede hond?", "Dutch"],
    ["Привет, котик", "Russian"],
    ["Привіт, котику, їсти хочеш?", "Ukrainian"],
    ["안녕 고양아", "Korean"],
    ["你好小猫", "Chinese"],
    ["Bạn có muốn đi dạo không?", "Vietnamese"],
  ];
  for (const [text, lang] of cases) assert.equal(detectLanguage(text), lang, text);
});

test("English and short neutral messages add nothing", () => {
  for (const text of ["Dinner is going to be late tonight", "I burned the toast", "Want to go for a walk?", "hi", "ok", "lol", "Who's a good boy?", "Koba!!"]) {
    assert.equal(detectLanguage(text), null, text);
  }
});

test("mixed or unrecognizable non-English text is 'unknown', not a guess", () => {
  assert.equal(detectLanguage("Ülkü görüşürüz"), "German"); // Turkish shares ü/ö: documents the limit
  assert.equal(detectLanguage("Dzień dobry, kotku"), "unknown");
});

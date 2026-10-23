// Message guard (2026-10-23, Frank: keep abusive input away from the OpenRouter account). Every
// message, and the context the app sends with it, is classified by Llama Guard 4 on OpenRouter
// before the animal's model sees any of it -- see screen.ts for what happens with the verdict. It
// fails closed: no key, no answer, or an unreadable answer throws, and is never read as a pass.
// The guard only classifies; nothing here stores or logs the text (see the privacy policy).

const GUARD_URL = process.env.GUARD_URL || "https://openrouter.ai/api/v1/chat/completions";
const GUARD_MODEL = process.env.GUARD_MODEL || "meta-llama/llama-guard-4-12b";
const TIMEOUT_MS = 8_000;

// Llama Guard 4 answers with MLCommons hazard codes: S1 violent crimes, S2 non-violent crimes, S3
// sex-related crimes, S4 child sexual exploitation, S5 defamation, S6 specialized advice, S7
// privacy, S8 intellectual property, S9 indiscriminate weapons, S10 hate, S11 suicide and
// self-harm, S12 sexual content, S13 elections, S14 code interpreter abuse. The enforced set
// matches CLI-Games' Clide; the rest are let through.
const ENFORCED = new Set(["S1", "S3", "S4", "S9", "S10", "S12"]);
const SEVERE = "S4";
const SELF_HARM = "S11";

export type Verdict = {
  // allow: safe, or only unenforced codes. severe: locks at once. self-harm: help reply, no strike.
  kind: "allow" | "refuse" | "severe" | "self-harm";
  categories: string[];
};

export class GuardUnavailable extends Error {}

// A dedicated, separately capped key when set; the chat key otherwise, so a deploy needs no new
// secret to stay up.
function guardKey(): string | undefined {
  return process.env.GUARD_API_KEY || process.env.OPENROUTER_API_KEY;
}

/** "safe", or "unsafe" with codes on the next line, sometimes after blank lines. Codes; [] = safe. */
export function parseGuardOutput(raw: string): string[] {
  const [verdict, ...rest] = raw.trim().split(/\s*\n\s*/);
  if (verdict === "safe") return [];
  if (verdict !== "unsafe") throw new GuardUnavailable(`unreadable guard output: ${raw.slice(0, 40)}`);
  const codes = rest.join(",").match(/S\d{1,2}/g) ?? [];
  // "unsafe" without a code is still unsafe; it counts as enforced.
  return codes.length > 0 ? [...new Set(codes)] : ["unspecified"];
}

export function verdictFor(categories: string[]): Verdict {
  if (categories.includes(SEVERE)) return { kind: "severe", categories };
  if (categories.includes(SELF_HARM)) return { kind: "self-harm", categories };
  if (categories.some((code) => ENFORCED.has(code) || code === "unspecified")) return { kind: "refuse", categories };
  return { kind: "allow", categories };
}

export async function classify(text: string): Promise<Verdict> {
  const key = guardKey();
  if (!key) throw new GuardUnavailable("no guard key");
  let res: Response;
  try {
    res = await fetch(GUARD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GUARD_MODEL,
        max_tokens: 20,
        temperature: 0,
        messages: [{ role: "user", content: text }],
        // No prompt compression: the guard must see exactly what was sent.
        transforms: [],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new GuardUnavailable(`guard request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new GuardUnavailable(`guard answered HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new GuardUnavailable("guard response had no content");
  return verdictFor(parseGuardOutput(content));
}

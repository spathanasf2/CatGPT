type Level = "info" | "warn" | "error";

// Upstream error bodies can quote what a person typed: OpenRouter's moderation errors carry
// metadata.flagged_input, and metadata.raw is the provider's own payload. The privacy policy
// promises we never log message content, so a logged string loses everything from "metadata" on
// (status, code and message stay). Works on the 300-character excerpts openrouter.ts keeps, which
// are usually cut mid-JSON.
const METADATA = /"metadata"\s*:[\s\S]*$/;

function scrub(value: unknown): unknown {
  return typeof value === "string" ? value.replace(METADATA, '"metadata":"[removed: may quote the message]"') : value;
}

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const safe = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, scrub(value)]));
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg: scrub(msg), ...safe });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

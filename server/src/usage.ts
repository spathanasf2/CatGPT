import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
};

// Lives beside package.json (not inside dist/) so a rebuild doesn't wipe the counter, unless
// USAGE_FILE overrides it -- e.g. a Docker deployment pointing at a mounted volume so it also
// survives container redeploys.
const FILE = process.env.USAGE_FILE || fileURLToPath(new URL("../usage.json", import.meta.url));

function load(): Usage {
  if (existsSync(FILE)) {
    try {
      return JSON.parse(readFileSync(FILE, "utf8")) as Usage;
    } catch {
      log.warn("usage.json unreadable, starting from zero");
    }
  }
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
}

let usage = load();

export function recordUsage(promptTokens: number, completionTokens: number): void {
  usage = {
    promptTokens: usage.promptTokens + promptTokens,
    completionTokens: usage.completionTokens + completionTokens,
    totalTokens: usage.totalTokens + promptTokens + completionTokens,
    requests: usage.requests + 1,
  };
  try {
    writeFileSync(FILE, JSON.stringify(usage));
  } catch (err) {
    log.error("failed to persist usage", { error: err instanceof Error ? err.message : String(err) });
  }
}

export function getUsage(): Usage {
  return { ...usage };
}

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomic-write.js";
import { log } from "./log.js";

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  // Requests per character, to see who people actually talk to. Custom animals count as
  // "custom:<species>" -- their names are the person's own text and don't belong here.
  byAnimal: Record<string, number>;
  // Taps on the share link (GET /get) -- a bare count, nothing about who.
  shareLinkHits: number;
};

// Lives beside package.json (not inside dist/) so a rebuild doesn't wipe the counter, unless
// USAGE_FILE overrides it -- e.g. a Docker deployment pointing at a mounted volume so it also
// survives container redeploys.
const FILE = process.env.USAGE_FILE || fileURLToPath(new URL("../usage.json", import.meta.url));

function load(): Usage {
  if (existsSync(FILE)) {
    try {
      // Files written before byAnimal/shareLinkHits existed get them zeroed.
      return { byAnimal: {}, shareLinkHits: 0, ...(JSON.parse(readFileSync(FILE, "utf8")) as Partial<Usage>) } as Usage;
    } catch {
      log.warn("usage.json unreadable, starting from zero");
    }
  }
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, byAnimal: {}, shareLinkHits: 0 };
}

let usage = load();

function persist(): void {
  try {
    writeFileAtomic(FILE, JSON.stringify(usage));
  } catch (err) {
    log.error("failed to persist usage", { error: err instanceof Error ? err.message : String(err) });
  }
}

export function recordUsage(promptTokens: number, completionTokens: number, animalKey: string): void {
  usage = {
    ...usage,
    promptTokens: usage.promptTokens + promptTokens,
    completionTokens: usage.completionTokens + completionTokens,
    totalTokens: usage.totalTokens + promptTokens + completionTokens,
    requests: usage.requests + 1,
    byAnimal: { ...usage.byAnimal, [animalKey]: (usage.byAnimal[animalKey] ?? 0) + 1 },
  };
  persist();
}

export function recordShareLinkHit(): void {
  usage = { ...usage, shareLinkHits: usage.shareLinkHits + 1 };
  persist();
}

export function getUsage(): Usage {
  return { ...usage };
}

import { apiHeaders, serverConfigured, SERVER_URL } from "./api";

export type WindowUsage = { used: number; limit: number; resetAt: number | null };
export type MyUsage = { tier: "free" | "member"; week: WindowUsage; month: WindowUsage };

function isWindow(w: unknown): w is WindowUsage {
  const o = w as WindowUsage | null;
  return !!o && typeof o.used === "number" && typeof o.limit === "number";
}

// This install's (or this membership's) own allowance -- not the app-wide total builds (1)-(9)
// showed.
export async function fetchMyUsage(): Promise<MyUsage> {
  if (!serverConfigured()) throw new Error("Aineko server URL or token not configured");
  const res = await fetch(`${SERVER_URL}/usage/me`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  const body = (await res.json()) as Partial<MyUsage>;
  if ((body.tier !== "free" && body.tier !== "member") || !isWindow(body.week) || !isWindow(body.month)) {
    throw new Error("invalid response from server");
  }
  return { tier: body.tier, week: body.week, month: body.month };
}

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  budgetTokens: number;
};

const URL = process.env.NEXT_PUBLIC_AINEKO_SERVER_URL;
const TOKEN = process.env.NEXT_PUBLIC_AINEKO_TOKEN;

export async function fetchUsage(): Promise<Usage> {
  if (!URL || !TOKEN) throw new Error("Aineko server URL or token not configured");
  const res = await fetch(`${URL}/usage`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  const body = (await res.json()) as Partial<Usage>;
  if (typeof body.totalTokens !== "number" || typeof body.budgetTokens !== "number") {
    throw new Error("invalid response from server");
  }
  return {
    promptTokens: body.promptTokens ?? 0,
    completionTokens: body.completionTokens ?? 0,
    totalTokens: body.totalTokens,
    requests: body.requests ?? 0,
    budgetTokens: body.budgetTokens,
  };
}

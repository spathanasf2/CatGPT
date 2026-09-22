import { installId } from "./ids";
import { currentMembershipJws } from "./membership";

export const SERVER_URL = process.env.NEXT_PUBLIC_AINEKO_SERVER_URL;
const TOKEN = process.env.NEXT_PUBLIC_AINEKO_TOKEN;

export function serverConfigured(): boolean {
  return Boolean(SERVER_URL && TOKEN);
}

// Who the server meters this request as: the install ID always, plus Apple's signed subscription
// record when there is one (the server verifies it -- see server/src/entitlement.ts).
export function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    "X-Aineko-Install": installId(),
  };
  const jws = currentMembershipJws();
  if (jws) headers["X-Aineko-Membership"] = jws;
  return headers;
}

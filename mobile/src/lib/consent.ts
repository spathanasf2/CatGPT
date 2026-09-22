// Apple guideline 5.1.2(i): explicit permission before user data goes to a third-party AI. Asked
// once on first launch (ConsentModal), reviewable/revocable in Settings > AI & privacy. Stored as
// the ISO time it was given; absent means not given (or revoked). Mirrored in memory so a blocked
// localStorage still honors the choice for the rest of the session.
const KEY = "aineko.aiConsent.v1";
let cached: string | null | undefined;

export function loadConsent(): string | null {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function grantConsent(): string {
  const at = new Date().toISOString();
  cached = at;
  try {
    localStorage.setItem(KEY, at);
  } catch {
    // storage blocked: holds for this session only
  }
  return at;
}

export function revokeConsent(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored to remove
  }
}

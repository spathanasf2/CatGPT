// crypto.randomUUID needs iOS 15.4+ and the deployment target is 15.0; getRandomValues works on
// every iOS this app runs on.
function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newId(): string {
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20)}`;
}

const INSTALL_KEY = "aineko.installId";
let memoryInstallId: string | null = null;

// A random per-install ID the server meters free usage against (server/src/index.ts). Not tied to
// the device or the person -- reinstalling mints a new one. Falls back to a per-session ID if
// storage is blocked, which just means that session is metered on its own.
export function installId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_KEY);
    if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
    const fresh = randomHex(16);
    localStorage.setItem(INSTALL_KEY, fresh);
    return fresh;
  } catch {
    memoryInstallId ??= randomHex(16);
    return memoryInstallId;
  }
}

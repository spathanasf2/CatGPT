// App Store screenshots, iPhone 6.5" slot: 414x896 pt @3x = 1242x2688 px.
// Real app build (the static export Capacitor ships), rendered in WebKit with Apple's fonts and
// emoji, seeded with real, unedited model replies (convos.json -- best of two runs per chat).
// Run on the Mac (Apple fonts/emoji): copy mobile/out to ./site, then
//   npm i playwright@1.63.0 && npx playwright install webkit && node shots.mjs  -> ./out/*.png
import { readFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { webkit } from "playwright";

const ROOT = new URL("./site/", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = readFileSync(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(3010, "127.0.0.1");

const convos = JSON.parse(readFileSync(new URL("./convos.json", import.meta.url)));
// [convos.json key, animal the dropdown points at]
const PICKS = [
  ["goat-2", "goat"],
  ["room-1", "dog"],
  ["cat-2", "cat"],
  ["dog-1", "dog"],
];
// Same as titleFromFirstMessage in mobile/src/lib/chats.ts.
const titleOf = (msgs) => {
  const t = msgs.find((m) => m.role === "user").text.trim();
  return t.length > 40 ? `${t.slice(0, 40)}...` : t;
};
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const now = Date.parse("2026-09-22T18:00:00Z");
// Oldest first in PICKS; the app lists most recent first.
const chats = PICKS.map(([key, animal], i) => ({
  id: id(),
  animal,
  title: titleOf(convos[key]),
  createdAt: now - (PICKS.length - i) * 3_600_000,
  messages: convos[key].map((m) => ({ id: id(), ...m })),
})).reverse();

const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 3, hasTouch: true });
await context.addInitScript(
  ([chatsJson]) => {
    if (localStorage.getItem("aineko.chats.v1")) return;
    localStorage.setItem("aineko.chats.v1", chatsJson);
    localStorage.setItem("aineko.aiConsent.v1", "2026-09-22T17:00:00.000Z");
    localStorage.setItem("aineko.installId", "0".repeat(32));
  },
  [JSON.stringify(chats)],
);
const page = await context.newPage();
await page.goto("http://127.0.0.1:3010/");
await page.waitForTimeout(1800); // boot screen + fade

async function openChat(title) {
  await page.locator(".hamburger").click();
  await page.waitForTimeout(350);
  await page.locator(".chat-item-main", { hasText: title }).click();
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.activeElement?.blur();
    // Shown as a member sees it: the browser build can't reach StoreKit, so bonus animals would
    // otherwise carry the non-member lock even in a chat that's plainly working.
    for (const o of document.querySelectorAll(".animal-select option")) o.textContent = o.textContent.replace(" \u{1F512}", "");
  });
  await page.waitForTimeout(200);
}

const shots = [
  ["01-dog", "I'm exhausted"],
  ["02-room", "burned the lasagna"],
  ["03-cat", "promoted"],
  ["04-goat", "homework"],
];
for (const [name, title] of shots) {
  await openChat(title);
  await page.screenshot({ path: `${OUT}${name}.png` });
}
// Sidebar over the dog chat.
await openChat("I'm exhausted");
await page.locator(".hamburger").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}05-sidebar.png` });

await browser.close();
server.close();
console.log("done");

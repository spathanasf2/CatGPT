// App Store screenshots, iPhone 6.5" slot: 414x896 pt @3x = 1242x2688 px.
// The real static export rendered in WebKit on the Mac (Apple fonts/emoji), seeded with real,
// unedited model replies (convos.json -- best of two runs per chat; memory lines hidden except one).
// Run on the Mac: copy mobile/out to ./site, then
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
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const titleOf = (msgs) => {
  const t = msgs.find((m) => m.role === "user").text.trim();
  return t.length > 40 ? `${t.slice(0, 40)}...` : t;
};
// [convos key, who the chat is pointed at], oldest first -- the app lists most recent first.
const PICKS = [["tank", "tank"], ["hayley", "hayley"], ["room", "koba"], ["koba", "koba"]];
const now = Date.parse("2026-09-23T18:00:00Z");
const chats = PICKS.map(([key, animal], i) => ({
  id: id(),
  animal,
  title: titleOf(convos[key]),
  createdAt: now - (PICKS.length - i) * 3_600_000,
  messages: convos[key].map((m) => ({ id: id(), ...m })),
})).reverse();
// One of "your animals", so the picker's last section isn't empty.
const biscuit = { id: "custom-00000000000b15c0", name: "Biscuit", species: "dog", look: "golden", pronoun: "she", quirks: ["socks"], energy: 2, friendliness: 2, appetite: 1, drama: 0, accent: "#f4a261", createdAt: now };

const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 3, hasTouch: true });
// Screenshot-only membership, so the editor opens: pretend to be iOS and make the purchase plugin's
// browser fallback report an active subscription. No hooks in the app itself.
await context.addInitScript(
  ([chatsJson, customJson]) => {
    window.CapacitorCustomPlatform = { name: "ios", plugins: {} };
    if (localStorage.getItem("aineko.chats.v1")) return;
    localStorage.setItem("aineko.chats.v1", chatsJson);
    localStorage.setItem("aineko.customAnimals.v1", customJson);
    localStorage.setItem("aineko.aiConsent.v1", "2026-09-23T17:00:00.000Z");
    localStorage.setItem("aineko.installId", "0".repeat(32));
  },
  [JSON.stringify(chats), JSON.stringify([biscuit])],
);
await context.route("**/_next/static/chunks/*.js", async (route) => {
  const res = await route.fetch();
  const body = await res.text();
  route.fulfill({
    response: res,
    body: body.includes("getPurchases only mocked")
      ? body.replace("{purchases:[]}", '{purchases:[{productIdentifier:"com.commandminelabs.aineko.monthly",isActive:true,jwsRepresentation:"x"}]}')
      : body,
  });
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:3010/");
await page.waitForTimeout(1800); // boot screen + fade

const settle = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(400);
};
async function openChat(title) {
  await page.locator(".hamburger").click();
  await page.waitForTimeout(350);
  await page.locator(".chat-item-main", { hasText: title }).click();
  await page.waitForTimeout(700);
  await settle();
}

for (const [name, title] of [["01-koba", "I'm exhausted"], ["02-room", "burned the lasagna"], ["03-hayley", "dinner's going to be late"], ["04-tank", "carrot"]]) {
  await openChat(title);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

// The picker, over Koba's chat.
await openChat("I'm exhausted");
await page.locator(".animal-button").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}05-picker.png` });

// Making one.
await page.locator(".pick-tile.make").click();
await page.locator(".create-animal").waitFor();
await page.locator(".create-name").fill("Waffles");
await page.locator(".species-btn[aria-label=Dog]").click();
await page.locator(".look-btn[aria-label=mutt]").click();
await page.locator(".create-animal input[type=range]").nth(0).fill("2");
await page.locator(".create-animal input[type=range]").nth(2).fill("2");
await page.locator(".create-animal .chip", { hasText: "counter surfer" }).click();
await page.locator(".create-animal .chip", { hasText: "hoards socks" }).click();
await settle();
await page.screenshot({ path: `${OUT}06-make-your-own.png` });

await browser.close();
server.close();
console.log("done");

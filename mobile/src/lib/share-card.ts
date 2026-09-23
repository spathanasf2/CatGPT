import type { AnimalMeta } from "./animals";
import { avatarBackground, avatarUri } from "./avatars";

// A reply as an image, for the share sheet: what the person said, what the animal "said", on the
// app's dark background with the mark. Drawn on a canvas by hand (no DOM-to-image dependency); the
// portrait is the same SVG the UI uses.
const W = 1080;
const PAD = 72;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s*\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

// By hand: CanvasRenderingContext2D.roundRect is iOS 16+, and the deployment target is 15.0.
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type ShareCardInput = { animal: AnimalMeta; sounds: string; narrative: string; said?: string };

/** Returns the card as base64 PNG (no data: prefix). */
export async function renderShareCard({ animal, sounds, narrative, said }: ShareCardInput): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Measure first, then size the canvas to fit.
  const bubbleX = PAD + 150;
  const bubbleW = W - bubbleX - PAD;
  const inner = bubbleW - 2 * 44;
  ctx.font = `600 40px ${FONT}`;
  const saidLines = said ? wrap(ctx, said, W - 2 * PAD - 140, 3) : [];
  ctx.font = `800 64px ${FONT}`;
  const soundLines = wrap(ctx, sounds, inner, 3);
  ctx.font = `italic 40px ${FONT}`;
  const narrativeLines = wrap(ctx, narrative, inner, 6);

  const saidH = saidLines.length ? saidLines.length * 52 + 56 : 0;
  const bubbleH = 44 + soundLines.length * 76 + 20 + narrativeLines.length * 54 + 40;
  // Sized to the content (plus room for the footer), so a two-word reply isn't lost in a square.
  const H = Math.max(720, PAD + saidH + (saidH ? 48 : 0) + bubbleH + 96 + 96 + PAD);
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#12121a";
  ctx.fillRect(0, 0, W, H);

  let y = PAD;
  if (saidLines.length) {
    ctx.font = `600 40px ${FONT}`;
    const w = Math.max(...saidLines.map((l) => ctx.measureText(l).width)) + 72;
    roundRect(ctx, W - PAD - w, y, w, saidH, 36);
    ctx.fillStyle = "#2e2e3a";
    ctx.fill();
    ctx.fillStyle = "#f2f0f5";
    saidLines.forEach((l, i) => ctx.fillText(l, W - PAD - w + 36, y + 64 + i * 52));
    y += saidH + 48;
  }

  const portrait = await loadImage(avatarUri(animal.kind, animal.look, avatarBackground(animal.accent)));
  ctx.drawImage(portrait, PAD, y, 128, 128);

  roundRect(ctx, bubbleX, y, bubbleW, bubbleH, 40);
  ctx.fillStyle = "#1c1c26";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = animal.accent;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 64px ${FONT}`;
  soundLines.forEach((l, i) => ctx.fillText(l, bubbleX + 44, y + 44 + 58 + i * 76));
  ctx.fillStyle = "#b7b4c0";
  ctx.font = `italic 40px ${FONT}`;
  const ny = y + 44 + soundLines.length * 76 + 20;
  narrativeLines.forEach((l, i) => ctx.fillText(l, bubbleX + 44, ny + 40 + i * 54));

  // Footer: the mark and the name.
  const mark = await loadImage("/aineko-mark.png").catch(() => null);
  const fy = H - PAD - 96;
  if (mark) ctx.drawImage(mark, PAD, fy, 64 * (mark.width / mark.height), 64);
  ctx.fillStyle = "#f2f0f5";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("Aineko", PAD + 72, fy + 46);
  // The address, for when the image travels without the link (saved, reposted).
  ctx.fillStyle = "#8b8894";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText("aineko.bromsg.com", PAD + 72, fy + 84);
  ctx.fillStyle = "#8b8894";
  ctx.font = `500 32px ${FONT}`;
  const tag = `${animal.name} the ${animal.species}`;
  ctx.fillText(tag, W - PAD - ctx.measureText(tag).width, fy + 44);

  return canvas.toDataURL("image/png").split(",")[1]!;
}

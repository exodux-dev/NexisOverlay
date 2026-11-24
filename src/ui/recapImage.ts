// Shareable post-game recap: a 1200×630 PNG (Discord / social card size) drawn on a canvas in the
// current theme colors. Images that refuse cross-origin use are skipped, never block the card.
import { matchMode } from "../engine/mode";
import type { MatchRecord, StaticData } from "../engine/types";

const W = 1200;
const H = 630;
const MODE_NAME: Record<string, string> = { mayhem: "ARAM: Mayhem", aram: "ARAM", sr: "Summoner's Rift", arena: "Arena" };
const SPLASH = "https://ddragon.leagueoflegends.com/cdn/img/champion/splash";

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function loadImage(src: string | undefined, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = window.setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

/** "#8b7cff" (or "rgb(...)") with an alpha, as rgba() — canvas doesn't take color-mix(). */
function withAlpha(color: string, a: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (rgb) return `rgba(${rgb[1].split(",").slice(0, 3).join(",")}, ${a})`;
  return `rgba(139, 124, 255, ${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

async function draw(rec: MatchRecord, data: StaticData | null | undefined, withImages: boolean): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = `rgb(${cssVar("--bg-rgb", "12,13,17")})`;
  const panel = `rgb(${cssVar("--panel-rgb", "22,24,31")})`;
  const accent = cssVar("--accent", "#8b7cff");
  const text = cssVar("--text", "#eceef3");
  const muted = cssVar("--muted", "#8a90a2");
  const font = `"Inter Variable", "Inter", "Segoe UI", system-ui, sans-serif`;
  const win = rec.result === "Win";
  const resultColor = win ? "#34d399" : "#f87171";
  const champ = data?.championsById.get(rec.champion);
  const name = champ?.name ?? rec.champion;
  const mode = matchMode(rec);

  // Background + splash art on the right, faded into the background.
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (withImages) {
    const splash = await loadImage(`${SPLASH}/${rec.champion}_0.jpg`);
    if (splash) {
      const sh = H;
      const sw = (splash.width / splash.height) * sh;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(splash, W - sw + sw * 0.18, 0, sw, sh);
      ctx.globalAlpha = 1;
    }
  }
  const fade = ctx.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, bg);
  fade.addColorStop(0.45, bg);
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(140, 90, 10, 140, 90, 520);
  glow.addColorStop(0, withAlpha(accent, 0.3));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header: result + mode + date.
  ctx.fillStyle = resultColor;
  ctx.font = `800 72px ${font}`;
  ctx.fillText(win ? "Victory" : "Defeat", 64, 132);
  ctx.fillStyle = muted;
  ctx.font = `600 24px ${font}`;
  const date = new Date(rec.date);
  ctx.fillText(`${mode ? MODE_NAME[mode] : rec.gameMode} · ${Math.round(rec.durationSec / 60)} min · ${date.toLocaleDateString()}`, 66, 176);

  // Champion portrait + name + KDA.
  let x = 64;
  if (withImages) {
    const icon = await loadImage(champ?.icon);
    if (icon) {
      ctx.save();
      roundRect(ctx, x, 222, 112, 112, 20);
      ctx.clip();
      ctx.drawImage(icon, x, 222, 112, 112);
      ctx.restore();
      x += 136;
    }
  }
  ctx.fillStyle = text;
  ctx.font = `700 44px ${font}`;
  ctx.fillText(name, x, 268);
  ctx.font = `700 38px ${font}`;
  const k = `${rec.kills} / `;
  const d = `${rec.deaths}`;
  const a = ` / ${rec.assists}`;
  ctx.fillText(k, x, 322);
  let kx = x + ctx.measureText(k).width;
  ctx.fillStyle = "#f87171";
  ctx.fillText(d, kx, 322);
  kx += ctx.measureText(d).width;
  ctx.fillStyle = text;
  ctx.fillText(a, kx, 322);
  kx += ctx.measureText(a).width;
  ctx.fillStyle = muted;
  ctx.font = `600 24px ${font}`;
  ctx.fillText(`  ${((rec.kills + rec.assists) / Math.max(1, rec.deaths)).toFixed(2)} KDA`, kx, 322);

  // Items.
  const items = rec.items.map((id) => data?.items.get(id)).filter((i): i is NonNullable<typeof i> => !!i).slice(0, 7);
  if (items.length) {
    ctx.fillStyle = muted;
    ctx.font = `700 18px ${font}`;
    ctx.fillText("BUILD", 66, 392);
    let ix = 64;
    for (const it of items) {
      ctx.fillStyle = panel;
      roundRect(ctx, ix, 406, 64, 64, 12);
      ctx.fill();
      const img = withImages ? await loadImage(it.icon) : null;
      if (img) {
        ctx.save();
        roundRect(ctx, ix, 406, 64, 64, 12);
        ctx.clip();
        ctx.drawImage(img, ix, 406, 64, 64);
        ctx.restore();
      }
      ix += 76;
    }
  }

  // Augments.
  if (rec.augments.length) {
    ctx.fillStyle = muted;
    ctx.font = `700 18px ${font}`;
    ctx.fillText("AUGMENTS", 66, 512);
    ctx.font = `600 22px ${font}`;
    let ax = 64;
    for (const aug of rec.augments.slice(0, 6)) {
      const w = ctx.measureText(aug).width + 28;
      if (ax + w > W - 64) break;
      ctx.fillStyle = panel;
      roundRect(ctx, ax, 526, w, 40, 20);
      ctx.fill();
      ctx.fillStyle = withAlpha(accent, 0.22);
      ctx.fill();
      ctx.fillStyle = text;
      ctx.fillText(aug, ax + 14, 553);
      ax += w + 10;
    }
  }

  // Footer brand.
  ctx.fillStyle = accent;
  ctx.font = `800 22px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText("NEXIS", W - 48, H - 36);
  ctx.textAlign = "left";

  return await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    } catch (e) {
      reject(e); // a cross-origin image tainted the canvas
    }
  });
}

/** PNG of the recap; retries without pictures if an image tainted the canvas. */
export async function recapPng(rec: MatchRecord, data: StaticData | null | undefined): Promise<Blob> {
  try {
    return await draw(rec, data, true);
  } catch {
    return draw(rec, data, false);
  }
}

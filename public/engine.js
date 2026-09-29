// Nova Kitsune "Holo-Diffusion" — a deterministic, fully local generative renderer.
// Same (prompt, style, seed, size) always yields the same image, so the gallery
// stores parameters instead of pixels.

export const STYLES = {
  "neon-noir": { label: "Neon Noir", bg: ["#05010f", "#1a0633"], palette: ["#ff2bd6", "#00e5ff", "#7b2bff", "#ffd166"], grid: false, glitch: 0.15 },
  "holo-chrome": { label: "Holo Chrome", bg: ["#0c1024", "#2a2f4f"], palette: ["#b8f3ff", "#ffb8f0", "#c8b8ff", "#ffffff"], grid: false, glitch: 0 },
  synthwave: { label: "Synthwave", bg: ["#12002b", "#ff3f7f"], palette: ["#ff6ec7", "#ffd23f", "#3ff4ff", "#b967ff"], grid: true, glitch: 0 },
  aurora: { label: "Aurora", bg: ["#010b14", "#04293a"], palette: ["#3dffa2", "#35c2ff", "#a35bff", "#e0fff4"], grid: false, glitch: 0 },
  "cyber-anime": { label: "Cyber Anime", bg: ["#0b0620", "#23104d"], palette: ["#ff4f9a", "#5ce1ff", "#fff36b", "#9d7bff"], grid: false, glitch: 0.05 },
  glitch: { label: "Glitchcore", bg: ["#000000", "#101418"], palette: ["#00ff9c", "#ff003c", "#00b3ff", "#f5f5f5"], grid: false, glitch: 0.8 },
  solar: { label: "Solarpunk", bg: ["#06231a", "#2d6b3c"], palette: ["#ffd76b", "#8cff9e", "#ff9f5a", "#e8fff0"], grid: false, glitch: 0 },
  void: { label: "Void Minimal", bg: ["#000000", "#07070b"], palette: ["#ffffff", "#8a8aff", "#ff8ad8", "#5cf"], grid: false, glitch: 0 },
};

export const RATIOS = { "1:1": [1, 1], "3:4": [3, 4], "4:3": [4, 3], "9:16": [9, 16], "16:9": [16, 9] };

const COLOR_WORDS = {
  red: "#ff3355", crimson: "#dc143c", fire: "#ff6a1a", orange: "#ff8c2a", gold: "#ffcc33", yellow: "#ffe45c",
  green: "#39ff88", forest: "#2ecc71", emerald: "#2bd67b", teal: "#1de9b6", cyan: "#00e5ff", ocean: "#1e90ff",
  blue: "#3d7bff", ice: "#aeefff", purple: "#a64dff", violet: "#8f5bff", pink: "#ff5cc8", rose: "#ff7aa8",
  white: "#ffffff", silver: "#d8e0ff", sunset: "#ff7b54", night: "#2a1b6b",
};

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function shiftHue(hex, deg) {
  let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
}

function detectSubject(p) {
  if (/\b(fox|kitsune|vixen)\b/.test(p)) return "fox";
  if (/\b(selfie|portrait|face|girl|boy|woman|man|person|character|companion|android|avatar)\b/.test(p)) return "portrait";
  if (/\b(city|skyline|street|tokyo|metropolis|building|downtown)\b/.test(p)) return "city";
  if (/\b(planet|space|galaxy|moon|star|nebula|cosmic|orbit)\b/.test(p)) return "planet";
  if (/\b(mountain|landscape|valley|desert|canyon|hills|forest|lake|ocean|beach|sea)\b/.test(p)) return "landscape";
  if (/\b(cat|dragon|creature|bird|wolf|koi)\b/.test(p)) return "spirit";
  return "orb";
}

/**
 * Render an image.
 * @param {HTMLCanvasElement} canvas
 * @param {{prompt:string, style?:string, seed?:number, negative?:string, detail?:number, hue?:number}} opts
 */
export function renderArt(canvas, opts) {
  const prompt = (opts.prompt || "").toLowerCase();
  const style = STYLES[opts.style] || STYLES["neon-noir"];
  const seed = (opts.seed ?? 0) >>> 0;
  const rand = mulberry32(hashString(prompt + "|" + opts.style) ^ seed);
  const detail = Math.max(0.2, Math.min(1, opts.detail ?? 0.7));
  const W = canvas.width, H = canvas.height, S = Math.min(W, H);
  const ctx = canvas.getContext("2d");

  // Prompt color words override part of the palette; companion hue shifts it.
  let palette = [...style.palette];
  Object.entries(COLOR_WORDS).forEach(([word, col]) => {
    if (prompt.includes(word)) palette.unshift(col);
  });
  palette = palette.slice(0, 5);
  if (opts.hue) palette = palette.map((c) => (c.startsWith("#") ? shiftHue(c, opts.hue) : c));
  const pick = () => palette[Math.floor(rand() * palette.length)];
  const col = (c, a) => (c.startsWith("#") ? rgba(c, a) : c.replace(")", ` / ${a})`));

  // 1. Background
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, style.bg[0]);
  g.addColorStop(1, style.bg[1]);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 2. Nebula glow
  ctx.globalCompositeOperation = "lighter";
  const blobs = 4 + Math.floor(rand() * 5);
  for (let i = 0; i < blobs; i++) {
    const x = rand() * W, y = rand() * H, r = S * (0.25 + rand() * 0.55);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col(pick(), 0.28));
    rg.addColorStop(1, col(pick(), 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // 3. Flow-field light trails
  const fx = 1 + rand() * 3, fy = 1 + rand() * 3, ph = rand() * 10;
  const trails = Math.floor(60 + detail * 260);
  ctx.lineWidth = Math.max(0.6, S / 700);
  for (let i = 0; i < trails; i++) {
    let x = rand() * W, y = rand() * H;
    ctx.strokeStyle = col(pick(), 0.08 + rand() * 0.18);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 40; s++) {
      const a = Math.sin((x / W) * fx * 6 + ph) + Math.cos((y / H) * fy * 6 - ph);
      x += Math.cos(a * Math.PI) * S * 0.012;
      y += Math.sin(a * Math.PI) * S * 0.012;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 4. Synthwave grid horizon
  if (style.grid || /\bgrid|retro|80s\b/.test(prompt)) drawGrid(ctx, W, H, palette[0], palette[2] || palette[1]);

  // 5. Subject
  ctx.globalCompositeOperation = "source-over";
  const subject = detectSubject(prompt);
  const cx = W / 2 + (rand() - 0.5) * W * 0.08, cy = H * 0.52;
  ({ fox: drawFox, portrait: drawPortrait, city: drawCity, planet: drawPlanet, landscape: drawLandscape, spirit: drawSpirit, orb: drawOrb })[subject](
    ctx, { W, H, S, cx, cy, rand, pick, col, palette, detail },
  );

  // 6. Particles / stars
  ctx.globalCompositeOperation = "lighter";
  const stars = Math.floor(40 + detail * 200);
  for (let i = 0; i < stars; i++) {
    const r = rand() * S * 0.003 + 0.4;
    ctx.fillStyle = col(pick(), 0.4 + rand() * 0.6);
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Post: glitch slices, scanlines, vignette
  ctx.globalCompositeOperation = "source-over";
  const glitch = style.glitch + (/\bglitch\b/.test(prompt) ? 0.5 : 0);
  if (glitch > 0) {
    const n = Math.floor(glitch * 14);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(rand() * H), h = Math.floor(rand() * S * 0.04) + 2;
      const dx = Math.floor((rand() - 0.5) * S * 0.08);
      try {
        const slice = ctx.getImageData(0, y, W, h);
        ctx.putImageData(slice, dx, y);
      } catch { /* tainted canvases are impossible here, but stay safe */ }
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  const step = Math.max(2, Math.round(S / 256));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step * 0.5);
  const vg = ctx.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  return { subject };
}

function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}
function noGlow(ctx) {
  ctx.shadowBlur = 0;
}

function drawGrid(ctx, W, H, c1, c2) {
  const horizon = H * 0.62;
  const sun = ctx.createLinearGradient(0, horizon - H * 0.3, 0, horizon);
  sun.addColorStop(0, c1);
  sun.addColorStop(1, c2);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(W / 2, horizon, Math.min(W, H) * 0.22, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "rgba(10,0,25,0.85)";
  for (let i = 0; i < 6; i++) ctx.fillRect(0, horizon - (i + 1) * H * 0.022, W, H * 0.004 * (i + 1));
  ctx.fillStyle = "rgba(8,0,20,0.9)";
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = rgba(c1.startsWith("#") ? c1 : "#ff6ec7", 0.7);
  ctx.lineWidth = 1.2;
  glow(ctx, "#ff6ec7", 8);
  for (let i = -20; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * W * 0.01, horizon);
    ctx.lineTo(W / 2 + i * W * 0.12, H);
    ctx.stroke();
  }
  for (let i = 1; i < 14; i++) {
    const y = horizon + (H - horizon) * Math.pow(i / 14, 1.8);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFox(ctx, { S, cx, cy, pick, col, palette, rand }) {
  const s = S * 0.34;
  const c1 = palette[0], c2 = palette[1] || palette[0];
  ctx.save();
  ctx.translate(cx, cy);
  // Low-poly fox head: list of triangles in unit space.
  const tris = [
    [[-0.9, -0.95], [-0.35, -0.35], [-0.75, -0.1]], // left ear
    [[0.9, -0.95], [0.35, -0.35], [0.75, -0.1]], // right ear
    [[-0.75, -0.1], [-0.35, -0.35], [0, -0.3]],
    [[0.75, -0.1], [0.35, -0.35], [0, -0.3]],
    [[-0.75, -0.1], [0, -0.3], [-0.3, 0.25]],
    [[0.75, -0.1], [0, -0.3], [0.3, 0.25]],
    [[-0.3, 0.25], [0, -0.3], [0.3, 0.25]],
    [[-0.75, -0.1], [-0.3, 0.25], [-0.55, 0.35]],
    [[0.75, -0.1], [0.3, 0.25], [0.55, 0.35]],
    [[-0.3, 0.25], [0.3, 0.25], [0, 0.75]], // muzzle
    [[-0.55, 0.35], [-0.3, 0.25], [0, 0.75]],
    [[0.55, 0.35], [0.3, 0.25], [0, 0.75]],
  ];
  glow(ctx, col(c1, 0.9), s * 0.25);
  tris.forEach((t, i) => {
    const grad = ctx.createLinearGradient(t[0][0] * s, t[0][1] * s, t[2][0] * s, t[2][1] * s);
    grad.addColorStop(0, col(i % 2 ? c1 : c2, 0.55 + rand() * 0.35));
    grad.addColorStop(1, col(pick(), 0.25));
    ctx.fillStyle = grad;
    ctx.strokeStyle = col("#ffffff", 0.35);
    ctx.lineWidth = Math.max(1, s * 0.006);
    ctx.beginPath();
    ctx.moveTo(t[0][0] * s, t[0][1] * s);
    ctx.lineTo(t[1][0] * s, t[1][1] * s);
    ctx.lineTo(t[2][0] * s, t[2][1] * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  // Eyes
  glow(ctx, "#ffffff", s * 0.2);
  ctx.fillStyle = "#fff";
  [-1, 1].forEach((d) => {
    ctx.beginPath();
    ctx.ellipse(d * s * 0.3, -s * 0.02, s * 0.09, s * 0.035, d * -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  // Nose
  ctx.fillStyle = "#111";
  noGlow(ctx);
  ctx.beginPath();
  ctx.arc(0, s * 0.68, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  // Halo ring
  glow(ctx, col(c2, 1), s * 0.3);
  ctx.strokeStyle = col(c2, 0.7);
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.ellipse(0, -s * 1.1, s * 0.7, s * 0.14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  noGlow(ctx);
}

function drawPortrait(ctx, { S, W, H, cx, pick, col, palette, rand }) {
  const s = S * 0.3;
  const cy = H * 0.5;
  const c1 = palette[0], c2 = palette[1] || palette[0];
  ctx.save();
  // Shoulders
  const body = ctx.createLinearGradient(0, cy, 0, H);
  body.addColorStop(0, col(c2, 0.9));
  body.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx - s * 1.5, H);
  ctx.quadraticCurveTo(cx - s * 1.4, cy + s * 0.8, cx - s * 0.35, cy + s * 0.55);
  ctx.lineTo(cx + s * 0.35, cy + s * 0.55);
  ctx.quadraticCurveTo(cx + s * 1.4, cy + s * 0.8, cx + s * 1.5, H);
  ctx.fill();
  // Neck
  ctx.fillStyle = "rgba(20,10,40,0.95)";
  ctx.fillRect(cx - s * 0.2, cy + s * 0.1, s * 0.4, s * 0.5);
  // Hair back
  glow(ctx, col(c1, 0.9), s * 0.4);
  ctx.fillStyle = col(c1, 0.85);
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.35, s * 0.72, s * 0.8, 0, Math.PI, 0);
  ctx.lineTo(cx + s * 0.8, cy + s * 0.5 + rand() * s * 0.4);
  ctx.lineTo(cx - s * 0.8, cy + s * 0.5 + rand() * s * 0.4);
  ctx.fill();
  // Face (dark silhouette with rim light)
  noGlow(ctx);
  const face = ctx.createRadialGradient(cx - s * 0.2, cy - s * 0.4, s * 0.05, cx, cy - s * 0.2, s * 0.7);
  face.addColorStop(0, "rgba(60,40,90,1)");
  face.addColorStop(1, "rgba(12,6,28,1)");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.25, s * 0.48, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  glow(ctx, col(c2, 1), s * 0.2);
  ctx.strokeStyle = col(c2, 0.9);
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.25, s * 0.48, s * 0.6, 0, -Math.PI * 0.1, Math.PI * 0.6);
  ctx.stroke();
  // Visor
  glow(ctx, col(pick(), 1), s * 0.3);
  const visor = ctx.createLinearGradient(cx - s * 0.5, 0, cx + s * 0.5, 0);
  palette.slice(0, 3).forEach((c, i, a) => visor.addColorStop(i / Math.max(1, a.length - 1), col(c, 0.95)));
  ctx.fillStyle = visor;
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.52, cy - s * 0.42, s * 1.04, s * 0.2, s * 0.1);
  ctx.fill();
  // Bangs
  noGlow(ctx);
  ctx.fillStyle = col(c1, 0.95);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy - s * 0.45);
  for (let i = 0; i <= 6; i++) {
    const x = cx - s * 0.6 + (i / 6) * s * 1.2;
    ctx.lineTo(x, cy - s * (i % 2 ? 0.55 : 0.75));
  }
  ctx.lineTo(cx + s * 0.6, cy - s * 0.45);
  ctx.quadraticCurveTo(cx, cy - s * 1.35, cx - s * 0.6, cy - s * 0.45);
  ctx.fill();
  // Fox-ear headset for extra kitsune flavor
  glow(ctx, col(c2, 1), s * 0.2);
  ctx.fillStyle = col(c2, 0.9);
  [-1, 1].forEach((d) => {
    ctx.beginPath();
    ctx.moveTo(cx + d * s * 0.25, cy - s * 0.95);
    ctx.lineTo(cx + d * s * 0.6, cy - s * 1.35);
    ctx.lineTo(cx + d * s * 0.55, cy - s * 0.8);
    ctx.fill();
  });
  ctx.restore();
  noGlow(ctx);
}

function drawCity(ctx, { W, H, rand, pick, col }) {
  const base = H * 0.95;
  for (let layer = 0; layer < 3; layer++) {
    const shade = 8 + layer * 10;
    let x = -10;
    while (x < W) {
      const bw = W * (0.04 + rand() * 0.08);
      const bh = H * (0.2 + rand() * (0.35 + layer * 0.12)) * (1 - layer * 0.15);
      const top = base - bh - layer * H * 0.03;
      ctx.fillStyle = `rgb(${shade},${shade / 2},${shade + 18})`;
      ctx.fillRect(x, top, bw, H - top);
      if (layer === 2 || rand() > 0.5) {
        const wc = pick();
        for (let wy = top + 6; wy < H; wy += 9) {
          for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
            if (rand() > 0.62) {
              ctx.fillStyle = col(wc, 0.5 + rand() * 0.5);
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
      }
      if (rand() > 0.8) {
        glow(ctx, col(pick(), 1), 20);
        ctx.fillStyle = col(pick(), 0.9);
        ctx.fillRect(x + bw * 0.2, top + bh * 0.1, bw * 0.6, 6);
        noGlow(ctx);
      }
      x += bw + rand() * 4;
    }
  }
}

function drawPlanet(ctx, { S, cx, cy, pick, col, palette, rand }) {
  const r = S * (0.22 + rand() * 0.1);
  const c1 = palette[0], c2 = palette[1] || palette[0];
  glow(ctx, col(c1, 0.9), r * 0.6);
  const pg = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  pg.addColorStop(0, col(c2, 1));
  pg.addColorStop(0.6, col(c1, 0.9));
  pg.addColorStop(1, "rgba(5,0,20,1)");
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  noGlow(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = col(pick(), 0.12);
    ctx.fillRect(cx - r, cy - r + (i / 7) * 2 * r + rand() * 10, r * 2, r * 0.08 + rand() * r * 0.1);
  }
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.35);
  glow(ctx, col(c2, 1), 12);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = col(pick(), 0.5 - i * 0.12);
    ctx.lineWidth = r * (0.05 - i * 0.012);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1.6 + i * 0.18), r * (0.35 + i * 0.05), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  noGlow(ctx);
}

function drawLandscape(ctx, { W, H, rand, pick, col }) {
  for (let layer = 0; layer < 5; layer++) {
    const baseY = H * (0.45 + layer * 0.1);
    const c = pick();
    ctx.fillStyle = `rgba(${6 + layer * 4},${3 + layer * 3},${20 + layer * 5},${0.75 + layer * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(0, H);
    let y = baseY;
    for (let x = 0; x <= W; x += W / 40) {
      y += (rand() - 0.5) * H * 0.05;
      y = Math.min(Math.max(y, baseY - H * 0.15), baseY + H * 0.08);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
    glow(ctx, col(c, 1), 10);
    ctx.strokeStyle = col(c, 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    noGlow(ctx);
  }
}

function drawSpirit(ctx, { S, cx, cy, pick, col, rand }) {
  // A swirling luminous ribbon creature.
  ctx.save();
  ctx.translate(cx, cy);
  glow(ctx, col(pick(), 1), S * 0.05);
  for (let k = 0; k < 5; k++) {
    ctx.strokeStyle = col(pick(), 0.6);
    ctx.lineWidth = S * (0.03 - k * 0.004);
    ctx.beginPath();
    for (let t = 0; t < Math.PI * 4; t += 0.05) {
      const r = S * 0.08 * t * (0.6 + k * 0.05);
      const x = Math.cos(t + k * 0.4) * r * 0.5, y = Math.sin(t * 1.3 + k) * r * 0.35;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(S * 0.02, -S * 0.01, S * 0.015 + rand() * S * 0.01, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  noGlow(ctx);
}

function drawOrb(ctx, { S, cx, cy, pick, col, rand, detail }) {
  const r = S * 0.24;
  ctx.save();
  ctx.translate(cx, cy);
  glow(ctx, col(pick(), 1), r * 0.5);
  const n = Math.floor(6 + rand() * 6);
  const rings = Math.floor(3 + detail * 6);
  for (let j = 1; j <= rings; j++) {
    ctx.strokeStyle = col(pick(), 0.5);
    ctx.lineWidth = Math.max(1, S * 0.003);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + j * 0.3;
      const x = Math.cos(a) * r * (j / rings), y = Math.sin(a) * r * (j / rings);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.strokeStyle = col(pick(), 0.35);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  core.addColorStop(0, "rgba(255,255,255,0.95)");
  core.addColorStop(1, col(pick(), 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  noGlow(ctx);
}

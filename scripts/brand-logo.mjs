// 5iveG logo generator: hand-built letterforms (rounded polygons → cubic Béziers), no fonts.
// node scripts/brand-logo.mjs [outDir=public/brand] [previewDir]  (previewDir writes a contact sheet)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const OUT = process.argv[2] ?? "public/brand";
const PREV = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

// ── palette ──────────────────────────────────────────────────────
const C = {
  hi: "#c084fc", // purple-400
  p5: "#a855f7", // purple-500
  p6: "#9333ea", // purple-600
  p7: "#7e22ce", // purple-700
  p9: "#3b0764", // purple-950
  ink: "#0a0a0a",
  white: "#ffffff",
};

const SKEW = Math.tan((11 * Math.PI) / 180);
const fmt = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
};

// Polygon with per-vertex corner radius → closed path. pts: [x, y, r?]
function roundedPoly(pts, xf) {
  const n = pts.length;
  const segs = [];
  const dists = [];
  for (let i = 0; i < n; i++) {
    const [px, py, r = 0] = pts[i];
    const [ax, ay] = pts[(i - 1 + n) % n];
    const [bx, by] = pts[(i + 1) % n];
    if (!r) {
      segs.push({ t1: [px, py] });
      dists.push(0);
      continue;
    }
    let u1 = [ax - px, ay - py];
    let u2 = [bx - px, by - py];
    const l1 = Math.hypot(...u1);
    const l2 = Math.hypot(...u2);
    u1 = [u1[0] / l1, u1[1] / l1];
    u2 = [u2[0] / l2, u2[1] / l2];
    const phi = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const d = r / Math.tan(phi / 2);
    const k = (4 / 3) * Math.tan((Math.PI - phi) / 4) * r;
    const t1 = [px + u1[0] * d, py + u1[1] * d];
    const t2 = [px + u2[0] * d, py + u2[1] * d];
    segs.push({ t1, t2, c1: [t1[0] - u1[0] * k, t1[1] - u1[1] * k], c2: [t2[0] - u2[0] * k, t2[1] - u2[1] * k] });
    dists.push(d);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
    if (dists[i] + dists[j] > len + 1e-6) console.warn("corners overlap on edge", pts[i], pts[j]);
  }
  const P = (p) => {
    const q = xf(p);
    return fmt(q[0]) + " " + fmt(q[1]);
  };
  let s = "M" + P(segs[0].t1);
  segs.forEach((g, i) => {
    if (i > 0) s += "L" + P(g.t1);
    if (g.c1) s += "C" + P(g.c1) + " " + P(g.c2) + " " + P(g.t2);
  });
  return s + "Z";
}

// ── glyphs (upright, cap height 100, baseline y=100, y down) ─────
const V = 21; // vertical stem
const H = 17; // cap horizontals
const h = 15; // lowercase horizontals
const X = 72; // x-height
const XT = 100 - X;
const RI = 7; // inner corner radius
const s2 = 2; // crisp corner radius

const G5 = (() => {
  const W = 68, yb = 37, ro = 29;
  return {
    w: W,
    contours: [[
      [4, 0, s2], [W + 1, 0, s2], [W - 3, H, s2], [4 + V, H, 3], [4 + V, yb, 3],
      [W, yb, ro], [W, 100, ro], [0, 100, s2], [0, 100 - H, s2],
      [W - V, 100 - H, RI], [W - V, yb + H, RI], [4, yb + H, s2],
    ]],
  };
})();

const Gi = {
  w: V,
  contours: [[[0, XT, s2], [V, XT, s2], [V, 100, s2], [0, 100, s2]]],
  tittle: { cx: V / 2, top: 0, R: 11.5 },
};

const Gv = (() => {
  const W = 62, a = 22, bw = 18;
  const s = (W / 2 - bw / 2) / X;
  const yN = XT + (W / 2 - a) / s;
  return {
    w: W,
    contours: [[
      [0, XT, s2], [a, XT, s2], [W / 2, yN, 1.5], [W - a, XT, s2], [W, XT, s2],
      [W / 2 + bw / 2, 100, s2], [W / 2 - bw / 2, 100, s2],
    ]],
  };
})();

const Ge = (() => {
  const W = 61, ro = 22, barTop = XT + h + 16, barBot = barTop + 12, lowTop = 100 - h;
  return {
    w: W,
    contours: [
      [
        [0, XT, ro], [W, XT, ro], [W, barBot, s2], [V, barBot, 5], [V, lowTop, 5],
        [W, lowTop, s2], [W, 100, 4], [0, 100, ro],
      ],
      [[V, XT + h, RI - 1], [W - V, XT + h, RI - 1], [W - V, barTop, s2], [V, barTop, s2]],
    ],
  };
})();

const GG = (() => {
  const W = 76, ro = 30, yt = 35, barTop = 50, barBot = barTop + H, barL = 37;
  return {
    w: W,
    contours: [[
      [0, 0, ro], [W, 0, ro], [W, yt, s2], [W - V, yt, s2], [W - V, H, RI], [V, H, RI],
      [V, 100 - H, RI], [W - V, 100 - H, RI], [W - V, barBot, s2], [barL, barBot, s2],
      [barL, barTop, s2], [W, barTop, s2], [W, 100, ro], [0, 100, ro],
    ]],
  };
})();

function pentagon(cx, cy, R, r, pointDown = true) {
  const pts = [];
  for (let k = 0; k < 5; k++) {
    const a = ((pointDown ? 90 : -90) + 72 * k) * (Math.PI / 180);
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a), r]);
  }
  return pts;
}
// bbox of a point-down pentagon of circumradius R centred at (cx, cy)
const PENT_H = (R) => R * (1 + Math.cos(Math.PI / 5));
const PENT_W = (R) => 2 * R * Math.sin((2 * Math.PI) / 5);

// italic transform: glyph units → canvas, origin at (ox, baseline-top oy)
const italic = (ox, oy, s) => ([x, y]) => [ox + s * (x + (100 - y) * SKEW), oy + s * y];
const plain = (ox, oy, s) => ([x, y]) => [ox + s * x, oy + s * y];

// ── wordmark ─────────────────────────────────────────────────────
const WORD = [
  [G5, 8],
  [Gi, 7],
  [Gv, 4],
  [Ge, 7],
  [GG, 0],
];
function wordmark(ox, oy, s) {
  let x = 0;
  let body = "";
  let dot = "";
  for (const [g, gap] of WORD) {
    const xf = italic(ox + x * s, oy, s);
    for (const c of g.contours) body += roundedPoly(c, xf);
    if (g.tittle) {
      const t = g.tittle;
      const cy = t.top + t.R * Math.cos(Math.PI / 5);
      dot += roundedPoly(pentagon(t.cx, cy, t.R, 3.2), xf);
    }
    x += g.w + gap;
  }
  return { body, dot, width: (x + 100 * SKEW) * s, height: 100 * s };
}

// ── mark: pentagon badge + italic 5 ──────────────────────────────
function mark(cx, cy, R, { shadow = true, ring = true, id = "m" } = {}) {
  const r = R * 0.2;
  // centre the pentagon's bbox on (cx, cy)
  const pcy = cy - PENT_H(R) / 2 + R * Math.cos(Math.PI / 5);
  const badge = roundedPoly(pentagon(cx, pcy, R, r), plain(0, 0, 1));
  const inner = roundedPoly(pentagon(cx, pcy, R * 0.86, r * 0.78), plain(0, 0, 1));
  // the 5: cap height relative to R, optically centred a touch above the bbox centre
  const s = (R * 0.93) / 100;
  const gw = (G5.w + 100 * SKEW) * s;
  const ox = cx - gw / 2 + R * 0.015;
  const oy = pcy - 50 * s - R * 0.06;
  const five = G5.contours.map((c) => roundedPoly(c, italic(ox, oy, s))).join("");
  const fiveShadow = G5.contours
    .map((c) => roundedPoly(c, italic(ox + R * 0.045, oy + R * 0.06, s)))
    .join("");
  const defs = `
    <linearGradient id="${id}-fill" x1="0.15" y1="0" x2="0.75" y2="1">
      <stop offset="0" stop-color="${C.hi}"/>
      <stop offset="0.45" stop-color="${C.p6}"/>
      <stop offset="1" stop-color="${C.p7}"/>
    </linearGradient>
    <linearGradient id="${id}-ring" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.08"/>
    </linearGradient>`;
  const body = `
    <path d="${badge}" fill="url(#${id}-fill)"/>
    ${ring ? `<path d="${inner}" fill="none" stroke="url(#${id}-ring)" stroke-width="${fmt(R * 0.028)}"/>` : ""}
    ${shadow ? `<path d="${fiveShadow}" fill="${C.p9}" fill-opacity="0.45"/>` : ""}
    <path d="${five}" fill="${C.white}"/>`;
  return { defs, body, w: PENT_W(R), h: PENT_H(R) };
}

const svg = (w, h, inner, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}"${extra}>${inner}</svg>\n`;

const files = {};

// mark (tight)
{
  const R = 256;
  const m = mark(PENT_W(R) / 2, PENT_H(R) / 2, R);
  files["5iveg-mark.svg"] = svg(PENT_W(R), PENT_H(R), `<defs>${m.defs}</defs>${m.body}`);
}

// wordmarks
for (const [name, ink] of [["white", C.white], ["black", C.ink]]) {
  const s = 1;
  const pad = 2;
  const w = wordmark(pad, pad, s);
  files[`5iveg-wordmark-${name}.svg`] = svg(
    w.width + pad * 2,
    w.height + pad * 2,
    `<path d="${w.body}" fill="${ink}"/><path d="${w.dot}" fill="${C.p5}"/>`
  );
}

// horizontal lockup: mark height = 1.45 × cap height
for (const [name, ink] of [["white", C.white], ["black", C.ink]]) {
  const cap = 100;
  const mh = cap * 1.45;
  const R = mh / PENT_H(1);
  const mw = PENT_W(R);
  const gap = 30;
  const m = mark(mw / 2, mh / 2, R, { id: "l" });
  const w = wordmark(mw + gap, (mh - cap) / 2, cap / 100);
  const W = mw + gap + w.width;
  files[`5iveg-logo-${name}.svg`] = svg(
    W,
    mh,
    `<defs>${m.defs}</defs>${m.body}<path d="${w.body}" fill="${ink}"/><path d="${w.dot}" fill="${C.p5}"/>`
  );
}

// stacked lockup (mark over wordmark)
for (const [name, ink] of [["white", C.white], ["black", C.ink]]) {
  const cap = 100;
  const w0 = wordmark(0, 0, 1);
  const R = 120;
  const mh = PENT_H(R);
  const gap = 40;
  const W = Math.max(PENT_W(R), w0.width);
  const m = mark(W / 2, mh / 2, R, { id: "s" });
  const w = wordmark((W - w0.width) / 2, mh + gap, cap / 100);
  files[`5iveg-logo-stacked-${name}.svg`] = svg(
    W,
    mh + gap + cap,
    `<defs>${m.defs}</defs>${m.body}<path d="${w.body}" fill="${ink}"/><path d="${w.dot}" fill="${C.p5}"/>`
  );
}

// app icon (1024, full bleed; iOS applies its own mask)
{
  const S = 1024;
  const m = mark(S / 2, S / 2 + 8, 396, { id: "a" });
  files["5iveg-app-icon.svg"] = svg(
    S,
    S,
    `<defs>
      <radialGradient id="bg" cx="0.5" cy="0.38" r="0.75">
        <stop offset="0" stop-color="#2e0f52"/>
        <stop offset="0.6" stop-color="#140822"/>
        <stop offset="1" stop-color="#0a0a0a"/>
      </radialGradient>
      ${m.defs}
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    ${m.body}`
  );
}

// favicon: plain badge, no ring/shadow (they turn to mush at 16px)
{
  const R = 256;
  const m = mark(PENT_W(R) / 2, PENT_W(R) / 2, R, { shadow: false, ring: false, id: "f" });
  files["5iveg-favicon.svg"] = svg(PENT_W(R), PENT_W(R), `<defs>${m.defs}</defs>${m.body}`);
}

for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), s);

// ── PNG exports ─────────────────────────────────────────────────
const png = (f, w, out) =>
  sharp(Buffer.from(files[f]), { density: 300 }).resize(w).png().toFile(path.join(OUT, out));
await png("5iveg-app-icon.svg", 1024, "5iveg-app-icon.png");
await png("5iveg-mark.svg", 1024, "5iveg-mark-1024.png");
await png("5iveg-logo-white.svg", 1600, "5iveg-logo-white.png");
await png("5iveg-logo-black.svg", 1600, "5iveg-logo-black.png");
console.log(`wrote ${Object.keys(files).length} SVGs + 4 PNGs to ${OUT}/`);

// ── preview sheet ───────────────────────────────────────────────
if (!PREV) process.exit(0);
fs.mkdirSync(PREV, { recursive: true });
const b64 = (s) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
const pngB64 = async (f, w) =>
  "data:image/png;base64," +
  (await sharp(Buffer.from(files[f]), { density: 300 }).resize(w).png().toBuffer()).toString("base64");
const img = (href, x, y, w, h) => `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const aspect = (f) => {
  const m = files[f].match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return +m[2] / +m[1];
};

const PW = 1600;
let y = 0;
let sheet = "";
// dark hero
sheet += `<rect x="0" y="0" width="${PW}" height="520" fill="${C.ink}"/>`;
{
  const w = 980;
  const hh = w * aspect("5iveg-logo-white.svg");
  sheet += img(b64(files["5iveg-logo-white.svg"]), (PW - w) / 2, (520 - hh) / 2, w, hh);
}
y = 520;
// light hero
sheet += `<rect x="0" y="${y}" width="${PW}" height="380" fill="#f5f5f7"/>`;
{
  const w = 720;
  const hh = w * aspect("5iveg-logo-black.svg");
  sheet += img(b64(files["5iveg-logo-black.svg"]), (PW - w) / 2, y + (380 - hh) / 2, w, hh);
}
y += 380;
// row: app icons + stacked + favicon sizes
sheet += `<rect x="0" y="${y}" width="${PW}" height="460" fill="#18181b"/>`;
{
  const icon = b64(files["5iveg-app-icon.svg"]);
  const sizes = [240, 120, 60];
  let x = 90;
  for (const s of sizes) {
    const r = s * 0.2237;
    sheet += `<clipPath id="ic${s}"><rect x="${x}" y="${y + 230 - s / 2}" width="${s}" height="${s}" rx="${r}"/></clipPath>`;
    sheet += `<g clip-path="url(#ic${s})">${img(icon, x, y + 230 - s / 2, s, s)}</g>`;
    x += s + 50;
  }
  const sw = 300;
  const sh = sw * aspect("5iveg-logo-stacked-white.svg");
  sheet += img(b64(files["5iveg-logo-stacked-white.svg"]), 760, y + 230 - sh / 2, sw, sh);
  let fx = 1180;
  for (const s of [64, 32, 16]) {
    const p = await pngB64("5iveg-favicon.svg", s);
    sheet += `<rect x="${fx - 8}" y="${y + 230 - s / 2 - 8}" width="${s + 16}" height="${s + 16}" rx="6" fill="#fff"/>`;
    sheet += img(p, fx, y + 230 - s / 2, s, s);
    fx += s + 50;
  }
}
y += 460;
const sheetSvg = svg(PW, y, sheet, ' xmlns:xlink="http://www.w3.org/1999/xlink"');
fs.writeFileSync(path.join(PREV, "sheet.svg"), sheetSvg);
await sharp(Buffer.from(sheetSvg)).png().toFile(path.join(PREV, "sheet.png"));
console.log(`wrote ${PREV}/sheet.png`);

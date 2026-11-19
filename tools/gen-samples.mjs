// gen-samples.mjs — makes the three sample scenes for Sunset Cover Studio.
// Every pixel is drawn procedurally here (gradients, sun, sea, palms, skyline,
// neon windows, grain) and written out as a plain PNG with a small encoder built
// on node:zlib. No photo, font or image is read in: the samples are original art.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'samples');

// ---------- tiny deterministic random ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- pixel buffer ----------
class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.px = new Float32Array(w * h * 3);
  }
  set(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b;
  }
  // blend a colour over the pixel with alpha 0..1
  over(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    const inv = 1 - a;
    this.px[i] = this.px[i] * inv + r * a;
    this.px[i + 1] = this.px[i + 1] * inv + g * a;
    this.px[i + 2] = this.px[i + 2] * inv + b * a;
  }
  get(x, y) {
    const i = (Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// vertical multi-stop gradient
function vGradient(cv, stops) {
  for (let y = 0; y < cv.h; y++) {
    const t = y / (cv.h - 1);
    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k][0] && t <= stops[k + 1][0]) { s0 = stops[k]; s1 = stops[k + 1]; break; }
    }
    const f = (t - s0[0]) / Math.max(1e-6, s1[0] - s0[0]);
    const r = lerp(s0[1][0], s1[1][0], f), g = lerp(s0[1][1], s1[1][1], f), b = lerp(s0[1][2], s1[1][2], f);
    for (let x = 0; x < cv.w; x++) cv.set(x, y, r, g, b);
  }
}

// soft disc (radial falloff) blended over
function glowDisc(cv, cx, cy, r, col, strength) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(cv.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(cv.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2) / r;
      const a = strength * Math.pow(1 - d, 2);
      cv.over(x, y, col[0], col[1], col[2], a);
    }
  }
}

// hard disc
function disc(cv, cx, cy, r, col) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(cv.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(cv.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) cv.set(x, y, col[0], col[1], col[2]);
    }
  }
}

function rect(cv, x0, y0, x1, y1, col) {
  for (let y = Math.max(0, y0); y < Math.min(cv.h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(cv.w, x1); x++) cv.set(x, y, col[0], col[1], col[2]);
}

// scanline polygon fill
function poly(cv, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.max(0, Math.ceil(minY)); y <= Math.min(cv.h - 1, Math.floor(maxY)); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(cv.w - 1, Math.floor(xs[k + 1])); x++) {
        cv.set(x, y, col[0], col[1], col[2]);
      }
    }
  }
}

// palm silhouette: curved trunk + drooping fronds
function palm(cv, bx, by, h, lean, col, rnd) {
  const topX = bx + lean * h, topY = by - h;
  // trunk: chain of overlapping discs along a quadratic curve
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = lerp(lerp(bx, bx + lean * h * 0.4, t), topX, t * t);
    const y = lerp(by, topY, t * t * 0.9 + t * 0.1);
    const r = Math.max(2, h * 0.016 * (1 - t * 0.55));
    disc(cv, x, y, r, col);
  }
  // fronds: long tapered triangles drooping from the crown
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const ang = (-0.15 - i * (Math.PI * 0.95) / (fronds - 1)) + (rnd() - 0.5) * 0.08;
    const len = h * (0.34 + rnd() * 0.12);
    const tipX = topX + Math.cos(ang) * len;
    const tipY = topY + Math.abs(Math.sin(ang)) * len * 0.55 + len * 0.16;
    const wdt = h * 0.035;
    const px = -Math.sin(ang), py = Math.cos(ang);
    poly(cv, [
      [topX + px * wdt, topY + py * wdt],
      [topX - px * wdt, topY - py * wdt],
      [tipX, tipY],
    ], col);
  }
  // coconuts
  disc(cv, topX - h * 0.02, topY + h * 0.02, h * 0.018, col);
  disc(cv, topX + h * 0.02, topY + h * 0.025, h * 0.016, col);
}

// film grain: sparse speckles so the PNG still compresses well
function grain(cv, amount, seed) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < cv.px.length; i += 3) {
    if (rnd() > 0.28) continue; // only ~28% of pixels get a speckle
    const n = (rnd() - 0.5) * amount;
    cv.px[i] += n; cv.px[i + 1] += n; cv.px[i + 2] += n;
  }
}

// ---------- PNG encoder (8-bit RGB, filter 0) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function toPNG(cv) {
  const raw = Buffer.alloc(cv.h * (1 + cv.w * 3));
  for (let y = 0; y < cv.h; y++) {
    raw[y * (1 + cv.w * 3)] = 0;
    for (let x = 0; x < cv.w; x++) {
      const s = (y * cv.w + x) * 3, d = y * (1 + cv.w * 3) + 1 + x * 3;
      raw[d] = Math.max(0, Math.min(255, Math.round(cv.px[s])));
      raw[d + 1] = Math.max(0, Math.min(255, Math.round(cv.px[s + 1])));
      raw[d + 2] = Math.max(0, Math.min(255, Math.round(cv.px[s + 2])));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- scene 1: sunset beach ----------
function sunsetBeach() {
  const W = 1080, H = 1350, cv = new Canvas(W, H);
  const rnd = mulberry32(11);
  vGradient(cv, [
    [0.00, [26, 16, 64]], [0.22, [94, 38, 110]], [0.42, [214, 84, 96]],
    [0.55, [255, 150, 80]], [0.62, [255, 196, 110]], [0.66, [255, 170, 120]],
    [1.00, [58, 24, 66]],
  ]);
  // sun + glow
  glowDisc(cv, W * 0.5, H * 0.52, 420, [255, 190, 90], 0.55);
  glowDisc(cv, W * 0.5, H * 0.52, 200, [255, 230, 170], 0.7);
  disc(cv, W * 0.5, H * 0.52, 118, [255, 244, 214]);
  // retro slats across the sun's lower half
  for (let k = 0; k < 5; k++) {
    const y = H * 0.52 + 18 + k * 20;
    const half = Math.sqrt(Math.max(0, 118 * 118 - (y - H * 0.52) ** 2));
    rect(cv, W * 0.5 - half, y, W * 0.5 + half, y + 5 + k * 2, [255, 170, 120]);
  }
  // sea: warm band with a bright reflection column under the sun
  const horizon = Math.floor(H * 0.62);
  for (let y = horizon; y < H; y++) {
    const t = (y - horizon) / (H - horizon);
    const base = [lerp(255, 40, t), lerp(150, 20, t), lerp(90, 50, t)];
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - W * 0.5) / (W * 0.5);
      const shimmer = Math.sin(y * 0.35 + Math.sin(x * 0.02) * 3) * 0.5 + 0.5;
      const refl = Math.pow(1 - dx, 3) * (0.35 + 0.65 * shimmer) * (1 - t * 0.6);
      cv.set(x, y, base[0] + 90 * refl, base[1] + 60 * refl, base[2] + 20 * refl);
    }
  }
  // distant headland
  poly(cv, [[0, H * 0.60], [W * 0.30, H * 0.585], [W * 0.42, H * 0.62], [0, H * 0.63]], [44, 18, 58]);
  // beach foreground
  poly(cv, [[0, H], [0, H * 0.86], [W, H * 0.80], [W, H]], [52, 22, 52]);
  // wet sand sheen
  for (let y = Math.floor(H * 0.86); y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - W * 0.5) / (W * 0.5);
      cv.over(x, y, 255, 150, 90, Math.pow(1 - dx, 2) * 0.10);
    }
  }
  // palms left and right
  palm(cv, W * 0.10, H * 0.99, H * 0.42, 0.16, [24, 8, 30], rnd);
  palm(cv, W * 0.92, H * 0.97, H * 0.36, -0.20, [24, 8, 30], rnd);
  palm(cv, W * 0.24, H * 1.0, H * 0.26, 0.10, [30, 10, 34], rnd);
  grain(cv, 14, 101);
  return cv;
}

// ---------- scene 2: neon street ----------
function neonStreet() {
  const W = 1080, H = 1350, cv = new Canvas(W, H);
  const rnd = mulberry32(22);
  vGradient(cv, [
    [0.00, [10, 8, 34]], [0.45, [30, 14, 62]], [0.70, [74, 22, 84]], [1.00, [16, 8, 30]],
  ]);
  glowDisc(cv, W * 0.78, H * 0.30, 260, [255, 60, 170], 0.35);
  glowDisc(cv, W * 0.18, H * 0.42, 220, [40, 220, 255], 0.30);
  // buildings: dark blocks with lit windows
  const blocks = [
    [0.00, 0.30, 0.16, 0.78], [0.17, 0.42, 0.15, 0.86], [0.33, 0.26, 0.17, 0.80],
    [0.51, 0.38, 0.16, 0.84], [0.68, 0.24, 0.15, 0.78], [0.84, 0.34, 0.16, 0.88],
  ];
  const litCols = [[255, 214, 120], [80, 230, 255], [255, 90, 190], [150, 255, 170]];
  for (const [fx, fy, fw, fh] of blocks) {
    const x0 = Math.floor(W * fx), y0 = Math.floor(H * fy), x1 = Math.floor(W * (fx + fw)), y1 = Math.floor(H * fh);
    rect(cv, x0, y0, x1, y1, [14, 10, 30]);
    // rooftop antenna / sign block
    if (rnd() > 0.4) rect(cv, x0 + (x1 - x0) * 0.4, y0 - 26, x0 + (x1 - x0) * 0.6, y0, [14, 10, 30]);
    for (let wy = y0 + 14; wy < y1 - 12; wy += 26) {
      for (let wx = x0 + 10; wx < x1 - 12; wx += 24) {
        if (rnd() < 0.42) {
          const c = litCols[Math.floor(rnd() * litCols.length)];
          rect(cv, wx, wy, wx + 12, wy + 15, c);
          glowDisc(cv, wx + 6, wy + 7, 12, c, 0.5);
        } else {
          rect(cv, wx, wy, wx + 12, wy + 15, [26, 20, 48]);
        }
      }
    }
  }
  // neon sign bars (vertical shop signs)
  const signs = [
    [W * 0.30, H * 0.52, [255, 46, 166]], [W * 0.62, H * 0.46, [46, 220, 255]], [W * 0.88, H * 0.56, [255, 200, 60]],
  ];
  for (const [sx, sy, col] of signs) {
    glowDisc(cv, sx, sy, 60, col, 0.8);
    rect(cv, sx - 8, sy - 90, sx + 8, sy + 90, col);
    rect(cv, sx - 3, sy - 90, sx + 3, sy + 90, [255, 255, 255]);
  }
  // wet street with reflections
  for (let y = Math.floor(H * 0.80); y < H; y++) {
    const t = (y - H * 0.80) / (H * 0.20);
    for (let x = 0; x < W; x++) {
      const above = cv.get(x, Math.floor(H * 0.80 - (y - H * 0.80) * 0.55));
      const wob = Math.sin(x * 0.05 + y * 0.2) * 0.5 + 0.5;
      cv.set(x, y,
        lerp(12, above[0], 0.45 * (1 - t * 0.5) * (0.6 + 0.4 * wob)),
        lerp(10, above[1], 0.45 * (1 - t * 0.5) * (0.6 + 0.4 * wob)),
        lerp(26, above[2], 0.45 * (1 - t * 0.5) * (0.6 + 0.4 * wob)));
    }
  }
  // street light streaks
  for (const sx of [W * 0.30, W * 0.62, W * 0.88]) {
    for (let y = Math.floor(H * 0.80); y < H; y++) {
      const t = (y - H * 0.80) / (H * 0.20);
      cv.over(sx - 3 + Math.sin(y * 0.1) * 2, y, 255, 120, 200, 0.35 * (1 - t));
      cv.over(sx + 3 + Math.sin(y * 0.1) * 2, y, 255, 120, 200, 0.25 * (1 - t));
    }
  }
  grain(cv, 12, 202);
  return cv;
}

// ---------- scene 3: skyline at dusk ----------
function skylineDusk() {
  const W = 1080, H = 1350, cv = new Canvas(W, H);
  const rnd = mulberry32(33);
  vGradient(cv, [
    [0.00, [14, 42, 66]], [0.30, [38, 96, 120]], [0.48, [214, 130, 90]],
    [0.58, [255, 176, 110]], [0.64, [240, 140, 110]], [1.00, [30, 26, 54]],
  ]);
  // low sun + long glow
  glowDisc(cv, W * 0.68, H * 0.55, 380, [255, 180, 90], 0.5);
  disc(cv, W * 0.68, H * 0.55, 84, [255, 238, 200]);
  // cloud bands
  for (let k = 0; k < 9; k++) {
    const cy = H * (0.10 + rnd() * 0.34), cw = W * (0.25 + rnd() * 0.5), ch = 10 + rnd() * 16;
    const cx = W * rnd();
    const col = [255, 150 + rnd() * 60, 120];
    for (let y = Math.floor(cy - ch); y < Math.floor(cy + ch); y++) {
      for (let x = Math.floor(cx - cw); x < Math.floor(cx + cw); x++) {
        const dx = (x - cx) / cw, dy = (y - cy) / ch;
        const d = dx * dx + dy * dy;
        if (d < 1) cv.over(x, y, col[0], col[1], col[2], 0.35 * (1 - d));
      }
    }
  }
  // far skyline (hazy)
  const far = [[0.00, 0.52, 0.12], [0.11, 0.46, 0.10], [0.22, 0.54, 0.14], [0.36, 0.48, 0.12], [0.48, 0.55, 0.13], [0.60, 0.47, 0.11], [0.71, 0.53, 0.14], [0.85, 0.49, 0.15]];
  for (const [fx, fy, fw] of far) {
    rect(cv, W * fx, H * fy, W * (fx + fw), H * 0.72, [72, 52, 86]);
  }
  // near skyline (dark, windows)
  const near = [[0.00, 0.58, 0.13, 0.06], [0.12, 0.50, 0.11, 0.10], [0.24, 0.60, 0.12, 0.05], [0.37, 0.54, 0.12, 0.08], [0.50, 0.62, 0.11, 0.04], [0.62, 0.52, 0.12, 0.09], [0.75, 0.60, 0.12, 0.05], [0.88, 0.56, 0.12, 0.07]];
  for (const [fx, fy, fw, spire] of near) {
    const x0 = Math.floor(W * fx), y0 = Math.floor(H * fy), x1 = Math.floor(W * (fx + fw));
    rect(cv, x0, y0, x1, H * 0.86, [20, 14, 34]);
    if (spire > 0.06) rect(cv, x0 + (x1 - x0) * 0.42, y0 - H * spire, x0 + (x1 - x0) * 0.58, y0, [20, 14, 34]);
    for (let wy = y0 + 12; wy < H * 0.84; wy += 24) {
      for (let wx = x0 + 8; wx < x1 - 10; wx += 22) {
        if (rnd() < 0.30) rect(cv, wx, wy, wx + 9, wy + 12, [255, 200, 110]);
      }
    }
  }
  // water at the bottom with sun reflection
  for (let y = Math.floor(H * 0.86); y < H; y++) {
    const t = (y - H * 0.86) / (H * 0.14);
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - W * 0.68) / (W * 0.68);
      const shimmer = Math.sin(y * 0.4 + Math.sin(x * 0.03) * 4) * 0.5 + 0.5;
      const refl = Math.pow(1 - dx, 2.5) * (0.3 + 0.7 * shimmer) * (1 - t * 0.5);
      cv.set(x, y, 26 + 200 * refl, 22 + 130 * refl, 52 + 50 * refl);
    }
  }
  // foreground palms
  palm(cv, W * 0.06, H * 1.0, H * 0.30, 0.14, [16, 10, 28], rnd);
  palm(cv, W * 0.95, H * 0.99, H * 0.26, -0.16, [16, 10, 28], rnd);
  grain(cv, 13, 303);
  return cv;
}

const scenes = [
  ['sunset-beach.png', sunsetBeach],
  ['neon-street.png', neonStreet],
  ['skyline-dusk.png', skylineDusk],
];
for (const [name, fn] of scenes) {
  const png = toPNG(fn());
  writeFileSync(join(outDir, name), png);
  console.log(name, png.length, 'bytes');
}

// cover.js — the cover renderer for Sunset Cover Studio.
// Everything a cover is made of lives here: panel layouts, photo grades,
// the retro sun / palm / skyline decorations, the big poster lettering and
// the grain + vignette finish. Pure canvas 2D, no library, no network.
export const SAMPLES = [
  { id: 'sunset-beach', label: 'Sunset Beach', file: 'samples/sunset-beach.png' },
  { id: 'neon-street', label: 'Neon Street', file: 'samples/neon-street.png' },
  { id: 'skyline-dusk', label: 'Skyline Dusk', file: 'samples/skyline-dusk.png' },
];

export const LAYOUTS = [
  { id: 'poster', label: 'Poster', hint: 'Hero photo up top, two panels below' },
  { id: 'triptych', label: 'Triptych', hint: 'Three tall panels side by side' },
  { id: 'duo', label: 'Duo', hint: 'One big panel, two small ones' },
  { id: 'solo', label: 'Solo', hint: 'One photo, full bleed' },
];

export const GRADES = [
  { id: 'sunset', label: 'Vice Sunset', filter: 'saturate(1.45) contrast(1.06) sepia(0.22) hue-rotate(-10deg) brightness(1.02)' },
  { id: 'neon', label: 'Neon Nights', filter: 'saturate(1.85) contrast(1.12) hue-rotate(16deg) brightness(1.0)' },
  { id: 'noir', label: 'Palm Noir', filter: 'grayscale(1) contrast(1.28) brightness(1.06)' },
  { id: 'clean', label: 'Clean', filter: 'saturate(1.06) contrast(1.02)' },
];

export const LETTERINGS = [
  { id: 'sunset', label: 'Sunset Fade' },
  { id: 'neon', label: 'Neon Glow' },
  { id: 'mono', label: 'Bold Mono' },
];

export const SIZES = [
  { id: '1920x1080', label: '1920 × 1080', w: 1920, h: 1080, hint: 'Landscape post' },
  { id: '1080x1080', label: '1080 × 1080', w: 1080, h: 1080, hint: 'Square post' },
  { id: '1080x1350', label: '1080 × 1350', w: 1080, h: 1350, hint: 'Portrait post' },
];

export function defaultState() {
  return {
    layout: 'poster',
    grade: 'sunset',
    lettering: 'sunset',
    titlePos: 'bottom',
    title: 'SUNSET HEIST',
    subtitle: 'THREE PANELS · ONE LAST SCORE',
    tag: 'SUNSET COVER STUDIO',
    size: '1920x1080',
    slots: [
      { img: null, name: '', zoom: 1, panX: 0, panY: 0, flip: false },
      { img: null, name: '', zoom: 1, panX: 0, panY: 0, flip: false },
      { img: null, name: '', zoom: 1, panX: 0, panY: 0, flip: false },
    ],
  };
}

// Deterministic pseudo-random, so a cover renders the same every time.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Panel rectangles for a layout, as fractions of the cover. Each panel names
// the photo slot (0, 1 or 2) that fills it.
export function layoutPanels(layout, W, H) {
  const g = Math.max(4, Math.round(W * 0.008)); // gap between panels
  const hero = H * 0.60;
  switch (layout) {
    case 'triptych': {
      const w = (W - g * 2) / 3;
      return [
        { x: 0, y: 0, w, h: H, slot: 0 },
        { x: w + g, y: 0, w, h: H, slot: 1 },
        { x: (w + g) * 2, y: 0, w, h: H, slot: 2 },
      ];
    }
    case 'duo': {
      const left = W * 0.58;
      return [
        { x: 0, y: 0, w: left - g, h: H, slot: 0 },
        { x: left, y: 0, w: W - left, h: (H - g) / 2, slot: 1 },
        { x: left, y: (H + g) / 2, w: W - left, h: (H - g) / 2, slot: 2 },
      ];
    }
    case 'solo':
      return [{ x: 0, y: 0, w: W, h: H, slot: 0 }];
    case 'poster':
    default: {
      const bw = (W - g) / 2;
      return [
        { x: 0, y: 0, w: W, h: hero, slot: 0 },
        { x: 0, y: hero + g, w: bw, h: H - hero - g, slot: 1 },
        { x: bw + g, y: hero + g, w: bw, h: H - hero - g, slot: 2 },
      ];
    }
  }
}

function gradeById(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

// Draw one photo into a panel: cover-fit, zoom + pan, flip, colour grade,
// a warm or neon tint wash, then a soft vignette.
export function drawPhotoPanel(ctx, panel, slot, gradeId) {
  const { x, y, w, h } = panel;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (!slot || !slot.img) {
    drawEmptyPanel(ctx, panel);
    ctx.restore();
    return;
  }
  const img = slot.img;
  const zoom = slot.zoom || 1;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2 + (slot.panX || 0) * w;
  const dy = (h - dh) / 2 + (slot.panY || 0) * h;
  ctx.filter = gradeById(gradeId).filter;
  if (slot.flip) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, x + dx, y + dy, dw, dh);
  }
  ctx.filter = 'none';
  applyGradeWash(ctx, panel, gradeId);
  drawPanelVignette(ctx, panel);
  ctx.restore();
}

// A slot with no photo yet still looks designed: dusk gradient, retro sun,
// palms, and a quiet invitation.
function drawEmptyPanel(ctx, panel) {
  const { x, y, w, h } = panel;
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#2a1250');
  sky.addColorStop(0.55, '#c94a6d');
  sky.addColorStop(1, '#ff9a4d');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  drawRetroSun(ctx, x + w * 0.5, y + h * 0.42, Math.min(w, h) * 0.22, ['#ffe9b0', '#ff7a3c']);
  drawPalmSilhouette(ctx, x + w * 0.12, y + h, h * 0.42, 0.14, 'rgba(20,8,30,0.9)');
  drawPalmSilhouette(ctx, x + w * 0.88, y + h, h * 0.36, -0.16, 'rgba(20,8,30,0.9)');
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 ${Math.max(13, Math.round(h * 0.035))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ADD A PHOTO', x + w / 2, y + h * 0.78);
}

// Warm / neon tint wash over a graded photo.
function applyGradeWash(ctx, panel, gradeId) {
  const { x, y, w, h } = panel;
  let wash = null;
  if (gradeId === 'sunset') {
    wash = ctx.createLinearGradient(0, y, 0, y + h);
    wash.addColorStop(0, 'rgba(255,120,40,0.10)');
    wash.addColorStop(1, 'rgba(180,30,120,0.20)');
  } else if (gradeId === 'neon') {
    wash = ctx.createLinearGradient(x, y, x + w, y + h);
    wash.addColorStop(0, 'rgba(255,0,150,0.14)');
    wash.addColorStop(1, 'rgba(0,220,255,0.14)');
  }
  if (!wash) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawPanelVignette(ctx, panel) {
  const { x, y, w, h } = panel;
  const v = ctx.createRadialGradient(
    x + w / 2, y + h / 2, Math.min(w, h) * 0.35,
    x + w / 2, y + h / 2, Math.max(w, h) * 0.75,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,4,20,0.30)');
  ctx.fillStyle = v;
  ctx.fillRect(x, y, w, h);
}

// Retro sun: a disc with horizontal slats cut out of its lower half.
export function drawRetroSun(ctx, cx, cy, r, colors) {
  const grad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 4; k++) {
    const yy = cy + r * 0.08 + k * r * 0.20;
    ctx.fillRect(cx - r, yy, r * 2, r * (0.05 + k * 0.02));
  }
  ctx.restore();
}

// Palm silhouette: a leaning trunk and drooping fronds, drawn as paths.
export function drawPalmSilhouette(ctx, bx, by, h, lean, color) {
  const topX = bx + lean * h;
  const topY = by - h;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  // trunk, tapering
  for (let t = 0; t < 1; t += 0.08) {
    const x0 = bx + lean * h * t * t;
    const y0 = by - h * t;
    const x1 = bx + lean * h * (t + 0.08) * (t + 0.08);
    const y1 = by - h * (t + 0.08);
    ctx.lineWidth = Math.max(1.5, h * 0.022 * (1 - t * 0.6));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // fronds
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const ang = -0.12 - (i * Math.PI * 0.96) / (fronds - 1);
    const len = h * (0.36 + (i % 3) * 0.03);
    const tipX = topX + Math.cos(ang) * len;
    const tipY = topY + Math.abs(Math.sin(ang)) * len * 0.5 + len * 0.18;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + Math.cos(ang) * len * 0.55, topY + len * 0.05, tipX, tipY);
    ctx.quadraticCurveTo(topX + Math.cos(ang) * len * 0.5, topY + len * 0.22, topX, topY);
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(topX - h * 0.02, topY + h * 0.02, h * 0.018, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(topX + h * 0.02, topY + h * 0.025, h * 0.015, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A low skyline silhouette with a few lit windows, for the hero panel.
export function drawSkylineSilhouette(ctx, x, y, w, h, seed) {
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.fillStyle = 'rgba(16,8,28,0.85)';
  let bx = x;
  while (bx < x + w) {
    const bw = w * (0.08 + rnd() * 0.09);
    const bh = h * (0.35 + rnd() * 0.55);
    ctx.fillRect(bx, y + h - bh, bw, bh);
    if (rnd() > 0.5) ctx.fillRect(bx + bw * 0.35, y + h - bh - h * 0.12, bw * 0.3, h * 0.12);
    // lit windows
    ctx.fillStyle = 'rgba(255,205,110,0.9)';
    for (let wy = y + h - bh + 8; wy < y + h - 6; wy += 16) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 14) {
        if (rnd() < 0.28) ctx.fillRect(wx, wy, 5, 7);
      }
    }
    ctx.fillStyle = 'rgba(16,8,28,0.85)';
    bx += bw + w * 0.015;
  }
  ctx.restore();
}

// Wrap a title into at most two lines that fit the width.
function wrapTitle(ctx, title, maxWidth, fontSize) {
  const words = String(title || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [''];
  for (const word of words) {
    const trial = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth || !lines[lines.length - 1]) {
      lines[lines.length - 1] = trial;
    } else if (lines.length < 2) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${word}`;
    }
  }
  return lines;
}

// The big poster lettering: gradient fill, dark outline, coloured shadow.
export function drawTitleLettering(ctx, state, W, H) {
  const title = (state.title || '').trim() || 'UNTITLED';
  const maxWidth = W * 0.92;
  let fontSize = Math.round(H * 0.155);
  let lines = [title];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // shrink until the wrapped title fits
  for (;;) {
    ctx.font = `${fontSize}px Anton, 'Arial Narrow', sans-serif`;
    lines = wrapTitle(ctx, title, maxWidth, fontSize);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth || fontSize <= Math.round(H * 0.05)) break;
    fontSize = Math.round(fontSize * 0.92);
  }
  const lineHeight = fontSize * 1.02;
  const blockH = lines.length * lineHeight;
  const top = state.titlePos === 'top';
  const bandH = H * (top ? 0.30 : 0.34);
  const bandY = top ? 0 : H - bandH;
  const band = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (top) {
    band.addColorStop(0, 'rgba(12,4,24,0.62)');
    band.addColorStop(1, 'rgba(12,4,24,0)');
  } else {
    band.addColorStop(0, 'rgba(12,4,24,0)');
    band.addColorStop(1, 'rgba(12,4,24,0.62)');
  }
  ctx.fillStyle = band;
  ctx.fillRect(0, bandY, W, bandH);

  // Anchor the whole title + subtitle block from the edge it sits on, so the
  // subtitle always lands inside the cover instead of sliding off the bottom.
  const x = W * 0.045;
  const sub = (state.subtitle || '').trim();
  const subFontSize = Math.max(12, Math.round(H * 0.026));
  const subGap = sub ? Math.round(H * 0.032) : 0;
  const subBlock = sub ? subGap + subFontSize : 0;
  const padEdge = Math.round(H * 0.035);
  const firstBaseline = top
    ? bandY + H * 0.055 + fontSize
    : H - padEdge - subBlock - (lines.length - 1) * lineHeight;
  const lastTitleBaseline = firstBaseline + (lines.length - 1) * lineHeight;
  ctx.save();
  ctx.translate(x, firstBaseline);
  ctx.rotate(-0.015);
  const fill = ctx.createLinearGradient(0, 0, 0, blockH);
  let outline = '#160a24';
  let shadow = 'rgba(255,110,40,0.85)';
  if (state.lettering === 'sunset') {
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(0.55, '#ffd76a');
    fill.addColorStop(1, '#ff6a2e');
  } else if (state.lettering === 'neon') {
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(1, '#ffe9fb');
    outline = '#ff2ea6';
    shadow = 'rgba(0,220,255,0.9)';
  } else {
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(1, '#e8e8e8');
    shadow = 'rgba(0,0,0,0.8)';
  }
  ctx.font = `${fontSize}px Anton, 'Arial Narrow', sans-serif`;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = Math.round(W * 0.014);
  ctx.shadowOffsetY = Math.round(H * 0.008);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.085));
  ctx.strokeStyle = outline;
  ctx.fillStyle = fill;
  lines.forEach((line, i) => {
    const ly = i * lineHeight;
    ctx.strokeText(line, 0, ly);
    ctx.fillText(line, 0, ly);
  });
  ctx.restore();

  // subtitle, letterspaced caps under (or over) the title
  if (sub) {
    ctx.save();
    ctx.font = `700 ${subFontSize}px system-ui, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(H * 0.008)}px`; } catch { /* older canvas: no letter-spacing */ }
    ctx.fillStyle = state.lettering === 'neon' ? '#8ff4ff' : '#ffe9a8';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = Math.round(W * 0.004);
    ctx.textAlign = 'left';
    const subY = lastTitleBaseline + subGap + subFontSize;
    ctx.fillText(sub.toUpperCase(), x, subY);
    ctx.restore();
  }

  // small tag pill, top-right corner
  const tag = (state.tag || '').trim();
  if (tag) {
    ctx.save();
    const fs = Math.max(11, Math.round(H * 0.02));
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(tag.toUpperCase()).width;
    const padX = Math.round(W * 0.012);
    const padY = Math.round(H * 0.011);
    const bx = W - tw - padX * 2 - W * 0.02;
    const by = H * 0.025;
    ctx.fillStyle = 'rgba(12,4,24,0.72)';
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + padX * 2, fs + padY * 2, Math.round(fs * 0.9));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, Math.round(W * 0.0012));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(tag.toUpperCase(), bx + padX, by + padY + fs * 0.78);
    ctx.restore();
  }
}

// Film grain from a small seeded noise tile, drawn faintly over everything.
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const t = document.createElement('canvas');
  t.width = 160; t.height = 160;
  const c = t.getContext('2d');
  const img = c.createImageData(160, 160);
  const rnd = mulberry32(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 22;
  }
  c.putImageData(img, 0, 0);
  grainTile = t;
  return t;
}

function drawFinish(ctx, W, H) {
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,2,16,0.26)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // grain
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // white poster frame + thin inner keyline
  const fw = Math.max(3, Math.round(W * 0.007));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = fw * 2;
  ctx.strokeRect(fw, fw, W - fw * 2, H - fw * 2);
  ctx.strokeStyle = 'rgba(12,4,24,0.85)';
  ctx.lineWidth = Math.max(1, Math.round(W * 0.0015));
  ctx.strokeRect(fw * 2, fw * 2, W - fw * 4, H - fw * 4);
}

// Render a whole cover at exactly W x H. Returns the canvas it drew on.
export function renderCover(canvas, state, W, H) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14081f';
  ctx.fillRect(0, 0, W, H);
  const panels = layoutPanels(state.layout, W, H);
  const hero = panels[0];
  // a skyline + sun flourish behind the hero panel's lower edge
  for (const panel of panels) {
    drawPhotoPanel(ctx, panel, state.slots[panel.slot], state.grade);
  }
  // white keylines around every panel
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(W * 0.0035));
  for (const panel of panels) ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
  ctx.restore();
  // skyline + retro-sun flourish along the hero panel's lower edge, under the lettering
  ctx.save();
  ctx.beginPath();
  ctx.rect(hero.x, hero.y, hero.w, hero.h);
  ctx.clip();
  drawSkylineSilhouette(ctx, hero.x, hero.y + hero.h * 0.80, hero.w, hero.h * 0.20, 7);
  drawRetroSun(ctx, hero.x + hero.w * 0.82, hero.y + hero.h * 0.26, Math.min(hero.w, hero.h) * 0.11, ['#ffe9b0', '#ff7a3c']);
  ctx.restore();
  drawTitleLettering(ctx, state, W, H);
  drawFinish(ctx, W, H);
  return canvas;
}

// Render to a fresh offscreen canvas (handy for exports).
export function renderCoverToCanvas(state, W, H) {
  return renderCover(document.createElement('canvas'), state, W, H);
}

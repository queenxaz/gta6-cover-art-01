// app.js — the editor for Sunset Cover Studio.
// Wires the controls to the renderer in cover.js: photo slots, layouts,
// grades, lettering, export sizes, drag-to-pan on the preview, and the
// ?shot= screenshot mode the maker uses for the entry's screenshots.
import {
  SAMPLES, LAYOUTS, GRADES, LETTERINGS, SIZES,
  defaultState, layoutPanels, renderCover, renderCoverToCanvas,
} from './cover.js';

const $ = (id) => document.getElementById(id);
const state = defaultState();
let selectedSlot = 0;
let previewPanels = [];
let renderTimer = 0;

function sizeById(id) {
  return SIZES.find((s) => s.id === id) || SIZES[0];
}

// ---------- photo loading ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

async function loadSampleIntoSlot(slotIndex, sampleId) {
  const sample = SAMPLES.find((s) => s.id === sampleId) || SAMPLES[0];
  const img = await loadImage(sample.file);
  state.slots[slotIndex] = {
    img, name: sample.label, zoom: 1, panX: 0, panY: 0, flip: false,
  };
  refreshSlotCards();
  scheduleRender();
}

async function loadFileIntoSlot(slotIndex, file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    state.slots[slotIndex] = {
      img, name: file.name, zoom: 1, panX: 0, panY: 0, flip: false,
    };
    refreshSlotCards();
    scheduleRender();
    setStatus(`Photo loaded into panel ${slotIndex + 1}: ${file.name}`);
  } catch {
    setStatus('That file could not be read as an image.');
  }
}

// ---------- rendering ----------
function previewSize() {
  const size = sizeById(state.size);
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(size.w, size.h));
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) };
}

function renderPreview() {
  if (document.body.classList.contains('shot-cover')) return; // cover shot keeps its full-size canvas
  const canvas = $('preview');
  const { w, h } = previewSize();
  renderCover(canvas, state, w, h);
  previewPanels = layoutPanels(state.layout, w, h);
  window.__coverReady = true;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 30);
}

// ---------- status line ----------
function setStatus(text) {
  $('status').textContent = text;
}

// ---------- slot cards ----------
function buildSlotCards() {
  const wrap = $('slots');
  wrap.innerHTML = '';
  state.slots.forEach((slot, i) => {
    const card = document.createElement('article');
    card.className = 'slot';
    card.dataset.slot = String(i);
    card.innerHTML = `
      <header><span class="slot-num">Panel ${i + 1}</span><span class="slot-name"></span></header>
      <div class="slot-thumb"><span class="slot-empty">No photo yet</span></div>
      <div class="slot-actions">
        <label class="btn small">Upload photo<input type="file" accept="image/*" hidden></label>
        <button type="button" class="btn small ghost sample-btn">Try a sample</button>
        <button type="button" class="btn small ghost clear-btn">Clear</button>
      </div>
      <label class="slider">Zoom <input type="range" class="zoom" min="1" max="2.5" step="0.01" value="1"></label>
      <label class="slider">Pan X <input type="range" class="panx" min="-0.5" max="0.5" step="0.01" value="0"></label>
      <label class="slider">Pan Y <input type="range" class="pany" min="-0.5" max="0.5" step="0.01" value="0"></label>
      <label class="check"><input type="checkbox" class="flip"> Flip horizontally</label>`;
    card.addEventListener('click', () => selectSlot(i));
    card.querySelector('input[type=file]').addEventListener('change', (e) => {
      loadFileIntoSlot(i, e.target.files[0]);
      e.target.value = '';
    });
    card.querySelector('.sample-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      selectSlot(i);
      loadSampleIntoSlot(i, SAMPLES[i % SAMPLES.length].id);
    });
    card.querySelector('.clear-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.slots[i] = { img: null, name: '', zoom: 1, panX: 0, panY: 0, flip: false };
      refreshSlotCards();
      scheduleRender();
    });
    const zoom = card.querySelector('.zoom');
    zoom.addEventListener('input', () => { state.slots[i].zoom = Number(zoom.value); scheduleRender(); });
    const panx = card.querySelector('.panx');
    panx.addEventListener('input', () => { state.slots[i].panX = Number(panx.value); scheduleRender(); });
    const pany = card.querySelector('.pany');
    pany.addEventListener('input', () => { state.slots[i].panY = Number(pany.value); scheduleRender(); });
    card.querySelector('.flip').addEventListener('change', (e) => {
      state.slots[i].flip = e.target.checked;
      scheduleRender();
    });
    wrap.appendChild(card);
  });
  refreshSlotCards();
}

function refreshSlotCards() {
  document.querySelectorAll('.slot').forEach((card, i) => {
    const slot = state.slots[i];
    card.classList.toggle('selected', i === selectedSlot);
    card.querySelector('.slot-name').textContent = slot.name || '—';
    const thumb = card.querySelector('.slot-thumb');
    thumb.innerHTML = '';
    if (slot.img) {
      const mini = document.createElement('canvas');
      mini.width = 120; mini.height = 80;
      const c = mini.getContext('2d');
      const scale = Math.max(120 / slot.img.naturalWidth, 80 / slot.img.naturalHeight);
      c.drawImage(slot.img,
        (120 - slot.img.naturalWidth * scale) / 2,
        (80 - slot.img.naturalHeight * scale) / 2,
        slot.img.naturalWidth * scale, slot.img.naturalHeight * scale);
      thumb.appendChild(mini);
    } else {
      thumb.innerHTML = '<span class="slot-empty">No photo yet</span>';
    }
    card.querySelector('.zoom').value = String(slot.zoom);
    card.querySelector('.panx').value = String(slot.panX);
    card.querySelector('.pany').value = String(slot.panY);
    card.querySelector('.flip').checked = !!slot.flip;
  });
}

function selectSlot(i) {
  selectedSlot = i;
  refreshSlotCards();
}

// ---------- option button groups ----------
function buildOptionGroup(el, items, current, onPick) {
  el.innerHTML = '';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opt';
    btn.textContent = item.label;
    if (item.hint) btn.title = item.hint;
    if (item.id === current) btn.classList.add('active');
    btn.addEventListener('click', () => {
      el.querySelectorAll('.opt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onPick(item.id);
    });
    el.appendChild(btn);
  }
}

// ---------- export ----------
async function exportPNG(sizeId) {
  const size = sizeById(sizeId || state.size);
  const canvas = renderCoverToCanvas(state, size.w, size.h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sunset-cover-${size.w}x${size.h}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus(`Exported ${size.w} × ${size.h} PNG — check your downloads.`);
  window.__lastExport = { width: size.w, height: size.h, bytes: blob.size };
  return window.__lastExport;
}

// Test hook: render an export and hand back its PNG as a data URL, so the
// maker can verify the export without a download dialog.
window.__exportPNG = async (sizeId) => {
  const size = sizeById(sizeId || state.size);
  const canvas = renderCoverToCanvas(state, size.w, size.h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { dataUrl, width: size.w, height: size.h, bytes: blob.size };
};
window.__state = state;

// ---------- preview interaction: click to pick a panel, drag to pan ----------
function previewPoint(event) {
  const rect = $('preview').getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * ($('preview').width / rect.width),
    y: (event.clientY - rect.top) * ($('preview').height / rect.height),
  };
}

function panelAt(point) {
  return previewPanels.findIndex((p) =>
    point.x >= p.x && point.x < p.x + p.w && point.y >= p.y && point.y < p.y + p.h);
}

function bindPreview() {
  const canvas = $('preview');
  let dragging = false;
  let last = null;
  canvas.addEventListener('pointerdown', (event) => {
    const point = previewPoint(event);
    const idx = panelAt(point);
    if (idx >= 0) {
      selectSlot(previewPanels[idx].slot);
      dragging = true;
      last = point;
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !last) return;
    const point = previewPoint(event);
    const slot = state.slots[selectedSlot];
    const panel = previewPanels.find((p) => p.slot === selectedSlot);
    if (slot.img && panel) {
      slot.panX = Math.max(-0.5, Math.min(0.5, slot.panX + (point.x - last.x) / panel.w));
      slot.panY = Math.max(-0.5, Math.min(0.5, slot.panY + (point.y - last.y) / panel.h));
      refreshSlotCards();
      scheduleRender();
    }
    last = point;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; last = null; });
  canvas.addEventListener('dragover', (event) => event.preventDefault());
  canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    const point = previewPoint(event);
    const idx = panelAt(point);
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (idx >= 0 && file) loadFileIntoSlot(previewPanels[idx].slot, file);
  });
}

// ---------- shot mode (for the entry's screenshots) ----------
function applyShotParams(params) {
  if (params.get('layout')) state.layout = params.get('layout');
  if (params.get('grade')) state.grade = params.get('grade');
  if (params.get('lettering')) state.lettering = params.get('lettering');
  if (params.get('titlepos')) state.titlePos = params.get('titlepos');
  if (params.get('caption')) state.title = params.get('caption');
  if (params.get('sub')) state.subtitle = params.get('sub');
  if (params.get('tag')) state.tag = params.get('tag');
  if (params.get('size')) state.size = params.get('size');
  const photos = [params.get('photo'), params.get('photo2'), params.get('photo3')];
  return Promise.all(photos.map((id, i) => (id ? loadSampleIntoSlot(i, id) : Promise.resolve())));
}

async function runShotMode() {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (!shot) return false;
  await applyShotParams(params);
  syncControls();
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const size = sizeById(state.size);
    const canvas = $('preview');
    renderCover(canvas, state, size.w, size.h);
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.objectFit = 'contain';
    canvas.style.background = '#000';
    window.__coverReady = true;
  } else {
    renderPreview();
  }
  return true;
}

function syncControls() {
  $('caption').value = state.title;
  $('subtitle').value = state.subtitle;
  $('tagline').value = state.tag;
  document.querySelectorAll('#sizes .opt').forEach((b) => b.classList.toggle('active', b.textContent.startsWith(sizeById(state.size).label)));
  buildOptionGroup($('layouts'), LAYOUTS, state.layout, (id) => { state.layout = id; scheduleRender(); });
  buildOptionGroup($('grades'), GRADES, state.grade, (id) => { state.grade = id; scheduleRender(); });
  buildOptionGroup($('letterings'), LETTERINGS, state.lettering, (id) => { state.lettering = id; scheduleRender(); });
  document.querySelectorAll('input[name=titlepos]').forEach((r) => { r.checked = r.value === state.titlePos; });
  refreshSlotCards();
}

// ---------- boot ----------
async function boot() {
  buildSlotCards();
  buildOptionGroup($('layouts'), LAYOUTS, state.layout, (id) => { state.layout = id; scheduleRender(); });
  buildOptionGroup($('grades'), GRADES, state.grade, (id) => { state.grade = id; scheduleRender(); });
  buildOptionGroup($('letterings'), LETTERINGS, state.lettering, (id) => { state.lettering = id; scheduleRender(); });
  buildOptionGroup($('sizes'), SIZES, state.size, (id) => { state.size = id; scheduleRender(); });

  $('caption').addEventListener('input', (e) => { state.title = e.target.value; scheduleRender(); });
  $('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; scheduleRender(); });
  $('tagline').addEventListener('input', (e) => { state.tag = e.target.value; scheduleRender(); });
  document.querySelectorAll('input[name=titlepos]').forEach((r) => r.addEventListener('change', () => {
    state.titlePos = document.querySelector('input[name=titlepos]:checked').value;
    scheduleRender();
  }));
  $('export').addEventListener('click', () => exportPNG());
  $('shuffle').addEventListener('click', async () => {
    const order = [...SAMPLES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i++) await loadSampleIntoSlot(i, order[i % order.length].id);
    setStatus('Samples shuffled into the panels.');
  });
  bindPreview();

  // Wait for the poster font so the first paint already has its lettering.
  try {
    await Promise.race([
      document.fonts.load('100px Anton'),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch { /* fall back to system fonts */ }

  // Default cover: the three sample scenes, one per panel.
  for (let i = 0; i < SAMPLES.length; i++) {
    try { await loadSampleIntoSlot(i, SAMPLES[i].id); } catch { /* sample missing: panel stays empty */ }
  }
  const shot = await runShotMode();
  if (!shot) {
    syncControls();
    renderPreview();
    setStatus('Pick a layout, drop in your photos, edit the caption, export a PNG.');
  }
}

boot();

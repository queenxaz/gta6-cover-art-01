// shot.mjs — drives the cached headless Chromium over CDP (Node stdlib only:
// child_process + fetch + the built-in WebSocket) to take this entry's
// screenshots and to verify the app's PNG export end to end.
// Usage: node tools/shot.mjs [--serve-port 8080]
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const portFlag = process.argv.indexOf('--serve-port');
const port = portFlag === -1 ? 8080 : Number(process.argv[portFlag + 1] || 8080);
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`;
const DEBUG_PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`never came up: ${url}`);
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(`${data.error.message} (${data.error.code})`));
        else resolve(data.result);
      } else if (data.method) {
        this.events.push(data);
      }
    };
  }
  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const payload = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return payload;
  }
  async eval(expression) {
    const r = await this.call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(`page exception: ${JSON.stringify(r.exceptionDetails).slice(0, 500)}`);
    return r.result.value;
  }
  consoleErrors() {
    return this.events.filter((e) =>
      (e.method === 'Runtime.exceptionThrown') ||
      (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
      (e.method === 'Network.loadingFailed'));
  }
  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

async function newTarget(url) {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
  return res.json();
}

async function main() {
  await waitForHttp(`http://127.0.0.1:${port}/index.html`);
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=/tmp/chrome-profile-gta6-cover',
    '--no-sandbox', '--disable-gpu', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const results = [];
    for (const shot of shots) {
      const url = `http://127.0.0.1:${port}/index.html${shot.query}`;
      const target = await newTarget(url);
      const cdp = new Cdp(target.webSocketDebuggerUrl);
      await cdp.call('Page.enable');
      await cdp.call('Runtime.enable');
      await cdp.call('Network.enable');
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false,
      });
      // wait until the app reports its first render done
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try { ready = await cdp.eval('window.__coverReady === true'); } catch { ready = false; }
        if (ready) break;
        await sleep(250);
      }
      if (!ready) throw new Error(`${shot.name}: app never became ready`);
      await sleep(600); // let fonts + images settle
      let quality = 85;
      let shotData;
      for (;;) {
        const r = await cdp.call('Page.captureScreenshot', { format: 'jpeg', quality });
        shotData = Buffer.from(r.data, 'base64');
        if (shotData.length <= 262144 || quality <= 60) break;
        quality -= 10;
      }
      const outPath = join(root, 'screenshots', shot.name);
      writeFileSync(outPath, shotData);
      const errors = cdp.consoleErrors();
      results.push({ name: shot.name, bytes: shotData.length, quality, errors: errors.length });
      console.log(`${shot.name}: ${shot.w}x${shot.h} jpeg q${quality}, ${shotData.length} bytes, console errors: ${errors.length}`);
      if (errors.length) console.log(JSON.stringify(errors, null, 2).slice(0, 2000));
      cdp.close();
    }

    // Export check: render the editor, export two sizes, verify the PNGs.
    const exportTarget = await newTarget(`http://127.0.0.1:${port}/index.html?shot=editor&photo=sunset-beach&photo2=neon-street&photo3=skyline-dusk&caption=SUNSET%20HEIST&layout=poster`);
    const cdp = new Cdp(exportTarget.webSocketDebuggerUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { ready = await cdp.eval('window.__coverReady === true'); } catch { ready = false; }
      if (ready) break;
      await sleep(250);
    }
    if (!ready) throw new Error('export check: app never became ready');
    for (const sizeId of ['1080x1080', '1920x1080']) {
      const out = await cdp.eval(`window.__exportPNG('${sizeId}')`);
      const b64 = out.dataUrl.split(',')[1];
      const png = Buffer.from(b64, 'base64');
      const magic = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
      const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
      console.log(`export ${sizeId}: magic-ok=${magic} ${w}x${h} ${png.length} bytes (reported ${out.bytes})`);
      if (!magic || w !== out.width || h !== out.height) throw new Error(`export ${sizeId} failed validation`);
      writeFileSync(join('/tmp', `export-${sizeId}.png`), png);
    }
    const errors = cdp.consoleErrors();
    console.log(`export check console errors: ${errors.length}`);
    if (errors.length) console.log(JSON.stringify(errors, null, 2).slice(0, 2000));
    cdp.close();
    console.log('ALL SHOTS + EXPORTS OK');
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });

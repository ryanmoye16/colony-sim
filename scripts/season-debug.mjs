// Debug version: probe __sim and verify setTick works
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2];
const season = parseInt(process.argv[3] ?? '2');
const zoom = parseFloat(process.argv[4] ?? '2');
if (!out) { console.error('usage: node season-debug.mjs <out> [season 0..3] [zoom]'); process.exit(1); }

const url = `http://localhost:5181/?skipMenu&t=${Date.now()}`;
const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-'));
const port = 9460 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--no-sandbox', '--hide-scrollbars',
  '--disable-cache',
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,BackForwardCache',
  '--window-size=1024,768',
  '--window-position=100,100',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  url,
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error('[shoot]', ...a);
async function fetchJson (p) { return (await fetch(`http://127.0.0.1:${port}${p}`)).json(); }

let tabs;
for (let i = 0; i < 30; i++) {
  try { tabs = await fetchJson('/json'); if (tabs.length > 0) break; } catch {}
  await wait(200);
}
const pageTabs = (tabs ?? []).filter(t => t.type === 'page');
if (!pageTabs?.length) { log('no page tabs'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(pageTabs[0].webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id != null) { const r = pending.get(m.id); if (r) { pending.delete(m.id); r.resolve(m); } }
});
await new Promise((r) => ws.on('open', r));
const send = (method, params = {}) => {
  const id = nextId++;
  return new Promise((resolve) => { pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
};
const evalExpr = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value;
};

await send('Page.enable');
await wait(3000);

let hasSim = false;
for (let i = 0; i < 30; i++) {
  const r = await evalExpr('!!window.__sim');
  if (r === true) { hasSim = true; break; }
  await wait(250);
}
if (!hasSim) { log('no sim'); chrome.kill(); process.exit(3); }
log('world scene ready');

log('before: tick=', await evalExpr('window.__sim.tick'));
log('before: day=', await evalExpr('window.__sim.day'));
log('before: season=', await evalExpr('window.__sim.season'));
log('before: has setTick?', await evalExpr('typeof window.__sim.setTick'));

await evalExpr('window.__sim.setSpeed(0)');

const TICKS_PER_DAY = 1440;
const DAYS_PER_SEASON = 30;
const targetTick = (season * DAYS_PER_SEASON + 5) * TICKS_PER_DAY + 720;
await evalExpr(`window.__sim.setTick(${targetTick})`);
log('target tick=', targetTick);

await wait(500);
log('after: tick=', await evalExpr('window.__sim.tick'));
log('after: day=', await evalExpr('window.__sim.day'));
log('after: season=', await evalExpr('window.__sim.season'));
log('after: year=', await evalExpr('window.__sim.year'));

await evalExpr(`window.__cam && window.__cam.setZoom(${zoom})`);

// Find first tree
const pinResult = await evalExpr(`(() => {
  const w = window.__world;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      const t = w.getTile(x, y);
      if (t === 6 || t === 11 || t === 12) return JSON.stringify({x, y});
    }
  }
  return null;
})()`);
const pinLoc = JSON.parse(pinResult || 'null') ?? { x: 100, y: 88 };
await evalExpr(`(() => {
  const cc = window.__cam;
  const cam = cc.cam;
  cam.scrollX = ${pinLoc.x} * 16 - cam.width / (2 * cam.zoom);
  cam.scrollY = ${pinLoc.y} * 16 - cam.height / (2 * cam.zoom);
  cc.update = () => {};
})()`);
await wait(1500);

log('final: tick=', await evalExpr('window.__sim.tick'));
log('final: day=', await evalExpr('window.__sim.day'));
log('final: season=', await evalExpr('window.__sim.season'));

// Use Phaser's snapshot to capture the rendered frame, then sample a tree pixel
const sample = JSON.parse(await evalExpr(`(() => {
  const w = window.__world;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      const t = w.getTile(x, y);
      if (t === 6 || t === 11 || t === 12) return JSON.stringify({x, y, type: t});
    }
  }
  return null;
})()`) || 'null');
if (sample) {
  const dataUrl = await new Promise((resolve) => {
    const code = `new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))`;
    send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }).then((res) => {
      resolve(res.result?.result?.value);
    });
  });
  if (dataUrl) {
    const fs = await import('node:fs');
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync('/tmp/snap-snapshot.png', Buffer.from(b64, 'base64'));
    log('wrote /tmp/snap-snapshot.png');
  }
  // Also sample the world-composite canvas data
  const treeTints = await evalExpr(`(() => {
    const scene = window.__scene;
    const tex = scene.textures.get('world-composite');
    if (!tex) return 'no texture';
    const c = tex.getCanvas();
    if (!c) return 'no canvas';
    const ctx = c.getContext('2d');
    const samples = [];
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const t = window.__world.getTile(x, y);
        if (t === 6 || t === 11 || t === 12) {
          // sample a few pixels in the upper portion of this tile (where the canopy is)
          const px = x * 16 + 8;
          const py = y * 16 + 4;
          const d = ctx.getImageData(px, py, 1, 1).data;
          if (d[3] > 100) samples.push([d[0], d[1], d[2]]);
        }
      }
    }
    return JSON.stringify({count: samples.length, first5: samples.slice(0, 5), avgR: samples.reduce((a, s) => a + s[0], 0) / samples.length, avgG: samples.reduce((a, s) => a + s[1], 0) / samples.length, avgB: samples.reduce((a, s) => a + s[2], 0) / samples.length});
  })()`);
  log('composite tree pixel stats:', treeTints);
}

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);

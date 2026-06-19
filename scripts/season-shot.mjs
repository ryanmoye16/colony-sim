// Same as cdp-shoot.mjs but sets tick to a target season day directly.
// Usage: node scripts/season-shot.mjs <out.png> <season> [zoom]
// season: 0=spring 1=summer 2=autumn 3=winter

import WebSocket from 'ws';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2];
const season = parseInt(process.argv[3] ?? '2');
const zoom = parseFloat(process.argv[4] ?? '2');
if (!out) { console.error('usage: node season-shot.mjs <out> [season 0..3] [zoom]'); process.exit(1); }

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

await send('Page.enable');
await wait(3000);

let hasSim = false;
for (let i = 0; i < 30; i++) {
  const r = await send('Runtime.evaluate', { expression: '!!window.__sim' });
  if (r.result?.result?.value === true) { hasSim = true; break; }
  await wait(250);
}
if (!hasSim) { log('no sim'); chrome.kill(); process.exit(3); }
log('world scene ready');

await send('Runtime.evaluate', { expression: 'window.__sim && window.__sim.setSpeed(0)' });

// Jump to mid-season: day 35 of season (a few days into the season for
// any settling animations to complete).
const TICKS_PER_DAY = 1440;
const DAYS_PER_SEASON = 30;
const targetTick = (season * DAYS_PER_SEASON + 5) * TICKS_PER_DAY + 720; // midday of day 6
await send('Runtime.evaluate', { expression: `window.__sim.setTick(${targetTick})` });
await send('Runtime.evaluate', { expression: `window.__cam && window.__cam.setZoom(${zoom})` });
await wait(300);

// Pin camera at a tree-rich area. The default spawn (128, 128) is in a
// water/sand biome with no trees, so the seasonal tint is invisible there.
// The cellular-automaton forest cluster usually lands around (100, 88) for
// the default seed, but we'll query a real tree location for safety.
const pinResult = await send('Runtime.evaluate', { expression: `(() => {
  const w = window.__world;
  // Find first tree
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      const t = w.getTile(x, y);
      if (t === 6 || t === 11 || t === 12) {
        return JSON.stringify({x, y});
      }
    }
  }
  return null;
})()` });
const pinLoc = JSON.parse(pinResult.result?.result?.value || 'null') ?? { x: 100, y: 88 };
await send('Runtime.evaluate', { expression: `(() => {
  const cc = window.__cam;
  const cam = cc.cam;
  cam.scrollX = ${pinLoc.x} * 16 - cam.width / (2 * cam.zoom);
  cam.scrollY = ${pinLoc.y} * 16 - cam.height / (2 * cam.zoom);
  cc.update = () => {};
})()` });
await wait(1200);

log('season=', season, 'zoom=', zoom);
try {
  execSync(`screencapture -x -R 100,100,1024,768 ${out}`, { stdio: 'ignore' });
  log(`wrote ${out} via screencapture`);
} catch (e) {
  log('screencapture failed:', e.message);
}

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
await wait(300);
process.exit(0);
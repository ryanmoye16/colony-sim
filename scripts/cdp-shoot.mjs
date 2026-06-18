// Open Chrome (non-headless), attach via CDP, set sim hour, capture via
// macOS screencapture once the frame is settled. More reliable than
// canvas.toDataURL because we bypass Phaser's Canvas2D renderer entirely
// (using WebGL) and the canvas transform quirks that come with it.
//
// Usage: node scripts/cdp-shoot.mjs <out.png> <hour> [zoom]

import WebSocket from 'ws';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2];
const hour = parseFloat(process.argv[3] ?? '14');
const zoom = parseFloat(process.argv[4] ?? '2');
if (!out) { console.error('usage: node cdp-shoot.mjs <out> [hour] [zoom]'); process.exit(1); }

const url = `http://localhost:5181/?skipMenu&t=${Date.now()}`;
const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-'));
const port = 9340 + Math.floor(Math.random() * 100);
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

// Freeze time so the sim doesn't move while we line up the camera.
await send('Runtime.evaluate', { expression: 'window.__sim && window.__sim.setSpeed(0)' });

const TICKS_PER_DAY = 86400;
const targetTick = Math.floor((hour / 24) * TICKS_PER_DAY);
await send('Runtime.evaluate', { expression: `window.__sim.setTick(${targetTick})` });
await send('Runtime.evaluate', { expression: `window.__cam && window.__cam.setZoom(${zoom})` });
await wait(100);

// Reveal fog so we can see the biome layout, then un-reveal later if we want.
await send('Runtime.evaluate', { expression: 'window.__world && window.__world.revealAll && window.__world.revealAll()' });

// Pin the camera at the firepit for the duration of the capture. We freeze
// the controller so WASD/edge-pan can't drift it.
await send('Runtime.evaluate', { expression: `(() => {
  const cc = window.__cam;
  const cam = cc.cam;
  const lights = window.__lights;
  if (lights && lights.lights && lights.lights[0]) {
    const target = lights.lights[0].sprite;
    cam.scrollX = target.x - cam.width / (2 * cam.zoom);
    cam.scrollY = target.y - cam.height / (2 * cam.zoom);
  }
  cc.update = () => {};
})()` });
await wait(200);
await send('Runtime.evaluate', { expression: `(() => {
  const cc = window.__cam;
  const cam = cc.cam;
  const lights = window.__lights;
  if (lights && lights.lights && lights.lights[0]) {
    const target = lights.lights[0].sprite;
    cam.scrollX = target.x - cam.width / (2 * cam.zoom);
    cam.scrollY = target.y - cam.height / (2 * cam.zoom);
  }
})()` });

await wait(800);
log('hour=', hour, 'zoom=', zoom);

// Use macOS screencapture to grab the actual Chrome window. This is more
// reliable than canvas.toDataURL because we capture the real WebGL canvas
// at its native size, no Canvas2D mode required. The window is positioned
// at (100,100) with size 1024x768 per the launch flags above.
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

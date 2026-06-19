// Capture firepit smoke at default zoom (2x) — what players actually see.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/smoke-default.png';
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
const log = (...a) => console.error('[smoke]', ...a);
async function fetchJson (p) { return (await fetch(`http://127.0.0.1:${port}${p}`)).json(); }

let tabs;
for (let i = 0; i < 30; i++) {
  try { tabs = await fetchJson('/json'); if (tabs.length > 0) break; } catch {}
  await wait(200);
}
const ws = new WebSocket(tabs.filter(t => t.type === 'page')[0].webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id != null) { const r = pending.get(m.id); if (r) { pending.delete(m.id); r.resolve(m); } }
});
await new Promise((r) => ws.on('open', r));
const send = (m, p = {}) => { const id = nextId++; return new Promise((r) => { pending.set(id, { resolve: r }); ws.send(JSON.stringify({ id, method: m, params: p })); }); };
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await wait(3000);
for (let i = 0; i < 60; i++) {
  const r = await ev('!!window.__cam');
  if (r === true) break;
  await wait(250);
}
log('world scene ready');

// Speed up so we accumulate several seconds of smoke
await ev('window.__sim.setSpeed(4)');
await wait(8000);
await ev('window.__sim.setSpeed(0)');
await wait(200);

// Pin camera to firepit at default zoom 2
const pin = await ev(`(() => {
  const cam = window.__cam.cam;
  const w = window.__world;
  const fp = w.findWalkableAt(128, 128);
  cam.setZoom(2);
  cam.centerOn(fp.tx * 16 + 8, fp.ty * 16 + 8 - 24);
  window.__cam.update = () => {};
  return { tx: fp.tx, ty: fp.ty };
})()`);
log('pinned to:', JSON.stringify(pin));
await wait(500);

const state = await ev(`(() => {
  const smoke = window.__scene.smoke;
  const active = smoke.puffs.filter(p => p.active);
  return {
    tick: window.__sim.tick,
    sources: smoke.sources.length,
    puffsActive: active.length,
    puffs: active.slice(0, 4).map(p => ({ x: Math.round(p.sprite.x), y: Math.round(p.sprite.y), alpha: p.sprite.alpha.toFixed(2), size: Math.round(p.sprite.displayWidth) })),
  };
})()`);
log('smoke state:', JSON.stringify(state));

const dataUrl = await ev('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (dataUrl) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  log('wrote', out);
}
ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);

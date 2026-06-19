// Force a settler to carry an item and screenshot.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/carry.png';
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
const log = (...a) => console.error('[carry]', ...a);
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

// Force three settlers to be carrying different items.
await ev(`(() => {
  const ecs = window.__scene.ecs;
  if (!ecs) return;
  let count = 0;
  const types = ['stone', 'food', 'wood'];
  ecs.forEachEntity((entity) => {
    if (count >= 3) return;
    const inv = ecs.getComponent(entity, 'Inventory');
    if (!inv) return;
    inv.carried = 999 + count;
    inv.carriedType = types[count];
    count++;
  });
})()`);
await wait(500);

// Center on the first settler carrying stone.
const px = await ev(`(() => {
  const ecs = window.__scene.ecs;
  let result = null;
  ecs.forEachEntity((entity) => {
    if (result) return;
    const inv = ecs.getComponent(entity, 'Inventory');
    const pos = ecs.getComponent(entity, 'Position');
    if (inv && inv.carriedType && pos) {
      result = { tx: pos.tx, ty: pos.ty };
    }
  });
  return result;
})()`);
console.error('[carry settler]', JSON.stringify(px));

await ev(`(() => {
  const cam = window.__cam.cam;
  cam.setZoom(4);
  cam.centerOn(${px.tx * 16 + 8}, ${px.ty * 16 + 8});
  window.__cam.update = () => {};
})()`);
await wait(1500);

const state = await ev(`(() => {
  const ecs = window.__scene.ecs;
  const result = [];
  ecs.forEachEntity((entity) => {
    const inv = ecs.getComponent(entity, 'Inventory');
    const pos = ecs.getComponent(entity, 'Position');
    if (inv && inv.carriedType && pos) {
      result.push({ entity, carriedType: inv.carriedType, tx: pos.tx, ty: pos.ty });
    }
  });
  return result;
})()`);
console.error('[carry state]', JSON.stringify(state));

const dataUrl = await ev('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (dataUrl) {
  writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  log('wrote', out);
}
ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);
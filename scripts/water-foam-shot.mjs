// Capture a snapshot of the world to verify water foam. Pins camera to a
// water-shore area and dumps the Phaser renderer.snapshot to PNG.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/foam.png';
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
const log = (...a) => console.error('[foam]', ...a);
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
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
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

await evalExpr('window.__sim.setSpeed(0)');
await wait(200);

// Find a water tile that has a land neighbor
const pin = JSON.parse(await evalExpr(`(() => {
  const w = window.__world;
  for (let y = 1; y < w.height - 1; y++) {
    for (let x = 1; x < w.width - 1; x++) {
      const t = w.getTile(x, y);
      if (t !== 4) continue; // water only
      const n = w.getTile(x, y - 1);
      const s = w.getTile(x, y + 1);
      const e = w.getTile(x + 1, y);
      const wn = w.getTile(x - 1, y);
      if (n !== 4 || s !== 4 || e !== 4 || wn !== 4) {
        return JSON.stringify({x, y});
      }
    }
  }
  return null;
})()`) || 'null') ?? { x: 80, y: 130 };

log('pinning camera to water at', pin);
await evalExpr(`window.__cam.setZoom(2)`);
await evalExpr(`(() => {
  const cc = window.__cam;
  const cam = cc.cam;
  cam.scrollX = ${pin.x} * 16 - cam.width / (2 * cam.zoom);
  cam.scrollY = ${pin.y} * 16 - cam.height / (2 * cam.zoom);
  cc.update = () => {};
})()`);
await wait(800);

const dataUrl = await evalExpr('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (dataUrl) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  log('wrote', out);
}

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);

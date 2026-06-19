// Capture fireflies visible at night (peak hour ~21:00).
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/fireflies.png';
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
const log = (...a) => console.error('[fireflies]', ...a);
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
log('scene ready');

// 21:00 = tick 1260 (60 ticks per hour * 21). Actually let's compute:
// hour = (tick % 1440) / 60 → tick 1260 = hour 21.0
await ev('window.__sim.setTick(1260)');
await ev('window.__sim.setSpeed(2)');
await wait(2000);

// Move camera to a forest area for visible grass detail
await ev(`(() => {
  const cam = window.__cam.cam;
  cam.setZoom(2.5);
  cam.centerOn(2800, 2150);
  window.__cam.update = () => {};
})()`);
await wait(2000);

const state = await ev(`(() => {
  const ff = window.__scene.fireflies;
  if (!ff) return { err: 'no fireflies' };
  const visible = ff.fireflies.filter(f => f.sprite.alpha > 0.05).length;
  const cam = window.__cam.cam;
  const inView = ff.fireflies.filter(f => {
    const dx = f.sprite.x - cam.midPoint.x;
    const dy = f.sprite.y - cam.midPoint.y;
    return Math.abs(dx) < cam.width / 2 / cam.zoom && Math.abs(dy) < cam.height / 2 / cam.zoom;
  });
  return {
    total: ff.fireflies.length,
    visible,
    inView: inView.length,
    hour: window.__scene.atmosphere.hourFromTick(window.__sim.tick),
    inViewSample: inView.slice(0, 5).map(f => ({
      x: Math.round(f.sprite.x),
      y: Math.round(f.sprite.y),
      alpha: f.sprite.alpha.toFixed(2),
    })),
  };
})()`);
console.error('[fireflies state]', JSON.stringify(state));

const dataUrl = await ev('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (dataUrl) {
  writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  log('wrote', out);
}
ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);
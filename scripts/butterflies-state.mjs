// Capture butterflies state to verify they exist and are visible.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/butterflies-debug.png';
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
const log = (...a) => console.error('[bf]', ...a);
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

await ev('window.__sim.setTick(720)');
await ev('window.__sim.setSpeed(0)');
await wait(500);

const state = await ev(`(() => {
  const bf = window.__scene.butterflies;
  if (!bf) return { err: 'no butterflies' };
  const cam = window.__cam.cam;
  const inView = bf.butterflies.filter(b => {
    const dx = b.sprite.x - cam.midPoint.x;
    const dy = b.sprite.y - cam.midPoint.y;
    return Math.abs(dx) < cam.width / 2 / cam.zoom && Math.abs(dy) < cam.height / 2 / cam.zoom;
  });
  const visible = bf.butterflies.filter(b => b.sprite.alpha > 0.05).length;
  return {
    total: bf.butterflies.length,
    visible,
    inView: inView.length,
    inViewSample: inView.slice(0, 5).map(b => ({
      x: Math.round(b.sprite.x),
      y: Math.round(b.sprite.y),
      alpha: b.sprite.alpha.toFixed(2),
      color: b.color.toString(16),
    })),
  };
})()`);
console.error('[bf state]', JSON.stringify(state));

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);
// Capture a clean screenshot of settlers walking — let them move naturally so
// the wander system assigns real facings. We pick a zoom that shows them
// clearly and a viewport centered on them.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/settler-walking.png';
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
const log = (...a) => console.error('[walking]', ...a);
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

// Run sim at speed 2 (faster) for 4 seconds to let settlers wander naturally.
await evalExpr('window.__sim.setSpeed(2)');
await wait(4000);

// Inspect settler states right before capture.
const info = await evalExpr(`(() => {
  const ecs = window.__ecs;
  const out = [];
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    const ai = ecs.getComponent(id, 'AI');
    const pos = ecs.getComponent(id, 'Position');
    if (!ren || !ai || !pos || !ren.textureKey.startsWith('settler-')) return;
    out.push({
      id, tx: pos.tx, ty: pos.ty,
      state: ai.state,
      facing: ai.facing,
      flipX: ren.gameObject.flipX,
      tex: ren.gameObject.texture.key,
      pathLen: ai.path ? ai.path.length : 0,
    });
  });
  return out;
})()`);
log('settler info:', JSON.stringify(info, null, 2));

// Pause sim, then move camera to a settler that's walking and capture.
const pin = await evalExpr(`(() => {
  const cam = window.__cam.cam;
  const ecs = window.__ecs;
  // Find first settler whose state is moving (has path).
  let target = null;
  ecs.forEachEntity((id) => {
    if (target) return;
    const ren = ecs.getComponent(id, 'Render');
    const ai = ecs.getComponent(id, 'AI');
    const pos = ecs.getComponent(id, 'Position');
    if (!ren || !ai || !pos || !ren.textureKey.startsWith('settler-')) return;
    if (ai.path && ai.path.length > 0) target = { tx: pos.tx, ty: pos.ty, facing: ai.facing };
  });
  if (!target) return null;
  cam.zoom = 6;
  cam.scrollX = target.tx * 16 + 8 - cam.width / (2 * cam.zoom);
  cam.scrollY = target.ty * 16 + 8 - cam.height / (2 * cam.zoom);
  window.__cam.update = () => {};
  return target;
})()`);
log('pinned to:', JSON.stringify(pin));
await evalExpr('window.__sim.setSpeed(0)');
await wait(500);

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
// Capture smoke plumes above firepit.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/smoke.png';
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
for (let i = 0; i < 60; i++) {
  const r = await evalExpr('!!window.__sim');
  if (r === true) { hasSim = true; break; }
  await wait(250);
}
if (!hasSim) { log('no sim'); chrome.kill(); process.exit(3); }
log('world scene ready');

await evalExpr('window.__sim.setSpeed(2)');
// Let smoke plumes accumulate for 5 seconds.
await wait(5000);

// Pause and pin camera to the firepit area.
await evalExpr('window.__sim.setSpeed(0)');
await wait(200);

const pin = await evalExpr(`(() => {
  const cam = window.__cam.cam;
  const w = window.__world;
  const fp = w.findWalkableAt(128, 128);
  cam.setZoom(4);
  cam.centerOn(fp.tx * 16 + 8, fp.ty * 16 + 4 - 16); // bias up to show plume
  window.__cam.update = () => {};
  return { tx: fp.tx, ty: fp.ty };
})()`);
log('pinned to:', JSON.stringify(pin));
await wait(500);

// Inspect smoke state.
const smokeState = await evalExpr(`(() => {
  try {
    const smoke = window.__scene && window.__scene.smoke;
    const out = {
      foundSmoke: !!smoke,
      puffsActive: smoke ? smoke.puffs.filter(p => p.active).length : 'n/a',
      tick: window.__sim.tick,
      sources: smoke ? smoke.sources.length : 'n/a',
    };
    if (!smoke) return out;
    const active = smoke.puffs.find(p => p.active);
    if (active) {
      const s = active.sprite;
      out.puffSprite = {
        type: s.type,
        textureKey: s.texture ? s.texture.key : 'none',
        x: Math.round(s.x),
        y: Math.round(s.y),
        alpha: s.alpha,
        visible: s.visible,
        scaleX: s.scaleX,
        scaleY: s.scaleY,
        scrollFactorX: s.scrollFactorX,
        scrollFactorY: s.scrollFactorY,
        depth: s.depth,
        displayW: s.displayWidth,
        displayH: s.displayHeight,
        hasParentContainer: !!s.parentContainer,
        parentContainerType: s.parentContainer ? s.parentContainer.type : 'none',
        parentContainerDepth: s.parentContainer ? s.parentContainer.depth : 'n/a',
        parentContainerSF: s.parentContainer ? [s.parentContainer.scrollFactorX, s.parentContainer.scrollFactorY] : 'n/a',
        parentContainerVisible: s.parentContainer ? s.parentContainer.visible : 'n/a',
        parentContainerAlpha: s.parentContainer ? s.parentContainer.alpha : 'n/a',
      };
    } else {
      out.puffSprite = 'no active puff';
    }
    const sc = smoke.container;
    out.containerInScene = window.__scene.children.list.includes(sc);
    out.sceneChildTypes = window.__scene.children.list.map(c => c.type || c.constructor.name).slice(0, 40);
    out.source = smoke.sources[0] ? { tx: smoke.sources[0].tx, ty: smoke.sources[0].ty, cadenceMs: smoke.sources[0].cadenceMs, nextEmitAt: smoke.sources[0].nextEmitAt, active: smoke.sources[0].active } : 'none';
    const cam = window.__cam.cam;
    out.cam = { scrollX: Math.round(cam.scrollX), scrollY: Math.round(cam.scrollY), zoom: cam.zoom, w: cam.width, h: cam.height };
    out.camWorldView = { x: Math.round(cam.worldView.x), y: Math.round(cam.worldView.y), w: Math.round(cam.worldView.width), h: Math.round(cam.worldView.height) };
    return out;
  } catch (e) {
    return { err: String(e), stack: e.stack };
  }
})()`);
log('smoke state:', JSON.stringify(smokeState, null, 2));

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
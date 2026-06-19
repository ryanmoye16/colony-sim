// Simple: pause sim immediately, find any settler, pin camera close, capture.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/settler-zoom.png';
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
const log = (...a) => console.error('[zoom]', ...a);
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

// Wait for settlers to spawn.
let settlerCount = 0;
for (let i = 0; i < 30; i++) {
  settlerCount = await evalExpr(`(() => {
    const ecs = window.__ecs;
    let n = 0;
    ecs.forEachEntity((id) => {
      const ren = ecs.getComponent(id, 'Render');
      if (ren && ren.textureKey && ren.textureKey.startsWith('settler-')) n++;
    });
    return n;
  })()`);
  if (settlerCount > 0) break;
  await wait(200);
}
log('settler count:', settlerCount);

// Pause sim immediately so settlers don't wander.
await evalExpr('window.__sim.setSpeed(0)');
await wait(300);

// Force a settler to the camera center and add a bright red box at its position.
const info = await evalExpr(`(() => {
  const cam = window.__cam.cam;
  const scene = cam.scene;
  // Find first settler via ECS, then grab its sprite from RenderData.
  const ecs = window.__ecs;
  let sett = null;
  ecs.forEachEntity((id) => {
    if (sett) return;
    const ren = ecs.getComponent(id, 'Render');
    if (ren && ren.textureKey && ren.textureKey.startsWith('settler-')) {
      sett = ren.gameObject;
    }
  });
  if (!sett) return { error: 'no settler' };

  // Add a giant red rectangle at the settler position.
  const marker = scene.add.rectangle(sett.x, sett.y, 32, 32, 0xff0000, 0.9);
  marker.setDepth(999);
  const marker2 = scene.add.rectangle(sett.x, sett.y, 80, 80, 0x00ff00, 0.4);
  marker2.setDepth(999);

  // Move camera to settler.
  cam.zoom = 8;
  cam.scrollX = sett.x - cam.width / (2 * cam.zoom);
  cam.scrollY = sett.y - cam.height / (2 * cam.zoom);
  window.__cam.update = () => {};
  return {
    sett: {
      x: Math.round(sett.x), y: Math.round(sett.y),
      texture: sett.texture.key,
      displayWidth: sett.displayWidth,
      scaleX: sett.scaleX,
      visible: sett.visible,
      alpha: sett.alpha,
      flipX: sett.flipX,
      depth: sett.depth,
      scrollFactorX: sett.scrollFactorX,
      parentContainer: sett.parentContainer ? 'yes' : 'no',
      parentDepth: sett.parentContainer ? sett.parentContainer.depth : null,
    },
    cam: {
      zoom: cam.zoom,
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      width: cam.width,
      height: cam.height,
    },
  };
})()`);
log('scene images:', JSON.stringify(info, null, 2));
await wait(500);

const shotUrl = await evalExpr('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
log('settler info:', JSON.stringify(info, null, 2));
await wait(500);

const dataUrl = await evalExpr('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (shotUrl) {
  const b64 = shotUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  log('wrote', out);
}

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);
// Capture a screenshot of settlers walking in different directions to verify
// the west-facing mirror. Pins each settler to a forced facing and renders.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/settler-facing.png';
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
const log = (...a) => console.error('[facing]', ...a);
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

// Pause sim and force a few settlers into different facing directions.
await evalExpr('window.__sim.setSpeed(0)');
await wait(200);

// Force facing on the first 4 settlers (we have 3 starter settlers typically).
// Then freeze them in place and pin camera.
const forced = await evalExpr(`(() => {
  const ecs = window.__ecs;
  const sett = [];
  ecs.forEachEntity((id) => {
    const ai = ecs.getComponent(id, 'AI');
    const pos = ecs.getComponent(id, 'Position');
    const ren = ecs.getComponent(id, 'Render');
    if (!ai || !pos || !ren) return;
    sett.push({ id, pos, ren, ai });
  });
  // Find a clear walkable area in the center of the map.
  const w = window.__world;
  const WALKABLE = new Set([1, 2, 3, 6]);
  let baseTx = 0, baseTy = 0;
  outer: for (let y = 10; y < w.height - 10; y++) {
    for (let x = 10; x < w.width - 10; x++) {
      if (!WALKABLE.has(w.getTile(x, y))) continue;
      let clear = true;
      for (let i = 0; i < 8; i++) {
        if (!WALKABLE.has(w.getTile(x + i, y))) { clear = false; break; }
      }
      if (clear) { baseTx = x; baseTy = y; break outer; }
    }
  }
  // Debug: report what's actually at the spawn.
  const beforeTiles = [];
  for (let i = 0; i < 4; i++) beforeTiles.push([baseTx + i, baseTy, w.getTile(baseTx + i, baseTy)]);
  // Check settler CURRENT positions
  const ecs = window.__ecs;
  const origSettlerTiles = [];
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    const pos = ecs.getComponent(id, 'Position');
    if (!ren || !pos || !ren.textureKey.startsWith('settler-')) return;
    origSettlerTiles.push([id, pos.tx, pos.ty, w.getTile(pos.tx, pos.ty)]);
  });
  // Set first 3 settlers to n/e/s, then a 4th (re-use first one) to w for the mirror demo.
  const facings = ['n', 'e', 's'];
  const placed = [];
  for (let i = 0; i < sett.length && i < 3; i++) {
    const s = sett[i];
    if (!s.ren.textureKey.startsWith('settler-')) continue;
    s.pos.tx = baseTx + i;
    s.pos.ty = baseTy;
    s.ren.gameObject.x = s.pos.tx * 16 + 8;
    s.ren.gameObject.y = s.pos.ty * 16 + 8;
    s.ai.facing = facings[i];
    s.ai.state = 'idle';
    s.ai.nextMoveAt = 999999;
    s.ai.path = null;
    s.ai.pathIndex = 0;
    placed.push({ id: s.id, tex: s.ren.textureKey, facing: facings[i] });
  }
  // Use the first settler as a 4th "west" demo by shifting them down a row.
  if (sett.length > 0) {
    const s = sett[0];
    s.pos.tx = baseTx + 3;
    s.pos.ty = baseTy;
    s.ren.gameObject.x = s.pos.tx * 16 + 8;
    s.ren.gameObject.y = s.pos.ty * 16 + 8;
    s.ai.facing = 'w';
    s.ai.state = 'idle';
    s.ai.nextMoveAt = 999999;
    placed.push({ id: s.id, tex: s.ren.textureKey, facing: 'w' });
  }
  return { placed, baseTx, baseTy, beforeTiles, origSettlerTiles };
})()`);
log('forced', JSON.stringify(forced));
await wait(300);

const debug = await evalExpr(`(() => {
  const ecs = window.__ecs;
  const out = [];
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    const pos = ecs.getComponent(id, 'Position');
    if (!ren || !pos) return;
    if (!ren.textureKey || !ren.textureKey.startsWith('settler-')) return;
    out.push({
      id,
      tx: pos.tx, ty: pos.ty,
      sx: Math.round(ren.gameObject.x), sy: Math.round(ren.gameObject.y),
      textureKey: ren.textureKey,
      actualTexture: ren.gameObject.texture && ren.gameObject.texture.key,
      visible: ren.gameObject.visible,
      alpha: ren.gameObject.alpha,
      flipX: ren.gameObject.flipX,
      depth: ren.gameObject.depth,
    });
  });
  return out;
})()`);
log('settlers:', JSON.stringify(debug, null, 2));

// Pin camera to ONE settler at very high zoom.
const pinPos = await evalExpr(`(() => {
  const cam = window.__cam.cam;
  // Pin to settler #2 (blue-long, facing east) at high zoom.
  const tx = ${forced.baseTx} + 1;
  const ty = ${forced.baseTy};
  cam.zoom = 12;
  cam.scrollX = tx * 16 + 8 - cam.width / (2 * cam.zoom);
  cam.scrollY = ty * 16 + 8 - cam.height / (2 * cam.zoom);
  window.__cam.update = () => {};
  return [tx, ty];
})()`);
log('pinned to', pinPos);
await wait(500);

// Take both N/E and W facing screenshots by mutating facing.
const dataUrl = await evalExpr('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (dataUrl) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  log('wrote', out);
}

// Now grab a sample of pixels around each settler to confirm the texture
// is being drawn. We sample at the world pixel location of each settler.
const samples = await evalExpr(`(() => {
  const cam = window.__cam.cam;
  const zoom = cam.zoom;
  const sx = cam.scrollX, sy = cam.scrollY;
  const ecs = window.__ecs;
  const out = [];
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    if (!ren) return;
    if (!ren.textureKey.startsWith('settler-')) return;
    const wx = ren.gameObject.x, wy = ren.gameObject.y;
    const spx = Math.round((wx - sx) * zoom);
    const spy = Math.round((wy - sy) * zoom);
    const cv = window.__captureCanvas ? null : null; // skip; getImageData not available via CanvasTexture
    let px = null;
    try {
      // Phaser uses a WebGL context for the main canvas — we can't read pixels directly.
      // But we CAN read from the snapshot helper.
      px = 'webgl';
    } catch (e) { px = String(e); }
    out.push({ tex: ren.textureKey, flipX: ren.gameObject.flipX, spx, spy, px });
  });
  return out;
})()`);
log('screen pos & pixels:', JSON.stringify(samples, null, 2));

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);
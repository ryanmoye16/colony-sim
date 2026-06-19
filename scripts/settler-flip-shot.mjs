// Clean visual test: capture two settlers, one facing south and one facing west,
// placed side-by-side. Verifies the west-facing settler is horizontally flipped.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '/tmp/settler-flip.png';
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
const log = (...a) => console.error('[flip]', ...a);
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
  if (settlerCount >= 2) break;
  await wait(200);
}
log('settler count:', settlerCount);
if (settlerCount < 2) { log('not enough settlers'); chrome.kill(); process.exit(4); }

await evalExpr('window.__sim.setSpeed(0)');
await wait(300);

// Place two settlers (the same one reused) at adjacent tiles with forced
// facings: south (default) and west (should flip). Pin camera between them.
const placed = await evalExpr(`(() => {
  const cam = window.__cam.cam;
  const ecs = window.__ecs;
  const sett = [];
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    const ai = ecs.getComponent(id, 'AI');
    const pos = ecs.getComponent(id, 'Position');
    if (!ren || !ai || !pos || !ren.textureKey.startsWith('settler-')) return;
    sett.push({ id, ren, ai, pos });
  });
  if (sett.length < 2) return { error: 'not enough', n: sett.length };

  // Find a clear walkable spot.
  const w = window.__world;
  const WALKABLE = new Set([1, 2, 3, 6]);
  let baseTx = 0, baseTy = 0;
  outer: for (let y = 10; y < w.height - 10; y++) {
    for (let x = 10; x < w.width - 10; x++) {
      if (!WALKABLE.has(w.getTile(x, y))) continue;
      let clear = true;
      for (let i = 0; i < 6; i++) {
        if (!WALKABLE.has(w.getTile(x + i, y))) { clear = false; break; }
      }
      if (clear) { baseTx = x; baseTy = y; break outer; }
    }
  }

  // South settler on the left.
  const s0 = sett[0];
  s0.pos.tx = baseTx + 1;
  s0.pos.ty = baseTy;
  s0.ren.gameObject.x = s0.pos.tx * 16 + 8;
  s0.ren.gameObject.y = s0.pos.ty * 16 + 8;
  s0.ren.gameObject.setDepth(999);
  s0.ren.gameObject.setAlpha(1);
  s0.ren.gameObject.setScale(4);
  s0.ren.gameObject.setDisplaySize(64, 64);
  s0.ai.facing = 's';
  s0.ai.state = 'idle';
  s0.ai.nextMoveAt = 999999;
  s0.ai.path = null;
  s0.ai.pathIndex = 0;

  // West settler on the right.
  const s1 = sett[1];
  s1.pos.tx = baseTx + 3;
  s1.pos.ty = baseTy;
  s1.ren.gameObject.x = s1.pos.tx * 16 + 8;
  s1.ren.gameObject.y = s1.pos.ty * 16 + 8;
  s1.ren.gameObject.setDepth(999);
  s1.ren.gameObject.setAlpha(1);
  s1.ren.gameObject.setScale(4);
  s1.ren.gameObject.setDisplaySize(64, 64);
  s1.ai.facing = 'w';
  s1.ai.state = 'idle';
  s1.ai.nextMoveAt = 999999;
  s1.ai.path = null;
  s1.ai.pathIndex = 0;

  // Force settlerContainer to depth 999 too.
  const scene = cam.scene;
  if (scene.settlerContainer) {
    scene.settlerContainer.setDepth(999);
    scene.settlerContainer.setVisible(true);
  }

  // Pin camera between them at moderate zoom.
  const tx = baseTx + 2;
  cam.zoom = 6;
  cam.scrollX = tx * 16 + 8 - cam.width / (2 * cam.zoom);
  cam.scrollY = baseTy * 16 + 8 - cam.height / (2 * cam.zoom);
  window.__cam.update = () => {};

  return {
    baseTx, baseTy,
    south: {
      tex: s0.ren.textureKey,
      actualTex: s0.ren.gameObject.texture.key,
      facing: s0.ai.facing,
      flipX: s0.ren.gameObject.flipX,
      x: Math.round(s0.ren.gameObject.x),
      y: Math.round(s0.ren.gameObject.y),
      displayWidth: s0.ren.gameObject.displayWidth,
      scaleX: s0.ren.gameObject.scaleX,
      depth: s0.ren.gameObject.depth,
    },
    west: {
      tex: s1.ren.textureKey,
      actualTex: s1.ren.gameObject.texture.key,
      facing: s1.ai.facing,
      flipX: s1.ren.gameObject.flipX,
      x: Math.round(s1.ren.gameObject.x),
      y: Math.round(s1.ren.gameObject.y),
      displayWidth: s1.ren.gameObject.displayWidth,
      scaleX: s1.ren.gameObject.scaleX,
      depth: s1.ren.gameObject.depth,
    },
  };

  return {
    baseTx, baseTy,
    south: {
      tex: s0.ren.textureKey,
      actualTex: s0.ren.gameObject.texture.key,
      facing: s0.ai.facing,
      flipX: s0.ren.gameObject.flipX,
      x: Math.round(s0.ren.gameObject.x),
      y: Math.round(s0.ren.gameObject.y),
      displayWidth: s0.ren.gameObject.displayWidth,
      scaleX: s0.ren.gameObject.scaleX,
      depth: s0.ren.gameObject.depth,
    },
    west: {
      tex: s1.ren.textureKey,
      actualTex: s1.ren.gameObject.texture.key,
      facing: s1.ai.facing,
      flipX: s1.ren.gameObject.flipX,
      x: Math.round(s1.ren.gameObject.x),
      y: Math.round(s1.ren.gameObject.y),
      displayWidth: s1.ren.gameObject.displayWidth,
      scaleX: s1.ren.gameObject.scaleX,
      depth: s1.ren.gameObject.depth,
    },
  };
})()`);
log('placed:', JSON.stringify(placed, null, 2));
await wait(1500);

// Verify flipX is now set after render-sync has had time to run.
const finalState = await evalExpr(`(() => {
  const ecs = window.__ecs;
  const out = [];
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    const ai = ecs.getComponent(id, 'AI');
    if (!ren || !ai || !ren.textureKey.startsWith('settler-')) return;
    out.push({
      facing: ai.facing,
      flipX: ren.gameObject.flipX,
      tex: ren.gameObject.texture.key,
    });
  });
  return out;
})()`);
log('final state:', JSON.stringify(finalState, null, 2));

// Force scale/displaySize AFTER render-sync has run.
await evalExpr(`(() => {
  const ecs = window.__ecs;
  ecs.forEachEntity((id) => {
    const ren = ecs.getComponent(id, 'Render');
    if (!ren || !ren.textureKey || !ren.textureKey.startsWith('settler-')) return;
    ren.gameObject.setScale(4);
    ren.gameObject.setDepth(999);
  });
})()`);
await wait(500);
await wait(500);

const shotUrl = await evalExpr('new Promise((r) => window.__captureCanvasAsync((b64) => r(b64)))');
if (shotUrl) {
  const b64 = shotUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  log('wrote', out);
}

ws.close();
chrome.kill();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
process.exit(0);
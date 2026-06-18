// Tiny CDP driver: launch Chrome with --remote-debugging-port, attach,
// navigate, evaluate JS to skip past the main menu, and screenshot.
//
// Usage: node cdp-screenshot.mjs <url> <out.png> [clickX] [clickY]

import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const out = process.argv[3];
const clickX = process.argv[4] ?? '512';
const clickY = process.argv[5] ?? '384';
if (!url || !out) { console.error('usage: node cdp-screenshot.mjs <url> <out> [clickX] [clickY]'); process.exit(1); }

const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-'));
const port = 9333;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--window-size=1024,768',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return res.json();
}

let tabs;
for (let i = 0; i < 30; i++) {
  try {
    tabs = await fetchJson('/json');
    if (tabs.length > 0) break;
  } catch {}
  await wait(200);
}
if (!tabs || tabs.length === 0) {
  console.error('no tabs');
  chrome.kill();
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(2);
}
const wsUrl = tabs[0].webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const consoleLines = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id != null) {
    const r = pending.get(msg.id);
    if (r) { pending.delete(msg.id); r.resolve(msg); }
  }
  if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') {
    consoleLines.push(JSON.stringify(msg.params).slice(0, 300));
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url });
await wait(2500);

await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: parseInt(clickX, 10),
  y: parseInt(clickY, 10),
  button: 'left',
  clickCount: 1,
});
await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: parseInt(clickX, 10),
  y: parseInt(clickY, 10),
  button: 'left',
  clickCount: 1,
});

await wait(4000);

const result = await send('Page.captureScreenshot', { format: 'png' });
if (result.result?.data) {
  writeFileSync(out, Buffer.from(result.result.data, 'base64'));
  console.log(`wrote ${out}`);
} else {
  console.error('screenshot failed:', JSON.stringify(result).slice(0, 200));
}
if (consoleLines.length > 0) {
  console.log('--- console output ---');
  for (const l of consoleLines) console.log(l);
}

ws.close();
chrome.kill();
rmSync(userDataDir, { recursive: true, force: true });
await wait(200);
process.exit(0);
// Drive DATUM in headless Chrome over CDP (Node 24 native WebSocket) and screenshot each screen.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = 'http://127.0.0.1:8420';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9223', '--window-size=1280,1500', 'about:blank'],
  { stdio: 'ignore' });

async function pageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9223/json/new?' + encodeURIComponent(BASE + '/'), { method: 'PUT' });
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('no page target');
}

const ws = new WebSocket(await pageWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const id = ++seq; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.errorDetails || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails || r.result.errorDetails));
  return r.result?.result?.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(new URL('./screenshots/' + name, import.meta.url), Buffer.from(r.result.data, 'base64'));
  console.log('shot', name);
};
async function waitFor(expr, timeout = 300000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evalJs(expr)) return true;
    await sleep(1500);
  }
  throw new Error('timeout waiting: ' + label);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
await waitFor(`document.readyState === 'complete' && !!document.getElementById('urlInput')`, 30000, 'load');
await sleep(1500);
await shot('01-target-empty.png');

// pick lab target, quick mode, authorise
await evalJs(`document.getElementById('labVuln').click()`);
await evalJs(`document.querySelector('[data-mode="quick"]').click()`);
await sleep(400);
await shot('02-target-ready.png');
await evalJs(`document.getElementById('authBox').click()`);
await sleep(300);
const enabled = await evalJs(`!document.getElementById('runBtn').disabled`);
console.log('run enabled:', enabled);
await evalJs(`document.getElementById('runBtn').click()`);
await waitFor(`document.getElementById('screen2').classList.contains('show')`, 30000, 'screen2');
await sleep(9000);
await shot('03-telemetry.png');
await waitFor(`document.getElementById('screen3').classList.contains('show')`, 420000, 'screen3 verdict');
await sleep(800);
const verdict = await evalJs(`document.getElementById('verdictStamp').textContent + ' | ' + document.getElementById('fDbms').textContent + ' | ' + document.getElementById('fTechnique').textContent`);
console.log('VERDICT:', verdict);
await shot('04-verdict-injectable.png');

// mobile screen 1
await evalJs(`document.getElementById('newScanBtn').click()`);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(800);
await shot('05-mobile-target.png');

ws.close(); chrome.kill();
console.log('DONE');

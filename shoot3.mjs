// Drive DATUM Full Engine mode in headless Chrome: lab target + dump actions -> verdict + extracted data.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = 'http://127.0.0.1:8420';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9224', '--window-size=1280,1600', 'about:blank'],
  { stdio: 'ignore' });

async function pageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9224/json/new?' + encodeURIComponent(BASE + '/'), { method: 'PUT' });
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
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false });
await waitFor(`document.readyState === 'complete' && !!document.getElementById('urlInput')`, 30000, 'load');
await sleep(1200);

await evalJs(`document.getElementById('labVuln').click()`);
await evalJs(`document.querySelector('[data-mode="full"]').click()`);
await sleep(500);
const bandVisible = await evalJs(`document.getElementById('fullBand').style.display`);
console.log('fullBand display:', bandVisible);
await shot('06-full-console.png');

// tick actions: tables, columns, dump; set table name
await evalJs(`document.querySelector('[data-a="getTables"]').click()`);
await evalJs(`document.querySelector('[data-a="getColumns"]').click()`);
await evalJs(`document.querySelector('[data-a="dumpTable"]').click()`);
await evalJs(`document.getElementById('fTbl').value = 'products'`);
const cmd = await evalJs(`equivalentCmd()`);
console.log('CMD:', cmd);
await evalJs(`document.getElementById('authBox').click()`);
await sleep(300);
console.log('run enabled:', await evalJs(`!document.getElementById('runBtn').disabled`));
await evalJs(`document.getElementById('runBtn').click()`);
await waitFor(`document.getElementById('screen3').classList.contains('show')`, 420000, 'screen3 verdict');
await sleep(800);
console.log('VERDICT:', await evalJs(`document.getElementById('verdictStamp').textContent`));
console.log('EXTRACTED VISIBLE:', await evalJs(`document.getElementById('extractedBlock').style.display`));
console.log('EXTRACTED TEXT:', (await evalJs(`document.getElementById('extractedBody').textContent`)).slice(0, 400));
await shot('07-full-verdict-dump.png');

ws.close(); chrome.kill();
console.log('DONE');

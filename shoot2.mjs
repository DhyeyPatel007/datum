// Telemetry-only screenshot: Deep mode is slow enough to catch Screen 2 mid-scan.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = 'http://127.0.0.1:8420';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9224', '--window-size=1280,1500', 'about:blank'], { stdio: 'ignore' });
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
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); writeFileSync(new URL('./screenshots/' + name, import.meta.url), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 30; i++) { if (await evalJs(`!!document.getElementById('urlInput')`)) break; await sleep(700); }
await evalJs(`document.getElementById('labVuln').click()`);
await evalJs(`document.querySelector('[data-mode="deep"]').click()`);
await evalJs(`document.getElementById('authBox').click()`);
await evalJs(`document.getElementById('runBtn').click()`);
for (let i = 0; i < 30; i++) { if (await evalJs(`document.getElementById('screen2').classList.contains('show')`)) break; await sleep(600); }
await sleep(4000);
await evalJs(`document.getElementById('logDrawer').querySelector('.drawer-bar').click()`);
await sleep(600);
await shot('03-telemetry.png');
console.log('stage states:', await evalJs(`Array.from(document.querySelectorAll('.stage .pill')).map(p=>p.textContent).join(',')`));
ws.close(); chrome.kill();
console.log('DONE');

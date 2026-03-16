import { open } from '../src/glimpse.mjs';

let pingCount = 0;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Segoe UI, system-ui, sans-serif;
    background: linear-gradient(135deg, #0f172a, #1e293b 45%, #111827);
    color: #e5eefc;
  }
  .app {
    min-height: 100vh;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px;
    padding: 16px;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  h1 { margin: 0; font-size: 28px; }
  p { margin: 0; color: #b8c6dc; line-height: 1.55; }
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(79, 140, 255, 0.18);
    color: #cfe1ff;
    font-size: 12px;
    font-weight: 600;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #4ade80;
    box-shadow: 0 0 12px rgba(74,222,128,0.8);
  }
  input {
    flex: 1;
    min-width: 220px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.08);
    color: white;
    outline: none;
  }
  button {
    border: 0;
    border-radius: 12px;
    padding: 12px 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .primary { background: #4f8cff; color: white; }
  .secondary { background: rgba(255,255,255,0.12); color: white; }
  .warning { background: #f59e0b; color: #111827; }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .metric {
    background: rgba(255,255,255,0.06);
    border-radius: 14px;
    padding: 14px;
  }
  .metric-label { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
  .metric-value { font-size: 22px; font-weight: 800; }
  .log {
    max-height: 180px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .entry {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    color: #d9e6fb;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
  }
</style>
</head>
<body>
  <div class="app">
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:flex-start;">
        <div style="display:flex; flex-direction:column; gap:10px; max-width:44rem;">
          <h1>Windows HTML Interaction Demo</h1>
          <p>This window demonstrates three things: local interaction within the browser, HTML → Node messages, and Node → HTML reply updates.</p>
          <div class="row">
            <div class="pill"><span class="dot"></span>WebView2 Host Active</div>
            <div class="pill" id="ready-pill">waiting for ready…</div>
          </div>
        </div>
        <button class="secondary" onclick="window.glimpse.close()">Close</button>
      </div>
    </div>

    <div class="grid">
      <div class="metric">
        <div class="metric-label">Local Button Clicks</div>
        <div class="metric-value" id="local-count">0</div>
      </div>
      <div class="metric">
        <div class="metric-label">Node Round Trips</div>
        <div class="metric-value" id="ping-count">0</div>
      </div>
    </div>

    <div class="card" style="display:flex; flex-direction:column; gap:12px;">
      <div class="row">
        <input id="msg" value="Hello from HTML" />
        <button class="primary" onclick="sendToNode()">Send To Node</button>
        <button class="secondary" onclick="incrementLocal()">Local +1</button>
        <button class="warning" onclick="toggleTheme()">Toggle Theme</button>
      </div>
      <div id="status" style="color:#9fb6d9; font-size:13px;">status: idle</div>
    </div>

    <div class="card" style="display:flex; flex-direction:column; gap:10px; flex:1;">
      <div style="font-weight:700;">Event Log</div>
      <div class="log" id="log"></div>
    </div>
  </div>

<script>
  let localCount = 0;
  let light = false;

  function addLog(text) {
    const el = document.createElement('div');
    el.className = 'entry';
    el.textContent = text;
    document.getElementById('log').prepend(el);
  }

  function incrementLocal() {
    localCount += 1;
    document.getElementById('local-count').textContent = String(localCount);
    document.getElementById('status').textContent = 'status: local HTML interaction';
    addLog('HTML local interaction #' + localCount);
  }

  function sendToNode() {
    const value = document.getElementById('msg').value;
    document.getElementById('status').textContent = 'status: sending to Node…';
    addLog('HTML -> Node: ' + value);
    window.glimpse.send({ action: 'ping', value, at: Date.now() });
  }

  function toggleTheme() {
    light = !light;
    document.body.style.background = light
      ? 'linear-gradient(135deg, #eff6ff, #dbeafe 50%, #f8fafc)'
      : 'linear-gradient(135deg, #0f172a, #1e293b 45%, #111827)';
    document.body.style.color = light ? '#0f172a' : '#e5eefc';
    document.getElementById('status').textContent = 'status: theme toggled in HTML';
    addLog('HTML theme toggled: ' + (light ? 'light' : 'dark'));
  }

  addLog('window created');
</script>
</body>
</html>`;

const win = open(html, {
  title: 'Glimpse HTML Interaction Demo',
  width: 900,
  height: 700,
  x: 80,
  y: 80,
  floating: true,
  hidden: true,
});

win.on('ready', (info) => {
  const summary = `${info.screen.width}x${info.screen.height} · dark=${info.appearance.darkMode}`;
  win.show({ title: 'Glimpse HTML Interaction Demo' });
  win.send(`
    document.getElementById('ready-pill').textContent = 'ready';
    document.getElementById('status').textContent = 'status: host ready (${summary})';
    const log = document.getElementById('log');
    const el = document.createElement('div');
    el.className = 'entry';
    el.textContent = 'Node -> HTML: ready ${summary}';
    log.prepend(el);
  `);
  console.log('ready', JSON.stringify(info));
});

win.on('message', (data) => {
  if (data?.action === 'ping') {
    pingCount += 1;
    const safeValue = JSON.stringify(String(data.value ?? ''));
    win.send(`
      document.getElementById('ping-count').textContent = ${JSON.stringify(String(pingCount))};
      document.getElementById('status').textContent = 'status: Node replied to HTML';
      const el = document.createElement('div');
      el.className = 'entry';
      el.textContent = 'Node <- HTML ping #${pingCount}: ' + ${safeValue};
      document.getElementById('log').prepend(el);
    `);
  }
  console.log('message', JSON.stringify(data));
});

win.on('closed', () => {
  console.log('closed');
  process.exit(0);
});

win.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

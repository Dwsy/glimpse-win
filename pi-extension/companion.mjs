import { open } from 'glimpseui';
import {
  mkdirSync, writeFileSync, unlinkSync,
  readdirSync, readFileSync, statSync,
} from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = '/tmp/pi-companion';
const PID_FILE  = join(STATE_DIR, '.companion-pid');

const POLL_INTERVAL_MS    = 200;   // poll every 200ms
const STALE_THRESHOLD_MS  = 30_000; // delete files not updated in 30s
const IDLE_EXIT_POLLS     = 15;    // 15 × 200ms = 3s idle → exit

// ── status colours ────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  thinking:  '#F59E0B',
  reading:   '#3B82F6',
  editing:   '#FACC15',
  running:   '#F97316',
  searching: '#8B5CF6',
  done:      '#22C55E',
  error:     '#EF4444',
  starting:  '#22C55E',
};

const STATUS_LABEL = {
  thinking:  'Working',
  reading:   'Reading',
  editing:   'Editing',
  running:   'Running',
  searching: 'Searching',
  done:      'Done',
  error:     'Error',
};

// ── HTML helpers ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, max = 30) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Build the full initial HTML page. All CSS lives here; JS functions are used
// by the poll loop to update the DOM without a full page reload.
function buildInitialHTML() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: transparent !important;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 600;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-optical-sizing: auto;
  -webkit-text-size-adjust: 100%;
  overflow: hidden;
}

#pill {
  display: inline-block;
  overflow: hidden;
  padding: 2px 0;
  -webkit-text-stroke: 3px rgba(0,0,0,1);
  paint-order: stroke fill;
}

#pill.light {
  -webkit-text-stroke: 3px rgba(255,255,255,1);
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  overflow: hidden;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.project {
  color: rgba(255, 255, 255, 0.95);
  font-weight: 500;
  flex-shrink: 0;
}
#pill.light .project { color: rgba(0, 0, 0, 0.9); }

.sep {
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}
#pill.light .sep { color: rgba(0, 0, 0, 0.3); }

.status {
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
}
#pill.light .status { color: rgba(0, 0, 0, 0.8); }

.detail {
  color: rgba(255, 255, 255, 0.7);
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 10px;
  white-space: nowrap;
}
#pill.light .detail { color: rgba(0, 0, 0, 0.6); }

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}

.fade-in-slow {
  animation: fadeIn 0.4s ease-out forwards;
}
</style>
</head>
<body>
<div id="pill"></div>
<script>
  var _light = false;
  var _introPlaying = false;

  function setLight(on) {
    _light = on;
    document.getElementById('pill').classList.toggle('light', on);
  }

  function updateRows(html) {
    if (_introPlaying) return; // don't clobber the intro animation
    var pill = document.getElementById('pill');
    pill.innerHTML = html;
    if (_light) pill.classList.add('light');
  }

  function playOutro() {
    var pill = document.getElementById('pill');
    if (!pill.innerHTML) return;
    pill.style.transition = 'opacity 0.8s ease-out';
    pill.style.opacity = '0';
    setTimeout(function() {
      pill.innerHTML = '';
      pill.style.transition = 'none';
      pill.style.opacity = '1';
    }, 850);
  }

  function playStart(project) {
    if (_introPlaying) return;
    _introPlaying = true;
    var pill = document.getElementById('pill');
    var text = project || 'pi';

    pill.style.opacity = '1';
    pill.style.transition = 'none';
    pill.innerHTML =
      '<div class="row fade-in">' +
      '  <div class="dot" style="background:#22C55E"></div>' +
      '  <span class="project">' + text + '</span>' +
      '</div>';
    if (_light) pill.classList.add('light');

    // Hand off to live status after animation completes
    setTimeout(function() {
      _introPlaying = false;
    }, 500);
  }

  function playIntro(project) {
    if (_introPlaying) return;
    _introPlaying = true;
    var pill = document.getElementById('pill');
    var text = project || 'pi';

    pill.style.opacity = '1';
    pill.style.transition = 'none';
    pill.innerHTML =
      '<div class="row fade-in-slow">' +
      '  <div class="dot" style="background:#22C55E"></div>' +
      '  <span class="project">' + text + '</span>' +
      '</div>';
    if (_light) pill.classList.add('light');

    // Hold after reveal, then fade out
    setTimeout(function() {
      pill.style.transition = 'opacity 0.6s ease-out';
      pill.style.opacity = '0';
      setTimeout(function() {
        pill.innerHTML = '';
        pill.style.transition = 'none';
        pill.style.opacity = '1';
        _introPlaying = false;
      }, 650);
    }, 1200);
  }
</script>
</body>
</html>`;
}

// Build the innerHTML for the pill — one row per agent.
function buildRowsHTML(agents) {
  if (agents.length === 0) return '';

  return agents.map(a => {
    const color  = STATUS_COLOR[a.status]  ?? '#6B7280';
    const label  = STATUS_LABEL[a.status]  ?? a.status;
    const detail = truncate(a.detail ?? '', 30);
    const proj   = esc(a.project ?? 'pi');

    // "starting" shows just green dot + project name, no status label
    if (a.status === 'starting') {
      return [
        '<div class="row">',
        `  <div class="dot" style="background:${color}"></div>`,
        `  <span class="project">${proj}</span>`,
        '</div>',
      ].join('\n');
    }

    return [
      '<div class="row">',
      `  <div class="dot" style="background:${color}"></div>`,
      `  <span class="project">${proj}</span>`,
      `  <span class="sep">·</span>`,
      `  <span class="status">${esc(label)}</span>`,
      detail ? `  <span class="detail">${esc(detail)}</span>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  }).join('\n');
}

// ── state file reading ────────────────────────────────────────────────────────

function readAgents() {
  const now    = Date.now();
  const agents = [];
  let entries;

  try {
    entries = readdirSync(STATE_DIR);
  } catch {
    return agents;
  }

  for (const file of entries) {
    if (!file.endsWith('.json')) continue;
    const filePath = join(STATE_DIR, file);
    try {
      const raw  = readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);

      if (now - data.timestamp > STALE_THRESHOLD_MS) {
        unlinkSync(filePath); // clean up crashed session
        continue;
      }

      const stat = statSync(filePath);
      agents.push({ ...data, _mtime: stat.mtimeMs });
    } catch {
      // file disappeared between readdir and read, or invalid JSON — skip
    }
  }

  agents.sort((a, b) => a._mtime - b._mtime);
  return agents;
}

// ── startup ───────────────────────────────────────────────────────────────────

mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(PID_FILE, String(process.pid));

let win         = null;
let pollTimer   = null;
let emptyPolls  = 0;
let lastHTML    = null;
let cleanedUp   = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (pollTimer) clearInterval(pollTimer);
  try { unlinkSync(PID_FILE); } catch {}
  if (win) { try { win.close(); } catch {} }
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT',  () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

// ── poll loop ─────────────────────────────────────────────────────────────────

// Track which session IDs have already played their intro/outro
const introPlayed = new Set();
const outroPlayed = new Set();
const doneHidden = new Set();

function poll() {
  const agents = readAgents();

  // Check for intro agents — trigger animation, then filter them out
  for (const a of agents) {
    if (a.status === 'intro' && !introPlayed.has(a.id)) {
      introPlayed.add(a.id);
      win.send(`playIntro(${JSON.stringify(a.project ?? 'pi')})`);
    }
  }

  // Trigger start animation for agents beginning work
  for (const a of agents) {
    if (a.status === 'starting') {
      win.send(`playStart(${JSON.stringify(a.project ?? 'pi')})`);
    }
  }

  // Schedule fade-out for done agents after 5s
  for (const a of agents) {
    if (a.status === 'done' && !outroPlayed.has(a.id)) {
      outroPlayed.add(a.id);
      setTimeout(() => {
        doneHidden.add(a.id);
        win.send('playOutro()');
      }, 5000);
    }
  }

  // Filter out animated agents from normal rendering
  const visible = agents.filter(a =>
    a.status !== 'intro' &&
    !doneHidden.has(a.id)
  );

  if (visible.length === 0) {
    // Still count intro-only agents as alive (don't auto-exit during intro)
    if (agents.length > 0) {
      emptyPolls = 0;
      return;
    }
    emptyPolls++;
    if (emptyPolls >= IDLE_EXIT_POLLS) {
      cleanup();
      process.exit(0);
    }
    if (lastHTML !== '') {
      lastHTML = '';
      win.send(`updateRows('')`);
    }
    return;
  }

  emptyPolls = 0;

  const html = buildRowsHTML(visible);
  if (html === lastHTML) return; // nothing changed — skip the eval round-trip
  lastHTML = html;

  // JSON.stringify safely escapes the HTML string for embedding in JS
  win.send(`updateRows(${JSON.stringify(html)})`);
}

// ── open window ───────────────────────────────────────────────────────────────

win = open(buildInitialHTML(), {
  width:       1000,
  height:      120,
  frameless:   true,
  floating:    true,
  transparent: true,
  clickThrough: true,
  followCursor: true,
  cursorOffset: { x: 10, y: -89 },
});

win.on('ready', (info) => {
  const dark = info.appearance?.darkMode ?? true;
  if (!dark) win.send(`setLight(true)`);
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
});

win.on('closed', () => {
  cleanup();
  process.exit(0);
});

win.on('error', (err) => {
  // Non-fatal — log and continue
  process.stderr.write(`[companion] error: ${err.message}\n`);
});

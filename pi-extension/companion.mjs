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
  editing:   '#10B981',
  running:   '#F97316',
  searching: '#8B5CF6',
};

const STATUS_LABEL = {
  thinking:  'Working',
  reading:   'Reading',
  editing:   'Editing',
  running:   'Running',
  searching: 'Searching',
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
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: transparent !important;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 11px;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

#pill {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  padding: 2px 0;
  text-shadow:
    -1px -1px 0 rgba(0,0,0,1),
     1px -1px 0 rgba(0,0,0,1),
    -1px  1px 0 rgba(0,0,0,1),
     1px  1px 0 rgba(0,0,0,1),
     0    0  6px rgba(0,0,0,0.9),
     0    0 12px rgba(0,0,0,0.5);
}

#pill.light {
  text-shadow:
    -1px -1px 0 rgba(255,255,255,1),
     1px -1px 0 rgba(255,255,255,1),
    -1px  1px 0 rgba(255,255,255,1),
     1px  1px 0 rgba(255,255,255,1),
     0    0  6px rgba(255,255,255,0.9),
     0    0 12px rgba(255,255,255,0.5);
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
#pill.light .detail { color: rgba(0, 0, 0, 0.6); }

.cursor-blink {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 300;
  animation: blink 0.8s step-end infinite;
}
#pill.light .cursor-blink { color: rgba(0, 0, 0, 0.5); }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
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

  function playIntro(project) {
    if (_introPlaying) return;
    _introPlaying = true;
    var pill = document.getElementById('pill');
    var text = project || 'glimpse';
    var i = 0;

    pill.style.opacity = '1';
    pill.style.transition = 'none';

    function type() {
      i++;
      var partial = text.slice(0, i);
      pill.innerHTML =
        '<div class="row intro-row">' +
        '  <span class="project">' + partial + '</span>' +
        '  <span class="cursor-blink">|</span>' +
        '</div>';
      if (_light) pill.classList.add('light');
      if (i < text.length) {
        setTimeout(type, 60 + Math.random() * 40);
      } else {
        // Hold for a moment, then fade out
        setTimeout(function() {
          pill.style.transition = 'opacity 0.6s ease-out';
          pill.style.opacity = '0';
          setTimeout(function() {
            pill.innerHTML = '';
            pill.style.transition = 'none';
            pill.style.opacity = '1';
            _introPlaying = false;
          }, 650);
        }, 800);
      }
    }

    type();
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

// Track which session IDs have already played their intro
const introPlayed = new Set();

function poll() {
  const agents = readAgents();

  // Check for intro agents — trigger animation, then filter them out
  for (const a of agents) {
    if (a.status === 'intro' && !introPlayed.has(a.id)) {
      introPlayed.add(a.id);
      win.send(`playIntro(${JSON.stringify(a.project ?? 'glimpse')})`);
    }
  }

  // Filter out intro agents from normal rendering
  const visible = agents.filter(a => a.status !== 'intro');

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
  width:       280,
  height:      30,
  frameless:   true,
  floating:    true,
  transparent: true,
  clickThrough: true,
  followCursor: true,
  cursorOffset: { x: 10, y: -4 },
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

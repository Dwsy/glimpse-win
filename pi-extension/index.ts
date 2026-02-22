import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { open } from "glimpseui";
import { basename } from "node:path";

// ── HTML ──────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  starting: "#22C55E",
  thinking: "#F59E0B",
  reading: "#3B82F6",
  editing: "#FACC15",
  running: "#F97316",
  searching: "#8B5CF6",
  done: "#22C55E",
  error: "#EF4444",
};

const STATUS_LABEL: Record<string, string> = {
  thinking: "Working",
  reading: "Reading",
  editing: "Editing",
  running: "Running",
  searching: "Searching",
  done: "Done",
  error: "Error",
};

function buildHTML() {
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
  transition: opacity 0.3s ease-out;
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
  transition: background 0.2s ease;
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
</style>
</head>
<body>
<div id="pill"></div>
<script>
  function show(dotColor, project, status, detail) {
    var pill = document.getElementById('pill');
    pill.style.opacity = '1';
    var html = '<div class="row">';
    html += '<div class="dot" style="background:' + dotColor + '"></div>';
    html += '<span class="project">' + esc(project) + '</span>';
    if (status) {
      html += '<span class="sep">·</span>';
      html += '<span class="status">' + esc(status) + '</span>';
    }
    if (detail) {
      html += '<span class="detail">' + esc(detail) + '</span>';
    }
    html += '</div>';
    pill.innerHTML = html;
  }

  function fadeIn(dotColor, project) {
    var pill = document.getElementById('pill');
    pill.style.opacity = '0';
    pill.innerHTML =
      '<div class="row">' +
      '<div class="dot" style="background:' + dotColor + '"></div>' +
      '<span class="project">' + esc(project) + '</span>' +
      '</div>';
    // Force reflow then fade in
    pill.offsetHeight;
    pill.style.opacity = '1';
  }

  function fadeOut() {
    var pill = document.getElementById('pill');
    pill.style.opacity = '0';
    setTimeout(function() { pill.innerHTML = ''; }, 350);
  }

  function hide() {
    var pill = document.getElementById('pill');
    pill.style.opacity = '0';
    pill.innerHTML = '';
  }

  function setLight(on) {
    document.getElementById('pill').classList.toggle('light', on);
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
</body>
</html>`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function truncate(str: string, max = 30): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let win: any = null;
  let ready = false;
  let lastStatus = "";
  const project = basename(process.cwd());

  function send(js: string) {
    if (win && ready) win.send(js);
  }

  function showStatus(status: string, detail?: string) {
    lastStatus = status;
    const color = STATUS_COLOR[status] ?? "#6B7280";
    const label = STATUS_LABEL[status] ?? "";
    const d = detail ? truncate(detail) : "";
    send(
      `show(${JSON.stringify(color)},${JSON.stringify(project)},${JSON.stringify(label)},${JSON.stringify(d)})`
    );
  }

  function openWindow() {
    if (win) return;
    win = open(buildHTML(), {
      width: 1000,
      height: 120,
      frameless: true,
      floating: true,
      transparent: true,
      clickThrough: true,
      followCursor: true,
      cursorOffset: { x: 10, y: -89 },
    });
    win.on("ready", (info: any) => {
      ready = true;
      const dark = info?.appearance?.darkMode ?? true;
      if (!dark) send("setLight(true)");
    });
    win.on("closed", () => {
      win = null;
      ready = false;
    });
    win.on("error", () => {});
  }

  function closeWindow() {
    if (win) {
      try { win.close(); } catch {}
      win = null;
      ready = false;
    }
  }

  // ── enable / disable ────────────────────────────────────────────────────────

  function enable(ctx: any) {
    enabled = true;
    openWindow();
    const theme = ctx.ui.theme;
    ctx.ui.setStatus(
      "companion",
      theme.fg("accent", "G") + theme.fg("dim", " ·")
    );
  }

  function disable(ctx: any) {
    enabled = false;
    closeWindow();
    ctx.ui.setStatus("companion", undefined);
  }

  // ── session start ───────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    enable(ctx);
    // Show intro: fade in project name, then fade out
    const color = STATUS_COLOR.starting;
    // Wait for window ready, then animate
    const waitForReady = setInterval(() => {
      if (ready) {
        clearInterval(waitForReady);
        send(`fadeIn(${JSON.stringify(color)},${JSON.stringify(project)})`);
        setTimeout(() => {
          if (lastStatus === "") send("fadeOut()");
        }, 2000);
      }
    }, 50);
    setTimeout(() => clearInterval(waitForReady), 5000); // safety
  });

  // ── /companion command ──────────────────────────────────────────────────────

  pi.registerCommand("companion", {
    description: "Toggle cursor companion (shows agent activity near cursor)",
    handler: async (_args, ctx) => {
      if (enabled) {
        disable(ctx);
        ctx.ui.notify("Companion disabled", "info");
      } else {
        enable(ctx);
        ctx.ui.notify("Companion enabled", "info");
      }
    },
  });

  // ── event handlers ──────────────────────────────────────────────────────────

  pi.on("agent_start", async (_event, _ctx) => {
    if (!enabled) return;
    openWindow();
    // Show green dot + project name (ready state)
    const color = STATUS_COLOR.starting;
    send(`fadeIn(${JSON.stringify(color)},${JSON.stringify(project)})`);
    lastStatus = "starting";
  });

  pi.on("agent_end", async (_event, _ctx) => {
    if (!enabled) return;
    // Show green "Done" for 5s, then fade out
    showStatus("done");
    setTimeout(() => {
      if (lastStatus === "done") send("fadeOut()");
    }, 5000);
  });

  pi.on("message_update", async (_event, _ctx) => {
    if (!enabled) return;
    if (lastStatus === "thinking") return;
    showStatus("thinking");
  });

  pi.on("tool_execution_start", async (event, _ctx) => {
    if (!enabled) return;
    const { toolName, args = {} } = event;

    switch (toolName) {
      case "read":
        showStatus("reading", basename(args.path ?? ""));
        break;
      case "edit":
      case "write":
        showStatus("editing", basename(args.path ?? ""));
        break;
      case "bash":
        showStatus("running", (args.command ?? "").slice(0, 30));
        break;
      case "grep":
      case "find":
      case "ls":
        showStatus("searching", args.pattern ?? args.path ?? "");
        break;
      default:
        showStatus("running", toolName);
    }
  });

  pi.on("tool_execution_end", async (event, _ctx) => {
    if (!enabled) return;
    if (event.isError) {
      showStatus("error", event.toolName);
    }
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    closeWindow();
  });
}

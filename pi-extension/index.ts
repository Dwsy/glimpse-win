import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  writeFileSync,
  mkdirSync,
  unlinkSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// ── constants ──────────────────────────────────────────────────────────────────

const STATE_DIR = "/tmp/pi-companion";
const PID_FILE = join(STATE_DIR, ".companion-pid");

// Unique ID for this pi session's state file
const SESSION_ID = randomUUID().slice(0, 8);
const STATE_FILE = join(STATE_DIR, `${SESSION_ID}.json`);

// Resolve companion.mjs next to this file (works at runtime via ts-node/loader)
const COMPANION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "companion.mjs"
);

// ── extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let enabled = false;
  // Suppress redundant "thinking" writes when message_update fires per-token
  let lastStatus = "";

  // ── helpers ──────────────────────────────────────────────────────────────────

  function writeState(status: string, detail?: string) {
    const state: Record<string, unknown> = {
      id: SESSION_ID,
      project: basename(process.cwd()),
      session: pi.getSessionName() || undefined,
      status,
      detail,
      timestamp: Date.now(),
    };
    writeFileSync(STATE_FILE, JSON.stringify(state));
    lastStatus = status;
  }

  function deleteState() {
    try {
      unlinkSync(STATE_FILE);
    } catch {
      // ENOENT or similar — nothing to clean up
    }
    lastStatus = "";
  }

  function ensureCompanion() {
    // Check if a live companion process already exists
    if (existsSync(PID_FILE)) {
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
        process.kill(pid, 0); // throws if process is dead
        return; // companion is alive, nothing to do
      } catch {
        // PID file stale — fall through and spawn a new companion
      }
    }

    // Spawn companion as a detached background process
    const child = spawn("node", [COMPANION_PATH], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }

  // ── /companion command ────────────────────────────────────────────────────────

  pi.registerCommand("companion", {
    description: "Toggle cursor companion (shows agent activity near cursor)",
    handler: async (_args, ctx) => {
      enabled = !enabled;

      if (enabled) {
        mkdirSync(STATE_DIR, { recursive: true });
        ensureCompanion();

        const styledG = ctx.ui.theme.fg("accent", "G");
        ctx.ui.setStatus("companion", styledG);
        ctx.ui.notify("Companion enabled", "info");
      } else {
        deleteState();
        ctx.ui.setStatus("companion", undefined);
        ctx.ui.notify("Companion disabled", "info");
      }
    },
  });

  // ── event handlers ────────────────────────────────────────────────────────────

  pi.on("agent_start", async (_event, _ctx) => {
    if (!enabled) return;
    ensureCompanion();
    writeState("thinking");
  });

  pi.on("agent_end", async (_event, _ctx) => {
    if (!enabled) return;
    deleteState();
  });

  pi.on("message_update", async (_event, _ctx) => {
    if (!enabled) return;
    // message_update fires once per token — only write on the first call
    // to avoid hammering the filesystem. Once we're already "thinking", skip.
    if (lastStatus === "thinking") return;
    writeState("thinking");
  });

  pi.on("tool_execution_start", async (event, _ctx) => {
    if (!enabled) return;

    const { toolName, args = {} } = event;

    switch (toolName) {
      case "read":
        writeState("reading", basename(args.path ?? ""));
        break;
      case "edit":
      case "write":
        writeState("editing", basename(args.path ?? ""));
        break;
      case "bash":
        writeState("running", (args.command ?? "").slice(0, 30));
        break;
      case "grep":
      case "find":
      case "ls":
        writeState("searching", args.pattern ?? args.path ?? "");
        break;
      default:
        writeState("running", toolName);
    }
  });

  pi.on("tool_execution_end", async (_event, _ctx) => {
    if (!enabled) return;
    writeState("thinking");
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    deleteState();
  });
}

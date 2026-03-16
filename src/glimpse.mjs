import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveNativeHost() {
  const override = process.env.GLIMPSE_HOST_PATH;
  if (override) {
    return {
      path: isAbsolute(override) ? override : resolve(process.cwd(), override),
      platform: 'override',
      buildHint: `Using GLIMPSE_HOST_PATH=${override}`,
    };
  }

  switch (process.platform) {
    case 'darwin':
      return {
        path: join(__dirname, 'glimpse'),
        platform: 'darwin',
        buildHint: "Run 'npm run build:macos' or 'swiftc -O src/glimpse.swift -o src/glimpse'",
      };
    case 'win32':
      return {
        path: normalize(join(__dirname, '..', 'native', 'windows', 'bin', 'glimpse.exe')),
        platform: 'win32',
        buildHint: "Run 'npm run build:windows' (requires .NET 8 SDK and WebView2 Runtime)",
      };
    default:
      throw new Error(`Unsupported platform: ${process.platform}. Glimpse currently supports macOS and Windows.`);
  }
}

export function getNativeHostInfo() {
  return resolveNativeHost();
}

class GlimpseWindow extends EventEmitter {
  #proc;
  #closed = false;
  #pendingHTML = null;
  #info = null;
  #tempDir = null;

  constructor(proc, initialHTML, options = {}) {
    super();
    this.#proc = proc;
    this.#pendingHTML = initialHTML;
    this.#tempDir = options.tempDir ?? null;

    proc.stdin.on('error', () => {});

    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });

    rl.on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        this.emit('error', new Error(`Malformed protocol line: ${line}`));
        return;
      }

      switch (msg.type) {
        case 'ready': {
          const info = {
            screen: msg.screen,
            screens: msg.screens,
            appearance: msg.appearance,
            cursor: msg.cursor,
            cursorTip: msg.cursorTip ?? null,
          };
          this.#info = info;
          if (this.#pendingHTML) {
            this.setHTML(this.#pendingHTML);
            this.#pendingHTML = null;
          } else {
            this.emit('ready', info);
          }
          break;
        }
        case 'info':
          this.#info = {
            screen: msg.screen,
            screens: msg.screens,
            appearance: msg.appearance,
            cursor: msg.cursor,
            cursorTip: msg.cursorTip ?? null,
          };
          this.emit('info', this.#info);
          break;
        case 'message':
          this.emit('message', msg.data);
          break;
        case 'closed':
          if (!this.#closed) {
            this.#closed = true;
            this.emit('closed');
          }
          break;
        default:
          break;
      }
    });

    proc.on('error', (err) => this.emit('error', err));

    proc.on('exit', () => {
      if (!this.#closed) {
        this.#closed = true;
        this.emit('closed');
      }
      this.#cleanupTempDir();
    });
  }

  #cleanupTempDir() {
    if (!this.#tempDir) return;
    try {
      rmSync(this.#tempDir, { recursive: true, force: true });
    } catch {}
    this.#tempDir = null;
  }

  #write(obj) {
    if (this.#closed) return;
    this.#proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  send(js) {
    this.#write({ type: 'eval', js });
  }

  setHTML(html) {
    this.#write({ type: 'html', html: Buffer.from(html).toString('base64') });
  }

  show(options = {}) {
    const msg = { type: 'show' };
    if (options.title != null) msg.title = options.title;
    this.#write(msg);
  }

  close() {
    this.#write({ type: 'close' });
  }

  loadFile(path) {
    this.#write({ type: 'file', path });
  }

  get info() {
    return this.#info;
  }

  getInfo() {
    this.#write({ type: 'get-info' });
  }

  followCursor(enabled, anchor, mode) {
    const msg = { type: 'follow-cursor', enabled };
    if (anchor !== undefined) msg.anchor = anchor;
    if (mode !== undefined) msg.mode = mode;
    this.#write(msg);
  }
}

function prepareSpawnHost(host) {
  if (host.platform !== 'win32') {
    return { path: host.path, tempDir: null };
  }

  const sourceDir = dirname(host.path);
  const tempDir = mkdtempSync(join(tmpdir(), 'glimpse-host-'));
  cpSync(sourceDir, tempDir, { recursive: true });
  return {
    path: join(tempDir, 'glimpse.exe'),
    tempDir,
  };
}

export function open(html, options = {}) {
  const host = resolveNativeHost();
  if (!existsSync(host.path)) {
    const skippedBuildPath = join(__dirname, '..', '.glimpse-build-skipped');
    const skippedBuildReason = existsSync(skippedBuildPath)
      ? readFileSync(skippedBuildPath, 'utf8').trim()
      : null;
    throw new Error(
      skippedBuildReason
        ? `Glimpse host not found at '${host.path}'. ${skippedBuildReason} Then run ${host.buildHint}.`
        : `Glimpse host not found at '${host.path}'. ${host.buildHint}`
    );
  }

  const spawnHost = prepareSpawnHost(host);
  if (!existsSync(spawnHost.path)) {
    throw new Error(`Prepared Glimpse host missing at '${spawnHost.path}'.`);
  }

  const args = [];
  if (options.width != null) args.push('--width', String(options.width));
  if (options.height != null) args.push('--height', String(options.height));
  if (options.title != null) args.push('--title', options.title);

  if (options.frameless) args.push('--frameless');
  if (options.floating) args.push('--floating');
  if (options.transparent) args.push('--transparent');
  if (options.clickThrough) args.push('--click-through');
  if (options.followCursor) args.push('--follow-cursor');
  if (options.hidden) args.push('--hidden');
  if (options.autoClose) args.push('--auto-close');

  if (options.x != null) args.push('--x', String(options.x));
  if (options.y != null) args.push('--y', String(options.y));

  if (options.cursorOffset?.x != null) args.push('--cursor-offset-x', String(options.cursorOffset.x));
  if (options.cursorOffset?.y != null) args.push('--cursor-offset-y', String(options.cursorOffset.y));
  if (options.cursorAnchor) args.push('--cursor-anchor', options.cursorAnchor);
  if (options.followMode != null) args.push('--follow-mode', options.followMode);

  const proc = spawn(spawnHost.path, args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: process.platform === 'win32',
  });
  return new GlimpseWindow(proc, html, { tempDir: spawnHost.tempDir });
}

export function prompt(html, options = {}) {
  return new Promise((resolve, reject) => {
    const win = open(html, { ...options, autoClose: true });
    let resolved = false;

    const timer = options.timeout
      ? setTimeout(() => {
          if (!resolved) {
            resolved = true;
            win.close();
            reject(new Error('Prompt timed out'));
          }
        }, options.timeout)
      : null;

    win.once('message', (data) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve(data);
      }
    });

    win.once('closed', () => {
      if (timer) clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    win.once('error', (err) => {
      if (timer) clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

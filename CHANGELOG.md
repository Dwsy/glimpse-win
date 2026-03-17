# Changelog

## 0.4.0

Two community contributions land in this release — thank you! 🎉

### Menu Bar Mode — [@vtemian](https://github.com/vtemian) ([#5](https://github.com/HazAT/glimpse/pull/5))

Glimpse can now live in your menu bar. The new `statusItem()` API creates a menu bar icon with a popover WebView — click the icon to show/hide your HTML content. Comes with `setTitle()` to update the menu bar label and `resize()` to change the popover dimensions on the fly.

```js
import { statusItem } from 'glimpseui';

const item = statusItem('<h1>Hello from the menu bar</h1>', {
  title: '👁', width: 300, height: 200
});
item.on('click', () => console.log('popover toggled'));
```

CLI: `glimpse --status-item --title "👁" --width 300 --height 200`

### Open Links Externally — [@joemccann](https://github.com/joemccann) ([#6](https://github.com/HazAT/glimpse/pull/6))

Links clicked inside Glimpse can now open in your system browser (or a specific app) instead of navigating within the WebView. Useful for dashboards, documentation viewers, or any UI where outbound links should escape the window.

```js
const win = open(html, { openLinks: true });
// or with a specific browser:
const win = open(html, { openLinks: true, openLinksApp: '/Applications/Firefox.app' });
```

CLI: `glimpse --open-links` or `glimpse --open-links-app "/Applications/Google Chrome.app"`

Also adds `GLIMPSE_BINARY_PATH` env var to override the compiled binary location.

## 0.3.7

Companion remembers your preference — disable it once and it stays off across sessions.

- **Feature**: Persist companion enabled/disabled state to `~/.pi/companion.json`
- **Improvement**: `/companion` toggle now saves immediately; new sessions respect the saved preference

## 0.3.6

Broken release — settings path used `~/.config/glimpse/` which doesn't exist when installed from git.

## 0.3.5

Hidden window prewarm mode — open a window invisibly, let the WebView load content in the background, then reveal it instantly with the `show` command. Useful for eliminating perceived latency in agents and tools that know they'll need a window soon.

- **Feature**: `hidden` option / `--hidden` CLI flag — starts the window off-screen with accessory activation policy
- **Feature**: `show` protocol command — reveals a hidden window, optionally setting the title, and activates the app
- **Feature**: `win.show(options?)` method on the Node wrapper

## 0.3.4

- **Chore**: Update repository URL and author in package.json

## 0.3.3

- **Docs**: Add `pi install npm:glimpseui` instructions and `/companion` command to README

## 0.3.2

Housekeeping release — better docs, organized tests, and a demo video.

- **Docs**: Add performance benchmarks to README (warm start ~310ms, cold start ~2s on Apple Silicon)
- **Docs**: Embed demo video at the top of README for GitHub and pi package registry
- **Chore**: Move tests from root `test.mjs` to `test/` directory
- **Fix**: Update publish script to use `npm test` instead of hardcoded `test.mjs` path
- **Skill**: Use resolved absolute import paths instead of bare `'glimpseui'` specifier (fixes imports from `/tmp`)

## 0.3.1

Fix pi package skill discovery errors when installing via `pi install npm:glimpseui`.

- **Fix**: Move `SKILL.md` to `skills/glimpse/` so parent directory matches skill name
- **Fix**: Change `pi.skills` path from `"."` to `"./skills"` — prevents CHANGELOG.md and README.md from being picked up as skills

## 0.3.0

Ship as a unified pi package — `npm install glimpseui` works standalone, `pi install npm:glimpseui` installs the companion extension and skill automatically. No separate extension setup needed.

- **Unified package**: Extension and skill bundled in the main npm package via `pi` manifest in `package.json`
- **Removed**: Separate `pi-extension/package.json` — no more nested install step

## 0.2.0

System info API. The `ready` event now includes screen geometry, display info, cursor position, and dark/light mode — everything you need to adapt UI to the user's environment.

- **System info on ready**: `screen`, `appearance` (dark mode, accent color, tint color), `cursor` position, and `screens` array
- **Runtime info**: `get-info` protocol command to re-query system state at any time
- **Node wrapper**: `win.info` getter caches the latest system info

## 0.1.1

Minor polish to the demo window.

- **Demo fix**: Close demo window on Escape, Enter, or button click

## 0.1.0

Initial release. Two source files, zero dependencies — a native macOS WKWebView that speaks JSON Lines.

**Core:**
- Native Swift binary (~420 lines) — single-file compilation with `swiftc`, no Xcode required
- Node.js ESM wrapper (~175 lines) — `EventEmitter` API over stdin/stdout
- Bidirectional JSON Lines protocol: send HTML/JS in, get messages/events out
- Sub-50ms window open time

**Window modes:**
- Standard, frameless, floating, transparent, click-through — combine freely
- Cursor-following with configurable offset
- Keyboard support in all modes including frameless

**API:**
- `open()` — open a window with HTML string or options
- `prompt()` — open a window and await a single response (ideal for dialogs/forms)
- `loadFile()` — load HTML from a file path
- `autoClose` — close window automatically when the first message is received
- `npx glimpseui` CLI with built-in demo

**Post-0.1.0 (unreleased at the time, shipped in 0.2.0+):**

Pi companion extension — a floating status pill that follows your cursor and shows what your pi agents are doing in real time.

- **Companion extension**: `/companion` command toggles a cursor-following overlay
- **Multi-agent support**: Shared window via Unix socket IPC — multiple pi sessions report to one pill
- **Spring physics**: Smooth cursor following with `--follow-mode spring`
- **Cursor anchoring**: Snap window to cursor corners (`top-right`, `bottom-left`, etc.) with safe-zone awareness
- **Live status**: Dot color, activity label (Reading, Editing, Running...), file/command detail, elapsed time, context window usage %
- **Dark/light mode**: Adapts text stroke and colors to system appearance

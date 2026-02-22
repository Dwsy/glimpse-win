# Glimpse

Native macOS micro-UI for scripts and agents. Opens a WKWebView window in under 50ms with bidirectional JSON Lines communication over stdin/stdout.

## Architecture

Two source files, zero dependencies:

```
src/glimpse.swift   — Native binary (Swift/Cocoa/WebKit, ~420 lines)
src/glimpse.mjs     — Node.js ESM wrapper (EventEmitter API, ~175 lines)
```

The Swift binary is a standalone CLI that speaks JSON Lines. The Node wrapper is a convenience layer — any language that can spawn a process and pipe JSON can use Glimpse.

### Protocol

```
Node → Swift (stdin):   {"type":"html","html":"<base64>"}
                        {"type":"eval","js":"..."}
                        {"type":"file","path":"/tmp/page.html"}
                        {"type":"get-info"}
                        {"type":"follow-cursor","enabled":true}
                        {"type":"close"}

Swift → Node (stdout):  {"type":"ready","screen":{...},"appearance":{...},"cursor":{...},"screens":[...]}
                        {"type":"info","screen":{...},"appearance":{...},"cursor":{...},"screens":[...]}
                        {"type":"message","data":{...}}
                        {"type":"closed"}
```

HTML payloads are base64-encoded. stderr is reserved for debug logging (`[glimpse] ...`).

### Bridge

Every page gets `window.glimpse` injected at document start:
- `window.glimpse.send(data)` — sends JSON to Node (main frame only)
- `window.glimpse.close()` — closes window

## Working on This Project

### Build

```bash
swiftc -O src/glimpse.swift -o src/glimpse    # or: npm run build
```

Every Mac has `swiftc` — no Xcode project, no Package.swift, no SPM. Single-file compilation.

### Test

```bash
node test.mjs
```

End-to-end integration test: open → ready → eval (click button) → message → close → closed. Requires a window server (can't run headless).

### Key Conventions

- **Single-file Swift.** Everything is in `glimpse.swift`. No splitting into multiple files — the simplicity is the feature.
- **No external dependencies.** Node wrapper uses only `node:` built-ins. Swift uses only system frameworks (Cocoa, WebKit).
- **ESM only.** The Node wrapper is a pure ES module. No CJS, no bundler.
- **Protocol-first.** New features should be expressible as JSON Lines commands/events. The Node wrapper is just sugar.
- **Compile on install.** `npm run build` / `postinstall` compiles the binary. Users can fork and modify the Swift source.

### Swift Patterns

- `@MainActor` on AppDelegate — all UI work is main-thread bound
- `nonisolated` on delegate callbacks + `MainActor.assumeIsolated {}` to re-enter isolation
- Stdin reading on `DispatchQueue.global(qos: .userInitiated)`, dispatching results back to main with `DispatchQueue.main.async`
- `GlimpsePanel` subclass of `NSWindow` overrides `canBecomeKey`/`canBecomeMain` for keyboard support in frameless mode
- `writeToStdout()` helper: JSON serialize + newline + fflush

### Node Patterns

- `GlimpseWindow` extends `EventEmitter` with private class fields (`#proc`, `#closed`, `#pendingHTML`, `#info`)
- Two-phase ready handshake: first `ready` = blank page (triggers HTML send), second `ready` = user content loaded (emitted to caller with system info)
- `#write()` guards on `#closed` to prevent EPIPE crashes
- `prompt()` uses a `resolved` flag to prevent double-settlement across message/closed/error/timeout paths
- `#info` caches the last system info from `ready`/`info` events, accessible via `win.info` getter

### Adding a New CLI Flag

1. Add field to `Config` struct
2. Add case to `parseArgs()`
3. Use the value in `setupWindow()`, `setupWebView()`, or `applicationDidFinishLaunching()`
4. Add mapping in `open()` in `glimpse.mjs`
5. Document in README.md and SKILL.md

### Adding a New Protocol Command

1. Add case to `handleCommand()` in Swift
2. Add method on `GlimpseWindow` class in Node wrapper
3. Document in README.md Protocol section

### Adding a New Protocol Event

1. Call `writeToStdout()` in Swift at the right moment
2. Add case to the `switch (msg.type)` in `GlimpseWindow` constructor
3. Emit via `this.emit('eventname', ...)`
4. Document in README.md

## Files

```
src/glimpse.swift   — The native binary (THE core)
src/glimpse.mjs     — Node.js ESM wrapper
bin/glimpse.mjs     — CLI entry point (npx glimpseui)
test.mjs            — Integration test
scripts/publish.sh  — npm publish with preflight checks
package.json        — NPM config, build/postinstall scripts
README.md           — User-facing docs (API, protocol, CLI)
SKILL.md            — Agent skill (patterns, examples, creative ideas)
AGENTS.md           — This file (project conventions for agents)
.gitignore          — Excludes compiled binary, node_modules
pi-extension/               — Pi companion extension (cursor-following agent status)
pi-extension/index.ts       — Extension entry point (/companion command, event tracking)
pi-extension/companion.mjs  — Standalone companion process (Glimpse window, state polling)
pi-extension/package.json   — Extension dependencies (glimpseui)
```

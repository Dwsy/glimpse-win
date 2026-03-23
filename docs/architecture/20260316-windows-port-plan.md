# Windows Port Implementation Plan

## 1. Current Situation

Current repository structure:
- `src/glimpse.swift`: All macOS host logic
- `src/glimpse.mjs`: Node wrapper layer, fixed spawn of `src/glimpse`
- `test/test.mjs`: Integration test, validates minimal message loop
- `pi-extension/companion.mjs`: Depends on transparent + click-through + mouse following
- `pi-extension/index.ts`: Depends on Unix socket `/tmp/pi-companion.sock`
- `package.json`: `build`/`postinstall` bound to `swiftc`, `os` restricted to `darwin`

## 2. Risk Breakdown

### High Risk

1. **Transparent Windows**
   - Clear path on macOS WKWebView
   - Windows WebView2 transparent background and host window mixing is more complex

2. **Click-Through**
   - Requires Win32 window style support
   - Must verify combined effect with WebView2

3. **Follow Cursor + Spring Animation**
   - Mouse monitoring, coordinate systems, multi-screen info all need rewriting
   - Companion has the heaviest dependency on this

4. **Path and IPC Differences**
   - `/tmp/pi-companion.sock` not applicable on Windows
   - Need to change to `os.tmpdir()` + named pipe/local socket compatibility strategy
   - Best to extract a shared IPC helper to avoid double maintenance in `pi-extension/index.ts` and `pi-extension/companion.mjs`

## 3. Target Architecture

```text
JS caller
  ↓
src/glimpse.mjs
  ├─ macOS   → src/glimpse         (Swift binary)
  └─ Windows → native/windows/...  (C# host)
        ↓
stdin/stdout JSON Lines protocol
        ↓
Native window + WebView
```

Core principle: **Protocol first, host replacement, minimal wrapper changes.**

## 4. Phased Milestones

### Milestone A — Baseline Freeze and Protocol Abstraction

Goal: Turn the question "can it be ported" into "is the protocol stable".

Tasks:
- Keep `main` at `D:\MyData\glimpse-macos`
- Switch current directory to `dev-win`
- Extract host path selection function in `src/glimpse.mjs`
- Define Windows host binary location and naming
- Add protocol unit tests or fake process tests for the wrapper layer that don't depend on GUI

Completion criteria:
- JS layer no longer hardcodes a single `src/glimpse`
- Host selection logic extensible to Windows

### Milestone B — Windows Host MVP

Goal: Run the minimal loop on Windows.

Tasks:
- Create new `native/windows/` project
- Implement argument parsing: `width`, `height`, `title`
- Implement protocol: `html`, `eval`, `get-info`, `close`
- Implement events: `ready`, `message`, `closed`
- Validate open → ready → eval → message → close with existing test model on Windows

Completion criteria:
- Minimal example runs
- At least 1 integration test passes

### Milestone C — Styling and Window Capabilities

Goal: Complete common window use cases.

Tasks:
- Implement `frameless`
- Implement `floating`
- Implement `x` / `y`
- Implement `hidden` + `show`
- Implement `file` + `autoClose`

Completion criteria:
- Common dialogs and floating windows usable

### Milestone D — Companion Capabilities

Goal: Support advanced scenarios like pi companion.

Tasks:
- Implement `follow-cursor`
- Implement `cursorAnchor`
- Implement `snap` / `spring`
- Evaluate and implement `transparent`
- Evaluate and implement `clickThrough`
- Migrate IPC path strategy for `pi-extension/companion.mjs`

Completion criteria:
- Companion displays and follows cursor on Windows

### Milestone E — Delivery and Release

Goal: Turn porting results into an installable, documentable, rollback-able package.

Tasks:
- Update `package.json` platform and build scripts
- Design build behavior for `npm install` on different platforms
- Update `README.md`
- Add `CHANGELOG.md`
- Document PR and rollback instructions

## 5. Automated Development Recommendations

To enable "agent-driven progress" going forward, each development round follows the same pattern:

1. **Position first**: Only modify files related to the current milestone
2. **Test minimal loop first**: Run local tests preferentially
3. **Then add features**: One protocol command or window capability at a time
4. **Update workhub Issue promptly**: Check off completed items, record blockers
5. **Code review before each commit**: Avoid hidden regressions from platform differences

## 6. Recommended First Development Batch

First batch doesn't touch companion, prioritize these:
- `package.json`
- `src/glimpse.mjs`
- New `native/windows/` host skeleton
- Windows adaptation of `test/test.mjs`

This proves first: **this project can open a window and do bidirectional communication on Windows**.

## 7. Development Environment Prerequisites (Windows)

Recommended to have in advance:
- Node.js 18+
- Bun (already exists, can be used for workhub and scripts)
- .NET 8 SDK
- Edge WebView2 Runtime
- Visible desktop environment (cannot run completely headless)

## 8. Current Status

Completed:
- `D:\MyData\glimpse-macos` worktree created, preserving `main`
- `D:\MyData\glimpse-win` switched to `dev-win`
- `docs/`, Issue, ADR, architecture plan established

Next steps recommended:
- First transform `src/glimpse.mjs` into a platform host selector
- Then establish `native/windows` MVP project skeleton

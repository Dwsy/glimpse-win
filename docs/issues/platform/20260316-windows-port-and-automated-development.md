---
id: "2026-03-16 Windows Port and Automated Development"
title: "Windows Port and Automated Development"
status: "in_progress"
created: "2026-03-16"
updated: "2026-03-16"
category: "Platform"
tags: ["workhub", "windows", "porting", "webview2", "protocol"]
---

# Issue: Windows Port and Automated Development

## Goal

Port the current macOS-only `glimpseui` to a version that can be developed, built, run, and tested on Windows, keeping the existing JSON Lines protocol and Node API unchanged as much as possible, and establishing a development path that can be automated.

## Context/Background

The current project core depends on `src/glimpse.swift` with Cocoa + WKWebView, which only works on macOS. The Node wrapper, tests, and pi companion extension are all built on this native host.

This task is not a simple branch change but a cross-platform host replacement:
- Native implementation language switches from Swift/Cocoa to Windows tech stack
- Build chain switches from `swiftc` to Windows native build tools
- Socket/temporary paths, CLI packaging, and install scripts all need platform adaptation
- Features like transparent windows, click-through, and follow-cursor have different implementations on Windows with higher risk

Complexity assessment: **L4 (System-level complexity)**
- Scope: Estimated 10+ files
- Risk: Cross-module + cross-platform + build chain changes
- Uncertainty: Transparent WebView, mouse following, and frameless interaction have implementation differences on Windows
- Testing: Requires minimum contract tests + Windows real-machine integration validation

## Acceptance Criteria

- [ ] WHEN `open(html, options)` is called on Windows, the system SHALL successfully open a native WebView window and receive `ready`
- [ ] WHEN the page calls `window.glimpse.send(data)`, the system SHALL emit a `message` event via stdout and be received by the Node wrapper
- [ ] WHEN the host receives `html` / `eval` / `file` / `get-info` / `close` commands, the system SHALL execute per protocol without changing message format
- [ ] WHERE `src/glimpse.mjs` external API remains compatible, existing callers SHALL need no or only minimal changes
- [ ] WHEN installing dependencies on Windows, the system SHALL use Windows build scripts instead of `swiftc`
- [ ] WHEN running Windows integration tests, the system SHALL cover the open → ready → eval → message → close → closed minimal loop
- [ ] IF certain advanced features cannot be supported equivalently in the first batch, THEN the system SHALL clearly classify: P0 core usability, P1 styling capabilities, P2 companion/transparent following

## Implementation Phases

### Phase 1: Planning and Preparation
- [x] Backup macOS baseline to independent worktree
- [x] Create `dev-win` development branch in current directory
- [x] Complete complexity assessment and implementation route design
- [x] Output ADR and architecture planning documents
- [ ] Clarify Windows host technology selection and development environment prerequisites

### Phase 2: Protocol and Wrapper Decoupling
- [ ] Extract platform host location logic (macOS / Windows)
- [ ] Add protocol contract tests for Node wrapper layer to reduce GUI iteration risk
- [ ] Design platform distribution strategy for `build:*` / `test:*` / `postinstall`
- [ ] Clarify Windows binary output path, `files` whitelist, missing install error messages, and missing WebView2/.NET error text

### Phase 3: Windows Native Host MVP
- [ ] Set up `native/windows` project skeleton
- [ ] Implement window opening, HTML injection, JS execution, message echo, close protocol
- [ ] Implement `get-info` returning screen / screens / appearance / cursor
- [ ] Connect Node `open()` to Windows host binary

### Phase 4: Capability Completion
- [x] Implement `frameless` / `floating` / `x` / `y` / `hidden`
- [x] Implement `loadFile()` / `show()` / `autoClose`
- [x] Implement `follow-cursor`, anchor, snap / spring (Windows first version)
- [x] Evaluate and implement first viable solution for `transparent` + `clickThrough`
- [x] Port socket / path compatibility logic for `pi-extension`

### Phase 5: Validation and Delivery
- [x] Add Windows integration test entry point (`test/platform.mjs`)
- [ ] Real-machine validation for both common window and companion paths
- [ ] Update README / CHANGELOG / package metadata
- [ ] Create PR documentation and document rollback plan
- [ ] Execute code review and converge risk list

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Keep JSON Lines protocol unchanged | Protect Node API and callers, reduce outer changes |
| Build Windows host MVP first, then add advanced features | Establish minimal usable loop first, avoid being blocked by transparent/click-through |
| Windows host prioritizes `C# + WebView2` | Mature Windows ecosystem, low debugging cost, easy for auto-generation and rapid iteration |
| Feature parity delivered in layers | Companion-required features are harder than common windows, must advance in stages |
| macOS baseline kept at `D:\MyData\glimpse-macos` | Facilitates dual-end comparison, regression, and protocol behavior comparison |

## Errors Encountered

| Date | Error | Solution |
|------|-------|----------|
| 2026-03-16 | Direct execution of `workhub/lib.ts` failed | Use `bun /c/Users/ID/.pi/agent/skills/workhub/lib.ts ...` instead |
| 2026-03-16 | `dotnet restore` could not resolve `Microsoft.Web.WebView2` | Add repo-level `NuGet.config` and enable `nuget.org` |
| 2026-03-16 | Windows host binary was locked while windows were open | Spawn from a temporary host copy so rebuilds stay possible |
| 2026-03-16 | `MSB3277` `WindowsBase` conflict warning from WebView2 package | Suppress as message in project; build and tests remain green |

## Related Resources

- [x] Related docs: `docs/architecture/20260316-windows-port-plan.md`
- [x] Related docs: `docs/adr/20260316-windows-runtime-and-delivery.md`
- [ ] Related PR: `docs/pr/...`
- [ ] Reference code: `src/glimpse.swift`
- [ ] Reference code: `src/glimpse.mjs`
- [ ] Reference code: `pi-extension/companion.mjs`

## Notes

Recommended to advance in three layers:
1. **Protocol layer stability**: Freeze Node API and message format
2. **MVP layer usability**: Windows opens native WebView and completes minimal loop
3. **Advanced visual layer completion**: Transparent, click-through, cursor following, companion

Priority is to avoid a "one-time fully equivalent port" big-bang approach. A more stable path is to get common windows working first, then gradually elevate to companion-level capabilities.

---

## Status Change Log

- **[2026-03-16 09:30]**: Status changed → `in_progress`, note: worktree created, `dev-win` switched, L4 planning completed
- **[2026-03-16 10:20]**: Status changed → `in_progress`, note: platform host selection, Windows host skeleton, cross-platform build/postinstall, companion IPC path compatibility completed
- **[2026-03-16 11:05]**: Status changed → `in_progress`, note: NuGet source missing and WebView2 initialization issues fixed, `npm test` passed on Windows
- **[2026-03-16 11:25]**: Status changed → `in_progress`, note: Windows first-version `spring follow`, `transparent`, `clickThrough` and manual demo scripts added
- **[2026-03-16 11:45]**: Status changed → `in_progress`, note: Changed to Windows host temp copy run to avoid locking build artifacts when window is alive

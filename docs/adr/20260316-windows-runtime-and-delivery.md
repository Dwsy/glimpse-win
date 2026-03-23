# ADR 2026-03-16: Windows Runtime and Delivery Strategy

## Status

Accepted

## Context

`glimpseui` currently consists of two layers:
- `src/glimpse.swift`: macOS native host, responsible for window, WebView, protocol, system info, mouse following
- `src/glimpse.mjs`: Node wrapper layer, responsible for spawning the native process, event dispatch, user API

The key goal of Windows porting is not to replicate Swift, but to preserve the external protocol and API so that callers remain largely unaffected.

## Decision

The Windows version adopts the following strategy:

1. **Native host uses `C# + .NET 8 + WebView2`**
2. **Continue using stdin/stdout JSON Lines as the host protocol**
3. **Upgrade the Node wrapper to a "platform host selector"**
4. **Deliver features in P0 / P1 / P2 layers**
5. **macOS and Windows hosts coexist, not a one-time replacement**

## Solution Details

### 1. Why C# + WebView2

Compared to writing windows purely in C++ / Win32, C# is better suited for this task:
- Easier for agents to auto-generate, refactor, and maintain
- Abundant Windows documentation, lower debugging cost
- Mature WebView2 integration, suitable for implementing HTML host windows
- Easier to handle stdin/stdout, JSON, timers, and window events

### 2. Why Preserve the JSON Lines Protocol

The project's greatest asset is not Swift itself, but the already-stable protocol:
- `html`
- `eval`
- `file`
- `get-info`
- `follow-cursor`
- `close`
- `show`

As long as the protocol remains unchanged:
- The external API of `src/glimpse.mjs` can remain largely intact
- The test model in `test/test.mjs` can be reused
- `pi-extension/companion.mjs` doesn't need major changes to interaction semantics

### 3. Why Layered Delivery

The implementation difficulty of different capabilities on Windows varies enormously:

- **P0 Core Usability**: open / ready / eval / message / close / get-info
- **P1 Window Capabilities**: frameless / floating / x / y / hidden / show / file / autoClose
- **P2 Companion Capabilities**: transparent / clickThrough / followCursor / spring / cursorAnchor

If we pursue full P2 equivalence from the start, the project will get stuck on transparent windows and click-through. We must first establish P0/P1 to enable genuine continued development.

## Implications

### Positive

- Preserves existing JS API, low migration cost
- Can iterate on Windows without affecting the macOS baseline
- Easy to establish contract tests and automated build pipelines

### Negative

- The project will no longer be "zero-dependency, two source files"
- Windows build will introduce .NET / WebView2 prerequisites
- Companion capabilities may require Win32 detail supplementation, significantly increasing development complexity

## Implementation Constraints

- Do not rewrite the user API semantics of `src/glimpse.mjs`
- Do not break existing macOS behavior
- Prioritize adding Windows host and platform distribution logic rather than hard-translating Swift code
- Converge all platform differences into the host layer and minimal wrapper layer branches

## Rollback Strategy

If Windows host progress is blocked:
- Keep the macOS worktree as a stable baseline
- First commit only protocol decoupling, test hardening, and build distribution preparation
- Demote `transparent` / `clickThrough` / companion to follow-up topics

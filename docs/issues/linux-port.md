# Issue: Linux Port

**Status:** Open  
**Priority:** High  
**Created:** 2026-03-16  
**Milestone:** v0.4.0  
**Labels:** `enhancement`, `linux`, `port`, `major-feature`

---

## Description

Port Glimpse to Linux to enable cross-platform support for macOS, Windows, and Linux.

### Motivation

- Expand user base to Linux developers
- Enable agent/UI workflows on Linux workstations
- Complete cross-platform triad (macOS/Windows/Linux)
- Maintain architecture consistency (native WebView per platform)

### Scope

- Native Linux binary using GTK4 + WebKit2GTK
- Full protocol compatibility with macOS/Windows
- Node.js wrapper support for Linux platform
- Documentation for building and running on Linux

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Basic window with HTML rendering | P0 | ⬜ |
| FR-02 | JavaScript eval support | P0 | ⬜ |
| FR-03 | File loading (`file` command) | P0 | ⬜ |
| FR-04 | JSON Lines protocol (stdin/stdout) | P0 | ⬜ |
| FR-05 | `ready`/`message`/`closed` events | P0 | ⬜ |
| FR-06 | Follow cursor (snap mode) | P1 | ⬜ |
| FR-07 | Follow cursor (spring mode) | P1 | ⬜ |
| FR-08 | Cursor anchor positions (6 variants) | P1 | ⬜ |
| FR-09 | Multi-monitor support | P1 | ⬜ |
| FR-10 | Dark mode detection | P2 | ⬜ |
| FR-11 | Click-through window | P2 | ⬜ |
| FR-12 | Transparent background | P2 | ⬜ |
| FR-13 | Frameless window | P2 | ⬜ |
| FR-14 | Floating window level | P2 | ⬜ |
| FR-15 | Hidden prewarm mode | P2 | ⬜ |

### Non-Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-01 | Binary size < 1MB | ⬜ |
| NFR-02 | Startup time < 100ms | ⬜ |
| NFR-03 | Memory usage < 50MB idle | ⬜ |
| NFR-04 | Support Ubuntu 22.10+ | ⬜ |
| NFR-05 | Support Fedora 37+ | ⬜ |
| NFR-06 | Support Arch Linux | ⬜ |
| NFR-07 | Wayland compatible | ⬜ |
| NFR-08 | X11 fallback | ⬜ |

---

## Implementation Plan

### Phase P0: Core Infrastructure

**Goal:** Basic window with HTML rendering and protocol

**Tasks:**
- [ ] Create `native/linux/Glimpse.vala` skeleton
- [ ] Set up CMake build system
- [ ] Implement GTK4 window setup
- [ ] Integrate WebKit2GTK WebView
- [ ] Implement stdin/stdout JSON handler
- [ ] Implement `html`, `eval`, `file`, `close` commands
- [ ] Implement `ready` event with screen info
- [ ] Implement `message` event from web content
- [ ] Update `src/glimpse.mjs` for Linux platform
- [ ] Update `scripts/build.mjs` for Linux build
- [ ] Test on Ubuntu 22.10

**Acceptance Criteria:**
- Window opens and renders HTML
- JavaScript eval works
- File loading works
- Protocol events fire correctly
- Integration test passes

**Estimated Time:** 2-3 days

---

### Phase P1: Cursor Following

**Goal:** Full cursor tracking with snap and spring modes

**Tasks:**
- [ ] Implement GDK4 cursor tracking
- [ ] Implement 6 anchor positions
- [ ] Implement snap mode following
- [ ] Implement spring physics (same as macOS)
- [ ] Implement `follow-cursor` protocol command
- [ ] Add `cursorTip` to ready/info events
- [ ] Test on X11 and Wayland

**Acceptance Criteria:**
- `--follow-cursor` flag works
- Snap mode follows cursor instantly
- Spring mode has smooth animation
- Anchor positions correct
- Runtime protocol updates work

**Estimated Time:** 1-2 days

---

### Phase P2: Polish & Advanced Features

**Goal:** Feature parity with macOS/Windows

**Tasks:**
- [ ] Implement multi-monitor enumeration
- [ ] Implement per-monitor DPI/scale factor
- [ ] Implement dark mode detection
- [ ] Implement click-through (input shape mask)
- [ ] Implement transparency (RGBA visual)
- [ ] Implement all remaining CLI flags
- [ ] Test on Fedora 37+
- [ ] Test on Arch Linux
- [ ] Update README.md with Linux docs
- [ ] Update package.json `os` field

**Acceptance Criteria:**
- All CLI flags functional
- Multi-monitor info accurate
- Dark mode detected
- Click-through works
- Documentation complete

**Estimated Time:** 1 day

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────┐
│  Node.js (src/glimpse.mjs)          │
│  - Cross-platform API               │
└──────────────┬──────────────────────┘
               │ JSON Lines (stdin/stdout)
┌──────────────▼──────────────────────┐
│  Glimpse Linux (native/linux/)      │
│  - GTK4 Application                 │
│  - WebKit2GTK WebView               │
│  - GDK4 Cursor/Monitors             │
└─────────────────────────────────────┘
```

### File Structure

```
native/linux/
├── Glimpse.vala          # Main implementation (~500 lines)
├── CMakeLists.txt        # Build configuration
└── README.md             # Linux-specific docs
```

### Dependencies

**Build-time:**
- valac (Vala compiler)
- cmake
- pkg-config

**Runtime:**
- libgtk-4-1 (>= 4.8)
- libwebkit2gtk-4.1-0 (>= 2.38)
- libgdk-pixbuf-2.0-0

### Install Commands

**Ubuntu/Debian:**
```bash
sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev valac cmake
```

**Fedora/RHEL:**
```bash
sudo dnf install gtk4-devel webkit2gtk4.1-devel vala cmake
```

**Arch Linux:**
```bash
sudo pacman -S gtk4 webkit2gtk-4.1 vala cmake
```

---

## Testing Strategy

### Unit Tests

```bash
# Basic functionality
node test/test.mjs

# Platform-specific tests
node test/platform.mjs
```

### Manual Testing Checklist

- [ ] Open window with HTML content
- [ ] Execute JavaScript via eval
- [ ] Load local HTML file
- [ ] Follow cursor (snap mode)
- [ ] Follow cursor (spring mode)
- [ ] Multi-monitor setup
- [ ] Dark/light mode switching
- [ ] Click-through overlay
- [ ] Transparent background
- [ ] Frameless window
- [ ] Hidden prewarm + show()

### Integration Tests

Extend existing test suite to include Linux:

```javascript
// test/test.mjs
const platform = process.platform;
if (platform === 'linux') {
  // Linux-specific test cases
}
```

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Wayland cursor tracking issues | High | Medium | Fallback to X11 APIs |
| WebKit2GTK version fragmentation | Medium | High | Target 2.38+ minimum |
| GTK4 theming inconsistencies | Low | Medium | Use CSS for styling |
| Vala learning curve | Low | Low | Reference macOS implementation |

---

## Success Metrics

- [ ] All P0/P1/P2 tasks complete
- [ ] Integration tests pass on all 3 target distros
- [ ] Binary size < 1MB
- [ ] Startup time < 100ms
- [ ] Feature parity with macOS/Windows (95%+)
- [ ] Documentation complete
- [ ] npm package published with `linux` in `os` field

---

## References

- [Linux Port Plan](../LINUX_PORT_PLAN.md)
- [ADR-001: Linux Port Architecture](../adr/001-linux-port.md)
- [macOS Implementation](../../src/glimpse.swift)
- [Windows Implementation](../../native/windows/Program.cs)

---

**Assignee:** TBD  
**Reporter:** BestWond Agent  
**Last Updated:** 2026-03-16

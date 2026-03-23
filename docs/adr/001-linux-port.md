# ADR-001: Linux Port Architecture

**Date:** 2026-03-16  
**Status:** Accepted  
**Context:** Glimpse Linux Port  
**Deciders:** BestWond Agent

---

## Decision

Port Glimpse to Linux using **GTK4 + WebKit2GTK** with **Vala** as the implementation language.

### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **UI Framework** | GTK4 | Modern, well-maintained, native Linux support |
| **WebView** | WebKit2GTK 2.38+ | Same engine as macOS (WebKit), mature API |
| **Language** | Vala | Native GTK bindings, type-safe, fast compilation |
| **Build System** | CMake | Cross-platform, standard for C/Vala projects |
| **Target Distros** | Ubuntu 22.10+, Fedora 37+, Arch | WebKit2GTK 2.38+ availability |

---

## Alternatives Considered

### Option 1: Python + PyGObject

**Pros:**
- Faster prototyping
- No compilation step
- Easier debugging

**Cons:**
- Requires Python runtime dependency
- Slower startup time
- Type safety issues
- Larger distribution size

**Verdict:** ❌ Rejected - contradicts "zero dependencies" philosophy

---

### Option 2: C + GTK4

**Pros:**
- Zero abstraction layer
- Maximum control
- No language runtime

**Cons:**
- Verbose code (~2x lines vs Vala)
- Manual memory management
- Slower development

**Verdict:** ❌ Rejected - Vala provides same binaries with better DX

---

### Option 3: Qt + QtWebEngine

**Pros:**
- Cross-platform (could replace Windows/macOS too)
- Modern WebView (Chromium-based)

**Cons:**
- Heavy dependency (~100MB+)
- Different engine than macOS (WebKit vs Blink)
- Protocol inconsistency risk
- LGPL licensing concerns

**Verdict:** ❌ Rejected - breaks "single-file, zero dependencies" principle

---

### Option 4: Tauri-like (Rust + WebKit2GTK)

**Pros:**
- Modern language
- Excellent safety guarantees
- Small binary size

**Cons:**
- Rust toolchain complexity
- Longer compilation times
- Overkill for ~500 line project
- Steeper learning curve

**Verdict:** ❌ Rejected - Vala is simpler for GTK-native development

---

## Consequences

### Positive

✅ **Consistent Architecture:** All three platforms use native WebKit (macOS, Linux) or WebView2 (Windows)  
✅ **Small Binary:** Vala compiles to native C, then machine code (~500KB binary)  
✅ **Fast Startup:** No runtime overhead, instant window creation  
✅ **Type Safety:** Vala's type system catches errors at compile time  
✅ **Maintainable:** Single-file implementation per platform (~500 lines)

### Negative

⚠️ **Distribution Complexity:** Users need GTK4 + WebKit2GTK installed  
⚠️ **Version Fragmentation:** WebKit2GTK 2.32-2.44 across distros  
⚠️ **Wayland Support:** May need X11 fallback for cursor tracking  
⚠️ **Developer Availability:** Fewer developers know Vala vs Python/C++

### Mitigation Strategies

1. **Dependencies:** Document clear install commands per distro
2. **Version Fragmentation:** Target 2.38+ minimum, test on oldest supported
3. **Wayland:** Use GDK4 abstraction, fallback to X11 if needed
4. **Vala Learning Curve:** Include detailed code comments, reference macOS/Swift implementation

---

## Implementation Notes

### File Structure

```
native/linux/
├── Glimpse.vala       # Main implementation (~500 lines)
├── CMakeLists.txt     # Build configuration
└── README.md          # Linux-specific docs
```

### Key API Mappings

| macOS (Swift) | Linux (Vala/GTK4) |
|---------------|-------------------|
| `NSWindow` | `GtkApplicationWindow` |
| `WKWebView` | `WebKitWebView` |
| `NSEvent.mouseLocation` | `GdkSeat.get_pointer().get_position()` |
| `NSScreen.screens` | `GdkDisplay.get_monitors()` |
| `NSApp.effectiveAppearance` | `Gtk.Settings.gtk_application_prefer_dark_theme` |
| `DispatchQueue.global` | `GLib.IOChannel + watch` |

### Protocol Compatibility

Linux implementation must maintain **100% protocol compatibility**:

- Same JSON Lines commands (stdin)
- Same event types (stdout)
- Same CLI flags
- Same `window.glimpse` bridge API

This ensures the Node.js wrapper (`src/glimpse.mjs`) works unchanged across platforms.

---

## Testing Requirements

Before marking this ADR as implemented:

- [ ] Basic window opens on Ubuntu 22.10
- [ ] HTML rendering works
- [ ] JavaScript eval works
- [ ] Follow cursor (snap mode) works
- [ ] Follow cursor (spring mode) works
- [ ] Multi-monitor info accurate
- [ ] Dark mode detection works
- [ ] Integration tests pass (`npm test`)
- [ ] Works on Fedora 37+
- [ ] Works on Arch Linux

---

## References

- [GTK4 Documentation](https://docs.gtk.org/gtk4/)
- [WebKit2GTK API](https://webkitgtk.org/reference/webkit2gtk/stable/)
- [Vala Language Guide](https://wiki.gnome.org/Projects/Vala)
- [macOS Implementation](../../src/glimpse.swift)
- [Windows Implementation](../../native/windows/Program.cs)

---

**Approved:** 2026-03-16  
**Next Review:** After P0 implementation complete

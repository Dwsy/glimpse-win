# Glimpse Linux Port - Executive Summary

## 🎯 Goal

Port Glimpse to Linux with **GTK4 + WebKit2GTK** to achieve full cross-platform support (macOS, Windows, Linux).

---

## 📋 Technical Decision

| Component | Choice |
|-----------|--------|
| **UI Framework** | GTK4 |
| **WebView** | WebKit2GTK 2.38+ |
| **Language** | Vala |
| **Build** | CMake |
| **Targets** | Ubuntu 22.10+, Fedora 37+, Arch Linux |

**Rationale:** Native Linux APIs, type-safe, fast compilation, small binary (~500KB), consistent with macOS (both use WebKit).

---

## 📦 Implementation Plan

### Phase P0: Core (2-3 days)
- Basic window with HTML rendering
- JSON Lines protocol
- Commands: `html`, `eval`, `file`, `close`, `get-info`, `show`
- Events: `ready`, `message`, `closed`

### Phase P1: Cursor Following (1-2 days)
- Snap mode
- Spring physics mode
- 6 anchor positions
- Runtime protocol updates

### Phase P2: Polish (1 day)
- Multi-monitor support
- Dark mode detection
- Click-through, transparency
- Full CLI flag support

**Total:** 4-6 days, ~950 lines of Vala code

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│  Node.js Wrapper                    │
│  (src/glimpse.mjs)                  │
│  - Cross-platform API               │
└──────────────┬──────────────────────┘
               │ JSON Lines
┌──────────────▼──────────────────────┐
│  Glimpse Linux                      │
│  (native/linux/Glimpse.vala)        │
│  - GTK4 Window                      │
│  - WebKit2GTK WebView               │
│  - GDK4 Cursor/Monitors             │
└─────────────────────────────────────┘
```

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| [`docs/LINUX_PORT_PLAN.md`](./LINUX_PORT_PLAN.md) | Detailed implementation plan |
| [`docs/adr/001-linux-port.md`](./adr/001-linux-port.md) | Architecture Decision Record |
| [`docs/issues/linux-port.md`](./issues/linux-port.md) | Workhub Issue tracking |
| [`docs/LINUX_PORT_SUMMARY.md`](./LINUX_PORT_SUMMARY.md) | This summary |

---

## ✅ Next Steps

1. **Review documentation** - Confirm architecture and plan
2. **Set up Linux dev environment** - Ubuntu 22.10+ VM or container
3. **Create Workhub Issue** - Link to `docs/issues/linux-port.md`
4. **Implement P0** - Core window and protocol
5. **Test & iterate** - Validate on all target distros

---

## 🔗 References

- **macOS:** `src/glimpse.swift` (~420 lines)
- **Windows:** `native/windows/Program.cs` (~450 lines)
- **Linux (planned):** `native/linux/Glimpse.vala` (~500 lines)

---

**Status:** Planning Complete ✅  
**Ready for Implementation:** Yes  
**Estimated Completion:** 4-6 days from start

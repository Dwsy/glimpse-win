# Glimpse Linux Port Plan

**Status:** Planning Complete  
**Target:** WebKit2GTK 2.38+ (Ubuntu 22.10+, Fedora 37+, Arch Linux)  
**Implementation Language:** Vala (GTK4 native bindings)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Glimpse Linux                            │
├─────────────────────────────────────────────────────────────┤
│  Node.js Wrapper (src/glimpse.mjs)                          │
│  - Cross-platform API (open, prompt, followCursor, etc.)    │
│  - JSON Lines protocol over stdin/stdout                    │
├─────────────────────────────────────────────────────────────┤
│  Native Host (src/glimpse-linux)                            │
│  - GTK4 Application Window                                  │
│  - WebKit2GTK WebView                                       │
│  - Stdin/Stdout JSON Lines handler                          │
│  - Cursor tracking (GDK + X11/Wayland)                      │
├─────────────────────────────────────────────────────────────┤
│  System Dependencies                                        │
│  - GTK4 (libgtk-4-1)                                        │
│  - WebKit2GTK 2.38+ (libwebkit2gtk-4.1)                     │
│  - GDK4 (cursor, monitors)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Parity Matrix

| Feature | macOS | Windows | Linux (Planned) | Priority |
|---------|-------|---------|-----------------|----------|
| HTML rendering | ✅ | ✅ | ✅ | P0 |
| Eval JavaScript | ✅ | ✅ | ✅ | P0 |
| File loading | ✅ | ✅ | ✅ | P0 |
| JSON Lines protocol | ✅ | ✅ | ✅ | P0 |
| Follow cursor (snap) | ✅ | ✅ | ✅ | P1 |
| Follow cursor (spring) | ✅ | ✅ | ✅ | P1 |
| Cursor anchor positions | ✅ | ✅ | ✅ | P1 |
| Multi-monitor info | ✅ | ✅ | ✅ | P1 |
| Dark mode detection | ✅ | ✅ | ✅ | P2 |
| Click-through | ✅ | ✅ | ✅ | P2 |
| Transparent background | ✅ | ✅ | ✅ | P2 |
| Frameless window | ✅ | ✅ | ✅ | P2 |
| Floating window | ✅ | ✅ | ✅ | P2 |
| Hidden prewarm | ✅ | ✅ | ✅ | P2 |
| Auto-close | ✅ | ✅ | ✅ | P2 |

---

## Implementation Phases

### Phase P0: Core Infrastructure

**Goal:** Basic window with HTML rendering and protocol support

#### Files to Create

```
native/linux/
├── Glimpse.vala          # Main application (single-file, ~500 lines)
├── CMakeLists.txt        # Build configuration
└── README.md             # Linux-specific build instructions
```

#### Core Components

1. **Window Setup**
   - GTK4 `GtkApplicationWindow`
   - Frameless/transparent support via CSS
   - Floating level via `gtk_window_set_keep_above()`

2. **WebView Integration**
   - `WebKitWebView` with WebKit2GTK 2.38+
   - Bridge injection (`window.glimpse`)
   - Message handler for `postMessage`

3. **Stdin/Stdout Handler**
   - Async stdin reader (GLib `g_io_add_watch`)
   - JSON parsing (GLib `Json`)
   - Stdout writer with fflush

4. **Protocol Commands (P0)**
   - `html` - Load base64-encoded HTML
   - `eval` - Execute JavaScript
   - `file` - Load local file
   - `close` - Close window
   - `get-info` - Return system info
   - `show` - Show hidden window

#### Acceptance Criteria

- [ ] Window opens with blank page
- [ ] HTML loads and renders
- [ ] JavaScript eval works
- [ ] File loading works
- [ ] `ready` event emitted with screen info
- [ ] `message` event from web content
- [ ] `closed` event on exit
- [ ] Node.js wrapper can spawn and communicate

---

### Phase P1: Cursor Following

**Goal:** Full cursor tracking with snap and spring modes

#### Components

1. **Cursor Tracking**
   - GDK4 `GdkSeat` for global cursor position
   - X11 fallback via `XQueryPointer` (if Wayland unavailable)
   - Wayland support via `gdk_display_get_default_seat()`

2. **Anchor Positioning**
   - Same 6 anchor points as macOS/Windows:
     - `top-left`, `top-right`, `right`
     - `bottom-right`, `bottom-left`, `left`
   - Safe zone constants (20/27/15/39 pixels)

3. **Spring Physics**
   - Port exact same physics from macOS:
     - Stiffness: 400
     - Damping: 28
     - DT: 1/120
     - Settle threshold: 0.5
   - GTK `g_timeout_add()` at ~120Hz (8ms)

4. **Protocol Extension**
   - `follow-cursor` command with `enabled`, `anchor`, `mode`
   - Runtime switching between snap/spring
   - `cursorTip` in ready/info events

#### Acceptance Criteria

- [ ] `--follow-cursor` flag works
- [ ] Snap mode follows cursor instantly
- [ ] Spring mode has smooth physics animation
- [ ] Anchor positions work correctly
- [ ] Runtime protocol command updates work
- [ ] `cursorTip` calculated correctly

---

### Phase P2: Polish & Advanced Features

**Goal:** Feature parity with macOS/Windows

#### Components

1. **Multi-Monitor Support**
   - `GdkMonitor` enumeration
   - Per-monitor scale factor (DPI)
   - Working area (taskbar exclusion)

2. **Appearance Detection**
   - GTK `gtk_settings_get_dark_app()` for dark mode
   - Accent color from GTK theme
   - High contrast detection

3. **Advanced Window Styles**
   - Click-through via input shape mask
   - Transparency via RGBA visual
   - CSS styling for rounded corners

4. **Protocol Commands**
   - `follow-cursor` with all options
   - Full `get-info` response

#### Acceptance Criteria

- [ ] Multi-monitor info accurate
- [ ] Dark mode detected
- [ ] Click-through works
- [ ] All CLI flags functional
- [ ] Integration tests pass

---

## Build System

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20)
project(glimpse-linux VERSION 0.1.0 LANGUAGES C Vala)

find_package(PkgConfig REQUIRED)
pkg_check_modules(DEPS REQUIRED
    gtk4
    webkit2gtk-4.1
    glib-2.0
    gio-2.0
)

add_executable(glimpse Glimpse.vala)
target_include_directories(glimpse PRIVATE ${DEPS_INCLUDE_DIRS})
target_link_libraries(glimpse ${DEPS_LIBRARIES})
target_compile_options(glimpse PRIVATE ${DEPS_CFLAGS})
```

### Build Script (scripts/build.mjs extension)

```javascript
case 'linux': {
  const hasVala = spawnSync('valac', ['--version'], { encoding: 'utf8' });
  if (hasVala.error || hasVala.status !== 0) {
    fail('Missing Vala compiler. Install valac, then rerun npm run build:linux');
  }
  const hasCmake = spawnSync('cmake', ['--version'], { encoding: 'utf8' });
  if (hasCmake.error || hasCmake.status !== 0) {
    fail('Missing CMake. Install cmake, then rerun npm run build:linux');
  }
  
  // Create build directory
  const buildDir = join(__dirname, '..', 'native', 'linux', 'build');
  mkdirSync(buildDir, { recursive: true });
  
  // Configure and build
  run('cmake', ['-B', buildDir, '-S', join(__dirname, '..', 'native', 'linux')]);
  run('cmake', ['--build', buildDir, '--config', 'Release']);
  
  // Copy to src/ for Node wrapper
  copyFileSync(
    join(buildDir, 'glimpse'),
    join(__dirname, '..', 'src', 'glimpse-linux')
  );
  break;
}
```

### Package Dependencies

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

## Node.js Wrapper Changes

### src/glimpse.mjs

```javascript
function resolveNativeHost() {
  // ... existing darwin/win32 cases ...
  case 'linux':
    return {
      path: join(__dirname, 'glimpse-linux'),
      platform: 'linux',
      buildHint: "Run 'npm run build:linux' or 'cmake --build native/linux/build'",
    };
}
```

### package.json

```json
"os": ["darwin", "win32", "linux"]
```

---

## Testing Strategy

### Unit Tests (Linux-specific)

```javascript
// test/linux-test.mjs
import { open } from '../src/glimpse.mjs';

// Test 1: Basic open/close
const win = open('<h1>Linux Test</h1>');
await new Promise(resolve => win.once('ready', resolve));
win.close();
await new Promise(resolve => win.once('closed', resolve));
console.log('✅ Basic test passed');

// Test 2: Follow cursor
const win2 = open('<h1>Follow Test</h1>', { followCursor: true });
await new Promise(resolve => win2.once('ready', resolve));
win2.followCursor(false);
win2.close();
console.log('✅ Follow cursor test passed');
```

### Integration Tests

Extend existing `test/test.mjs` with Linux platform detection.

---

## Timeline Estimate

| Phase | Complexity | Files | Lines | Time |
|-------|------------|-------|-------|------|
| P0 | Medium | 3 | ~600 | 2-3 days |
| P1 | High | 1 (modify) | ~200 | 1-2 days |
| P2 | Low | 1 (modify) | ~150 | 1 day |
| **Total** | | | **~950** | **4-6 days** |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wayland cursor tracking | High | Fallback to X11 via `gdk_x11_` APIs |
| WebKit2GTK version fragmentation | Medium | Target 2.38+ minimum, document distro requirements |
| GTK4 theming differences | Low | Use CSS for consistent appearance |
| Spring physics timing | Low | Use GTK high-priority timer, same 120Hz |

---

## Next Steps

1. **Create Issue in Workhub** - Track Linux port progress
2. **Set up development environment** - Ubuntu 22.10+ VM or container
3. **Implement P0** - Core window and protocol
4. **Test basic functionality** - HTML, eval, file, close
5. **Implement P1** - Cursor following
6. **Implement P2** - Polish and advanced features
7. **Update documentation** - README.md, AGENTS.md
8. **Publish npm package** - Update os field, test on all platforms

---

## Reference Implementations

- **macOS:** `src/glimpse.swift` (~420 lines, Cocoa/WKWebView)
- **Windows:** `native/windows/Program.cs` (~450 lines, WinForms/WebView2)
- **Linux (planned):** `native/linux/Glimpse.vala` (~500 lines, GTK4/WebKit2GTK)

---

## Appendix: Vala Code Skeleton

```vala
using Gtk;
using WebKit;
using Gdk;
using Json;

class GlimpseWindow : ApplicationWindow {
    private WebView web_view;
    private Config config;
    
    public GlimpseWindow(Application app, Config config) {
        Object(application: app);
        this.config = config;
        setup_window();
        setup_webview();
        start_stdin_reader();
    }
    
    private void setup_window() {
        set_title(config.title);
        set_default_size(config.width, config.height);
        // ... frameless, floating, transparent ...
    }
    
    private void setup_webview() {
        web_view = new WebView();
        // ... bridge injection, message handlers ...
    }
    
    private void start_stdin_reader() {
        // ... async stdin with GLib IO watch ...
    }
}

int main(string[] args) {
    var config = Config.parse(args);
    var app = new Application("ui.glimpse", ApplicationFlags.FLAGS_NONE);
    app.activate.connect(() => {
        var win = new GlimpseWindow(app, config);
        win.present();
    });
    return app.run(args);
}
```

---

**Document Version:** 1.0  
**Created:** 2026-03-16  
**Last Updated:** 2026-03-16

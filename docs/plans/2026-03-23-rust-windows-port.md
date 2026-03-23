# Rust Windows Port Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace the .NET 8 + WebView2 C# implementation with a pure Rust implementation using wry + tao + windows-rs, achieving a smaller binary size (~3-5MB vs 50MB+) and zero runtime dependencies.

**Architecture:** Follow the same module structure as the Linux Rust implementation (`src/linux/`). Each module has a single responsibility: protocol.rs handles message types, io.rs handles stdin/stdout JSON Lines, cursor.rs implements spring physics, sysinfo.rs collects Windows system info, bridge.rs provides the JavaScript injection code. The main.rs orchestrates window creation via tao and WebView2 via wry.

**Tech Stack:**
- `wry` 0.48 - WebView2 wrapper (cross-platform)
- `tao` 0.32 - Window management (cross-platform, used by Tauri)
- `windows-rs` 0.58 - Win32 API bindings for advanced features (click-through, transparency)
- `serde` + `serde_json` - Protocol serialization
- `clap` - CLI argument parsing
- `base64` - HTML payload decoding

---

## Task 1: Create Protocol Module

**Files:**
- Create: `src/windows/src/protocol.rs`

**Step 1: Write the protocol types**

```rust
// src/windows/src/protocol.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum InboundMsg {
    Html { html: String },
    Eval { js: String },
    File { path: String },
    Show { title: Option<String> },
    Close,
    GetInfo,
    FollowCursor {
        #[serde(default = "default_true")]
        enabled: bool,
        anchor: Option<String>,
        mode: Option<String>,
    },
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum OutboundMsg {
    Ready {
        #[serde(flatten)]
        info: SystemInfo,
    },
    Info {
        #[serde(flatten)]
        info: SystemInfo,
    },
    Message {
        data: serde_json::Value,
    },
    Closed,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    pub width: i32,
    pub height: i32,
    pub scale_factor: i32,
    pub visible_x: i32,
    pub visible_y: i32,
    pub visible_width: i32,
    pub visible_height: i32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceInfo {
    pub dark_mode: bool,
    pub accent_color: Option<String>,
    pub reduce_motion: bool,
    pub increase_contrast: bool,
}

#[derive(Debug, Serialize, Clone, Copy, Default, PartialEq, Eq)]
pub struct CursorPos {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub screen: ScreenInfo,
    pub screens: Vec<ScreenInfo>,
    pub appearance: AppearanceInfo,
    pub cursor: CursorPos,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor_tip: Option<CursorPos>,
}
```

**Step 2: Verify compilation**

Run: `cd src/windows && cargo check`
Expected: No errors (some warnings about unused imports OK)

**Step 3: Commit**

```bash
git add src/windows/src/protocol.rs
git commit -m "feat(windows): add protocol types module"
```

---

## Task 2: Create IO Module

**Files:**
- Create: `src/windows/src/io.rs`

**Step 1: Write the IO module**

```rust
// src/windows/src/io.rs
use std::io::{BufRead, BufReader, Write};
use std::sync::mpsc;

use crate::protocol::{InboundMsg, OutboundMsg};

pub fn spawn_stdin_reader() -> mpsc::Receiver<InboundMsg> {
    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        let reader = BufReader::new(stdin.lock());
        for line in reader.lines() {
            match line {
                Ok(l) if l.trim().is_empty() => continue,
                Ok(l) => match serde_json::from_str::<InboundMsg>(&l) {
                    Ok(msg) => {
                        if tx.send(msg).is_err() {
                            break;
                        }
                    }
                    Err(e) => eprintln!("[glimpse] bad message: {e}: {l}"),
                },
                Err(_) => break,
            }
        }
        let _ = tx.send(InboundMsg::Close);
    });

    rx
}

pub fn emit(msg: &OutboundMsg) {
    let line = serde_json::to_string(msg).unwrap();
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{line}");
    let _ = handle.flush();
}
```

**Step 2: Verify compilation**

Run: `cd src/windows && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/windows/src/io.rs
git commit -m "feat(windows): add IO module for stdin/stdout JSON Lines"
```

---

## Task 3: Create Cursor Module

**Files:**
- Create: `src/windows/src/cursor.rs`

**Step 1: Write the cursor module with spring physics**

```rust
// src/windows/src/cursor.rs
/// Safe zone constants matching the Swift/Linux binary.
const SAFE_LEFT: f64 = 20.0;
const SAFE_RIGHT: f64 = 27.0;
const SAFE_UP: f64 = 15.0;
const SAFE_DOWN: f64 = 39.0;

/// Compute the target window position given cursor position, window size,
/// optional anchor, and offset. Returns (x, y) in screen coordinates.
pub fn compute_target(
    cursor_x: f64,
    cursor_y: f64,
    win_w: f64,
    win_h: f64,
    anchor: Option<&str>,
    offset_x: f64,
    offset_y: f64,
) -> (f64, f64) {
    match anchor {
        Some("top-left") => (
            cursor_x - SAFE_LEFT - win_w + offset_x,
            cursor_y - SAFE_UP - win_h + offset_y,
        ),
        Some("top-right") => (
            cursor_x + SAFE_RIGHT + offset_x,
            cursor_y - SAFE_UP - win_h + offset_y,
        ),
        Some("right") => (
            cursor_x + SAFE_RIGHT + offset_x,
            cursor_y - win_h / 2.0 + offset_y,
        ),
        Some("bottom-right") => (
            cursor_x + SAFE_RIGHT + offset_x,
            cursor_y + SAFE_DOWN + offset_y,
        ),
        Some("bottom-left") => (
            cursor_x - SAFE_LEFT - win_w + offset_x,
            cursor_y + SAFE_DOWN + offset_y,
        ),
        Some("left") => (
            cursor_x - SAFE_LEFT - win_w + offset_x,
            cursor_y - win_h / 2.0 + offset_y,
        ),
        _ => (cursor_x + offset_x, cursor_y + offset_y),
    }
}

/// Compute cursorTip — the CSS position of the cursor within the window.
pub fn compute_cursor_tip(
    win_w: f64,
    win_h: f64,
    anchor: Option<&str>,
    offset_x: f64,
    offset_y: f64,
) -> Option<(i32, i32)> {
    match anchor {
        Some(a) => {
            let (base_x, base_y) = compute_target(0.0, 0.0, win_w, win_h, Some(a), offset_x, offset_y);
            let css_x = -base_x as i32;
            let css_y = (win_h - (-base_y)) as i32;
            Some((css_x, css_y))
        }
        None => {
            let css_x = -offset_x as i32;
            let css_y = (win_h + offset_y) as i32;
            Some((css_x, css_y))
        }
    }
}

/// Spring physics state matching Swift/Linux: stiffness=400, damping=28, dt=1/120
pub struct SpringState {
    pub pos: (f64, f64),
    pub vel: (f64, f64),
    pub target: (f64, f64),
}

impl SpringState {
    pub const STIFFNESS: f64 = 400.0;
    pub const DAMPING: f64 = 28.0;
    pub const DT: f64 = 1.0 / 120.0;
    pub const SETTLE_THRESHOLD: f64 = 0.5;

    pub fn new(pos: (f64, f64)) -> Self {
        Self {
            pos,
            vel: (0.0, 0.0),
            target: pos,
        }
    }

    /// Advance one physics step. Returns true if settled.
    pub fn tick(&mut self) -> bool {
        let dx = self.target.0 - self.pos.0;
        let dy = self.target.1 - self.pos.1;
        let fx = Self::STIFFNESS * dx - Self::DAMPING * self.vel.0;
        let fy = Self::STIFFNESS * dy - Self::DAMPING * self.vel.1;
        self.vel.0 += fx * Self::DT;
        self.vel.1 += fy * Self::DT;
        self.pos.0 += self.vel.0 * Self::DT;
        self.pos.1 += self.vel.1 * Self::DT;

        let dist = (dx * dx + dy * dy).sqrt();
        let vel = (self.vel.0 * self.vel.0 + self.vel.1 * self.vel.1).sqrt();
        if dist < Self::SETTLE_THRESHOLD && vel < Self::SETTLE_THRESHOLD {
            self.pos = self.target;
            self.vel = (0.0, 0.0);
            true
        } else {
            false
        }
    }
}
```

**Step 2: Verify compilation**

Run: `cd src/windows && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/windows/src/cursor.rs
git commit -m "feat(windows): add cursor tracking and spring physics module"
```

---

## Task 4: Create Bridge Module

**Files:**
- Create: `src/windows/src/bridge.rs`

**Step 1: Write the JavaScript bridge**

```rust
// src/windows/src/bridge.rs
/// JavaScript bridge injected before page scripts run.
/// Uses WebView2's chrome.webview.postMessage API.
pub const BRIDGE_JS: &str = r#"
window.glimpse = {
    cursorTip: null,
    send: function(data) {
        window.chrome.webview.postMessage(JSON.stringify(data));
    },
    close: function() {
        window.chrome.webview.postMessage(JSON.stringify({__glimpse_close: true}));
    }
};
"#;
```

**Step 2: Verify compilation**

Run: `cd src/windows && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/windows/src/bridge.rs
git commit -m "feat(windows): add JavaScript bridge module"
```

---

## Task 5: Create SysInfo Module

**Files:**
- Create: `src/windows/src/sysinfo.rs`

**Step 1: Write the system info collector**

```rust
// src/windows/src/sysinfo.rs
use crate::protocol::{AppearanceInfo, CursorPos, ScreenInfo, SystemInfo};
use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

pub fn collect(cursor_pos: Option<CursorPos>, cursor_tip: Option<CursorPos>) -> SystemInfo {
    let screens = enumerate_monitors();
    let primary = screens.first().cloned().unwrap_or_default();

    SystemInfo {
        screen: ScreenInfo {
            x: None,
            y: None,
            ..primary.clone()
        },
        screens,
        appearance: get_appearance(),
        cursor: cursor_pos.unwrap_or_else(get_cursor_pos),
        cursor_tip,
    }
}

pub fn get_cursor_pos() -> CursorPos {
    unsafe {
        let mut point = POINT::default();
        if GetCursorPos(&mut point).is_ok() {
            CursorPos {
                x: point.x,
                y: point.y,
            }
        } else {
            CursorPos::default()
        }
    }
}

fn enumerate_monitors() -> Vec<ScreenInfo> {
    let mut screens = Vec::new();

    unsafe {
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_monitor_callback),
            &mut screens as *mut Vec<ScreenInfo> as isize,
        );
    }

    screens
}

unsafe extern "system" fn enum_monitor_callback(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: isize,
) -> windows::core::BOOL {
    let screens = &mut *(lparam as *mut Vec<ScreenInfo>);

    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

    if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
        let rect = info.monitorInfo.rcMonitor;
        let work_rect = info.monitorInfo.rcWork;

        let mut dpi_x = 96u32;
        let mut dpi_y = 96u32;
        let _ = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);

        let scale_factor = ((dpi_x as f64 / 96.0) * 100.0).round() as i32;

        screens.push(ScreenInfo {
            x: Some(rect.left),
            y: Some(rect.top),
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
            scale_factor,
            visible_x: work_rect.left,
            visible_y: work_rect.top,
            visible_width: work_rect.right - work_rect.left,
            visible_height: work_rect.bottom - work_rect.top,
        });
    }

    true.into()
}

fn get_appearance() -> AppearanceInfo {
    let dark_mode = is_dark_mode();
    let reduce_motion = is_reduce_motion();

    AppearanceInfo {
        dark_mode,
        accent_color: get_accent_color(),
        reduce_motion,
        increase_contrast: false,
    }
}

fn is_dark_mode() -> bool {
    use std::process::Command;

    // Query Windows registry for app theme
    let output = Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
            "/v",
            "AppsUseLightTheme",
        ])
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Value of 0 means dark mode
        if stdout.contains("0x0") {
            return true;
        }
    }

    false
}

fn is_reduce_motion() -> bool {
    use std::process::Command;

    let output = Command::new("reg")
        .args([
            "query",
            r"HKCU\Control Panel\Desktop\WindowMetrics",
            "/v",
            "MinAnimate",
        ])
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("0") {
            return true;
        }
    }

    false
}

fn get_accent_color() -> Option<String> {
    use std::process::Command;

    let output = Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\DWM",
            "/v",
            "AccentColor",
        ])
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Format: "AccentColor    REG_DWORD    0xcc4a3dff"
        if let Some(hex_start) = stdout.find("0x") {
            let hex_str = &stdout[hex_start + 2..];
            if hex_str.len() >= 8 {
                // Windows stores as AABBGGRR, convert to #RRGGBB
                let a = &hex_str[0..2];
                let b = &hex_str[2..4];
                let g = &hex_str[4..6];
                let r = &hex_str[6..8];
                return Some(format!("#{}{}{}", r, g, b));
            }
        }
    }

    None
}
```

**Step 2: Verify compilation**

Run: `cd src/windows && cargo check`
Expected: May have warnings about unused imports, that's OK

**Step 3: Commit**

```bash
git add src/windows/src/sysinfo.rs
git commit -m "feat(windows): add system info collector module"
```

---

## Task 6: Create Main Module with Window Management

**Files:**
- Create: `src/windows/src/main.rs`

**Step 1: Write the main module**

```rust
// src/windows/src/main.rs
mod bridge;
mod cursor;
mod io;
mod protocol;
mod sysinfo;

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine;
use clap::Parser;
use tao::dpi::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::{Window, WindowBuilder};
use wry::WebViewBuilder;

use protocol::{CursorPos, InboundMsg, OutboundMsg};

#[derive(Parser, Debug)]
#[command(name = "glimpse")]
struct Args {
    #[arg(long, default_value_t = 800)]
    width: i32,
    #[arg(long, default_value_t = 600)]
    height: i32,
    #[arg(long, default_value = "Glimpse")]
    title: String,
    #[arg(long)]
    x: Option<i32>,
    #[arg(long)]
    y: Option<i32>,
    #[arg(long)]
    frameless: bool,
    #[arg(long)]
    floating: bool,
    #[arg(long)]
    transparent: bool,
    #[arg(long = "click-through")]
    click_through: bool,
    #[arg(long = "follow-cursor")]
    follow_cursor: bool,
    #[arg(long = "follow-mode", default_value = "snap")]
    follow_mode: String,
    #[arg(long = "cursor-anchor")]
    cursor_anchor: Option<String>,
    #[arg(long = "cursor-offset-x")]
    cursor_offset_x: Option<f64>,
    #[arg(long = "cursor-offset-y")]
    cursor_offset_y: Option<f64>,
    #[arg(long)]
    hidden: bool,
    #[arg(long = "auto-close")]
    auto_close: bool,
}

impl Args {
    fn effective_offset_x(&self) -> f64 {
        self.cursor_offset_x
            .unwrap_or(if self.cursor_anchor.is_some() { 0.0 } else { 20.0 })
    }
    fn effective_offset_y(&self) -> f64 {
        self.cursor_offset_y
            .unwrap_or(if self.cursor_anchor.is_some() { 0.0 } else { -20.0 })
    }
}

fn main() -> wry::Result<()> {
    let args = Args::parse();
    let args = Rc::new(args);

    let event_loop = EventLoop::new();

    let mut window_builder = WindowBuilder::new()
        .with_title(&args.title)
        .with_inner_size(LogicalSize::new(args.width, args.height))
        .with_decorations(!args.frameless && !args.transparent)
        .with_transparent(args.transparent)
        .with_always_on_top(args.floating || args.follow_cursor);

    if let (Some(x), Some(y)) = (args.x, args.y) {
        window_builder = window_builder.with_position(LogicalPosition::new(x, y));
    } else {
        // Center on primary monitor
        if let Some(monitor) = event_loop.primary_monitor() {
            let size = monitor.size();
            let x = (size.width as i32 - args.width) / 2;
            let y = (size.height as i32 - args.height) / 2;
            window_builder = window_builder.with_position(LogicalPosition::new(x.max(0), y.max(0)));
        }
    }

    let window = window_builder.build(&event_loop)?;

    // Apply Windows-specific styles for click-through
    #[cfg(windows)]
    if args.click_through {
        apply_click_through(&window);
    }

    // Build WebView
    let webview_builder = WebViewBuilder::new(&window)
        .with_background_color(if args.transparent { (0, 0, 0, 0) } else { (255, 255, 255, 255) })
        .with_initialization_script(bridge::BRIDGE_JS)
        .with_html("<html><body></body></html>")?;

    let (webview_tx, webview_rx) = std::sync::mpsc::channel::<WebViewCommand>();

    let webview = webview_builder
        .with_ipc_handler(move |_window, payload| {
            // Handle messages from JavaScript
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&payload) {
                if parsed.get("__glimpse_close").and_then(|v| v.as_bool()) == Some(true) {
                    let _ = webview_tx.send(WebViewCommand::Close);
                    return;
                }
                let _ = webview_tx.send(WebViewCommand::Message(parsed));
            }
        })
        .build()?;

    // State
    let hidden = Rc::new(RefCell::new(args.hidden));
    let cursor_anchor = Rc::new(RefCell::new(args.cursor_anchor.clone()));
    let follow_mode = Rc::new(RefCell::new(args.follow_mode.clone()));
    let follow_enabled = Arc::new(AtomicBool::new(args.follow_cursor));
    let current_cursor: Rc<RefCell<Option<CursorPos>>> = Rc::new(RefCell::new(None));
    let spring = Rc::new(RefCell::new(cursor::SpringState::new((0.0, 0.0))));
    let spring_animating = Rc::new(RefCell::new(false));

    let offset_x = args.effective_offset_x();
    let offset_y = args.effective_offset_y();

    // Spawn stdin reader
    let rx = io::spawn_stdin_reader();

    // Emit ready event
    let cursor_tip = if args.follow_cursor {
        cursor::compute_cursor_tip(
            args.width as f64,
            args.height as f64,
            args.cursor_anchor.as_deref(),
            offset_x,
            offset_y,
        ).map(|(x, y)| CursorPos { x, y })
    } else {
        None
    };

    let info = sysinfo::collect(*current_cursor.borrow(), cursor_tip);
    io::emit(&OutboundMsg::Ready { info });

    // Cursor tracking state
    let last_cursor_poll = Rc::new(RefCell::new(Instant::now()));

    let window_id = window.id();

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;

        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                window_id: id,
                ..
            } if id == window_id => {
                io::emit(&OutboundMsg::Closed);
                *control_flow = ControlFlow::Exit;
            }
            Event::MainEventsCleared => {
                // Process stdin messages
                while let Ok(msg) = rx.try_recv() {
                    handle_message(
                        msg,
                        &window,
                        &webview,
                        &hidden,
                        &args,
                        &cursor_anchor,
                        &follow_mode,
                        &follow_enabled,
                        &current_cursor,
                        offset_x,
                        offset_y,
                        &spring,
                        &spring_animating,
                        control_flow,
                    );
                }

                // Process WebView commands
                while let Ok(cmd) = webview_rx.try_recv() {
                    match cmd {
                        WebViewCommand::Close => {
                            io::emit(&OutboundMsg::Closed);
                            *control_flow = ControlFlow::Exit;
                        }
                        WebViewCommand::Message(data) => {
                            io::emit(&OutboundMsg::Message { data });
                            if args.auto_close {
                                io::emit(&OutboundMsg::Closed);
                                *control_flow = ControlFlow::Exit;
                            }
                        }
                    }
                }

                // Cursor follow polling (every ~16ms)
                if follow_enabled.load(Ordering::Relaxed) {
                    let now = Instant::now();
                    if now.duration_since(*last_cursor_poll.borrow()) >= Duration::from_millis(16) {
                        *last_cursor_poll.borrow_mut() = now;

                        let cursor_pos = sysinfo::get_cursor_pos();
                        *current_cursor.borrow_mut() = Some(cursor_pos);

                        let mode = follow_mode.borrow();
                        match mode.as_str() {
                            "spring" => {
                                let target = cursor::compute_target(
                                    cursor_pos.x as f64,
                                    cursor_pos.y as f64,
                                    args.width as f64,
                                    args.height as f64,
                                    cursor_anchor.borrow().as_deref(),
                                    offset_x,
                                    offset_y,
                                );
                                spring.borrow_mut().target = target;
                                *spring_animating.borrow_mut() = true;
                            }
                            "snap" | _ => {
                                let target = cursor::compute_target(
                                    cursor_pos.x as f64,
                                    cursor_pos.y as f64,
                                    args.width as f64,
                                    args.height as f64,
                                    cursor_anchor.borrow().as_deref(),
                                    offset_x,
                                    offset_y,
                                );
                                window.set_outer_position(LogicalPosition::new(target.0, target.1));
                            }
                        }
                    }
                }

                // Spring animation tick
                if *spring_animating.borrow() {
                    let (settled, px, py) = {
                        let mut state = spring.borrow_mut();
                        let settled = state.tick();
                        (settled, state.pos.0, state.pos.1)
                    };
                    window.set_outer_position(LogicalPosition::new(px, py));
                    if settled {
                        *spring_animating.borrow_mut() = false;
                    }
                }

                // Repaint webview
                let _ = webview.evaluate_script("void(0)");
            }
            _ => (),
        }
    });
}

enum WebViewCommand {
    Close,
    Message(serde_json::Value),
}

fn handle_message(
    msg: InboundMsg,
    window: &Window,
    webview: &wry::WebView,
    hidden: &Rc<RefCell<bool>>,
    args: &Rc<Args>,
    cursor_anchor: &Rc<RefCell<Option<String>>>,
    follow_mode: &Rc<RefCell<String>>,
    follow_enabled: &Arc<AtomicBool>,
    current_cursor: &Rc<RefCell<Option<CursorPos>>>,
    offset_x: f64,
    offset_y: f64,
    spring: &Rc<RefCell<cursor::SpringState>>,
    spring_animating: &Rc<RefCell<bool>>,
    control_flow: &mut ControlFlow,
) {
    match msg {
        InboundMsg::Html { html } => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(&html)
                .unwrap_or_default();
            let html_str = String::from_utf8_lossy(&decoded);
            let _ = webview.load_html(&html_str);
        }
        InboundMsg::Eval { js } => {
            let _ = webview.evaluate_script(&js);
        }
        InboundMsg::File { path } => {
            let uri = format!("file://{}", path.replace('\\', "/"));
            let _ = webview.load_url(&uri);
        }
        InboundMsg::Show { title } => {
            if let Some(t) = title {
                window.set_title(&t);
            }
            *hidden.borrow_mut() = false;
            window.set_visible(true);
            window.set_focus();
        }
        InboundMsg::Close => {
            io::emit(&OutboundMsg::Closed);
            *control_flow = ControlFlow::Exit;
        }
        InboundMsg::GetInfo => {
            let cursor_pos = *current_cursor.borrow();
            let cursor_tip = if follow_enabled.load(Ordering::Relaxed) {
                cursor::compute_cursor_tip(
                    args.width as f64,
                    args.height as f64,
                    cursor_anchor.borrow().as_deref(),
                    offset_x,
                    offset_y,
                ).map(|(x, y)| CursorPos { x, y })
            } else {
                None
            };
            let info = sysinfo::collect(cursor_pos, cursor_tip);
            io::emit(&OutboundMsg::Info { info });
        }
        InboundMsg::FollowCursor {
            enabled,
            anchor,
            mode,
        } => {
            if let Some(anchor) = anchor {
                *cursor_anchor.borrow_mut() = Some(anchor);
            }
            if let Some(mode) = mode {
                let mut follow_mode_ref = follow_mode.borrow_mut();
                let switching_to_spring = mode == "spring" && follow_mode_ref.as_str() != "spring";
                *follow_mode_ref = mode.clone();
                drop(follow_mode_ref);

                if switching_to_spring {
                    if let Ok(pos) = window.outer_position() {
                        let logical: LogicalPosition<f64> = pos.to_logical(window.scale_factor());
                        spring.borrow_mut().pos = (logical.x, logical.y);
                        spring.borrow_mut().target = (logical.x, logical.y);
                    }
                }
            }

            follow_enabled.store(enabled, Ordering::Relaxed);

            if !enabled {
                *spring_animating.borrow_mut() = false;
            }

            // Set always_on_top based on follow state
            window.set_always_on_top(enabled || args.floating);
        }
    }
}

#[cfg(windows)]
fn apply_click_through(window: &Window) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    };

    unsafe {
        let hwnd = HWND(window.hwnd() as _);
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_style = ex_style | (WS_EX_LAYERED.0 as i32) | (WS_EX_TRANSPARENT.0 as i32);
        let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
    }
}
```

**Step 2: Verify compilation**

Run: `cd src/windows && cargo check`
Expected: Should compile with some warnings

**Step 3: Commit**

```bash
git add src/windows/src/main.rs
git commit -m "feat(windows): add main module with tao + wry window management"
```

---

## Task 7: Update Build Scripts

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `scripts/postinstall.mjs`

**Step 1: Update build.mjs for Rust Windows**

Add this case to the switch statement in `scripts/build.mjs`:

```javascript
case 'win32': {
    const cargoCheck = spawnSync('cargo', ['--version'], { stdio: 'pipe' });
    if (cargoCheck.error || cargoCheck.status !== 0) {
        fail('Rust toolchain not found. Install from https://rustup.rs');
    }
    const rustDir = join(__dirname, '..', 'src', 'windows');
    run('cargo', ['build', '--release'], { cwd: rustDir });
    const src = join(rustDir, 'target', 'release', 'glimpse.exe');
    const dest = join(__dirname, '..', 'src', 'glimpse.exe');
    copyFileSync(src, dest);
    console.log('Binary installed to src/glimpse.exe');
    break;
}
```

Replace the existing `win32` case that uses dotnet.

**Step 2: Update postinstall.mjs for Rust Windows**

Replace the Windows check from dotnet to cargo:

```javascript
if (process.platform === 'win32') {
    if (!hasCommand('cargo')) {
        const message = 'Postinstall skipped native build because cargo was not found. Install Rust from https://rustup.rs, then run npm run build:windows.';
        writeFileSync(skippedBuildMarker, message + '\n');
        console.warn(`[glimpse] ${message}`);
        process.exit(0);
    }
}
```

**Step 3: Verify**

Run: `node scripts/build.mjs --help` or similar to verify syntax
Expected: No syntax errors

**Step 4: Commit**

```bash
git add scripts/build.mjs scripts/postinstall.mjs
git commit -m "feat(windows): update build scripts for Rust compilation"
```

---

## Task 8: Update Node.js Wrapper

**Files:**
- Modify: `src/glimpse.mjs`

**Step 1: Update resolveNativeHost for Windows**

Change the `win32` case in `resolveNativeHost()` from:

```javascript
case 'win32':
    return {
        path: normalize(join(__dirname, '..', 'native', 'windows', 'bin', 'glimpse.exe')),
        platform: 'win32',
        buildHint: "Run 'npm run build:windows' (requires .NET 8 SDK and WebView2 Runtime)",
    };
```

To:

```javascript
case 'win32':
    return {
        path: join(__dirname, 'glimpse.exe'),
        platform: 'win32',
        buildHint: "Run 'npm run build:windows' (requires Rust toolchain and WebView2 Runtime)",
    };
```

**Step 2: Verify**

Run: `node -e "import('./src/glimpse.mjs').then(m => console.log(m.getNativeHostInfo()))"`
Expected: Should print host info without errors

**Step 3: Commit**

```bash
git add src/glimpse.mjs
git commit -m "feat(windows): update host resolution for Rust binary"
```

---

## Task 9: Update package.json

**Files:**
- Modify: `package.json`

**Step 1: Update files array**

Replace the Windows-specific entries in the `files` array:

Before:
```json
"native/windows/Glimpse.Windows.csproj",
"native/windows/Program.cs",
"NuGet.config",
```

After:
```json
"src/windows/",
```

**Step 2: Update version**

Bump version to `0.7.0` to indicate the major Windows change.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.7.0 with Rust Windows support"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Update README.md Windows section**

Update the Windows requirements from:
```
### Windows
- Windows 10/11
- .NET 8 SDK
- Microsoft Edge WebView2 Runtime (pre-installed on most systems)
- Node.js 18+
```

To:
```
### Windows
- Windows 10/11
- Rust toolchain ([install](https://rustup.rs))
- Microsoft Edge WebView2 Runtime (pre-installed on most systems)
- Node.js 18+
```

**Step 2: Add CHANGELOG.md entry**

Add at the top:
```markdown
## 0.7.0

### Changed

- **Windows: Migrated from .NET 8 to Rust** — Binary size reduced from ~50MB to ~3-5MB, zero runtime dependencies
- Uses `wry` + `tao` + `windows-rs` for native WebView2 integration
- Aligned with Linux Rust implementation for shared code patterns
```

**Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: update for Rust Windows implementation"
```

---

## Task 11: Build and Test

**Files:**
- Test: All existing tests

**Step 1: Build the Rust binary**

Run: `cd src/windows && cargo build --release`
Expected: Successful compilation, binary at `target/release/glimpse.exe`

**Step 2: Copy binary to src/**

Run: `cp src/windows/target/release/glimpse.exe src/glimpse.exe`

**Step 3: Run platform tests**

Run: `npm run test:platform`
Expected: All platform invariants pass

**Step 4: Run integration tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Manual testing**

Run the demos:
- `npm run demo:windows` — Basic window
- `npm run demo:companion` — Cursor-follow overlay
- `npm run demo:html` — HTML + Node round-trip

Expected: All demos work correctly

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(windows): complete Rust port with all tests passing"
```

---

## Summary

| Task | Description | Time Est |
|------|-------------|----------|
| 1 | Protocol types module | 5 min |
| 2 | IO module | 5 min |
| 3 | Cursor/spring physics | 10 min |
| 4 | Bridge module | 3 min |
| 5 | SysInfo collector | 15 min |
| 6 | Main module | 30 min |
| 7 | Build scripts | 10 min |
| 8 | Node.js wrapper | 5 min |
| 9 | package.json | 5 min |
| 10 | Documentation | 10 min |
| 11 | Build & test | 20 min |
| **Total** | | **~2 hours** |

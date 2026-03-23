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
use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::{WebView, WebViewBuilder};

use protocol::{CursorPos, InboundMsg, OutboundMsg};

/// Application state shared across event handlers
struct AppState {
    hidden: Rc<RefCell<bool>>,
    cursor_anchor: Rc<RefCell<Option<String>>>,
    follow_mode: Rc<RefCell<String>>,
    follow_enabled: Arc<AtomicBool>,
    current_cursor: Rc<RefCell<Option<CursorPos>>>,
    spring: Rc<RefCell<cursor::SpringState>>,
    spring_animating: Rc<RefCell<bool>>,
    emit_ready_after_html: Rc<RefCell<bool>>,
    last_cursor_poll: Rc<RefCell<Instant>>,
    offset_x: f64,
    offset_y: f64,
}

impl AppState {
    fn new(args: &Args) -> Self {
        let offset_x = args.effective_offset_x();
        let offset_y = args.effective_offset_y();

        Self {
            hidden: Rc::new(RefCell::new(args.hidden)),
            cursor_anchor: Rc::new(RefCell::new(args.cursor_anchor.clone())),
            follow_mode: Rc::new(RefCell::new(args.follow_mode.clone())),
            follow_enabled: Arc::new(AtomicBool::new(args.follow_cursor)),
            current_cursor: Rc::new(RefCell::new(None)),
            spring: Rc::new(RefCell::new(cursor::SpringState::new((0.0, 0.0)))),
            spring_animating: Rc::new(RefCell::new(false)),
            emit_ready_after_html: Rc::new(RefCell::new(false)),
            last_cursor_poll: Rc::new(RefCell::new(Instant::now())),
            offset_x,
            offset_y,
        }
    }
}

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

enum WebViewCommand {
    Close,
    Message(serde_json::Value),
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let args = Rc::new(args);

    let event_loop = EventLoop::new();

    let window = create_window(&event_loop, &args)?;
    let (webview_tx, webview_rx) = std::sync::mpsc::channel::<WebViewCommand>();
    let webview = create_webview(&window, &args, webview_tx.clone())?;
    let state = AppState::new(&args);

    let stdin_rx = io::spawn_stdin_reader();

    emit_ready(&state, &args);

    run_event_loop(
        event_loop,
        window,
        webview,
        args,
        state,
        stdin_rx,
        webview_rx,
    );

    Ok(())
}

fn create_window<T>(event_loop: &EventLoop<T>, args: &Args) -> Result<tao::window::Window, tao::error::OsError> {
    let mut builder = WindowBuilder::new()
        .with_title(&args.title)
        .with_inner_size(LogicalSize::new(args.width, args.height))
        .with_decorations(!args.frameless && !args.transparent)
        .with_transparent(args.transparent)
        .with_always_on_top(args.floating || args.follow_cursor);

    if let (Some(x), Some(y)) = (args.x, args.y) {
        builder = builder.with_position(LogicalPosition::new(x, y));
    } else if let Some(monitor) = event_loop.primary_monitor() {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let x = ((size.width as f64 / scale - args.width as f64) / 2.0).max(0.0) as i32;
        let y = ((size.height as f64 / scale - args.height as f64) / 2.0).max(0.0) as i32;
        builder = builder.with_position(LogicalPosition::new(x, y));
    }

    let window = builder.build(event_loop)?;
    window.set_visible(true);
    window.request_redraw();

    #[cfg(windows)]
    if args.click_through {
        apply_click_through(&window);
    }

    Ok(window)
}

fn create_webview(
    window: &tao::window::Window,
    args: &Args,
    webview_tx: std::sync::mpsc::Sender<WebViewCommand>,
) -> Result<WebView, wry::Error> {
    WebViewBuilder::new()
        .with_background_color(if args.transparent { (0, 0, 0, 0) } else { (255, 255, 255, 255) })
        .with_initialization_script(bridge::BRIDGE_JS)
        .with_html("<html><body></body></html>")
        .with_devtools(true)
        .with_ipc_handler(move |req: wry::http::Request<String>| {
            if let Some(parsed) = handle_web_message(req.body()) {
                if parsed.get("__glimpse_close").and_then(|v| v.as_bool()) == Some(true) {
                    let _ = webview_tx.send(WebViewCommand::Close);
                    return;
                }
                let _ = webview_tx.send(WebViewCommand::Message(parsed));
            }
        })
        .build(window)
}

fn handle_web_message(payload: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(payload).ok()
}

fn emit_ready(state: &AppState, args: &Args) {
    let cursor_tip = if args.follow_cursor {
        cursor::compute_cursor_tip(
            args.width as f64,
            args.height as f64,
            args.cursor_anchor.as_deref(),
            state.offset_x,
            state.offset_y,
        )
        .map(|(x, y)| CursorPos { x, y })
    } else {
        None
    };

    let info = sysinfo::collect(*state.current_cursor.borrow(), cursor_tip);
    io::emit(&OutboundMsg::Ready { info });
}

fn run_event_loop<T>(
    event_loop: EventLoop<T>,
    window: tao::window::Window,
    webview: WebView,
    args: Rc<Args>,
    state: AppState,
    stdin_rx: std::sync::mpsc::Receiver<InboundMsg>,
    webview_rx: std::sync::mpsc::Receiver<WebViewCommand>,
) {
    let window_id = window.id();

    event_loop.run(move |event, _event_loop, control_flow| {
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
                handle_frame(
                    &window,
                    &webview,
                    &args,
                    &state,
                    &stdin_rx,
                    &webview_rx,
                );
            }
            _ => (),
        }
    });
}

fn handle_frame(
    window: &tao::window::Window,
    webview: &WebView,
    args: &Rc<Args>,
    state: &AppState,
    stdin_rx: &std::sync::mpsc::Receiver<InboundMsg>,
    webview_rx: &std::sync::mpsc::Receiver<WebViewCommand>,
) {
    // Process stdin messages
    while let Ok(msg) = stdin_rx.try_recv() {
        handle_message(msg, window, webview, args, state);
    }

    // Process WebView commands
    while let Ok(cmd) = webview_rx.try_recv() {
        match cmd {
            WebViewCommand::Close => {
                io::emit(&OutboundMsg::Closed);
                return; // Exit frame early
            }
            WebViewCommand::Message(data) => {
                io::emit(&OutboundMsg::Message { data });
                if args.auto_close {
                    io::emit(&OutboundMsg::Closed);
                    return;
                }
            }
        }
    }

    // Emit ready after HTML load (two-phase handshake)
    if *state.emit_ready_after_html.borrow() {
        *state.emit_ready_after_html.borrow_mut() = false;
        let info = sysinfo::collect(*state.current_cursor.borrow(), None);
        io::emit(&OutboundMsg::Ready { info });
    }

    // Cursor follow polling
    if state.follow_enabled.load(Ordering::Relaxed) {
        let now = Instant::now();
        if now.duration_since(*state.last_cursor_poll.borrow()) >= Duration::from_millis(16) {
            *state.last_cursor_poll.borrow_mut() = now;

            let cursor_pos = sysinfo::get_cursor_pos();
            *state.current_cursor.borrow_mut() = Some(cursor_pos);

            update_cursor_position(window, cursor_pos, args, state);
        }
    }

    // Spring animation tick
    if *state.spring_animating.borrow() {
        tick_spring_animation(window, state);
    }

    // Repaint webview
    let _ = webview.evaluate_script("void(0)");
}

fn update_cursor_position(
    window: &tao::window::Window,
    cursor_pos: CursorPos,
    args: &Args,
    state: &AppState,
) {
    let mode = state.follow_mode.borrow();
    match mode.as_str() {
        "spring" => {
            let target = cursor::compute_target(
                cursor_pos.x as f64,
                cursor_pos.y as f64,
                args.width as f64,
                args.height as f64,
                state.cursor_anchor.borrow().as_deref(),
                state.offset_x,
                state.offset_y,
            );
            state.spring.borrow_mut().target = target;
            *state.spring_animating.borrow_mut() = true;
        }
        _ => {
            let target = cursor::compute_target(
                cursor_pos.x as f64,
                cursor_pos.y as f64,
                args.width as f64,
                args.height as f64,
                state.cursor_anchor.borrow().as_deref(),
                state.offset_x,
                state.offset_y,
            );
            window.set_outer_position(LogicalPosition::new(target.0, target.1));
        }
    }
}

fn tick_spring_animation(window: &tao::window::Window, state: &AppState) {
    let (settled, px, py) = {
        let mut spring = state.spring.borrow_mut();
        let settled = spring.tick();
        (settled, spring.pos.0, spring.pos.1)
    };

    window.set_outer_position(LogicalPosition::new(px, py));
    if settled {
        *state.spring_animating.borrow_mut() = false;
    }
}

fn handle_message(
    msg: InboundMsg,
    window: &tao::window::Window,
    webview: &WebView,
    args: &Rc<Args>,
    state: &AppState,
) {
    match msg {
        InboundMsg::Html { html } => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(&html)
                .unwrap_or_default();
            let html_str = String::from_utf8_lossy(&decoded);
            let _ = webview.load_html(&html_str);
            *state.emit_ready_after_html.borrow_mut() = true;
            window.request_redraw();
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
            *state.hidden.borrow_mut() = false;
            window.set_visible(true);
            window.set_focus();
        }
        InboundMsg::Close => {
            io::emit(&OutboundMsg::Closed);
        }
        InboundMsg::GetInfo => {
            let cursor_tip = if state.follow_enabled.load(Ordering::Relaxed) {
                cursor::compute_cursor_tip(
                    args.width as f64,
                    args.height as f64,
                    state.cursor_anchor.borrow().as_deref(),
                    state.offset_x,
                    state.offset_y,
                )
                .map(|(x, y)| CursorPos { x, y })
            } else {
                None
            };
            let info = sysinfo::collect(*state.current_cursor.borrow(), cursor_tip);
            io::emit(&OutboundMsg::Info { info });
        }
        InboundMsg::FollowCursor {
            enabled,
            anchor,
            mode,
        } => {
            if let Some(anchor) = anchor {
                *state.cursor_anchor.borrow_mut() = Some(anchor);
            }
            if let Some(mode) = mode {
                let mut follow_mode = state.follow_mode.borrow_mut();
                let switching_to_spring = mode == "spring" && follow_mode.as_str() != "spring";
                *follow_mode = mode;
                drop(follow_mode);

                if switching_to_spring {
                    if let Ok(pos) = window.outer_position() {
                        let logical: LogicalPosition<f64> = pos.to_logical(window.scale_factor());
                        let mut spring = state.spring.borrow_mut();
                        spring.pos = (logical.x, logical.y);
                        spring.target = (logical.x, logical.y);
                    }
                }
            }

            state.follow_enabled.store(enabled, Ordering::Relaxed);

            if !enabled {
                *state.spring_animating.borrow_mut() = false;
            }

            window.set_always_on_top(enabled || args.floating);
        }
    }
}

#[cfg(windows)]
fn apply_click_through(window: &tao::window::Window) {
    use tao::platform::windows::WindowExtWindows;
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

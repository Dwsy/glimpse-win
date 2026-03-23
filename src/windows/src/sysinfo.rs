use crate::protocol::{AppearanceInfo, CursorPos, ScreenInfo, SystemInfo};

#[cfg(windows)]
use windows::Win32::Foundation::{LPARAM, POINT, RECT};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
#[cfg(windows)]
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

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
    #[cfg(windows)]
    unsafe {
        let mut point = POINT::default();
        if GetCursorPos(&mut point).is_ok() {
            return CursorPos {
                x: point.x,
                y: point.y,
            };
        }
    }
    CursorPos::default()
}

#[cfg(windows)]
fn enumerate_monitors() -> Vec<ScreenInfo> {
    let mut screens: Vec<ScreenInfo> = Vec::new();

    unsafe {
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_monitor_callback),
            LPARAM(&mut screens as *mut Vec<ScreenInfo> as isize),
        );
    }

    screens
}

#[cfg(not(windows))]
fn enumerate_monitors() -> Vec<ScreenInfo> {
    vec![ScreenInfo {
        x: Some(0),
        y: Some(0),
        width: 1920,
        height: 1080,
        scale_factor: 100,
        visible_x: 0,
        visible_y: 0,
        visible_width: 1920,
        visible_height: 1080,
    }]
}

#[cfg(windows)]
unsafe extern "system" fn enum_monitor_callback(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> windows::Win32::Foundation::BOOL {
    let screens = &mut *(lparam.0 as *mut Vec<ScreenInfo>);

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
    AppearanceInfo {
        dark_mode: is_dark_mode(),
        accent_color: get_accent_color(),
        reduce_motion: is_reduce_motion(),
        increase_contrast: false,
    }
}

fn is_dark_mode() -> bool {
    use std::process::Command;

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
        if stdout.contains("\"0\"") || stdout.contains("REG_SZ    0") {
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
        if let Some(hex_start) = stdout.find("0x") {
            let hex_str = &stdout[hex_start + 2..];
            if hex_str.len() >= 8 {
                // Windows stores as AABBGGRR, convert to #RRGGBB
                let r = &hex_str[6..8];
                let g = &hex_str[4..6];
                let b = &hex_str[2..4];
                return Some(format!("#{}{}{}", r, g, b));
            }
        }
    }

    None
}

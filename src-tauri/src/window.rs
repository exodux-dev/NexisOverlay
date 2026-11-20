//! Placement of the main (interactive) window.
//!
//! * remembers its size and position in `data/window.json` (debounced on move/resize, and on hide);
//! * restores them on startup and on every show, clamped onto a monitor that still exists
//!   (unplugged monitor, resolution or DPI change);
//! * with nothing saved, centers it on the monitor League is running on (else the primary one);
//! * size presets (Compact / Standard / Large);
//! * on Windows: brings it to the front when shown over the game, and hands focus back to the
//!   game (or whatever was focused before) when the user hides it.
//!
//! Window geometry lives in its own file (not settings.json) so the backend and the UI never
//! overwrite each other's copy of the settings.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

use crate::store;

const FILE: &str = "window.json";
/// Logical (DPI-independent) sizes.
pub const DEFAULT_SIZE: (f64, f64) = (1180.0, 760.0);
pub const MIN_SIZE: (f64, f64) = (820.0, 560.0);

pub fn preset_size(name: &str) -> Option<(f64, f64)> {
    match name {
        "compact" => Some((880.0, 600.0)),
        "standard" => Some(DEFAULT_SIZE),
        "large" => Some((1440.0, 900.0)),
        _ => None,
    }
}

/// Saved geometry: position in physical pixels (virtual-desktop coordinates), size in logical pixels.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub w: f64,
    pub h: f64,
}

/// A monitor's usable area in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Screen {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub scale: f64,
}

/// Physical position + size to apply.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

fn overlap(a: (i32, i32, i32, i32), s: &Screen) -> i64 {
    let w = (a.0 + a.2).min(s.x + s.w) - a.0.max(s.x);
    let h = (a.1 + a.3).min(s.y + s.h) - a.1.max(s.y);
    if w <= 0 || h <= 0 {
        0
    } else {
        w as i64 * h as i64
    }
}

fn fit(screen: &Screen, x: i32, y: i32, logical: (f64, f64)) -> Placement {
    let s = if screen.scale.is_finite() { screen.scale.max(0.5) } else { 1.0 };
    let screen = &Screen { w: screen.w.max(1), h: screen.h.max(1), ..*screen };
    let w = ((logical.0.max(MIN_SIZE.0) * s).round() as i32).min(screen.w).max(1);
    let h = ((logical.1.max(MIN_SIZE.1) * s).round() as i32).min(screen.h).max(1);
    let x = x.clamp(screen.x, screen.x + screen.w - w);
    let y = y.clamp(screen.y, screen.y + screen.h - h);
    Placement { x, y, w: w as u32, h: h as u32 }
}

fn centered(screen: &Screen, logical: (f64, f64)) -> Placement {
    let s = screen.scale.max(0.5);
    let (w, h) = ((logical.0 * s) as i32, (logical.1 * s) as i32);
    fit(screen, screen.x + (screen.w - w.min(screen.w)) / 2, screen.y + (screen.h - h.min(screen.h)) / 2, logical)
}

/// Where the window goes. `preferred` is the monitor League is on (else the primary), used when
/// nothing is saved or the saved spot is no longer on any monitor.
pub fn place(saved: Option<Geometry>, screens: &[Screen], preferred: usize) -> Option<Placement> {
    let fallback = screens.get(preferred).or_else(|| screens.first())?;
    let Some(g) = saved.filter(|g| g.w.is_finite() && g.h.is_finite() && g.w > 0.0 && g.h > 0.0) else {
        return Some(centered(fallback, DEFAULT_SIZE));
    };
    // The monitor showing most of the saved window (sized with that monitor's DPI).
    let best = screens
        .iter()
        .map(|s| (overlap((g.x, g.y, (g.w * s.scale) as i32, (g.h * s.scale) as i32), s), s))
        .filter(|(area, _)| *area > 0)
        .max_by_key(|(area, _)| *area)
        .map(|(_, s)| s);
    match best {
        Some(s) => Some(fit(s, g.x, g.y, (g.w, g.h))),
        // Monitor gone: same size, centered where the game (or primary) is.
        None => Some(centered(fallback, (g.w, g.h))),
    }
}

/// Keep the window's center while resizing to a preset (then clamp onto that monitor).
pub fn resize_around_center(cur: Placement, screens: &[Screen], logical: (f64, f64)) -> Placement {
    let cx = cur.x + cur.w as i32 / 2;
    let cy = cur.y + cur.h as i32 / 2;
    let screen = screens
        .iter()
        .find(|s| cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h)
        .or_else(|| screens.iter().max_by_key(|s| overlap((cur.x, cur.y, cur.w as i32, cur.h as i32), s)));
    let Some(s) = screen else { return cur };
    let w = (logical.0 * s.scale) as i32;
    let h = (logical.1 * s.scale) as i32;
    fit(s, cx - w / 2, cy - h / 2, logical)
}

// ---------------------------------------------------------------- runtime

/// Ignore move/resize events we caused ourselves until this instant.
static SUPPRESS_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);
/// The user moved/resized the window since it was last saved.
static DIRTY: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn suppressed() -> bool {
    SUPPRESS_UNTIL.lock().ok().and_then(|t| *t).map(|t| Instant::now() < t).unwrap_or(false)
}

fn suppress() {
    if let Ok(mut t) = SUPPRESS_UNTIL.lock() {
        *t = Some(Instant::now() + Duration::from_millis(400));
    }
}

fn screens(w: &WebviewWindow) -> Vec<Screen> {
    let mut list: Vec<Screen> = Vec::new();
    let primary = w.primary_monitor().ok().flatten();
    let mut monitors = w.available_monitors().unwrap_or_default();
    // Primary first, so index 0 is the default fallback.
    if let Some(p) = &primary {
        monitors.sort_by_key(|m| m.position() != p.position());
    }
    for m in monitors {
        let a = m.work_area();
        // A degenerate (0-size) work area would make the clamping in `fit` panic.
        if a.size.width == 0 || a.size.height == 0 || a.size.width > i32::MAX as u32 || a.size.height > i32::MAX as u32 {
            continue;
        }
        list.push(Screen {
            x: a.position.x,
            y: a.position.y,
            w: a.size.width as i32,
            h: a.size.height as i32,
            scale: m.scale_factor(),
        });
    }
    list
}

/// Index of the monitor League's game window (or client) is on, if it's running.
fn league_screen(list: &[Screen]) -> Option<usize> {
    let (cx, cy) = league_window_center()?;
    list.iter().position(|s| cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h)
}

fn load_saved(app: &AppHandle) -> Option<Geometry> {
    store::read_json(app, FILE).and_then(|v| serde_json::from_value(v).ok())
}

fn current(w: &WebviewWindow) -> Option<Placement> {
    let pos = w.outer_position().ok()?;
    let size = w.inner_size().ok()?;
    Some(Placement { x: pos.x, y: pos.y, w: size.width, h: size.height })
}

fn apply(w: &WebviewWindow, p: Placement) {
    suppress();
    // Move first: crossing onto a monitor with another DPI makes Windows/tao rescale the window
    // (WM_DPICHANGED keeps its *logical* size and may nudge it), which would undo a size set for
    // the target monitor beforehand. Then size, then pin the position again.
    let _ = w.set_position(PhysicalPosition::new(p.x, p.y));
    let _ = w.set_size(PhysicalSize::new(p.w, p.h));
    let _ = w.set_position(PhysicalPosition::new(p.x, p.y));
}

/// Put the window at its saved spot (clamped), or centered on League's monitor. Call before showing.
pub fn restore(app: &AppHandle, w: &WebviewWindow) {
    let list = screens(w);
    let preferred = league_screen(&list).unwrap_or(0);
    if let Some(p) = place(load_saved(app), &list, preferred) {
        if current(w) != Some(p) {
            apply(w, p);
        }
    }
}

/// Persist the current geometry if the user changed it.
pub fn save_now(app: &AppHandle) {
    if !DIRTY.swap(false, Ordering::Relaxed) {
        return;
    }
    let Some(w) = app.get_webview_window("main") else { return };
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    let (Some(p), Ok(scale)) = (current(&w), w.scale_factor()) else { return };
    // Minimized windows on Windows report -32000; never save that.
    if p.x <= -30_000 || p.y <= -30_000 || p.w == 0 || p.h == 0 {
        return;
    }
    let g = Geometry { x: p.x, y: p.y, w: p.w as f64 / scale, h: p.h as f64 / scale };
    // The compact champ-select view has its own spot; never save it as the full window's size.
    let file = if MINI.load(Ordering::Relaxed) { MINI_FILE } else { FILE };
    if let Ok(v) = serde_json::to_value(g) {
        let _ = store::write_json(app, file, &v);
    }
}

// ---------------------------------------------------------------- compact champ-select view

const MINI_FILE: &str = "window-mini.json";
/// Logical size of the compact view.
pub const MINI_SIZE: (f64, f64) = (300.0, 196.0);
static MINI: AtomicBool = AtomicBool::new(false);

pub fn is_mini() -> bool {
    MINI.load(Ordering::Relaxed)
}

/// Switch the main window between the compact champ-select view and its normal size/spot.
/// Compact: small, at the right edge of League's monitor (or where you last dragged it), so it
/// doesn't cover champ select. Leaving it restores the saved full-size geometry.
pub fn set_mini(app: &AppHandle, w: &WebviewWindow, on: bool) {
    if on == MINI.load(Ordering::Relaxed) {
        return;
    }
    if on {
        save_now(app);
        MINI.store(true, Ordering::Relaxed);
        let _ = w.set_min_size(None::<tauri::Size>);
        let list = screens(w);
        let preferred = league_screen(&list).unwrap_or(0);
        let saved: Option<Geometry> = store::read_json(app, MINI_FILE).and_then(|v| serde_json::from_value(v).ok());
        let p = match saved {
            Some(g) => place(Some(Geometry { w: MINI_SIZE.0, h: MINI_SIZE.1, ..g }), &list, preferred),
            None => list.get(preferred).map(|s| {
                let (pw, ph) = ((MINI_SIZE.0 * s.scale).round() as i32, (MINI_SIZE.1 * s.scale).round() as i32);
                let m = (16.0 * s.scale) as i32;
                Placement { x: s.x + s.w - pw - m, y: s.y + (s.h - ph) / 3, w: pw as u32, h: ph as u32 }
            }),
        };
        if let Some(p) = p {
            apply(w, p);
        }
    } else {
        save_now(app);
        MINI.store(false, Ordering::Relaxed);
        let _ = w.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(820.0, 560.0))));
        restore(app, w);
    }
    use tauri::Emitter;
    let _ = app.emit("mini-mode", on);
}

/// Hook move/resize events of the main window: debounced save.
pub fn track(app: &AppHandle, w: &WebviewWindow) {
    let app = app.clone();
    w.on_window_event(move |e| {
        if !matches!(e, WindowEvent::Moved(_) | WindowEvent::Resized(_)) || suppressed() {
            return;
        }
        DIRTY.store(true, Ordering::Relaxed);
        let gen = GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(600)).await;
            if GENERATION.load(Ordering::Relaxed) == gen {
                save_now(&app);
            }
        });
    });
}

// ---------------------------------------------------------------- focus (Windows)

/// The window that had focus before we showed the overlay (raw HWND, 0 = none).
#[cfg(windows)]
static PREV_FOREGROUND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

#[cfg(windows)]
fn hwnd_of(w: &WebviewWindow) -> Option<windows::Win32::Foundation::HWND> {
    w.hwnd().ok().map(|h| windows::Win32::Foundation::HWND(h.0 as _))
}

/// Remember who has focus right now (unless it's us), to give it back on hide.
pub fn remember_foreground(w: &WebviewWindow) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let fg = GetForegroundWindow();
        if !fg.is_invalid() && Some(fg) != hwnd_of(w) {
            PREV_FOREGROUND.store(fg.0 as isize, Ordering::Relaxed);
        }
    }
    #[cfg(not(windows))]
    let _ = w;
}

/// Bring the overlay to the front and focus it. Windows refuses `SetForegroundWindow` from a
/// background app (our hotkey poller doesn't count as user input to us), so briefly attach to
/// the foreground thread's input queue — the standard, input-free way to be allowed to.
pub fn focus(w: &WebviewWindow) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
        use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow};
        if let Some(me) = hwnd_of(w) {
            let fg = GetForegroundWindow();
            if fg != me {
                let ours = GetCurrentThreadId();
                let theirs = if fg.is_invalid() { 0 } else { GetWindowThreadProcessId(fg, None) };
                let attached = theirs != 0 && theirs != ours && AttachThreadInput(ours, theirs, true).as_bool();
                let _ = BringWindowToTop(me);
                let _ = SetForegroundWindow(me);
                if attached {
                    let _ = AttachThreadInput(ours, theirs, false);
                }
            }
        }
    }
    let _ = w.set_focus();
}

/// After the user hides the overlay, give focus back to the game (or what was focused before)
/// instead of leaving it on the desktop. Only when the overlay actually had focus.
pub fn hide_and_return_focus(w: &WebviewWindow) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow};
        let had_focus = hwnd_of(w).map(|me| GetForegroundWindow() == me).unwrap_or(false);
        let _ = w.hide();
        if had_focus {
            let prev = HWND(PREV_FOREGROUND.load(Ordering::Relaxed) as _);
            let usable = |h: HWND| !h.is_invalid() && IsWindow(Some(h)).as_bool() && IsWindowVisible(h).as_bool() && !IsIconic(h).as_bool();
            let target = if usable(prev) { Some(prev) } else { league_hwnd().filter(|h| usable(*h)) };
            if let Some(h) = target {
                let _ = SetForegroundWindow(h);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = w.hide();
    }
}

#[cfg(windows)]
fn league_hwnd() -> Option<windows::Win32::Foundation::HWND> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
    unsafe {
        // The in-game window, else the League client.
        FindWindowW(w!("RiotWindowClass"), PCWSTR::null())
            .ok()
            .filter(|h| !h.is_invalid())
            .or_else(|| FindWindowW(PCWSTR::null(), w!("League of Legends")).ok().filter(|h| !h.is_invalid()))
    }
}

/// Could an augment offer be on screen for the player right now? True when the League game window
/// (or our own overlay, which is kept out of screenshots) is in front. False while the player has
/// Alt+Tabbed to something else (or the game is minimized): no point screenshotting + OCRing then.
/// Unknown (game window not found) counts as yes.
#[cfg(windows)]
pub fn game_in_front(app: &AppHandle) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsIconic};
    let Some(game) = (unsafe { windows::Win32::UI::WindowsAndMessaging::FindWindowW(windows::core::w!("RiotWindowClass"), windows::core::PCWSTR::null()) })
        .ok()
        .filter(|h| !h.is_invalid())
    else {
        return true;
    };
    unsafe {
        if IsIconic(game).as_bool() {
            return false;
        }
        let fg = GetForegroundWindow();
        fg == game || app.get_webview_window("main").and_then(|w| hwnd_of(&w)) == Some(fg)
    }
}
#[cfg(not(windows))]
pub fn game_in_front(_app: &AppHandle) -> bool {
    true
}

#[cfg(windows)]
fn league_window_center() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let h = league_hwnd()?;
    let mut r = RECT::default();
    unsafe { GetWindowRect(h, &mut r).ok()? };
    (r.right > r.left && r.left > -30_000).then_some(((r.left + r.right) / 2, (r.top + r.bottom) / 2))
}

#[cfg(not(windows))]
fn league_window_center() -> Option<(i32, i32)> {
    None
}

// ---------------------------------------------------------------- League display mode (read-only)

/// `WindowMode` from League's game.cfg `[General]` section: 0 fullscreen, 1 windowed, 2 borderless.
pub fn parse_window_mode(cfg: &str) -> Option<u8> {
    let mut in_general = false;
    for line in cfg.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_general = line.eq_ignore_ascii_case("[General]");
        } else if in_general {
            if let Some((k, v)) = line.split_once('=') {
                if k.trim().eq_ignore_ascii_case("WindowMode") {
                    return v.trim().parse().ok();
                }
            }
        }
    }
    None
}

pub fn mode_label(mode: u8) -> &'static str {
    match mode {
        0 => "fullscreen",
        1 => "windowed",
        2 => "borderless",
        _ => "unknown",
    }
}

/// Read (never write) League's display mode: from the running client's settings API, else game.cfg.
pub async fn league_window_mode(app: &AppHandle) -> Value {
    let state = app.state::<crate::AppState>();
    let creds = state.lcu_creds.lock().ok().and_then(|c| c.clone());
    if let Some(creds) = creds {
        let api = crate::lcu::LcuApi::new(crate::live::local_client(), creds);
        if let Ok(v) = api.get("/lol-game-settings/v1/game-settings").await {
            if let Some(m) = v.pointer("/General/WindowMode").and_then(Value::as_u64) {
                return json!({ "mode": mode_label(m as u8), "source": "client" });
            }
        }
    }
    let league = state.league_path();
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if !league.trim().is_empty() {
        candidates.push(std::path::Path::new(league.trim()).join("Config").join("game.cfg"));
    }
    candidates.push("C:\\Riot Games\\League of Legends\\Config\\game.cfg".into());
    candidates.push("D:\\Riot Games\\League of Legends\\Config\\game.cfg".into());
    for path in candidates {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Some(m) = parse_window_mode(&text) {
                return json!({ "mode": mode_label(m), "source": "game.cfg" });
            }
        }
    }
    json!({ "mode": Value::Null })
}

/// Resize to a preset, keeping the window's center on the same monitor.
pub fn apply_preset(app: &AppHandle, w: &WebviewWindow, name: &str) -> Result<(), String> {
    let size = preset_size(name).ok_or_else(|| format!("unknown size preset: {name}"))?;
    let cur = current(w).ok_or("window not available")?;
    let p = resize_around_center(cur, &screens(w), size);
    apply(w, p);
    DIRTY.store(true, Ordering::Relaxed);
    save_soon(app);
    Ok(())
}

/// Forget the saved spot and re-center on League's monitor at the standard size.
pub fn reset(app: &AppHandle, w: &WebviewWindow) {
    let list = screens(w);
    let preferred = league_screen(&list).unwrap_or(0);
    if let Some(p) = place(None, &list, preferred) {
        apply(w, p);
    }
    DIRTY.store(true, Ordering::Relaxed);
    save_soon(app);
}

fn save_soon(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Let the OS apply the new bounds first.
        tokio::time::sleep(Duration::from_millis(150)).await;
        save_now(&app);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIMARY: Screen = Screen { x: 0, y: 0, w: 1920, h: 1040, scale: 1.0 };
    const RIGHT_4K: Screen = Screen { x: 1920, y: 0, w: 3840, h: 2120, scale: 2.0 };
    const LEFT: Screen = Screen { x: -1920, y: 0, w: 1920, h: 1080, scale: 1.0 };

    #[test]
    fn nothing_saved_centers_on_preferred_monitor() {
        let p = place(None, &[PRIMARY, RIGHT_4K], 1).unwrap();
        assert_eq!((p.w, p.h), (2360, 1520));
        assert_eq!((p.x, p.y), (1920 + (3840 - 2360) / 2, (2120 - 1520) / 2));
        let p = place(None, &[PRIMARY], 0).unwrap();
        assert_eq!(p, Placement { x: 370, y: 140, w: 1180, h: 760 });
    }

    #[test]
    fn saved_spot_is_kept_when_visible() {
        let g = Geometry { x: 100, y: 50, w: 900.0, h: 640.0 };
        assert_eq!(place(Some(g), &[PRIMARY], 0).unwrap(), Placement { x: 100, y: 50, w: 900, h: 640 });
    }

    #[test]
    fn saved_spot_on_unplugged_monitor_falls_back() {
        let g = Geometry { x: -1500, y: 100, w: 1000.0, h: 700.0 };
        // Left monitor present: kept.
        assert_eq!(place(Some(g), &[PRIMARY, LEFT], 0).unwrap(), Placement { x: -1500, y: 100, w: 1000, h: 700 });
        // Left monitor gone: same size, centered on the preferred monitor.
        assert_eq!(place(Some(g), &[PRIMARY], 0).unwrap(), Placement { x: 460, y: 170, w: 1000, h: 700 });
    }

    #[test]
    fn partially_offscreen_is_pulled_back_and_oversize_is_shrunk() {
        let g = Geometry { x: 1500, y: 900, w: 1180.0, h: 760.0 };
        let p = place(Some(g), &[PRIMARY], 0).unwrap();
        assert_eq!(p, Placement { x: 1920 - 1180, y: 1040 - 760, w: 1180, h: 760 });
        // Resolution dropped below the saved size.
        let small = Screen { x: 0, y: 0, w: 1280, h: 680, scale: 1.0 };
        let g = Geometry { x: 0, y: 0, w: 1440.0, h: 900.0 };
        assert_eq!(place(Some(g), &[small], 0).unwrap(), Placement { x: 0, y: 0, w: 1280, h: 680 });
    }

    #[test]
    fn dpi_scales_the_logical_size() {
        let g = Geometry { x: 2000, y: 100, w: 1180.0, h: 760.0 };
        let p = place(Some(g), &[PRIMARY, RIGHT_4K], 0).unwrap();
        assert_eq!(p, Placement { x: 2000, y: 100, w: 2360, h: 1520 });
    }

    #[test]
    fn junk_geometry_and_no_monitors() {
        let g = Geometry { x: 0, y: 0, w: f64::NAN, h: 0.0 };
        assert_eq!(place(Some(g), &[PRIMARY], 0).unwrap(), place(None, &[PRIMARY], 0).unwrap());
        assert_eq!(place(None, &[], 0), None);
        // Tiny saved sizes are raised to the minimum.
        let g = Geometry { x: 0, y: 0, w: 100.0, h: 100.0 };
        let p = place(Some(g), &[PRIMARY], 0).unwrap();
        assert_eq!((p.w, p.h), (MIN_SIZE.0 as u32, MIN_SIZE.1 as u32));
    }

    #[test]
    fn degenerate_monitor_does_not_panic() {
        let zero = Screen { x: 0, y: 0, w: 0, h: 0, scale: f64::NAN };
        let p = place(None, &[zero], 0).unwrap();
        assert_eq!((p.x, p.y), (0, 0));
    }

    #[test]
    fn presets_keep_the_center() {
        let cur = Placement { x: 370, y: 140, w: 1180, h: 760 };
        let p = resize_around_center(cur, &[PRIMARY], preset_size("compact").unwrap());
        assert_eq!(p, Placement { x: 520, y: 220, w: 880, h: 600 });
        // Large near an edge gets clamped onto the monitor.
        let cur = Placement { x: 0, y: 0, w: 880, h: 600 };
        let p = resize_around_center(cur, &[PRIMARY], preset_size("large").unwrap());
        assert_eq!(p, Placement { x: 0, y: 0, w: 1440, h: 900 });
        assert_eq!(preset_size("huge"), None);
    }

    #[test]
    fn parses_game_cfg_window_mode() {
        let cfg = "[FloatingText]\nWindowMode=9\n[General]\nWidth=1920\nWindowMode=2\n[HUD]\n";
        assert_eq!(parse_window_mode(cfg), Some(2));
        assert_eq!(parse_window_mode("[General]\r\nWindowMode = 0\r\n"), Some(0));
        assert_eq!(parse_window_mode("[General]\nWidth=1\n"), None);
        assert_eq!(mode_label(0), "fullscreen");
    }
}

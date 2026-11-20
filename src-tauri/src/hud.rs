//! The "hud" window: a full-monitor, transparent, click-through, always-on-top layer that draws
//! the mini HUD and the augment tier badges. It must never take focus from the game:
//!   * it is created non-focusable (`focusable: false` => WS_EX_NOACTIVATE on Windows, kept by tao
//!     across every later style change), and
//!   * it is only `show()`n when hidden, and if Windows still hands it the foreground, the previous
//!     foreground window (the game) gets it straight back.
//!
//! Layout editor ("edit HUD layout"): while on, the window takes mouse input so the panel can be
//! dragged / resized. Click-through is always restored when it ends — via the Done button, the
//! hotkey, Esc (polled, works without focus), a 3-minute timeout, or the foreground window changing
//! (Alt+Tab, opening the overlay…).

use crate::AppState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

/// Safety net: edit mode never outlives this, whatever happens to the UI.
pub const EDIT_TIMEOUT: Duration = Duration::from_secs(180);

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("hud")
}

/// Make the layer non-activating (also set in tauri.conf.json; repeated in case of an old config).
pub fn init_window(app: &AppHandle) {
    if let Some(w) = window(app) {
        let _ = w.set_focusable(false);
    }
}

/// Show without activating; no-op when already visible (every `show()` is a chance to steal focus).
pub fn show_passive(hud: &WebviewWindow) {
    if hud.is_visible().unwrap_or(false) {
        return;
    }
    let before = foreground();
    let _ = hud.show();
    if let (Some(prev), Some(h)) = (before, hwnd_of(hud)) {
        if foreground() == Some(h) && prev != h {
            restore_foreground(prev);
        }
    }
}

/// Click-through unless the layout editor is open.
/// Re-checks after applying: two concurrent syncs (edit toggled from the poller thread while a
/// command or the live loop also syncs) could otherwise apply a stale "take the mouse" last and
/// leave the layer capturing clicks with edit mode already off.
pub fn apply_cursor_mode(app: &AppHandle, hud: &WebviewWindow) {
    let state = app.state::<AppState>();
    for _ in 0..4 {
        let editing = state.hud_edit.load(Ordering::SeqCst);
        let _ = hud.set_ignore_cursor_events(!editing);
        if state.hud_edit.load(Ordering::SeqCst) == editing {
            return;
        }
    }
    // Still flapping: apply the latest state.
    let _ = hud.set_ignore_cursor_events(!state.hud_edit.load(Ordering::SeqCst));
}

/// Enter / leave the layout editor. Idempotent.
pub fn set_edit(app: &AppHandle, on: bool, from_settings: bool) {
    let state = app.state::<AppState>();
    let was = state.hud_edit.swap(on, Ordering::SeqCst);
    let gen = state.hud_edit_gen.fetch_add(1, Ordering::SeqCst) + 1;
    *state.hud_edit_fg.lock().unwrap() = None;
    if on && from_settings {
        state.hud_edit_reopen_main.store(true, Ordering::Relaxed);
        crate::hide_main(app);
    }
    crate::sync_hud_visibility(app);
    let _ = app.emit("hud-edit", on);
    if on {
        // Timeout safety net. (Re)armed on every "on" call: the generation bump above cancels the
        // previous timer, so a repeated "on" (Settings button while already editing) must re-arm.
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(EDIT_TIMEOUT).await;
            let state = app.state::<AppState>();
            if state.hud_edit.load(Ordering::SeqCst) && state.hud_edit_gen.load(Ordering::SeqCst) == gen {
                set_edit(&app, false, false);
            }
        });
    }
    if !on && was && state.hud_edit_reopen_main.swap(false, Ordering::Relaxed) {
        crate::show_main(app);
    }
}

pub fn toggle_edit(app: &AppHandle) {
    let on = !app.state::<AppState>().hud_edit.load(Ordering::SeqCst);
    set_edit(app, on, false);
}

/// Called by the hotkey poller (~every 30 ms) while editing: Esc or a foreground change ends it.
/// `esc_now` is whether Esc is held this tick; `esc_was` the previous tick.
pub fn poll_edit(app: &AppHandle, esc_now: bool, esc_was: bool, since: std::time::Instant) {
    if esc_now && !esc_was {
        set_edit(app, false, false);
        return;
    }
    // Grace period: the foreground may still be settling (main window hiding, etc.).
    if since.elapsed() < Duration::from_millis(600) {
        return;
    }
    let Some(fg) = foreground() else { return };
    let ours: Vec<isize> = ["hud", "main"]
        .iter()
        .filter_map(|l| app.get_webview_window(l))
        .filter_map(|w| hwnd_of(&w))
        .collect();
    let state = app.state::<AppState>();
    let mut rec = state.hud_edit_fg.lock().unwrap();
    match *rec {
        None => *rec = Some(fg),
        Some(first) if first != fg && !ours.contains(&fg) => {
            drop(rec);
            set_edit(app, false, false);
        }
        _ => {}
    }
}

#[cfg(windows)]
fn hwnd_of(w: &WebviewWindow) -> Option<isize> {
    w.hwnd().ok().map(|h| h.0 as isize)
}
#[cfg(not(windows))]
fn hwnd_of(_w: &WebviewWindow) -> Option<isize> {
    None
}

#[cfg(windows)]
fn foreground() -> Option<isize> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let h = unsafe { GetForegroundWindow() };
    (!h.0.is_null()).then_some(h.0 as isize)
}
#[cfg(not(windows))]
fn foreground() -> Option<isize> {
    None
}

#[cfg(windows)]
fn restore_foreground(prev: isize) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    unsafe {
        let _ = SetForegroundWindow(HWND(prev as _));
    }
}
#[cfg(not(windows))]
fn restore_foreground(_prev: isize) {}

/// Mouse position relative to the HUD window in CSS pixels, so the click-through HUD can fade
/// or hide its panel while the cursor is over it. Read-only (GetCursorPos); None off Windows.
#[tauri::command]
pub fn hud_cursor(app: AppHandle) -> Option<(f64, f64)> {
    #[cfg(windows)]
    {
        use tauri::Manager;
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let w = app.get_webview_window("hud")?;
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p) }.ok()?;
        let pos = w.outer_position().ok()?;
        let sf = w.scale_factor().ok()?.max(0.1);
        Some(((p.x - pos.x) as f64 / sf, (p.y - pos.y) as f64 / sf))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        None
    }
}

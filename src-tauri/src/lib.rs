//! Nexis Overlay — lightweight, open-source ARAM Mayhem companion.
//!
//! Backend responsibilities (all read-only towards the game):
//!   * poll Riot's Live Client Data API + LCU champ select  (live.rs, lcu.rs)
//!   * hotkey-triggered screen capture + Windows OCR        (capture.rs)
//!   * persistence for settings / match history / caches   (store.rs)
//!   * window management: interactive overlay + click-through HUD
//!   * opt-in "Import to League": rune page / item set via the League *client* API (league_import.rs)

mod autostart;
mod capture;
mod diag;
mod hotkey_poll;
mod hud;
mod lcu;
mod league_import;
mod live;
mod store;
mod window;

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Default)]
struct Hotkeys {
    toggle: Option<Shortcut>,
    scan: Option<Shortcut>,
    hud: Option<Shortcut>,
    hud_edit: Option<Shortcut>,
}

pub struct AppState {
    hotkeys: Mutex<Hotkeys>,
    settings: Mutex<Value>,
    pub in_game: AtomicBool,
    hud_enabled: AtomicBool,
    http: reqwest::Client,
    portable: bool,
    /// Last time each hotkey action fired (toggle, scan, hud, hud edit) — dedupes the two detection paths.
    last_fired: Mutex<[Option<std::time::Instant>; 4]>,
    /// HUD layout editor open (the HUD window takes mouse input while true). See hud.rs.
    hud_edit: AtomicBool,
    /// Bumped on every edit-mode change (the timeout only ends the session it was started for).
    hud_edit_gen: AtomicU64,
    /// Editor opened from Settings: show the main window again when it closes.
    hud_edit_reopen_main: AtomicBool,
    /// Foreground window seen while editing; a change (Alt+Tab…) ends edit mode.
    hud_edit_fg: Mutex<Option<isize>>,
    /// True while the user records a new keybind in Settings.
    hotkeys_suspended: AtomicBool,
    /// Whether the current game mode has augments (ARAM: Mayhem / Arena) — gates the OCR loop.
    augment_mode: AtomicBool,
    /// League client credentials found by the champ-select watcher (used by the import commands).
    lcu_creds: Mutex<Option<lcu::Credentials>>,
}

impl AppState {
    fn setting_str(&self, key: &str, default: &str) -> String {
        self.settings
            .lock()
            .ok()
            .and_then(|s| s.get(key).and_then(|v| v.as_str()).map(str::to_string))
            .unwrap_or_else(|| default.to_string())
    }
    pub fn league_path(&self) -> String {
        self.setting_str("leaguePath", "")
    }
    /// Boolean setting with a default (settings are stored as free-form JSON).
    pub fn flag(&self, key: &str, default: bool) -> bool {
        self.settings.lock().ok().and_then(|s| s.get(key).and_then(Value::as_bool)).unwrap_or(default)
    }
    pub fn auto_detect(&self) -> bool {
        self.settings
            .lock()
            .ok()
            .and_then(|s| s.get("autoDetectAugments").and_then(Value::as_bool))
            .unwrap_or(true)
    }
    fn scan_region(&self) -> capture::Region {
        self.settings
            .lock()
            .ok()
            .and_then(|s| s.get("scanRegion").cloned())
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    }
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Hide without moving focus anywhere (automatic hides, e.g. when the game starts).
pub fn hide_main(app: &AppHandle) {
    window::save_now(app);
    if let Some(w) = main_window(app) {
        let _ = w.hide();
        window::set_mini(app, &w, false);
        suspend_webview(&w);
    }
}

/// A hidden window's WebView2 still thinks it's visible: it keeps compositing CSS animations and
/// running `requestAnimationFrame` at full rate. Telling WebView2 it's hidden (controller
/// `IsVisible = false`) lets Chromium pause rendering and throttle timers (`document.hidden`
/// becomes true) while the overlay is closed. Events still reach the page.
fn suspend_webview(w: &WebviewWindow) {
    let _ = w.as_ref().hide();
}

fn resume_webview(w: &WebviewWindow) {
    let _ = w.as_ref().show();
}

/// The user hid the overlay (hotkey / Esc / close button): hand focus back to the game.
pub fn hide_main_to_game(app: &AppHandle) {
    window::save_now(app);
    if let Some(w) = main_window(app) {
        window::hide_and_return_focus(&w);
        window::set_mini(app, &w, false);
        suspend_webview(&w);
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        if !w.is_visible().unwrap_or(false) {
            // Remember who had focus (the game) and place the window *before* showing it: no flicker.
            window::remember_foreground(&w);
            window::restore(app, &w);
        }
        resume_webview(&w);
        let _ = w.show();
        let _ = w.unminimize();
        window::focus(&w);
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let visible = w.is_visible().unwrap_or(false);
        if visible && window::is_mini() {
            // The hotkey on the compact champ-select view expands it to the full overlay.
            window::set_mini(app, &w, false);
            window::focus(&w);
        } else if visible {
            hide_main_to_game(app);
        } else {
            show_main(app);
        }
    }
}

/// The "hud" window is a full-monitor, transparent, click-through layer that draws the
/// mini HUD and the augment tier badges under the in-game augment cards.
/// It's shown only while in game (or while its layout editor is open), never takes focus, and
/// ignores the mouse except in the layout editor (see hud.rs).
pub fn sync_hud_visibility(app: &AppHandle) {
    let state = app.state::<AppState>();
    let in_game = state.in_game.load(Ordering::Relaxed);
    let editing = state.hud_edit.load(Ordering::Relaxed);
    let preview = HUD_PREVIEW.load(Ordering::Relaxed);
    let want = editing || preview || (in_game && (state.hud_enabled.load(Ordering::Relaxed) || state.auto_detect()));
    if let Some(hud) = hud::window(app) {
        if want {
            place_layer(&hud);
            // Show first: the native window must exist before it can be made click-through.
            hud::show_passive(&hud);
            hud::apply_cursor_mode(app, &hud);
        } else {
            let _ = hud.set_ignore_cursor_events(true);
            let _ = hud.hide();
        }
    }
}

/// Calibration preview (Settings → Diagnostics): the HUD layer shows the scan region and sample
/// tier badges, click-through, while the user tunes them. Bumped generation = timeout owner.
static HUD_PREVIEW: AtomicBool = AtomicBool::new(false);
static HUD_PREVIEW_GEN: AtomicU64 = AtomicU64::new(0);

fn place_layer(hud: &WebviewWindow) {
    if let Ok(Some(mon)) = hud.primary_monitor() {
        let _ = hud.set_position(*mon.position());
        let _ = hud.set_size(*mon.size());
    }
}

/// Keep our own windows out of screenshots so OCR never reads the overlay itself.
#[cfg(windows)]
fn exclude_from_capture(w: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};
    if let Ok(h) = w.hwnd() {
        unsafe {
            let _ = SetWindowDisplayAffinity(HWND(h.0 as _), WDA_EXCLUDEFROMCAPTURE);
        }
    }
}
#[cfg(not(windows))]
fn exclude_from_capture(_w: &WebviewWindow) {}

fn run_scan(app: AppHandle) {
    let region = app.state::<AppState>().scan_region();
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("augment-scan-started", ());
        let payload = scan_payload(region, false, false).await;
        let _ = app.emit("augment-scan", payload);
        show_main(&app);
        let _ = app.emit("navigate", "augments");
    });
}

/// Run one scan off the async runtime and wrap it as the `augment-scan` payload (also logged).
async fn scan_payload(region: capture::Region, auto: bool, debug: bool) -> Value {
    let result = tauri::async_runtime::spawn_blocking(move || capture::scan(region, debug)).await;
    match result {
        Ok(Ok(scan)) => {
            diag::scan_ok(auto, scan.lines.len(), scan.millis);
            json!({ "ok": true, "auto": auto, "scan": scan })
        }
        Ok(Err(e)) => {
            diag::scan_err(auto, &e);
            json!({ "ok": false, "auto": auto, "error": e })
        }
        Err(e) => {
            diag::scan_err(auto, &e.to_string());
            json!({ "ok": false, "auto": auto, "error": e.to_string() })
        }
    }
}

/// (Re)registers the global hotkeys from settings. Returns human-readable errors.
fn apply_hotkeys(app: &AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let suspended = state.hotkeys_suspended.load(Ordering::Relaxed);
    let mut errors = Vec::new();
    let mut status = Vec::new();
    let mut parse = |action: &'static str, key: &str, default: &str| -> Option<Shortcut> {
        let raw = state.setting_str(key, default);
        if raw.trim().is_empty() {
            return None;
        }
        let mut row = diag::HotkeyStatus { action, combo: raw.clone(), registered: false, polled: false, error: None };
        let parsed = match raw.parse::<Shortcut>() {
            // While a keybind is being recorded, don't register (it would swallow the keystroke);
            // the shortcuts are still parsed so the poller knows them after recording ends.
            Ok(s) if suspended => Some(s),
            Ok(s) => match gs.register(s) {
                Ok(()) => {
                    row.registered = true;
                    Some(s)
                }
                Err(e) => {
                    errors.push(format!("{raw}: {e}"));
                    row.error = Some(e.to_string());
                    None
                }
            },
            Err(e) => {
                errors.push(format!("{raw}: {e}"));
                row.error = Some(e.to_string());
                None
            }
        };
        row.polled = cfg!(windows) && parsed.as_ref().map(|s| hotkey_poll::vk_for(&s.key).is_some()).unwrap_or(false);
        status.push(row);
        parsed
    };
    let toggle = parse("Show / hide overlay", "hotkeyToggle", "Ctrl+Shift+Space");
    let scan = parse("Scan augments", "hotkeyScan", "Ctrl+Shift+X");
    let hud = parse("Toggle HUD", "hotkeyHud", "Ctrl+Shift+H");
    let hud_edit = parse("Edit HUD layout", "hotkeyHudEdit", "Ctrl+Shift+L");
    *state.hotkeys.lock().unwrap() = Hotkeys { toggle, scan, hud, hud_edit };
    if !suspended {
        diag::set_hotkeys(status);
    }
    errors
}

fn on_hotkey(app: &AppHandle, shortcut: &Shortcut) {
    let state = app.state::<AppState>();
    let (is_toggle, is_scan, is_hud, is_hud_edit) = {
        let hk = state.hotkeys.lock().unwrap();
        (
            hk.toggle.as_ref() == Some(shortcut),
            hk.scan.as_ref() == Some(shortcut),
            hk.hud.as_ref() == Some(shortcut),
            hk.hud_edit.as_ref() == Some(shortcut),
        )
    };
    let action = if is_toggle {
        0
    } else if is_scan {
        1
    } else if is_hud {
        2
    } else if is_hud_edit {
        3
    } else {
        return;
    };
    {
        let mut last = state.last_fired.lock().unwrap();
        if last[action].map(|t| t.elapsed() < std::time::Duration::from_millis(350)).unwrap_or(false) {
            return;
        }
        last[action] = Some(std::time::Instant::now());
    }
    if is_hud_edit {
        hud::toggle_edit(app);
    } else if is_toggle {
        toggle_main(app);
    } else if is_scan {
        run_scan(app.clone());
    } else if is_hud {
        toggle_hud(app);
    }
}

/// Flip the in-game HUD on/off and persist it (hotkey and tray menu).
fn toggle_hud(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = !state.hud_enabled.load(Ordering::Relaxed);
    state.hud_enabled.store(now, Ordering::Relaxed);
    let snapshot = {
        let mut s = state.settings.lock().unwrap();
        if !s.is_object() {
            *s = json!({});
        }
        s["hudEnabled"] = Value::Bool(now);
        s.clone()
    };
    let _ = store::write_json(app, "settings.json", &snapshot);
    sync_hud_visibility(app);
    let _ = app.emit("settings-changed", ());
}

/// While in game, periodically OCR the augment-card region so tier badges can appear
/// under the cards automatically. Cheap: one cropped capture + Windows OCR (~50 ms).
async fn auto_detect_loop(app: AppHandle) {
    let mut last_error_sent = false;
    loop {
        // ~0.6 s: badges appear within about half a second of the offer (one cropped capture +
        // OCR is ~50 ms, and this only runs in augment modes with the game in front).
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let state = app.state::<AppState>();
        // Only while an augment offer is plausible: in game, in a mode with augments (Mayhem /
        // Arena), auto-detect on, not editing the HUD layout, and the game (or our overlay) in front.
        if !state.in_game.load(Ordering::Relaxed)
            || !state.auto_detect()
            || !state.augment_mode.load(Ordering::Relaxed)
            || state.hud_edit.load(Ordering::Relaxed)
            || !window::game_in_front(&app)
        {
            continue;
        }
        let region = state.scan_region();
        let payload = scan_payload(region, true, false).await;
        if payload["ok"].as_bool() == Some(true) {
            last_error_sent = false;
            let _ = app.emit("augment-scan", payload);
        } else if !last_error_sent {
            last_error_sent = true;
            let _ = app.emit("augment-scan", payload);
        }
    }
}

/// Fallback hotkey detection that also works while League is focused (see hotkey_poll.rs).
fn spawn_hotkey_poller(app: AppHandle) {
    if !cfg!(windows) {
        return;
    }
    std::thread::spawn(move || {
        let mut was = [false; 4];
        let mut esc_was = false;
        let mut edit_since: Option<std::time::Instant> = None;
        loop {
            // ~30 polls/s: a few GetAsyncKeyState calls each, still far below a key press's length.
            std::thread::sleep(std::time::Duration::from_millis(30));
            let state = app.state::<AppState>();
            // HUD layout editor: Esc / focus change always restore click-through (hud.rs).
            if state.hud_edit.load(Ordering::Relaxed) {
                let since = *edit_since.get_or_insert_with(std::time::Instant::now);
                let esc = hotkey_poll::vk_down(0x1B);
                hud::poll_edit(&app, esc, esc_was, since);
                esc_was = esc;
            } else {
                edit_since = None;
                esc_was = false;
            }
            if state.hotkeys_suspended.load(Ordering::Relaxed) {
                // Treat keys as already held: after recording a new combo it must be
                // released and pressed again before it fires.
                was = [true; 4];
                continue;
            }
            let keys = {
                let hk = state.hotkeys.lock().unwrap();
                [hk.toggle, hk.scan, hk.hud, hk.hud_edit]
            };
            for (i, sc) in keys.iter().enumerate() {
                let held = sc.as_ref().map(hotkey_poll::is_held).unwrap_or(false);
                if held && !was[i] {
                    if let Some(sc) = sc {
                        on_hotkey(&app, sc);
                    }
                }
                was[i] = held;
            }
        }
    });
}

// ---------------------------------------------------------------- portable mode

/// Nexis is portable: ALL app data (settings, history, caches and the WebView's own storage)
/// lives in a `data` folder next to the executable, and nothing is written to AppData.
/// Deleting the folder removes everything.
///
/// Only if that folder can't be written (e.g. the exe was placed in Program Files) does it fall
/// back to the normal per-user app data directory. `NEXIS_DATA_DIR` overrides the location.
fn portable_data_dir() -> Option<std::path::PathBuf> {
    if let Ok(custom) = std::env::var("NEXIS_DATA_DIR") {
        let dir = std::path::PathBuf::from(custom);
        if std::fs::create_dir_all(&dir).is_ok() {
            return Some(dir);
        }
    }
    let exe = std::env::current_exe().ok()?;
    let data = exe.parent()?.join("data");
    std::fs::create_dir_all(&data).ok()?;
    // Make sure we can actually write there.
    let probe = data.join(".write-test");
    std::fs::write(&probe, b"ok").ok()?;
    let _ = std::fs::remove_file(probe);
    Some(data)
}

// ---------------------------------------------------------------- commands

#[tauri::command]
fn app_info(app: AppHandle) -> Value {
    json!({
        "portable": app.state::<AppState>().portable,
        "dataDir": store::data_dir(&app).to_string_lossy(),
        "version": app.package_info().version.to_string(),
        "settingsNotice": store::settings_notice(),
    })
}


#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Value {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value, background: Option<bool>) -> Result<Vec<String>, String> {
    if !settings.is_object() {
        return Err("settings must be an object".into());
    }
    // Background saves (remembered champion, migrations) never replace a settings file that
    // couldn't be read at startup — only a change made by the user does (see store.rs).
    if !(background.unwrap_or(false) && store::settings_held()) {
        store::write_json(&app, "settings.json", &settings)?;
    }
    let state = app.state::<AppState>();
    let hud = settings.get("hudEnabled").and_then(Value::as_bool).unwrap_or(true);
    *state.settings.lock().unwrap() = settings;
    state.hud_enabled.store(hud, Ordering::Relaxed);
    sync_hud_visibility(&app);
    let errors = apply_hotkeys(&app);
    let _ = app.emit("settings-changed", ());
    Ok(errors)
}

#[tauri::command]
fn load_store(app: AppHandle, name: String) -> Value {
    if !store::valid_store_name(&name) {
        return Value::Null;
    }
    store::read_json(&app, &name).unwrap_or(Value::Null)
}

#[tauri::command]
fn save_store(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    if !store::valid_store_name(&name) {
        return Err("invalid store name".into());
    }
    if name == "settings.json" || name.contains(".bak.") || name.contains(".corrupt-") {
        return Err("use save_settings".into());
    }
    store::write_json(&app, &name, &value)
}

#[tauri::command]
async fn fetch_json(app: AppHandle, url: String, cache: String, max_age_hours: f64) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let client = state.http.clone();
    let stats_url = state.setting_str("statsUrl", "");
    store::fetch_json_cached(&app, &client, &url, &cache, max_age_hours, &stats_url).await
}

/// Temporarily release global hotkeys while the user records a new keybind in Settings,
/// so pressing the current combo doesn't trigger it.
#[tauri::command]
fn suspend_hotkeys(app: AppHandle, suspended: bool) -> Vec<String> {
    app.state::<AppState>().hotkeys_suspended.store(suspended, Ordering::Relaxed);
    if suspended {
        let _ = app.global_shortcut().unregister_all();
        Vec::new()
    } else {
        apply_hotkeys(&app)
    }
}

#[tauri::command]
async fn fetch_text(app: AppHandle, url: String, cache: String, max_age_hours: f64) -> Result<String, String> {
    let client = app.state::<AppState>().http.clone();
    store::fetch_text_cached(&app, &client, &url, &cache, max_age_hours).await
}

/// The UI tells the backend whether the detected mode has augments (no OCR work otherwise).
#[tauri::command]
fn set_augment_mode(app: AppHandle, enabled: bool) {
    app.state::<AppState>().augment_mode.store(enabled, Ordering::Relaxed);
}

/// Sites the UI links to (credits, repo, update page). Anything else is refused, so the webview
/// can never make the OS open a local file, a `ms-settings:`-style URI or an arbitrary site.
const LINK_HOSTS: &[&str] = &["github.com", "hexmayhem.com", "www.hexmayhem.com", "op.gg", "www.op.gg", "developer.riotgames.com"];

fn link_allowed(url: &str) -> bool {
    store::https_host(url).is_some_and(|h| LINK_HOSTS.contains(&h.as_str()))
}

/// Open an https link (allow-listed site) in the user's default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !link_allowed(&url) {
        return Err("only links to known sites can be opened".into());
    }
    #[cfg(windows)]
    let r = std::process::Command::new("explorer").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

/// Open / close the HUD layout editor (Settings button, the HUD's own Done button).
#[tauri::command]
fn set_hud_edit(app: AppHandle, on: bool, from_settings: Option<bool>) {
    hud::set_edit(&app, on, from_settings.unwrap_or(false));
}

#[tauri::command]
fn get_hud_edit(state: tauri::State<AppState>) -> bool {
    state.hud_edit.load(Ordering::Relaxed)
}

/// `debug` (Settings → Diagnostics → Test augment detection): scan now and return the result
/// with a downscaled screenshot preview, without emitting events or switching views.
/// Normal scans (hotkey / tray / no flag) never encode images.
#[tauri::command]
async fn scan_augments(app: AppHandle, debug: Option<bool>) -> Option<Value> {
    if debug.unwrap_or(false) {
        let region = app.state::<AppState>().scan_region();
        return Some(scan_payload(region, false, true).await);
    }
    run_scan(app);
    None
}

/// Show / hide the calibration preview on the HUD layer (auto-off after 3 minutes).
#[tauri::command]
fn set_hud_preview(app: AppHandle, on: bool) {
    HUD_PREVIEW.store(on, Ordering::Relaxed);
    let gen = HUD_PREVIEW_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    sync_hud_visibility(&app);
    let _ = app.emit("hud-preview", on);
    if on {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(hud::EDIT_TIMEOUT).await;
            if HUD_PREVIEW_GEN.load(Ordering::Relaxed) == gen && HUD_PREVIEW.swap(false, Ordering::Relaxed) {
                sync_hud_visibility(&app);
                let _ = app.emit("hud-preview", false);
            }
        });
    }
}

#[tauri::command]
fn get_hud_preview() -> bool {
    HUD_PREVIEW.load(Ordering::Relaxed)
}

/// Everything Settings → Diagnostics shows that only the backend knows.
#[tauri::command]
fn diagnostics(app: AppHandle) -> Value {
    let state = app.state::<AppState>();
    let mut v = diag::snapshot();
    let hud = hud::window(&app);
    let dir = store::data_dir(&app);
    let probe = dir.join(".write-test");
    let writable = std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(probe);
    v["hud"] = json!({
        "visible": hud.as_ref().and_then(|w| w.is_visible().ok()).unwrap_or(false),
        "editing": state.hud_edit.load(Ordering::Relaxed),
        "clickThrough": !state.hud_edit.load(Ordering::Relaxed),
        "enabled": state.hud_enabled.load(Ordering::Relaxed),
        "preview": HUD_PREVIEW.load(Ordering::Relaxed),
    });
    v["augment"] = json!({
        "autoDetect": state.auto_detect(),
        "modeHasAugments": state.augment_mode.load(Ordering::Relaxed),
        "inGame": state.in_game.load(Ordering::Relaxed),
        "gameInFront": window::game_in_front(&app),
        "ocrAvailable": cfg!(windows),
    });
    v["storage"] = json!({ "writable": writable, "portable": state.portable });
    v["platform"] = json!(format!("{} {}", std::env::consts::OS, std::env::consts::ARCH));
    v
}

/// Open Nexis's own data folder in the file manager (only ever that folder).
#[tauri::command]
fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let dir = store::data_dir(&app);
    #[cfg(windows)]
    let r = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&dir).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_overlay(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn hide_overlay(app: AppHandle) {
    hide_main_to_game(&app);
}

/// Show the overlay as the compact champ-select view (doesn't cover champ select).
pub fn show_main_mini(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        if !w.is_visible().unwrap_or(false) {
            window::set_mini(app, &w, true);
            resume_webview(&w);
            let _ = w.show();
            let _ = w.unminimize();
        } else {
            // Already open at full size (the user opened it): leave it alone.
        }
    }
}

/// Compact champ-select view on/off (the Expand button, or Ctrl+Shift+Space while compact).
#[tauri::command]
fn set_mini_mode(app: AppHandle, on: bool) {
    if let Some(w) = main_window(&app) {
        window::set_mini(&app, &w, on);
        if !on {
            window::focus(&w);
        }
    }
}

#[tauri::command]
fn get_mini_mode() -> bool {
    window::is_mini()
}

/// Resize the main window to a preset ("compact" / "standard" / "large"), keeping its center.
#[tauri::command]
fn set_window_preset(app: AppHandle, preset: String) -> Result<(), String> {
    let w = main_window(&app).ok_or("no main window")?;
    window::apply_preset(&app, &w, &preset)
}

/// Forget the saved window spot: standard size, centered on League's monitor.
#[tauri::command]
fn reset_window(app: AppHandle) {
    if let Some(w) = main_window(&app) {
        window::reset(&app, &w);
    }
}

/// League's display mode (fullscreen / windowed / borderless), read-only.
#[tauri::command]
async fn league_window_mode(app: AppHandle) -> Value {
    window::league_window_mode(&app).await
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ---------------------------------------------------------------- entry

pub fn run() {
    let mut context = tauri::generate_context!();
    let portable = portable_data_dir();
    if let Some(dir) = &portable {
        context.config_mut().app.app_directories_override =
            Some(tauri::utils::config::AppDirectoriesOverride::Root(dir.clone()));
    }
    let is_portable = portable.is_some();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        on_hotkey(app, shortcut);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let handle = app.handle().clone();
            let settings = store::load_settings(&handle);
            let hud_enabled = settings.get("hudEnabled").and_then(Value::as_bool).unwrap_or(true);
            app.manage(AppState {
                hotkeys: Mutex::new(Hotkeys::default()),
                settings: Mutex::new(settings),
                in_game: AtomicBool::new(false),
                hud_enabled: AtomicBool::new(hud_enabled),
                http: reqwest::Client::builder()
                    .user_agent("NexisOverlay/0.1 (+open-source)")
                    .timeout(std::time::Duration::from_secs(20))
                    .build()?,
                portable: is_portable,
                last_fired: Mutex::new([None; 4]),
                hud_edit: AtomicBool::new(false),
                hud_edit_gen: AtomicU64::new(0),
                hud_edit_reopen_main: AtomicBool::new(false),
                hud_edit_fg: Mutex::new(None),
                hotkeys_suspended: AtomicBool::new(false),
                augment_mode: AtomicBool::new(true),
                lcu_creds: Mutex::new(None),
            });

            // The main window is created here (not from tauri.conf) so "See-through window" can pick
            // its transparency: a transparent WebView2 window is composited per-pixel by Windows, which
            // makes the mouse feel laggy over it on some PCs. Solid is the default.
            {
                let see_through = app.state::<AppState>().flag("seeThroughWindow", false);
                if let Some(cfg) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() {
                    let mut cfg = cfg;
                    cfg.transparent = see_through;
                    cfg.create = true;
                    tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?.build()?;
                }
            }
            diag::init_file(&store::data_dir(&handle));
            diag::info(
                "app",
                format!(
                    "Nexis {} started ({}, {} storage)",
                    app.package_info().version,
                    std::env::consts::OS,
                    if is_portable { "portable" } else { "fallback" }
                ),
            );
            if let Some(n) = store::settings_notice() {
                diag::warn("app", n);
            }
            for e in apply_hotkeys(&handle) {
                log::warn!("hotkey: {e}");
            }

            let show = MenuItem::with_id(app, "show", "Show / Hide overlay", true, None::<&str>)?;
            let hud_item = MenuItem::with_id(app, "hud", "Show / Hide in-game HUD", true, None::<&str>)?;
            let edit = MenuItem::with_id(app, "hud-edit", "Edit HUD layout", true, None::<&str>)?;
            let scan = MenuItem::with_id(app, "scan", "Scan augments now", true, None::<&str>)?;
            let data = MenuItem::with_id(app, "data", "Open data folder", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Nexis", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hud_item, &edit, &scan, &data, &quit])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("icon"))
                .tooltip("Nexis Overlay")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_main(app),
                    "scan" => run_scan(app.clone()),
                    "hud" => toggle_hud(app),
                    "hud-edit" => hud::toggle_edit(app),
                    "data" => {
                        let _ = open_data_dir(app.clone());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        toggle_main(tray.app_handle());
                    }
                })
                .build(app)?;

            for label in ["main", "hud"] {
                if let Some(w) = app.get_webview_window(label) {
                    exclude_from_capture(&w);
                }
            }
            if let Some(w) = app.get_webview_window("main") {
                // Starts hidden (tauri.conf.json) so it appears directly at its saved spot.
                window::restore(&handle, &w);
                window::track(&handle, &w);
                // "Start hidden in the tray": stay in the tray until the hotkey / tray / champ select.
                if !handle.state::<AppState>().flag("startHidden", false) {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            autostart::refresh();
            store::prune_cache(&handle);
            hud::init_window(&handle);
            tauri::async_runtime::spawn(auto_detect_loop(handle.clone()));
            spawn_hotkey_poller(handle.clone());
            tauri::async_runtime::spawn(live::run(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            load_store,
            save_store,
            fetch_json,
            fetch_text,
            app_info,
            set_augment_mode,
            open_url,
            scan_augments,
            set_hud_edit,
            get_hud_edit,
            hud::hud_cursor,
            suspend_hotkeys,
            hide_overlay,
            show_overlay,
            quit_app,
            set_window_preset,
            set_mini_mode,
            get_mini_mode,
            reset_window,
            league_window_mode,
            diagnostics,
            open_data_dir,
            autostart::get_autostart,
            autostart::set_autostart,
            set_hud_preview,
            get_hud_preview,
            league_import::lcu_status,
            league_import::lcu_apply_runes,
            league_import::lcu_apply_item_set
        ])
        .run(context)
        .expect("error while running Nexis Overlay");
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_known_https_links_open() {
        assert!(super::link_allowed("https://github.com/exodux-dev/NexisOverlay"));
        assert!(super::link_allowed("https://op.gg"));
        for bad in ["file:///C:/Windows/System32/calc.exe", "ms-settings:", "http://github.com", "https://evil.com", "https://github.com.evil.com/", "https://op.gg@evil.com/", "https://github.com/\" x"] {
            assert!(!super::link_allowed(bad), "{bad}");
        }
    }
}

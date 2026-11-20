//! Diagnostics: a small in-memory log of notable events (last ~200 lines) plus the latest status
//! of each subsystem (Live Client API, League client, hotkeys, augment OCR, stats fetches), shown
//! in Settings → Diagnostics so a first-time tester can see — and report — what's going wrong.
//!
//! The log is also appended to `<data dir>/logs/nexis.log` (rotated at 512 KB, one old file kept).
//! Nothing is written outside the data folder. Messages never include summoner names / Riot IDs;
//! home-folder user names in paths are masked before anything is stored.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, VecDeque};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_LINES: usize = 200;
pub const MAX_FILE_BYTES: u64 = 512 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Entry {
    /// Unix epoch milliseconds.
    pub t: u64,
    /// "info" | "warn" | "error"
    pub level: &'static str,
    /// Subsystem: "app", "live", "lcu", "ocr", "fetch", "hotkey", "hud"…
    pub area: &'static str,
    pub msg: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStatus {
    /// Last time the Live Client API answered (any HTTP response), epoch ms.
    pub last_ok: Option<u64>,
    /// Last time it returned an in-game snapshot (champion stats present).
    pub last_in_game: Option<u64>,
    pub reachable: bool,
    pub in_game: bool,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuStatus {
    pub connected: bool,
    /// When `connected` last changed, epoch ms.
    pub since: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub action: &'static str,
    pub combo: String,
    /// Registered as a Windows global hotkey.
    pub registered: bool,
    /// Also detected by the key-state poller (works while League is focused).
    pub polled: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub last_at: Option<u64>,
    pub last_auto: bool,
    pub lines: usize,
    pub millis: u64,
    pub count: u64,
    pub last_error: Option<String>,
    pub last_error_at: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchStatus {
    pub ok_at: Option<u64>,
    pub err_at: Option<u64>,
    pub error: Option<String>,
    /// Last request was answered from the on-disk cache (fresh, or stale after a failure).
    pub from_cache: bool,
    /// Age of the cache file used / written, seconds.
    pub cache_age_secs: Option<u64>,
    pub count: u64,
}

#[derive(Default)]
struct Diag {
    log: VecDeque<Entry>,
    file: Option<PathBuf>,
    live: LiveStatus,
    lcu: LcuStatus,
    hotkeys: Vec<HotkeyStatus>,
    scan: ScanStatus,
    fetch: BTreeMap<String, FetchStatus>,
}

static DIAG: Mutex<Option<Diag>> = Mutex::new(None);

fn with<R>(f: impl FnOnce(&mut Diag) -> R) -> R {
    let mut guard = DIAG.lock().unwrap_or_else(|e| e.into_inner());
    f(guard.get_or_insert_with(Diag::default))
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Mask personal data: the account name in home-folder paths (`C:\Users\Name\…`,
/// `/home/name/…`) and URL paths/queries (OP.GG profile URLs contain Riot IDs) — only the host is kept.
pub fn redact(msg: &str) -> String {
    mask_paths(&strip_url_paths(msg))
}

fn strip_url_paths(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    let mut rest = msg;
    while let Some(i) = rest.find("https://").or_else(|| rest.find("http://")) {
        let scheme = if rest[i..].starts_with("https://") { 8 } else { 7 };
        out.push_str(&rest[..i + scheme]);
        let after = &rest[i + scheme..];
        let end = after.find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ')').unwrap_or(after.len());
        let url = &after[..end];
        let host_end = url.find(['/', '?', '#']).unwrap_or(url.len());
        out.push_str(&url[..host_end]);
        if host_end < url.len() {
            out.push_str("/…");
        }
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

fn mask_paths(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    let mut rest = msg;
    loop {
        let found = ["\\Users\\", "/Users/", "/home/", "\\users\\"]
            .iter()
            .filter_map(|p| rest.find(p).map(|i| (i, *p)))
            .min_by_key(|(i, _)| *i);
        let Some((i, prefix)) = found else {
            out.push_str(rest);
            return out;
        };
        out.push_str(&rest[..i + prefix.len()]);
        let after = &rest[i + prefix.len()..];
        let end = after.find(['\\', '/', '"', '\'', '\n', ')']).unwrap_or(after.len());
        if end > 0 {
            out.push_str("<user>");
        }
        rest = &after[end..];
    }
}

/// Write the log to `<data_dir>/logs/nexis.log` from now on.
pub fn init_file(data_dir: &std::path::Path) {
    let dir = data_dir.join("logs");
    if std::fs::create_dir_all(&dir).is_ok() {
        with(|d| d.file = Some(dir.join("nexis.log")));
    }
}

fn append_file(path: &std::path::Path, e: &Entry) {
    if std::fs::metadata(path).map(|m| m.len() >= MAX_FILE_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(path, path.with_file_name("nexis.1.log"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{} [{}] {}: {}", e.t, e.level, e.area, e.msg);
    }
}

pub fn log(level: &'static str, area: &'static str, msg: impl AsRef<str>) {
    let entry = Entry { t: now_ms(), level, area, msg: redact(msg.as_ref()) };
    match level {
        "error" => log::error!("{area}: {}", entry.msg),
        "warn" => log::warn!("{area}: {}", entry.msg),
        _ => log::info!("{area}: {}", entry.msg),
    }
    let file = with(|d| {
        push_capped(&mut d.log, entry.clone());
        d.file.clone()
    });
    if let Some(path) = file {
        append_file(&path, &entry);
    }
}

fn push_capped(log: &mut VecDeque<Entry>, e: Entry) {
    while log.len() >= MAX_LINES {
        log.pop_front();
    }
    log.push_back(e);
}

pub fn info(area: &'static str, msg: impl AsRef<str>) {
    log("info", area, msg);
}
pub fn warn(area: &'static str, msg: impl AsRef<str>) {
    log("warn", area, msg);
}
pub fn error(area: &'static str, msg: impl AsRef<str>) {
    log("error", area, msg);
}

// ---------------------------------------------------------------- status updates

/// One Live Client API poll. `answered` = any HTTP response; `error` = transport error / bad status.
pub fn live_poll(answered: bool, in_game: bool, error: Option<String>) {
    let now = now_ms();
    let (was_reachable, was_in_game, prev_err) = with(|d| (d.live.reachable, d.live.in_game, d.live.last_error.clone()));
    if answered && !was_reachable {
        info("live", "Live Client API is answering (game or loading screen running)");
    } else if !answered && was_reachable {
        info("live", format!("Live Client API stopped answering{}", error.as_deref().map(|e| format!(" ({e})")).unwrap_or_default()));
    } else if answered && error.is_some() && error != prev_err {
        warn("live", format!("Live Client API: {}", error.as_deref().unwrap_or("")));
    }
    if in_game != was_in_game {
        info("live", if in_game { "Game started (in game)" } else { "Left the game" });
    }
    with(|d| {
        d.live.reachable = answered;
        d.live.in_game = in_game;
        if answered {
            d.live.last_ok = Some(now);
        }
        if in_game {
            d.live.last_in_game = Some(now);
        }
        if let Some(e) = error {
            d.live.last_error = Some(redact(&e));
        } else if answered {
            d.live.last_error = None;
        }
    });
}

pub fn lcu_connected(connected: bool) {
    let changed = with(|d| {
        let changed = d.lcu.connected != connected || d.lcu.since.is_none();
        if changed {
            d.lcu.connected = connected;
            d.lcu.since = Some(now_ms());
        }
        changed
    });
    if changed {
        info("lcu", if connected { "League client found (LCU connected)" } else { "League client not connected" });
    }
}

pub fn lcu_phase(phase: &str) {
    info("lcu", format!("Client phase: {phase}"));
}

pub fn set_hotkeys(list: Vec<HotkeyStatus>) {
    for h in &list {
        if let Some(e) = &h.error {
            warn("hotkey", format!("{} ({}) not registered: {e}", h.action, h.combo));
        }
    }
    with(|d| d.hotkeys = list);
}

pub fn scan_ok(auto: bool, lines: usize, millis: u128) {
    let had_error = with(|d| {
        d.scan.last_at = Some(now_ms());
        d.scan.last_auto = auto;
        d.scan.lines = lines;
        d.scan.millis = millis as u64;
        d.scan.count += 1;
        d.scan.last_error.take().is_some()
    });
    if had_error {
        info("ocr", "Augment scan working again");
    }
    if !auto {
        info("ocr", format!("Manual scan: {lines} text lines read in {millis} ms"));
    }
}

pub fn scan_err(auto: bool, err: &str) {
    let repeat = with(|d| {
        let repeat = d.scan.last_error.as_deref() == Some(err);
        d.scan.last_error = Some(redact(err));
        d.scan.last_error_at = Some(now_ms());
        d.scan.last_auto = auto;
        repeat
    });
    if !repeat || !auto {
        error("ocr", format!("{} scan failed: {err}", if auto { "Auto" } else { "Manual" }));
    }
}

/// Result of a cached fetch (`host` = the remote host, or "local" for a local file).
pub fn fetch_result(host: &str, result: Result<(), &str>, from_cache: bool, cache_age_secs: Option<u64>) {
    let now = now_ms();
    let prev_err = with(|d| {
        let s = d.fetch.entry(host.to_string()).or_default();
        let prev = s.error.clone();
        s.count += 1;
        s.from_cache = from_cache;
        s.cache_age_secs = cache_age_secs;
        if from_cache && result.is_ok() {
            // Fresh cache hit: no network involved, the last network outcome stands.
            return None;
        }
        match result {
            Ok(()) => {
                s.ok_at = Some(now);
                s.error = None;
            }
            Err(e) => {
                s.err_at = Some(now);
                s.error = Some(redact(e));
            }
        }
        prev
    });
    if let Err(e) = result {
        if prev_err.as_deref() != Some(e) {
            warn("fetch", format!("{host}: {e}{}", if from_cache { " (using cached copy)" } else { "" }));
        }
    } else if prev_err.is_some() {
        info("fetch", format!("{host}: fetching works again"));
    }
}

/// Host part of an https URL ("local" for anything else).
pub fn host_of(url: &str) -> String {
    url.strip_prefix("https://")
        .and_then(|r| r.split(['/', '?', '#']).next())
        .filter(|h| !h.is_empty())
        .unwrap_or("local")
        .to_string()
}

pub fn snapshot() -> Value {
    with(|d| {
        json!({
            "log": d.log,
            "live": d.live,
            "lcu": d.lcu,
            "hotkeys": d.hotkeys,
            "pollerFallback": cfg!(windows),
            "scan": d.scan,
            "fetch": d.fetch,
            "logFile": d.file.as_ref().map(|p| redact(&p.to_string_lossy())),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_user_names_in_paths() {
        assert_eq!(redact(r"C:\Users\Jane Doe\AppData\x"), r"C:\Users\<user>\AppData\x");
        assert_eq!(redact(r"C:\Users\jane\AppData\x"), r"C:\Users\<user>\AppData\x");
        assert_eq!(redact("/home/bob/nexis/data and /Users/al/x"), "/home/<user>/nexis/data and /Users/<user>/x");
        assert_eq!(redact("no paths here"), "no paths here");
        assert_eq!(redact("HTTP 404 for https://op.gg/summoners/euw/Some%20One-EUW (x)"), "HTTP 404 for https://op.gg/… (x)");
        assert_eq!(redact("error sending request for url (https://127.0.0.1:2999/liveclientdata/allgamedata)"), "error sending request for url (https://127.0.0.1:2999/…)");
    }

    #[test]
    fn ring_buffer_is_capped() {
        let mut log = VecDeque::new();
        for i in 0..(MAX_LINES + 25) {
            push_capped(&mut log, Entry { t: i as u64, level: "info", area: "app", msg: String::new() });
        }
        assert_eq!(log.len(), MAX_LINES);
        assert_eq!(log.front().unwrap().t, 25);
    }

    #[test]
    fn hosts() {
        assert_eq!(host_of("https://www.op.gg/champions/x?y"), "www.op.gg");
        assert_eq!(host_of("C:/stats.json"), "local");
    }

    #[test]
    fn log_file_rotates() {
        let dir = std::env::temp_dir().join(format!("nexis-diag-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("nexis.log");
        std::fs::write(&path, vec![b'x'; MAX_FILE_BYTES as usize]).unwrap();
        append_file(&path, &Entry { t: 1, level: "info", area: "app", msg: "hi".into() });
        assert!(dir.join("nexis.1.log").exists());
        assert!(std::fs::metadata(&path).unwrap().len() < 100);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

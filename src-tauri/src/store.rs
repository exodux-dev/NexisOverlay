//! Tiny JSON persistence + cached HTTP fetches, all stored in the app data dir.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("nexis-overlay"));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}

pub fn read_json(app: &AppHandle, name: &str) -> Option<Value> {
    match load_in(&data_dir(app), name) {
        Loaded::Ok(v) | Loaded::Recovered { value: v, .. } => Some(v),
        _ => None,
    }
}

pub fn write_json(app: &AppHandle, name: &str, value: &Value) -> Result<(), String> {
    write_in(&data_dir(app), name, value)?;
    if sanitize(name) == SETTINGS {
        // The user's own save replaces a settings file we couldn't read (a copy was kept).
        SETTINGS_HELD.store(false, Ordering::Relaxed);
    }
    Ok(())
}

// ---------------------------------------------------------------- safety net
//
// Nexis must never wipe the user's settings or history:
//   * every write is atomic (temp file + rename), so a crash can't leave half a file;
//   * settings.json / history.json keep a rolling `<name>.bak.json` copy of the last good version;
//   * a file that exists but can't be parsed is copied to `<name>.corrupt-<timestamp>.json`
//     before anything else happens, then the last good backup (or the defaults) is used in memory;
//   * when settings.json was unreadable, background saves (remembered champion, migrations…)
//     don't touch it — only a change the user makes writes a new file.

const SETTINGS: &str = "settings.json";
/// Files that get a rolling `.bak.json` copy on every save.
const BACKED_UP: &[&str] = &[SETTINGS, "history.json"];

static SETTINGS_HELD: AtomicBool = AtomicBool::new(false);
static SETTINGS_NOTICE: Mutex<Option<String>> = Mutex::new(None);

/// Result of reading a stored JSON file.
#[derive(Debug, PartialEq)]
pub enum Loaded {
    /// No such file (first run).
    Missing,
    Ok(Value),
    /// The file was unreadable/corrupt; `value` comes from the last good backup.
    Recovered { value: Value, backup: Option<PathBuf> },
    /// The file was unreadable/corrupt and there's no usable backup.
    Corrupt { backup: Option<PathBuf> },
}

fn is_cache(name: &str) -> bool {
    name.starts_with("cache_")
}

/// `settings.json` → (`settings`, `.json`)
fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

pub fn bak_name(name: &str) -> String {
    let (stem, ext) = split_ext(name);
    format!("{stem}.bak{ext}")
}

fn corrupt_name(name: &str, stamp: &str) -> String {
    let (stem, ext) = split_ext(name);
    format!("{stem}.corrupt-{stamp}{ext}")
}

/// UTC timestamp like `20261119-142501` (no date crate needed).
fn timestamp() -> String {
    let secs = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (days, rem) = ((secs / 86_400) as i64, secs % 86_400);
    // Civil-from-days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn parse_file(path: &Path, must_be_object: bool) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    (!must_be_object || v.is_object()).then_some(v)
}

/// Read `<dir>/<name>` without ever modifying it. Corrupt files are copied aside first.
pub fn load_in(dir: &Path, name: &str) -> Loaded {
    let name = sanitize(name);
    let path = dir.join(&name);
    let must_be_object = name == SETTINGS;
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Loaded::Missing,
        Err(e) => {
            log::warn!("{name}: can't read ({e}); keeping the file untouched");
            String::new()
        }
    };
    if let Ok(v) = serde_json::from_str::<Value>(&text) {
        if !must_be_object || v.is_object() {
            return Loaded::Ok(v);
        }
    }
    if is_cache(&name) {
        return Loaded::Corrupt { backup: None };
    }
    // Keep a copy of the unreadable file before anything can overwrite it.
    let backup = if text.is_empty() && std::fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false) {
        None // couldn't read it at all (locked?) — nothing to copy, and we won't overwrite it either
    } else {
        let mut target = dir.join(corrupt_name(&name, &timestamp()));
        let mut n = 1;
        while target.exists() {
            target = dir.join(corrupt_name(&name, &format!("{}-{n}", timestamp())));
            n += 1;
        }
        match std::fs::copy(&path, &target) {
            Ok(_) => Some(target),
            Err(e) => {
                log::warn!("{name}: couldn't back up the corrupt file: {e}");
                None
            }
        }
    };
    match parse_file(&dir.join(bak_name(&name)), must_be_object) {
        Some(value) => Loaded::Recovered { value, backup },
        None => Loaded::Corrupt { backup },
    }
}

/// Atomic write; for important files the previous good version is kept as `<name>.bak.json`.
pub fn write_in(dir: &Path, name: &str, value: &Value) -> Result<(), String> {
    // Writers run on several threads (commands, hotkey poller, window-geometry debounce) and share
    // `<name>.tmp`: unserialized, one could rename the other's half-written temp file into place.
    static WRITE: Mutex<()> = Mutex::new(());
    let _guard = WRITE.lock().unwrap_or_else(|e| e.into_inner());
    let name = sanitize(name);
    let path = dir.join(&name);
    let tmp = dir.join(format!("{name}.tmp"));
    let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    if BACKED_UP.contains(&name.as_str()) && parse_file(&path, name == SETTINGS).is_some() {
        // Only a file that parses becomes the backup, so a good backup is never replaced by junk.
        let _ = std::fs::copy(&path, dir.join(bak_name(&name)));
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Load settings at startup. Never writes settings.json; see the safety notes above.
pub fn load_settings(app: &AppHandle) -> Value {
    let loaded = load_in(&data_dir(app), SETTINGS);
    let (value, notice) = settings_from(loaded);
    if let Some(n) = &notice {
        log::warn!("{n}");
        SETTINGS_HELD.store(true, Ordering::Relaxed);
    }
    *SETTINGS_NOTICE.lock().unwrap_or_else(|e| e.into_inner()) = notice;
    value
}

fn settings_from(loaded: Loaded) -> (Value, Option<String>) {
    let file = |b: &Option<PathBuf>| {
        b.as_ref()
            .and_then(|p| p.file_name())
            .map(|f| format!(" A copy was saved as {}.", f.to_string_lossy()))
            .unwrap_or_default()
    };
    match loaded {
        Loaded::Missing => (json!({}), None),
        Loaded::Ok(v) => (v, None),
        Loaded::Recovered { value, backup } => (
            value,
            Some(format!("settings.json couldn't be read, so your last good settings (settings.bak.json) were restored.{}", file(&backup))),
        ),
        Loaded::Corrupt { backup } => (
            json!({}),
            Some(format!("settings.json couldn't be read, so defaults are used until you change something.{}", file(&backup))),
        ),
    }
}

/// True while settings.json was unreadable and the user hasn't saved anything yet.
pub fn settings_held() -> bool {
    SETTINGS_HELD.load(Ordering::Relaxed)
}

/// Message shown in Settings → About when settings had to be recovered.
pub fn settings_notice() -> Option<String> {
    SETTINGS_NOTICE.lock().ok().and_then(|n| n.clone())
}

/// Fetch JSON over HTTPS with an on-disk cache. Falls back to a stale cache when offline.
pub async fn fetch_json_cached(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    cache_name: &str,
    max_age_hours: f64,
    user_stats_url: &str,
) -> Result<Value, String> {
    // Local dataset files (e.g. produced by scripts/aggregate-stats.ts on this PC). Only the
    // stats dataset the user configured in Settings may be read, and only a .json file.
    if let Some(path) = local_path(url) {
        if url.trim() != user_stats_url.trim() || !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("json")) {
            return Err("local files can only be read as the configured stats dataset (.json)".into());
        }
        let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        return serde_json::from_str(&text).map_err(|e| e.to_string());
    }
    json_url_allowed(url, user_stats_url)?;
    let cache_file = format!("cache_{}", sanitize(cache_name));
    let path = data_dir(app).join(&cache_file);

    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|age| age < Duration::from_secs_f64(max_age_hours.max(0.0) * 3600.0))
        .unwrap_or(false);
    let host = crate::diag::host_of(url);
    if fresh {
        if let Some(v) = read_json(app, &cache_file) {
            crate::diag::fetch_result(&host, Ok(()), true, cache_age(&path));
            return Ok(v);
        }
    }

    let fetched: Result<Value, String> = async {
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {} for {}", resp.status(), url));
        }
        resp.json::<Value>().await.map_err(|e| e.to_string())
    }
    .await;

    match fetched {
        Ok(v) => {
            let _ = write_json(app, &cache_file, &v);
            crate::diag::fetch_result(&host, Ok(()), false, Some(0));
            Ok(v)
        }
        Err(e) => {
            let stale = read_json(app, &cache_file);
            crate::diag::fetch_result(&host, Err(&e), stale.is_some(), stale.as_ref().and(cache_age(&path)));
            stale.ok_or(e)
        }
    }
}

fn local_path(url: &str) -> Option<PathBuf> {
    let u = url.trim();
    if let Some(rest) = u.strip_prefix("file://") {
        let rest = rest.strip_prefix('/').filter(|r| r.len() > 1 && r.as_bytes()[1] == b':').unwrap_or(rest);
        return Some(PathBuf::from(rest));
    }
    let p = PathBuf::from(u);
    if p.is_absolute() && u.ends_with(".json") {
        return Some(p);
    }
    None
}

/// Hosts the web-stats provider may read (public stats pages). Everything else is refused.
const TEXT_HOSTS: &[&str] = &["hexmayhem.com", "www.hexmayhem.com", "op.gg", "www.op.gg"];

/// Hosts `fetch_json` may read: Riot Data Dragon, CommunityDragon, the update check and the
/// default stats dataset. A custom stats URL from Settings is allowed in addition (exact URL).
const JSON_HOSTS: &[&str] = &["ddragon.leagueoflegends.com", "raw.communitydragon.org", "api.github.com", "raw.githubusercontent.com"];

/// Host of an `https://` URL (lower-cased, no port/userinfo), or None for anything else.
pub fn https_host(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.is_empty() || authority.contains('@') || url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"') {
        return None;
    }
    let host = authority.split(':').next()?.to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}

fn json_url_allowed(url: &str, user_stats_url: &str) -> Result<(), String> {
    let host = https_host(url).ok_or("only https URLs are allowed")?;
    if JSON_HOSTS.contains(&host.as_str()) || (!user_stats_url.trim().is_empty() && url.trim() == user_stats_url.trim()) {
        Ok(())
    } else {
        Err(format!("host not allowed: {host}"))
    }
}

/// Store names the webview may read/write: a plain `name.json` file directly in the data dir.
pub fn valid_store_name(name: &str) -> bool {
    name.len() <= 96
        && name.ends_with(".json")
        && !name.starts_with('.')
        && !name.contains("..")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Fetch a public web page as text with an on-disk cache (stale cache is used when offline).
pub async fn fetch_text_cached(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    cache_name: &str,
    max_age_hours: f64,
) -> Result<String, String> {
    let host = https_host(url).ok_or("only https URLs are allowed")?;
    if !TEXT_HOSTS.contains(&host.as_str()) {
        return Err(format!("host not allowed: {host}"));
    }
    let host = host.as_str();
    let path = data_dir(app).join(format!("cache_{}", sanitize(cache_name)));
    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|age| age < Duration::from_secs_f64(max_age_hours.max(0.0) * 3600.0))
        .unwrap_or(false);
    if fresh {
        if let Ok(text) = std::fs::read_to_string(&path) {
            crate::diag::fetch_result(host, Ok(()), true, cache_age(&path));
            return Ok(text);
        }
    }
    let fetched: Result<String, String> = async {
        let resp = client
            .get(url)
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {} for {}", resp.status(), url));
        }
        resp.text().await.map_err(|e| e.to_string())
    }
    .await;
    // Don't let an error/challenge page replace a good cache entry.
    let fetched = fetched.and_then(|t| {
        if t.len() < 64 || t.contains("cf-browser-verification") || t.contains("<title>Just a moment") {
            Err(format!("unusable response from {url}"))
        } else {
            Ok(t)
        }
    });
    match fetched {
        Ok(text) => {
            let tmp = path.with_extension("tmp");
            if std::fs::write(&tmp, &text).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
            prune_cache(app);
            crate::diag::fetch_result(host, Ok(()), false, Some(0));
            Ok(text)
        }
        Err(e) => {
            let stale = std::fs::read_to_string(&path).ok();
            crate::diag::fetch_result(host, Err(&e), stale.is_some(), stale.as_ref().and(cache_age(&path)));
            stale.ok_or(e)
        }
    }
}

/// Age of a cache file in seconds.
fn cache_age(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).and_then(|m| m.modified()).ok()?;
    SystemTime::now().duration_since(modified).ok().map(|d| d.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nexis-store-{tag}-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn files(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        v.sort();
        v
    }

    #[test]
    fn missing_file_is_first_run() {
        let d = temp_dir("missing");
        assert_eq!(load_in(&d, "settings.json"), Loaded::Missing);
        assert_eq!(settings_from(Loaded::Missing), (json!({}), None));
    }

    #[test]
    fn corrupt_settings_are_copied_aside_and_left_untouched() {
        let d = temp_dir("corrupt");
        std::fs::write(d.join("settings.json"), "{\"hotkeyToggle\": \"Ctrl+").unwrap();
        let loaded = load_in(&d, "settings.json");
        let Loaded::Corrupt { backup: Some(b) } = &loaded else { panic!("{loaded:?}") };
        assert!(b.file_name().unwrap().to_string_lossy().starts_with("settings.corrupt-"));
        assert_eq!(std::fs::read_to_string(b).unwrap(), "{\"hotkeyToggle\": \"Ctrl+");
        // The original is never modified by loading.
        assert_eq!(std::fs::read_to_string(d.join("settings.json")).unwrap(), "{\"hotkeyToggle\": \"Ctrl+");
        let (value, notice) = settings_from(loaded);
        assert_eq!(value, json!({}));
        assert!(notice.unwrap().contains("settings.corrupt-"));
    }

    #[test]
    fn non_object_settings_count_as_corrupt() {
        let d = temp_dir("array");
        std::fs::write(d.join("settings.json"), "[1,2]").unwrap();
        assert!(matches!(load_in(&d, "settings.json"), Loaded::Corrupt { backup: Some(_) }));
        // Other stores may legitimately be arrays.
        std::fs::write(d.join("history.json"), "[1,2]").unwrap();
        assert_eq!(load_in(&d, "history.json"), Loaded::Ok(json!([1, 2])));
    }

    #[test]
    fn saves_keep_a_rolling_backup_of_the_last_good_version() {
        let d = temp_dir("bak");
        write_in(&d, "settings.json", &json!({ "opacity": 0.8 })).unwrap();
        assert!(!d.join("settings.bak.json").exists(), "nothing to back up on the first save");
        write_in(&d, "settings.json", &json!({ "opacity": 0.9 })).unwrap();
        assert_eq!(parse_file(&d.join("settings.bak.json"), true), Some(json!({ "opacity": 0.8 })));
        assert_eq!(parse_file(&d.join("settings.json"), true), Some(json!({ "opacity": 0.9 })));
        assert!(!d.join("settings.json.tmp").exists());
        // Unimportant files don't get backups.
        write_in(&d, "onboarding.json", &json!({ "done": true })).unwrap();
        write_in(&d, "onboarding.json", &json!({ "done": false })).unwrap();
        assert!(!d.join("onboarding.bak.json").exists());
    }

    #[test]
    fn corrupt_file_never_replaces_a_good_backup_and_backup_is_used() {
        let d = temp_dir("recover");
        write_in(&d, "settings.json", &json!({ "playstyle": "aggressive" })).unwrap();
        write_in(&d, "settings.json", &json!({ "playstyle": "safe" })).unwrap();
        std::fs::write(d.join("settings.json"), "\0\0garbage").unwrap();
        let loaded = load_in(&d, "settings.json");
        let Loaded::Recovered { value, backup: Some(_) } = &loaded else { panic!("{loaded:?}") };
        assert_eq!(value, &json!({ "playstyle": "aggressive" }));
        let (v, notice) = settings_from(loaded);
        assert_eq!(v, json!({ "playstyle": "aggressive" }));
        assert!(notice.unwrap().contains("settings.bak.json"));
        // A user save after that must not copy the garbage into the backup.
        write_in(&d, "settings.json", &json!({ "playstyle": "auto" })).unwrap();
        assert_eq!(parse_file(&d.join("settings.bak.json"), true), Some(json!({ "playstyle": "aggressive" })));
        let names = files(&d);
        assert_eq!(names.iter().filter(|n| n.starts_with("settings.corrupt-")).count(), 1, "{names:?}");
    }

    #[test]
    fn corrupt_history_is_preserved() {
        let d = temp_dir("history");
        std::fs::write(d.join("history.json"), "[{\"id\":1},").unwrap();
        assert!(matches!(load_in(&d, "history.json"), Loaded::Corrupt { backup: Some(_) }));
        assert!(files(&d).iter().any(|n| n.starts_with("history.corrupt-")));
    }

    #[test]
    fn corrupt_caches_are_not_copied() {
        let d = temp_dir("cache");
        std::fs::write(d.join("cache_x.json"), "nope").unwrap();
        assert_eq!(load_in(&d, "cache_x.json"), Loaded::Corrupt { backup: None });
        assert_eq!(files(&d), vec!["cache_x.json".to_string()]);
    }

    #[test]
    fn json_fetch_hosts_are_allow_listed() {
        let stats = "https://example.org/my/stats.json";
        assert!(json_url_allowed("https://ddragon.leagueoflegends.com/api/versions.json", "").is_ok());
        assert!(json_url_allowed("https://raw.communitydragon.org/latest/x.json", "").is_ok());
        assert!(json_url_allowed(stats, stats).is_ok());
        assert!(json_url_allowed("https://example.org/other.json", stats).is_err());
        assert!(json_url_allowed("https://evil.com/?x=1", "").is_err());
        assert!(json_url_allowed("http://ddragon.leagueoflegends.com/x", "").is_err());
        assert!(json_url_allowed("https://evil.com@ddragon.leagueoflegends.com/x", "").is_err());
        assert!(json_url_allowed("https://ddragon.leagueoflegends.com.evil.com/x", "").is_err());
        assert_eq!(https_host("https://OP.GG:443/lol").as_deref(), Some("op.gg"));
        assert_eq!(https_host("file:///C:/x.json"), None);
        assert_eq!(https_host("https://op.gg/a b"), None);
    }

    #[test]
    fn store_names_stay_in_the_data_dir() {
        for ok in ["history.json", "tier-history.json", "onboarding_v2.json", "settings.json"] {
            assert!(valid_store_name(ok), "{ok}");
        }
        for bad in ["../x.json", "..json", "a/b.json", "C:\\x.json", "/etc/x.json", ".hidden.json", "x.txt", "nexis.log", "", "a..b.json"] {
            assert!(!valid_store_name(bad), "{bad}");
        }
    }

    #[test]
    fn names() {
        assert_eq!(bak_name("settings.json"), "settings.bak.json");
        assert_eq!(corrupt_name("history.json", "1"), "history.corrupt-1.json");
        let t = timestamp();
        assert_eq!(t.len(), 15, "{t}");
        assert!(t.starts_with("20"), "{t}");
    }
}

/// Cache housekeeping: web pages are cached as-is (an OP.GG page is ~0.8 MB), so without limits
/// the data folder would keep growing with every champion and patch. Drops cache entries not
/// refreshed for `MAX_CACHE_AGE`, then the oldest ones until the cache is under `CACHE_BUDGET`.
/// Settings, history, backups and logs are never touched (only `cache_*` files).
const MAX_CACHE_AGE: Duration = Duration::from_secs(14 * 24 * 3600);
const CACHE_BUDGET: u64 = 80 * 1024 * 1024;
const CACHE_HIGH_WATER: u64 = 120 * 1024 * 1024;

pub fn prune_cache_dir(dir: &Path) -> (usize, u64) {
    let Ok(rd) = std::fs::read_dir(dir) else { return (0, 0) };
    let now = SystemTime::now();
    let mut files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    let (mut removed, mut freed) = (0usize, 0u64);
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if !is_cache(&name) {
            continue;
        }
        let Ok(meta) = e.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let modified = meta.modified().unwrap_or(now);
        let age = now.duration_since(modified).unwrap_or_default();
        if age > MAX_CACHE_AGE || name.ends_with(".tmp") && age > Duration::from_secs(3600) {
            if std::fs::remove_file(e.path()).is_ok() {
                removed += 1;
                freed += meta.len();
            }
            continue;
        }
        files.push((e.path(), modified, meta.len()));
    }
    let mut total: u64 = files.iter().map(|f| f.2).sum();
    if total > CACHE_HIGH_WATER {
        files.sort_by_key(|f| f.1); // oldest first
        for (path, _, len) in files {
            if total <= CACHE_BUDGET {
                break;
            }
            if std::fs::remove_file(&path).is_ok() {
                total -= len;
                removed += 1;
                freed += len;
            }
        }
    }
    (removed, freed)
}

/// Prune in the background (startup, and at most every 10 minutes after cache writes).
pub fn prune_cache(app: &AppHandle) {
    use std::sync::atomic::AtomicU64;
    static LAST: AtomicU64 = AtomicU64::new(0);
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let last = LAST.load(Ordering::Relaxed);
    if last != 0 && now.saturating_sub(last) < 600 {
        return;
    }
    LAST.store(now, Ordering::Relaxed);
    let dir = data_dir(app);
    std::thread::spawn(move || {
        let (n, bytes) = prune_cache_dir(&dir);
        if n > 0 {
            crate::diag::info("cache", format!("removed {n} old files ({:.1} MB)", bytes as f64 / 1_048_576.0));
        }
    });
}

#[cfg(test)]
mod prune_tests {
    use super::*;
    #[test]
    fn prunes_only_cache_files_over_budget() {
        let d = std::env::temp_dir().join(format!("nexis-prune-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("settings.json"), "{}").unwrap();
        std::fs::write(d.join("cache_small.html"), "x").unwrap();
        let (n, _) = prune_cache_dir(&d);
        assert_eq!(n, 0);
        assert!(d.join("settings.json").exists() && d.join("cache_small.html").exists());
        let _ = std::fs::remove_dir_all(&d);
    }
}

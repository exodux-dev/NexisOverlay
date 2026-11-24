//! Access to the League Client (LCU) local API, the same source every mainstream companion
//! app uses. The watcher below only ever issues GET requests. Writes (rune page / item set)
//! go through [`LcuApi`] and only happen from the opt-in "Import to League" feature
//! (see league_import.rs). Nothing here ever talks to the game process.

use base64::Engine;
use serde_json::Value;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Credentials {
    port: u16,
    token: String,
}

#[derive(Default)]
pub struct LcuWatcher {
    creds: Option<Credentials>,
    last_lookup: Option<Instant>,
    last_session: Option<Value>,
    had_session: bool,
    last_info: Option<Value>,
    last_info_at: Option<Instant>,
    /// Consecutive failed credential lookups that had to spawn a process (PowerShell) — those
    /// back off up to 60 s. Lookups that only saw "client not running" (a cheap process-list
    /// check) don't, so a freshly started client is found within ~10 s.
    misses: u32,
}

impl LcuWatcher {
    /// Credentials of the running League client, if found (shared with the import commands).
    pub fn credentials(&self) -> Option<Credentials> {
        self.creds.clone()
    }

    fn lookup_due(&self) -> bool {
        let wait = Duration::from_secs((10 * (1 + self.misses as u64)).min(60));
        self.last_lookup.map(|t| t.elapsed() > wait).unwrap_or(true)
    }

    /// Find client credentials without blocking the async runtime (may spawn PowerShell).
    async fn lookup(&mut self, league_path: &str) -> Option<Credentials> {
        self.last_lookup = Some(Instant::now());
        let path = league_path.to_string();
        let found = tauri::async_runtime::spawn_blocking(move || find_credentials(&path)).await.ok();
        let (creds, spawned) = found.map(|l| (l.creds, l.spawned)).unwrap_or((None, false));
        self.misses = if creds.is_some() || !spawned { 0 } else { self.misses.saturating_add(1) };
        creds
    }

    async fn get(&self, client: &reqwest::Client, path: &str) -> Option<Value> {
        let creds = self.creds.as_ref()?;
        let auth = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", creds.token));
        let resp = client
            .get(format!("https://127.0.0.1:{}{}", creds.port, path))
            .header("Authorization", format!("Basic {auth}"))
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        resp.json::<Value>().await.ok()
    }

    /// Queue / game mode / phase and the account's region, from the League client (GET only).
    /// Returns `Some` when it changed. Polled at most every 4 s.
    pub async fn client_info(&mut self, client: &reqwest::Client, league_path: &str) -> Option<Value> {
        if self.last_info_at.map(|t| t.elapsed() < Duration::from_secs(4)).unwrap_or(false) {
            return None;
        }
        self.last_info_at = Some(Instant::now());
        if self.creds.is_none() {
            if !self.lookup_due() {
                return None;
            }
            self.creds = self.lookup(league_path).await;
            self.creds.as_ref()?;
        }
        let flow = self.get(client, "/lol-gameflow/v1/session").await;
        let region = self.get(client, "/riotclient/region-locale").await;
        let queue = flow.as_ref().and_then(|f| f.pointer("/gameData/queue"));
        let info = serde_json::json!({
            "phase": flow.as_ref().and_then(|f| f.get("phase")).cloned().unwrap_or(Value::Null),
            "gameMode": queue.and_then(|q| q.get("gameMode")).cloned().unwrap_or(Value::Null),
            "queueId": queue.and_then(|q| q.get("id")).cloned().unwrap_or(Value::Null),
            "mapId": queue.and_then(|q| q.get("mapId")).cloned().unwrap_or(Value::Null),
            "region": region.as_ref().and_then(|r| r.get("region")).cloned().unwrap_or(Value::Null),
            "platformId": region.as_ref().and_then(|r| r.get("webRegion")).cloned().unwrap_or(Value::Null),
        });
        if self.last_info.as_ref() == Some(&info) {
            return None;
        }
        self.last_info = Some(info.clone());
        Some(info)
    }

    /// Returns `Some(payload)` when the champ-select session changed
    /// (`Value::Null` means champ select ended).
    pub async fn poll(&mut self, client: &reqwest::Client, league_path: &str) -> Option<Value> {
        if self.creds.is_none() {
            if !self.lookup_due() {
                return None;
            }
            self.creds = self.lookup(league_path).await;
            self.creds.as_ref()?;
        }
        let creds = self.creds.clone()?;
        let auth = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", creds.token));
        let url = format!("https://127.0.0.1:{}/lol-champ-select/v1/session", creds.port);
        let resp = client
            .get(url)
            .header("Authorization", format!("Basic {auth}"))
            .send()
            .await;

        let session = match resp {
            Ok(r) if r.status().is_success() => r.json::<Value>().await.ok(),
            Ok(_) => None, // 404 => not in champ select
            Err(_) => {
                // Client closed or restarted: forget credentials.
                self.creds = None;
                None
            }
        };

        match session {
            Some(s) => {
                if self.last_session.as_ref() != Some(&s) {
                    self.last_session = Some(s.clone());
                    self.had_session = true;
                    return Some(s);
                }
                None
            }
            None => {
                self.last_session = None;
                if self.had_session {
                    self.had_session = false;
                    return Some(Value::Null);
                }
                None
            }
        }
    }
}

/// Authenticated access to the League client's local API (127.0.0.1 only), used by the
/// opt-in "Import to League" commands. Errors are human-readable.
pub struct LcuApi {
    client: reqwest::Client,
    creds: Credentials,
}

impl LcuApi {
    pub fn new(client: reqwest::Client, creds: Credentials) -> Self {
        Self { client, creds }
    }

    /// Find the League client's credentials (lockfile / process args). May spawn PowerShell.
    pub async fn discover(league_path: &str) -> Option<Credentials> {
        let path = league_path.to_string();
        tauri::async_runtime::spawn_blocking(move || find_credentials(&path)).await.ok().and_then(|l| l.creds)
    }

    pub async fn get(&self, path: &str) -> Result<Value, String> {
        self.request(reqwest::Method::GET, path, None).await
    }
    pub async fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        self.request(reqwest::Method::POST, path, Some(body)).await
    }
    pub async fn put(&self, path: &str, body: &Value) -> Result<Value, String> {
        self.request(reqwest::Method::PUT, path, Some(body)).await
    }
    pub async fn delete(&self, path: &str) -> Result<Value, String> {
        self.request(reqwest::Method::DELETE, path, None).await
    }

    async fn request(&self, method: reqwest::Method, path: &str, body: Option<&Value>) -> Result<Value, String> {
        let auth = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", self.creds.token));
        let mut req = self
            .client
            .request(method.clone(), format!("https://127.0.0.1:{}{}", self.creds.port, path))
            .header("Authorization", format!("Basic {auth}"))
            .header("Accept", "application/json");
        if let Some(b) = body {
            req = req.json(b);
        }
        let resp = req
            .send()
            .await
            .map_err(|_| "Couldn't reach the League client. Is it open and logged in?".to_string())?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(describe_error(status.as_u16(), &text, method.as_str(), path));
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
    }
}

/// Turn an LCU error response into a sentence a player can act on.
pub fn describe_error(status: u16, body: &str, method: &str, path: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("message").and_then(Value::as_str).map(str::to_string))
        .filter(|m| !m.trim().is_empty());
    let what = match status {
        401 | 403 => "The League client refused the request (not authorised). Restart Nexis after the client has fully started.".to_string(),
        404 => "The League client doesn't offer this right now (are you logged in?).".to_string(),
        _ => format!("The League client returned an error ({status}) for {method} {path}."),
    };
    match detail {
        Some(d) => format!("{what} Client said: {d}"),
        None => what,
    }
}

fn parse_lockfile(text: &str) -> Option<Credentials> {
    // name:pid:port:password:protocol
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() < 5 {
        return None;
    }
    Some(Credentials { port: parts[2].parse().ok()?, token: parts[3].to_string() })
}

/// Result of a credential lookup. `spawned` = a helper process (PowerShell / ps) had to run.
struct Lookup {
    creds: Option<Credentials>,
    spawned: bool,
}

fn read_lockfile(path: &std::path::Path) -> Option<Credentials> {
    parse_lockfile(&std::fs::read_to_string(path).ok()?)
}

fn find_credentials(league_path: &str) -> Lookup {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if !league_path.trim().is_empty() {
        candidates.push(std::path::Path::new(league_path.trim()).join("lockfile"));
    }
    candidates.push("C:\\Riot Games\\League of Legends\\lockfile".into());
    candidates.push("D:\\Riot Games\\League of Legends\\lockfile".into());
    candidates.push("/Applications/League of Legends.app/Contents/LoL/lockfile".into());

    for path in candidates {
        if let Some(c) = read_lockfile(&path) {
            return Lookup { creds: Some(c), spawned: false };
        }
    }
    // Not installed at a known spot: ask Windows for the running client's folder (a cheap
    // process-list query, no process spawn) and read the lockfile there.
    match client_process() {
        ClientProcess::NotRunning => Lookup { creds: None, spawned: false },
        ClientProcess::Running(Some(dir)) => match read_lockfile(&dir.join("lockfile")) {
            Some(c) => Lookup { creds: Some(c), spawned: false },
            None => Lookup { creds: None, spawned: false },
        },
        // No lockfile where we can see it: set the League folder in Settings. (No PowerShell /
        // command-line reading of the client: antivirus flags that pattern as credential theft.)
        ClientProcess::Running(None) | ClientProcess::Unknown => Lookup { creds: None, spawned: false },
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
enum ClientProcess {
    NotRunning,
    /// Running; the folder of its executable when it could be read (the lockfile lives there).
    Running(Option<std::path::PathBuf>),
    /// Couldn't tell (non-Windows, or the process list wasn't available).
    Unknown,
}

/// Is `LeagueClientUx.exe` running, and from which folder? Toolhelp snapshot + image path query:
/// read-only, no process spawned, well under a millisecond.
#[cfg(windows)]
fn client_process() -> ClientProcess {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return ClientProcess::Unknown;
        };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut pid = None;
        let mut more = Process32FirstW(snap, &mut entry).is_ok();
        while more {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            if String::from_utf16_lossy(&entry.szExeFile[..len]).eq_ignore_ascii_case("LeagueClientUx.exe") {
                pid = Some(entry.th32ProcessID);
                break;
            }
            more = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);
        let Some(pid) = pid else { return ClientProcess::NotRunning };
        let dir = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok().and_then(|h| {
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            ok.then(|| std::path::PathBuf::from(String::from_utf16_lossy(&buf[..len as usize])))
                .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf))
        });
        ClientProcess::Running(dir)
    }
}

#[cfg(not(windows))]
fn client_process() -> ClientProcess {
    ClientProcess::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_lockfile() {
        let c = parse_lockfile("LeagueClient:1234:54321:abcDEF:https").unwrap();
        assert_eq!(c.port, 54321);
        assert_eq!(c.token, "abcDEF");
    }
    #[test]
    fn describes_errors() {
        let e = describe_error(400, r#"{"errorCode":"RPC_ERROR","message":"Max pages reached"}"#, "POST", "/lol-perks/v1/pages");
        assert!(e.contains("400") && e.contains("Max pages reached"));
        assert!(describe_error(401, "", "GET", "/x").contains("not authorised"));
    }
}

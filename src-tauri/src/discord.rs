//! Optional Discord status ("Rich Presence"), off by default. Talks to the local Discord app over
//! its documented IPC pipe (`\\.\pipe\discord-ipc-N`); nothing goes over the network from Nexis.
//! Needs a Discord application ID the user creates on discord.com/developers (free).

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::sync::Mutex;

#[derive(Deserialize)]
pub struct Activity {
    details: Option<String>,
    state: Option<String>,
    /// Unix seconds the activity started (shows "elapsed").
    start: Option<i64>,
}

struct Conn {
    client_id: String,
    pipe: std::fs::File,
}

static CONN: Mutex<Option<Conn>> = Mutex::new(None);

fn frame(op: u32, payload: &Value) -> Vec<u8> {
    let body = payload.to_string().into_bytes();
    let mut out = Vec::with_capacity(8 + body.len());
    out.extend_from_slice(&op.to_le_bytes());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

fn read_frame(pipe: &mut std::fs::File) -> Result<(u32, Value), String> {
    let mut head = [0u8; 8];
    pipe.read_exact(&mut head).map_err(|e| e.to_string())?;
    let op = u32::from_le_bytes([head[0], head[1], head[2], head[3]]);
    let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
    if len > 64 * 1024 {
        return Err("Discord reply too large".into());
    }
    let mut body = vec![0u8; len];
    pipe.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok((op, serde_json::from_slice(&body).unwrap_or(Value::Null)))
}

#[cfg(windows)]
fn open_pipe() -> Result<std::fs::File, String> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{i}");
        if let Ok(f) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
            return Ok(f);
        }
    }
    Err("Discord isn't running".into())
}

#[cfg(not(windows))]
fn open_pipe() -> Result<std::fs::File, String> {
    Err("Discord status is only supported on Windows".into())
}

fn connect(client_id: &str) -> Result<Conn, String> {
    let mut pipe = open_pipe()?;
    pipe.write_all(&frame(0, &json!({ "v": 1, "client_id": client_id }))).map_err(|e| e.to_string())?;
    let (_, reply) = read_frame(&mut pipe)?;
    if reply.get("evt").and_then(Value::as_str) != Some("READY") {
        return Err(format!("Discord refused the connection: {}", reply.get("message").and_then(Value::as_str).unwrap_or("check the application ID")));
    }
    Ok(Conn { client_id: client_id.to_string(), pipe })
}

/// Never waits for the lock: if a previous update is stuck (Discord accepted the pipe but stopped
/// answering), this update is skipped instead of blocking. A poisoned lock is recovered.
fn lock_now() -> Result<std::sync::MutexGuard<'static, Option<Conn>>, String> {
    match CONN.try_lock() {
        Ok(g) => Ok(g),
        Err(std::sync::TryLockError::Poisoned(p)) => Ok(p.into_inner()),
        Err(std::sync::TryLockError::WouldBlock) => Err("Discord isn't answering; will retry".into()),
    }
}

fn send(client_id: &str, activity: Value) -> Result<(), String> {
    let mut guard = lock_now()?;
    if guard.as_ref().map(|c| c.client_id != client_id).unwrap_or(true) {
        *guard = Some(connect(client_id)?);
    }
    let payload = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)),
    });
    let conn = guard.as_mut().ok_or("not connected")?;
    let res = conn.pipe.write_all(&frame(1, &payload)).map_err(|e| e.to_string()).and_then(|_| read_frame(&mut conn.pipe).map(|_| ()));
    if res.is_err() {
        // Discord restarted / closed: reconnect on the next update.
        *guard = None;
    }
    res
}

/// Set (Some) or clear (None) the status shown on your Discord profile.
#[tauri::command]
pub async fn discord_set_activity(client_id: String, activity: Option<Activity>) -> Result<(), String> {
    let id = client_id.trim().to_string();
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Enter the numeric Discord application ID".into());
    }
    let value = match activity {
        None => Value::Null,
        Some(a) => {
            let mut v = json!({ "instance": false });
            if let Some(d) = a.details.filter(|s| !s.is_empty()) {
                v["details"] = json!(d.chars().take(120).collect::<String>());
            }
            if let Some(s) = a.state.filter(|s| !s.is_empty()) {
                v["state"] = json!(s.chars().take(120).collect::<String>());
            }
            if let Some(t) = a.start {
                v["timestamps"] = json!({ "start": t });
            }
            v
        }
    };
    tauri::async_runtime::spawn_blocking(move || send(&id, value)).await.map_err(|e| e.to_string())?
}

/// Drop the connection (clears the status: Discord removes it when the pipe closes). Async and
/// non-blocking, so a stuck Discord can never freeze the app's main thread.
#[tauri::command]
pub async fn discord_disconnect() {
    if let Ok(mut g) = lock_now() {
        *g = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frames_have_op_len_and_json() {
        let f = frame(1, &json!({ "a": 1 }));
        assert_eq!(&f[0..4], &1u32.to_le_bytes());
        assert_eq!(u32::from_le_bytes([f[4], f[5], f[6], f[7]]) as usize, f.len() - 8);
        assert_eq!(&f[8..], br#"{"a":1}"#);
    }
}

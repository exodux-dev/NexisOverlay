//! Polls Riot's official, read-only Live Client Data API (https://127.0.0.1:2999)
//! and the League Client's champ-select session. Nothing is ever written to the game.

use crate::{lcu, AppState};
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const LIVE_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

/// Poll intervals. In game the clock / gold / scoreboard need to stay fresh; idle polling only has
/// to notice the loading screen or champ select. When neither the game nor the League client has
/// been seen for a minute, idle polling slows down further.
const POLL_IN_GAME: Duration = Duration::from_millis(1500);
const POLL_IDLE: Duration = Duration::from_millis(3000);
const POLL_DORMANT: Duration = Duration::from_millis(6000);
const DORMANT_AFTER: Duration = Duration::from_secs(60);
/// An unchanged snapshot is still re-sent this often, so a window that (re)loaded meanwhile
/// (its listener registers only after the static data loaded) catches up.
const RESEND_UNCHANGED: Duration = Duration::from_secs(6);

/// Shared client for the game / League client local APIs. Building a TLS client is not free, so
/// it's built once and cloned (a clone shares the connection pool).
pub fn local_client() -> reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // The game & client serve localhost with a Riot self-signed certificate.
            // This client is only ever pointed at 127.0.0.1.
            reqwest::Client::builder()
                .danger_accept_invalid_certs(true)
                // Never send the LCU token through a system/env proxy or follow a redirect off
                // loopback with certificate checks disabled.
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_millis(2500))
                .build()
                .expect("http client")
        })
        .clone()
}

/// Sleep before the next poll (see the POLL_* constants).
fn poll_interval(in_game: bool, idle_for: Duration) -> Duration {
    if in_game {
        POLL_IN_GAME
    } else if idle_for >= DORMANT_AFTER {
        POLL_DORMANT
    } else {
        POLL_IDLE
    }
}

pub async fn run(app: AppHandle) {
    let client = local_client();
    let mut lcu = lcu::LcuWatcher::default();
    let mut was_in_game = false;
    let mut was_emitting = false;
    let mut in_champ_select = false;
    // Last payload sent to the UI: identical snapshots (loading screen, paused game) aren't re-sent.
    let mut last_emitted: Option<(Value, Instant)> = None;
    // Last time the game or the League client answered (for the dormant poll interval).
    let mut last_seen = Instant::now();
    let mut last_phase = String::new();

    loop {
        let (snapshot, answered, error): (Option<Value>, bool, Option<String>) = match client.get(LIVE_URL).send().await {
            Ok(r) if r.status().is_success() => match r.json::<Value>().await {
                Ok(v) => (Some(v), true, None),
                Err(e) => (None, true, Some(format!("unreadable response: {e}"))),
            },
            // 404 during the loading screen / spectating is normal; still record it.
            Ok(r) => (None, true, Some(format!("HTTP {}", r.status().as_u16()))),
            Err(e) => (None, false, (!e.is_connect()).then(|| e.to_string())),
        };
        // During the loading screen the API answers but has no active player yet.
        let in_game = snapshot
            .as_ref()
            .map(|v| v.get("activePlayer").map(|a| a.get("championStats").is_some()).unwrap_or(false))
            .unwrap_or(false);

        crate::diag::live_poll(answered, in_game, error);
        let state = app.state::<AppState>();
        state.in_game.store(in_game, Ordering::Relaxed);

        // During the loading screen the API already lists all 10 players (champions, Riot IDs):
        // forward that too so the app can show your champion and scout players before spawn.
        let has_players = snapshot
            .as_ref()
            .and_then(|v| v.get("allPlayers"))
            .and_then(|p| p.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        let emitting = in_game || has_players;
        if snapshot.is_some() {
            last_seen = Instant::now();
        }
        if let (true, Some(v)) = (emitting, snapshot) {
            let fresh = match &last_emitted {
                Some((prev, at)) => prev != &v || at.elapsed() >= RESEND_UNCHANGED,
                None => true,
            };
            if fresh {
                let _ = app.emit("live-game", &v);
                last_emitted = Some((v, Instant::now()));
            }
        } else if was_emitting {
            // Also covers loading screens that never turned into a game (dodge, crash, spectate).
            let _ = app.emit("live-game-ended", ());
            last_emitted = None;
        }
        was_emitting = emitting;
        if in_game != was_in_game {
            crate::sync_hud_visibility(&app);
            // Don't leave the overlay over the screen when you spawn.
            if in_game && state.flag("autoHideInGame", true) {
                crate::hide_main(&app);
            }
        }
        was_in_game = in_game;

        let league_path = state.league_path();
        if !in_game {
            if let Some(change) = lcu.poll(&client, &league_path).await {
                // Champ select just started: bring the overlay up (pick helper, builds).
                let started = !change.is_null() && !in_champ_select;
                in_champ_select = !change.is_null();
                if started && state.flag("autoShowChampSelect", true) {
                    // Default: a small view at the side that doesn't cover champ select (Expand
                    // for the full overlay). "Full overlay" setting = the old behaviour.
                    if state.flag("champSelectFull", false) {
                        crate::show_main(&app);
                    } else {
                        crate::show_main_mini(&app);
                    }
                }
                let _ = app.emit("champ-select", change);
            }
        }
        if let Some(info) = lcu.client_info(&client, &league_path).await {
            let phase = info.get("phase").and_then(Value::as_str).unwrap_or("").to_string();
            if phase != last_phase && !phase.is_empty() {
                crate::diag::lcu_phase(&phase);
            }
            last_phase = phase;
            let _ = app.emit("client-info", info);
        }
        // Share the client's credentials with the opt-in import commands (league_import.rs).
        if let (Some(found), Ok(mut slot)) = (lcu.credentials(), state.lcu_creds.lock()) {
            if slot.as_ref() != Some(&found) {
                *slot = Some(found);
            }
        }

        crate::diag::lcu_connected(lcu.credentials().is_some());
        if lcu.credentials().is_some() {
            last_seen = Instant::now();
        }

        tokio::time::sleep(poll_interval(in_game, last_seen.elapsed())).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn polls_slow_down_only_when_nothing_runs() {
        assert_eq!(poll_interval(true, Duration::from_secs(600)), POLL_IN_GAME);
        assert_eq!(poll_interval(false, Duration::from_secs(5)), POLL_IDLE);
        assert_eq!(poll_interval(false, DORMANT_AFTER), POLL_DORMANT);
    }
}

//! Opt-in "Import to League": writes the recommended rune page and build (as an Item Set) into
//! the League *client* through its local API (LCU), the same endpoints companion apps such as
//! Blitz / U.GG / Porofessor use. This is the only place Nexis writes anything, it is off by
//! default (Settings → League client) and it never touches the game process.
//!
//! Endpoints used:
//!   GET    /lol-perks/v1/pages, /lol-perks/v1/inventory
//!   DELETE /lol-perks/v1/pages/{id}            (only pages Nexis created: name "Nexis: …")
//!   POST   /lol-perks/v1/pages
//!   GET    /lol-summoner/v1/current-summoner
//!   GET    /lol-item-sets/v1/item-sets/{summonerId}/sets
//!   PUT    /lol-item-sets/v1/item-sets/{summonerId}/sets

use crate::{lcu, live, AppState};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// Prefix that marks rune pages / item sets created by Nexis (only those are ever replaced).
pub const PREFIX: &str = "Nexis:";

// ---------------------------------------------------------------- pure payload builders

/// Ensure the name starts with "Nexis:" and fits the client's limits.
pub fn nexis_name(name: &str) -> String {
    let n = name.trim();
    let full = if n.starts_with(PREFIX) {
        n.to_string()
    } else if n.is_empty() {
        format!("{PREFIX} Recommended")
    } else {
        format!("{PREFIX} {n}")
    };
    full.chars().take(50).collect()
}

fn is_nexis(title: Option<&str>) -> bool {
    title.map(|t| t.trim_start().starts_with(PREFIX)).unwrap_or(false)
}

/// Validate a rune page: 9 perks (4 primary + 2 secondary + 3 shards), two distinct trees.
pub fn validate_runes(primary: u32, sub: u32, perks: &[u32]) -> Result<(), String> {
    if primary == 0 || sub == 0 {
        return Err("The rune page is missing its primary or secondary tree.".into());
    }
    if primary == sub {
        return Err("The primary and secondary rune trees must be different.".into());
    }
    if perks.len() != 9 {
        return Err(format!(
            "A rune page needs 9 runes (4 primary, 2 secondary, 3 shards); got {}.",
            perks.len()
        ));
    }
    if perks.contains(&0) {
        return Err("The rune page contains an empty rune slot.".into());
    }
    Ok(())
}

pub fn rune_page_payload(name: &str, primary: u32, sub: u32, perks: &[u32]) -> Value {
    json!({
        "name": nexis_name(name),
        "primaryStyleId": primary,
        "subStyleId": sub,
        "selectedPerkIds": perks,
        "current": true,
    })
}

/// Decide which pages to delete before creating ours. Returns the ids of existing Nexis pages
/// (replaced), or an error when there is no free slot and no Nexis page to replace.
/// `owned` is the account's page limit (/lol-perks/v1/inventory ownedPageCount), if known.
pub fn rune_pages_to_replace(pages: &Value, owned: Option<u64>) -> Result<Vec<u64>, String> {
    let list = pages.as_array().cloned().unwrap_or_default();
    let custom: Vec<&Value> = list.iter().filter(|p| p.get("isDeletable").and_then(Value::as_bool).unwrap_or(false)).collect();
    let ours: Vec<u64> = custom
        .iter()
        .filter(|p| is_nexis(p.get("name").and_then(Value::as_str)))
        .filter_map(|p| p.get("id").and_then(Value::as_u64))
        .collect();
    if !ours.is_empty() {
        return Ok(ours);
    }
    if let Some(limit) = owned {
        if custom.len() as u64 >= limit {
            return Err(format!(
                "No free rune page — delete one or let Nexis replace one named '{PREFIX} …' (rename any page to start with \"{PREFIX}\")."
            ));
        }
    }
    Ok(Vec::new())
}

/// Parse and validate the item-set blocks coming from the UI:
/// `[{ "type": "Core build", "items": [{ "id": "3089", "count": 1 }] }]`.
pub fn parse_blocks(blocks_json: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(blocks_json).map_err(|e| format!("Invalid item set data: {e}"))?;
    let blocks = v.as_array().ok_or("Invalid item set data: expected a list of blocks.")?;
    if blocks.is_empty() {
        return Err("The build has no items to import yet.".into());
    }
    let mut out = Vec::new();
    for b in blocks {
        let title = b.get("type").and_then(Value::as_str).unwrap_or("Items");
        let items = b.get("items").and_then(Value::as_array).ok_or("Invalid item set data: a block has no items.")?;
        let mut clean = Vec::new();
        for it in items {
            let id = match it.get("id") {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Number(n)) => n.to_string(),
                _ => return Err("Invalid item set data: an item has no id.".into()),
            };
            if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
                return Err(format!("Invalid item id '{id}'."));
            }
            let count = it.get("count").and_then(Value::as_u64).unwrap_or(1).clamp(1, 99);
            clean.push(json!({ "id": id, "count": count }));
        }
        if !clean.is_empty() {
            out.push(json!({ "type": title.chars().take(60).collect::<String>(), "items": clean }));
        }
    }
    if out.is_empty() {
        return Err("The build has no items to import yet.".into());
    }
    Ok(Value::Array(out))
}

pub fn item_set_entry(champion_key: u32, title: &str, blocks: Value, uid: &str) -> Value {
    json!({
        "title": nexis_name(title),
        "type": "custom",
        "map": "any",
        "mode": "any",
        "associatedChampions": [champion_key],
        "associatedMaps": [],
        "blocks": blocks,
        "sortrank": 0,
        "priority": false,
        "startedFrom": "blank",
        "preferredItemSlots": [],
        "uid": uid,
    })
}

/// Remove previous Nexis sets from the GET response and append ours (other sets untouched).
/// The PUT replaces the account's whole list, so an unexpected GET response (empty body, not
/// JSON, no `itemSets` list) is an error: writing `{itemSets:[ours]}` would wipe the user's sets.
pub fn merge_item_sets(mut existing: Value, entry: Value) -> Result<Value, String> {
    let current = existing
        .get("itemSets")
        .and_then(Value::as_array)
        .cloned()
        .ok_or("The League client didn't return your item sets; nothing was changed.")?;
    let mut sets: Vec<Value> = current
        .into_iter()
        .filter(|s| !is_nexis(s.get("title").and_then(Value::as_str)))
        .collect();
    sets.push(entry);
    existing["itemSets"] = Value::Array(sets);
    Ok(existing)
}

/// Random-enough v4-style UUID (no extra crates): time + address entropy through splitmix64.
pub fn make_uid() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let stack = &nanos as *const u64 as u64;
    let mut x = nanos ^ stack.rotate_left(17) ^ n.wrapping_mul(0xA24B_AED4_963E_E407);
    let mut next = || {
        x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = x;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    };
    let (a, b) = (next(), next());
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        (a & 0x0fff) as u16,
        ((b >> 48) as u16 & 0x3fff) | 0x8000,
        b & 0xffff_ffff_ffff
    )
}

// ---------------------------------------------------------------- commands

fn import_settings(state: &AppState) -> (bool, bool) {
    let s = state.settings.lock().ok().and_then(|s| s.get("leagueImport").cloned()).unwrap_or(Value::Null);
    let on = |k: &str| s.get(k).and_then(Value::as_bool).unwrap_or(false);
    (on("runes"), on("itemSets"))
}

/// Authenticated LCU access: credentials found by the champ-select watcher, else a fresh lookup.
/// `discover` = look the client up now if the watcher hasn't found it (may spawn PowerShell).
async fn api(app: &AppHandle, discover: bool) -> Result<lcu::LcuApi, String> {
    let state = app.state::<AppState>();
    let cached = state.lcu_creds.lock().ok().and_then(|c| c.clone());
    let creds = match cached {
        Some(c) => c,
        None if !discover => return Err("The League client isn't running.".into()),
        None => {
            let found = lcu::LcuApi::discover(&state.league_path()).await;
            if let (Some(c), Ok(mut slot)) = (&found, state.lcu_creds.lock()) {
                *slot = Some(c.clone());
            }
            found.ok_or("The League client isn't running (or Nexis couldn't find it — set the League folder in Settings).")?
        }
    };
    Ok(lcu::LcuApi::new(live::local_client(), creds))
}

#[tauri::command]
pub async fn lcu_status(app: AppHandle) -> Value {
    // Cheap: only uses credentials the champ-select watcher already found (no process lookup).
    let connected = match api(&app, false).await {
        Ok(api) => api.get("/lol-summoner/v1/current-summoner").await.is_ok(),
        Err(_) => false,
    };
    if !connected {
        // Client closed or restarted (new port/token): look the credentials up again next time.
        if let Ok(mut slot) = app.state::<AppState>().lcu_creds.lock() {
            *slot = None;
        }
    }
    json!({ "connected": connected })
}

#[tauri::command]
pub async fn lcu_apply_runes(app: AppHandle, name: String, primary: u32, sub: u32, perks: Vec<u32>) -> Result<(), String> {
    if !import_settings(&app.state::<AppState>()).0 {
        return Err("Rune import is turned off (Settings → League client).".into());
    }
    validate_runes(primary, sub, &perks)?;
    let api = api(&app, true).await?;
    let pages = api.get("/lol-perks/v1/pages").await?;
    let owned = api
        .get("/lol-perks/v1/inventory")
        .await
        .ok()
        .and_then(|v| v.get("ownedPageCount").and_then(Value::as_u64));
    for id in rune_pages_to_replace(&pages, owned)? {
        api.delete(&format!("/lol-perks/v1/pages/{id}")).await?;
    }
    api.post("/lol-perks/v1/pages", &rune_page_payload(&name, primary, sub, &perks))
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn lcu_apply_item_set(app: AppHandle, champion_key: u32, title: String, blocks_json: String) -> Result<(), String> {
    if !import_settings(&app.state::<AppState>()).1 {
        return Err("Item set import is turned off (Settings → League client).".into());
    }
    if champion_key == 0 {
        return Err("No champion selected.".into());
    }
    let blocks = parse_blocks(&blocks_json)?;
    let api = api(&app, true).await?;
    let me = api.get("/lol-summoner/v1/current-summoner").await?;
    let summoner = me
        .get("summonerId")
        .and_then(Value::as_u64)
        .ok_or("The League client didn't report your summoner (are you logged in?).")?;
    let path = format!("/lol-item-sets/v1/item-sets/{summoner}/sets");
    let existing = api.get(&path).await?;
    let merged = merge_item_sets(existing, item_set_entry(champion_key, &title, blocks, &make_uid()))?;
    api.put(&path, &merged).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_prefixed_and_capped() {
        assert_eq!(nexis_name("Ahri"), "Nexis: Ahri");
        assert_eq!(nexis_name("Nexis: Ahri"), "Nexis: Ahri");
        assert_eq!(nexis_name(""), "Nexis: Recommended");
        assert!(nexis_name(&"x".repeat(200)).chars().count() <= 50);
    }

    #[test]
    fn validates_rune_input() {
        let ok = [8112, 8139, 8138, 8135, 8226, 8210, 5008, 5008, 5001];
        assert!(validate_runes(8100, 8200, &ok).is_ok());
        assert!(validate_runes(8100, 8100, &ok).is_err());
        assert!(validate_runes(8100, 8200, &ok[..6]).unwrap_err().contains("9 runes"));
        assert!(validate_runes(0, 8200, &ok).is_err());
        let p = rune_page_payload("Ahri", 8100, 8200, &ok);
        assert_eq!(p["name"], "Nexis: Ahri");
        assert_eq!(p["selectedPerkIds"].as_array().unwrap().len(), 9);
        assert_eq!(p["current"], true);
        assert_eq!(p["primaryStyleId"], 8100);
    }

    #[test]
    fn replaces_only_nexis_pages() {
        let pages = json!([
            { "id": 1, "name": "Domination", "isDeletable": false },
            { "id": 50, "name": "My page", "isDeletable": true },
            { "id": 51, "name": "Nexis: Lux", "isDeletable": true },
        ]);
        assert_eq!(rune_pages_to_replace(&pages, Some(2)).unwrap(), vec![51]);
        let full = json!([{ "id": 50, "name": "My page", "isDeletable": true }, { "id": 52, "name": "Other", "isDeletable": true }]);
        assert!(rune_pages_to_replace(&full, Some(2)).unwrap_err().contains("No free rune page"));
        assert!(rune_pages_to_replace(&full, Some(3)).unwrap().is_empty());
        assert!(rune_pages_to_replace(&full, None).unwrap().is_empty());
    }

    #[test]
    fn parses_and_validates_blocks() {
        let b = parse_blocks(r#"[{"type":"Core build","items":[{"id":"3089","count":1},{"id":3020}]}]"#).unwrap();
        assert_eq!(b[0]["items"][1]["id"], "3020");
        assert_eq!(b[0]["items"][1]["count"], 1);
        assert!(parse_blocks("[]").is_err());
        assert!(parse_blocks("nope").is_err());
        assert!(parse_blocks(r#"[{"type":"x","items":[{"id":"30a9"}]}]"#).is_err());
    }

    #[test]
    fn merges_item_sets() {
        let existing = json!({
            "accountId": 7,
            "timestamp": 1,
            "itemSets": [{ "title": "Nexis: old", "uid": "a" }, { "title": "Mine", "uid": "b" }],
        });
        let blocks = parse_blocks(r#"[{"type":"Core build","items":[{"id":"3089"}]}]"#).unwrap();
        let entry = item_set_entry(103, "Ahri", blocks, "uid-1");
        assert_eq!(entry["associatedChampions"], json!([103]));
        assert_eq!(entry["map"], "any");
        let merged = merge_item_sets(existing, entry).unwrap();
        let sets = merged["itemSets"].as_array().unwrap();
        assert_eq!(sets.len(), 2);
        assert_eq!(sets[0]["title"], "Mine");
        assert_eq!(sets[1]["title"], "Nexis: Ahri");
        assert_eq!(merged["accountId"], 7);
        // Unexpected GET responses never turn into a PUT that would wipe the user's sets.
        assert!(merge_item_sets(Value::Null, json!({"title":"Nexis: x"})).is_err());
        assert!(merge_item_sets(json!({"accountId": 7}), json!({"title":"Nexis: x"})).is_err());
        let empty = merge_item_sets(json!({"accountId": 7, "itemSets": []}), json!({"title":"Nexis: x"})).unwrap();
        assert_eq!(empty["itemSets"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn uids_look_like_uuids() {
        let u = make_uid();
        assert_eq!(u.len(), 36);
        assert_eq!(u.matches('-').count(), 4);
        assert_ne!(make_uid(), make_uid());
    }
}

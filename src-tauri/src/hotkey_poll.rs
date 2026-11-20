//! Hotkeys that keep working while League has focus.
//!
//! League registers its keyboard as a Raw Input device with `RIDEV_NOHOTKEYS`, which makes
//! Windows drop application hotkeys (`RegisterHotKey`) while the game window is focused.
//! So, in addition to normal global shortcuts, we poll the physical key state with
//! `GetAsyncKeyState` every 25 ms. This reads nothing from the game, installs no hooks and
//! sends no input — it only asks Windows whether the configured keys are currently held.

#[allow(unused_imports)] // Modifiers is only used by the Windows key check and tests.
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

/// Windows virtual-key code for a key in a shortcut (None = unsupported key).
pub fn vk_for(code: &Code) -> Option<i32> {
    let name = format!("{code:?}");
    if let Some(c) = name.strip_prefix("Key") {
        let ch = c.chars().next()?;
        if c.len() == 1 && ch.is_ascii_uppercase() {
            return Some(ch as i32);
        }
    }
    if let Some(d) = name.strip_prefix("Digit") {
        return d.parse::<i32>().ok().filter(|n| (0..=9).contains(n)).map(|n| 0x30 + n);
    }
    if let Some(d) = name.strip_prefix("Numpad") {
        if let Ok(n) = d.parse::<i32>() {
            return (0..=9).contains(&n).then_some(0x60 + n);
        }
    }
    if let Some(f) = name.strip_prefix('F') {
        if let Ok(n) = f.parse::<i32>() {
            return (1..=24).contains(&n).then_some(0x6F + n);
        }
    }
    Some(match name.as_str() {
        "Space" => 0x20,
        "Tab" => 0x09,
        "Enter" => 0x0D,
        "Escape" => 0x1B,
        "Backspace" => 0x08,
        "Backquote" => 0xC0,
        "Minus" => 0xBD,
        "Equal" => 0xBB,
        "BracketLeft" => 0xDB,
        "BracketRight" => 0xDD,
        "Backslash" => 0xDC,
        "Semicolon" => 0xBA,
        "Quote" => 0xDE,
        "Comma" => 0xBC,
        "Period" => 0xBE,
        "Slash" => 0xBF,
        "ArrowLeft" => 0x25,
        "ArrowUp" => 0x26,
        "ArrowRight" => 0x27,
        "ArrowDown" => 0x28,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "Insert" => 0x2D,
        "Delete" => 0x2E,
        "Pause" => 0x13,
        "ScrollLock" => 0x91,
        _ => return None,
    })
}

#[cfg(windows)]
fn down(vk: i32) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

/// Is exactly this combination held right now (required modifiers down, others up)?
#[cfg(windows)]
pub fn is_held(sc: &Shortcut) -> bool {
    let Some(vk) = vk_for(&sc.key) else { return false };
    if !down(vk) {
        return false;
    }
    let want = |m: Modifiers| sc.mods.contains(m);
    let ctrl = down(0x11);
    let shift = down(0x10);
    let alt = down(0x12);
    let win = down(0x5B) || down(0x5C);
    ctrl == want(Modifiers::CONTROL) && shift == want(Modifiers::SHIFT) && alt == want(Modifiers::ALT) && win == (want(Modifiers::SUPER) || want(Modifiers::META))
}

#[cfg(not(windows))]
pub fn is_held(_sc: &Shortcut) -> bool {
    false
}

/// Is this virtual key held right now (used for Esc while the HUD layout editor is open)?
#[cfg(windows)]
pub fn vk_down(vk: i32) -> bool {
    down(vk)
}
#[cfg(not(windows))]
pub fn vk_down(_vk: i32) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_common_keys() {
        assert_eq!(vk_for(&Code::KeyX), Some(0x58));
        assert_eq!(vk_for(&Code::Space), Some(0x20));
        assert_eq!(vk_for(&Code::Digit7), Some(0x37));
        assert_eq!(vk_for(&Code::F9), Some(0x78));
        assert_eq!(vk_for(&Code::Numpad3), Some(0x63));
        assert_eq!(vk_for(&Code::Backquote), Some(0xC0));
        let sc: Shortcut = "Ctrl+Shift+Space".parse().unwrap();
        assert!(sc.mods.contains(Modifiers::CONTROL) && sc.mods.contains(Modifiers::SHIFT));
        assert_eq!(vk_for(&sc.key), Some(0x20));
    }
}

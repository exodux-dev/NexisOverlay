//! Opt-in "Launch with Windows": a per-user `Run` registry value pointing at this exe.
//! Nothing is written unless the user turns the setting on; turning it off deletes the value.

#[cfg(windows)]
mod imp {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ};

    const RUN: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    const NAME: PCWSTR = w!("NexisOverlay");

    fn command() -> Option<String> {
        let exe = std::env::current_exe().ok()?;
        Some(format!("\"{}\"", exe.display()))
    }

    /// The command currently registered, if any.
    pub fn current() -> Option<String> {
        unsafe {
            let mut buf = vec![0u16; 1024];
            let mut len = (buf.len() * 2) as u32;
            let r = RegGetValueW(HKEY_CURRENT_USER, RUN, NAME, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut len));
            if r != ERROR_SUCCESS {
                return None;
            }
            let n = (len as usize / 2).saturating_sub(1);
            Some(String::from_utf16_lossy(&buf[..n.min(buf.len())]))
        }
    }

    pub fn set(on: bool) -> Result<(), String> {
        unsafe {
            if on {
                let cmd = command().ok_or("couldn't find the app's location")?;
                let wide: Vec<u16> = cmd.encode_utf16().chain(std::iter::once(0)).collect();
                let r = RegSetKeyValueW(HKEY_CURRENT_USER, RUN, NAME, REG_SZ.0, Some(wide.as_ptr().cast()), (wide.len() * 2) as u32);
                if r != ERROR_SUCCESS {
                    return Err(format!("registry write failed ({})", r.0));
                }
            } else if current().is_some() {
                let r = RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN, NAME);
                if r != ERROR_SUCCESS {
                    return Err(format!("registry delete failed ({})", r.0));
                }
            }
            Ok(())
        }
    }

    /// The portable folder may have moved: re-point an existing entry at this exe.
    pub fn refresh() {
        if let (Some(cur), Some(want)) = (current(), command()) {
            if cur != want {
                let _ = set(true);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn current() -> Option<String> {
        None
    }
    pub fn set(_on: bool) -> Result<(), String> {
        Err("Launch with Windows is only available on Windows".into())
    }
    pub fn refresh() {}
}

pub use imp::refresh;

#[tauri::command]
pub fn get_autostart() -> bool {
    imp::current().is_some()
}

#[tauri::command]
pub fn set_autostart(on: bool) -> Result<bool, String> {
    imp::set(on)?;
    Ok(imp::current().is_some())
}

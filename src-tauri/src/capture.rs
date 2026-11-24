//! On-demand screen capture + OCR of the augment selection cards.
//!
//! Passive and Vanguard-friendly: it takes a screenshot of the monitor (the same
//! way OBS / Discord / the Snipping Tool do) only when you press the scan hotkey,
//! then runs Windows' built-in OCR engine on it. Nothing is injected or read from
//! game memory, and no extra OCR model is bundled (keeps memory tiny).

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Region {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Default for Region {
    /// The band where ARAM Mayhem shows its augment cards (fractions of the screen).
    fn default() -> Self {
        Region { x: 0.14, y: 0.16, w: 0.72, h: 0.46 }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct OcrLine {
    pub text: String,
    /// Bounding box, normalised 0..1 relative to the scanned region.
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanResult {
    pub lines: Vec<OcrLine>,
    pub width: u32,
    pub height: u32,
    pub millis: u128,
    /// Debug scans only (Settings → Diagnostics → Test augment detection): a downscaled PNG of the
    /// whole screen as a data URL, so the user can see where the scan region sits. Never stored.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    /// Size of the captured monitor in pixels (debug scans only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen: Option<(u32, u32)>,
}

/// Width of the debug preview image.
#[cfg_attr(not(windows), allow(dead_code))]
pub const PREVIEW_WIDTH: u32 = 960;

#[cfg(windows)]
pub fn scan(region: Region, debug: bool) -> Result<ScanResult, String> {
    use image::imageops;
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;

    let started = std::time::Instant::now();
    unsafe {
        // Make sure this worker thread can activate WinRT classes.
        let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
    }

    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or("no monitor found")?;
    // Capture only the card band instead of the whole screen and cropping afterwards: this runs
    // every ~0.6 s while auto-detect is on, and a full 4K grab is ~33 MB per shot.
    let (mw, mh) = (monitor.width().map_err(|e| e.to_string())?, monitor.height().map_err(|e| e.to_string())?);
    let (x, y, w, h) = crop_rect(region, mw, mh);
    let full_crop = |preview: &mut Option<String>, screen: &mut Option<(u32, u32)>| -> Result<image::RgbaImage, String> {
        let shot = monitor.capture_image().map_err(|e| e.to_string())?;
        if debug {
            *screen = Some((shot.width(), shot.height()));
            *preview = Some(preview_png(&shot)?);
        }
        let (x, y, w, h) = crop_rect(region, shot.width(), shot.height());
        Ok(imageops::crop_imm(&shot, x, y, w, h).to_image())
    };
    let (mut preview, mut screen) = (None, None);
    let mut crop = if debug {
        // Debug: one full shot (for the preview) and the region cropped out of it.
        full_crop(&mut preview, &mut screen)?
    } else {
        match monitor.capture_region(x, y, w, h) {
            Ok(img) => img,
            // Fallback (e.g. a capture backend that rejects regions): full shot, then crop.
            Err(_) => full_crop(&mut preview, &mut screen)?,
        }
    };

    let max_dim = OcrEngine::MaxImageDimension().map_err(|e| e.to_string())?;
    if crop.width() > max_dim || crop.height() > max_dim {
        let scale = max_dim as f32 / crop.width().max(crop.height()) as f32;
        crop = imageops::resize(
            &crop,
            (crop.width() as f32 * scale) as u32,
            (crop.height() as f32 * scale) as u32,
            imageops::FilterType::Triangle,
        );
    }
    let (cw, ch) = (crop.width(), crop.height());

    // RGBA -> BGRA for SoftwareBitmap.
    let mut bgra = crop.into_raw();
    for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2);
    }

    let writer = DataWriter::new().map_err(|e| e.to_string())?;
    writer.WriteBytes(&bgra).map_err(|e| e.to_string())?;
    let buffer = writer.DetachBuffer().map_err(|e| e.to_string())?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, cw as i32, ch as i32)
        .map_err(|e| e.to_string())?;

    let engine = ocr_engine()?;

    // The engine is shared: a manual / debug scan can overlap an auto-detect scan, so one
    // recognition runs at a time (each takes ~50 ms; this runs on the blocking pool).
    static RECOGNIZE: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let result = {
        let _guard = RECOGNIZE.lock().unwrap_or_else(|e| e.into_inner());
        engine
            .RecognizeAsync(&bitmap)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?
    };

    let mut lines = Vec::new();
    for line in result.Lines().map_err(|e| e.to_string())? {
        let text = line.Text().map_err(|e| e.to_string())?.to_string();
        let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for word in line.Words().map_err(|e| e.to_string())? {
            let r = word.BoundingRect().map_err(|e| e.to_string())?;
            x0 = x0.min(r.X);
            y0 = y0.min(r.Y);
            x1 = x1.max(r.X + r.Width);
            y1 = y1.max(r.Y + r.Height);
        }
        if x0 == f32::MAX {
            continue;
        }
        lines.push(OcrLine {
            text,
            x: x0 / cw as f32,
            y: y0 / ch as f32,
            w: (x1 - x0) / cw as f32,
            h: (y1 - y0) / ch as f32,
        });
    }

    Ok(ScanResult { lines, width: cw, height: ch, millis: started.elapsed().as_millis(), preview, screen })
}

/// Downscaled PNG (data URL) of a screenshot, for the calibration preview.
#[cfg(windows)]
fn preview_png(shot: &image::RgbaImage) -> Result<String, String> {
    use base64::Engine;
    use image::{imageops, ExtendedColorType, ImageEncoder};
    let scale = (PREVIEW_WIDTH as f32 / shot.width().max(1) as f32).min(1.0);
    let (pw, ph) = (((shot.width() as f32 * scale) as u32).max(1), ((shot.height() as f32 * scale) as u32).max(1));
    let small = imageops::resize(shot, pw, ph, imageops::FilterType::Triangle);
    let rgb: Vec<u8> = small.pixels().flat_map(|p| [p[0], p[1], p[2]]).collect();
    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
        .write_image(&rgb, pw, ph, ExtendedColorType::Rgb8)
        .map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
}

/// The OCR engine is created once and reused (creating it loads the language model each time).
/// `OcrEngine` is an agile WinRT object, usable from any of the blocking-pool threads.
#[cfg(windows)]
fn ocr_engine() -> Result<windows::Media::Ocr::OcrEngine, String> {
    use std::sync::Mutex;
    use windows::Globalization::Language;
    use windows::Media::Ocr::OcrEngine;
    static ENGINE: Mutex<Option<OcrEngine>> = Mutex::new(None);
    let mut slot = ENGINE.lock().map_err(|e| e.to_string())?;
    if let Some(e) = slot.as_ref() {
        return Ok(e.clone());
    }
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .or_else(|_| {
            let lang = Language::CreateLanguage(&windows::core::HSTRING::from("en-US"))?;
            OcrEngine::TryCreateFromLanguage(&lang)
        })
        .map_err(|e| format!("Windows OCR unavailable ({e}). Install an OCR language pack in Windows Settings."))?;
    *slot = Some(engine.clone());
    Ok(engine)
}

#[cfg_attr(not(windows), allow(dead_code))]
/// Pixel rectangle (x, y, w, h) of `region` on a `sw` x `sh` screen, always inside it and non-empty.
pub fn crop_rect(region: Region, sw: u32, sh: u32) -> (u32, u32, u32, u32) {
    let (fw, fh) = (sw as f32, sh as f32);
    let x = ((region.x.clamp(0.0, 1.0) * fw) as u32).min(sw.saturating_sub(1));
    let y = ((region.y.clamp(0.0, 1.0) * fh) as u32).min(sh.saturating_sub(1));
    let w = ((region.w.clamp(0.05, 1.0) * fw) as u32).min(sw - x).max(1);
    let h = ((region.h.clamp(0.05, 1.0) * fh) as u32).min(sh - y).max(1);
    (x, y, w, h)
}

#[cfg(not(windows))]
pub fn scan(_region: Region, _debug: bool) -> Result<ScanResult, String> {
    Err("Screen scanning uses the built-in Windows OCR engine and is only available on Windows. Pick your augments manually instead.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crop_rect_stays_on_screen() {
        assert_eq!(crop_rect(Region::default(), 1920, 1080), (268, 172, 1382, 496));
        let edge = Region { x: 1.0, y: 1.0, w: 1.0, h: 1.0 };
        let (x, y, w, h) = crop_rect(edge, 1920, 1080);
        assert!(x + w <= 1920 && y + h <= 1080 && w >= 1 && h >= 1);
    }
}

//! Aufnahmedaten (EXIF) lesen.

use serde::Serialize;
use std::fs::File;
use std::io::{Cursor, Read};
use std::path::Path;

pub const RAW_EXT: &[&str] = &[
    "cr3", "cr2", "crw", "nef", "nrw", "arw", "srf", "sr2", "raf", "orf", "rw2", "dng", "pef",
    "srw", "x3f", "3fr", "iiq",
];
pub const MAIN_EXT: &[&str] = &["jpg", "jpeg", "png", "tif", "tiff"];
pub const VIDEO_EXT: &[&str] = &[
    "mp4", "mov", "avi", "mkv", "mts", "m2ts", "m4v", "wmv", "3gp",
];

pub fn ext_lower(p: &Path) -> String {
    p.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

pub fn is_raw(p: &Path) -> bool {
    RAW_EXT.contains(&ext_lower(p).as_str())
}

/// Liest höchstens `limit` Bytes vom Anfang einer Datei.
pub fn read_head(path: &Path, limit: u64) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    File::open(path)?.take(limit).read_to_end(&mut buf)?;
    Ok(buf)
}

pub fn exif_from_bytes(buf: Vec<u8>) -> Option<exif::Exif> {
    let mut cur = Cursor::new(buf);
    exif::Reader::new().read_from_container(&mut cur).ok()
}

/// EXIF einer Datei lesen. Es wird nur der Dateianfang gelesen, das geht schnell.
pub fn read_exif(path: &Path) -> Option<exif::Exif> {
    let limit = if is_raw(path) {
        4 * 1024 * 1024
    } else {
        1024 * 1024
    };
    exif_from_bytes(read_head(path, limit).ok()?)
}

fn ascii(e: &exif::Exif, tag: exif::Tag) -> Option<String> {
    let f = e.get_field(tag, exif::In::PRIMARY)?;
    match f.value {
        exif::Value::Ascii(ref v) => v
            .first()
            .map(|s| {
                String::from_utf8_lossy(s)
                    .trim_matches(char::from(0))
                    .trim()
                    .to_string()
            })
            .filter(|s| !s.is_empty()),
        _ => None,
    }
}

fn shown(e: &exif::Exif, tag: exif::Tag) -> Option<String> {
    let f = e.get_field(tag, exif::In::PRIMARY)?;
    Some(f.display_value().with_unit(e).to_string())
}

fn uint(e: &exif::Exif, tag: exif::Tag) -> Option<u32> {
    e.get_field(tag, exif::In::PRIMARY)?.value.get_uint(0)
}

/// Aufnahmezeit im Format "JJJJ:MM:TT HH:MM:SS" (lässt sich direkt sortieren).
pub fn taken(e: &exif::Exif) -> Option<String> {
    ascii(e, exif::Tag::DateTimeOriginal).or_else(|| ascii(e, exif::Tag::DateTime))
}

/// EXIF-Ausrichtung (1 = normal, 6 = 90° im Uhrzeigersinn, 3 = 180°, 8 = 270°).
pub fn orientation(e: &exif::Exif) -> u32 {
    uint(e, exif::Tag::Orientation).unwrap_or(1)
}

pub fn orientation_to_deg(o: u32) -> i32 {
    match o {
        3 | 4 => 180,
        5 | 6 => 90,
        7 | 8 => 270,
        _ => 0,
    }
}

#[derive(Serialize, Default)]
pub struct Info {
    pub fnumber: Option<String>,
    pub exposure: Option<String>,
    pub iso: Option<String>,
    pub focal: Option<String>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub taken: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub fn info_from(e: &exif::Exif) -> Info {
    let make = ascii(e, exif::Tag::Make);
    let model = ascii(e, exif::Tag::Model);
    let camera = match (make, model) {
        (Some(ma), Some(mo)) if mo.to_lowercase().starts_with(&ma.to_lowercase()) => Some(mo),
        (Some(ma), Some(mo)) => Some(format!("{ma} {mo}")),
        (a, b) => a.or(b),
    };
    Info {
        fnumber: shown(e, exif::Tag::FNumber),
        exposure: shown(e, exif::Tag::ExposureTime),
        iso: shown(e, exif::Tag::PhotographicSensitivity),
        focal: shown(e, exif::Tag::FocalLength),
        camera,
        lens: ascii(e, exif::Tag::LensModel),
        taken: taken(e),
        width: uint(e, exif::Tag::PixelXDimension),
        height: uint(e, exif::Tag::PixelYDimension),
    }
}

/// Wandelt eine Systemzeit in "JJJJ:MM:TT HH:MM:SS" (UTC) um – Ersatz, wenn EXIF fehlt.
pub fn system_time_string(t: std::time::SystemTime) -> String {
    let secs = t
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Algorithmus "civil_from_days" von Howard Hinnant
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}:{:02}:{:02} {:02}:{:02}:{:02}",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

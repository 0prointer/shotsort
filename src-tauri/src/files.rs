//! Löschen (über einen Zwischenordner, damit Rückgängig überall funktioniert),
//! Papierkorb, Ordnerprüfung und Speichern von Einstellungen.

use crate::copy::io_msg;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Name des Zwischenordners im Quellordner. Beginnt mit einem Punkt und wird beim Einlesen ignoriert.
pub const STAGING: &str = ".shotsort-papierkorb";

#[derive(Serialize, Deserialize, Clone)]
pub struct Move {
    pub from: String,
    pub to: String,
}

/// "Löschen": Dateien in den Zwischenordner verschieben. Das geht sofort und lässt sich rückgängig machen.
/// Beim Beenden der Sitzung wandern sie in den echten Papierkorb des Systems.
pub fn stage_delete(root: &Path, files: &[String]) -> Result<Vec<Move>, String> {
    let staging = root.join(STAGING);
    let mut moves = vec![];
    for f in files {
        let from = PathBuf::from(f);
        let rel = from
            .strip_prefix(root)
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|_| PathBuf::from(from.file_name().unwrap_or_default()));
        let to = staging.join(rel);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| io_msg(&e))?;
        }
        if let Err(e) = fs::rename(&from, &to) {
            // bereits verschobene Dateien zurückholen
            let _ = restore(&moves);
            return Err(io_msg(&e));
        }
        moves.push(Move {
            from: f.clone(),
            to: to.to_string_lossy().to_string(),
        });
    }
    Ok(moves)
}

pub fn restore(moves: &[Move]) -> Result<(), String> {
    let mut err = None;
    for m in moves {
        if let Err(e) = fs::rename(&m.to, &m.from) {
            err = Some(io_msg(&e));
        }
    }
    err.map_or(Ok(()), Err)
}

/// Alles im Zwischenordner in den System-Papierkorb verschieben.
pub fn flush(root: &Path) -> Result<usize, String> {
    let staging = root.join(STAGING);
    if !staging.exists() {
        return Ok(0);
    }
    let files: Vec<PathBuf> = walkdir::WalkDir::new(&staging)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();
    let n = files.len();
    if n > 0 {
        trash::delete_all(&files).map_err(|e| format!("Papierkorb nicht erreichbar: {e}"))?;
    }
    let _ = fs::remove_dir_all(&staging);
    Ok(n)
}

pub fn trash_files(paths: &[String]) -> Result<(), String> {
    let existing: Vec<&String> = paths.iter().filter(|p| Path::new(p).exists()).collect();
    if existing.is_empty() {
        return Ok(());
    }
    trash::delete_all(existing).map_err(|e| format!("Papierkorb nicht erreichbar: {e}"))
}

/// Von uns angelegte Kopien direkt entfernen (für "Rückgängig" direkt nach dem Kopieren).
pub fn remove_files(paths: &[String]) {
    for p in paths {
        let _ = fs::remove_file(p);
    }
}

#[derive(Serialize)]
pub struct DirInfo {
    pub exists: bool,
    pub writable: bool,
    /// freier Speicher in Bytes
    pub free: u64,
}

pub fn check_dir(path: &Path) -> DirInfo {
    if !path.is_dir() {
        return DirInfo {
            exists: false,
            writable: false,
            free: 0,
        };
    }
    let probe = path.join(".shotsort-schreibtest");
    let writable = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    let free = fs2::available_space(path).unwrap_or(0);
    DirInfo {
        exists: true,
        writable,
        free,
    }
}

/// Einfacher Speicher für Einstellungen und Sitzungen (JSON-Dateien im App-Datenordner).
pub fn store_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let ok = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !ok {
        return Err("Ungültiger Name".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.json")))
}

// ------------------------------------------------------------------ Schnellstart

/// Ordner anlegen (auch mehrere Ebenen). Vorhandene Ordner bleiben unverändert.
pub fn create_dirs(paths: &[String]) -> Result<(), String> {
    for p in paths {
        fs::create_dir_all(p).map_err(|e| format!("{p}: {}", io_msg(&e)))?;
    }
    Ok(())
}

// ------------------------------------------------------------------ Speicher

/// Größe aller Dateien in einem Ordner (Bytes) und ihre Anzahl.
pub fn dir_size(dir: &Path) -> (u64, usize) {
    let mut bytes = 0;
    let mut n = 0;
    for e in walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if e.file_type().is_file() {
            bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
            n += 1;
        }
    }
    (bytes, n)
}

/// Vorschau-Speicher leeren. Gibt die freigegebenen Bytes zurück.
/// Dateien, die gerade benutzt werden, bleiben einfach liegen.
pub fn clear_dir(dir: &Path) -> u64 {
    let mut freed = 0;
    if let Ok(it) = fs::read_dir(dir) {
        for e in it.flatten() {
            let p = e.path();
            if p.is_file() {
                let len = e.metadata().map(|m| m.len()).unwrap_or(0);
                if fs::remove_file(&p).is_ok() {
                    freed += len;
                }
            }
        }
    }
    freed
}

/// Vorschauen entfernen, die älter als `days` Tage sind. Läuft beim Start im Hintergrund.
pub fn prune_dir(dir: &Path, days: u64) {
    let limit = std::time::Duration::from_secs(days * 24 * 3600);
    let now = std::time::SystemTime::now();
    if let Ok(it) = fs::read_dir(dir) {
        for e in it.flatten() {
            let old = e
                .metadata()
                .and_then(|m| m.modified())
                .map(|t| now.duration_since(t).map_or(false, |d| d > limit))
                .unwrap_or(false);
            if old && e.path().is_file() {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

#[derive(Serialize)]
pub struct StoreFile {
    /// Name ohne .json, z. B. "sitzung-1a2b3c"
    pub name: String,
    pub bytes: u64,
}

/// Gespeicherte Dateien mit einem bestimmten Anfang auflisten (z. B. alle Sitzungen).
pub fn store_list(dir: &Path, prefix: &str) -> Vec<StoreFile> {
    let mut out = vec![];
    if let Ok(it) = fs::read_dir(dir) {
        for e in it.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(stem) = name.strip_suffix(".json") {
                if stem.starts_with(prefix) {
                    out.push(StoreFile {
                        name: stem.to_string(),
                        bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
                    });
                }
            }
        }
    }
    out
}

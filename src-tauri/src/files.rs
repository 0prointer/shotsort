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

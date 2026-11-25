//! Quellordner einlesen: Dateien finden, RAW+JPG-Paare bilden, nach Aufnahmezeit sortieren.

use crate::meta::{self, ext_lower, MAIN_EXT, RAW_EXT, VIDEO_EXT};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Serialize, Clone, Debug)]
pub struct Item {
    /// Stabile Kennung: relativer Ordner + Dateiname ohne Endung, klein geschrieben.
    pub id: String,
    /// Dateiname ohne Endung, z. B. "IMG_0232"
    pub name: String,
    /// Unterordner relativ zur Quelle ("" = direkt in der Quelle)
    pub dir: String,
    /// Alle Dateien, die zusammen kopiert werden (RAW, JPG, XMP ...)
    pub files: Vec<String>,
    pub raw: Option<String>,
    /// Das "normale" Bild: JPG, PNG oder TIFF
    pub main: Option<String>,
    pub xmp: Option<String>,
    /// Aufnahmezeit "JJJJ:MM:TT HH:MM:SS"
    pub taken: Option<String>,
    /// Kurzbeschreibung, z. B. "CR3 + JPG"
    pub kind: String,
    pub bytes: u64,
}

#[derive(Serialize)]
pub struct ScanResult {
    pub items: Vec<Item>,
    pub videos: usize,
    pub others: usize,
}

#[derive(Serialize)]
pub struct Counts {
    pub images: usize,
    pub pairs: usize,
    pub videos: usize,
    pub others: usize,
    pub folders: usize,
}

/// Pfad vergleichbar machen (Groß/Klein und \ vs / spielen keine Rolle).
pub fn norm_path(p: &Path) -> String {
    p.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn walker(
    root: &Path,
    subfolders: bool,
    exclude: &[String],
) -> impl Iterator<Item = walkdir::DirEntry> {
    let exclude: Vec<String> = exclude.iter().map(|p| norm_path(Path::new(p))).collect();
    WalkDir::new(root)
        .min_depth(1)
        .max_depth(if subfolders { 64 } else { 1 })
        .follow_links(false)
        .into_iter()
        .filter_entry(move |e| {
            if e.depth() == 0 || !e.file_type().is_dir() {
                return true;
            }
            // versteckte Ordner (z. B. unser eigener Papierkorb ".shotsort-papierkorb") überspringen
            if e.file_name().to_string_lossy().starts_with('.') {
                return false;
            }
            // Zielordner im Quellordner nicht mit einlesen – sonst tauchen die Kopien als neue Bilder auf
            !exclude.contains(&norm_path(e.path()))
        })
        .filter_map(|e| e.ok())
}

struct Group {
    dir: String,
    name: String,
    files: Vec<PathBuf>,
}

/// Dateien nach (Ordner, Name ohne Endung) gruppieren.
fn group(root: &Path, subfolders: bool, exclude: &[String]) -> (Vec<Group>, usize, usize, usize) {
    let mut groups: HashMap<String, Group> = HashMap::new();
    let mut videos = 0;
    let mut others = 0;
    let mut folders = 0;
    for e in walker(root, subfolders, exclude) {
        if e.file_type().is_dir() {
            folders += 1;
            continue;
        }
        if !e.file_type().is_file() {
            continue;
        }
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let ext = ext_lower(p);
        if VIDEO_EXT.contains(&ext.as_str()) {
            videos += 1;
            continue;
        }
        if !(RAW_EXT.contains(&ext.as_str()) || MAIN_EXT.contains(&ext.as_str()) || ext == "xmp") {
            others += 1;
            continue;
        }
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let rel_dir = p
            .parent()
            .and_then(|d| d.strip_prefix(root).ok())
            .map(|d| d.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let key = format!("{}/{}", rel_dir.to_lowercase(), stem.to_lowercase());
        groups
            .entry(key)
            .or_insert_with(|| Group {
                dir: rel_dir.clone(),
                name: stem.clone(),
                files: vec![],
            })
            .files
            .push(p.to_path_buf());
    }
    let mut list: Vec<Group> = groups.into_values().collect();
    list.retain(|g| g.files.iter().any(|f| ext_lower(f) != "xmp"));
    (list, videos, others, folders)
}

fn to_item(g: Group) -> Item {
    let mut raw = None;
    let mut main: Option<(usize, PathBuf)> = None;
    let mut xmp = None;
    let mut bytes = 0;
    for f in &g.files {
        bytes += std::fs::metadata(f).map(|m| m.len()).unwrap_or(0);
        let ext = ext_lower(f);
        if RAW_EXT.contains(&ext.as_str()) {
            raw.get_or_insert_with(|| f.clone());
        } else if ext == "xmp" {
            xmp = Some(f.clone());
        } else if let Some(rank) = MAIN_EXT.iter().position(|e| *e == ext) {
            // Bevorzugt JPG vor PNG vor TIFF
            let rank = rank.min(3);
            if main.as_ref().map_or(true, |(r, _)| rank < *r) {
                main = Some((rank, f.clone()));
            }
        }
    }
    let main = main.map(|(_, p)| p);
    let up = |p: &Option<PathBuf>| p.as_ref().map(|p| ext_lower(p).to_uppercase());
    let kind = match (up(&raw), up(&main)) {
        (Some(r), Some(m)) => format!("{r} + {m}"),
        (Some(r), None) => r,
        (None, Some(m)) => m,
        _ => String::new(),
    };
    let s = |p: &Option<PathBuf>| p.as_ref().map(|p| p.to_string_lossy().to_string());
    let mut files: Vec<String> = g
        .files
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    files.sort();
    Item {
        id: format!("{}/{}", g.dir.to_lowercase(), g.name.to_lowercase()),
        name: g.name,
        dir: g.dir,
        files,
        raw: s(&raw),
        main: s(&main),
        xmp: s(&xmp),
        taken: None,
        kind,
        bytes,
    }
}

/// Aufnahmezeit bestimmen: zuerst aus dem JPG (zuverlässig), sonst aus dem RAW, sonst Dateidatum.
fn capture_time(it: &Item) -> String {
    let candidates = [it.main.as_ref(), it.raw.as_ref()];
    for c in candidates.into_iter().flatten() {
        if let Some(t) = meta::read_exif(Path::new(c)).and_then(|e| meta::taken(&e)) {
            return t;
        }
    }
    let f = it
        .raw
        .as_ref()
        .or(it.main.as_ref())
        .cloned()
        .unwrap_or_default();
    std::fs::metadata(&f)
        .and_then(|m| m.modified())
        .map(meta::system_time_string)
        .unwrap_or_default()
}

pub fn scan(
    app: &AppHandle,
    root: &Path,
    subfolders: bool,
    sort: &str,
    exclude: &[String],
) -> ScanResult {
    let (groups, videos, others, _) = group(root, subfolders, exclude);
    let mut items: Vec<Item> = groups.into_iter().map(to_item).collect();
    let total = items.len();
    let _ = app.emit("scan-progress", (0usize, total));

    // Aufnahmezeiten parallel lesen – für die Reihenfolge und zum Erkennen von Serien
    let done = AtomicUsize::new(0);
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(8);
    let chunk = (total / threads).max(1);
    std::thread::scope(|s| {
        for part in items.chunks_mut(chunk) {
            let done = &done;
            s.spawn(move || {
                for it in part.iter_mut() {
                    it.taken = Some(capture_time(it));
                    let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                    if n % 20 == 0 || n == total {
                        let _ = app.emit("scan-progress", (n, total));
                    }
                }
            });
        }
    });
    if sort == "name" {
        items.sort_by(|a, b| a.dir.cmp(&b.dir).then_with(|| a.name.cmp(&b.name)));
    } else {
        items.sort_by(|a, b| {
            a.taken
                .cmp(&b.taken)
                .then_with(|| a.dir.cmp(&b.dir))
                .then_with(|| a.name.cmp(&b.name))
        });
    }
    ScanResult {
        items,
        videos,
        others,
    }
}

/// Schnelles Zählen ohne EXIF – für den Startbildschirm.
pub fn quick_count(root: &Path, subfolders: bool, exclude: &[String]) -> Counts {
    let (groups, videos, others, folders) = group(root, subfolders, exclude);
    let pairs = groups
        .iter()
        .filter(|g| {
            let has_raw = g.files.iter().any(|f| meta::is_raw(f));
            let has_main = g
                .files
                .iter()
                .any(|f| MAIN_EXT.contains(&ext_lower(f).as_str()));
            has_raw && has_main
        })
        .count();
    Counts {
        images: groups.len(),
        pairs,
        videos,
        others,
        folders,
    }
}

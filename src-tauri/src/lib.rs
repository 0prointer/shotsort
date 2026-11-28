//! ShotSort – Rust-Teil der App.
//! Hier sind alle Befehle, die die Oberfläche (src/) aufrufen kann.

mod copy;
mod edits;
mod files;
mod meta;
mod preview;
mod scan;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

/// Gefundenes, noch nicht installiertes Update.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<Update>>);

#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
    /// Kann sich diese Installation selbst aktualisieren? Unter Linux nur das AppImage –
    /// .deb/.rpm werden über die Download-Seite (bzw. den Paketmanager) aktualisiert.
    self_update: bool,
}

fn can_self_update() -> bool {
    if cfg!(target_os = "linux") {
        std::env::var_os("APPIMAGE").is_some()
    } else {
        true
    }
}

/// Fragt bei GitHub nach, ob es eine neuere Version gibt.
#[tauri::command]
async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
        self_update: can_self_update(),
    });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

/// Lädt das gefundene Update, prüft die Signatur, installiert es und startet neu.
/// Fortschritt geht als Ereignis "update-progress" ([geladen, gesamt]) an die Oberfläche.
#[tauri::command]
async fn install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("Kein Update gefunden")?;
    let mut done: u64 = 0;
    let h = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                done += chunk as u64;
                let _ = h.emit("update-progress", (done, total));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    // Unter Windows beendet sich die App beim Installieren sofort. Gelöschte Bilder deshalb
    // vorher endgültig in den Papierkorb legen (wie beim normalen Beenden).
    flush_all(&app);
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}

/// Quellordner, in denen gerade gelöschte Bilder im Zwischenordner liegen.
#[derive(Default)]
struct DeleteRoots(Mutex<HashSet<PathBuf>>);

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("vorschau");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn opt_path(p: &Option<String>) -> Option<&Path> {
    p.as_deref().map(Path::new)
}

/// Lange Arbeiten im Hintergrund ausführen, damit die Oberfläche flüssig bleibt.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_folder(
    app: AppHandle,
    path: String,
    subfolders: bool,
    sort: String,
    exclude: Option<Vec<String>>,
) -> Result<scan::ScanResult, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Ordner nicht gefunden: {path}"));
    }
    // Der Oberfläche erlauben, Bilder aus diesem Ordner anzuzeigen
    let _ = app.asset_protocol_scope().allow_directory(&root, true);
    // Reste einer abgebrochenen Sitzung in den Papierkorb
    let _ = files::flush(&root);
    let exclude = exclude.unwrap_or_default();
    blocking(move || Ok(scan::scan(&app, &root, subfolders, &sort, &exclude))).await
}

#[tauri::command]
async fn quick_count(
    path: String,
    subfolders: bool,
    exclude: Option<Vec<String>>,
) -> Result<scan::Counts, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Ordner nicht gefunden: {path}"));
    }
    let exclude = exclude.unwrap_or_default();
    blocking(move || Ok(scan::quick_count(&root, subfolders, &exclude))).await
}

/// Fingerabdruck des Quellordners für die Live-Überwachung (schnell, ohne EXIF).
#[tauri::command]
async fn folder_stamp(
    path: String,
    subfolders: bool,
    exclude: Option<Vec<String>>,
) -> Result<String, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Ordner nicht gefunden: {path}"));
    }
    let exclude = exclude.unwrap_or_default();
    blocking(move || Ok(scan::stamp(&root, subfolders, &exclude))).await
}

/// Neu hinzugekommene Bilder einlesen (alle, deren ID noch nicht in `known` steht).
#[tauri::command]
async fn scan_new(
    path: String,
    subfolders: bool,
    exclude: Option<Vec<String>>,
    known: Vec<String>,
) -> Result<scan::NewItems, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Ordner nicht gefunden: {path}"));
    }
    let exclude = exclude.unwrap_or_default();
    let known: HashSet<String> = known.into_iter().collect();
    blocking(move || Ok(scan::scan_new(&root, subfolders, &exclude, &known))).await
}

#[tauri::command]
async fn create_dirs(paths: Vec<String>) -> Result<(), String> {
    blocking(move || files::create_dirs(&paths)).await
}

#[derive(serde::Serialize)]
struct CacheInfo {
    bytes: u64,
    files: usize,
}

#[tauri::command]
async fn cache_info(app: AppHandle) -> Result<CacheInfo, String> {
    let dir = cache_dir(&app)?;
    blocking(move || {
        let (bytes, files) = files::dir_size(&dir);
        Ok(CacheInfo { bytes, files })
    })
    .await
}

/// Vorschau-Speicher leeren. Gibt die freigegebenen Bytes zurück.
#[tauri::command]
async fn clear_cache(app: AppHandle) -> Result<u64, String> {
    let dir = cache_dir(&app)?;
    blocking(move || Ok(files::clear_dir(&dir))).await
}

#[tauri::command]
fn store_list(app: AppHandle, prefix: String) -> Result<Vec<files::StoreFile>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(files::store_list(&dir, &prefix))
}

#[tauri::command]
fn store_remove(app: AppHandle, name: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let p = files::store_path(&dir, &name)?;
    match std::fs::remove_file(p) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
async fn get_preview(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
) -> Result<preview::Preview, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::preview(&cache, opt_path(&raw), opt_path(&main))).await
}

#[tauri::command]
async fn get_thumb(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
) -> Result<String, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::thumb(&cache, opt_path(&raw), opt_path(&main))).await
}

#[tauri::command]
async fn clip_mask(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
    threshold: u8,
) -> Result<preview::Mask, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::clip_mask(&cache, opt_path(&raw), opt_path(&main), threshold)).await
}

#[tauri::command]
async fn focus_mask(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
) -> Result<preview::Mask, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::focus_mask(&cache, opt_path(&raw), opt_path(&main))).await
}

#[tauri::command]
async fn histogram(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
) -> Result<Vec<Vec<u32>>, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::histogram(&cache, opt_path(&raw), opt_path(&main))).await
}

#[tauri::command]
async fn sharpness(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
) -> Result<f32, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::sharpness(&cache, opt_path(&raw), opt_path(&main))).await
}

#[tauri::command]
async fn find_cards() -> Result<Vec<String>, String> {
    blocking(|| Ok(preview::find_cards())).await
}

#[tauri::command]
async fn get_medium(
    app: AppHandle,
    raw: Option<String>,
    main: Option<String>,
) -> Result<preview::Preview, String> {
    let cache = cache_dir(&app)?;
    blocking(move || preview::medium(&cache, opt_path(&raw), opt_path(&main))).await
}

#[tauri::command]
async fn get_info(raw: Option<String>, main: Option<String>) -> Result<meta::Info, String> {
    blocking(move || {
        let mut found = None;
        for p in [main.as_ref(), raw.as_ref()].into_iter().flatten() {
            if let Some(e) = meta::read_exif(Path::new(p)) {
                found = Some(e);
                break;
            }
        }
        if found.is_none() {
            if let Some(r) = &raw {
                found = preview::exif_from_raw_preview(Path::new(r));
            }
        }
        Ok(found.map(|e| meta::info_from(&e)).unwrap_or_default())
    })
    .await
}

#[tauri::command]
async fn copy_item(app: AppHandle, req: copy::CopyReq) -> Result<copy::CopyRes, String> {
    let cache = cache_dir(&app)?;
    blocking(move || copy::copy_item(&cache, &req)).await
}

#[tauri::command]
async fn reapply_edits(
    app: AppHandle,
    req: copy::CopyReq,
    stem: String,
) -> Result<copy::CopyRes, String> {
    let cache = cache_dir(&app)?;
    blocking(move || copy::reapply(&cache, &req, &stem)).await
}

#[tauri::command]
async fn remove_files(paths: Vec<String>) -> Result<(), String> {
    blocking(move || {
        files::remove_files(&paths);
        Ok(())
    })
    .await
}

#[tauri::command]
async fn trash_files(paths: Vec<String>) -> Result<(), String> {
    blocking(move || files::trash_files(&paths)).await
}

#[tauri::command]
async fn stage_delete(
    state: State<'_, DeleteRoots>,
    root: String,
    files: Vec<String>,
) -> Result<Vec<files::Move>, String> {
    state.0.lock().unwrap().insert(PathBuf::from(&root));
    blocking(move || files::stage_delete(Path::new(&root), &files)).await
}

#[tauri::command]
async fn restore_delete(moves: Vec<files::Move>) -> Result<(), String> {
    blocking(move || files::restore(&moves)).await
}

#[tauri::command]
async fn flush_deleted(state: State<'_, DeleteRoots>, root: String) -> Result<usize, String> {
    state.0.lock().unwrap().remove(&PathBuf::from(&root));
    blocking(move || files::flush(Path::new(&root))).await
}

#[tauri::command]
async fn check_dir(path: String) -> Result<files::DirInfo, String> {
    blocking(move || Ok(files::check_dir(Path::new(&path)))).await
}

#[tauri::command]
fn open_path(app: AppHandle, path: String, with: Option<String>) -> Result<(), String> {
    // with = Programm, mit dem geöffnet werden soll (z. B. Lightroom); sonst das Standardprogramm
    let with = with.filter(|w| !w.trim().is_empty());
    app.opener()
        .open_path(path, with.as_deref())
        .map_err(|e| e.to_string())
}

/// Datei im Explorer (bzw. Finder) zeigen und markieren.
#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn store_get(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let p = files::store_path(&dir, &name)?;
    Ok(std::fs::read_to_string(p).ok())
}

#[tauri::command]
fn store_set(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let p = files::store_path(&dir, &name)?;
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Gelöschte Bilder aller Quellordner endgültig in den Papierkorb des Systems legen.
fn flush_all(app: &AppHandle) {
    let roots: Vec<PathBuf> = app
        .state::<DeleteRoots>()
        .0
        .lock()
        .unwrap()
        .drain()
        .collect();
    for r in roots {
        let _ = files::flush(&r);
    }
}

/// Übernimmt beim ersten Start Einstellungen und Zielordner der alten App „Fotosortierer“
/// (Ordner de.fotosortierer.app neben dem neuen Datenordner). Der alte Ordner bleibt unverändert.
fn migrate_old_data(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let Some(old) = dir.parent().map(|p| p.join("de.fotosortierer.app")) else {
        return;
    };
    if !old.is_dir() {
        return;
    }
    let has_json = |d: &std::path::Path| {
        std::fs::read_dir(d)
            .map(|it| {
                it.flatten()
                    .any(|e| e.path().extension().is_some_and(|x| x == "json"))
            })
            .unwrap_or(false)
    };
    if has_json(&dir) {
        return;
    }
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(it) = std::fs::read_dir(&old) {
        for e in it.flatten() {
            let p = e.path();
            if p.is_file() && p.extension().is_some_and(|x| x == "json") {
                let _ = std::fs::copy(&p, dir.join(e.file_name()));
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Nur eine ShotSort-Instanz: Ein zweiter Start holt das vorhandene Fenster nach vorne,
        // statt dass zwei Fenster gleichzeitig in dieselben Ordner kopieren.
        // Muss als erstes Plugin registriert werden.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingUpdate::default())
        .manage(DeleteRoots::default())
        .setup(|app| {
            let cache = cache_dir(app.handle())?;
            let _ = app.asset_protocol_scope().allow_directory(&cache, true);
            migrate_old_data(app.handle());
            // Sicherheitsnetz: Das Fenster startet unsichtbar und wird von der Oberfläche gezeigt.
            // Klappt das nicht (z. B. Fehler beim Laden), erscheint es spätestens nach 4 Sekunden.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            quick_count,
            folder_stamp,
            scan_new,
            create_dirs,
            cache_info,
            clear_cache,
            store_list,
            store_remove,
            get_preview,
            get_thumb,
            clip_mask,
            focus_mask,
            histogram,
            get_medium,
            get_info,
            copy_item,
            reapply_edits,
            remove_files,
            trash_files,
            stage_delete,
            restore_delete,
            flush_deleted,
            check_dir,
            sharpness,
            find_cards,
            open_path,
            reveal_path,
            store_get,
            store_set,
            check_update,
            install_update
        ])
        .build(tauri::generate_context!())
        .expect("Fehler beim Starten der App");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            flush_all(handle);
            // Vorschauen, die älter als 60 Tage sind, entfernen. Erst beim Beenden,
            // damit keine Vorschau gelöscht wird, die gerade angezeigt wird.
            if let Ok(cache) = cache_dir(handle) {
                files::prune_dir(&cache, 60);
            }
        }
    });
}

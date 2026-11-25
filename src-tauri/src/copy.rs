//! Kopieren in die Zielordner – mit Prüfung, Namenskonflikt-Regel und Bearbeitung.

use crate::edits::{self, Edits};
use crate::meta::{self, ext_lower};
use crate::preview;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

fn default_quality() -> u8 {
    95
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyReq {
    pub files: Vec<String>,
    pub raw: Option<String>,
    pub main: Option<String>,
    pub target: String,
    /// "number" = Nummer anhängen (_2), "skip" = überspringen
    #[serde(default)]
    pub conflict: String,
    #[serde(default)]
    pub edits: Option<Edits>,
    #[serde(default = "default_quality")]
    pub jpg_quality: u8,
    /// "xmp" = Zuschnitt als .xmp, "jpg" = zusätzlich ein JPG erzeugen
    #[serde(default)]
    pub raw_mode: String,
}

#[derive(Serialize)]
pub struct CopyRes {
    /// "copied", "already", "skipped" oder "updated"
    pub status: String,
    /// Die im Ziel angelegten Dateien
    pub files: Vec<String>,
    /// Endgültiger Dateiname ohne Endung (z. B. "IMG_0233_2")
    pub stem: String,
    pub renamed: bool,
}

enum Out {
    Copy(PathBuf),
    EditedMain(PathBuf),
    Xmp,
    JpgFromRaw,
}

struct Plan {
    out: Out,
    ext: String,
}

pub fn io_msg(e: &std::io::Error) -> String {
    match e.raw_os_error() {
        Some(112) | Some(28) => "Zu wenig Speicherplatz im Zielordner".into(),
        Some(5) | Some(13) => "Keine Schreibrechte im Zielordner".into(),
        _ => e.to_string(),
    }
}

/// Zwei Dateien Byte für Byte vergleichen.
pub fn files_equal(a: &Path, b: &Path) -> bool {
    let (Ok(ma), Ok(mb)) = (fs::metadata(a), fs::metadata(b)) else {
        return false;
    };
    if ma.len() != mb.len() {
        return false;
    }
    let (Ok(fa), Ok(fb)) = (fs::File::open(a), fs::File::open(b)) else {
        return false;
    };
    let (mut ra, mut rb) = (BufReader::new(fa), BufReader::new(fb));
    let mut ba = vec![0u8; 1 << 20];
    let mut bb = vec![0u8; 1 << 20];
    loop {
        let na = match read_full(&mut ra, &mut ba) {
            Ok(n) => n,
            Err(_) => return false,
        };
        let nb = match read_full(&mut rb, &mut bb) {
            Ok(n) => n,
            Err(_) => return false,
        };
        if na != nb || ba[..na] != bb[..nb] {
            return false;
        }
        if na == 0 {
            return true;
        }
    }
}

fn read_full(r: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut n = 0;
    while n < buf.len() {
        match r.read(&mut buf[n..])? {
            0 => break,
            k => n += k,
        }
    }
    Ok(n)
}

fn part_path(dst: &Path) -> PathBuf {
    let name = dst
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    dst.with_file_name(format!("{name}.fs-part"))
}

fn finish(tmp: &Path, dst: &Path, overwrite: bool) -> Result<(), String> {
    if dst.exists() {
        if !overwrite {
            let _ = fs::remove_file(tmp);
            return Err(format!("{} existiert schon", dst.display()));
        }
        fs::remove_file(dst).map_err(|e| io_msg(&e))?;
    }
    fs::rename(tmp, dst).map_err(|e| io_msg(&e))
}

/// Kopieren und danach prüfen, ob die Kopie vollständig ist.
fn copy_verify(src: &Path, dst: &Path, overwrite: bool) -> Result<(), String> {
    let tmp = part_path(dst);
    if let Err(e) = fs::copy(src, &tmp) {
        let _ = fs::remove_file(&tmp);
        return Err(io_msg(&e));
    }
    if !files_equal(src, &tmp) {
        let _ = fs::remove_file(&tmp);
        return Err(format!(
            "Prüfung fehlgeschlagen: {} ist nicht vollständig angekommen",
            dst.display()
        ));
    }
    finish(&tmp, dst, overwrite)
}

fn write_bytes(dst: &Path, bytes: &[u8], overwrite: bool) -> Result<(), String> {
    let tmp = part_path(dst);
    fs::write(&tmp, bytes).map_err(|e| io_msg(&e))?;
    finish(&tmp, dst, overwrite)
}

fn ext_of(p: &Path) -> String {
    p.extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default()
}

fn plan(req: &CopyReq, edited: bool) -> Vec<Plan> {
    let main = req.main.as_deref();
    let mut out = vec![];
    for f in &req.files {
        let p = PathBuf::from(f);
        let ext = ext_lower(&p);
        if edited && Some(f.as_str()) == main {
            let e = if matches!(ext.as_str(), "jpg" | "jpeg" | "png") {
                ext_of(&p)
            } else {
                ".jpg".into()
            };
            out.push(Plan {
                out: Out::EditedMain(p),
                ext: e,
            });
        } else if edited && req.raw.is_some() && ext == "xmp" {
            // wird durch unsere eigene XMP mit dem Zuschnitt ersetzt
        } else {
            out.push(Plan {
                ext: ext_of(&p),
                out: Out::Copy(p),
            });
        }
    }
    if edited && req.raw.is_some() {
        out.push(Plan {
            out: Out::Xmp,
            ext: ".xmp".into(),
        });
        if req.raw_mode == "jpg" && main.is_none() {
            out.push(Plan {
                out: Out::JpgFromRaw,
                ext: ".jpg".into(),
            });
        }
    }
    out
}

fn dest(target: &Path, stem: &str, pl: &Plan) -> PathBuf {
    target.join(format!("{stem}{}", pl.ext))
}

fn edited_main(
    src: &Path,
    dst: &Path,
    e: &Edits,
    quality: u8,
    overwrite: bool,
) -> Result<(), String> {
    let data = fs::read(src).map_err(|e| io_msg(&e))?;
    let img = image::load_from_memory(&data)
        .map_err(|e| format!("Bild konnte nicht gelesen werden: {e}"))?;
    let o = meta::exif_from_bytes(data.clone())
        .map(|x| meta::orientation(&x))
        .unwrap_or(1);
    let out = edits::render(edits::apply_orientation(img, o), e);
    let dyn_img = image::DynamicImage::ImageRgb8(out);
    let mut bytes: Vec<u8> = vec![];
    if ext_lower(dst) == "png" {
        dyn_img
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageFormat::Png,
            )
            .map_err(|e| e.to_string())?;
    } else {
        let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, quality);
        dyn_img.write_with_encoder(enc).map_err(|e| e.to_string())?;
        // Aufnahmedaten (EXIF) aus dem Original übernehmen
        if let Some(mut seg) = edits::exif_segment(&data) {
            edits::reset_orientation(&mut seg);
            bytes = edits::insert_segment(&bytes, &seg);
        }
    }
    write_bytes(dst, &bytes, overwrite)
}

fn execute(
    cache: &Path,
    req: &CopyReq,
    plans: &[Plan],
    target: &Path,
    stem: &str,
    overwrite: bool,
) -> Result<Vec<String>, String> {
    let mut created: Vec<PathBuf> = vec![];
    let e = req.edits.clone().unwrap_or_default();
    let raw = req.raw.as_deref().map(Path::new);
    for pl in plans {
        let d = dest(target, stem, pl);
        let res = match &pl.out {
            // Beim Neu-Schreiben (Bearbeitung geändert) unveränderte Dateien nicht nochmal kopieren
            Out::Copy(p) if overwrite && d.exists() && files_equal(p, &d) => Ok(()),
            Out::Copy(p) => copy_verify(p, &d, overwrite),
            Out::EditedMain(p) => edited_main(p, &d, &e, req.jpg_quality, overwrite),
            Out::Xmp => {
                let cam = raw
                    .and_then(meta::read_exif)
                    .map(|x| meta::orientation_to_deg(meta::orientation(&x)))
                    .unwrap_or(0);
                write_bytes(&d, edits::xmp(&e, cam).as_bytes(), overwrite)
            }
            Out::JpgFromRaw => preview::load_upright(cache, raw, None).and_then(|img| {
                let out = image::DynamicImage::ImageRgb8(edits::render(img, &e));
                let tmp = part_path(&d);
                preview::save_jpeg(&out, &tmp, req.jpg_quality)?;
                finish(&tmp, &d, overwrite)
            }),
        };
        match res {
            Ok(()) => created.push(d),
            Err(msg) => {
                if !overwrite {
                    for c in &created {
                        let _ = fs::remove_file(c);
                    }
                }
                return Err(msg);
            }
        }
    }
    Ok(created
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

fn base_stem(req: &CopyReq) -> String {
    let p = req
        .raw
        .as_ref()
        .or(req.main.as_ref())
        .or(req.files.first())
        .cloned()
        .unwrap_or_default();
    Path::new(&p)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

pub fn copy_item(cache: &Path, req: &CopyReq) -> Result<CopyRes, String> {
    let target = PathBuf::from(&req.target);
    if !target.is_dir() {
        return Err(format!("Zielordner nicht erreichbar: {}", target.display()));
    }
    let stem = base_stem(req);
    let edited = req.edits.as_ref().map_or(false, |e| !e.is_identity());
    let plans = plan(req, edited);

    // Liegt genau dieses Bild schon im Ziel? Dann nichts tun.
    let already = plans.iter().all(|pl| {
        let d = dest(&target, &stem, pl);
        match &pl.out {
            Out::Copy(p) => d.exists() && files_equal(p, &d),
            _ => d.exists(),
        }
    });
    if already {
        let files = plans
            .iter()
            .map(|pl| dest(&target, &stem, pl).to_string_lossy().to_string())
            .collect();
        return Ok(CopyRes {
            status: "already".into(),
            files,
            stem: stem.clone(),
            renamed: false,
        });
    }

    // Gleicher Name, anderer Inhalt: Nummer anhängen oder überspringen
    let mut final_stem = stem.clone();
    if plans.iter().any(|pl| dest(&target, &stem, pl).exists()) {
        if req.conflict == "skip" {
            return Ok(CopyRes {
                status: "skipped".into(),
                files: vec![],
                stem,
                renamed: false,
            });
        }
        let mut n = 2;
        loop {
            let cand = format!("{stem}_{n}");
            if !plans.iter().any(|pl| dest(&target, &cand, pl).exists()) {
                final_stem = cand;
                break;
            }
            n += 1;
        }
    }
    let files = execute(cache, req, &plans, &target, &final_stem, false)?;
    Ok(CopyRes {
        status: "copied".into(),
        renamed: final_stem != stem,
        files,
        stem: final_stem,
    })
}

/// Eine schon vorhandene Kopie mit geänderter Bearbeitung neu schreiben.
pub fn reapply(cache: &Path, req: &CopyReq, stem: &str) -> Result<CopyRes, String> {
    let target = PathBuf::from(&req.target);
    if !target.is_dir() {
        return Err(format!("Zielordner nicht erreichbar: {}", target.display()));
    }
    let edited = req.edits.as_ref().map_or(false, |e| !e.is_identity());
    let plans = plan(req, edited);
    let files = execute(cache, req, &plans, &target, stem, true)?;
    if !edited && req.raw.is_some() {
        // Von uns erzeugte Zusatzdateien wieder entfernen
        let had_xmp = req.files.iter().any(|f| ext_lower(Path::new(f)) == "xmp");
        if !had_xmp {
            let _ = fs::remove_file(target.join(format!("{stem}.xmp")));
        }
        if req.main.is_none() {
            let _ = fs::remove_file(target.join(format!("{stem}.jpg")));
        }
    }
    Ok(CopyRes {
        status: "updated".into(),
        files,
        stem: stem.to_string(),
        renamed: false,
    })
}

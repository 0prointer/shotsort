//! Vorschaubilder: RAW-Vorschau herauslösen, Filmleisten-Miniaturen, Überbelichtungs-Maske.

use crate::edits::apply_orientation;
use crate::meta::{self, ext_lower};
use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Serialize)]
pub struct Preview {
    /// Datei, die die Oberfläche anzeigt
    pub src: String,
    /// Um wie viel Grad die Oberfläche das Bild drehen muss (nur bei RAW-Vorschauen nötig)
    pub rotate: i32,
}

#[derive(Serialize)]
pub struct Mask {
    pub src: String,
    /// Anteil überbelichteter Bildpunkte in Prozent
    pub percent: f64,
    /// Anteil zu dunkler Bildpunkte (reines Schwarz) in Prozent – nur bei der Belichtungs-Maske
    pub dark: f64,
}

pub fn cache_key(path: &Path, tag: &str) -> String {
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    if let Ok(m) = fs::metadata(path) {
        m.len().hash(&mut h);
        if let Ok(t) = m.modified() {
            t.hash(&mut h);
        }
    }
    tag.hash(&mut h);
    format!("{:016x}", h.finish())
}

// ---------------------------------------------------------------------------
// Eingebettetes JPEG in RAW-Dateien finden
// ---------------------------------------------------------------------------

/// Prüft, ob bei `start` ein vollständiges, vom Browser lesbares JPEG beginnt.
/// Gibt das Ende (exklusiv) zurück.
fn parse_jpeg(d: &[u8], start: usize) -> Option<usize> {
    let n = d.len();
    let mut i = start + 2;
    let mut sof: Option<u8> = None;
    loop {
        if i + 1 >= n || d[i] != 0xFF {
            return None;
        }
        let mut j = i + 1;
        while d[j] == 0xFF {
            j += 1;
            if j >= n {
                return None;
            }
        }
        let m = d[j];
        i = j + 1;
        match m {
            0xD9 => {
                // nur Baseline/Progressive – verlustfreie JPEGs (RAW-Daten) kann der Browser nicht zeigen
                return matches!(sof, Some(0xC0 | 0xC1 | 0xC2)).then_some(i);
            }
            0xD0..=0xD7 | 0x01 => continue,
            _ => {}
        }
        if i + 1 >= n {
            return None;
        }
        let len = ((d[i] as usize) << 8) | d[i + 1] as usize;
        if len < 2 || i + len > n {
            return None;
        }
        if (0xC0..=0xCF).contains(&m) && !matches!(m, 0xC4 | 0xC8 | 0xCC) {
            sof = Some(m);
        }
        let seg_end = i + len;
        if m == 0xDA {
            // komprimierte Bilddaten bis zum nächsten echten Marker überspringen
            let mut k = seg_end;
            loop {
                let rel = d.get(k..)?.iter().position(|&b| b == 0xFF)?;
                k += rel;
                let nb = *d.get(k + 1)?;
                if nb == 0x00 || (0xD0..=0xD7).contains(&nb) {
                    k += 2;
                } else if nb == 0xFF {
                    k += 1;
                } else {
                    break;
                }
            }
            i = k;
        } else {
            i = seg_end;
        }
    }
}

/// Größtes eingebettetes JPEG suchen (bei fast allen RAW-Formaten die Vorschau in voller Größe).
pub fn find_largest_jpeg(d: &[u8]) -> Option<(usize, usize)> {
    let mut best: Option<(usize, usize)> = None;
    let mut i = 0;
    let mut tries = 0;
    while i + 3 < d.len() && tries < 200 {
        let rel = match d[i..].windows(3).position(|w| w == [0xFF, 0xD8, 0xFF]) {
            Some(r) => r,
            None => break,
        };
        let s = i + rel;
        tries += 1;
        match parse_jpeg(d, s) {
            Some(e) => {
                if e - s > 20_000 && best.map_or(true, |(bs, be)| e - s > be - bs) {
                    best = Some((s, e));
                }
                i = e;
            }
            None => i = s + 2,
        }
    }
    best
}

/// EXIF-Block (APP1) aus einem JPEG entfernen, damit es nicht doppelt gedreht wird.
fn strip_app1(d: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(d.len());
    out.extend_from_slice(&d[..2]);
    let mut i = 2;
    while i + 4 <= d.len() && d[i] == 0xFF {
        let m = d[i + 1];
        if m == 0xDA {
            break;
        }
        let len = ((d[i + 2] as usize) << 8) | d[i + 3] as usize;
        let end = (i + 2 + len).min(d.len());
        if m != 0xE1 {
            out.extend_from_slice(&d[i..end]);
        }
        i = end;
    }
    out.extend_from_slice(&d[i.min(d.len())..]);
    out
}

/// EXIF aus dem eingebetteten JPEG eines RAWs lesen (Notlösung für z. B. CR3/RAF).
pub fn exif_from_raw_preview(raw: &Path) -> Option<exif::Exif> {
    let data = fs::read(raw).ok()?;
    let (s, e) = find_largest_jpeg(&data)?;
    meta::exif_from_bytes(data[s..e].to_vec())
}

fn raw_rotation(raw: &Path) -> i32 {
    meta::read_exif(raw)
        .map(|e| meta::orientation_to_deg(meta::orientation(&e)))
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Öffentliche Funktionen
// ---------------------------------------------------------------------------

fn is_browser_image(p: &Path) -> bool {
    matches!(ext_lower(p).as_str(), "jpg" | "jpeg" | "png")
}

pub fn preview(cache: &Path, raw: Option<&Path>, main: Option<&Path>) -> Result<Preview, String> {
    if let Some(m) = main {
        if is_browser_image(m) {
            return Ok(Preview {
                src: m.to_string_lossy().to_string(),
                rotate: 0,
            });
        }
        // TIFF in JPG umwandeln – der Browser kann TIFF nicht anzeigen
        let out = cache.join(format!("{}.jpg", cache_key(m, "tif")));
        if !out.exists() {
            let img =
                image::open(m).map_err(|e| format!("Bild konnte nicht gelesen werden: {e}"))?;
            let o = meta::read_exif(m)
                .map(|e| meta::orientation(&e))
                .unwrap_or(1);
            let img = apply_orientation(img, o);
            save_jpeg(&DynamicImage::ImageRgb8(img.to_rgb8()), &out, 92)?;
        }
        return Ok(Preview {
            src: out.to_string_lossy().to_string(),
            rotate: 0,
        });
    }
    let raw = raw.ok_or("Keine Bilddatei vorhanden")?;
    let out = cache.join(format!("{}.jpg", cache_key(raw, "raw")));
    if !out.exists() {
        let data = fs::read(raw).map_err(|e| format!("RAW konnte nicht gelesen werden: {e}"))?;
        let (s, e) =
            find_largest_jpeg(&data).ok_or("In dieser RAW-Datei wurde keine Vorschau gefunden")?;
        let tmp = unique_tmp(&out);
        fs::write(&tmp, strip_app1(&data[s..e])).map_err(|e| e.to_string())?;
        replace_file(&tmp, &out)?;
    }
    Ok(Preview {
        src: out.to_string_lossy().to_string(),
        rotate: raw_rotation(raw),
    })
}

/// Bild laden, so wie es die Oberfläche aufrecht zeigt (Ausrichtung schon angewendet).
pub fn load_upright(
    cache: &Path,
    raw: Option<&Path>,
    main: Option<&Path>,
) -> Result<DynamicImage, String> {
    let p = preview(cache, raw, main)?;
    let src = PathBuf::from(&p.src);
    let img = image::open(&src).map_err(|e| format!("Bild konnte nicht gelesen werden: {e}"))?;
    if main.map_or(false, |m| is_browser_image(m) && m == src.as_path()) {
        let o = meta::read_exif(&src)
            .map(|e| meta::orientation(&e))
            .unwrap_or(1);
        Ok(apply_orientation(img, o))
    } else {
        Ok(match p.rotate {
            90 => img.rotate90(),
            180 => img.rotate180(),
            270 => img.rotate270(),
            _ => img,
        })
    }
}

pub fn thumb(cache: &Path, raw: Option<&Path>, main: Option<&Path>) -> Result<String, String> {
    let key_src = raw.or(main).ok_or("Keine Datei")?;
    let out = cache.join(format!("{}.jpg", cache_key(key_src, "thumb")));
    if !out.exists() {
        let img = load_upright(cache, raw, main)?;
        save_jpeg(&img.thumbnail(360, 360), &out, 80)?;
    }
    Ok(out.to_string_lossy().to_string())
}

/// Rote Maske für überbelichtete Stellen. Sie hat dieselbe Ausrichtung wie das angezeigte Bild.
/// Das Bild so laden, wie die Oberfläche es im <img> zeigt (für Masken, die genau darüber liegen).
/// Ein JPG/PNG dreht der Browser selbst anhand seiner EXIF-Daten, eine RAW-Vorschau dreht die Oberfläche.
fn as_displayed(
    cache: &Path,
    raw: Option<&Path>,
    main: Option<&Path>,
) -> Result<(PathBuf, DynamicImage), String> {
    let p = preview(cache, raw, main)?;
    let src = PathBuf::from(&p.src);
    let img = image::open(&src).map_err(|e| e.to_string())?;
    let img = if main.map_or(false, |m| m == src.as_path()) {
        let o = meta::read_exif(&src)
            .map(|e| meta::orientation(&e))
            .unwrap_or(1);
        apply_orientation(img, o)
    } else {
        img
    };
    Ok((src, img))
}

fn save_mask(mask: &RgbaImage, out: &Path) -> Result<(), String> {
    if !out.exists() {
        let tmp = unique_tmp(out);
        mask.save_with_format(&tmp, ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        replace_file(&tmp, out)?;
    }
    Ok(())
}

/// Belichtungs-Maske wie in Lightroom: zu helle Stellen rot, zu dunkle blau.
/// Zu hell: ein Farbkanal erreicht die Schwelle. Zu dunkel: alle Kanäle liegen
/// genauso nah an Schwarz (255 − Schwelle), z. B. 250 → hell ab 250, dunkel bis 5.
pub fn clip_mask(
    cache: &Path,
    raw: Option<&Path>,
    main: Option<&Path>,
    threshold: u8,
) -> Result<Mask, String> {
    let (src, img) = as_displayed(cache, raw, main)?;
    let out = cache.join(format!(
        "{}.png",
        cache_key(&src, &format!("expo{threshold}"))
    ));
    let small = img.thumbnail(1600, 1600).to_rgb8();
    let low = 255 - threshold;
    let mut mask = RgbaImage::new(small.width(), small.height());
    let (mut hi, mut lo) = (0usize, 0usize);
    for (x, y, px) in small.enumerate_pixels() {
        if px.0.iter().any(|&c| c >= threshold) {
            mask.put_pixel(x, y, Rgba([255, 40, 40, 210]));
            hi += 1;
        } else if px.0.iter().all(|&c| c <= low) {
            mask.put_pixel(x, y, Rgba([40, 120, 255, 220]));
            lo += 1;
        }
    }
    save_mask(&mask, &out)?;
    let total = (small.width() as usize * small.height() as usize).max(1);
    Ok(Mask {
        src: out.to_string_lossy().to_string(),
        percent: hi as f64 * 100.0 / total as f64,
        dark: lo as f64 * 100.0 / total as f64,
    })
}

/// Schärfe-Hilfe (Fokus-Peaking): Kanten mit starkem Kontrast werden grün markiert.
/// Die Schwelle passt sich an das Bild an, damit auch weiche Motive etwas zeigen.
pub fn focus_mask(cache: &Path, raw: Option<&Path>, main: Option<&Path>) -> Result<Mask, String> {
    let (src, img) = as_displayed(cache, raw, main)?;
    let out = cache.join(format!("{}.png", cache_key(&src, "focus2")));
    let gray = img.thumbnail(2000, 2000).to_luma8();
    let (w, h) = (gray.width() as usize, gray.height() as usize);
    let mut mask = RgbaImage::new(w as u32, h as u32);
    if w < 3 || h < 3 {
        save_mask(&mask, &out)?;
        return Ok(Mask {
            src: out.to_string_lossy().to_string(),
            percent: 0.0,
            dark: 0.0,
        });
    }
    let g = gray.as_raw();
    let px = |x: usize, y: usize| g[y * w + x] as i32;
    // Sobel-Operator: Stärke der Helligkeitsänderung je Bildpunkt
    let mut mag = vec![0u16; w * h];
    let mut hist = [0u32; 2041];
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let gx = px(x + 1, y - 1) + 2 * px(x + 1, y) + px(x + 1, y + 1)
                - px(x - 1, y - 1)
                - 2 * px(x - 1, y)
                - px(x - 1, y + 1);
            let gy = px(x - 1, y + 1) + 2 * px(x, y + 1) + px(x + 1, y + 1)
                - px(x - 1, y - 1)
                - 2 * px(x, y - 1)
                - px(x + 1, y - 1);
            let m = ((gx.abs() + gy.abs()) as u32).min(2040) as u16;
            mag[y * w + x] = m;
            hist[m as usize] += 1;
        }
    }
    // die stärksten 4 % der Kanten, mindestens aber ein deutlicher Kontrast
    let total: u32 = hist.iter().sum();
    let mut acc = 0u32;
    let mut threshold = 2040u16;
    for v in (0..=2040).rev() {
        acc += hist[v];
        if acc as f64 >= total as f64 * 0.04 {
            threshold = v as u16;
            break;
        }
    }
    let threshold = threshold.max(160);
    let mut count = 0usize;
    for y in 0..h {
        for x in 0..w {
            if mag[y * w + x] >= threshold {
                mask.put_pixel(x as u32, y as u32, Rgba([60, 255, 90, 235]));
                count += 1;
            }
        }
    }
    save_mask(&mask, &out)?;
    Ok(Mask {
        src: out.to_string_lossy().to_string(),
        percent: count as f64 * 100.0 / (w * h) as f64,
        dark: 0.0,
    })
}

/// Schärfe-Wert eines Bildes (größer = schärfer). Nur zum Vergleichen innerhalb eines Shootings gedacht.
///
/// Das Bild wird in Kacheln geteilt; je Kachel zählt, wie stark sich die Helligkeit von Punkt zu Punkt
/// ändert (Laplace-Filter). Bewertet werden die schärfsten 10 % der Kacheln – so gilt ein Porträt mit
/// unscharfem Hintergrund trotzdem als scharf, solange das Motiv scharf ist. Verwackelte oder falsch
/// fokussierte Bilder haben dagegen nirgends scharfe Kacheln.
/// Das Ergebnis wird zwischengespeichert, damit jedes Bild nur einmal berechnet wird.
pub fn sharpness(cache: &Path, raw: Option<&Path>, main: Option<&Path>) -> Result<f32, String> {
    let p = preview(cache, raw, main)?;
    let out = cache.join(format!("{}.txt", cache_key(Path::new(&p.src), "sharp1")));
    if let Some(v) = fs::read_to_string(&out)
        .ok()
        .and_then(|s| s.trim().parse::<f32>().ok())
    {
        return Ok(v);
    }
    let img = image::open(&p.src).map_err(|e| e.to_string())?;
    let gray = img.thumbnail(1600, 1600).to_luma8();
    let (w, h) = (gray.width() as usize, gray.height() as usize);
    if w < 32 || h < 32 {
        return Ok(0.0);
    }
    let g = gray.as_raw();
    const TX: usize = 16;
    const TY: usize = 12;
    let mut sum = vec![0f64; TX * TY];
    let mut cnt = vec![0u32; TX * TY];
    for y in 1..h - 1 {
        let ty = (y * TY / h).min(TY - 1);
        for x in 1..w - 1 {
            let c = g[y * w + x] as i32;
            let lap = g[y * w + x - 1] as i32
                + g[y * w + x + 1] as i32
                + g[(y - 1) * w + x] as i32
                + g[(y + 1) * w + x] as i32
                - 4 * c;
            let tx = (x * TX / w).min(TX - 1);
            sum[ty * TX + tx] += (lap * lap) as f64;
            cnt[ty * TX + tx] += 1;
        }
    }
    let mut tiles: Vec<f64> = sum
        .iter()
        .zip(&cnt)
        .map(|(s, &n)| if n > 0 { s / n as f64 } else { 0.0 })
        .collect();
    tiles.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    let top = (tiles.len() / 10).max(3);
    let v = (tiles[..top].iter().sum::<f64>() / top as f64).sqrt() as f32;
    let _ = fs::write(&out, format!("{v}"));
    Ok(v)
}

/// Speicherkarten finden: Laufwerke bzw. eingehängte Datenträger mit einem Ordner DCIM.
pub fn find_cards() -> Vec<String> {
    let mut out = Vec::new();
    #[cfg(windows)]
    {
        let sys = std::env::var("SystemDrive")
            .unwrap_or_else(|_| "C:".into())
            .to_uppercase();
        for l in b'D'..=b'Z' {
            let drive = format!("{}:", l as char);
            if drive == sys {
                continue;
            }
            let p = PathBuf::from(format!("{drive}\\DCIM"));
            if p.is_dir() {
                out.push(p.to_string_lossy().to_string());
            }
        }
    }
    #[cfg(not(windows))]
    {
        let user = std::env::var("USER").unwrap_or_default();
        let roots = [
            PathBuf::from("/Volumes"),
            PathBuf::from("/media").join(&user),
            PathBuf::from("/run/media").join(&user),
            PathBuf::from("/media"),
        ];
        for r in roots {
            if let Ok(it) = fs::read_dir(&r) {
                for e in it.flatten() {
                    let p = e.path().join("DCIM");
                    if p.is_dir() {
                        let s = p.to_string_lossy().to_string();
                        if !out.contains(&s) {
                            out.push(s);
                        }
                    }
                }
            }
        }
    }
    out
}

/// Histogramm: Häufigkeit jeder Helligkeitsstufe für Rot, Grün und Blau (je 256 Werte).
pub fn histogram(
    cache: &Path,
    raw: Option<&Path>,
    main: Option<&Path>,
) -> Result<Vec<Vec<u32>>, String> {
    let p = preview(cache, raw, main)?;
    let img = image::open(&p.src).map_err(|e| e.to_string())?;
    let small = img.thumbnail(800, 800).to_rgb8();
    let mut h = vec![vec![0u32; 256]; 3];
    for px in small.pixels() {
        h[0][px[0] as usize] += 1;
        h[1][px[1] as usize] += 1;
        h[2][px[2] as usize] += 1;
    }
    Ok(h)
}

/// Mittelgroße Vorschau (lange Kante 2048 px) – für den Vergleich vieler Bilder einer Serie.
/// Spart Arbeitsspeicher, weil nicht jedes Bild in voller Größe geladen wird.
pub fn medium(cache: &Path, raw: Option<&Path>, main: Option<&Path>) -> Result<Preview, String> {
    let key_src = raw.or(main).ok_or("Keine Datei")?;
    let out = cache.join(format!("{}.jpg", cache_key(key_src, "medium")));
    if !out.exists() {
        let img = load_upright(cache, raw, main)?;
        let img = if img.width().max(img.height()) > 2048 {
            img.resize(2048, 2048, image::imageops::FilterType::Triangle)
        } else {
            img
        };
        save_jpeg(&img, &out, 88)?;
    }
    Ok(Preview {
        src: out.to_string_lossy().to_string(),
        rotate: 0,
    })
}

/// Eindeutiger Name für eine Zwischendatei – mehrere Vorschauen können gleichzeitig entstehen.
fn unique_tmp(out: &Path) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let name = out
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    out.with_file_name(format!("{name}.{}-{n}.part", std::process::id()))
}

/// Zwischendatei an ihren Platz schieben. Hat ein gleichzeitiger Aufruf die Datei schon
/// angelegt (oder wird sie gerade angezeigt und ist gesperrt), ist das kein Fehler.
fn replace_file(tmp: &Path, out: &Path) -> Result<(), String> {
    match fs::rename(tmp, out) {
        Ok(()) => Ok(()),
        Err(_) if out.exists() => {
            let _ = fs::remove_file(tmp);
            Ok(())
        }
        Err(e) => {
            let _ = fs::remove_file(tmp);
            Err(e.to_string())
        }
    }
}

pub fn save_jpeg(img: &DynamicImage, path: &Path, quality: u8) -> Result<(), String> {
    let tmp = unique_tmp(path);
    {
        let f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        let mut w = std::io::BufWriter::new(f);
        let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, quality);
        DynamicImage::ImageRgb8(img.to_rgb8())
            .write_with_encoder(enc)
            .map_err(|e| e.to_string())?;
    }
    replace_file(&tmp, path)
}

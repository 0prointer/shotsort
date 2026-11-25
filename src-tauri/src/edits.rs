//! Drehen, Begradigen und Zuschneiden – immer nur für die Kopie, nie für das Original.

use image::{DynamicImage, Rgb, RgbImage};
use serde::Deserialize;

#[derive(Deserialize, Clone, Debug)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Bearbeitung, bezogen auf das aufrecht angezeigte Bild.
/// `crop` ist in Anteilen (0..1) des Bildes NACH Drehung (`rot`) angegeben.
#[derive(Deserialize, Clone, Debug, Default)]
pub struct Edits {
    #[serde(default)]
    pub rot: i32,
    #[serde(default)]
    pub angle: f64,
    #[serde(default)]
    pub crop: Option<Rect>,
}

impl Edits {
    pub fn is_identity(&self) -> bool {
        self.rot.rem_euclid(360) == 0 && self.angle.abs() < 1e-6 && self.crop.is_none()
    }
}

/// EXIF-Ausrichtung auf die Bildpunkte anwenden.
pub fn apply_orientation(img: DynamicImage, o: u32) -> DynamicImage {
    match o {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// Faktor, um den ein begradigtes Bild vergrößert wird, damit keine leeren Ecken entstehen.
/// Die Oberfläche verwendet dieselbe Formel.
pub fn straighten_scale(w: f64, h: f64, angle_deg: f64) -> f64 {
    let a = angle_deg.to_radians();
    a.cos().abs() + (w / h).max(h / w) * a.sin().abs()
}

fn bilinear(src: &RgbImage, x: f64, y: f64) -> Rgb<u8> {
    let (w, h) = (src.width() as f64, src.height() as f64);
    let x = x.clamp(0.0, w - 1.0);
    let y = y.clamp(0.0, h - 1.0);
    let (x0, y0) = (x.floor() as u32, y.floor() as u32);
    let x1 = (x0 + 1).min(src.width() - 1);
    let y1 = (y0 + 1).min(src.height() - 1);
    let (fx, fy) = (x - x0 as f64, y - y0 as f64);
    let p = |xx, yy| src.get_pixel(xx, yy).0;
    let (a, b, c, d) = (p(x0, y0), p(x1, y0), p(x0, y1), p(x1, y1));
    let mut out = [0u8; 3];
    for k in 0..3 {
        let top = a[k] as f64 * (1.0 - fx) + b[k] as f64 * fx;
        let bot = c[k] as f64 * (1.0 - fx) + d[k] as f64 * fx;
        out[k] = (top * (1.0 - fy) + bot * fy).round().clamp(0.0, 255.0) as u8;
    }
    Rgb(out)
}

/// Bearbeitung auf ein aufrechtes Bild anwenden.
pub fn render(img: DynamicImage, e: &Edits) -> RgbImage {
    let img = match e.rot.rem_euclid(360) {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };
    let src = img.to_rgb8();
    let (wf, hf) = (src.width() as f64, src.height() as f64);
    let r = e.crop.clone().unwrap_or(Rect {
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
    });
    let x0 = (r.x.clamp(0.0, 1.0) * wf).floor().min(wf - 1.0);
    let y0 = (r.y.clamp(0.0, 1.0) * hf).floor().min(hf - 1.0);
    let ow = ((r.w.clamp(0.0, 1.0) * wf).round() as u32).clamp(1, src.width() - x0 as u32);
    let oh = ((r.h.clamp(0.0, 1.0) * hf).round() as u32).clamp(1, src.height() - y0 as u32);

    if e.angle.abs() < 1e-6 {
        return image::imageops::crop_imm(&src, x0 as u32, y0 as u32, ow, oh).to_image();
    }
    // Begradigen: Bild um die Mitte drehen und so vergrößern, dass es den Rahmen füllt
    let s = straighten_scale(wf, hf, e.angle);
    let (sin, cos) = e.angle.to_radians().sin_cos();
    let mut out = RgbImage::new(ow, oh);
    for j in 0..oh {
        for i in 0..ow {
            let px = (x0 + i as f64 + 0.5 - wf / 2.0) / s;
            let py = (y0 + j as f64 + 0.5 - hf / 2.0) / s;
            let sx = px * cos + py * sin + wf / 2.0;
            let sy = -px * sin + py * cos + hf / 2.0;
            out.put_pixel(i, j, bilinear(&src, sx - 0.5, sy - 0.5));
        }
    }
    out
}

// ---------------------------------------------------------------------------
// XMP für RAW-Dateien (wird von Lightroom, Camera Raw, darktable u. a. gelesen)
// ---------------------------------------------------------------------------

fn deg_to_orientation(d: i32) -> u32 {
    match d.rem_euclid(360) {
        90 => 6,
        180 => 3,
        270 => 8,
        _ => 1,
    }
}

/// Punkt aus der angezeigten (gedrehten) Ansicht zurück in die Sensor-Ausrichtung rechnen.
fn unrotate(u: f64, v: f64, deg: i32) -> (f64, f64) {
    match deg.rem_euclid(360) {
        90 => (v, 1.0 - u),
        180 => (1.0 - u, 1.0 - v),
        270 => (1.0 - v, u),
        _ => (u, v),
    }
}

pub fn xmp(e: &Edits, camera_deg: i32) -> String {
    let total = camera_deg + e.rot;
    let mut attrs = format!("    tiff:Orientation=\"{}\"\n", deg_to_orientation(total));
    if let Some(c) = &e.crop {
        let (ax, ay) = unrotate(c.x, c.y, total);
        let (bx, by) = unrotate(c.x + c.w, c.y + c.h, total);
        attrs.push_str(&format!(
            "    crs:HasCrop=\"True\"\n    crs:CropLeft=\"{:.6}\"\n    crs:CropTop=\"{:.6}\"\n    crs:CropRight=\"{:.6}\"\n    crs:CropBottom=\"{:.6}\"\n    crs:CropAngle=\"{:.2}\"\n    crs:CropConstrainToWarp=\"0\"\n",
            ax.min(bx).clamp(0.0, 1.0),
            ay.min(by).clamp(0.0, 1.0),
            ax.max(bx).clamp(0.0, 1.0),
            ay.max(by).clamp(0.0, 1.0),
            e.angle
        ));
    } else if e.angle.abs() > 1e-6 {
        attrs.push_str(&format!(
            "    crs:HasCrop=\"True\"\n    crs:CropLeft=\"0\"\n    crs:CropTop=\"0\"\n    crs:CropRight=\"1\"\n    crs:CropBottom=\"1\"\n    crs:CropAngle=\"{:.2}\"\n",
            e.angle
        ));
    }
    format!(
        "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"ShotSort\">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n  <rdf:Description rdf:about=\"\"\n    xmlns:tiff=\"http://ns.adobe.com/tiff/1.0/\"\n    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\"\n    crs:HasSettings=\"True\"\n{attrs}  />\n </rdf:RDF>\n</x:xmpmeta>\n"
    )
}

// ---------------------------------------------------------------------------
// EXIF-Daten in das bearbeitete JPG übernehmen
// ---------------------------------------------------------------------------

/// Den EXIF-Block (APP1) eines JPEGs herauslösen.
pub fn exif_segment(d: &[u8]) -> Option<Vec<u8>> {
    if d.len() < 4 || d[0] != 0xFF || d[1] != 0xD8 {
        return None;
    }
    let mut i = 2;
    while i + 4 <= d.len() && d[i] == 0xFF {
        let m = d[i + 1];
        if m == 0xDA {
            return None;
        }
        let len = ((d[i + 2] as usize) << 8) | d[i + 3] as usize;
        let end = i + 2 + len;
        if end > d.len() {
            return None;
        }
        if m == 0xE1 && d[i + 4..].starts_with(b"Exif\0\0") {
            return Some(d[i..end].to_vec());
        }
        i = end;
    }
    None
}

/// Im EXIF-Block die Ausrichtung auf "normal" (1) setzen – die Pixel sind ja schon gedreht.
pub fn reset_orientation(seg: &mut [u8]) {
    let base = 10; // FF E1 + Länge (2) + "Exif\0\0" (6)
    if seg.len() < base + 8 {
        return;
    }
    let le = &seg[base..base + 2] == b"II";
    let rd16 = |b: &[u8], o: usize| -> usize {
        if le {
            u16::from_le_bytes([b[o], b[o + 1]]) as usize
        } else {
            u16::from_be_bytes([b[o], b[o + 1]]) as usize
        }
    };
    let rd32 = |b: &[u8], o: usize| -> usize {
        let a = [b[o], b[o + 1], b[o + 2], b[o + 3]];
        if le {
            u32::from_le_bytes(a) as usize
        } else {
            u32::from_be_bytes(a) as usize
        }
    };
    let tiff = &seg[base..];
    let ifd = rd32(tiff, 4);
    if ifd + 2 > tiff.len() {
        return;
    }
    let count = rd16(tiff, ifd);
    for k in 0..count {
        let e = ifd + 2 + k * 12;
        if e + 12 > tiff.len() {
            return;
        }
        if rd16(tiff, e) == 0x0112 {
            let pos = base + e + 8;
            let v: [u8; 2] = if le {
                1u16.to_le_bytes()
            } else {
                1u16.to_be_bytes()
            };
            seg[pos] = v[0];
            seg[pos + 1] = v[1];
            return;
        }
    }
}

/// EXIF-Block direkt hinter dem Dateianfang (und ggf. hinter APP0) einfügen.
pub fn insert_segment(jpeg: &[u8], seg: &[u8]) -> Vec<u8> {
    let mut pos = 2;
    if jpeg.len() > 6 && jpeg[2] == 0xFF && jpeg[3] == 0xE0 {
        pos = 4 + (((jpeg[4] as usize) << 8) | jpeg[5] as usize);
    }
    let mut out = Vec::with_capacity(jpeg.len() + seg.len());
    out.extend_from_slice(&jpeg[..pos]);
    out.extend_from_slice(seg);
    out.extend_from_slice(&jpeg[pos..]);
    out
}

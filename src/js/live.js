// Live-Überwachung des Quellordners: Neue Bilder (z. B. beim Fotografieren mit Kabel am Laptop
// oder wenn noch Dateien von der Karte kopiert werden) erscheinen während der Sitzung in der Filmleiste.
//
// Ablauf: Alle 2 Sekunden einen schnellen „Fingerabdruck“ des Ordners holen (Anzahl, Größe, jüngste
// Änderung – ohne EXIF). Hat er sich geändert und ist danach eine Runde lang gleich geblieben, werden
// nur die neuen Bilder eingelesen. Dateien, die noch geschrieben werden, kommen in der nächsten Runde.

import { api } from './api.js';
import { S } from './state.js';

const FAST = 2000; // normaler Abstand
const SLOW = 10000; // bei großen oder langsamen Ordnern (Netzlaufwerk) und wenn der Ordner fehlt

let timer = 0;
let token = 0;

/** Überwachung starten. onNew(items) bekommt die neu gefundenen Bilder (sortiert wie beim Einlesen). */
export function startLive(onNew) {
  stopLive();
  if (S.settings.liveWatch === false || !S.session) return;
  const t = ++token;
  const sess = S.session;
  let lastSeen = null; // Fingerabdruck der letzten Runde
  let ingested = null; // Fingerabdruck nach dem letzten vollständigen Einlesen
  let pending = false; // es gab noch Dateien, die gerade geschrieben wurden

  const exclude = () => sess.targets.map((x) => x.path);

  const tick = async () => {
    if (t !== token) return;
    let delay = FAST;
    try {
      const t0 = performance.now();
      const stamp = await api.folderStamp(sess.source, S.settings.subfolders, exclude());
      if (performance.now() - t0 > 800) delay = SLOW;
      if (t !== token) return;
      // geändert und seit einer Runde unverändert (oder noch offene Dateien) -> neue Bilder einlesen
      if (pending || (stamp !== ingested && stamp === lastSeen)) {
        const known = S.items.map((it) => it.id);
        const res = await api.scanNew(sess.source, S.settings.subfolders, exclude(), known);
        if (t !== token) return;
        pending = res.pending > 0;
        if (!pending) ingested = stamp;
        if (res.items.length) onNew(sortLike(res.items));
      }
      lastSeen = stamp;
    } catch {
      // Ordner gerade nicht erreichbar (z. B. Karte gezogen) – still weiter versuchen
      delay = SLOW;
    }
    if (t === token) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, FAST);
}

export function stopLive() {
  token++;
  clearTimeout(timer);
}

/** Läuft die Überwachung gerade? */
export const liveOn = () => S.settings.liveWatch !== false;

/** Vergleich wie beim Einlesen in Rust (scan.rs): nach Aufnahmezeit oder nach Ordner und Name. */
export function compareItems(a, b) {
  const s = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  if (S.settings.sort === 'name') return s(a.dir, b.dir) || s(a.name, b.name);
  return s(a.taken || '', b.taken || '') || s(a.dir, b.dir) || s(a.name, b.name);
}

const sortLike = (items) => [...items].sort(compareItems);

/**
 * Neue Bilder an der richtigen Stelle in S.items einsortieren.
 * Das aktuelle Bild bleibt das aktuelle (seine Position kann sich verschieben).
 * Gibt die Positionen der eingefügten Bilder zurück.
 */
export function insertItems(items) {
  const sess = S.session;
  const curId = S.items[sess.index]?.id;
  const list = [...S.items];
  for (const it of items) {
    // fast immer die neuesten Bilder -> von hinten suchen
    let i = list.length;
    while (i > 0 && compareItems(list[i - 1], it) > 0) i--;
    list.splice(i, 0, it);
  }
  // neue Liste statt Änderung an Ort und Stelle: Zwischenspeicher (z. B. Serien) erkennen die Änderung
  S.items = list;
  sess.total = list.length;
  sess.stamps = sess.stamps || {};
  for (const it of items) sess.stamps[it.id] = it.taken || '';
  if (curId) sess.index = Math.max(0, list.findIndex((x) => x.id === curId));
  const ids = new Set(items.map((it) => it.id));
  return list.map((it, i) => (ids.has(it.id) ? i : -1)).filter((i) => i >= 0);
}

// Einstellungen und Sitzungen dauerhaft speichern (als JSON im App-Datenordner).

import { api } from './api.js';
import { defaultKeys } from './keys.js';

export const COLORS = ['#6CCB5F', '#4CC2FF', '#C49BFF', '#FFB454', '#FF8FB1', '#5ED6C7', '#E8D36A', '#A0A8FF', '#FF9E7A'];

export const DEFAULT_SETTINGS = {
  theme: 'dark', // dark | light | system
  toastMs: 2500,
  clipThreshold: 250,
  keepZoom: true,
  conflict: 'number', // number | skip
  rawMode: 'xmp', // xmp | jpg
  jpgQuality: 95,
  preload: 10, // Bilder, die im Voraus geladen werden
  confirmDelete: true,
  autoNext: false,
  autoUpdate: true, // beim Start und alle 6 Stunden still nach Updates suchen
  subfolders: true,
  sort: 'time', // time | name
  gridSize: 200, // Bildhöhe in der Rasteransicht (Strg + Mausrad)
  seriesGap: 2, // Sekunden zwischen zwei Bildern einer Serie (0 = keine Serien)
  keys: defaultKeys(),
};

export async function loadJSON(name, fallback) {
  try {
    const s = await api.storeGet(name);
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    console.warn('Laden fehlgeschlagen', name, e);
    return fallback;
  }
}

export async function saveJSON(name, value) {
  try {
    await api.storeSet(name, JSON.stringify(value));
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', name, e);
  }
}

export async function loadSettings() {
  const s = await loadJSON('einstellungen', {});
  // Neue Aktionen bekommen ihre Standardtaste – außer sie ist schon anders vergeben
  const keys = { ...(s.keys || {}) };
  const used = new Set(Object.values(keys));
  for (const [id, k] of Object.entries(defaultKeys())) {
    if (!(id in keys)) keys[id] = used.has(k) ? '' : k;
  }
  // Reste früherer Versionen entfernen
  delete s.cmpTipSeen;
  delete keys.compare;
  return { ...DEFAULT_SETTINGS, ...s, keys };
}

export const saveSettings = (s) => saveJSON('einstellungen', s);

/** Dateiname für die Sitzung eines Quellordners. */
export function sessionKey(source) {
  let h = 2166136261;
  for (const ch of source.toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'sitzung-' + h.toString(16);
}

export function folderName(path) {
  return (path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
}

export function newSession(source) {
  return {
    source,
    name: folderName(source),
    targets: [],
    index: 0,
    copied: {}, // Bild-ID -> { Zielpfad -> { stem, files, renamed } }
    edits: {}, // Bild-ID -> { rot, angle, crop, aspect }
    deleted: {}, // Bild-ID -> [ { from, to } ]
    seen: {}, // Bild-ID -> 1
    total: 0,
    started: Date.now(),
    activeMs: 0,
    done: false,
  };
}

let saveTimer = null;

/** Sitzung verzögert speichern (fasst viele schnelle Änderungen zusammen). */
export function scheduleSave(session) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession(session), 400);
}

export async function saveSession(session) {
  clearTimeout(saveTimer);
  if (!session) return;
  await saveJSON(sessionKey(session.source), session);
  const list = await loadJSON('sitzungen', []);
  const entry = {
    source: session.source,
    name: session.name,
    total: session.total,
    index: session.index,
    copiedCount: Object.keys(session.copied).length,
    // Fortschritt = angesehene Bilder (ohne gelöschte) von allen Bildern (ohne gelöschte)
    seenCount: Object.keys(session.seen || {}).filter((id) => !session.deleted[id]).length,
    aliveTotal: session.total - Object.keys(session.deleted).length,
    updated: Date.now(),
    done: session.done,
  };
  const rest = list.filter((x) => x.source.toLowerCase() !== session.source.toLowerCase());
  await saveJSON('sitzungen', [entry, ...rest].slice(0, 12));
}

export const loadSession = (source) => loadJSON(sessionKey(source), null);

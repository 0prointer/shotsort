// Gemeinsamer Zustand der App.

export const S = {
  settings: null, // siehe store.js -> DEFAULT_SETTINGS
  session: null, // aktuelle Sitzung (Quelle, Ziele, kopierte Bilder ...)
  items: [], // eingelesene Bilder, sortiert
  videos: 0, // übersprungene Videos
  filter: 'all', // 'all' | 'none' | Pfad eines Zielordners
  compareSel: [], // Bild-IDs für die Vergleichsansicht
  undo: [], // Rückgängig-Liste
  previews: new Map(), // Bild-ID -> { src, rotate }
  thumbs: new Map(), // Bild-ID -> Pfad der Miniatur
  infos: new Map(), // Bild-ID -> EXIF-Infos
  targetState: {}, // Zielpfad -> 'err' | 'low'
  banners: [], // Fehlermeldungen und Hinweise, die stehen bleiben
  clip: false, // Überbelichtung anzeigen
  focus: false, // Schärfe-Hilfe anzeigen
  grid: false, // Rasteransicht statt Einzelbild
  mediums: new Map(), // Bild-ID -> mittelgroße Vorschau (für Serien-Vergleich)
  histos: new Map(), // Bild-ID -> Histogramm [[r], [g], [b]]
  showInfo: false,
  fullscreen: false,
  lastView: null, // Zoom, der beim Blättern erhalten bleibt
  returnTo: 'start', // wohin "Zurück" aus den Einstellungen führt
  onChange: null, // wird von der aktiven Ansicht gesetzt
};

export const nav = { go: () => {} };
export const go = (name, params) => nav.go(name, params);

export function resetSessionState() {
  S.items = [];
  S.videos = 0;
  S.filter = 'all';
  S.unseenSnap = null;
  S.blurrySnap = null; // Filter „Möglicherweise unscharf“: beim Wählen festgehaltene Bild-IDs
  S.sharpBest = new Set();
  S.blurry = new Set(); // Filter „Nicht angesehen“: beim Wählen festgehaltene Bild-IDs
  S.compareSel = [];
  S.undo = [];
  S.previews.clear();
  S.thumbs.clear();
  S.infos.clear();
  S.mediums.clear();
  S.histos.clear();
  S.grid = false;
  S.targetState = {};
  S.banners = [];
  S.lastView = null;
}

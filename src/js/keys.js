// Tastenkürzel – auf dem Mac mit ⌘ statt Strg und ⌫ statt Entf.

export const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent);

/** Belegbare Aktionen mit Standardtaste. */
export const ACTIONS = [
  { id: 'next', label: 'Nächstes Bild', key: 'ArrowRight' },
  { id: 'prev', label: 'Vorheriges Bild', key: 'ArrowLeft' },
  { id: 'copy1', label: 'In Zielordner 1 kopieren', key: ' ' },
  { id: 'del', label: 'Löschen (Papierkorb)', key: isMac ? 'Backspace' : 'Delete' },
  { id: 'rotate', label: 'Drehen', key: 'r' },
  { id: 'crop', label: 'Zuschneiden', key: 'c' },
  { id: 'zoom', label: 'Ganzes Bild / 100 %', key: 'z' },
  { id: 'clip', label: 'Zu helle / zu dunkle Stellen anzeigen', key: 'o' },
  { id: 'focus', label: 'Schärfe-Hilfe anzeigen', key: 'p' },
  { id: 'shadows', label: 'Ansicht: Schatten aufhellen', key: 'h' },
  { id: 'highlights', label: 'Ansicht: Lichter prüfen', key: 'l' },
  { id: 'mono', label: 'Ansicht: Schwarzweiß', key: 'm' },
  { id: 'external', label: 'In externem Programm öffnen', key: 'e' },
  { id: 'strip', label: 'Filmleiste ein-/ausblenden', key: 'b' },
  { id: 'grid', label: 'Rasteransicht', key: 'g' },
  { id: 'series', label: 'Serie vergleichen', key: 's' },
  { id: 'drop', label: 'Aus dem Vergleich nehmen', key: 'x' },
  { id: 'info', label: 'Info-Leiste', key: 'i' },
  { id: 'fullscreen', label: 'Vollbild', key: 'f' },
  { id: 'bare', label: 'Nur Bild (Leisten ausblenden)', key: 'Tab' },
];

export const defaultKeys = () => Object.fromEntries(ACTIONS.map((a) => [a.id, a.key]));

export const MOD = isMac ? '⌘' : 'Strg+';

export function isMod(e) {
  return isMac ? e.metaKey : e.ctrlKey;
}

export function normKey(e) {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

export function keyLabel(k) {
  const map = {
    ' ': 'Leertaste',
    ArrowRight: '→',
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Delete: 'Entf',
    Backspace: isMac ? '⌫' : 'Rücktaste',
    Enter: isMac ? '↩' : 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
  };
  if (map[k]) return map[k];
  return k.length === 1 ? k.toUpperCase() : k;
}

/** Alle Kürzel für die Hilfe-Übersicht. */
/** Alle Kürzel für die Hilfe-Übersicht, nach Themen gruppiert. */
export function helpList(keys) {
  const k = (id) => keyLabel(keys[id]);
  return [
    ['Blättern', [
      [`${k('prev')} / ${k('next')}`, 'vorheriges / nächstes Bild'],
      ['Esc', 'zurück / abbrechen'],
    ]],
    ['Kopieren & Löschen', [
      ['1 – 9', 'in Zielordner kopieren'],
      [k('copy1'), 'in Zielordner 1 kopieren'],
      [k('del'), 'löschen (Papierkorb)'],
      [MOD + 'Z', 'rückgängig'],
    ]],
    ['Bearbeiten', [
      [k('rotate'), 'drehen'],
      [k('crop'), 'zuschneiden'],
      [k('external'), 'in externem Programm öffnen (z. B. Lightroom)'],
    ]],
    ['Ansicht', [
      [k('zoom'), 'ganzes Bild / 100 % · gedrückt halten: nur kurz 100 %'],
      ['Mausrad', 'stufenlos zoomen'],
      ['Doppelklick', 'ganzes Bild / 100 %'],
      [k('clip'), 'zu helle (rot) / zu dunkle (blau) Stellen'],
      [k('focus'), 'Schärfe-Hilfe (scharfe Kanten grün)'],
      [k('shadows'), 'Schatten aufhellen (nur Ansicht)'],
      [k('highlights'), 'Lichter prüfen (nur Ansicht)'],
      [k('mono'), 'Schwarzweiß (nur Ansicht)'],
      [k('grid'), 'Rasteransicht'],
      [k('strip'), 'Filmleiste ein-/ausblenden'],
      [k('info'), 'Info-Leiste'],
      [`${k('fullscreen')} / F11`, 'Vollbild'],
      [k('bare'), 'nur Bild – Leisten ausblenden'],
    ]],
    ['Vergleichen', [
      [isMac ? '⌘ + Klick' : 'Strg + Klick', 'Bild in der Filmleiste dazunehmen / herausnehmen'],
      [isMac ? '⇧ + → / ←' : 'Umschalt + → / ←', 'nächstes Bild dazunehmen'],
      [k('series'), 'ganze Serie vergleichen'],
      ['← → ↑ ↓', 'aktives Bild im Vergleich wechseln'],
      [k('drop'), 'aktives Bild aus dem Vergleich nehmen'],
      ['Enter / Esc', 'Vergleich beenden'],
    ]],
    ['Allgemein', [
      ['?', 'diese Übersicht'],
      [MOD + ',', 'Einstellungen'],
    ]],
  ];
}

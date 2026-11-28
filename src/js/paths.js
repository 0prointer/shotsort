// Kleine Helfer für Pfade: Ordnernamen bereinigen, Pfade zusammensetzen, Cloud-Ordner erkennen.

/** Zeichen, die unter Windows in Datei- und Ordnernamen nicht erlaubt sind, entfernen. */
export function cleanName(s) {
  return String(s || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.\-_]+|[\s.\-_]+$/g, '') // keine Punkte/Leerzeichen am Rand (Windows mag das nicht)
    .slice(0, 120);
}

/** Pfad aus Teilen zusammensetzen – mit dem Trennzeichen, das der Basisordner schon benutzt. */
export function joinPath(base, ...parts) {
  const sep = base.includes('\\') || /^[A-Za-z]:/.test(base) ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts.filter(Boolean)].join(sep);
}

/** Beispiel für einen Basisordner – passend zum System. */
export const EXAMPLE_BASE = /Win/i.test(navigator.platform || '') ? 'D:\\Fotos' : '~/Bilder';

/** Heutiges Datum als JJJJ-MM-TT (lokale Zeit). */
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Namensmuster ausfüllen. Platzhalter: {Datum} {Jahr} {Monat} {Name}.
 * „\“ oder „/“ im Muster legt Unterordner an, z. B. „{Jahr}\{Datum} {Name}“.
 * Gibt die bereinigten Ordnerebenen zurück (leere Ebenen fallen weg).
 */
export function fillPattern(pattern, name, date = today()) {
  const [y, m] = date.split('-');
  const filled = String(pattern || '{Datum} {Name}')
    .replace(/\{datum\}/gi, date)
    .replace(/\{jahr\}/gi, y)
    .replace(/\{monat\}/gi, m)
    .replace(/\{name\}/gi, cleanName(name));
  return filled.split(/[\\/]+/).map(cleanName).filter(Boolean);
}

/**
 * Liegt der Ordner in einem synchronisierten Cloud-Ordner? Gibt den Namen des Dienstes zurück (sonst null).
 * Dort lädt jede Kopie sofort hoch – bei großen RAW-Dateien bremst das Kopieren und Internet stark.
 */
export function cloudName(path) {
  const p = String(path || '').replace(/\\/g, '/');
  const rules = [
    [/\/OneDrive( - [^/]+)?(\/|$)/i, 'OneDrive'],
    [/\/Dropbox( \([^/]+\))?(\/|$)/i, 'Dropbox'],
    [/\/(Google Drive|My Drive|Meine Ablage|GoogleDrive)(\/|$)/i, 'Google Drive'],
    [/\/iCloud ?Drive(\/|$)/i, 'iCloud Drive'],
    [/\/(pCloud Drive|MEGAsync|Nextcloud|ownCloud)(\/|$)/i, null],
  ];
  for (const [re, label] of rules) {
    const m = re.exec(p);
    if (m) return label || m[1];
  }
  return null;
}

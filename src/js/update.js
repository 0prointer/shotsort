// Automatische Updates über GitHub Releases (Rust-Teil: check_update / install_update in lib.rs).
// Beim Start wird still im Hintergrund nachgesehen. Gefunden wird ein Hinweis auf dem Startbildschirm
// und in den Einstellungen angezeigt – nie mitten im Sortieren.

import { invoke, listen } from './api.js';

export const U = {
  info: null, // { version, current, notes } wenn ein Update bereitsteht
  state: 'idle', // idle | checking | none | available | loading | error
  progress: 0, // 0–100 beim Herunterladen
  error: '',
};

const subs = new Set();
/** Auf Änderungen hören. Gibt eine Funktion zum Abmelden zurück. */
export function onUpdateChange(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}
const emit = () => subs.forEach((cb) => cb(U));

export async function appVersion() {
  try {
    return await window.__TAURI__.app.getVersion();
  } catch {
    return '';
  }
}

/** Nach einem Update suchen. silent: Fehler (z. B. offline) nicht anzeigen. */
export async function checkUpdate({ silent = false } = {}) {
  if (U.state === 'checking' || U.state === 'loading') return;
  U.state = 'checking';
  emit();
  try {
    U.info = await invoke('check_update');
    U.state = U.info ? 'available' : 'none';
  } catch (e) {
    U.info = null;
    U.state = silent ? 'idle' : 'error';
    U.error = String(e);
  }
  emit();
}

/** Update laden und installieren. Die App schließt sich dabei und startet neu. */
export async function installUpdate() {
  if (U.state !== 'available') return;
  U.state = 'loading';
  U.progress = 0;
  emit();
  const stop = await listen('update-progress', (e) => {
    const [done, total] = e.payload;
    if (total) {
      U.progress = Math.min(100, Math.round((done / total) * 100));
      emit();
    }
  });
  try {
    await invoke('install_update');
  } catch (e) {
    U.state = 'error';
    U.error = String(e);
    emit();
  } finally {
    stop();
  }
}

/** Kurzer Text für Hinweise. */
export function updateText() {
  switch (U.state) {
    case 'checking':
      return 'Suche nach Updates …';
    case 'none':
      return 'ShotSort ist auf dem neuesten Stand.';
    case 'available':
      return `Version ${U.info.version} ist verfügbar.`;
    case 'loading':
      return `Update wird geladen … ${U.progress} %`;
    case 'error':
      return `Update fehlgeschlagen: ${U.error}`;
    default:
      return '';
  }
}

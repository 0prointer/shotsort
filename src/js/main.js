import { appWindow } from './api.js';
import { checkUpdate } from './update.js';
// Einstiegspunkt der Oberfläche: Ansichten wechseln, Tastatur, Farbschema.

import { S, nav } from './state.js';
import { loadSettings } from './store.js';
import { isMod } from './keys.js';
import { modalOpen, setToastDuration, toast } from './ui.js';
import { applyTheme } from './theme.js';
import { toggleFullscreen, setImageView } from './fullscreen.js';
import * as start from './views/start.js';
import * as loading from './views/loading.js';
import * as empty from './views/empty.js';
import * as sorter from './views/sorter.js';
import * as finish from './views/finish.js';
import * as settings from './views/settings.js';
import * as trash from './views/trash.js';

const views = { start, loading, empty, sorter, finish, settings, trash };
let current = null;
let currentName = null;

nav.go = (name, params) => {
  setImageView(name === 'sorter');
  try {
    current?.unmount?.();
  } catch (e) {
    console.error(e);
  }
  const root = document.getElementById('app');
  root.innerHTML = '';
  currentName = name;
  current = views[name].mount(root, params) || {};
};

document.addEventListener('keydown', (e) => {
  if (modalOpen()) return;
  const tag = e.target?.tagName;
  if ((tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') && e.key !== 'Escape') return;
  // F11 schaltet überall das Vollbild um (wie in Windows üblich)
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  if (isMod(e) && e.key === ',') {
    e.preventDefault();
    if (currentName !== 'settings') {
      S.returnTo = currentName === 'sorter' ? 'sorter' : 'start';
      nav.go('settings');
    }
    return;
  }
  current?.onKey?.(e);
});

// Rechtsklick-Menü des Browsers ausblenden (wirkt sonst fremd in einer App)
document.addEventListener('contextmenu', (e) => {
  if (!['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Fehler: ' + (e.reason?.message || e.reason), '#FF99A4');
});

// Das Fenster startet unsichtbar (kein weißes Aufblitzen) und erscheint, sobald die Startseite gezeichnet ist.
function showWindow() {
  try {
    appWindow().show();
  } catch {
    /* im Browser-Test gibt es kein Fenster */
  }
}

async function init() {
  try {
    S.settings = await loadSettings();
    applyTheme(S.settings.theme);
    setToastDuration(S.settings.toastMs);
    nav.go('start');
  } finally {
    // erst nach dem nächsten Zeichnen zeigen, damit sofort die fertige Seite zu sehen ist
    requestAnimationFrame(() => requestAnimationFrame(showWindow));
  }
  // Still im Hintergrund nach Updates suchen, wenn die App läuft
  setTimeout(() => checkUpdate({ silent: true }), 3000);
}

init();

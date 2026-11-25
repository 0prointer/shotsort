// Vollbild – gilt für die Sortier- und die Vergleichsansicht.
// Im Vollbild verschwinden die Leisten und erscheinen kurz, wenn die Maus bewegt wird.

import { appWindow } from './api.js';
import { S } from './state.js';

let timer = null;

export async function setFullscreen(on) {
  S.fullscreen = on;
  document.body.classList.toggle('fs', on);
  document.body.classList.remove('fs-show');
  try {
    await appWindow().setFullscreen(on);
  } catch {
    /* ignorieren */
  }
  window.dispatchEvent(new Event('fs-change'));
}

export const toggleFullscreen = () => setFullscreen(!S.fullscreen);

/** Vollbild-Knopf, der sein Symbol selbst anpasst. Gibt eine Aufräum-Funktion zurück. */
export function bindFullscreenButton(btn, icons, keyText = 'F11') {
  const draw = () => {
    const label = (S.fullscreen ? 'Vollbild beenden' : 'Vollbild') + ` (${keyText})`;
    btn.innerHTML = S.fullscreen ? icons.fullExit : icons.full;
    btn.title = label;
    btn.setAttribute('aria-label', label);
  };
  btn.onclick = toggleFullscreen;
  draw();
  window.addEventListener('fs-change', draw);
  return () => window.removeEventListener('fs-change', draw);
}

/** Leisten automatisch ausblenden – nur in der Sortier- und Vergleichsansicht. */
export function setImageView(on) {
  document.body.classList.toggle('imgview', on);
}

document.addEventListener('mousemove', () => {
  if (!S.fullscreen) return;
  document.body.classList.add('fs-show');
  clearTimeout(timer);
  timer = setTimeout(() => document.body.classList.remove('fs-show'), 1800);
});

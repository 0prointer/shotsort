// Vollbild: das Fenster füllt den Bildschirm (ohne Titel- und Taskleiste), alle Leisten bleiben.
// Leisten ausblenden ist eine eigene Ansicht („Nur Bild“, siehe unten).

import { appWindow } from './api.js';
import { S } from './state.js';

let timer = null;

export async function setFullscreen(on) {
  S.fullscreen = on;
  document.body.classList.toggle('fs', on);
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

/** „Nur Bild“: Leisten ausblenden, Bild so groß wie möglich. Die Leisten erscheinen über dem Bild,
 *  wenn die Maus an einen Rand fährt (oben, rechts, unten), und verschwinden danach wieder. */
document.addEventListener('mousemove', (e) => {
  const b = document.body;
  if (!b.classList.contains('bare')) return;
  const overBar = e.target.closest?.('.topbar, .vtools, .filmstrip, .filter-menu, .tip');
  const nearEdge = e.clientY < 70 || e.clientY > innerHeight - 70 || e.clientX > innerWidth - 70;
  if (overBar || nearEdge) {
    b.classList.add('bare-show');
    clearTimeout(timer);
    timer = setTimeout(() => b.classList.remove('bare-show'), overBar ? 4000 : 1500);
  } else if (b.classList.contains('bare-show')) {
    clearTimeout(timer);
    timer = setTimeout(() => b.classList.remove('bare-show'), 500);
  }
});

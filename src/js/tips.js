// Einführung für neue Nutzer: eine Karte beim ersten Sortieren und kurze Tipps im passenden Moment.
// Jeder Hinweis erscheint nur einmal; gemerkt wird das in den Einstellungen (S.settings.tips).
// „Tipps wieder anzeigen“ in den Einstellungen setzt alles zurück.

import { S } from './state.js';
import { saveSettings } from './store.js';
import { esc } from './ui.js';

let host = null; // Element, in dem Karte und Tipps erscheinen (Bildbereich der Sortieransicht)
let card = null;
let tipEl = null;
let tipTimer = 0;
let introSteps = 0;

const seen = (id) => !!S.settings.tips?.[id];
function markSeen(id) {
  S.settings.tips = { ...(S.settings.tips || {}), [id]: 1 };
  saveSettings(S.settings);
}

/** Sortieransicht meldet ihren Bildbereich an (und beim Verlassen null). */
export function setTipHost(el) {
  host = el;
  card = null;
  tipEl = null;
  clearTimeout(tipTimer);
}

export const introVisible = () => !!card?.isConnected;

/** Einführungskarte beim ersten Sortieren. keys: { prev, next, del, help } als lesbare Tasten. */
export function showIntro(keys) {
  if (!host || seen('intro') || introVisible()) return;
  introSteps = 0;
  host.insertAdjacentHTML(
    'beforeend',
    `<div class="intro-card" role="dialog" aria-label="Erste Schritte">
      <div class="ic-head"><b>Erste Schritte</b><button class="ic-x" aria-label="Schließen">✕</button></div>
      <div class="ic-row"><kbd>${esc(keys.prev)} ${esc(keys.next)}</kbd>Bilder durchblättern</div>
      <div class="ic-row"><kbd>1 – 9</kbd>In den Zielordner kopieren</div>
      <div class="ic-row"><kbd>${esc(keys.del)}</kbd>Löschen (lässt sich zurückholen)</div>
      <div class="ic-row"><kbd>?</kbd>Alle Tastenkürzel</div>
      <div class="ic-foot"><span>Die Originale bleiben immer unverändert.</span><button class="btn primary sm ic-ok">Verstanden</button></div>
    </div>`
  );
  card = host.lastElementChild;
  const close = () => closeIntro();
  card.querySelector('.ic-x').onclick = close;
  card.querySelector('.ic-ok').onclick = close;
}

export function closeIntro() {
  if (!card) return;
  markSeen('intro');
  card.classList.add('leaving');
  const c = card;
  card = null;
  setTimeout(() => c.remove(), 200);
}

/** Wer einfach losblättert, braucht die Karte nicht: nach ein paar Bildern verschwindet sie von selbst. */
export function introProgress() {
  if (introVisible() && ++introSteps >= 5) closeIntro();
}

/** Kurzer Tipp (nur einmal je id). html darf <kbd> enthalten – Texte darin vorher escapen. */
export function tip(id, html) {
  if (!host || seen(id) || introVisible()) return;
  markSeen(id);
  hideTip();
  host.insertAdjacentHTML('beforeend', `<div class="tip-line" role="status"><span class="tl-label">Tipp</span><span>${html}</span><button class="tl-x" aria-label="Tipp schließen">✕</button></div>`);
  tipEl = host.lastElementChild;
  tipEl.querySelector('.tl-x').onclick = hideTip;
  const shownAt = Date.now();
  tipTimer = setTimeout(hideTip, 7000);
  // beim nächsten Tastendruck ausblenden (nicht beim Tastendruck, der den Tipp ausgelöst hat)
  const onKey = () => {
    if (Date.now() - shownAt < 400) return;
    document.removeEventListener('keydown', onKey, true);
    hideTip();
  };
  document.addEventListener('keydown', onKey, true);
}

export function hideTip() {
  clearTimeout(tipTimer);
  if (!tipEl) return;
  const t = tipEl;
  tipEl = null;
  t.classList.add('leaving');
  setTimeout(() => t.remove(), 200);
}

/** Einstellungen: alle Hinweise wieder anzeigen. */
export function resetTips() {
  S.settings.tips = {};
  saveSettings(S.settings);
}

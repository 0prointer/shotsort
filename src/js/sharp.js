// Schärfe-Erkennung: rechnet im Hintergrund für jedes Bild einen Schärfe-Wert aus (Rust: sharpness)
// und leitet daraus zwei Markierungen ab:
// - S.sharpBest: das schärfste Bild jeder Serie
// - S.blurry:    möglicherweise unscharfe Bilder
// Die Werte sind nur im Vergleich aussagekräftig: innerhalb einer Serie mit dem schärfsten Bild,
// sonst mit dem typischen Wert (Median) des ganzen Shootings. Gespeichert werden sie in der Sitzung.

import { api } from './api.js';
import { S } from './state.js';
import * as A from './actions.js';

const SERIES_RATIO = 0.5; // in einer Serie: deutlich weniger scharf als das schärfste Bild
const SHOOT_RATIO = 0.35; // einzeln: deutlich weniger scharf als ein typisches Bild des Shootings

let token = 0;

/** Analyse starten (oder neu starten). onChange wird zwischendurch und am Ende aufgerufen. */
export function startSharpness(onChange) {
  const t = ++token;
  S.sharpBest = new Set();
  S.blurry = new Set();
  if (S.settings.detectBlur === false || !S.session) return;
  const sess = S.session;
  sess.sharp = sess.sharp || {};
  recompute();
  onChange?.();
  // ab dem aktuellen Bild nach vorne, dann der Rest – so ist zuerst fertig, was man als Nächstes sieht
  const n = S.items.length;
  const todo = [];
  for (let k = 0; k < n; k++) {
    const it = S.items[(sess.index + k) % n];
    if (!(it.id in sess.sharp) && !A.isDeleted(it.id)) todo.push(it);
  }
  if (!todo.length) return;
  let i = 0;
  let done = 0;
  const worker = async () => {
    while (t === token && i < todo.length) {
      // Vorschaubilder in der Filmleiste haben Vorrang – sonst teilen sich beide den Prozessor
      while (t === token && S.thumbLoad?.() > 0) await new Promise((r) => setTimeout(r, 150));
      if (t !== token || i >= todo.length) return;
      const it = todo[i++];
      try {
        sess.sharp[it.id] = await api.sharpness(it);
      } catch {
        sess.sharp[it.id] = null; // nicht lesbar – keine Markierung
      }
      if (t === token && ++done % 6 === 0) {
        recompute();
        onChange?.();
      }
    }
  };
  // zwei gleichzeitig: schnell genug, ohne das Blättern auszubremsen
  Promise.all([worker(), worker()]).then(() => {
    if (t !== token) return;
    recompute();
    onChange?.();
    A.save();
  });
}

export function stopSharpness() {
  token++;
}

/** Markierungen aus den vorhandenen Werten neu bestimmen. */
export function recompute() {
  const best = new Set();
  const blurry = new Set();
  const sh = S.session?.sharp || {};
  const ok = (id) => sh[id] > 0 && !A.isDeleted(id);
  const inSeries = new Set();
  for (const [id, ids] of A.seriesMap()) {
    if (inSeries.has(id)) continue;
    ids.forEach((x) => inSeries.add(x));
    const alive = ids.filter((x) => !A.isDeleted(x));
    const scored = alive.filter(ok);
    if (scored.length < 2) continue;
    const sorted = [...scored].sort((a, b) => sh[b] - sh[a]);
    const top = sorted[0];
    // nur markieren, wenn es einen echten Unterschied gibt (nicht bei Kopien oder fast gleichen Bildern)
    // und erst, wenn die ganze Serie berechnet ist
    if (scored.length === alive.length && sh[top] > sh[sorted[1]] * 1.05) best.add(top);
    for (const x of scored) if (sh[x] < SERIES_RATIO * sh[top]) blurry.add(x);
  }
  const vals = Object.keys(sh).filter(ok).map((id) => sh[id]).sort((a, b) => a - b);
  if (vals.length >= 10) {
    const median = vals[vals.length >> 1];
    for (const id of Object.keys(sh)) if (ok(id) && !inSeries.has(id) && sh[id] < SHOOT_RATIO * median) blurry.add(id);
  }
  S.sharpBest = best;
  S.blurry = blurry;
}

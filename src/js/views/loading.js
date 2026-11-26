// Einlesen des Quellordners mit Fortschrittsanzeige.

import { api, listen } from '../api.js';
import { S, go } from '../state.js';
import { esc, $, fmtInt, icons, confirmDialog } from '../ui.js';
import { newSession } from '../store.js';

export function mount(root) {
  const sess = S.session;
  let cancelled = false;
  let unlisten = null;
  const t0 = Date.now();

  root.innerHTML = `
    <div class="centered">
      <div class="card" style="width:540px;max-width:100%;padding:32px;display:flex;flex-direction:column;gap:18px">
        <div class="row" style="gap:14px">${icons.folderBig}
          <div><h1 class="title">${esc(sess.name)} wird eingelesen</h1>
          <span class="path">${esc(sess.source)}</span></div>
        </div>
        <div class="progress" style="height:6px" role="progressbar" aria-label="Fortschritt"><div id="bar" style="width:2%"></div></div>
        <div class="row small"><span class="grow" id="count">Suche Bilder …</span><span class="muted" id="eta"></span></div>
        <p class="muted tiny" style="line-height:1.5">Die Aufnahmezeiten werden gelesen, damit die Bilder in der richtigen Reihenfolge erscheinen – auch bei mehreren Kameras.</p>
        <div id="err"></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" id="cancel">Abbrechen</button></div>
      </div>
    </div>`;

  const cancel = () => {
    cancelled = true;
    go('start');
  };
  $('#cancel').onclick = cancel;

  listen('scan-progress', (e) => {
    if (cancelled) return;
    const [n, total] = e.payload;
    const bar = $('#bar');
    if (!bar) return;
    bar.style.width = Math.max(2, total ? (n / total) * 100 : 0) + '%';
    $('#count').textContent = total ? `Lese Bilder … ${fmtInt(n)} von ${fmtInt(total)}` : 'Suche Bilder …';
    const secs = (Date.now() - t0) / 1000;
    if (n > 20 && n < total) {
      const rest = Math.round((secs / n) * (total - n));
      $('#eta').textContent = rest > 1 ? `noch ca. ${rest} Sekunden` : '';
    }
  }).then((un) => {
    unlisten = un;
    if (cancelled) un();
  });

  api
    .scan(sess.source, S.settings.subfolders, S.settings.sort, sess.targets.map((t) => t.path))
    .then(async (res) => {
      if (cancelled) return;
      S.items = res.items;
      S.videos = res.videos;
      await checkSameImages(res.items);
      if (cancelled) return;
      sess.total = res.items.length;
      // Bilder, die wieder im Quellordner liegen (z. B. aus dem Papierkorb geholt), nicht mehr ausblenden
      for (const it of S.items) delete sess.deleted[it.id];
      if (!res.items.length) return go('empty');
      const i = sess.currentId ? S.items.findIndex((x) => x.id === sess.currentId) : -1;
      sess.index = i >= 0 ? i : Math.min(Math.max(0, sess.index || 0), S.items.length - 1);
      go('sorter');
    })
    .catch((err) => {
      if (cancelled) return;
      $('#err').innerHTML = `<div class="banner error" style="box-shadow:none">${icons.error}<div class="txt"><b>Einlesen fehlgeschlagen</b><span>${esc(err)}</span></div></div>`;
      $('#cancel').textContent = 'Zurück';
    });

  /**
   * Ist das noch dasselbe Shooting? Bilder werden über Ordner + Dateiname erkannt. Kameras wiederholen
   * ihre Nummern aber – liegt im selben Ordner ein neues Shooting, hieße das neue IMG_0232 wie das alte.
   * Deshalb merkt sich die Sitzung zu jedem Bild die Aufnahmezeit:
   * - weicht sie ab, gilt das Bild als neu (nicht angesehen, nicht kopiert, nicht bearbeitet)
   * - ist der Großteil anders, wird gefragt, ob eine neue Sitzung beginnen soll
   */
  async function checkSameImages(items) {
    const stamps = sess.stamps || {};
    const known = Object.keys(stamps).length;
    if (known) {
      let same = 0;
      const changed = [];
      for (const it of items) {
        if (!(it.id in stamps)) continue;
        const a = stamps[it.id];
        const b = it.taken || '';
        if (a && b && a !== b) changed.push(it.id);
        else same++;
      }
      if (known >= 5 && same < known / 2) {
        const fresh = await confirmDialog({
          title: 'Anderes Shooting im selben Ordner?',
          text: `Der Ordner »${sess.name}« enthält größtenteils andere Bilder als bei der letzten Sitzung. Bereits kopierte Bilder bleiben in den Zielordnern.`,
          ok: 'Neue Sitzung beginnen',
          cancel: 'Trotzdem fortsetzen',
        });
        if (fresh) {
          const { source, targets } = sess;
          for (const k of Object.keys(sess)) delete sess[k];
          Object.assign(sess, newSession(source), { targets });
        }
      }
      // einzelne veränderte Bilder: alte Markierungen gehören zu einem anderen Foto
      for (const id of changed) {
        delete sess.seen?.[id];
        delete sess.copied?.[id];
        delete sess.edits?.[id];
        delete sess.sharp?.[id];
      }
    }
    sess.stamps = Object.fromEntries(items.map((it) => [it.id, it.taken || '']));
  }

  return {
    unmount() {
      cancelled = true;
      if (unlisten) unlisten();
    },
    onKey(e) {
      if (e.key === 'Escape') cancel();
    },
  };
}

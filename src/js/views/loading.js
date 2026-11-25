// Einlesen des Quellordners mit Fortschrittsanzeige.

import { api, listen } from '../api.js';
import { S, go } from '../state.js';
import { esc, $, fmtInt, icons } from '../ui.js';

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
    .then((res) => {
      if (cancelled) return;
      S.items = res.items;
      S.videos = res.videos;
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

// Abschluss: Zusammenfassung der Sitzung.

import { api } from '../api.js';
import { S, go } from '../state.js';
import * as A from '../actions.js';
import { saveSession } from '../store.js';
import { bindFullscreenButton } from '../fullscreen.js';
import { esc, $, $$, icons, keycap, fmtInt, fmtDuration, toast } from '../ui.js';

export function mount(root) {
  const sess = S.session;
  const alive = S.items.filter((x) => !A.isDeleted(x.id));
  const unseen = alive.filter((x) => !sess.seen[x.id]);
  const deleted = Object.keys(sess.deleted).length;
  const copiedItems = S.items.filter((x) => A.copiedPaths(x.id).length).length;
  sess.done = unseen.length === 0;

  // gelöschte Bilder jetzt endgültig in den Papierkorb des Systems
  A.flushDeleted().then(() => saveSession(sess));

  const stats = sess.targets.map((t) => {
    const entries = Object.entries(sess.copied).filter(([, c]) => c[t.path]);
    const edited = entries.filter(([id]) => !A.isIdentity(A.editsOf(id))).length;
    const renamed = entries.filter(([, c]) => c[t.path].renamed).length;
    const extra = [edited && `${edited} bearbeitet`, renamed && `${renamed} umbenannt (_2)`].filter(Boolean).join(' · ');
    return { t, n: entries.length, extra };
  });

  const title = unseen.length
    ? `${fmtInt(alive.length - unseen.length)} von ${fmtInt(alive.length)} Bildern angesehen`
    : `Fertig! Alle ${fmtInt(alive.length)} Bilder durchgesehen`;

  root.innerHTML = `
    <div class="topbar"><button class="icon-btn" id="back" aria-label="Zurück zum Sortieren">${icons.back}</button><span class="grow"></span><button class="icon-btn" id="fsbtn"></button></div>
    <div class="centered">
      <div style="width:900px;max-width:100%;display:flex;flex-direction:column;gap:24px">
        <div class="row" style="gap:16px">
          <span style="width:52px;height:52px;border-radius:26px;background:${unseen.length ? 'var(--panel2)' : '#6CCB5F'};display:flex;align-items:center;justify-content:center;color:${unseen.length ? 'var(--text)' : '#0E2A0B'}">${unseen.length ? icons.info : '<svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="#0E2A0B" stroke-width="2.2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>'}</span>
          <div><h1 class="title">${title}</h1>
            <span class="muted">${esc(sess.name)} · Arbeitszeit ${fmtDuration(sess.activeMs || 0)}</span></div>
        </div>
        ${unseen.length ? `<div class="banner warn" style="box-shadow:none">${icons.warn}<span class="grow">${unseen.length === 1 ? '1 Bild hast' : `${fmtInt(unseen.length)} Bilder hast`} du noch nicht angesehen.</span><button class="btn sm" id="unseen" title="Nur die noch nicht angesehenen Bilder zeigen">${unseen.length === 1 ? 'Dieses Bild zeigen' : 'Nur diese zeigen'}</button></div>` : ''}
        <div class="stats">
          ${stats
            .map(
              (s, i) => `<div class="card pad" style="display:flex;flex-direction:column;gap:10px">
              <div class="row">${keycap(s.t)}<b>${esc(s.t.name)}</b></div>
              <span class="stat">${fmtInt(s.n)}</span>
              <span class="muted small">${s.n === 1 ? 'Bild' : 'Bilder'}${s.extra ? ' · ' + s.extra : ''}</span>
              <span class="path">${esc(s.t.path)}</span>
              <div class="row wrap"><button class="btn sm" data-open="${i}">Ordner öffnen</button>
              ${s.n ? `<button class="btn sm ghost" data-pass="${i}">Nochmal durchsehen</button>` : ''}</div></div>`
            )
            .join('')}
        </div>
        <div class="card pad row wrap small" style="gap:10px 28px;color:var(--text2)">
          <span>${fmtInt(copiedItems)} ${copiedItems === 1 ? 'Bild' : 'Bilder'} kopiert</span>
          ${deleted ? `<span>${fmtInt(deleted)} gelöscht (im Papierkorb)</span>` : ''}
          ${S.videos ? `<span>${fmtInt(S.videos)} ${S.videos === 1 ? 'Video' : 'Videos'} übersprungen</span>` : ''}
          <span>Originale unverändert</span>
        </div>
        <div class="row wrap">
          <button class="btn primary lg" id="new">Neue Sitzung</button>
          <button class="btn ghost lg" id="cont" title="Zurück zum zuletzt angezeigten Bild, alle Bilder">Zurück zum Sortieren</button>
        </div>
      </div>
    </div>`;

  const toSorter = (filter, pickIndex) => {
    S.filter = filter;
    const list = A.visibleIndices();
    if (!list.length) return toast('Keine Bilder', '#9A9A9A');
    sess.index = pickIndex ? pickIndex(list) : list[0];
    sess.done = false;
    go('sorter');
  };

  const unbindFs = bindFullscreenButton($('#fsbtn'), icons);
  $('#back').onclick = () => toSorter('all', () => sess.index);
  $('#cont').onclick = () => toSorter('all', () => sess.index);
  // „Weiter durchsehen“: genau die noch ungesehenen Bilder als Filter öffnen
  $('#unseen') &&
    ($('#unseen').onclick = () => {
      A.startUnseenFilter();
      toSorter('unseen');
    });
  $('#new').onclick = async () => {
    await A.endSession();
    S.session = null;
    go('start');
  };
  $$('[data-open]').forEach((b) => (b.onclick = () => api.openPath(sess.targets[b.dataset.open].path).catch((e) => toast(String(e), '#FF99A4'))));
  $$('[data-pass]').forEach((b) => (b.onclick = () => toSorter(sess.targets[b.dataset.pass].path)));

  return {
    unmount: unbindFs,
    onKey(e) {
      if (e.key === 'Escape') toSorter('all', () => sess.index);
    },
  };
}

// Papierkorb der Sitzung: gelöschte Bilder ansehen und zurückholen.
// Die Dateien liegen bis zum Ende der Sitzung im versteckten Ordner .shotsort-papierkorb
// im Quellordner und wandern erst danach in den Papierkorb des Systems.

import { api, fileSrc } from '../api.js';
import { S, go } from '../state.js';
import * as A from '../actions.js';
import { bindFullscreenButton } from '../fullscreen.js';
import { esc, $, $$, icons, toast, setToastHost, fmtInt, fmtBytes } from '../ui.js';

const basename = (p) => p.split(/[\\/]/).pop();

export function mount(root) {
  const sess = S.session;
  let unbindFs = () => {};
  let busy = false;

  root.innerHTML = `
    <div class="topbar" id="top"></div>
    <div class="page" style="position:relative"><div class="trash-page" id="body"></div></div>
    <div class="toasts" id="toasts" style="position:fixed"></div>`;
  setToastHost($('#toasts'));

  /** Wo die Dateien eines gelöschten Bildes gerade liegen. */
  function movedPath(it, p) {
    if (!p) return null;
    const m = (sess.deleted[it.id] || []).find((x) => x.from === p);
    return m ? m.to : p;
  }

  const thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        thumbObserver.unobserve(en.target);
        const it = S.items[A.indexOfId(en.target.dataset.id)];
        if (!it) continue;
        api
          .thumb({ raw: movedPath(it, it.raw), main: movedPath(it, it.main) })
          .then((p) => {
            S.thumbs.set(it.id, p);
            const cell = $(`.trash-tile[data-id="${CSS.escape(it.id)}"] .trash-img`);
            if (cell && !cell.querySelector('img')) cell.innerHTML = `<img src="${fileSrc(p)}" alt="">`;
          })
          .catch(() => {});
      }
    },
    { rootMargin: '300px' }
  );

  function render() {
    const list = A.deletedItems();
    $('#top').innerHTML = `
      <button class="icon-btn" id="back" aria-label="Zurück zum Sortieren (Esc)" title="Zurück zum Sortieren (Esc)">${icons.back}</button>
      <b class="small" style="margin:0 6px">Papierkorb · ${fmtInt(list.length)} ${list.length === 1 ? 'Bild' : 'Bilder'}</b>
      <span class="grow"></span>
      ${list.length > 1 ? `<button class="btn sm primary" id="all">Alle wiederherstellen</button>` : ''}
      <button class="icon-btn" id="fs"></button>`;
    $('#back').onclick = back;
    $('#all') && ($('#all').onclick = restoreAll);
    unbindFs();
    unbindFs = bindFullscreenButton($('#fs'), icons);

    thumbObserver.disconnect();
    const body = $('#body');
    if (!list.length) {
      body.innerHTML = `<div class="trash-empty">
        <span style="color:var(--muted)">${icons.trash}</span>
        <b>Der Papierkorb ist leer</b>
        <span class="muted small">In dieser Sitzung wurde nichts gelöscht – oder alles wurde zurückgeholt.</span>
        <button class="btn" id="back2">Zurück zum Sortieren</button></div>`;
      $('#back2').onclick = back;
      return;
    }
    body.innerHTML = `
      <p class="muted small" style="margin:0 0 16px;line-height:1.6">Gelöschte Bilder bleiben bis zum Ende der Sitzung hier und lassen sich zurückholen.
        Danach liegen sie im Papierkorb des Systems.</p>
      <div class="trash-grid">${list
        .map((it) => {
          const th = S.thumbs.get(it.id);
          return `<div class="trash-tile" data-id="${esc(it.id)}">
            <div class="trash-img">${th ? `<img src="${fileSrc(th)}" alt="">` : ''}</div>
            <div class="trash-meta"><span class="trash-name" title="${esc(it.files.map(basename).join(', '))}">${esc(it.name)}</span>
              <span class="muted tiny">${esc(it.kind)} · ${fmtBytes(it.bytes)}</span></div>
            <button class="btn sm" data-restore="${esc(it.id)}">${icons.restore} Wiederherstellen</button>
          </div>`;
        })
        .join('')}</div>`;
    $$('.trash-tile', body).forEach((t) => {
      if (!t.querySelector('img')) thumbObserver.observe(t);
    });
    $$('[data-restore]', body).forEach((b) => (b.onclick = () => restore(b.dataset.restore)));
  }

  async function restore(id) {
    if (busy) return;
    busy = true;
    const it = S.items[A.indexOfId(id)];
    const ok = await A.restoreDeleted(id);
    busy = false;
    if (!ok) return;
    toast(`${it ? it.name : 'Bild'} wiederhergestellt`, '#4CC2FF');
    render();
  }

  async function restoreAll() {
    if (busy) return;
    busy = true;
    let n = 0;
    for (const it of A.deletedItems()) if (await A.restoreDeleted(it.id)) n++;
    busy = false;
    toast(`${fmtInt(n)} ${n === 1 ? 'Bild' : 'Bilder'} wiederhergestellt`, '#4CC2FF');
    render();
  }

  function back() {
    go('sorter');
  }

  render();

  return {
    onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        back();
      }
    },
    unmount() {
      thumbObserver.disconnect();
      unbindFs();
      setToastHost(null);
    },
  };
}

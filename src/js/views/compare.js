// Vergleichsansicht: 2–4 Bilder nebeneinander, Zoom und Ausschnitt sind gekoppelt.
// Für eine Serie auch mehr: höchstens 3 Spalten, nach unten scrollbar.
// Aufgebaut wie die Sortieransicht: Ziele oben links, Aktionen direkt am Bild.

import { api } from '../api.js';
import { S, go } from '../state.js';
import { Viewer } from '../viewer.js';
import { toggleFullscreen, setFullscreen, bindFullscreenButton } from '../fullscreen.js';
import { editTargetDialog } from '../targetDialog.js';
import { saveSettings } from '../store.js';
import * as A from '../actions.js';
import { normKey, isMod, isMac, keyLabel, MOD, helpList } from '../keys.js';
import { esc, $, $$, icons, keycap, toast, setToastHost, confirmDialog, helpDialog } from '../ui.js';

export function mount(root, params = {}) {
  const sess = S.session;
  const keys = S.settings.keys;
  const isSeries = !!params?.series;
  let ids = S.compareSel.filter((id) => A.indexOfId(id) >= 0 && !A.isDeleted(id));
  if (!isSeries) ids = ids.slice(0, 4);
  let active = Math.max(0, ids.indexOf(S.items[sess.index]?.id));
  let viewers = [];
  let mouse = [null, null];
  let zoomTipTimer = null;

  root.innerHTML = `
    <div class="topbar" id="top"></div>
    <div class="stage-wrap" style="flex:1">
      <div class="cmp-grid" id="grid"></div>
      <div class="zoom-tip hidden" id="zoomtip" aria-live="polite"></div>
      <div class="top-stack" style="top:auto;bottom:24px"><div class="banners" id="tip"></div></div>
      <div class="toasts" id="toasts"></div>
    </div>`;
  setToastHost($('#toasts'));

  const item = (i) => S.items[A.indexOfId(ids[i])];

  // ------------------------------------------------------------------ Kopfleiste

  let unbindFs = () => {};
  function renderTop() {
    const it = item(active);
    const copied = (it && S.session.copied[it.id]) || {};
    const zoomed = viewers[active]?.isZoomed();
    $('#top').innerHTML = `
      <button class="icon-btn" id="back" aria-label="Zurück zum Sortieren (Esc)" title="Zurück zum Sortieren (Esc)">${icons.back}</button>
      <b class="small" style="margin:0 6px">${isSeries ? 'Serie' : 'Vergleich'} · ${ids.length} Bilder</b>
      <span class="muted" aria-hidden="true">${icons.arrow}</span>
      ${sess.targets
        .map((t, i) => {
          const st = S.targetState[t.path] || '';
          const on = !!copied[t.path];
          const state = st === 'err' ? '<span class="state">nicht erreichbar</span>' : st === 'low' ? '<span class="state">fast voll</span>' : '';
          const label = `Klick: aktives Bild kopieren nach ${esc(t.name)} (Taste ${t.key}) · Rechtsklick: bearbeiten`;
          return `<button class="chip target ${st}" data-t="${i}" title="${label}" aria-label="${label}" aria-pressed="${on}" style="${on ? `background:${t.color}2E;` : ''}${on && !st ? `border-color:${t.color}` : ''}">${keycap(t)}${esc(t.name)}${state}</button>`;
        })
        .join('')}
      ${A.nextFreeKey(sess.targets) ? '<button class="chip add" id="t-add" aria-label="Zielordner hinzufügen" title="Zielordner hinzufügen">+</button>' : ''}
      <span class="grow"></span>
      ${scrolling() ? `<span class="muted tiny" style="margin-right:6px">Mausrad scrollt · ${isMac ? '⌘' : 'Strg'} + Mausrad zoomt</span>` : ''}
      <button class="icon-btn ${zoomed ? 'on' : ''}" id="zoom" title="${zoomed ? 'Zurück zum ganzen Bild' : 'Alle auf 100 % zoomen'} (${esc(keyLabel(keys.zoom))})" aria-label="Zoom">${zoomed ? icons.zoomOut : icons.zoom}</button>
      <button class="icon-btn" id="help" aria-label="Alle Tastenkürzel (?)" title="Alle Tastenkürzel (?)" style="font-weight:600;font-size:15px">?</button>
      <button class="icon-btn" id="fs"></button>`;
    $('#back').onclick = back;
    $$('[data-t]', $('#top')).forEach((b) => {
      const t = sess.targets[b.dataset.t];
      b.onclick = () => copy(t.key);
      b.oncontextmenu = (e) => {
        e.preventDefault();
        editTargetDialog({ t, targets: sess.targets, source: sess.source, onChange: () => A.save(), onClose: () => { A.save(); render(); } });
      };
    });
    $('#t-add') && ($('#t-add').onclick = async () => {
      if (await A.addTarget(sess.targets)) { A.save(); render(); }
    });
    $('#zoom').onclick = () => viewers[active]?.toggle100();
    $('#help').onclick = () => helpDialog(helpList(keys));
    unbindFs();
    unbindFs = bindFullscreenButton($('#fs'), icons, keyLabel(keys.fullscreen));
  }

  // ------------------------------------------------------------------ Kacheln

  // Bei vielen Bildern: Kacheln erst laden, wenn sie in Sichtweite kommen
  let tileObserver = null;
  const many = () => ids.length > 4;
  const scrolling = () => Math.ceil(ids.length / 3) > 2 && many();

  function build() {
    viewers.forEach((v) => v.destroy());
    tileObserver?.disconnect();
    const grid = $('#grid');
    // 2 Bilder nebeneinander, 3 und 4 als 2 × 2, mehr in 3 Spalten
    const cols = many() ? 3 : 2;
    const rows = Math.ceil(ids.length / cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    // Bis 2 Reihen füllen den Platz, darüber hinaus sind 2 Reihen sichtbar und der Rest scrollt
    grid.style.gridTemplateRows = rows <= 2 ? `repeat(${rows}, minmax(0, 1fr))` : `repeat(${rows}, calc((100% - 12px) / 2))`;
    grid.classList.toggle('scroll', rows > 2);
    grid.innerHTML = ids
      .map(
        (id, i) => `<div class="tile" data-i="${i}"><div class="stage"></div>
          <span class="stage-label tile-name"></span>
          <div class="tile-actions">
            <button class="tile-btn" data-drop title="Ausscheiden (${esc(keyLabel(keys.drop))}) – das Bild bleibt im Ordner, es fliegt nur aus dem Vergleich">✕ Ausscheiden</button>
            <button class="tile-btn pick" data-pick title="Dieses Bild nehmen und zurück zum Sortieren (Enter)">✓ Nehmen</button>
            <button class="tile-btn icon" data-del title="Löschen (${esc(keyLabel(keys.del))})" aria-label="Löschen">${icons.trash}</button>
          </div></div>`
      )
      .join('');
    viewers = ids.map((id, i) => {
      const tile = grid.children[i];
      const v = new Viewer(tile.querySelector('.stage'), {
        // Viele Bilder: Mausrad scrollt durch die Serie, mit Strg/⌘ zoomt es
        wheelZoom: (e) => !scrolling() || e.ctrlKey || e.metaKey,
        onView: (view) => {
          viewers.forEach((o, j) => j !== i && o.setView(view));
          renderTop();
          showZoomTip();
        },
      });
      tile.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.tile-btn')) setActive(i);
      });
      tile.querySelector('[data-drop]').onclick = () => drop(i);
      tile.querySelector('[data-pick]').onclick = () => pick(i);
      tile.querySelector('[data-del]').onclick = () => del(i);
      return v;
    });
    if (many()) {
      tileObserver = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            tileObserver.unobserve(en.target);
            const i = Number(en.target.dataset.i);
            if (viewers[i]) load(i, viewers[i]);
          }
        },
        { root: grid, rootMargin: '200px 0px' }
      );
      [...grid.children].forEach((t) => tileObserver.observe(t));
    } else {
      viewers.forEach((v, i) => load(i, v));
    }
    render();
    grid.children[active]?.scrollIntoView({ block: 'nearest' });
  }

  async function load(i, v) {
    const it = item(i);
    try {
      // Viele Bilder: mittelgroße Vorschau (spart Arbeitsspeicher), sonst die volle
      const cache = many() ? S.mediums : S.previews;
      let pv = cache.get(it.id);
      if (!pv) {
        v.expectSoon();
        pv = await (many() ? api.medium(it) : api.preview(it));
        cache.set(it.id, pv);
      }
      if (viewers[i] !== v) return;
      await v.show({ src: pv.src, baseRot: pv.rotate, edits: A.editsOf(it.id), view: viewers[0]?.getView?.() });
    } catch (err) {
      v.message('Keine Vorschau: ' + err);
    }
  }

  function render() {
    $$('.tile', $('#grid')).forEach((tile, i) => {
      tile.classList.toggle('active', i === active);
      const it = item(i);
      // Dateiname mit kleinen Farbpunkten der Ziele, in denen das Bild schon liegt
      const dots = A.copiedPaths(it.id)
        .map((p) => `<span class="dot" style="background:${A.targetByPath(p).color}" title="liegt in ${esc(A.targetByPath(p).name)}"></span>`)
        .join('');
      tile.querySelector('.tile-name').innerHTML = `${esc(it.name)}${dots}`;
    });
    renderTop();
  }

  function setActive(i) {
    if (i < 0 || i >= ids.length) return;
    active = i;
    sess.index = A.indexOfId(ids[i]);
    render();
    $('#grid').children[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Spalten im Raster (für ↑ / ↓). */
  const cols = () => (many() ? 3 : 2);

  function showZoomTip() {
    const v = viewers[active];
    const tip = $('#zoomtip');
    if (!v || !tip) return;
    tip.textContent = v.isZoomed() ? `${v.zoomPercent()} %` : 'Ganzes Bild';
    tip.classList.remove('hidden');
    clearTimeout(zoomTipTimer);
    zoomTipTimer = setTimeout(() => tip.classList.add('hidden'), 1000);
  }

  // ------------------------------------------------------------------ Aktionen

  async function copy(key) {
    let t = sess.targets.find((x) => x.key === key);
    if (!t) {
      t = await A.addTarget(sess.targets, key);
      if (!t) return;
      A.save();
    }
    await A.copyTo(item(active), t);
  }

  /** Bild aus dem Vergleich nehmen (nicht löschen). Bleibt eins übrig, geht es mit ihm zurück. */
  function drop(i = active) {
    hideTip(true);
    const it = item(i);
    $('#grid').children[i]?.classList.add('leaving');
    setTimeout(() => {
      ids = ids.filter((_, j) => j !== i);
      if (ids.length < 2) {
        active = 0;
        const winner = item(0);
        back();
        if (winner) toast(`Übrig bleibt ${winner.name} – mit 1–9 kopieren`, '#4CC2FF');
        return;
      }
      toast(`${it.name} ausgeschieden – es bleibt im Ordner`, '#9A9A9A');
      if (i < active || active >= ids.length) active = Math.max(0, active - 1);
      build();
    }, 160);
  }

  /** Dieses Bild nehmen: zurück zum Sortieren, mit ihm als aktuellem Bild. */
  function pick(i = active) {
    hideTip(true);
    active = i;
    const it = item(i);
    back();
    toast(`${it.name} gewählt – mit 1–9 kopieren`, '#4CC2FF');
  }

  async function del(i = active) {
    const it = item(i);
    if (!(await A.confirmDelete(it)) || !(await A.deleteItem(it))) return;
    toast(`${it.name} gelöscht · ${MOD}Z holt es zurück`, '#FF99A4');
    ids = ids.filter((x) => x !== it.id);
    if (ids.length < 2) return back();
    if (i < active || active >= ids.length) active = Math.max(0, active - 1);
    build();
  }

  function back() {
    const id = ids[active];
    const i = id ? A.indexOfId(id) : -1;
    if (i >= 0) sess.index = i;
    S.compareSel = [];
    go('sorter');
  }

  // ------------------------------------------------------------------ Einmaliger Tipp

  function showTip() {
    if (S.settings.cmpTipSeen) return;
    $('#tip').innerHTML = `<div class="banner warn" role="status" style="background:var(--panel);border-color:var(--accent)">
      <span class="grow">Tipp: Schwächere Bilder mit <b>✕ Ausscheiden</b> (Taste ${esc(keyLabel(keys.drop))}) entfernen, bis das beste übrig bleibt – oder direkt <b>✓ Nehmen</b> (Enter).</span>
      <button class="btn sm" id="tip-ok">Verstanden</button></div>`;
    $('#tip-ok').onclick = () => hideTip(true);
  }

  function hideTip(remember) {
    const el = $('#tip');
    if (el) el.innerHTML = '';
    if (remember && !S.settings.cmpTipSeen) {
      S.settings.cmpTipSeen = true;
      saveSettings(S.settings);
    }
  }

  // ------------------------------------------------------------------ Start

  const onMouse = (e) => (mouse = [e.clientX, e.clientY]);
  document.addEventListener('mousemove', onMouse);
  S.onChange = () => render();

  if (ids.length < 2) {
    setTimeout(back);
  } else {
    build();
    showTip();
  }

  return {
    onKey(e) {
      const k = normKey(e);
      const is = (id) => k === keys[id] || (id === 'del' && isMac && (k === 'Delete' || k === 'Backspace'));
      if (isMod(e) && k === 'z') { e.preventDefault(); A.undo(); return; }
      if (isMod(e) || e.altKey) return;
      if (e.key === 'Escape' && S.fullscreen) { e.preventDefault(); setFullscreen(false); }
      else if (e.key === 'Escape' || is('compare')) { e.preventDefault(); back(); }
      else if (e.key === '?') helpDialog(helpList(keys));
      else if (e.key === 'Enter') { e.preventDefault(); pick(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setActive((active + 1) % ids.length); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((active - 1 + ids.length) % ids.length); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (active + cols() < ids.length) setActive(active + cols()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (active - cols() >= 0) setActive(active - cols()); }
      else if (/^[1-9]$/.test(e.key)) { e.preventDefault(); if (!e.repeat) copy(e.key); }
      else if (is('copy1')) { e.preventDefault(); if (!e.repeat && sess.targets[0]) copy(sess.targets[0].key); }
      else if (is('del')) { e.preventDefault(); if (!e.repeat) del(); }
      else if (is('drop')) { e.preventDefault(); if (!e.repeat) drop(); }
      else if (is('fullscreen')) toggleFullscreen();
      else if (is('zoom')) viewers[active]?.toggle100(mouse[0], mouse[1]);
    },
    unmount() {
      unbindFs();
      clearTimeout(zoomTipTimer);
      document.removeEventListener('mousemove', onMouse);
      tileObserver?.disconnect();
      viewers.forEach((v) => v.destroy());
      S.onChange = null;
      setToastHost(null);
    },
  };
}

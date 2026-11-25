// Hauptansicht: Bild ansehen, mit 1–9 kopieren, drehen, zuschneiden, löschen.

import { api, fileSrc } from '../api.js';
import { S, go } from '../state.js';
import { Viewer, ASPECTS } from '../viewer.js';
import { CompareGrid } from '../compareGrid.js';
import { setFullscreen, toggleFullscreen } from '../fullscreen.js';
import { editTargetDialog } from '../targetDialog.js';
import * as A from '../actions.js';
import { COLORS, folderName, saveSettings } from '../store.js';
import { normKey, isMod, isMac, keyLabel, MOD, helpList } from '../keys.js';
import {
  esc, $, $$, icons, keycap, toast, setToastHost, setToastDuration,
  confirmDialog, helpDialog, closeModal, fmtInt, fmtTaken, fmtBytes,
} from '../ui.js';

const basename = (p) => p.split(/[\\/]/).pop();

export function mount(root) {
  const sess = S.session;
  const keys = S.settings.keys;
  setToastDuration(S.settings.toastMs);

  root.innerHTML = `
    <div class="topbar" id="top"></div>
    <div class="sorter">
      <div class="center">
        <div class="stage-wrap">
          <div class="stage" id="stage"></div>
          <div class="cmp-grid hidden" id="cmpgrid"></div>
          <div class="toolbar-wrap"><div class="toolbar" id="tools" role="toolbar" aria-label="Aktionen für das aktuelle Bild"></div></div>
          <button class="nav prev" id="nav-prev" aria-label="Vorheriges Bild">${icons.prev}</button>
          <button class="nav next" id="nav-next" aria-label="Nächstes Bild">${icons.next}</button>
          <div class="top-stack"><div class="banners" id="banners"></div><div class="badges" id="badges"></div></div>
          <div class="stage-label hidden" id="slabel"></div>
          <div class="zoom-tip hidden" id="zoomtip" aria-live="polite"></div>
          <div class="crop-panel hidden" id="croppanel"></div>
          <div class="toasts" id="toasts"></div>
          <div class="filmstrip">
            <div class="thumbs" id="thumbs"></div>
          </div>
          <div class="strip-pills"><span class="pill-hint hidden" id="cmphint"></span><button class="pill hidden" id="serinfo"></button><div class="pill-group hidden" id="selinfo"><button class="pill" id="sel-go"></button><button class="pill pill-x" id="sel-x" aria-label="Auswahl aufheben" title="Auswahl aufheben">✕</button></div></div>
          <div class="filter-menu hidden" id="filtermenu" role="menu"></div>
          <div class="grid-view hidden" id="gridview"><div class="grid-cells" id="gcells" role="listbox" aria-label="Alle Bilder"></div></div>
        </div>
      </div>
      <aside class="info" id="info"></aside>
    </div>`;
  setToastHost($('#toasts'));

  // Platz zwischen Werkzeugleiste und Filmleiste
  function stageInsets() {
    const none = { top: 0, bottom: 0, left: 0, right: 0 };
    const wrap = $('.stage-wrap')?.getBoundingClientRect();
    if (!wrap) return none;
    const bar = $('#tools')?.getBoundingClientRect();
    const strip = $('.sorter .filmstrip')?.getBoundingClientRect();
    // Höhe der Leisten merken – im Vollbild sind sie meist ausgeblendet
    if (bar && bar.height) barH = bar.height;
    if (strip && strip.height) stripH = strip.height;
    if (cropping) {
      const panel = $('#croppanel > div')?.getBoundingClientRect();
      return { ...none, top: 12, bottom: panel && panel.height ? wrap.bottom - panel.top + 8 : 0 };
    }
    if (S.fullscreen) {
      // Platz freihalten, als wären die Leisten sichtbar – so springt das Bild nicht
      return { ...none, top: 64 + barH + 8, bottom: 12 + stripH + 8 };
    }
    return {
      ...none,
      top: bar && bar.height ? bar.bottom - wrap.top + 8 : 0,
      bottom: strip && strip.height ? wrap.bottom - strip.top + 8 : 0,
    };
  }

  const viewer = new Viewer($('#stage'), {
    // Das ganze Bild liegt zwischen Werkzeugleiste und Filmleiste; gezoomt läuft es darunter weiter.
    insets: stageInsets,
    onView: (v) => {
      S.lastView = v;
      renderZoomLabel();
      showZoomTip();
    },
  });
  const cur = () => S.items[sess.index];
  let cropping = false;

  // ------------------------------------------------------------------ Vergleich (in dieser Ansicht)
  // Ab 2 Bildern in S.compareSel zeigt die Bildfläche den Vergleich statt eines Einzelbildes.
  const comparing = () => !S.grid && S.compareSel.length >= 2;
  const cmp = new CompareGrid($('#cmpgrid'), {
    onActive: (id) => {
      sess.index = A.indexOfId(id);
      sess.currentId = id;
      sess.seen[id] = 1;
      A.save();
      renderAll();
    },
    onDrop: (id) => removeFromCompare(id),
    onView: () => {
      renderZoomLabel();
      showZoomTip();
    },
  });
  /** Der Viewer, der gerade zählt: Einzelbild oder aktive Vergleichskachel. */
  const zv = () => (comparing() ? cmp.viewer() : viewer);

  function placeCompare() {
    const ins = stageInsets();
    const g = $('#cmpgrid');
    g.style.top = `${Math.max(12, ins.top)}px`;
    g.style.bottom = `${Math.max(12, ins.bottom)}px`;
  }

  function applyMode() {
    const on = comparing();
    $('.sorter').classList.toggle('cmpmode', on);
    $('#cmpgrid').classList.toggle('hidden', !on);
    if (on) placeCompare();
    else if (cmp.ids.length) cmp.clear();
  }

  /** Vergleich aufräumen: gelöschte Bilder raus, zu wenige → beenden. */
  function cleanCompare() {
    // in der Reihenfolge der Filmleiste, damit die Kacheln so liegen wie die Miniaturen
    S.compareSel = S.compareSel
      .filter((id) => A.indexOfId(id) >= 0 && !A.isDeleted(id))
      .sort((a, b) => A.indexOfId(a) - A.indexOfId(b));
    if (S.grid) return;
    if (S.compareSel.length < 2 || !S.compareSel.includes(cur()?.id)) S.compareSel = [];
  }

  function removeFromCompare(id) {
    const sel = S.compareSel;
    const pos = sel.indexOf(id);
    const rest = sel.filter((x) => x !== id);
    if (cur()?.id === id && rest.length) sess.index = A.indexOfId(rest[Math.min(pos, rest.length - 1)]);
    if (rest.length < 2) {
      S.compareSel = [];
      if (rest[0]) {
        sess.index = A.indexOfId(rest[0]);
        toast(`Übrig bleibt ${S.items[sess.index].name} – mit 1–9 kopieren`, '#4CC2FF');
      }
    } else {
      S.compareSel = rest;
    }
    showCurrent();
  }

  function exitCompare() {
    if (!S.compareSel.length) return;
    S.compareSel = [];
    showCurrent();
  }

  let preloadToken = 0;
  let thumbQueue = [];
  let stripKey = '';
  let lastScrolled = -1;
  let stripGaps = 0; // Lücken um Serien in der Filmleiste
  const thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const it = S.items[Number(en.target.dataset.i)];
        if (it && !S.thumbs.has(it.id)) queueThumb(it);
      }
      pump();
    },
    { root: $('#thumbs'), rootMargin: '0px 400px' }
  );
  // Mausrad über der Filmleiste scrollt seitwärts
  $('#thumbs').addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.currentTarget.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: false }
  );
  $('#thumbs').onclick = (e) => {
    const b = e.target.closest('.thumb');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (e.target.closest('.ser-lbl')) return openSeries(S.items[i].id);
    if (isMod(e)) toggleSel(S.items[i].id);
    else {
      S.compareSel = []; // normaler Klick beendet den Vergleich
      sess.index = i;
      showCurrent();
    }
  };
  let thumbBusy = 0;
  let mouse = [null, null];
  let lastInput = Date.now();
  const infoPending = new Set();
  let barH = 46;
  let stripH = 58;

  // ------------------------------------------------------------------ Anzeige

  function ensureVisible() {
    let list = A.visibleIndices();
    if (!list.length && S.filter !== 'all') {
      S.filter = 'all';
      list = A.visibleIndices();
    }
    if (!list.length) return false;
    if (!list.includes(sess.index)) {
      sess.index = list.find((i) => i > sess.index) ?? list[list.length - 1];
    }
    return true;
  }

  async function showCurrent() {
    if (!ensureVisible()) return go('finish');
    cleanCompare();
    const it = cur();
    sess.currentId = it.id;
    sess.seen[it.id] = 1;
    A.save();
    applyMode();
    renderAll();
    if (S.grid) return; // im Raster wird kein großes Bild geladen
    if (comparing()) {
      hideMask();
      hideFocus();
      cmp.set(S.compareSel, it.id);
      renderZoomLabel();
      return;
    }
    const keep = S.settings.keepZoom && S.lastView && S.lastView.zrel > 1.001 ? S.lastView : null;
    let pv = S.previews.get(it.id);
    try {
      if (!pv) {
        viewer.expectSoon(); // altes Bild nicht stehen lassen, falls die RAW-Vorschau dauert
        pv = await api.preview(it);
        S.previews.set(it.id, pv);
      }
    } catch (err) {
      if (cur() === it) viewer.message('Keine Vorschau möglich: ' + err);
      return;
    }
    if (cur() !== it) return;
    await viewer.show({ src: pv.src, baseRot: pv.rotate, edits: A.editsOf(it.id), view: keep });
    if (cur() !== it) return;
    if (S.clip) loadMask(it);
    else hideMask();
    if (S.focus) loadFocus(it);
    else hideFocus();
    renderZoomLabel();
    preload();
  }

  async function preload() {
    const token = ++preloadToken;
    const list = A.visibleIndices();
    const pos = list.indexOf(sess.index);
    const order = [];
    for (let k = 1; k <= Number(S.settings.preload); k++) {
      if (list[pos + k] != null) order.push(list[pos + k]);
      if (k <= 3 && list[pos - k] != null) order.push(list[pos - k]);
    }
    for (const i of order) {
      if (token !== preloadToken) return;
      const it = S.items[i];
      if (S.previews.has(it.id)) continue;
      try {
        const pv = await api.preview(it);
        S.previews.set(it.id, pv);
        const im = new Image();
        im.src = fileSrc(pv.src);
        await im.decode().catch(() => {});
      } catch {
        /* Vorschau später nochmal versuchen */
      }
    }
  }

  // Beschriftung unten auf dem Bild – für Überbelichtung und Schärfe-Hilfe gemeinsam
  const labels = {};
  function setLabel(kind, text) {
    if (text) labels[kind] = text;
    else delete labels[kind];
    const l = $('#slabel');
    if (!l) return;
    const parts = ['clip', 'focus'].map((k) => labels[k]).filter(Boolean);
    l.textContent = parts.join('  ·  ');
    l.classList.toggle('hidden', !parts.length);
  }

  function loadMask(it) {
    api
      .clipMask(it, Number(S.settings.clipThreshold))
      .then((m) => {
        if (cur() !== it || !S.clip || cropping || S.grid) return;
        viewer.setMask(m.src, 'clip');
        const f = (v) => v.toFixed(1).replace('.', ',');
        setLabel('clip', `Zu hell: ${f(m.percent)} % · zu dunkel: ${f(m.dark || 0)} %`);
      })
      .catch((err) => toast('Belichtung: ' + err, '#FF99A4'));
  }

  function hideMask() {
    viewer.setMask(null, 'clip');
    setLabel('clip', null);
  }

  function loadFocus(it) {
    api
      .focusMask(it)
      .then((m) => {
        if (cur() !== it || !S.focus || cropping || S.grid) return;
        viewer.setMask(m.src, 'focus');
        setLabel('focus', 'Schärfe-Hilfe: scharfe Kanten sind grün');
      })
      .catch((err) => toast('Schärfe-Hilfe: ' + err, '#FF99A4'));
  }

  function hideFocus() {
    viewer.setMask(null, 'focus');
    setLabel('focus', null);
  }

  function renderAll() {
    renderTop();
    renderTools();
    renderBadges();
    renderBanners();
    renderFilters();
    if (S.grid) renderGrid();
    else renderThumbs();
    renderInfo();
    if (comparing()) cmp.render();
    else viewer.layout();
  }

  function renderTop() {
    const it = cur();
    const copied = (it && S.session.copied[it.id]) || {};
    $('#top').innerHTML = `
      <button class="icon-btn" id="t-back" aria-label="Zur Startseite" title="Zur Startseite">${icons.back}</button>
      <span class="row small" title="${esc(sess.source)}" style="gap:6px;margin-right:4px">${icons.folder}${esc(sess.name)}<span class="muted" id="t-pos" style="font-variant-numeric:tabular-nums"></span></span>
      <span class="top-sep" aria-hidden="true" style="margin:0 8px 0 4px"></span>
      ${sess.targets
        .map((t, i) => {
          const st = S.targetState[t.path] || '';
          const on = !!copied[t.path];
          const state = st === 'err' ? '<span class="state">nicht erreichbar</span>' : st === 'low' ? '<span class="state">fast voll</span>' : '';
          const label = `Klick: kopieren nach ${esc(t.name)} (Taste ${t.key}) · Rechtsklick: bearbeiten`;
          return `<button class="chip target ${st}" data-t="${i}" title="${label}" aria-label="${label}" aria-pressed="${on}" style="${on ? `background:${t.color}2E;` : ''}${on && !st ? `border-color:${t.color}` : ''}">${keycap(t)}${esc(t.name)}${state}</button>`;
        })
        .join('')}
      ${A.nextFreeKey(sess.targets) ? '<button class="chip add" id="t-add" aria-label="Zielordner hinzufügen" title="Zielordner hinzufügen">+</button>' : ''}
      <span class="grow"></span>
      <button class="icon-btn filter-btn" id="filterbtn" aria-haspopup="menu"></button>
      <button class="icon-btn filter-btn" id="gridbtn"></button>
      <span class="top-sep" aria-hidden="true"></span>
      ${(() => {
        const n = A.deletedItems().length;
        return n ? `<button class="icon-btn trash-chip" id="t-trash" title="Papierkorb: ${n} gelöscht – ansehen und zurückholen" aria-label="Papierkorb, ${n} gelöscht">${icons.trash}<span>${fmtInt(n)}</span></button>` : '';
      })()}
      <button class="icon-btn" id="t-help" aria-label="Alle Tastenkürzel (?)" title="Alle Tastenkürzel (?)" style="font-weight:600;font-size:15px">?</button>
      <button class="icon-btn" id="t-set" aria-label="Einstellungen" title="Einstellungen (${MOD},)">${icons.gear}</button>
      <button class="icon-btn" id="t-fs" aria-label="${S.fullscreen ? 'Vollbild beenden' : 'Vollbild'}" title="${S.fullscreen ? 'Vollbild beenden' : 'Vollbild'} (${esc(keyLabel(keys.fullscreen))})">${S.fullscreen ? icons.fullExit : icons.full}</button>
      <button class="chip" id="t-done">Fertig</button>`;
    $('#t-back').onclick = leave;
    $$('[data-t]', $('#top')).forEach((b) => {
      const t = sess.targets[b.dataset.t];
      b.onclick = () => copyKey(t.key); // Linksklick: kopieren
      b.oncontextmenu = (e) => {
        // Rechtsklick: Zielordner bearbeiten
        e.preventDefault();
        editTarget(t);
      };
    });
    $('#t-add') && ($('#t-add').onclick = async () => {
      const t = await A.addTarget(sess.targets);
      if (t) { A.save(); renderAll(); }
    });
    $('#t-help').onclick = () => helpDialog(helpList(keys));
    $('#t-trash') && ($('#t-trash').onclick = () => go('trash'));
    $('#t-set').onclick = () => { S.returnTo = 'sorter'; go('settings'); };
    $('#t-fs').onclick = () => toggleFs();
    $('#t-done').onclick = () => go('finish');
    renderFilters();
    renderStripInfo(A.visibleIndices());
  }



  function renderTools() {
    const it = cur();
    if (!it) return;
    const k = (id) => esc(keyLabel(keys[id]));
    const zoomBtn = `<button class="icon-btn" id="b-zoom" title="Ganzes Bild / 100 % (${k('zoom')})" aria-label="Ganzes Bild oder 100 %">${icons.zoom}</button>`;
    const endBtns = `
      <button class="icon-btn del-btn" id="b-del" title="Löschen (${k('del')})" aria-label="Löschen">${icons.trash}</button>
      <button class="icon-btn" id="b-undo" title="Rückgängig (${MOD}Z)" aria-label="Rückgängig">${icons.undo}</button>
      <button class="icon-btn ${S.showInfo ? 'on' : ''}" id="b-info" title="Info-Leiste (${k('info')})" aria-label="Info-Leiste" aria-pressed="${S.showInfo}">${icons.info}</button>`;
    if (S.grid) {
      // Rasteransicht: nur was auch ohne großes Bild Sinn ergibt
      $('#tools').innerHTML = endBtns;
    } else if (comparing()) {
      // Vergleich: Zoom gilt für alle Kacheln gemeinsam
      $('#tools').innerHTML = `${zoomBtn}<span class="sep"></span>${endBtns}`;
      $('#b-zoom').onclick = () => cmp.toggle100();
    } else {
      $('#tools').innerHTML = `
        ${zoomBtn}
        <button class="icon-btn ${S.clip ? 'warn-on' : ''}" id="b-clip" title="Zu helle (rot) und zu dunkle (blau) Stellen anzeigen (${k('clip')})" aria-label="Zu helle und zu dunkle Stellen anzeigen" aria-pressed="${S.clip}">${icons.sun}</button>
        <button class="icon-btn ${S.focus ? 'focus-on' : ''}" id="b-focus" title="Schärfe-Hilfe: scharfe Kanten grün markieren (${k('focus')})" aria-label="Schärfe-Hilfe" aria-pressed="${S.focus}">${icons.focus}</button>
        <span class="sep"></span>
        ${(() => {
          // jeder Knopf zeigt nur seinen eigenen Zustand
          const e = A.editsOf(it.id) || {};
          const rot = e.rot || 0;
          const cut = !!e.crop || Math.abs(e.angle || 0) > 0.001;
          return `<button class="icon-btn ${rot ? 'edited wide' : ''}" id="b-rot" title="Drehen (${k('rotate')})${rot ? ` – gedreht um ${rot}°` : ''}" aria-label="Drehen">${icons.rotate}${rot ? `<span class="btn-val">${rot}°</span>` : ''}</button>
        <button class="icon-btn ${cropping ? 'on' : ''} ${cut ? 'edited' : ''}" id="b-crop" title="Zuschneiden (${k('crop')})${cut ? ' – zugeschnitten oder begradigt' : ''}" aria-label="Zuschneiden">${icons.crop}</button>`;
        })()}
        <span class="sep"></span>
        ${endBtns}`;
      $('#b-rot').onclick = rotate;
      $('#b-crop').onclick = () => (cropping ? exitCrop() : enterCrop());
      $('#b-zoom').onclick = () => viewer.toggle100();
      $('#b-clip').onclick = toggleClip;
      $('#b-focus').onclick = toggleFocus;
    }
    $('#b-del').onclick = del;
    $('#b-undo').onclick = () => !cropping && A.undo();
    $('#b-info').onclick = toggleInfo;
    renderZoomLabel();
  }

  // Zoom-Knopf: Lupe mit + (ganzes Bild) bzw. − (gezoomt). Die Prozentzahl erscheint kurz auf dem Bild.
  function renderZoomLabel() {
    const b = $('#b-zoom');
    if (!b) return;
    const v = zv();
    const zoomed = !!v?.isZoomed();
    b.innerHTML = zoomed ? icons.zoomOut : icons.zoom;
    b.classList.toggle('on', zoomed);
    b.title = (zoomed ? `Zoom ${v.zoomPercent()} % – zurück zum ganzen Bild` : comparing() ? 'Alle auf 100 % zoomen' : 'Auf 100 % zoomen') + ` (${keyLabel(keys.zoom)})`;
  }

  let zoomTipTimer = null;
  function showZoomTip() {
    const tip = $('#zoomtip');
    const v = zv();
    if (!tip || !v) return;
    tip.textContent = v.isZoomed() ? `${v.zoomPercent()} %` : 'Ganzes Bild';
    tip.classList.remove('hidden');
    clearTimeout(zoomTipTimer);
    zoomTipTimer = setTimeout(() => tip.classList.add('hidden'), 1000);
  }

  function renderBadges() {
    const it = cur();
    if (!it) return;
    if (!S.fullscreen) {
      $('#badges').innerHTML = '';
      return;
    }
    const b = A.copiedPaths(it.id).map((p) => {
      const t = A.targetByPath(p);
      return `<span class="badge" style="background:${t ? t.color : '#9A9A9A'}" title="Kopiert nach ${esc(p)}">${icons.check}${t ? esc(t.key) + ' ' + esc(t.name) : esc(folderName(p))}</span>`;
    });
    if (!A.isIdentity(A.editsOf(it.id))) b.push('<span class="badge" style="background:#E6E6E6">Bearbeitet</span>');
    $('#badges').innerHTML = b.join('');
  }

  function renderBanners() {
    const el = $('#banners');
    el.innerHTML = S.banners
      .map((b, i) =>
        b.type === 'error'
          ? `<div class="banner error" role="alert"><span style="color:var(--danger)">${icons.error}</span>
              <div class="txt"><b>${esc(b.title)}</b><span>${esc(b.text)}</span></div>
              ${b.retry ? `<button class="btn danger sm" data-retry="${i}">Erneut versuchen</button>` : ''}
              ${b.target ? `<button class="btn sm ghost" data-other="${i}">Anderen Ordner wählen</button>` : ''}
              <button class="icon-btn" data-close="${i}" aria-label="Meldung schließen">✕</button></div>`
          : `<div class="banner warn" role="status"><span style="color:var(--warn)">${icons.warn}</span><span class="grow">${esc(b.text)}</span>
              <button class="icon-btn" data-close="${i}" aria-label="Hinweis schließen">✕</button></div>`
      )
      .join('');
    $$('[data-close]', el).forEach((x) => (x.onclick = () => A.closeBanner(S.banners[x.dataset.close].id)));
    $$('[data-retry]', el).forEach((x) => (x.onclick = () => {
      const b = S.banners[x.dataset.retry];
      A.closeBanner(b.id);
      b.retry();
    }));
    $$('[data-other]', el).forEach((x) => (x.onclick = async () => {
      const b = S.banners[x.dataset.other];
      const p = await A.pickTargetFolder(`Neuer Ordner für »${b.target.name}«`, sess.targets, sess.source, b.target);
      if (!p) return;
      delete S.targetState[b.target.path];
      if (S.filter === b.target.path) S.filter = 'all';
      b.target.path = p;
      b.target.name = folderName(p);
      A.save();
      A.closeBanner(b.id);
      b.retry();
    }));
  }

  // Filter: kleines Trichter-Symbol links in der Filmleiste, öffnet ein Menü darüber
  function renderFilters() {
    const alive = S.items.filter((x) => !A.isDeleted(x.id));
    const none = alive.filter((x) => A.copiedPaths(x.id).length === 0).length;
    const opts = [
      ['all', 'Alle Bilder', alive.length, null],
      ['none', 'Nicht kopiert', none, null],
      ...sess.targets.map((t) => [t.path, t.name, A.countIn(t.path), t]),
    ];
    const current = opts.find((o) => o[0] === S.filter) || opts[0];
    const gb = $('#gridbtn');
    gb.innerHTML = icons.gridView;
    gb.classList.toggle('active', S.grid);
    gb.title = (S.grid ? 'Zurück zum Einzelbild' : 'Rasteransicht: alle Bilder auf einen Blick') + ` (${keyLabel(keys.grid)})`;
    gb.setAttribute('aria-label', gb.title);
    gb.setAttribute('aria-pressed', S.grid);
    gb.onclick = toggleGrid;
    const btn = $('#filterbtn');
    btn.innerHTML = icons.filter;
    btn.classList.toggle('active', S.filter !== 'all');
    btn.title = `Filter: ${current[1]} (${fmtInt(current[2])})`;
    btn.setAttribute('aria-label', btn.title);
    const menu = $('#filtermenu');
    menu.innerHTML = opts
      .map(
        ([v, l, n, t], i) => `<button class="filter-item ${S.filter === v ? 'on' : ''}" data-f="${i}" role="menuitemradio" aria-checked="${S.filter === v}">
          <span class="fcheck">${S.filter === v ? '✓' : ''}</span>${t ? keycap(t) : ''}<span class="grow">${esc(l)}</span><span class="muted">${fmtInt(n)}</span></button>`
      )
      .join('');
    btn.onclick = (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('hidden') === false;
      if (open) {
        // direkt unter dem Knopf in der Kopfleiste aufklappen
        const r = btn.getBoundingClientRect();
        menu.style.top = `${r.bottom + 6}px`;
        menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
      }
    };
    $$('[data-f]', menu).forEach((b) => (b.onclick = () => {
      menu.classList.add('hidden');
      S.filter = opts[b.dataset.f][0];
      const list = A.visibleIndices();
      if (!list.length) {
        toast('Keine Bilder in diesem Filter', '#9A9A9A');
        S.filter = 'all';
      } else if (!list.includes(sess.index)) {
        sess.index = list[0];
      }
      showCurrent();
    }));
  }

  const closeFilterMenu = (e) => {
    const menu = $('#filtermenu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) menu.classList.add('hidden');
  };
  document.addEventListener('click', closeFilterMenu);



  /** Markierungen neu zeichnen – im Raster oder in der Filmleiste, je nach Ansicht. */
  function renderStrip() {
    if (S.grid) renderGrid();
    else renderThumbs();
  }

  function renderThumbs() {
    const el = $('#thumbs');
    if (!el) return;
    const list = A.visibleIndices();
    const key = S.filter + '|' + list.join(',');
    if (key !== stripKey) {
      stripKey = key;
      thumbObserver.disconnect();
      thumbQueue = [];
      const runs = seriesRuns(list);
      stripGaps = 0;
      el.innerHTML = list.length
        ? list
            .map((i, j) => {
              const it = S.items[i];
              const th = S.thumbs.get(it.id);
              const r = runs[j];
              let cls = '';
              let label = '';
              if (r) {
                cls = ' ser' + (r.first ? ' ser-first' : '') + (r.last ? ' ser-last' : '');
                if (r.first) {
                  stripGaps += (j > 0) + (j + r.size < list.length);
                  label = `<span class="ser-lbl" title="Diese Serie vergleichen">Serie · ${r.size} · vergleichen</span>`;
                }
              }
              const title = r ? `${esc(it.name)} · Serie mit ${r.size} Bildern` : esc(it.name);
              return `<button class="thumb${cls}" data-i="${i}" title="${title}" aria-label="${title}">
                <span class="th-head"><span class="th-name">${esc(it.name)}</span><span class="th-kind"><span class="dots"></span>${esc((it.kind || '').replace(/\s+/g, ''))}</span></span>
                <span class="th-img">${th ? `<img src="${fileSrc(th)}" alt="">` : ''}</span>${label}</button>`;
            })
            .join('')
        : '<span class="muted small" style="padding:0 8px;white-space:nowrap">Keine Bilder in diesem Filter</span>';
      $$('.thumb', el).forEach((b) => thumbObserver.observe(b));
      lastScrolled = -1;
    }
    // Markierungen aktualisieren
    for (const b of el.children) {
      if (!b.dataset.i) continue;
      const i = Number(b.dataset.i);
      const it = S.items[i];
      b.classList.toggle('cur', i === sess.index);
      b.classList.toggle('sel', S.compareSel.includes(it.id));
      b.querySelector('.dots').innerHTML = A.copiedPaths(it.id)
        .map((p) => `<span style="background:${A.targetByPath(p)?.color || '#9A9A9A'}"></span>`)
        .join('');
      const edited = !A.isIdentity(A.editsOf(it.id));
      const mark = b.querySelector('.edit');
      if (edited && !mark) b.querySelector('.th-img').insertAdjacentHTML('beforeend', `<span class="edit">${icons.pen}</span>`);
      if (!edited && mark) mark.remove();
    }
    renderStripInfo(list);
    // aktuelles Bild in die Mitte der Filmleiste scrollen
    if (lastScrolled !== sess.index) {
      lastScrolled = sess.index;
      const b = el.querySelector(`.thumb[data-i="${sess.index}"]`);
      if (b) el.scrollTo({ left: b.offsetLeft - el.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' });
    }
  }


  /** Position („12 / 70“) und die Hinweise über der Filmleiste – in beiden Ansichten. */
  function renderStripInfo(list) {
    // Position: welches Bild von wie vielen (im aktuellen Filter)
    const pos = list.indexOf(sess.index);
    const tp = $('#t-pos');
    if (tp) {
      tp.textContent = ` · ${pos >= 0 ? fmtInt(pos + 1) : '–'} / ${fmtInt(list.length)}`;
      tp.title = S.filter === 'all' ? 'Bild Nummer … von allen Bildern' : 'Bild Nummer … im aktuellen Filter';
    }
    // Hinweis auf markierte Bilder (für den Vergleich)
    const n = S.compareSel.length;
    const si = $('#selinfo');
    const go = $('#sel-go');
    const x = $('#sel-x');
    si.classList.toggle('hidden', n === 0);
    x.onclick = () => {
      S.compareSel = [];
      renderStrip();
    };
    // ab 7 Bildern scrollt das Mausrad durch den Vergleich – dann zeigen, wie man zoomt
    const hint = $('#cmphint');
    const scrolls = comparing() && n > 6;
    hint.classList.toggle('hidden', !scrolls);
    if (scrolls) hint.textContent = `${isMac ? '⌘' : 'Strg'} + Mausrad zoomt`;
    if (comparing()) {
      go.textContent = 'Vergleich beenden (Esc) ✕';
      go.title = 'Vergleich beenden – das aktive Bild bleibt groß';
      go.onclick = exitCompare;
      go.disabled = false;
      x.classList.add('hidden');
    } else if (n >= 2) {
      // im Raster: Knopf startet den Vergleich, ✕ hebt die Auswahl auf
      go.textContent = `${n} vergleichen (Enter)`;
      go.title = 'Ausgewählte Bilder nebeneinander vergleichen';
      go.onclick = () => setGrid(false);
      go.disabled = false;
      x.classList.remove('hidden');
    } else {
      go.textContent = '1 ausgewählt';
      go.title = 'Mit Strg+Klick weitere Bilder auswählen';
      go.onclick = null;
      go.disabled = true;
      x.classList.remove('hidden');
    }
    $('#serinfo').classList.add('hidden'); // Serien vergleicht man an der Serie selbst
  }

  /** Für jede Position der Filmleiste: Teil einer Serie? (zusammenhängend sichtbare Bilder derselben Serie) */
  function seriesRuns(list) {
    const out = new Array(list.length).fill(null);
    let j = 0;
    while (j < list.length) {
      const g = A.seriesOf(S.items[list[j]].id);
      let e = j;
      while (g && e + 1 < list.length && A.seriesOf(S.items[list[e + 1]].id) === g) e++;
      if (e > j) for (let x = j; x <= e; x++) out[x] = { first: x === j, last: x === e, size: e - j + 1 };
      j = e + 1;
    }
    return out;
  }

  // ------------------------------------------------------------------ Rasteransicht

  // Raster aus gleich großen Quadraten; jedes Bild steht ganz darin (wie in Lightroom).
  // Jede Serie beginnt in einer neuen Reihe und hat eine Überschrift mit „Vergleichen“.
  let gridKey = '';
  let gridScrolled = -1;
  const gridSize = () => Math.min(420, Math.max(100, Number(S.settings.gridSize) || 200));

  const gridObserver = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const it = S.items[Number(en.target.dataset.i)];
        if (it && !S.thumbs.has(it.id)) queueThumb(it);
      }
      pump();
    },
    { root: $('#gridview'), rootMargin: '400px 0px' }
  );

  function gridHtml(list) {
    const runs = seriesRuns(list);
    return list
      .map((i, j) => {
        const it = S.items[i];
        const r = runs[j];
        const th = S.thumbs.get(it.id);
        let pre = '';
        if (r?.first) {
          pre = `<div class="g-ser"><span>Serie · ${r.size} Bilder</span><button class="btn sm" data-series="${esc(it.id)}" title="Alle Bilder dieser Serie nebeneinander vergleichen">Vergleichen</button></div>`;
        }
        const post = r?.last ? '<div class="g-break"></div>' : '';
        return `${pre}<button class="gcell" data-i="${i}" role="option" title="${esc(it.name)}" aria-label="${esc(it.name)}">${th ? `<img src="${fileSrc(th)}" alt="">` : ''}<span class="dots"></span></button>${post}`;
      })
      .join('');
  }

  function renderGrid() {
    const el = $('#gcells');
    const list = A.visibleIndices();
    el.style.gridTemplateColumns = `repeat(auto-fill, minmax(${gridSize()}px, 1fr))`;
    const key = `${S.filter}|${list.join(',')}`;
    if (key !== gridKey) {
      gridKey = key;
      gridObserver.disconnect();
      el.innerHTML = gridHtml(list);
      $$('.gcell', el).forEach((b) => gridObserver.observe(b));
      $$('[data-series]', el).forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        openSeries(b.dataset.series);
      }));
      gridScrolled = -1;
    }
    for (const b of el.querySelectorAll('.gcell')) {
      const i = Number(b.dataset.i);
      const it = S.items[i];
      const on = i === sess.index;
      b.classList.toggle('cur', on);
      b.setAttribute('aria-selected', on);
      b.classList.toggle('sel', S.compareSel.includes(it.id));
      b.querySelector('.dots').innerHTML = A.copiedPaths(it.id)
        .map((p) => `<span style="background:${A.targetByPath(p)?.color || '#9A9A9A'}"></span>`)
        .join('');
      const edited = !A.isIdentity(A.editsOf(it.id));
      const mark = b.querySelector('.edit');
      if (edited && !mark) b.insertAdjacentHTML('beforeend', `<span class="edit">${icons.pen}</span>`);
      if (!edited && mark) mark.remove();
    }
    renderStripInfo(list);
    if (gridScrolled !== sess.index) {
      gridScrolled = sess.index;
      el.querySelector(`.gcell[data-i="${sess.index}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  /** ↑ / ↓: in die Reihe darüber bzw. darunter, zum Bild in derselben Spalte (oder dem nächsten). */
  function gridMoveRow(dir) {
    const c = $(`#gcells .gcell[data-i="${sess.index}"]`);
    if (!c) return;
    const r = c.getBoundingClientRect();
    const cells = $$('#gcells .gcell').map((x) => ({ x, q: x.getBoundingClientRect() }));
    const rows = cells.filter(({ q }) => (dir > 0 ? q.top > r.top + 2 : q.top < r.top - 2));
    if (!rows.length) return;
    const rowTop = dir > 0 ? Math.min(...rows.map((o) => o.q.top)) : Math.max(...rows.map((o) => o.q.top));
    const cx = r.left + r.width / 2;
    let best = null;
    let bestD = Infinity;
    for (const o of rows) {
      if (Math.abs(o.q.top - rowTop) > 2) continue;
      const d = Math.abs(o.q.left + o.q.width / 2 - cx);
      if (d < bestD) {
        bestD = d;
        best = o.x;
      }
    }
    if (!best) return;
    sess.index = Number(best.dataset.i);
    showCurrent();
  }

  // Strg + Mausrad: Bilder im Raster größer oder kleiner
  $('#gridview').addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const next = Math.min(420, Math.max(100, gridSize() + (e.deltaY < 0 ? 30 : -30)));
      if (next === gridSize()) return;
      S.settings.gridSize = next;
      saveSettings(S.settings);
      renderGrid();
    },
    { passive: false }
  );

  function gridMove(delta) {
    const list = A.visibleIndices();
    const pos = list.indexOf(sess.index);
    const next = list[Math.min(list.length - 1, Math.max(0, pos + delta))];
    if (next == null || next === sess.index) return;
    sess.index = next;
    showCurrent();
  }

  function setGrid(on) {
    if (cropping || S.grid === on) return;
    S.grid = on;
    if (!on) {
      // Raster verlassen: ab 2 ausgewählten Bildern geht es in den Vergleich
      if (S.compareSel.length < 2) S.compareSel = [];
      else if (!S.compareSel.includes(cur()?.id)) sess.index = A.indexOfId(S.compareSel[0]);
    }
    applyGridMode();
    if (on) {
      hideMask();
      hideFocus();
    }
    showCurrent();
  }
  const toggleGrid = () => setGrid(!S.grid);

  function applyGridMode() {
    $('.sorter').classList.toggle('gridmode', S.grid);
    $('#gridview').classList.toggle('hidden', !S.grid);
    if (!S.grid) gridKey = ''; // beim nächsten Öffnen neu aufbauen
  }

  $('#gcells').onclick = (e) => {
    const b = e.target.closest('.gcell');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (isMod(e)) return toggleSel(S.items[i].id);
    S.compareSel = []; // normaler Klick: nur dieses Bild
    sess.index = i;
    showCurrent();
  };
  $('#gcells').ondblclick = (e) => {
    const b = e.target.closest('.gcell');
    if (!b) return;
    sess.index = Number(b.dataset.i);
    // Doppelklick öffnet genau dieses Bild – außer es gehört zur Auswahl, dann deren Vergleich
    if (!S.compareSel.includes(S.items[sess.index].id)) S.compareSel = [];
    setGrid(false);
  };

  function queueThumb(it) {
    if (!thumbQueue.includes(it)) thumbQueue.push(it);
  }

  function pump() {
    while (thumbBusy < 3 && thumbQueue.length) {
      const it = thumbQueue.shift();
      if (S.thumbs.has(it.id)) continue;
      thumbBusy++;
      api
        .thumb(it)
        .then((p) => {
          S.thumbs.set(it.id, p);
          const n = S.items.indexOf(it);
          for (const b of $$(`.thumb[data-i="${n}"], .gcell[data-i="${n}"]`)) {
            const box = b.querySelector('.th-img') || b;
            if (!box.querySelector('img')) box.insertAdjacentHTML('afterbegin', `<img src="${fileSrc(p)}" alt="">`);
          }
        })
        .catch(() => {})
        .finally(() => {
          thumbBusy--;
          pump();
        });
    }
  }

  function describeEdits(e) {
    const parts = [];
    if (e.rot) parts.push(`gedreht um ${e.rot}°`);
    if (e.angle) parts.push(`begradigt um ${String(e.angle).replace('.', ',')}°`);
    if (e.crop) parts.push(`zugeschnitten (${e.aspect || 'frei'})`);
    return parts.join(', ');
  }

  const histoPending = new Set();
  /** Histogramm (Rot, Grün, Blau) als kleine Grafik. */
  function histogramSvg(it) {
    const h = S.histos.get(it.id);
    if (!h) {
      if (!histoPending.has(it.id)) {
        histoPending.add(it.id);
        api
          .histogram(it)
          .then((x) => {
            S.histos.set(it.id, x);
            if (cur() === it && S.showInfo) renderInfo();
          })
          .catch(() => {})
          .finally(() => histoPending.delete(it.id));
      }
      return '<div class="histo" aria-hidden="true"></div>';
    }
    // Spitzen ganz links und rechts (reines Schwarz / Weiß) nicht zur Skalierung heranziehen
    let max = 1;
    for (const ch of h) for (let i = 1; i < 255; i++) max = Math.max(max, ch[i]);
    const path = (ch) => {
      let d = 'M0,100';
      for (let i = 0; i < 256; i++) d += `L${i},${(100 - Math.min(1, ch[i] / max) * 96).toFixed(1)}`;
      return d + 'L255,100Z';
    };
    const colors = ['rgba(255,70,70,.85)', 'rgba(70,220,90,.85)', 'rgba(80,130,255,.9)'];
    // Anteil abgeschnittener Bildpunkte: reines Schwarz (0) bzw. reines Weiß (255), stärkster Farbkanal zählt
    const total = Math.max(1, h[0].reduce((a, b) => a + b, 0));
    const lo = Math.max(...h.map((ch) => ch[0])) / total * 100;
    const hi = Math.max(...h.map((ch) => ch[255])) / total * 100;
    const pct = (v) => (v < 0.1 && v > 0 ? '< 0,1' : v.toFixed(1).replace('.', ','));
    const loOn = lo > 0.5;
    const hiOn = hi > 0.5;
    return `<div style="position:relative">
      <svg class="histo" viewBox="0 0 255 100" preserveAspectRatio="none" role="img" aria-label="Histogramm">${h
        .map((ch, i) => `<path d="${path(ch)}" fill="${colors[i]}"/>`)
        .join('')}</svg>
      <button class="histo-tri lo ${loOn ? 'on' : ''} ${S.clip ? 'active' : ''}" id="histo-lo" title="Schatten: ${pct(lo)} % reines Schwarz${loOn ? ' – ohne Zeichnung' : ''} · Klick zeigt die Stellen (${esc(keyLabel(keys.clip))})" aria-label="Schatten: ${pct(lo)} % reines Schwarz"></button>
      <button class="histo-tri hi ${hiOn ? 'on' : ''} ${S.clip ? 'active' : ''}" id="histo-hi" title="Lichter: ${pct(hi)} % reines Weiß${hiOn ? ' – ohne Zeichnung' : ''} · Klick zeigt die Stellen (${esc(keyLabel(keys.clip))})" aria-label="Lichter: ${pct(hi)} % reines Weiß"></button>
    </div>`;
  }

  function renderInfo() {
    const el = $('#info');
    const it = cur();
    const hidden = !S.showInfo || !it;
    el.classList.toggle('hidden', hidden);
    if (hidden) return;
    const info = S.infos.get(it.id);
    if (!info && !infoPending.has(it.id)) {
      infoPending.add(it.id);
      api.info(it).then((x) => {
        S.infos.set(it.id, x);
        if (cur() === it) renderInfo();
      }).catch(() => S.infos.set(it.id, {}));
    }
    const v = (x) => esc(x || '–');
    const e = A.editsOf(it.id);
    const copies = Object.entries(S.session.copied[it.id] || {}).filter(([p]) => A.targetByPath(p));
    el.innerHTML = `
      <h2>Informationen</h2>
      <div class="kv"><b>${esc(it.name)}</b>
        <span class="muted small">${esc(it.kind)}${info?.width ? ` · ${info.width} × ${info.height}` : ''} · ${fmtBytes(it.bytes)}</span></div>
      ${histogramSvg(it)}
      <div class="exif-grid">
        <div><small>Blende</small>${v(info?.fnumber)}</div>
        <div><small>Zeit</small>${v(info?.exposure)}</div>
        <div><small>ISO</small>${v(info?.iso)}</div>
        <div><small>Brennweite</small>${v(info?.focal)}</div>
      </div>
      <div class="kv"><small>Aufgenommen</small><span>${fmtTaken(info?.taken || it.taken)}</span></div>
      <div class="kv"><small>Kamera / Objektiv</small><span>${v(info?.camera)}${info?.lens ? '<br>' + esc(info.lens) : ''}</span></div>
      ${it.dir ? `<div class="kv"><small>Unterordner</small><span class="path">${esc(it.dir)}</span></div>` : ''}
      <div class="kv" style="gap:6px"><small>Kopiert nach</small>
        ${
          copies.length
            ? copies
                .map(([p, rec]) => {
                  const t = A.targetByPath(p);
                  return `<div class="row"><span style="width:10px;height:10px;border-radius:5px;background:${t ? t.color : '#9A9A9A'}"></span>
                    <span class="grow">${esc(t ? t.name : folderName(p))}${rec.renamed ? `<br><span class="muted tiny">als ${esc(rec.stem)}</span>` : ''}</span>
                    <button class="btn sm" data-rm="${esc(p)}" aria-label="Aus ${esc(t ? t.name : p)} entfernen">Entfernen</button></div>`;
                })
                .join('')
            : '<span class="muted">Noch nicht kopiert</span>'
        }
      </div>
      ${!A.isIdentity(e) ? `<div class="kv" style="gap:6px"><small>Bearbeitung</small><span>${esc(describeEdits(e))}</span><button class="btn sm" id="i-reset" style="align-self:flex-start">Bearbeitung entfernen</button></div>` : ''}`;
    $$('[data-rm]', el).forEach((b) => (b.onclick = () => A.removeFrom(it, b.dataset.rm)));
    const hb = $('#histo-hi');
    if (hb) hb.onclick = toggleClip;
    const lb = $('#histo-lo');
    if (lb) lb.onclick = toggleClip;
    const reset = $('#i-reset');
    if (reset) reset.onclick = async () => {
      viewer.setEdits(null);
      await A.applyEdits(it, null);
      toast('Bearbeitung entfernt – die Kopien entsprechen wieder dem Original', '#4CC2FF');
    };
  }



  // ------------------------------------------------------------------ Aktionen

  function step(dir, { toFinish = true } = {}) {
    if (cropping) return;
    const list = A.visibleIndices();
    if (!list.length) return;
    let next;
    const pos = list.indexOf(sess.index);
    if (pos >= 0) next = list[pos + dir];
    else next = dir > 0 ? list.find((i) => i > sess.index) : [...list].reverse().find((i) => i < sess.index);
    if (next == null) {
      if (dir > 0 && S.filter === 'all' && toFinish && !S.grid) return go('finish');
      toast(dir > 0 ? 'Letztes Bild in diesem Filter' : 'Erstes Bild', '#9A9A9A');
      return;
    }
    sess.index = next;
    showCurrent();
  }

  async function copyKey(key) {
    const it = cur();
    if (!it) return;
    if (cropping) return toast('Erst den Zuschnitt übernehmen oder abbrechen', '#FFB454');
    let t = sess.targets.find((x) => x.key === key);
    if (!t) {
      t = await A.addTarget(sess.targets, key);
      if (!t) return;
      A.save();
    }
    const ok = await A.copyTo(it, t);
    if (ok && S.settings.autoNext && cur() === it && !comparing()) step(1, { toFinish: false });
  }

  async function del() {
    const it = cur();
    if (!it || cropping) return;
    const sel = [...S.compareSel];
    const wasCmp = comparing();
    if (!(await A.confirmDelete(it)) || !(await A.deleteItem(it))) return;
    toast(`Gelöscht · ${MOD}Z holt es zurück`, '#FF99A4');
    if (wasCmp) {
      // im Vergleich: das nächste Bild des Vergleichs wird aktiv
      const pos = sel.indexOf(it.id);
      const rest = sel.filter((x) => x !== it.id);
      S.compareSel = rest.length >= 2 ? rest : [];
      if (rest.length) sess.index = A.indexOfId(rest[Math.min(pos, rest.length - 1)]);
    }
    showCurrent();
  }

  async function rotate() {
    const it = cur();
    if (!it || cropping || S.grid || comparing()) return;
    const e = A.editsOf(it.id) || { rot: 0, angle: 0, crop: null };
    const ne = { ...e, rot: ((e.rot || 0) + 90) % 360, crop: A.rotateCrop(e.crop) };
    viewer.setEdits(ne);
    if (S.clip) hideMask();
    await A.applyEdits(it, ne);
    if (S.clip) loadMask(it);
    toast(ne.rot ? `Gedreht um ${ne.rot}° · gilt nur für Kopien` : 'Drehung aufgehoben', '#4CC2FF');
  }

  function enterCrop() {
    if (cropping || !cur() || S.grid || comparing()) return;
    cropping = true;
    document.body.classList.add('cropping');
    hideMask();
    hideFocus();
    viewer.enterCrop();
    renderCropPanel();
    renderTools();
    renderInfo();
    viewer.layout();
  }

  function exitCrop() {
    if (!cropping) return;
    cropping = false;
    document.body.classList.remove('cropping');
    viewer.exitCrop();
    $('#croppanel').classList.add('hidden');
    renderAll();
    if (S.clip) loadMask(cur());
    if (S.focus) loadFocus(cur());
  }

  async function applyCrop() {
    const it = cur();
    const r = viewer.cropResult();
    const e = A.editsOf(it.id) || { rot: 0 };
    const ne = { rot: e.rot || 0, angle: r.angle, crop: r.crop, aspect: r.aspect, portrait: r.portrait };
    exitCrop();
    viewer.setEdits(ne);
    await A.applyEdits(it, ne);
    toast(
      A.isIdentity(ne) ? 'Kein Zuschnitt – Kopien entsprechen dem Original' : 'Zuschnitt gespeichert · gilt nur für Kopien (RAW → .xmp, JPG → bearbeitete Kopie)',
      '#4CC2FF'
    );
  }

  function renderCropPanel() {
    const d = viewer.draft;
    const el = $('#croppanel');
    el.classList.remove('hidden');
    const canFlip = !['Frei', '1:1'].includes(d.aspect);
    el.innerHTML = `<div>
      ${ASPECTS.map(([l]) => `<button class="seg ${d.aspect === l ? 'on' : ''}" data-a="${esc(l)}">${esc(l)}</button>`).join('')}
      ${canFlip ? `<button class="seg" id="c-flip" title="Hoch- oder Querformat">Hoch ⇄ Quer</button>` : ''}
      <span class="sep"></span>
      <label class="row small">Begradigen
        <input type="range" id="c-angle" min="-10" max="10" step="0.1" value="${d.angle}" style="width:130px" aria-label="Begradigen in Grad">
        <span id="c-av" style="width:44px">${fmtAngle(d.angle)}</span></label>
      <button class="btn sm ghost" id="c-reset">Zurücksetzen</button>
      <button class="btn sm" id="c-cancel">Abbrechen (Esc)</button>
      <button class="btn sm primary" id="c-ok">Übernehmen (${keyLabel('Enter')})</button></div>`;
    $$('[data-a]', el).forEach((b) => (b.onclick = () => {
      viewer.setAspect(b.dataset.a);
      renderCropPanel();
    }));
    $('#c-flip') && ($('#c-flip').onclick = () => {
      viewer.setAspect(d.aspect, !d.portrait);
      renderCropPanel();
    });
    $('#c-angle').oninput = (e) => {
      viewer.setAngle(Number(e.target.value));
      $('#c-av').textContent = fmtAngle(Number(e.target.value));
    };
    $('#c-angle').ondblclick = () => {
      viewer.setAngle(0);
      renderCropPanel();
    };
    $('#c-reset').onclick = () => {
      viewer.resetCrop();
      renderCropPanel();
    };
    $('#c-cancel').onclick = exitCrop;
    $('#c-ok').onclick = applyCrop;
  }

  const fmtAngle = (a) => `${a > 0 ? '+' : ''}${a.toFixed(1).replace('.', ',')}°`;

  function toggleClip() {
    if (cropping || S.grid || comparing()) return;
    S.clip = !S.clip;
    if (S.clip && !cropping) loadMask(cur());
    else hideMask();
    renderTools();
    if (S.showInfo) renderInfo(); // Dreieck im Histogramm mitschalten
  }

  function toggleFocus() {
    if (cropping || S.grid || comparing()) return;
    S.focus = !S.focus;
    if (S.focus) loadFocus(cur());
    else hideFocus();
    renderTools();
  }

  /** Ganze Serie im Vergleich öffnen – die des aktuellen Bildes oder die eines anderen Bildes (id). */
  function openSeries(id) {
    const it = typeof id === 'string' ? S.items[A.indexOfId(id)] : cur();
    const g = it && A.seriesOf(it.id);
    if (!g) return toast('Dieses Bild gehört zu keiner Serie', '#9A9A9A');
    S.compareSel = g.filter((x) => !A.isDeleted(x));
    if (!S.compareSel.includes(cur()?.id)) sess.index = A.indexOfId(S.compareSel[0]);
    if (S.grid) {
      S.grid = false;
      applyGridMode();
    }
    showCurrent();
  }

  function toggleInfo() {
    S.showInfo = !S.showInfo;
    S.settings.showInfo = S.showInfo;
    saveSettings(S.settings);
    renderInfo();
    renderTools();
  }

  // Strg+Klick: Bild zur Auswahl dazunehmen oder herausnehmen – in Filmleiste und Raster gleich.
  // Das aktuelle Bild gehört immer dazu und bleibt das aktuelle.
  // Ab 2 Bildern erscheint der Vergleich; im Raster erst beim Verlassen des Rasters.
  function toggleSel(id) {
    const c = cur().id;
    let sel = S.compareSel.length ? [...S.compareSel] : [c];
    if (sel.includes(id)) {
      const pos = sel.indexOf(id);
      sel = sel.filter((x) => x !== id);
      if (id === c && sel.length) sess.index = A.indexOfId(sel[Math.min(pos, sel.length - 1)]);
    } else {
      sel.push(id);
    }
    if (sel.length < 2) {
      if (sel[0]) sess.index = A.indexOfId(sel[0]);
      sel = [];
    }
    S.compareSel = sel;
    showCurrent();
  }

  /** Umschalt + Pfeil: das nächste Bild der Filmleiste dazunehmen. */
  function extendSel(dir) {
    const list = A.visibleIndices();
    const next = list[list.indexOf(sess.index) + dir];
    if (next == null) return;
    const sel = S.compareSel.length ? [...S.compareSel] : [cur().id];
    if (!sel.includes(S.items[next].id)) sel.push(S.items[next].id);
    S.compareSel = sel;
    sess.index = next;
    showCurrent();
  }

  function toggleFs(force) {
    return force === undefined ? toggleFullscreen() : setFullscreen(force);
  }

  const onFsChange = () => {
    renderTop();
    renderBadges();
    requestAnimationFrame(() => {
      if (comparing()) placeCompare();
      else viewer.layout();
    });
  };
  window.addEventListener('fs-change', onFsChange);

  async function leave() {
    await A.endSession();
    go('start');
  }

  function editTarget(t) {
    editTargetDialog({
      t,
      targets: sess.targets,
      source: sess.source,
      onChange: ({ pathChanged, oldPath }) => {
        if (pathChanged) {
          if (S.filter === oldPath) S.filter = 'all';
          delete S.targetState[t.path];
        }
        A.save();
      },
      onRemove: (rt) => {
        if (S.filter === rt.path) S.filter = 'all';
        A.save();
        renderAll();
        toast(`Zielordner »${rt.name}« entfernt – bereits kopierte Bilder bleiben dort liegen`, '#9A9A9A');
      },
      onClose: () => {
        A.save();
        renderAll();
      },
    });
  }

  // ------------------------------------------------------------------ Tastatur und Maus

  function onKey(e) {
    lastInput = Date.now();
    const k = normKey(e);
    const is = (id) => k === keys[id] || (id === 'del' && isMac && (k === 'Delete' || k === 'Backspace'));
    if (cropping) {
      if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
      else if (e.key === 'Escape' || is('crop')) { e.preventDefault(); exitCrop(); }
      return;
    }
    if (isMod(e) && k === 'z') { e.preventDefault(); A.undo(); return; }
    if (isMod(e) || e.altKey) return;
    if (e.key === '?') { e.preventDefault(); helpDialog(helpList(keys)); return; }
    if (e.key === 'Escape') {
      const menu = $('#filtermenu');
      if (menu && !menu.classList.contains('hidden')) menu.classList.add('hidden');
      else if (S.grid) setGrid(false);
      else if (comparing()) exitCompare();
      else if (S.fullscreen) toggleFs(false);
      else if (S.compareSel.length) { S.compareSel = []; renderStrip(); }
      return;
    }
    if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      extendSel(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      if (!e.repeat) copyKey(e.key);
      return;
    }
    if (S.grid) {
      // Rasteransicht: mit Pfeilen durch das Raster, Enter öffnet das Bild groß
      if (e.key === 'ArrowRight') { e.preventDefault(); gridMove(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); gridMove(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); gridMoveRow(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); gridMoveRow(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); setGrid(false); }
      else if (is('grid')) toggleGrid();
      else if (is('copy1')) { e.preventDefault(); if (!e.repeat && sess.targets[0]) copyKey(sess.targets[0].key); }
      else if (is('del')) { e.preventDefault(); if (!e.repeat) del(); }
      else if (is('series')) openSeries();
      else if (is('info')) toggleInfo();
      else if (is('fullscreen')) toggleFs();
      return;
    }
    if (comparing()) {
      // Vergleich: Pfeile wechseln die aktive Kachel, ↑ / ↓ eine Reihe
      if (e.key === 'ArrowRight') { e.preventDefault(); cmp.move(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); cmp.move(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cmp.move(cmp.cols()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmp.move(-cmp.cols()); }
      else if (e.key === 'Enter') { e.preventDefault(); exitCompare(); }
      else if (is('drop')) { e.preventDefault(); if (!e.repeat) cmp.drop(); }
      else if (is('copy1')) { e.preventDefault(); if (!e.repeat && sess.targets[0]) copyKey(sess.targets[0].key); }
      else if (is('del')) { e.preventDefault(); if (!e.repeat) del(); }
      else if (is('zoom')) { if (!e.repeat) zoomDown(cmp.viewer()); }
      else if (is('grid')) toggleGrid();
      else if (is('series')) openSeries();
      else if (is('info')) toggleInfo();
      else if (is('fullscreen')) toggleFs();
      return;
    }
    if (is('next')) { e.preventDefault(); step(1); }
    else if (is('prev')) { e.preventDefault(); step(-1); }
    else if (is('copy1')) { e.preventDefault(); if (!e.repeat && sess.targets[0]) copyKey(sess.targets[0].key); }
    else if (is('del')) { e.preventDefault(); if (!e.repeat) del(); }
    else if (is('rotate')) { if (!e.repeat) rotate(); }
    else if (is('crop')) enterCrop();
    else if (is('zoom')) { if (!e.repeat) zoomDown(viewer); }
    else if (is('clip')) toggleClip();
    else if (is('focus')) toggleFocus();
    else if (is('grid')) toggleGrid();
    else if (is('series')) openSeries();
    else if (is('info')) toggleInfo();
    else if (is('fullscreen')) toggleFs();
  }

  // Zoom-Taste: kurz drücken schaltet um, gedrückt halten zeigt 100 % nur solange die Taste unten ist
  let peek = null;
  function zoomDown(v) {
    if (!v) return;
    const wasZoomed = v.isZoomed();
    v.toggle100(mouse[0], mouse[1]);
    peek = wasZoomed ? null : { t: Date.now(), v };
  }
  const onKeyUp = (e) => {
    if (!peek || normKey(e) !== keys.zoom) return;
    const p = peek;
    peek = null;
    if (Date.now() - p.t > 250 && p.v.isZoomed()) p.v.toggle100(); // losgelassen → wieder ganzes Bild
  };
  document.addEventListener('keyup', onKeyUp);
  const onBlur = () => (peek = null);
  window.addEventListener('blur', onBlur);

  const onMouse = (e) => {
    mouse = [e.clientX, e.clientY];
    lastInput = Date.now();
  };
  document.addEventListener('mousemove', onMouse);

  const onResize = () => {
    lastScrolled = -1; // aktuelles Bild wieder mittig zeigen
    renderStrip();
    if (comparing()) placeCompare();
  };
  window.addEventListener('resize', onResize);
  // Info-Leiste: standardmäßig aus, die App merkt sich deine Wahl
  S.showInfo = !!S.settings.showInfo;

  // Pfeile links/rechts nur zeigen, wenn die Maus in der Nähe des Randes ist
  const stageWrap = $('.stage-wrap');
  const onStageMove = (e) => {
    const r = stageWrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    $('#nav-prev').classList.toggle('show', x < 140);
    $('#nav-next').classList.toggle('show', x > r.width - 140);
  };
  const onStageLeave = () => {
    $('#nav-prev').classList.remove('show');
    $('#nav-next').classList.remove('show');
  };
  stageWrap.addEventListener('mousemove', onStageMove);
  stageWrap.addEventListener('mouseleave', onStageLeave);

  // Arbeitszeit für die Zusammenfassung mitzählen
  const timer = setInterval(() => {
    if (Date.now() - lastInput < 60_000) {
      sess.activeMs = (sess.activeMs || 0) + 10_000;
      A.save();
    }
  }, 10_000);

  // Nach einem Mausklick den Fokus vom Knopf nehmen – sonst löst Enter/Leertaste ihn erneut aus
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setTimeout(() => b.blur());
  });

  $('#nav-prev').onclick = () => step(-1);
  $('#nav-next').onclick = () => step(1);

  S.onChange = (opts) => {
    if (opts.jumpTo != null && opts.jumpTo >= 0 && !A.isDeleted(S.items[opts.jumpTo].id)) {
      sess.index = opts.jumpTo;
      if (!A.visibleIndices().includes(sess.index)) S.filter = 'all';
      showCurrent();
      return;
    }
    const it = cur();
    if (comparing()) cmp.refreshEdits();
    else if (it) viewer.setEdits(A.editsOf(it.id));
    renderAll();
  };

  applyGridMode();
  showCurrent();

  return {
    onKey,
    unmount() {
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      clearInterval(timer);
      gridObserver.disconnect();
      thumbObserver.disconnect();
      window.removeEventListener('fs-change', onFsChange);
      document.removeEventListener('click', closeFilterMenu);
      clearTimeout(zoomTipTimer);
      preloadToken++;
      document.removeEventListener('mousemove', onMouse);
      window.removeEventListener('resize', onResize);
      document.body.classList.remove('cropping');
      S.onChange = null;
      setToastHost(null);
      viewer.destroy();
      cmp.clear();
      A.save();
    },
  };
}

// Einstellungen.

import { S, go } from '../state.js';
import { saveSettings } from '../store.js';
import { ACTIONS, defaultKeys, keyLabel, normKey } from '../keys.js';
import { esc, $, $$, icons, toast, setToastDuration } from '../ui.js';
import { applyTheme } from '../theme.js';
import { bindFullscreenButton } from '../fullscreen.js';
import { U, onUpdateChange, checkUpdate, installUpdate, updateText, appVersion } from '../update.js';
import { resetTips } from '../tips.js';

export function mount(root) {
  const st = S.settings;
  let capturing = null;
  let unbindFs = () => {};

  const select = (id, value, options) =>
    `<select class="input" id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const row = (label, control, last = false) =>
    `<label class="list-row" ${last ? 'style="border-bottom:0"' : ''}><span class="grow">${label}</span>${control}</label>`;

  let version = '';
  appVersion().then((v) => {
    version = v;
    renderUpdate();
  });
  function renderUpdate() {
    const row = root.querySelector('#upd-row');
    const btns = root.querySelector('#upd-btns');
    if (!row || !btns) return;
    const txt = updateText();
    row.innerHTML = `Version ${esc(version || '–')}${txt ? ` <span class="muted small">· ${esc(txt)}</span>` : ''}`;
    if (U.state === 'available') {
      btns.innerHTML = '<button class="btn primary sm" id="upd-go">Jetzt aktualisieren</button>';
      btns.querySelector('#upd-go').onclick = () => installUpdate();
    } else {
      const busy = U.state === 'checking' || U.state === 'loading';
      btns.innerHTML = `<button class="btn sm" id="upd-check" ${busy ? 'disabled' : ''}>Nach Updates suchen</button>`;
      btns.querySelector('#upd-check').onclick = () => checkUpdate();
    }
  }
  const offUpdate = onUpdateChange(renderUpdate);

  function render() {
    // Scrollposition merken, damit die Seite nach einer Änderung nicht nach oben springt
    const scroll = root.querySelector('.page')?.scrollTop || 0;
    root.innerHTML = `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Zurück">${icons.back}</button><span class="grow"></span><button class="icon-btn" id="fsbtn"></button></div>
      <div class="page"><div style="max-width:820px;margin:0 auto;padding:36px 32px;display:flex;flex-direction:column;gap:22px">
        <h1>Einstellungen</h1>

        <section class="section"><h2>Über ShotSort</h2>
          <div class="card">
            <div class="list-row"><span class="grow" id="upd-row"></span><span id="upd-btns"></span></div>
            ${row('Automatisch nach Updates suchen <span class="muted small">(beim Start und alle 6 Stunden)</span>', `<input type="checkbox" id="s-autoupd" ${st.autoUpdate !== false ? 'checked' : ''}>`, true)}
          </div></section>

        <section class="section"><h2>Darstellung</h2>
          <div class="card pad row wrap" style="gap:12px">
            <span class="grow">Farbschema</span>
            ${[['dark', 'Dunkel'], ['light', 'Hell'], ['system', 'Wie System']]
              .map(([v, l]) => `<button class="seg ${st.theme === v ? 'on' : ''}" data-th="${v}">${l}</button>`)
              .join('')}
          </div></section>

        <section class="section"><h2>Meldungen und Anzeige</h2><div class="card">
          ${row('Erfolgsmeldung anzeigen für', select('s-toast', st.toastMs, [[1500, '1,5 Sekunden'], [2500, '2,5 Sekunden'], [4000, '4 Sekunden'], [6000, '6 Sekunden']]))}
          ${row('Zu hell / zu dunkel markieren ab', select('s-clip', st.clipThreshold, [[240, 'über 94 % / unter 6 %'], [250, 'über 98 % / unter 2 %'], [255, 'nur reines Weiß / Schwarz']]))}
          ${row('Zoomstufe beim Blättern beibehalten', `<input type="checkbox" id="s-keep" ${st.keepZoom ? 'checked' : ''}>`)}
          ${row('Nach dem Kopieren zum nächsten Bild springen', `<input type="checkbox" id="s-next" ${st.autoNext ? 'checked' : ''}>`)}
          ${row('Einführung und Tipps beim Sortieren', '<button class="btn sm" id="s-tips">Wieder anzeigen</button>', true)}
        </div></section>

        <section class="section"><h2>Dateien</h2><div class="card">
          ${row('Reihenfolge der Bilder', select('s-sort', st.sort, [['time', 'Nach Aufnahmezeit'], ['name', 'Nach Dateiname']]))}
          ${row('Schärfe bewerten <span class="muted small">(unscharfe Bilder und das schärfste einer Serie markieren)</span>', `<input type="checkbox" id="s-blur" ${st.detectBlur !== false ? 'checked' : ''}>`)}
          ${row('Serien erkennen (Bilder kurz nacheinander)', select('s-series', st.seriesGap ?? 2, [[0, 'Aus'], [1, 'bis 1 Sekunde Abstand'], [2, 'bis 2 Sekunden Abstand'], [3, 'bis 3 Sekunden Abstand'], [5, 'bis 5 Sekunden Abstand']]))}
          ${row('Gleicher Name im Zielordner', select('s-conf', st.conflict, [['number', 'Nummer anhängen (_2)'], ['skip', 'Überspringen']]))}
          ${row('Zuschnitt bei RAW-Dateien', select('s-raw', st.rawMode, [['xmp', 'Als .xmp-Datei speichern'], ['jpg', 'Zusätzlich als JPG ausgeben (nur RAW ohne JPG)']]))}
          ${row('JPG-Qualität für bearbeitete Kopien', select('s-q', st.jpgQuality, [[100, '100 (maximal)'], [95, '95 (sehr hoch)'], [90, '90 (hoch)'], [85, '85']]))}
          ${row('Vor dem Löschen nachfragen', `<input type="checkbox" id="s-askdel" ${st.confirmDelete !== false ? 'checked' : ''}>`, true)}
        </div></section>

        <section class="section">
          <div class="row"><h2 class="grow">Tastenbelegung</h2><button class="link" id="k-reset">Standard wiederherstellen</button></div>
          <div class="card">
            ${ACTIONS.map(
              (a, i) => `<div class="list-row" ${i === ACTIONS.length - 1 ? 'style="border-bottom:0"' : ''}>
                <span class="grow">${esc(a.label)}</span>
                <span class="kbd" style="min-width:90px">${capturing === a.id ? 'Taste drücken …' : esc(keyLabel(st.keys[a.id]))}</span>
                <button class="btn sm" data-key="${a.id}">${capturing === a.id ? 'Abbrechen' : 'Ändern'}</button></div>`
            ).join('')}
            <div class="list-row muted small" style="border-bottom:0">Fest belegt: 1–9 (Zielordner), ? (Hilfe), Enter, Esc, F11, Strg/⌘ + Z (rückgängig).</div>
          </div></section>
      </div></div>`;

    root.querySelector('.page').scrollTop = scroll;
    unbindFs();
    unbindFs = bindFullscreenButton($('#fsbtn'), icons);
    $('#back').onclick = back;
    $$('[data-th]').forEach((b) => (b.onclick = () => {
      st.theme = b.dataset.th;
      applyTheme(st.theme);
      persist();
    }));
    const bind = (id, key, num = false) => {
      $(id).onchange = (e) => {
        st[key] = e.target.type === 'checkbox' ? e.target.checked : num ? Number(e.target.value) : e.target.value;
        persist(false);
      };
    };
    bind('#s-toast', 'toastMs', true);
    bind('#s-clip', 'clipThreshold', true);
    bind('#s-keep', 'keepZoom');
    bind('#s-next', 'autoNext');
    bind('#s-conf', 'conflict');
    bind('#s-sort', 'sort');
    bind('#s-series', 'seriesGap', true);
    bind('#s-raw', 'rawMode');
    bind('#s-q', 'jpgQuality', true);
    bind('#s-askdel', 'confirmDelete');
    bind('#s-blur', 'detectBlur');
    $('#s-tips').onclick = (e) => {
      e.preventDefault();
      resetTips();
      toast('Einführung und Tipps erscheinen beim nächsten Sortieren wieder');
    };
    $('#s-autoupd').addEventListener('change', (e) => {
      if (e.target.checked) checkUpdate({ silent: true });
    });
    bind('#s-autoupd', 'autoUpdate');
    $$('[data-key]').forEach((b) => (b.onclick = () => {
      capturing = capturing === b.dataset.key ? null : b.dataset.key;
      render();
    }));
    $('#k-reset').onclick = () => {
      st.keys = defaultKeys();
      persist();
      toast('Tastenbelegung zurückgesetzt');
    };    renderUpdate();
  }

  function persist(redraw = true) {
    setToastDuration(st.toastMs);
    saveSettings(st);
    if (redraw) render();
  }

  function back() {
    go(S.returnTo === 'sorter' && S.session && S.items.length ? 'sorter' : 'start');
  }

  render();

  return {
    unmount() {
      unbindFs();
      offUpdate();
    },
    onKey(e) {
      if (capturing) {
        e.preventDefault();
        if (e.key === 'Escape') {
          capturing = null;
          return render();
        }
        const k = normKey(e);
        if (/^[1-9?]$/.test(k) || ['Enter', 'Tab', 'F11', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
          if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) toast('Diese Taste ist fest belegt', '#FFB454');
          return;
        }
        // Taste schon vergeben? Dann tauschen.
        const other = ACTIONS.find((a) => a.id !== capturing && st.keys[a.id] === k);
        if (other) {
          st.keys[other.id] = st.keys[capturing];
          toast(`»${other.label}« liegt jetzt auf ${keyLabel(st.keys[other.id])}`);
        }
        st.keys[capturing] = k;
        capturing = null;
        persist();
        return;
      }
      if (e.key === 'Escape') back();
    },
  };
}

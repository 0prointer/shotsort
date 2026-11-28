// Einstellungen.

import { S, go } from '../state.js';
import { saveSettings, loadJSON, saveJSON, COLORS } from '../store.js';
import { ACTIONS, defaultKeys, keyLabel, normKey, isWin } from '../keys.js';
import { esc, $, $$, icons, toast, setToastDuration, confirmDialog, fmtBytes, fmtInt, fmtAgo } from '../ui.js';
import { applyTheme } from '../theme.js';
import { bindFullscreenButton } from '../fullscreen.js';
import { U, onUpdateChange, checkUpdate, installUpdate, installLabel, updateText, appVersion } from '../update.js';
import { resetTips } from '../tips.js';
import { pickProgram, pickFolder, api } from '../api.js';
import { quickPlan } from '../quickstart.js';
import { cloudName, cleanName, EXAMPLE_BASE } from '../paths.js';

export function mount(root) {
  const st = S.settings;
  let capturing = null;
  let unbindFs = () => {};
  let cache = null; // { bytes, files } des Vorschau-Speichers
  let sessions = null; // gespeicherte Sitzungen (für „Speicher“)
  // „Alle Sitzungen anzeigen“ auf dem Startbildschirm klappt die Liste gleich auf
  let showSessions = !!S.settingsShowSessions;
  S.settingsShowSessions = false;
  // Während eine Sitzung offen ist, werden ihre Vorschauen gerade benutzt
  const sorting = () => S.returnTo === 'sorter' && !!S.session && S.items.length > 0;

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
    // Punkt an „Über ShotSort“, solange ein Update bereitliegt
    const nav = root.querySelector('[data-sec="ueber"]');
    if (nav) {
      const want = U.state === 'available';
      const dot = nav.querySelector('.set-dot');
      if (dot && !want) dot.remove();
      if (!dot && want) nav.insertAdjacentHTML('beforeend', '<i class="set-dot" title="Update verfügbar"></i>');
    }
    const row = root.querySelector('#upd-row');
    const btns = root.querySelector('#upd-btns');
    if (!row || !btns) return;
    const txt = updateText();
    row.innerHTML = `Version ${esc(version || '–')}${txt ? ` <span class="muted small">· ${esc(txt)}</span>` : ''}`;
    if (U.state === 'available') {
      btns.innerHTML = `<button class="btn primary sm" id="upd-go">${installLabel()}</button>`;
      btns.querySelector('#upd-go').onclick = () => installUpdate();
    } else {
      const busy = U.state === 'checking' || U.state === 'loading';
      btns.innerHTML = `<button class="btn sm" id="upd-check" ${busy ? 'disabled' : ''}>Nach Updates suchen</button>`;
      btns.querySelector('#upd-check').onclick = () => checkUpdate();
    }
  }
  const offUpdate = onUpdateChange(renderUpdate);

  // Bereiche der Seitenleiste
  const SECTIONS = [
    ['allgemein', 'Allgemein', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'],
    ['sortieren', 'Sortieren', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/>'],
    ['kopieren', 'Kopieren', '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'],
    ['schnellstart', 'Schnellstart', '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>'],
    ['tasten', 'Tastenbelegung', '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'],
    ['speicher', 'Speicher', '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'],
    ['ueber', 'Über ShotSort', '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'],
  ];
  const ICON = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const known = (id) => SECTIONS.some((x) => x[0] === id);
  // Sprungziel (z. B. aus dem Schnellstart-Dialog) vor dem zuletzt geöffneten Bereich
  let section = known(S.settingsJump) ? S.settingsJump : known(st.settingsSection) ? st.settingsSection : 'allgemein';
  S.settingsJump = null;

  const card = (rows, title = '', note = '') =>
    `<section class="section">${title ? `<h2>${title}</h2>` : ''}${note ? `<p class="muted small set-note">${note}</p>` : ''}<div class="card">${rows}</div></section>`;
  const check = (id, on) => `<input type="checkbox" id="${id}" ${on ? 'checked' : ''}>`;

  function sectionHtml() {
    switch (section) {
      case 'allgemein':
        return `
          <section class="section"><h2>Darstellung</h2>
            <div class="card pad row wrap" style="gap:12px">
              <span class="grow">Farbschema</span>
              ${[['dark', 'Dunkel'], ['light', 'Hell'], ['system', 'Wie System']]
                .map(([v, l]) => `<button class="seg ${st.theme === v ? 'on' : ''}" data-th="${v}">${l}</button>`)
                .join('')}
            </div></section>
          ${card(
            row('Erfolgsmeldung anzeigen für', select('s-toast', st.toastMs, [[1500, '1,5 Sekunden'], [2500, '2,5 Sekunden'], [4000, '4 Sekunden'], [6000, '6 Sekunden']])) +
              row('Einführung und Tipps beim Sortieren', '<button class="btn sm" id="s-tips">Wieder anzeigen</button>', true),
            'Meldungen'
          )}`;
      case 'sortieren':
        return (
          card(
            row('Reihenfolge der Bilder', select('s-sort', st.sort, [['time', 'Nach Aufnahmezeit'], ['name', 'Nach Dateiname']])) +
              row('Serien erkennen (Bilder kurz nacheinander)', select('s-series', st.seriesGap ?? 2, [[0, 'Aus'], [1, 'bis 1 Sekunde Abstand'], [2, 'bis 2 Sekunden Abstand'], [3, 'bis 3 Sekunden Abstand'], [5, 'bis 5 Sekunden Abstand']])) +
              row('Schärfe bewerten <span class="muted small">(unscharfe Bilder und das schärfste einer Serie markieren)</span>', check('s-blur', st.detectBlur !== false)) +
              row('Quellordner live beobachten <span class="muted small">(neue Bilder erscheinen während der Sitzung automatisch, z. B. beim Fotografieren mit Kabel)</span>', check('s-live', st.liveWatch !== false), true),
            'Bilder'
          ) +
          card(
            row('Zoomstufe beim Blättern beibehalten', check('s-keep', st.keepZoom)) +
              row('Nach dem Kopieren zum nächsten Bild springen', check('s-next', st.autoNext)) +
              row('Zu hell / zu dunkel markieren ab', select('s-clip', st.clipThreshold, [[240, 'über 94 % / unter 6 %'], [250, 'über 98 % / unter 2 %'], [255, 'nur reines Weiß / Schwarz']])) +
              row('Vor dem Löschen nachfragen', check('s-askdel', st.confirmDelete !== false), true),
            'Ansicht und Bedienung'
          )
        );
      case 'kopieren':
        return (
          card(
            row('Gleicher Name im Zielordner', select('s-conf', st.conflict, [['number', 'Nummer anhängen (_2)'], ['skip', 'Überspringen']])) +
              row('Zuschnitt bei RAW-Dateien', select('s-raw', st.rawMode, [['xmp', 'Als .xmp-Datei speichern'], ['jpg', 'Zusätzlich als JPG ausgeben (nur RAW ohne JPG)']])) +
              row('JPG-Qualität für bearbeitete Kopien', select('s-q', st.jpgQuality, [[100, '100 (maximal)'], [95, '95 (sehr hoch)'], [90, '90 (hoch)'], [85, '85']])),
            'Kopieren',
            'Die Originale bleiben immer unverändert – diese Einstellungen gelten für die Kopien.'
          ) +
          card(
            row(`In externem Programm öffnen <span class="muted small">(${st.externalApp ? esc(st.externalApp.split(/[\\/]/).pop()) : 'Standardprogramm des Systems'})</span>`, `<span class="row" style="gap:6px">${st.externalApp ? '<button class="btn sm ghost" id="s-ext-reset">Standard</button>' : ''}<button class="btn sm" id="s-ext">Programm wählen …</button></span>`, true),
            'Weiterbearbeiten'
          )
        );
      case 'schnellstart':
        return `
          <section class="section">
          <p class="muted small set-note">Legt auf dem Startbildschirm mit einem Klick einen Ordner für das Shooting an – mit diesen Zielordnern darin.</p>
          <div class="card">
            <div class="list-row"><span class="grow" style="min-width:0">Basisordner<br><span class="path">${st.quick.base ? esc(st.quick.base) : 'Noch nicht festgelegt'}${cloudName(st.quick.base) ? ` · <span class="cloud-note">wird mit ${esc(cloudName(st.quick.base))} synchronisiert</span>` : ''}</span></span>
              <button class="btn sm" id="q-base">${st.quick.base ? 'Ändern' : 'Wählen …'}</button></div>
            <label class="list-row"><span class="grow">Name des Shooting-Ordners<br><span class="muted small">Platzhalter: {Datum} {Jahr} {Monat} {Name} · mit \\ entstehen Unterordner, z. B. {Jahr}\\{Datum} {Name}</span></span>
              <input class="input" id="q-pat" value="${esc(st.quick.pattern)}" style="width:220px" autocomplete="off"></label>
            <div class="list-row" style="border-bottom:0;padding-bottom:4px"><span class="grow">Zielordner darin</span></div>
            <div class="qs-folders">
              ${st.quick.folders
                .map(
                  (f, i) => `<div class="list-row qf-row" data-qrow="${i}"><span class="big-key" data-qkey="${i}"></span>
                    <span class="qf-field"><input class="input" data-qf="${i}" value="${esc(f)}" placeholder="Name des Ordners, z. B. Social" aria-label="Zielordner ${i + 1}" autocomplete="off">
                    <small class="qf-note" data-qnote="${i}"></small></span>
                    <button class="icon-btn x" data-qdel="${i}" aria-label="Zielordner ${i + 1} entfernen" title="Entfernen">✕</button></div>`
                )
                .join('')}
            </div>
            <div class="list-row">${st.quick.folders.length < 9 ? '<button class="btn sm ghost" id="q-add">+ Zielordner</button><span class="muted small" id="q-add-note"></span>' : '<span class="muted small">Höchstens 9 Zielordner (Tasten 1–9)</span>'}</div>
            <div class="list-row" style="border-bottom:0"><span class="muted small grow">Beispiel: <span class="path" id="q-example"></span></span></div>
          </div></section>`;
      case 'tasten':
        return `
          <section class="section">
          <div class="row" style="margin-bottom:8px"><p class="muted small grow" style="margin:0">Klicke auf „Ändern“ und drücke dann die gewünschte Taste.</p><button class="link" id="k-reset">Standard wiederherstellen</button></div>
          <div class="card">
            ${ACTIONS.map(
              (a) => `<div class="list-row">
                <span class="grow">${esc(a.label)}</span>
                <span class="kbd" style="min-width:90px">${capturing === a.id ? 'Taste drücken …' : esc(keyLabel(st.keys[a.id]))}</span>
                <button class="btn sm" data-key="${a.id}">${capturing === a.id ? 'Abbrechen' : 'Ändern'}</button></div>`
            ).join('')}
            <div class="list-row muted small" style="border-bottom:0">Fest belegt: 1–9 (Zielordner), ? (Hilfe), Enter, Esc, F11, Strg/⌘ + Z (rückgängig).</div>
          </div></section>`;
      case 'speicher':
        return `
          <section class="section"><div class="card">
          <div class="list-row"><span class="grow">Vorschau-Speicher<br><span class="muted small">Vorschaubilder der RAW-Dateien, damit sie schneller erscheinen. Vorschauen, die älter als 60 Tage sind, werden beim Beenden automatisch entfernt. Deine Fotos sind davon nie betroffen.</span></span>
            <span class="muted small" style="white-space:nowrap">${cache ? `${fmtBytes(cache.bytes)} · ${fmtInt(cache.files)} Dateien` : '…'}</span>
            <button class="btn sm" id="c-clear" ${!cache || !cache.files || sorting() ? 'disabled' : ''} title="${sorting() ? 'Geht erst, wenn die Sitzung geschlossen ist' : 'Vorschauen werden bei Bedarf neu erstellt'}">Leeren</button></div>
          ${sorting() ? '<div class="list-row muted small">Leeren geht erst, wenn die laufende Sitzung geschlossen ist.</div>' : ''}
          <div class="list-row" ${showSessions ? '' : 'style="border-bottom:0"'}><span class="grow">Gespeicherte Sitzungen<br><span class="muted small">Fortschritt, Markierungen und Zuschnitte pro Shooting – keine Bilder.</span></span>
            <span class="muted small">${sessions ? fmtInt(sessions.length) : '…'}</span>
            <button class="btn sm" id="ss-toggle" ${sessions?.length ? '' : 'disabled'}>${showSessions ? 'Ausblenden' : 'Anzeigen'}</button></div>
          ${showSessions && sessions ? sessionRows() : ''}
          </div></section>`;
      case 'ueber':
        return card(
          '<div class="list-row"><span class="grow" id="upd-row"></span><span id="upd-btns"></span></div>' +
            row('Automatisch nach Updates suchen <span class="muted small">(beim Start und alle 6 Stunden)</span>', check('s-autoupd', st.autoUpdate !== false), true),
          'Version und Updates'
        );
    }
    return '';
  }

  function render() {
    // Scrollposition merken, damit die Seite nach einer Änderung nicht nach oben springt
    const scroll = root.querySelector('.set-main')?.scrollTop || 0;
    // Fokus und Cursor merken – die Seite wird z. B. nach dem Laden der Speicher-Infos neu gezeichnet
    const ae = document.activeElement;
    const focusSel = root.contains(ae) && ae.tagName === 'INPUT' && (ae.id ? '#' + ae.id : ae.dataset.qf != null ? `[data-qf="${ae.dataset.qf}"]` : null);
    const caret = focusSel && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
    const title = SECTIONS.find((x) => x[0] === section)[1];
    const updDot = U.state === 'available';
    root.innerHTML = `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Zurück">${icons.back}</button><span class="set-top">Einstellungen</span><span class="grow"></span><button class="icon-btn" id="fsbtn"></button></div>
      <div class="set-wrap">
        <nav class="set-nav" aria-label="Bereiche der Einstellungen">
          ${SECTIONS.map(
            ([id, label, icon]) => `<button class="set-nav-btn ${id === section ? 'on' : ''}" data-sec="${id}" ${id === section ? 'aria-current="page"' : ''}>
              ${ICON(icon)}<span>${label}</span>${id === 'ueber' && updDot ? '<i class="set-dot" title="Update verfügbar"></i>' : ''}</button>`
          ).join('')}
        </nav>
        <div class="page set-main"><div class="set-inner">
          <h1>${title}</h1>
          ${sectionHtml()}
        </div></div>
      </div>`;

    root.querySelector('.set-main').scrollTop = scroll;
    // im schmalen Fenster (Reiter oben) den aktiven Reiter sichtbar machen
    root.querySelector('.set-nav-btn.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focusSel) {
      const el = root.querySelector(focusSel);
      el?.focus();
      if (el && caret != null && el.type === 'text') el.setSelectionRange(caret, caret);
    }
    unbindFs();
    unbindFs = bindFullscreenButton($('#fsbtn'), icons);
    $('#back').onclick = back;
    $$('[data-sec]').forEach((b) => (b.onclick = () => showSection(b.dataset.sec)));

    // Nur die Bedienelemente des sichtbaren Bereichs sind vorhanden – fehlende einfach überspringen
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = fn;
    };
    const bind = (id, key, num = false) => {
      const el = $(id);
      if (!el) return;
      el.onchange = (e) => {
        st[key] = e.target.type === 'checkbox' ? e.target.checked : num ? Number(e.target.value) : e.target.value;
        persist(false);
      };
    };
    $$('[data-th]').forEach((b) => (b.onclick = () => {
      st.theme = b.dataset.th;
      applyTheme(st.theme);
      persist();
    }));
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
    bind('#s-live', 'liveWatch');
    on('#s-ext', async (e) => {
      e.preventDefault();
      const p = await pickProgram(isWin ? 'Programm wählen, z. B. Lightroom oder Photoshop' : 'Programm wählen, z. B. darktable oder GIMP');
      if (!p) return;
      st.externalApp = p;
      persist();
    });
    on('#s-ext-reset', (e) => {
      e.preventDefault();
      st.externalApp = '';
      persist();
    });
    on('#s-tips', (e) => {
      e.preventDefault();
      resetTips();
      toast('Einführung und Tipps erscheinen beim nächsten Sortieren wieder');
    });
    $('#s-autoupd')?.addEventListener('change', (e) => {
      if (e.target.checked) checkUpdate({ silent: true });
    });
    bind('#s-autoupd', 'autoUpdate');
    $$('[data-key]').forEach((b) => (b.onclick = () => {
      capturing = capturing === b.dataset.key ? null : b.dataset.key;
      render();
    }));
    on('#k-reset', () => {
      st.keys = defaultKeys();
      persist();
      toast('Tastenbelegung zurückgesetzt');
    });
    if (section === 'schnellstart') bindQuick();
    if (section === 'speicher') bindStorage();
    renderUpdate();
  }

  function showSection(id) {
    if (!known(id) || id === section) return;
    if (section === 'schnellstart') dropEmptyFolders();
    capturing = null;
    section = id;
    st.settingsSection = id;
    saveSettings(st);
    render();
    root.querySelector('.set-main').scrollTop = 0;
  }

  // ---------------------------------------------------------------- Schnellstart

  function renderExample() {
    const el = $('#q-example');
    if (!el) return;
    const plan = quickPlan({ ...st.quick, base: st.quick.base || EXAMPLE_BASE }, 'Hochzeit Müller');
    el.textContent = plan.targets.length ? plan.targets[0].path : plan.dir;
  }

  /**
   * Für jede Zeile: welche Taste bekommt sie beim Schnellstart – oder warum wird sie übersprungen?
   * Gleiche Regeln wie quickPlan(): leere und doppelte Namen fallen weg, die Tasten rücken nach.
   */
  function quickMarks() {
    const seen = new Set();
    let key = 0;
    return st.quick.folders.map((f) => {
      const c = cleanName(f).toLowerCase();
      if (!c) return { skip: 'Ohne Namen – wird beim Schnellstart nicht angelegt' };
      if (seen.has(c)) return { skip: 'Gibt es schon – wird nur einmal angelegt' };
      seen.add(c);
      key++;
      return { key };
    });
  }

  function renderQuickMarks() {
    const marks = quickMarks();
    marks.forEach((m, i) => {
      const k = $(`[data-qkey="${i}"]`);
      const n = $(`[data-qnote="${i}"]`);
      const inp = $(`[data-qf="${i}"]`);
      if (!k || !n || !inp) return;
      k.textContent = m.key ? String(m.key) : '–';
      k.style.background = m.key ? COLORS[(m.key - 1) % COLORS.length] : 'var(--panel2)';
      k.style.color = m.key ? '' : 'var(--muted)';
      n.textContent = m.skip || '';
      inp.classList.toggle('qf-skip', !!m.skip);
    });
    // kein zweites leeres Feld anlegen, solange eins offen ist
    const add = $('#q-add');
    const empty = st.quick.folders.some((f) => !cleanName(f));
    if (add) add.disabled = empty;
    const note = $('#q-add-note');
    if (note) note.textContent = empty ? 'Erst dem leeren Ordner einen Namen geben' : '';
  }

  /** Leere Einträge beim Verlassen der Einstellungen entfernen. */
  function dropEmptyFolders() {
    const before = st.quick.folders.length;
    st.quick.folders = st.quick.folders.filter((f) => cleanName(f));
    if (st.quick.folders.length !== before) saveSettings(st);
  }

  function bindQuick() {
    $('#q-base').onclick = async (e) => {
      e.preventDefault();
      const p = await pickFolder(`Basisordner für Shootings wählen, z. B. ${EXAMPLE_BASE}`);
      if (!p) return;
      st.quick.base = p;
      persist();
    };
    const pat = $('#q-pat');
    pat.oninput = () => {
      st.quick.pattern = pat.value;
      renderExample();
    };
    pat.onchange = () => {
      if (!pat.value.trim()) st.quick.pattern = '{Datum} {Name}';
      persist(!pat.value.trim());
    };
    $$('[data-qf]').forEach((inp) => {
      inp.oninput = () => {
        st.quick.folders[Number(inp.dataset.qf)] = inp.value;
        renderExample();
        renderQuickMarks();
      };
      inp.onchange = () => persist(false);
    });
    $$('[data-qdel]').forEach((b) => (b.onclick = (e) => {
      e.preventDefault();
      st.quick.folders.splice(Number(b.dataset.qdel), 1);
      persist();
    }));
    const add = $('#q-add');
    if (add)
      add.onclick = (e) => {
        e.preventDefault();
        st.quick.folders.push('');
        persist();
        const inputs = $$('[data-qf]');
        inputs[inputs.length - 1]?.focus();
      };
    renderExample();
    renderQuickMarks();
  }

  // ---------------------------------------------------------------- Speicher

  function sessionRows() {
    return sessions
      .map((x, i) => {
        const state = x.missing ? '<span class="cloud-note">Ordner nicht erreichbar</span>' : x.done ? 'abgeschlossen' : 'offen';
        const open = sorting() && S.session.source.toLowerCase() === x.source.toLowerCase();
        return `<div class="list-row"><span class="grow" style="min-width:0;display:flex;flex-direction:column;gap:2px">
            <b>${esc(x.name)}</b><span class="path">${esc(x.source)}</span>
            <span class="muted small">${fmtInt(x.copied)} kopiert · ${state}${x.updated ? ' · ' + esc(fmtAgo(x.updated)) : ''}</span></span>
          <button class="btn sm" data-ssdel="${i}" ${open ? 'disabled title="Diese Sitzung ist gerade geöffnet"' : ''}>Vergessen</button></div>`;
      })
      .join('') +
      `<div class="list-row" style="border-bottom:0"><span class="muted small grow">Vergessen löscht nur den gespeicherten Fortschritt. Kopierte Bilder bleiben in den Zielordnern.</span>
        <button class="btn sm" id="ss-done" ${sessions.some((x) => x.done) ? '' : 'disabled'}>Abgeschlossene vergessen</button></div>`;
  }

  async function loadStorage() {
    api.cacheInfo().then((c) => {
      cache = c;
      render();
    }).catch(() => {});
    const files = await api.storeList('sitzung-').catch(() => []);
    const recent = await loadJSON('sitzungen', []);
    const list = [];
    for (const f of files) {
      // Roh lesen: Nur Dateien, die eindeutig leer sind („null“ – Reste vergessener Sitzungen
      // aus älteren Versionen), werden entfernt. Lässt sich eine Datei gerade nicht lesen oder
      // ist sie beschädigt, bleibt sie unangetastet und wird nur nicht angezeigt.
      let raw;
      try {
        raw = await api.storeGet(f.name);
      } catch {
        continue;
      }
      if (raw == null || raw.trim() === '' || raw.trim() === 'null') {
        if (raw != null) await api.storeRemove(f.name).catch(() => {});
        continue;
      }
      let sess;
      try {
        sess = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!sess || typeof sess.source !== 'string') continue;
      const r = recent.find((x) => x.source.toLowerCase() === sess.source.toLowerCase());
      list.push({
        key: f.name,
        source: sess.source,
        name: sess.name || sess.source,
        done: !!sess.done,
        copied: Object.keys(sess.copied || {}).length,
        updated: r?.updated || sess.started || 0,
        missing: false,
      });
    }
    list.sort((a, b) => b.updated - a.updated);
    sessions = list;
    render();
    // Erreichbarkeit nachträglich prüfen (Speicherkarten sind oft nicht eingesteckt)
    await Promise.all(
      list.map((x) =>
        api.checkDir(x.source).then((d) => (x.missing = !d.exists)).catch(() => {})
      )
    );
    if (sessions === list) render();
  }

  async function forget(items) {
    for (const x of items) await api.storeRemove(x.key).catch(() => {});
    const gone = new Set(items.map((x) => x.source.toLowerCase()));
    const recent = await loadJSON('sitzungen', []);
    await saveJSON('sitzungen', recent.filter((r) => !gone.has(r.source.toLowerCase())));
    sessions = sessions.filter((x) => !items.includes(x));
    if (!sessions.length) showSessions = false;
    render();
  }

  function bindStorage() {
    $('#c-clear').onclick = async (e) => {
      e.preventDefault();
      const freed = await api.clearCache().catch(() => 0);
      toast(`${fmtBytes(freed)} freigegeben`);
      cache = await api.cacheInfo().catch(() => cache);
      render();
    };
    $('#ss-toggle').onclick = (e) => {
      e.preventDefault();
      showSessions = !showSessions;
      render();
    };
    $$('[data-ssdel]').forEach((b) => (b.onclick = async (e) => {
      e.preventDefault();
      const x = sessions[Number(b.dataset.ssdel)];
      const ok = await confirmDialog({
        title: 'Sitzung vergessen?',
        text: `Der Fortschritt für »${x.name}« wird gelöscht. Kopierte Bilder bleiben in den Zielordnern.`,
        ok: 'Vergessen',
        danger: true,
      });
      if (ok) forget([x]);
    }));
    const sd = $('#ss-done');
    if (sd)
      sd.onclick = async (e) => {
        e.preventDefault();
        const done = sessions.filter((x) => x.done);
        const ok = await confirmDialog({
          title: `${fmtInt(done.length)} abgeschlossene Sitzungen vergessen?`,
          text: 'Ihr gespeicherter Fortschritt wird gelöscht. Kopierte Bilder bleiben in den Zielordnern.',
          ok: 'Vergessen',
          danger: true,
        });
        if (ok) forget(done);
      };
  }

  function persist(redraw = true) {
    setToastDuration(st.toastMs);
    saveSettings(st);
    if (redraw) render();
  }

  function back() {
    dropEmptyFolders();
    go(S.returnTo === 'sorter' && S.session && S.items.length ? 'sorter' : 'start');
  }

  render();
  loadStorage();

  return {
    unmount() {
      dropEmptyFolders();
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

// Startbildschirm: Quellordner und Zielordner wählen, letzte Sitzungen fortsetzen.

import { api, pickFolder, onDragDrop } from '../api.js';
import { S, go, resetSessionState } from '../state.js';
import { loadJSON, saveJSON, sessionKey, loadSession, newSession, saveSettings, folderName, COLORS } from '../store.js';
import { addTarget, nextFreeKey, targetProblem } from '../actions.js';
import { editTargetDialog } from '../targetDialog.js';
import { bindFullscreenButton } from '../fullscreen.js';
import { esc, $, $$, icons, fmtInt, fmtBytes, fmtAgo, toast, confirmDialog, helpDialog } from '../ui.js';
import { keyLabel, helpList } from '../keys.js';
import { U, onUpdateChange, installUpdate, updateText } from '../update.js';

export function mount(root) {
  const st = S.settings;
  const draft = {
    source: S.session?.source || null,
    // Neue Sitzung = leere Ziele (sicherer: nie aus Versehen in den Ordner eines alten Shootings kopieren).
    // Nur beim Zurückgehen aus der laufenden Sitzung bleiben ihre Ziele stehen.
    targets: (S.session?.targets || []).map((t) => ({ ...t })),
  };
  let counts = null;
  let resumeInfo = null;
  let recent = [];
  const free = new Map();
  let unlistenDrop = null;

  root.innerHTML = `
    <div class="topbar">
      <span class="grow"></span>
      <button class="icon-btn" id="gear" aria-label="Einstellungen" title="Einstellungen">${icons.gear}</button>
      <button class="icon-btn" id="fsbtn"></button>
    </div>
    <div class="page">
      <div class="page-inner">
        <div class="col-main">
          <div>
            <h1>Neue Sitzung</h1>
            <p class="muted">Shooting wählen, Zielordner festlegen, loslegen.</p>
          </div>
          <div class="section">
            <h2>Quellordner</h2>
            <div id="source"></div>
            <label class="row small" style="margin-left:2px"><input type="checkbox" id="o-sub"> Unterordner einbeziehen (z. B. 100CANON, 101CANON)</label>
          </div>
          <div class="section">
            <div class="row wrap"><h2>Zielordner</h2><span class="muted small">Taste 1–9 kopiert das Bild in den jeweiligen Ordner</span></div>
            <div class="card" id="targets"></div>
            <button class="btn ghost" id="add" style="border-style:dashed">+ Zielordner hinzufügen</button>
          </div>
          <div class="row" style="gap:16px">
            <button class="btn primary lg" id="start">Sortieren starten</button>
            <span class="muted small" id="start-hint"></span>
          </div>
        </div>
        <div class="col-side">
          <div id="upd"></div>
          <div class="section"><h2>Letzte Sitzungen</h2><div id="recent" class="section"></div></div>
          <span class="muted small">Alle Tastenkürzel jederzeit mit <button class="kbd kbd-btn" id="help" title="Tastenkürzel anzeigen" aria-label="Tastenkürzel anzeigen">?</button> · Ordner lassen sich auch einfach ins Fenster ziehen</span>
        </div>
      </div>
    </div>
    <div class="drop-overlay hidden" id="dropov" aria-hidden="true">
      <div class="dz" data-z="src">${icons.folderBig}<b>Als Quellordner</b><span>das Shooting, das du durchsehen willst</span></div>
      <div class="dz" data-z="tgt">${icons.folderBig}<b>Als Zielordner</b><span>hierhin werden Bilder kopiert</span></div>
    </div>`;

  $('#gear').onclick = () => {
    S.returnTo = 'start';
    go('settings');
  };
  $('#add').onclick = async () => {
    const t = await addTarget(draft.targets, undefined, draft.source);
    if (t) renderTargets();
  };
  $('#start').onclick = start;
  $('#help').onclick = () => helpDialog(helpList(st.keys));
  const unbindFs = bindFullscreenButton($('#fsbtn'), icons);

  // Hinweis auf ein neues Update (nur hier auf dem Startbildschirm, nie beim Sortieren)
  function renderUpdate() {
    const el = $('#upd');
    if (!el) return;
    const show = U.state === 'available' || U.state === 'loading' || (U.state === 'error' && U.info);
    if (!show) {
      el.innerHTML = '';
      return;
    }
    const busy = U.state === 'loading';
    el.innerHTML = `
      <div class="card pad upd-card">
        <div class="upd-head"><span class="upd-dot"></span><b>Update verfügbar</b></div>
        <span class="muted small">${esc(busy ? updateText() : U.state === 'error' ? updateText() : `ShotSort ${U.info.version} ist da (du hast ${U.info.current}).`)}</span>
        ${busy ? `<div class="upd-bar"><i style="width:${U.progress}%"></i></div>` : ''}
        <div class="row" style="gap:8px">
          <button class="btn primary sm" id="upd-go" ${busy ? 'disabled' : ''}>${busy ? 'Wird installiert …' : 'Jetzt aktualisieren'}</button>
          ${busy ? '' : '<span class="muted small">ShotSort startet danach neu.</span>'}
        </div>
      </div>`;
    const go = $('#upd-go');
    if (go && !busy) go.onclick = () => installUpdate();
  }
  const offUpdate = onUpdateChange(renderUpdate);
  renderUpdate();

  const sub = $('#o-sub');
  sub.checked = st.subfolders;
  sub.onchange = () => {
    st.subfolders = sub.checked;
    saveSettings(st);
    refreshCounts();
  };

  // ---------------------------------------------------------------- Quelle

  function renderSource() {
    const el = $('#source');
    if (!draft.source) {
      el.innerHTML = `<button class="card pad row" id="pick-src" style="width:100%;cursor:pointer;gap:16px;text-align:left">${icons.folderBig}
        <span class="grow"><b>Quellordner wählen</b><br><span class="muted small">Der Ordner mit den Bildern deines Shootings</span></span></button>`;
      $('#pick-src').onclick = chooseSource;
      return;
    }
    let line = '<span class="muted small">Zähle Bilder …</span>';
    if (counts) {
      const parts = [`${fmtInt(counts.images)} Bilder`];
      if (counts.pairs) parts.push(`${fmtInt(counts.pairs)} RAW+JPG-Paare`);
      if (counts.videos) parts.push(`${fmtInt(counts.videos)} Videos werden übersprungen`);
      line = `<span class="small" style="color:var(--ok)">${parts.join(' · ')}</span>`;
    }
    const resume = resumeInfo
      ? `<span class="small" style="color:var(--accent)">Frühere Sitzung gefunden: Bild ${fmtInt(resumeInfo.index + 1)} von ${fmtInt(resumeInfo.total)} – wird fortgesetzt</span>`
      : '';
    el.innerHTML = `<div class="card pad row" style="gap:16px">${icons.folderBig}
      <div class="grow" style="min-width:0;display:flex;flex-direction:column;gap:3px">
        <b>${esc(folderName(draft.source))}</b>
        <span class="path">${esc(draft.source)}</span>${line}${resume}
      </div>
      <button class="btn sm" id="chg-src">Ändern</button>
      <button class="icon-btn x" id="del-src" aria-label="Quellordner entfernen" title="Quellordner entfernen">✕</button></div>`;
    $('#chg-src').onclick = chooseSource;
    $('#del-src').onclick = () => {
      draft.source = null;
      counts = null;
      resumeInfo = null;
      renderSource();
      renderStart();
    };
  }

  async function chooseSource() {
    const p = await pickFolder('Quellordner wählen');
    if (p) setSource(p);
  }

  function sourceProblem(p) {
    const t = draft.targets.find((x) => x.path.replace(/[\\/]+$/, '').toLowerCase() === p.replace(/[\\/]+$/, '').toLowerCase());
    return t ? `Dieser Ordner ist schon Zielordner ${t.key} »${t.name}« und kann nicht Quelle sein` : null;
  }

  async function setSource(p) {
    const problem = sourceProblem(p);
    if (problem) return toast(problem, '#FFB454');
    draft.source = p;
    counts = null;
    resumeInfo = null;
    renderSource();
    renderStart();
    const old = await loadSession(p);
    if (old && !old.done) {
      resumeInfo = old;
      if (!draft.targets.length) draft.targets = old.targets.map((t) => ({ ...t }));
      renderTargets();
    }
    refreshCounts();
  }

  async function refreshCounts() {
    if (!draft.source) return;
    const src = draft.source;
    try {
      const c = await api.quickCount(src, st.subfolders, draft.targets.map((t) => t.path));
      if (src === draft.source) counts = c;
    } catch (err) {
      toast(String(err), '#FF99A4');
    }
    renderSource();
  }

  // ---------------------------------------------------------------- Ziele

  function renderTargets() {
    const el = $('#targets');
    if (!draft.targets.length) {
      el.innerHTML = `<div class="list-row muted small">Noch kein Zielordner. Lege mindestens einen an, z. B. »Beste«.</div>`;
    } else {
      el.innerHTML = draft.targets
        .map(
          (t, i) => `<div class="list-row target-row" data-edit="${i}" role="button" tabindex="0" title="Klicken zum Bearbeiten: Name, Taste, Farbe, Ordner" aria-label="Zielordner ${t.key} »${esc(t.name)}« bearbeiten">
          <span class="big-key" style="background:${t.color}">${esc(t.key)}</span>
          <div class="grow" style="min-width:0;display:flex;flex-direction:column;gap:2px">
            <b>${esc(t.name)}</b>
            <span class="path">${esc(t.path)}${free.has(t.path) ? ' · ' + free.get(t.path) : ''}</span>
          </div>
          <button class="icon-btn x" data-del="${i}" aria-label="Zielordner ${t.key} entfernen" title="Entfernen">✕</button>
        </div>`
        )
        .join('');
    }
    const openEdit = (row) =>
      editTargetDialog({
        t: draft.targets[row.dataset.edit],
        targets: draft.targets,
        source: draft.source,
        onClose: renderTargets,
        onRemove: renderTargets,
      });
    $$('[data-edit]', el).forEach((row) => {
      row.onclick = () => openEdit(row);
      row.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          openEdit(row);
        }
      };
    });
    $$('[data-del]', el).forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); // nicht zusätzlich das Bearbeiten öffnen
      draft.targets.splice(Number(b.dataset.del), 1);
      renderTargets();
    }));
    $('#add').disabled = !nextFreeKey(draft.targets);
    renderStart();
    loadFree();
  }

  async function loadFree() {
    for (const t of draft.targets) {
      if (free.has(t.path)) continue;
      free.set(t.path, '…');
      api.checkDir(t.path).then((d) => {
        free.set(t.path, d.exists ? `${fmtBytes(d.free)} frei` : 'nicht erreichbar');
        renderTargets();
      });
    }
  }

  function canStart() {
    return !!draft.source && draft.targets.length > 0;
  }

  function renderStart() {
    $('#start').disabled = !canStart();
    $('#start-hint').innerHTML = !draft.source
      ? 'Wähle zuerst einen Quellordner'
      : !draft.targets.length
        ? 'Lege mindestens einen Zielordner an'
        : '';
    $('#start').title = canStart() ? `Sortieren starten (${keyLabel('Enter')})` : '';
  }

  async function start() {
    if (!canStart()) return;
    const sess = (await loadSession(draft.source)) || newSession(draft.source);
    if (sess.done) Object.assign(sess, { done: false, index: 0 });
    sess.targets = draft.targets.map((t) => ({ ...t }));
    delete st.lastTargets;
    saveSettings(st);
    S.session = sess;
    resetSessionState();
    go('loading');
  }

  // ---------------------------------------------------------------- Letzte Sitzungen

  async function renderRecent() {
    recent = await loadJSON('sitzungen', []);
    const el = $('#recent');
    if (!el) return;
    if (!recent.length) {
      el.innerHTML = '<span class="muted small">Noch keine Sitzungen.</span>';
      return;
    }
    el.innerHTML = recent
      .slice(0, 6)
      .map((r, i) => {
        const pct = r.total ? Math.round(((r.done ? r.total : r.index + 1) / r.total) * 100) : 0;
        const status = r.done
          ? `${fmtInt(r.total)} von ${fmtInt(r.total)} · ${fmtInt(r.copiedCount)} kopiert · abgeschlossen`
          : `Bild ${fmtInt(r.index + 1)} von ${fmtInt(r.total)} · ${fmtInt(r.copiedCount)} kopiert · ${fmtAgo(r.updated)}`;
        return `<div class="card pad" style="display:flex;flex-direction:column;gap:8px">
          <div class="row"><b class="grow" title="${esc(r.source)}">${esc(r.name)}</b><button class="link" data-open="${i}">${r.done ? 'Nochmal öffnen' : 'Fortsetzen'}</button>
             <button class="icon-btn x" data-forget="${i}" style="width:28px;height:28px" aria-label="Sitzung ${esc(r.name)} aus der Liste entfernen" title="Aus der Liste entfernen">✕</button></div>
          <div class="progress"><div style="width:${pct}%;${r.done ? 'background:var(--ok)' : ''}"></div></div>
          <span class="muted small">${status}</span></div>`;
      })
      .join('');
    $$('[data-forget]', el).forEach((b) => (b.onclick = async () => {
      const r = recent[b.dataset.forget];
      const ok = await confirmDialog({
        title: 'Sitzung entfernen?',
        text: `»${r.name}« verschwindet aus der Liste und der Fortschritt wird vergessen. Bereits kopierte Bilder bleiben in den Zielordnern.`,
        ok: 'Entfernen',
        danger: true,
      });
      if (!ok) return;
      await saveJSON(sessionKey(r.source), null);
      await saveJSON('sitzungen', recent.filter((x) => x !== r));
      if (draft.source && draft.source.toLowerCase() === r.source.toLowerCase()) {
        resumeInfo = null;
        renderSource();
      }
      renderRecent();
    }));
    $$('[data-open]', el).forEach((b) => (b.onclick = async () => {
      const r = recent[b.dataset.open];
      const sess = await loadSession(r.source);
      if (!sess) return toast('Diese Sitzung wurde nicht gefunden', '#FF99A4');
      if (sess.done) Object.assign(sess, { done: false, index: 0 });
      S.session = sess;
      resetSessionState();
      go('loading');
    }));
  }

  // ---------------------------------------------------------------- Drag & Drop

  // Beim Hineinziehen erscheint eine Fläche: links „Als Quellordner“, rechts „Als Zielordner“
  const zoneAt = (pos) => {
    const x = pos ? pos.x / (window.devicePixelRatio || 1) : 0;
    return x < window.innerWidth / 2 ? 'src' : 'tgt';
  };
  onDragDrop(async (p) => {
    const ov = $('#dropov');
    if (!ov) return;
    if (p.type === 'enter' || p.type === 'over') {
      ov.classList.remove('hidden');
      const z = zoneAt(p.position);
      $$('.dz', ov).forEach((d) => d.classList.toggle('active', d.dataset.z === z));
      return;
    }
    ov.classList.add('hidden');
    if (p.type !== 'drop' || !p.paths?.length) return;
    const zone = zoneAt(p.position);
    const path = p.paths[0];
    const d = await api.checkDir(path);
    if (!d.exists) return toast('Bitte einen Ordner hineinziehen, keine einzelne Datei', '#FFB454');
    if (zone === 'src') return setSource(path);
    const key = nextFreeKey(draft.targets);
    if (!key) return toast('Es sind schon 9 Zielordner eingerichtet', '#FFB454');
    const problem = targetProblem(path, draft.targets, draft.source);
    if (problem) return toast(problem, '#FFB454');
    draft.targets.push({ key, name: folderName(path), color: COLORS[(Number(key) - 1) % COLORS.length], path });
    renderTargets();
    toast(`»${folderName(path)}« als Zielordner ${key} hinzugefügt`);
  }).then((un) => (unlistenDrop = un));

  renderSource();
  renderTargets();
  renderRecent();
  if (draft.source) setSource(draft.source);

  return {
    onKey(e) {
      // Enter startet – außer der Fokus liegt gerade auf einem Knopf (dann gilt der Knopf)
      const onButton = e.target?.closest?.('button, [role="button"]');
      if (e.key === 'Enter' && canStart() && !onButton) {
        e.preventDefault();
        start();
      }
    },
    unmount() {
      unbindFs();
      offUpdate();
      if (typeof unlistenDrop === 'function') unlistenDrop();
    },
  };
}


// Schnellstart: legt für ein Shooting einen Ordner mit den gewohnten Zielordnern an,
// z. B. D:\Fotos\2026-11-27 Hochzeit\Beste und …\Kunde. Was angelegt wird, steht in den Einstellungen.
//
// Die Ordner kommen bewusst nie in den Quellordner: Der ist beim Schnellstart meist die Speicherkarte,
// und die wird später formatiert.

import { api, pickFolder } from './api.js';
import { S } from './state.js';
import { saveSettings, COLORS, folderName } from './store.js';
import { esc, $, toast, closeModal } from './ui.js';
import { fillPattern, joinPath, cleanName, cloudName, EXAMPLE_BASE } from './paths.js';

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const inside = (child, parent) => norm(child) === norm(parent) || norm(child).startsWith(norm(parent) + '/');

/** Ist der Ordner eine Speicherkarte bzw. ein Kamera-Ordner? Dann taugt sein Name nicht als Shooting-Name. */
const cameraFolder = (p) => /(^|[\\/])(DCIM|\d{3}[A-Z_]{5}|\d{3}_?[A-Z0-9]{4,5})[\\/]*$/i.test(p || '') || /^[A-Za-z]:[\\/]*$/.test(p || '');

/** Vorschlag für den Shooting-Namen aus dem Quellordner. */
export function suggestName(source) {
  if (!source || cameraFolder(source)) return '';
  return cleanName(folderName(source).replace(/^\d{4}-\d{2}-\d{2}\s*/, '')); // Datum kommt aus dem Muster
}

/** Pfade berechnen, die der Schnellstart anlegen würde. */
export function quickPlan(quick, name) {
  const levels = fillPattern(quick.pattern, name);
  const dir = quick.base ? joinPath(quick.base, ...levels) : '';
  // leere und doppelte Namen weglassen (Windows unterscheidet Groß-/Kleinschreibung nicht)
  const seen = new Set();
  const folders = (quick.folders || [])
    .map(cleanName)
    .filter((f) => f && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()))
    .slice(0, 9);
  return {
    dir,
    targets: folders.map((f, i) => ({
      key: String(i + 1),
      name: f,
      color: COLORS[i % COLORS.length],
      path: dir ? joinPath(dir, f) : '',
    })),
  };
}

/**
 * Dialog öffnen. Gibt die angelegten Zielordner zurück (oder null bei Abbruch).
 * @param source   gewählter Quellordner
 * @param replaces Anzahl der Zielordner, die dadurch ersetzt würden (für den Hinweis)
 */
export function quickStartDialog({ source, replaces = 0 }) {
  const st = S.settings;
  const overlay = document.getElementById('overlay');
  let name = suggestName(source);
  let busy = false;

  return new Promise((resolve) => {
    // Rahmen einmal zeichnen; beim Tippen wird nur der untere Teil (#qs-dyn) erneuert
    overlay.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Schnellstart">
      <h2>Schnellstart</h2>
      <p class="muted small" style="margin-top:-4px">Legt einen Ordner für dieses Shooting mit deinen Zielordnern an.</p>
      <label class="kv"><small>Name des Shootings</small>
        <input class="input" id="qs-name" value="${esc(name)}" placeholder="z. B. Hochzeit Müller" style="width:100%" autocomplete="off"></label>
      <div id="qs-dyn" style="display:flex;flex-direction:column;gap:inherit"></div>
    </div></div>`;

    const draw = () => {
      const plan = quickPlan(st.quick, name);
      const cloud = cloudName(plan.dir);
      const bad = plan.dir && source && inside(plan.dir, source);
      $('#qs-dyn').innerHTML = `
        <div class="kv"><small>Basisordner</small>
          <div class="row" style="gap:8px"><span class="path grow">${st.quick.base ? esc(st.quick.base) : '<span class="muted">Noch nicht festgelegt</span>'}</span>
          <button class="btn sm" id="qs-base">${st.quick.base ? 'Ändern' : 'Wählen …'}</button></div></div>
        <div class="kv"><small>Wird angelegt</small>
          <div class="qs-plan">${
            plan.dir
              ? `<span class="path">${esc(plan.dir)}</span>${plan.targets
                  .map((t) => `<div class="qs-row"><span class="big-key sm" style="background:${t.color}">${t.key}</span>${esc(t.name)}</div>`)
                  .join('')}`
              : `<span class="muted small">Wähle zuerst einen Basisordner, z. B. ${esc(EXAMPLE_BASE)}.</span>`
          }</div></div>
        ${cloud ? `<div class="qs-hint warn small">Der Ordner liegt in ${esc(cloud)}. Jede Kopie wird sofort hochgeladen – bei vielen RAW-Dateien wird das Kopieren dadurch langsamer.</div>` : ''}
        ${bad ? '<div class="qs-hint error small">Der Ordner läge im Quellordner. Bitte einen anderen Basisordner wählen.</div>' : ''}
        ${replaces ? `<p class="muted small">Ersetzt die ${replaces === 1 ? 'bisherige Zielordner-Auswahl' : `bisherigen ${replaces} Zielordner`} (die Ordner selbst bleiben erhalten).</p>` : ''}
        <p class="muted small">Ordnername und Zielordner lassen sich in den <button class="link" id="qs-settings">Einstellungen</button> ändern.</p>
        <div class="actions">
          <button class="btn" id="qs-no">Abbrechen</button>
          <button class="btn primary" id="qs-ok" ${!plan.dir || !plan.targets.length || bad || busy ? 'disabled' : ''}>${busy ? 'Wird angelegt …' : 'Ordner anlegen'}</button>
        </div>`;
      $('#qs-base').onclick = async () => {
        const p = await pickFolder(`Basisordner für Shootings wählen, z. B. ${EXAMPLE_BASE}`);
        if (!p) return;
        if (source && inside(p, source)) return toast('Der Basisordner darf nicht im Quellordner liegen', '#FFB454');
        st.quick.base = p;
        saveSettings(st);
        draw();
        $('#qs-name')?.focus();
      };
      $('#qs-settings').onclick = () => done(null, 'settings');
      $('#qs-no').onclick = () => done(null);
      $('#qs-ok').onclick = create;
    };
    $('#qs-name').oninput = (e) => {
      name = e.target.value;
      draw();
    };
    overlay.querySelector('.modal-back').onclick = (e) => {
      if (e.target === e.currentTarget) done(null);
    };

    async function create() {
      const plan = quickPlan(st.quick, name);
      if (busy || !plan.dir || !plan.targets.length || (source && inside(plan.dir, source))) return;
      busy = true;
      draw();
      try {
        await api.createDirs(plan.targets.map((t) => t.path));
        toast(`Ordner »${folderName(plan.dir)}« mit ${plan.targets.length} Zielordnern angelegt`);
        done(plan.targets);
      } catch (err) {
        busy = false;
        draw();
        toast(`Ordner konnten nicht angelegt werden: ${err}`, '#FF99A4');
      }
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        e.stopPropagation();
        create();
      }
    };
    function done(v, next = null) {
      document.removeEventListener('keydown', onKey, true);
      closeModal();
      resolve(next ? { next } : v);
    }
    document.addEventListener('keydown', onKey, true);
    draw();
    const inp = $('#qs-name');
    inp.focus();
    inp.select();
  });
}

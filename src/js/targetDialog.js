// Dialog zum Bearbeiten eines Zielordners: Name, Taste, Farbe, Ordner.
// Wird auf dem Startbildschirm und beim Sortieren verwendet.

import { api } from './api.js';
import { pickTargetFolder } from './actions.js';
import { COLORS, folderName } from './store.js';
import { esc, $, $$, toast, closeModal } from './ui.js';

/**
 * @param t        der Zielordner, der bearbeitet wird
 * @param targets  alle Zielordner (für Tastentausch und Prüfung auf Doppelte)
 * @param source   Quellordner (darf nicht Ziel werden)
 * @param onChange wird nach jeder Änderung aufgerufen ({ pathChanged, oldPath })
 * @param onRemove wird aufgerufen, wenn der Zielordner entfernt wurde
 * @param onClose  wird beim Schließen aufgerufen
 */
export function editTargetDialog({ t, targets, source, onChange = () => {}, onRemove = () => {}, onClose = () => {} }) {
  const overlay = document.getElementById('overlay');

  const sortTargets = () => targets.sort((a, b) => a.key.localeCompare(b.key));

  const draw = () => {
    const keyOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map(String)
      .map((k) => {
        const other = targets.find((x) => x !== t && x.key === k);
        const label = other ? `${k} – tauscht mit »${other.name}«` : k;
        return `<option value="${k}" ${k === t.key ? 'selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
    overlay.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Zielordner bearbeiten">
      <h2>Zielordner ${esc(t.key)}</h2>
      <div class="row" style="gap:12px;align-items:flex-end">
        <label class="kv grow" style="min-width:0"><small>Name</small><input class="input" id="tn" value="${esc(t.name)}" style="width:100%"></label>
        <label class="kv" style="flex:none"><small>Taste</small><select class="input" id="tk" style="width:96px">${keyOptions}</select></label>
      </div>
      <div class="kv"><small>Farbe</small><div class="row wrap">${COLORS.map(
        (c) =>
          `<button class="big-key" data-col="${c}" style="background:${c};${c === t.color ? 'outline:2px solid var(--text);outline-offset:2px' : ''}" aria-label="Farbe ${c}">${c === t.color ? esc(t.key) : ''}</button>`
      ).join('')}</div></div>
      <div class="kv"><small>Ordner</small><span class="path">${esc(t.path)}</span></div>
      <div class="row wrap"><button class="btn sm" id="tchg">Ordner ändern</button><button class="btn sm" id="topen">Ordner öffnen</button></div>
      <div class="actions" style="justify-content:space-between"><button class="btn ghost" id="tdel" style="color:var(--danger)">Zielordner entfernen</button><button class="btn primary" id="tok">Fertig</button></div></div></div>`;

    $('#tn').oninput = (e) => {
      t.name = e.target.value.trim() || folderName(t.path);
      onChange({});
    };
    $('#tk').onchange = (e) => {
      const k = e.target.value;
      const other = targets.find((x) => x !== t && x.key === k);
      if (other) {
        other.key = t.key;
        toast(`»${other.name}« liegt jetzt auf Taste ${other.key}`);
      }
      t.key = k;
      sortTargets();
      onChange({});
      draw();
    };
    $$('[data-col]', overlay).forEach((b) => (b.onclick = () => {
      t.color = b.dataset.col;
      onChange({});
      draw();
    }));
    $('#tchg').onclick = async () => {
      const p = await pickTargetFolder(`Neuer Ordner für »${t.name}«`, targets, source, t);
      if (!p) return;
      const oldPath = t.path;
      t.path = p;
      t.name = folderName(p);
      onChange({ pathChanged: true, oldPath });
      draw();
    };
    $('#topen').onclick = () => api.openPath(t.path).catch((e) => toast(String(e), '#FF99A4'));
    $('#tdel').onclick = () => {
      targets.splice(targets.indexOf(t), 1);
      close();
      onRemove(t);
    };
    $('#tok').onclick = close;
    overlay.querySelector('.modal-back').onclick = (e) => {
      if (e.target === e.currentTarget) close();
    };
  };

  const onKey = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT')) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    closeModal();
    onClose();
  };
  document.addEventListener('keydown', onKey, true);
  draw();
}

// Aktionen auf Bildern: kopieren, löschen, bearbeiten, rückgängig machen.
// Werden von der Hauptansicht und der Vergleichsansicht gemeinsam genutzt.

import { api, pickFolder } from './api.js';
import { S } from './state.js';
import { scheduleSave, saveSession, saveSettings, COLORS, folderName } from './store.js';
import { toast, fmtBytes, confirmDialog } from './ui.js';
import { MOD } from './keys.js';

const LOW_SPACE = 2 * 1024 ** 3; // unter 2 GB frei: Hinweis anzeigen

export const changed = (opts) => S.onChange && S.onChange(opts || {});
export const save = () => {
  // Ansicht (Raster/Einzelbild, Filter) mit der Sitzung merken – erst wenn sie beim Öffnen wiederhergestellt wurde
  if (S.session && S.viewReady) S.session.view = { grid: !!S.grid, filter: S.filter };
  scheduleSave(S.session);
};

export const targetByPath = (p) => S.session.targets.find((t) => t.path === p);
export const isDeleted = (id) => !!S.session.deleted[id];
export const editsOf = (id) => S.session.edits[id] || null;
/** Zielordner (aktuelle), in denen das Bild liegt. Entfernte Ziele werden nicht mehr angezeigt. */
export const copiedPaths = (id) => Object.keys(S.session.copied[id] || {}).filter((p) => targetByPath(p));
export const indexOfId = (id) => S.items.findIndex((x) => x.id === id);

/** Bilder, die mit dem aktuellen Filter sichtbar sind (Positionen in S.items). */
export function visibleIndices() {
  const f = S.filter;
  const out = [];
  S.items.forEach((it, i) => {
    if (isDeleted(it.id)) return;
    const c = S.session.copied[it.id] || {};
    if (f === 'unseen') {
      // festgehaltene Liste: Bilder bleiben drin, auch wenn sie beim Durchsehen „angesehen“ werden
      if (S.unseenSnap?.has(it.id)) out.push(i);
    } else if (f === 'blurry') {
      if (S.blurrySnap?.has(it.id)) out.push(i);
    } else if (f === 'all' || (f === 'none' && copiedPaths(it.id).length === 0) || (f !== 'none' && c[f])) out.push(i);
  });
  return out;
}

// ------------------------------------------------------------------ Serien

/** Aufnahmezeit "JJJJ:MM:TT hh:mm:ss" in Sekunden (oder null). */
function seconds(taken) {
  const m = /^(\d{4})[:-](\d\d)[:-](\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(taken || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : null;
}

let seriesCache = { key: '', map: new Map() };

/**
 * Serien: Bilder, die kurz nacheinander im selben Ordner aufgenommen wurden.
 * Gibt eine Map Bild-ID -> Liste der IDs seiner Serie zurück (nur Serien ab 2 Bildern).
 */
export function seriesMap() {
  const gap = Number(S.settings.seriesGap ?? 2);
  const key = `${gap}|${S.items.length}|${Object.keys(S.session.deleted).join(',')}`;
  if (seriesCache.key === key && seriesCache.items === S.items) return seriesCache.map;
  const map = new Map();
  if (gap > 0) {
    let group = [];
    let last = null;
    const close = () => {
      if (group.length >= 2) for (const id of group) map.set(id, group);
      group = [];
    };
    for (const it of S.items) {
      if (isDeleted(it.id)) continue;
      const t = seconds(it.taken);
      if (!(last && t != null && last.t != null && last.dir === it.dir && Math.abs(t - last.t) <= gap)) close();
      group.push(it.id);
      last = { t, dir: it.dir };
    }
    close();
  }
  seriesCache = { key, items: S.items, map };
  return map;
}

export const seriesOf = (id) => seriesMap().get(id) || null;

export function countIn(path) {
  return Object.values(S.session.copied).filter((c) => c[path]).length;
}

function request(it, target, edits) {
  return {
    files: it.files,
    raw: it.raw,
    main: it.main,
    target: target.path,
    conflict: S.settings.conflict,
    edits: edits ? { rot: edits.rot || 0, angle: edits.angle || 0, crop: edits.crop || null } : null,
    jpgQuality: Number(S.settings.jpgQuality),
    rawMode: S.settings.rawMode,
  };
}

const exts = (files) => files.map((f) => f.split('.').pop().toUpperCase()).join(' + ');

// ------------------------------------------------------------------ Meldungen, die stehen bleiben

export function setBanner(b) {
  S.banners = S.banners.filter((x) => x.id !== b.id);
  S.banners.push(b);
  changed();
}

export function closeBanner(id) {
  S.banners = S.banners.filter((x) => x.id !== id);
  changed();
}

function targetError(target, message, it) {
  S.targetState[target.path] = 'err';
  setBanner({
    id: 'err:' + target.path,
    type: 'error',
    title: `Kopieren fehlgeschlagen: ${it.name} wurde nicht kopiert`,
    text: `${message} (Zielordner »${target.name}«: ${target.path})`,
    retry: () => copyTo(it, target),
    target,
  });
}

function clearTargetError(target) {
  if (S.targetState[target.path] === 'err') delete S.targetState[target.path];
  S.banners = S.banners.filter((x) => x.id !== 'err:' + target.path);
}

export async function checkSpace(target) {
  try {
    const d = await api.checkDir(target.path);
    if (!d.exists) {
      S.targetState[target.path] = 'err';
    } else if (d.free > 0 && d.free < LOW_SPACE) {
      // nur am Ziel-Chip anzeigen (»fast voll«), kein eigener Hinweis-Kasten
      S.targetState[target.path] = 'low';
    } else if (S.targetState[target.path] === 'low') {
      delete S.targetState[target.path];
    }
    changed();
    return d;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Kopieren

async function copyToNow(it, target, { quiet = false } = {}) {
  if (S.session.copied[it.id]?.[target.path]) {
    toast(`Liegt schon in »${target.name}«`, '#FFB454');
    return false;
  }
  let res;
  try {
    res = await api.copy(request(it, target, editsOf(it.id)));
  } catch (err) {
    targetError(target, String(err), it);
    return false;
  }
  clearTargetError(target);
  if (res.status === 'skipped') {
    toast(`Übersprungen: In »${target.name}« gibt es schon eine andere Datei namens ${it.name}`, '#FFB454');
    changed();
    return false;
  }
  const rec = { stem: res.stem, files: res.files, renamed: res.renamed, own: res.status === 'copied' };
  (S.session.copied[it.id] ||= {})[target.path] = rec;
  S.undo.push({ type: 'copy', id: it.id, path: target.path, rec });
  save();
  if (!quiet) {
    if (res.status === 'already') toast(`${target.name}: lag schon dort`, target.color);
    else if (res.renamed) toast(`✓ ${target.name} · Name war belegt → ${res.stem}`, target.color);
    else toast(`✓ ${target.name} · ${exts(res.files)}`, target.color);
  }
  checkSpace(target);
  changed();
  return true;
}

/** Ein Bild wieder aus einem Zielordner nehmen (Kopie wandert in den Papierkorb). */
async function removeFromNow(it, path) {
  const rec = S.session.copied[it.id]?.[path];
  if (!rec) return;
  const t = targetByPath(path);
  try {
    await api.trashFiles(rec.files);
  } catch (err) {
    toast('Entfernen fehlgeschlagen: ' + err, '#FF99A4');
    return;
  }
  delete S.session.copied[it.id][path];
  S.undo.push({ type: 'remove', id: it.id, path });
  save();
  toast(`Aus »${t ? t.name : folderName(path)}« entfernt (Papierkorb)`, '#9A9A9A');
  changed();
}

// ------------------------------------------------------------------ Löschen

/** Vor dem Löschen nachfragen – außer der Nutzer hat „Nicht mehr nachfragen“ gewählt. */
export async function confirmDelete(it) {
  if (S.settings.confirmDelete === false) return true;
  const n = it.files.length;
  const names = it.files.map((p) => p.split(/[\\/]/).pop()).join(', ');
  return confirmDialog({
    title: 'Bild löschen?',
    text: `${names} ${n > 1 ? 'werden' : 'wird'} in den Papierkorb verschoben. Mit ${MOD}Z holst du ${n > 1 ? 'sie' : 'es'} zurück.`,
    ok: 'In den Papierkorb',
    danger: true,
    checkbox: 'Nicht mehr nachfragen (in den Einstellungen wieder einschaltbar)',
    onChecked: () => {
      S.settings.confirmDelete = false;
      saveSettings(S.settings);
    },
  });
}

async function deleteItemNow(it) {
  try {
    const moves = await api.stageDelete(S.session.source, it.files);
    S.session.deleted[it.id] = moves;
    S.compareSel = S.compareSel.filter((x) => x !== it.id);
    S.undo.push({ type: 'delete', id: it.id, moves });
    save();
    return true;
  } catch (err) {
    toast('Löschen fehlgeschlagen: ' + err, '#FF99A4');
    return false;
  }
}

/** Ein gelöschtes Bild aus dem Papierkorb der Sitzung zurückholen. */
async function restoreDeletedNow(id) {
  const moves = S.session.deleted[id];
  if (!moves) return false;
  try {
    await api.restoreDelete(moves);
  } catch (err) {
    toast('Wiederherstellen fehlgeschlagen: ' + err, '#FF99A4');
    return false;
  }
  delete S.session.deleted[id];
  S.undo = S.undo.filter((a) => !(a.type === 'delete' && a.id === id));
  save();
  return true;
}

/** Bilder, die in dieser Sitzung gelöscht wurden und noch zurückgeholt werden können. */
export const deletedItems = () => S.items.filter((it) => isDeleted(it.id));

/** Filter „Möglicherweise unscharf“ einschalten (festgehaltene Liste, wächst nicht während des Durchsehens). */
export function startBlurryFilter() {
  S.blurrySnap = new Set([...(S.blurry || [])].filter((id) => !isDeleted(id)));
  S.filter = 'blurry';
  return S.blurrySnap.size;
}

/** Filter „Nicht angesehen“ einschalten: die gerade ungesehenen Bilder festhalten. Gibt deren Anzahl zurück. */
export function startUnseenFilter() {
  S.unseenSnap = new Set(S.items.filter((it) => !isDeleted(it.id) && !S.session.seen[it.id]).map((it) => it.id));
  S.filter = 'unseen';
  return S.unseenSnap.size;
}

/** Gelöschte Bilder endgültig in den Papierkorb des Systems (beim Verlassen der Sitzung). */
export async function flushDeleted() {
  if (!S.session) return;
  try {
    await api.flushDeleted(S.session.source);
  } catch (err) {
    toast('Papierkorb: ' + err, '#FF99A4');
  }
  S.undo = S.undo.filter((a) => a.type !== 'delete');
}

// ------------------------------------------------------------------ Bearbeiten

export const isIdentity = (e) => !e || ((e.rot || 0) % 360 === 0 && !e.angle && !e.crop);

/** Zuschnittrahmen mitdrehen, wenn das Bild um 90° gedreht wird. */
export function rotateCrop(c) {
  return c ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : null;
}

async function reapplyAll(it) {
  const edits = editsOf(it.id);
  for (const [path, rec] of Object.entries(S.session.copied[it.id] || {})) {
    const current = targetByPath(path);
    const t = current || { path, name: folderName(path) };
    try {
      const res = await api.reapply(request(it, t, edits), rec.stem);
      rec.files = [...new Set([...rec.files, ...res.files])];
    } catch (err) {
      // Fehler nur für eingerichtete Ziele melden – ein entfernter Zielordner kann längst weg sein
      if (current) targetError(t, String(err), it);
    }
  }
}

async function applyEditsNow(it, edits, { record = true } = {}) {
  const prev = editsOf(it.id);
  if (isIdentity(edits)) delete S.session.edits[it.id];
  else S.session.edits[it.id] = edits;
  if (record) S.undo.push({ type: 'edit', id: it.id, prev });
  save();
  await reapplyAll(it);
  changed();
}

// ------------------------------------------------------------------ Rückgängig

async function undoNow() {
  const a = S.undo.pop();
  if (!a) {
    toast('Nichts zum Rückgängigmachen', '#9A9A9A');
    return;
  }
  const idx = indexOfId(a.id);
  const it = S.items[idx];
  try {
    if (a.type === 'copy') {
      if (a.rec.own) await api.removeFiles(a.rec.files);
      delete S.session.copied[a.id]?.[a.path];
      toast('Kopieren rückgängig', '#4CC2FF');
    } else if (a.type === 'delete') {
      await api.restoreDelete(a.moves);
      delete S.session.deleted[a.id];
      toast('Bild wiederhergestellt', '#4CC2FF');
    } else if (a.type === 'edit') {
      await applyEditsNow(it, a.prev, { record: false });
      toast('Bearbeitung rückgängig', '#4CC2FF');
    } else if (a.type === 'remove') {
      const t = targetByPath(a.path);
      if (!t) toast('Dieser Zielordner ist nicht mehr eingerichtet', '#FFB454');
      else if (await copyToNow(it, t, { quiet: true })) {
        S.undo.pop(); // der neue Kopier-Eintrag soll nicht selbst rückgängig gemacht werden
        toast(`Wieder in »${t.name}«`, t.color);
      }
    }
  } catch (err) {
    toast('Rückgängig fehlgeschlagen: ' + err, '#FF99A4');
  }
  save();
  changed({ jumpTo: idx });
}

// ------------------------------------------------------------------ Zielordner

export function nextFreeKey(targets) {
  for (let k = 1; k <= 9; k++) if (!targets.some((t) => t.key === String(k))) return String(k);
  return null;
}

const normPath = (p) => (p || '').replace(/[\\/]+$/, '').toLowerCase();

/**
 * Prüft, ob ein Ordner als Zielordner taugt.
 * Gibt eine Meldung zurück, wenn nicht – sonst null.
 * `self` ist der Zielordner, der gerade geändert wird (darf seinen eigenen Pfad behalten).
 */
export function targetProblem(path, targets, source, self = null) {
  if (source && normPath(path) === normPath(source)) return 'Der Quellordner kann nicht gleichzeitig Zielordner sein';
  const other = targets.find((t) => t !== self && normPath(t.path) === normPath(path));
  if (other) return `Dieser Ordner ist schon Zielordner ${other.key} »${other.name}«`;
  return null;
}

/** Ordner für einen Zielordner auswählen lassen und prüfen. Gibt den Pfad oder null zurück. */
export async function pickTargetFolder(title, targets, source, self = null) {
  const path = await pickFolder(title);
  if (!path) return null;
  const problem = targetProblem(path, targets, source, self);
  if (problem) {
    toast(problem, '#FFB454');
    return null;
  }
  return path;
}

export async function addTarget(targets, key = nextFreeKey(targets), source = S.session?.source) {
  if (!key) {
    toast('Es sind schon 9 Zielordner eingerichtet', '#FFB454');
    return null;
  }
  const path = await pickTargetFolder(`Zielordner für Taste ${key} wählen`, targets, source);
  if (!path) return null;
  const t = { key, name: folderName(path), color: COLORS[(Number(key) - 1) % COLORS.length], path };
  targets.push(t);
  targets.sort((a, b) => a.key.localeCompare(b.key));
  return t;
}

export async function endSession() {
  if (!S.session) return;
  await flushDeleted();
  await saveSession(S.session);
}

// ------------------------------------------------------------------ Reihenfolge sichern
// Dateiaktionen laufen strikt nacheinander. So kann z. B. ein schnelles Strg+Z nicht
// eine Kopie rückgängig machen, die noch gar nicht fertig ist.

let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export const copyTo = (...a) => serial(() => copyToNow(...a));
export const removeFrom = (...a) => serial(() => removeFromNow(...a));
export const deleteItem = (...a) => serial(() => deleteItemNow(...a));
export const applyEdits = (...a) => serial(() => applyEditsNow(...a));
export const undo = () => serial(undoNow);
export const restoreDeleted = (id) => serial(() => restoreDeletedNow(id));

// Verbindung zum Rust-Teil der App (src-tauri/src/lib.rs).

const T = window.__TAURI__;

export const invoke = (cmd, args) => T.core.invoke(cmd, args);

/** Lokalen Dateipfad in eine Adresse umwandeln, die <img> anzeigen kann. */
export const fileSrc = (path) => T.core.convertFileSrc(path);

export const listen = (event, cb) => T.event.listen(event, cb);

export const appWindow = () => T.window.getCurrentWindow();

/** Ordnerauswahl-Dialog des Betriebssystems. */
export async function pickFolder(title) {
  const options = { directory: true, multiple: false, title };
  const res = T.dialog?.open
    ? await T.dialog.open(options)
    : await invoke('plugin:dialog|open', { options });
  return typeof res === 'string' ? res : null;
}

/** Programm (.exe bzw. .app) auswählen lassen. */
export async function pickProgram(title) {
  const win = navigator.platform.startsWith('Win');
  // Windows: nur .exe anbieten. Linux: Programme liegen meist in /usr/bin (z. B. darktable, gimp).
  const options = win
    ? { directory: false, multiple: false, title, filters: [{ name: 'Programme', extensions: ['exe'] }] }
    : { directory: false, multiple: false, title, defaultPath: /Linux/i.test(navigator.platform) ? '/usr/bin' : undefined };
  const res = T.dialog?.open ? await T.dialog.open(options) : await invoke('plugin:dialog|open', { options });
  return typeof res === 'string' ? res : null;
}

/** Ordner per Drag & Drop ins Fenster ziehen. */
export function onDragDrop(cb) {
  try {
    return T.webview.getCurrentWebview().onDragDropEvent((e) => cb(e.payload));
  } catch {
    return Promise.resolve(() => {});
  }
}

export const api = {
  scan: (path, subfolders, sort, exclude = []) => invoke('scan_folder', { path, subfolders, sort, exclude }),
  quickCount: (path, subfolders, exclude = []) => invoke('quick_count', { path, subfolders, exclude }),
  preview: (it) => invoke('get_preview', { raw: it.raw, main: it.main }),
  thumb: (it) => invoke('get_thumb', { raw: it.raw, main: it.main }),
  info: (it) => invoke('get_info', { raw: it.raw, main: it.main }),
  medium: (it) => invoke('get_medium', { raw: it.raw, main: it.main }),
  focusMask: (it) => invoke('focus_mask', { raw: it.raw, main: it.main }),
  sharpness: (it) => invoke('sharpness', { raw: it.raw, main: it.main }),
  findCards: () => invoke('find_cards'),
  histogram: (it) => invoke('histogram', { raw: it.raw, main: it.main }),
  clipMask: (it, threshold) => invoke('clip_mask', { raw: it.raw, main: it.main, threshold }),
  copy: (req) => invoke('copy_item', { req }),
  reapply: (req, stem) => invoke('reapply_edits', { req, stem }),
  removeFiles: (paths) => invoke('remove_files', { paths }),
  trashFiles: (paths) => invoke('trash_files', { paths }),
  stageDelete: (root, files) => invoke('stage_delete', { root, files }),
  restoreDelete: (moves) => invoke('restore_delete', { moves }),
  flushDeleted: (root) => invoke('flush_deleted', { root }),
  checkDir: (path) => invoke('check_dir', { path }),
  reveal: (path) => invoke('reveal_path', { path }),
  openPath: (path, with_) => invoke('open_path', { path, with: with_ || null }),
  storeGet: (name) => invoke('store_get', { name }),
  storeSet: (name, content) => invoke('store_set', { name, content }),
  storeList: (prefix) => invoke('store_list', { prefix }),
  storeRemove: (name) => invoke('store_remove', { name }),
  folderStamp: (path, subfolders, exclude = []) => invoke('folder_stamp', { path, subfolders, exclude }),
  scanNew: (path, subfolders, exclude, known) => invoke('scan_new', { path, subfolders, exclude, known }),
  createDirs: (paths) => invoke('create_dirs', { paths }),
  cacheInfo: () => invoke('cache_info'),
  clearCache: () => invoke('clear_cache'),
};

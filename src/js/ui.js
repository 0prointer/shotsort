// Kleine Helfer für die Oberfläche: Symbole, Meldungen, Dialoge.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const sv = (d, size = 18, sw = 1.5) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  back: sv('<path d="M17 10H3M8 4L3 10l5 6"/>', 16, 1.7),
  prev: sv('<path d="M12.5 4L6.5 10l6 6"/>', 18, 1.8),
  next: sv('<path d="M7.5 4l6 6-6 6"/>', 18, 1.8),
  arrow: sv('<path d="M3 10h13M11 5l5 5-5 5"/>', 16, 1.6),
  folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="stroke:var(--folder)" stroke-width="1.8" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
  card: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h9.5A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V6z"/><path d="M9 3v3.5M12 3v3.5M15 3v3.5"/></svg>',
  folderBig: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="stroke:var(--folder)" stroke-width="1.6" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
  rotate: sv('<path d="M15.5 8A6 6 0 1 0 16 12"/><path d="M16 3.5V8h-4.5"/>'),
  crop: sv('<path d="M5 1.5V15h13.5M1.5 5H15v13.5"/>'),
  zoom: sv('<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.5 12.5l5 5M6 8.5h5M8.5 6v5"/>'),
  zoomOut: sv('<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.5 12.5l5 5M6 8.5h5"/>'),
  filter: sv('<path d="M3 4.5h14l-5.5 6.2v5.1l-3 1.7v-6.8z"/>'),
  sun: sv('<circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/>'),
  trash: sv('<path d="M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l1 11h8l1-11M8.5 8.5v5M11.5 8.5v5"/>'),
  undo: sv('<path d="M4 7.5h8.5a4.5 4.5 0 0 1 0 9H8"/><path d="M7.5 4L4 7.5 7.5 11"/>'),
  info: sv('<circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2v.1"/>'),
  gear: sv('<circle cx="10" cy="10" r="2.6"/><path d="M16.2 11.1l1.4 1.1-1.7 2.9-1.7-.7a6 6 0 0 1-1.7 1L12.2 17H8.8l-.3-1.6a6 6 0 0 1-1.7-1l-1.7.7-1.7-2.9 1.4-1.1a6 6 0 0 1 0-2.2L3.4 7.8l1.7-2.9 1.7.7a6 6 0 0 1 1.7-1L8.8 3h3.4l.3 1.6a6 6 0 0 1 1.7 1l1.7-.7 1.7 2.9-1.4 1.1a6 6 0 0 1 0 2.2z"/>', 18, 1.4),
  full: sv('<path d="M12 3h5v5M17 3l-6 6M8 17H3v-5M3 17l6-6"/>', 16),
  chevDown: sv('<path d="M6 8l4 4 4-4"/>', 14, 1.8),
  chevUp: sv('<path d="M6 12l4-4 4 4"/>', 14, 1.8),
  bare: sv('<path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13"/>', 16),
  fullExit: sv('<path d="M16 9h-5V4M11 9l6-6M4 11h5v5M9 11l-6 6"/>', 16),
  strip: sv('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><rect x="5" y="11" width="10" height="3" rx="1" fill="currentColor" stroke="none"/>', 16),
  tone: sv('<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/>'),
  external: sv('<path d="M11 3.5h5.5V9M16.5 3.5L9.5 10.5"/><path d="M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8"/>'),
  focus: sv('<path d="M2.5 6.5v-4h4M13.5 2.5h4v4M17.5 13.5v4h-4M6.5 17.5h-4v-4"/><circle cx="10" cy="10" r="2.6"/>'),
  single: sv('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/>', 16, 1.3),
  gridView: sv('<rect x="2.5" y="2.5" width="4" height="4" rx=".6"/><rect x="8" y="2.5" width="4" height="4" rx=".6"/><rect x="13.5" y="2.5" width="4" height="4" rx=".6"/><rect x="2.5" y="8" width="4" height="4" rx=".6"/><rect x="8" y="8" width="4" height="4" rx=".6"/><rect x="13.5" y="8" width="4" height="4" rx=".6"/><rect x="2.5" y="13.5" width="4" height="4" rx=".6"/><rect x="8" y="13.5" width="4" height="4" rx=".6"/><rect x="13.5" y="13.5" width="4" height="4" rx=".6"/>', 16, 1.3),
  restore: sv('<path d="M4 7.5h8.5a4.5 4.5 0 0 1 0 9H8"/><path d="M7.5 4L4 7.5 7.5 11"/>', 16),
  compare: sv('<rect x="2" y="4" width="7" height="12" rx="1"/><rect x="11" y="4" width="7" height="12" rx="1"/>', 16, 1.4),
  grid: sv('<rect x="2.5" y="2.5" width="6" height="6" rx="1"/><rect x="11.5" y="2.5" width="6" height="6" rx="1"/><rect x="2.5" y="11.5" width="6" height="6" rx="1"/><rect x="11.5" y="11.5" width="6" height="6" rx="1"/>', 16, 1.4),
  check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#111" stroke-width="2.2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>',
  checkGreen: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>',
  pen: '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true"><path d="M3 1v11h12M1 4h11v11"/></svg>',
  error: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v6M12 16.5v.2"/></svg>',
  warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.2"/></svg>',
};

export function keycap(t, extra = '') {
  return `<span class="keycap" style="background:${t.color}" ${extra}>${esc(t.key)}</span>`;
}

// ---------------- Kurze Meldungen ----------------

let toastHost = null;
let toastMs = 2500;
export function setToastHost(el) {
  toastHost = el;
}
export function setToastDuration(ms) {
  toastMs = ms;
}

export function toast(text, color = '#4CC2FF') {
  // Ist ein Dialog offen, erscheint die Meldung über dem Dialog
  const local = toastHost && toastHost.isConnected && !modalOpen() ? toastHost : null;
  const host = local || document.getElementById('toasts-global');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="dot" style="background:${color}"></span><span>${esc(text)}</span>`;
  // Immer nur eine Meldung: die neue ersetzt die alte
  host.innerHTML = '';
  host.appendChild(el);
  setTimeout(() => el.remove(), toastMs);
}

// ---------------- Dialoge ----------------

const overlay = () => document.getElementById('overlay');
export const modalOpen = () => overlay().children.length > 0;

export function closeModal() {
  overlay().innerHTML = '';
}

/** Einfacher Dialog. Gibt true zurück, wenn bestätigt wurde. */
export function confirmDialog({ title, text, ok = 'OK', cancel = 'Abbrechen', danger = false, checkbox = null, onChecked = null }) {
  return new Promise((resolve) => {
    overlay().innerHTML = `
      <div class="modal-back">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <h2>${esc(title)}</h2>
          <p>${esc(text)}</p>
          ${checkbox ? `<label class="row small"><input type="checkbox" id="dlg-check"> ${esc(checkbox)}</label>` : ''}
          <div class="actions">
            <button class="btn" data-a="no">${esc(cancel)}</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(ok)}</button>
          </div>
        </div>
      </div>`;
    const done = (v) => {
      if (v && checkbox && onChecked && overlay().querySelector('#dlg-check')?.checked) onChecked();
      closeModal();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay().querySelector('[data-a="yes"]').onclick = () => done(true);
    overlay().querySelector('[data-a="no"]').onclick = () => done(false);
    overlay().querySelector('.modal-back').onclick = (e) => { if (e.target === e.currentTarget) done(false); };
    overlay().querySelector('[data-a="yes"]').focus();
  });
}

export function helpDialog(list) {
  overlay().innerHTML = `
    <div class="modal-back">
      <div class="modal wide" role="dialog" aria-modal="true" aria-label="Tastenkürzel">
        <div class="row"><h2 class="grow">Tastenkürzel</h2><button class="btn sm" data-a="close">Schließen (Esc)</button></div>
        <div class="help-groups">
          ${list
            .map(
              ([title, items]) => `<section><h3>${esc(title)}</h3>
                ${items.map(([k, d]) => `<div class="help-row"><span class="kbd">${esc(k)}</span><span>${esc(d)}</span></div>`).join('')}
              </section>`
            )
            .join('')}
        </div>
      </div>
    </div>`;
  const close = () => {
    closeModal();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  overlay().querySelector('[data-a="close"]').onclick = close;
  overlay().querySelector('.modal-back').onclick = (e) => { if (e.target === e.currentTarget) close(); };
}

// ---------------- Zahlen und Texte ----------------

export const fmtInt = (n) => Number(n || 0).toLocaleString('de-DE');

export function fmtBytes(b) {
  if (!b) return '0 KB';
  const f = (n, d) => n.toLocaleString('de-DE', { maximumFractionDigits: d });
  const gb = b / 1024 ** 3;
  if (gb >= 1) return f(gb, gb >= 100 ? 0 : 1) + ' GB';
  const mb = b / 1024 ** 2;
  if (mb >= 1) return f(mb, mb >= 10 ? 0 : 1) + ' MB'; // kleine Dateien mit einer Nachkommastelle
  return f(Math.max(1, Math.round(b / 1024)), 0) + ' KB';
}

export function fmtTaken(t) {
  // "2026:11:14 15:42:10" -> "14.11.2026, 15:42"
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(t || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]}` : '–';
}

export function fmtAgo(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

export function fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'unter 1 Min.';
  if (min < 60) return `${min} Min.`;
  return `${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}

/**
 * Schnelle Tooltips für Knöpfe: erscheinen nach kurzer Pause statt erst nach ~1 s wie die von Windows,
 * und zeigen das Tastenkürzel abgesetzt („Drehen  R“). Text kommt aus dem title-Attribut; steht dort am
 * Ende „(Taste)“, wird das als Taste angezeigt. Das title wird dabei in data-tip verschoben, damit der
 * Windows-Tooltip nicht zusätzlich erscheint.
 */
export function initTooltips() {
  const SEL = '.fc-x, [data-copy], .strip-grip, .icon-btn, .chip, .ser-side, .pill, .seg, .top-prog, .bb-zoom, .bb-pos';
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let timer = 0;
  let target = null;

  const hide = () => {
    clearTimeout(timer);
    tip.classList.remove('show');
    target = null;
  };
  const show = (el) => {
    const raw = el.dataset.tip || '';
    if (!raw) return;
    const m = raw.match(/^(.*\S)\s*\(([^()]{1,14})\)$/s);
    tip.innerHTML = m ? `${esc(m[1])}<kbd>${esc(m[2])}</kbd>` : esc(raw);
    const r = el.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.classList.add('show');
    const t = tip.getBoundingClientRect();
    if (el.closest('.vtools')) {
      // Werkzeugspalte am rechten Rand: Hinweis links daneben
      tip.style.left = `${Math.max(8, r.left - t.width - 10)}px`;
      tip.style.top = `${Math.max(8, Math.min(innerHeight - t.height - 8, r.top + r.height / 2 - t.height / 2))}px`;
      return;
    }
    const below = r.bottom + 8 + t.height < innerHeight;
    const x = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${below ? r.bottom + 8 : r.top - 8 - t.height}px`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.(SEL);
    if (el === target) return;
    hide();
    if (!el) return;
    if (el.title) {
      el.dataset.tip = el.title;
      el.removeAttribute('title');
    }
    if (!el.dataset.tip) return;
    target = el;
    timer = setTimeout(() => target === el && el.isConnected && show(el), 250);
  });
  // weg, sobald man klickt, tippt, scrollt oder das Fenster verlässt
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'blur']) addEventListener(ev, hide, true);
  document.addEventListener('pointerleave', hide);
}

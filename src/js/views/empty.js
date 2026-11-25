// Keine Bilder gefunden.

import { api } from '../api.js';
import { S, go } from '../state.js';
import { saveSettings } from '../store.js';
import { esc, $, fmtInt, icons } from '../ui.js';

export function mount(root) {
  const sess = S.session;
  root.innerHTML = `
    <div class="topbar"><button class="icon-btn" id="back" aria-label="Zurück">${icons.back}</button></div>
    <div class="centered">
      <div style="width:580px;max-width:100%;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center">
        <svg width="72" height="72" viewBox="0 0 48 48" fill="none" stroke="var(--muted)" stroke-width="2" aria-hidden="true"><rect x="6" y="10" width="36" height="28" rx="4"/><path d="M6 32l10-10 8 8 5-5 13 13"/></svg>
        <h1 class="title">Keine Bilder gefunden</h1>
        <p class="muted" style="line-height:1.6">Im Ordner <b style="color:var(--text)">${esc(sess.source)}</b> liegen keine Bilddateien, die die App öffnen kann.</p>
        <div class="row wrap" style="justify-content:center" id="actions">
          <button class="btn" id="other">Anderen Ordner wählen</button>
        </div>
        <div class="card pad small muted" style="text-align:left;width:100%;line-height:1.6">
          <b style="color:var(--text)">Unterstützte Formate</b><br>
          RAW: .CR3 .CR2 .NEF .ARW .RAF .ORF .RW2 .DNG .PEF .SRW<br>
          Bilder: .JPG .JPEG .PNG .TIF .TIFF
        </div>
      </div>
    </div>`;
  $('#back').onclick = () => go('start');
  $('#other').onclick = () => go('start');

  if (!S.settings.subfolders) {
    api.quickCount(sess.source, true, sess.targets.map((t) => t.path)).then((c) => {
      if (!c.images) return;
      const b = document.createElement('button');
      b.className = 'btn primary';
      b.textContent = `Unterordner einbeziehen (${fmtInt(c.images)} Bilder gefunden)`;
      b.onclick = () => {
        S.settings.subfolders = true;
        saveSettings(S.settings);
        go('loading');
      };
      $('#actions')?.prepend(b);
    });
  }
  return {
    onKey(e) {
      if (e.key === 'Escape') go('start');
    },
  };
}

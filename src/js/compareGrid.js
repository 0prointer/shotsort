// Vergleich innerhalb der Sortieransicht: mehrere Bilder nebeneinander, Zoom und Ausschnitt gekoppelt.
// 2 Bilder nebeneinander, 3–4 als 2 × 2, mehr in 3 Spalten (2 Reihen sichtbar, der Rest scrollt).
// Jede Kachel hat nur ein ✕: Es nimmt das Bild aus dem Vergleich, gelöscht wird nichts.

import { api } from './api.js';
import { S } from './state.js';
import { Viewer } from './viewer.js';
import * as A from './actions.js';
import { keyLabel } from './keys.js';
import { esc } from './ui.js';

export class CompareGrid {
  /**
   * @param {HTMLElement} el  leerer Container (wird zum Raster)
   * @param {{onActive:(id:string)=>void, onDrop:(id:string)=>void, onView:()=>void}} cb
   */
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.ids = [];
    this.active = 0;
    this.viewers = [];
    this.observer = null;
  }

  many() {
    return this.ids.length > 4;
  }
  cols() {
    return this.many() ? 3 : 2;
  }
  scrolling() {
    return Math.ceil(this.ids.length / 3) > 2 && this.many();
  }
  item(i) {
    return S.items[A.indexOfId(this.ids[i])];
  }
  viewer() {
    return this.viewers[this.active] || null;
  }

  /** Bilder setzen. Gleiche Liste → nur die aktive Kachel wechseln, sonst neu aufbauen. */
  set(ids, activeId) {
    const same = ids.length === this.ids.length && ids.every((x, i) => x === this.ids[i]);
    if (!same) {
      this.ids = [...ids];
      this.active = Math.max(0, this.ids.indexOf(activeId));
      this.build();
    } else {
      const a = this.ids.indexOf(activeId);
      if (a >= 0 && a !== this.active) this.setActive(a, { notify: false });
      else this.render();
    }
  }

  build() {
    this.viewers.forEach((v) => v.destroy());
    this.observer?.disconnect();
    const grid = this.el;
    const cols = this.cols();
    const rows = Math.ceil(this.ids.length / cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    // Bis 2 Reihen füllen den Platz, darüber hinaus sind 2 Reihen sichtbar und der Rest scrollt
    grid.style.gridTemplateRows = rows <= 2 ? `repeat(${rows}, minmax(0, 1fr))` : `repeat(${rows}, calc((100% - 12px) / 2))`;
    grid.classList.toggle('scroll', rows > 2);
    const dropKey = keyLabel(S.settings.keys.drop);
    grid.innerHTML = this.ids
      .map(
        (id, i) => `<div class="tile" data-i="${i}"><div class="stage"></div>
          <div class="tile-ring"></div>
          <span class="stage-label tile-name"></span>
          <button class="tile-x" data-drop title="Aus dem Vergleich nehmen (${esc(dropKey)}) – das Bild bleibt im Ordner" aria-label="Aus dem Vergleich nehmen">✕</button>
        </div>`
      )
      .join('');
    this.viewers = this.ids.map((id, i) => {
      const tile = grid.children[i];
      const v = new Viewer(tile.querySelector('.stage'), {
        // Viele Bilder: Mausrad scrollt, mit Strg/⌘ zoomt es
        wheelZoom: (e) => !this.scrolling() || e.ctrlKey || e.metaKey,
        onView: (view) => {
          this.viewers.forEach((o, j) => j !== i && o.setView(view));
          this.cb.onView?.();
        },
      });
      tile.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.tile-x')) this.setActive(i);
      });
      tile.querySelector('[data-drop]').onclick = (e) => {
        e.stopPropagation();
        this.drop(i);
      };
      return v;
    });
    if (this.many()) {
      // Kacheln erst laden, wenn sie in Sichtweite kommen
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            this.observer.unobserve(en.target);
            const i = Number(en.target.dataset.i);
            if (this.viewers[i]) this.load(i, this.viewers[i]);
          }
        },
        { root: grid, rootMargin: '200px 0px' }
      );
      [...grid.children].forEach((t) => this.observer.observe(t));
    } else {
      this.viewers.forEach((v, i) => this.load(i, v));
    }
    this.render();
    grid.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  async load(i, v) {
    const it = this.item(i);
    if (!it) return;
    try {
      // Viele Bilder: mittelgroße Vorschau (spart Arbeitsspeicher), sonst die volle
      const many = this.many();
      const cache = many ? S.mediums : S.previews;
      let pv = cache.get(it.id);
      if (!pv) {
        v.expectSoon();
        pv = await (many ? api.medium(it) : api.preview(it));
        cache.set(it.id, pv);
      }
      if (this.viewers[i] !== v) return;
      const ref = this.viewers.find((o) => o !== v && o.natW);
      await v.show({ src: pv.src, baseRot: pv.rotate, edits: A.editsOf(it.id), view: ref?.getView?.() });
    } catch (err) {
      v.message('Keine Vorschau: ' + err);
    }
  }

  /** Namen, Kopiert-Punkte und aktive Kachel aktualisieren. */
  render() {
    [...this.el.children].forEach((tile, i) => {
      tile.classList.toggle('active', i === this.active);
      const it = this.item(i);
      if (!it) return;
      const dots = A.copiedPaths(it.id)
        .map((p) => `<span class="dot" style="background:${A.targetByPath(p)?.color || '#9A9A9A'}" title="liegt in ${esc(A.targetByPath(p)?.name || '')}"></span>`)
        .join('');
      tile.querySelector('.tile-name').innerHTML = `${esc(it.name)}${dots}`;
    });
  }

  /** Bearbeitungen (Drehen, Zuschnitt) eines Bildes neu anzeigen. */
  refreshEdits() {
    this.viewers.forEach((v, i) => {
      const it = this.item(i);
      if (it && v.natW) v.setEdits(A.editsOf(it.id));
    });
  }

  setActive(i, { notify = true } = {}) {
    if (i < 0 || i >= this.ids.length) return;
    this.active = i;
    this.render();
    this.el.children[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (notify) this.cb.onActive(this.ids[i]);
  }

  /** Pfeiltasten: ±1 oder eine Reihe weiter. */
  move(delta) {
    const n = this.ids.length;
    if (Math.abs(delta) === 1) return this.setActive((this.active + delta + n) % n);
    const next = this.active + delta;
    if (next >= 0 && next < n) this.setActive(next);
  }

  drop(i = this.active) {
    const id = this.ids[i];
    if (!id) return;
    this.el.children[i]?.classList.add('leaving');
    setTimeout(() => this.cb.onDrop(id), 150);
  }

  toggle100(x, y) {
    this.viewer()?.toggle100(x, y);
  }

  layout() {
    this.viewers.forEach((v) => v.layout());
  }

  clear() {
    this.observer?.disconnect();
    this.viewers.forEach((v) => v.destroy());
    this.viewers = [];
    this.ids = [];
    this.el.innerHTML = '';
  }
}

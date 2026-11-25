// Bildanzeige mit Zoom (Mausrad, Doppelklick, Taste Z), Verschieben und Zuschneiden.
//
// Die Ansicht wird beschrieben durch:
//   zrel   – Zoom relativ zu "ganzes Bild" (1 = passt ins Fenster)
//   nx, ny – welcher Punkt des Bildes (0..1) in der Mitte des Fensters liegt
// So lässt sich dieselbe Ansicht auch auf andere Bilder übertragen (Vergleich, Serien).

import { fileSrc } from './api.js';

export function straightenScale(w, h, deg) {
  const a = (deg * Math.PI) / 180;
  return Math.abs(Math.cos(a)) + Math.max(w / h, h / w) * Math.abs(Math.sin(a));
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ASPECTS = [
  ['Frei', 0],
  ['Original', -1],
  ['3:2', 3 / 2],
  ['4:5', 4 / 5],
  ['1:1', 1],
  ['16:9', 16 / 9],
];

export class Viewer {
  constructor(stage, { onView, interactive = true, insets = null, wheelZoom = null, onLayout = null } = {}) {
    this.stage = stage;
    this.onLayout = onLayout;
    // Darf das Mausrad zoomen? (Im scrollbaren Serien-Vergleich nur mit Strg/⌘.)
    this.wheelZoom = wheelZoom || (() => true);
    this.onView = onView;
    // Freiraum für schwebende Leisten: Das ganze Bild passt zwischen sie,
    // beim Zoomen darf es aber darunter weiterlaufen.
    this.insets = insets || (() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
    this.stage.innerHTML = `
      <div class="frame"><img class="main" alt=""><img class="mask clip hidden" alt=""><img class="mask focus hidden" alt=""></div>
      <div class="crop-host"></div>
      <div class="stage-msg hidden"></div>`;
    this.frame = stage.querySelector('.frame');
    this.img = stage.querySelector('img.main');
    this.masks = { clip: stage.querySelector('img.mask.clip'), focus: stage.querySelector('img.mask.focus') };
    this.cropHost = stage.querySelector('.crop-host');
    this.msg = stage.querySelector('.stage-msg');
    this.natW = 0;
    this.natH = 0;
    this.baseRot = 0;
    this.edits = { rot: 0, angle: 0, crop: null };
    this.view = { zrel: 1, nx: 0.5, ny: 0.5 };
    this.mode = 'view';
    this.draft = null;
    this.token = 0;

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
    if (interactive) this.bind();
  }

  destroy() {
    clearTimeout(this.loadTimer);
    this.ro.disconnect();
    this.stage.innerHTML = '';
  }

  // ------------------------------------------------------------------ Bild laden

  /** Bild anzeigen. view = null bedeutet "ganzes Bild". */
  /** Hinweis „Lade …“ zeigen, wenn das nächste Bild nicht schnell kommt (statt das alte stehen zu lassen). */
  expectSoon() {
    clearTimeout(this.loadTimer);
    const token = this.token;
    this.loadTimer = setTimeout(() => {
      if (token === this.token) this.message('Lade Vorschau …');
    }, 150);
  }

  async show({ src, baseRot = 0, edits, view = null }) {
    clearTimeout(this.loadTimer);
    const token = ++this.token;
    this.msg.classList.add('hidden');
    this.loadTimer = setTimeout(() => {
      if (token === this.token) this.message('Lade Vorschau …');
    }, 150);
    for (const m of Object.values(this.masks)) m.classList.add('hidden');
    this.baseRot = baseRot;
    this.edits = edits || { rot: 0, angle: 0, crop: null };
    const url = fileSrc(src);
    const probe = new Image();
    probe.src = url;
    try {
      await probe.decode();
    } catch {
      clearTimeout(this.loadTimer);
      if (token === this.token) this.message('Dieses Bild konnte nicht angezeigt werden.');
      return false;
    }
    clearTimeout(this.loadTimer);
    if (token !== this.token) return false;
    this.msg.classList.add('hidden');
    this.natW = probe.naturalWidth;
    this.natH = probe.naturalHeight;
    this.img.src = url;
    this.frame.classList.remove('hidden');
    this.view = view ? { ...view } : { zrel: 1, nx: 0.5, ny: 0.5 };
    this.layout();
    return true;
  }

  message(text) {
    this.frame.classList.add('hidden');
    this.cropHost.innerHTML = '';
    this.msg.textContent = text;
    this.msg.classList.remove('hidden');    this.onLayout?.();
  }

  setEdits(edits) {
    this.edits = edits || { rot: 0, angle: 0, crop: null };
    this.layout();
  }

  /** Überlagerung zeigen: kind = 'clip' (Überbelichtung, rot) oder 'focus' (Schärfe, grün). */
  setMask(src, kind = 'clip') {
    const m = this.masks[kind];
    if (src) {
      m.src = fileSrc(src);
      m.classList.remove('hidden');
    } else {
      m.classList.add('hidden');
      m.removeAttribute('src');
    }
  }

  // ------------------------------------------------------------------ Geometrie

  geom() {
    const sw = this.stage.clientWidth || 1;
    const sh = this.stage.clientHeight || 1;
    const r = (((this.baseRot + (this.edits.rot || 0)) % 360) + 360) % 360;
    const swap = r % 180 !== 0;
    const ew = (swap ? this.natH : this.natW) || 1;
    const eh = (swap ? this.natW : this.natH) || 1;
    const ins = this.insets();
    const aw = Math.max(50, sw - ins.left - ins.right);
    const ah = Math.max(50, sh - ins.top - ins.bottom);
    // Mittelpunkt der freien Fläche (relativ zur Fenstermitte)
    const ox = (ins.left - ins.right) / 2;
    const oy = (ins.top - ins.bottom) / 2;
    const pad = this.mode === 'crop' ? 0.9 : 0.98;
    const fit = Math.min(aw / ew, ah / eh) * pad;
    const z = fit * this.view.zrel;
    return { sw, sh, aw, ah, r, ew, eh, fit, z, ox, oy };
  }

  angle() {
    return this.mode === 'crop' ? this.draft.angle : this.edits.angle || 0;
  }

  layout() {
    this.layoutInner();
    this.onLayout?.();
  }

  /** Wo das Bild gerade auf dem Bildschirm liegt (oder null). */
  imageRect() {
    if (!this.natW || this.frame.classList.contains('hidden')) return null;
    const r = this.frame.getBoundingClientRect();
    return r.width && r.height ? r : null;
  }

  layoutInner() {
    if (!this.natW) return;
    const g = this.geom();
    const { nx, ny } = this.view;
    const cx = (0.5 - nx) * g.ew * g.z;
    const cy = (0.5 - ny) * g.eh * g.z;
    this.frame.style.width = this.natW + 'px';
    this.frame.style.height = this.natH + 'px';
    this.frame.style.transform = `translate(-50%, -50%) translate(${cx + g.ox}px, ${cy + g.oy}px) scale(${g.z}) rotate(${g.r}deg)`;
    const a = this.angle();
    const s = a ? straightenScale(g.ew, g.eh, a) : 1;
    const t = a ? `rotate(${a}deg) scale(${s})` : '';
    this.img.style.transform = t;
    for (const m of Object.values(this.masks)) m.style.transform = t;
    this.stage.classList.toggle('grab', this.mode === 'view' && this.view.zrel > 1.001);

    // Zuschnitt-Rahmen (in Bildschirmkoordinaten)
    const crop = this.mode === 'crop' ? this.draft.crop : this.edits.crop;
    if (!crop) {
      this.cropHost.innerHTML = '';
      return;
    }
    const left = g.sw / 2 + g.ox + cx - (g.ew * g.z) / 2;
    const top = g.sh / 2 + g.oy + cy - (g.eh * g.z) / 2;
    const live = this.mode === 'crop';
    let host = this.cropHost.firstElementChild;
    if (!host || host.classList.contains('live') !== live) {
      // Beim Ansehen liegt der Rahmen in einer Fläche genau über dem Bild, die alles außerhalb
      // abschneidet – so wird nur der weggeschnittene Teil des Bildes abgedunkelt, nicht der Hintergrund.
      this.cropHost.innerHTML = live
        ? `<div class="crop-box live"><div class="grid">${'<span></span>'.repeat(9)}</div>
             <div class="h nw" data-h="nw"></div><div class="h ne" data-h="ne"></div>
             <div class="h sw" data-h="sw"></div><div class="h se" data-h="se"></div></div>`
        : `<div class="crop-clip"><div class="crop-box static"></div></div>`;
      host = this.cropHost.firstElementChild;
    }
    let box = host;
    let ox = left;
    let oy = top;
    if (!live) {
      Object.assign(host.style, { left: left + 'px', top: top + 'px', width: g.ew * g.z + 'px', height: g.eh * g.z + 'px' });
      box = host.firstElementChild;
      ox = 0;
      oy = 0;
    }
    box.style.left = ox + crop.x * g.ew * g.z + 'px';
    box.style.top = oy + crop.y * g.eh * g.z + 'px';
    box.style.width = crop.w * g.ew * g.z + 'px';
    box.style.height = crop.h * g.eh * g.z + 'px';
  }

  // ------------------------------------------------------------------ Zoom

  getView() {
    return { ...this.view };
  }

  setView(v, emit = false) {
    const zrel = Math.max(1, v.zrel);
    if (zrel <= 1.0001) {
      this.view = { zrel: 1, nx: 0.5, ny: 0.5 };
    } else {
      this.view = { zrel, nx: clamp(v.nx, 0, 1), ny: clamp(v.ny, 0, 1) };
      if (this.natW) {
        // Verschieben nur so weit, dass das Bild die Fläche ausfüllt – nie über seinen Rand hinaus.
        // Ist das Bild in einer Richtung kleiner als die Fläche, bleibt es dort mittig.
        // (Wichtig im Vergleich: Bilder mit anderem Format werden für sich passend begrenzt.)
        const g = this.geom();
        const W = g.ew * g.z;
        const H = g.eh * g.z;
        // Bezugsfläche ist der freie Bereich zwischen den Leisten, damit auch der untere Rand
        // des Bildes über die Filmleiste hinaus hervorgeholt werden kann.
        this.view.nx = W <= g.aw ? 0.5 : clamp(v.nx, g.aw / (2 * W), 1 - g.aw / (2 * W));
        this.view.ny = H <= g.ah ? 0.5 : clamp(v.ny, g.ah / (2 * H), 1 - g.ah / (2 * H));
      }
    }
    this.layout();
    if (emit && this.onView) this.onView(this.getView());
  }

  /** Zoomen um einen Punkt (px, py relativ zur Fenstermitte). */
  zoomAt(zrelNew, px = 0, py = 0, emit = true) {
    const g = this.geom();
    const fx = this.view.nx + px / (g.ew * g.z);
    const fy = this.view.ny + py / (g.eh * g.z);
    const maxRel = Math.max(1.5, 4 / g.fit);
    const zr = clamp(zrelNew, 1, maxRel);
    const z2 = g.fit * zr;
    this.setView({ zrel: zr, nx: fx - px / (g.ew * z2), ny: fy - py / (g.eh * z2) }, emit);
  }

  /** Taste Z / Doppelklick: zwischen "ganzes Bild" und 100 % wechseln. */
  toggle100(clientX, clientY) {
    if (this.mode !== 'view') return;
    if (this.view.zrel > 1.001) {
      this.setView({ zrel: 1, nx: 0.5, ny: 0.5 }, true);
      return;
    }
    const g = this.geom();
    let zr = 1 / (window.devicePixelRatio || 1) / g.fit;
    if (zr <= 1.05) zr = 2;
    const [px, py] = this.pointFromClient(clientX, clientY);
    this.zoomAt(zr, px, py, true);
  }

  isZoomed() {
    return this.view.zrel > 1.001;
  }

  zoomPercent() {
    const g = this.geom();
    return Math.round(g.z * (window.devicePixelRatio || 1) * 100);
  }

  pointFromClient(clientX, clientY) {
    if (clientX == null) return [0, 0];
    const rc = this.stage.getBoundingClientRect();
    if (clientX < rc.left || clientX > rc.right || clientY < rc.top || clientY > rc.bottom) return [0, 0];
    const g = this.geom();
    return [clientX - rc.left - rc.width / 2 - g.ox, clientY - rc.top - rc.height / 2 - g.oy];
  }

  // ------------------------------------------------------------------ Zuschneiden

  enterCrop() {
    this.mode = 'crop';
    this.view = { zrel: 1, nx: 0.5, ny: 0.5 };
    this.draft = {
      crop: this.edits.crop ? { ...this.edits.crop } : { x: 0, y: 0, w: 1, h: 1 },
      angle: this.edits.angle || 0,
      aspect: this.edits.aspect || 'Frei',
      portrait: !!this.edits.portrait,
    };
    this.layout();
  }

  exitCrop() {
    this.mode = 'view';
    this.draft = null;
    this.cropHost.innerHTML = '';
    this.layout();
  }

  /** Seitenverhältnis als Verhältnis der normierten Breite zur normierten Höhe. */
  normRatio() {
    const found = ASPECTS.find((a) => a[0] === this.draft.aspect);
    let ar = found ? found[1] : 0;
    if (!ar) return 0;
    const g = this.geom();
    if (ar === -1) ar = g.ew / g.eh;
    if (this.draft.portrait) ar = 1 / ar; // "Hoch ⇄ Quer" tauscht das Verhältnis
    return ar * (g.eh / g.ew);
  }

  setAspect(label, portrait = this.draft.portrait) {
    this.draft.aspect = label;
    this.draft.portrait = portrait;
    const nr = this.normRatio();
    if (nr) {
      let w = 1;
      let h = w / nr;
      if (h > 1) {
        h = 1;
        w = nr;
      }
      w *= 0.94;
      h *= 0.94;
      this.draft.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    }
    this.layout();
  }

  setAngle(a) {
    this.draft.angle = a;
    this.layout();
  }

  resetCrop() {
    this.draft = { crop: { x: 0, y: 0, w: 1, h: 1 }, angle: 0, aspect: 'Frei', portrait: false };
    this.layout();
  }

  cropResult() {
    const c = this.draft.crop;
    const full = c.x < 0.002 && c.y < 0.002 && c.w > 0.996 && c.h > 0.996;
    return {
      crop: full ? null : { x: c.x, y: c.y, w: c.w, h: c.h },
      angle: Math.round(this.draft.angle * 10) / 10,
      aspect: this.draft.aspect,
      portrait: this.draft.portrait,
    };
  }

  // ------------------------------------------------------------------ Maus

  bind() {
    const st = this.stage;
    st.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'view' || !this.natW || !this.wheelZoom(e)) return;
        e.preventDefault();
        const [px, py] = this.pointFromClient(e.clientX, e.clientY);
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
        this.zoomAt(this.view.zrel * factor, px, py, true);
      },
      { passive: false }
    );
    st.addEventListener('dblclick', (e) => this.toggle100(e.clientX, e.clientY));
    st.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.natW) return;
      if (this.mode === 'crop') return this.cropPointer(e);
      if (!this.isZoomed()) return;
      e.preventDefault();
      st.setPointerCapture(e.pointerId);
      st.classList.add('grabbing');
      let lx = e.clientX;
      let ly = e.clientY;
      const move = (ev) => {
        const g = this.geom();
        const v = this.view;
        this.setView({ zrel: v.zrel, nx: v.nx - (ev.clientX - lx) / (g.ew * g.z), ny: v.ny - (ev.clientY - ly) / (g.eh * g.z) }, true);
        lx = ev.clientX;
        ly = ev.clientY;
      };
      const up = () => {
        st.classList.remove('grabbing');
        st.removeEventListener('pointermove', move);
        st.removeEventListener('pointerup', up);
        st.removeEventListener('pointercancel', up);
      };
      st.addEventListener('pointermove', move);
      st.addEventListener('pointerup', up);
      st.addEventListener('pointercancel', up);
    });
  }

  cropPointer(e) {
    const handle = e.target.dataset?.h;
    const box = this.cropHost.firstElementChild;
    if (!box || (!handle && !box.contains(e.target))) return;
    e.preventDefault();
    const st = this.stage;
    st.setPointerCapture(e.pointerId);
    const start = { ...this.draft.crop };
    const sx = e.clientX;
    const sy = e.clientY;
    const nr = this.normRatio();
    const min = 0.05;
    const move = (ev) => {
      const g = this.geom();
      const dx = (ev.clientX - sx) / (g.ew * g.z);
      const dy = (ev.clientY - sy) / (g.eh * g.z);
      let { x, y, w, h } = start;
      if (!handle) {
        x = clamp(start.x + dx, 0, 1 - w);
        y = clamp(start.y + dy, 0, 1 - h);
      } else {
        // gegenüberliegende Ecke bleibt fest
        const right = handle.includes('e');
        const bottom = handle.includes('s');
        const ax = right ? start.x : start.x + start.w;
        const ay = bottom ? start.y : start.y + start.h;
        let px = clamp((right ? start.x + start.w : start.x) + dx, 0, 1);
        let py = clamp((bottom ? start.y + start.h : start.y) + dy, 0, 1);
        w = Math.max(min, Math.abs(px - ax));
        h = Math.max(min, Math.abs(py - ay));
        if (nr) {
          // Seitenverhältnis einhalten
          if (w / h > nr) w = h * nr;
          else h = w / nr;
          const maxW = right ? 1 - ax : ax;
          const maxH = bottom ? 1 - ay : ay;
          if (w > maxW) { w = maxW; h = w / nr; }
          if (h > maxH) { h = maxH; w = h * nr; }
        } else {
          w = Math.min(w, right ? 1 - ax : ax);
          h = Math.min(h, bottom ? 1 - ay : ay);
        }
        x = right ? ax : ax - w;
        y = bottom ? ay : ay - h;
      }
      this.draft.crop = { x, y, w, h };
      this.layout();
    };
    const up = () => {
      st.removeEventListener('pointermove', move);
      st.removeEventListener('pointerup', up);
      st.removeEventListener('pointercancel', up);
    };
    st.addEventListener('pointermove', move);
    st.addEventListener('pointerup', up);
    st.addEventListener('pointercancel', up);
  }
}

// Läuft vor allem anderen: setzt das Farbschema, damit der Ladebildschirm (index.html)
// gleich hell oder dunkel erscheint. theme.js merkt sich die Wahl bei jedem Wechsel.
try {
  const t = localStorage.getItem('shotsort-theme') || 'dark';
  const dark = t === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : t !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch {
  /* ohne Speicher bleibt es dunkel */
}

// Hell / Dunkel / wie das System.

import { appWindow } from './api.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');
let current = 'dark';

export function applyTheme(theme) {
  current = theme;
  const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  // Titelleiste des Fensters passend einfärben
  appWindow()
    .setTheme(theme === 'system' ? null : theme)
    .catch(() => {});
}

media.addEventListener('change', () => {
  if (current === 'system') applyTheme('system');
});

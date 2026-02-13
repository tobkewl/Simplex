const WARM_GOLD_HEX = '#D4AF37';
const WARM_GOLD_RGB = '212, 175, 55';

function applyAccentTheme() {
  const root = document.documentElement;
  if (!root) return;
  root.style.setProperty('--accent-yellow', WARM_GOLD_HEX);
  root.style.setProperty('--accent-yellow-rgb', WARM_GOLD_RGB);
}

function setupAccentTheme() {
  const init = () => {
    applyAccentTheme();
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

module.exports = { setupAccentTheme };

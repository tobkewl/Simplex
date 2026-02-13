(function initNetworthOverlayPlaceholder() {
  const api = window.networthOverlayAPI;
  const closeButton = document.getElementById('btnClose');

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      if (api && typeof api.close === 'function') {
        api.close();
      } else {
        window.close();
      }
    });
  }
})();

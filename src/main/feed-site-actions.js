function toSafeStringLiteral(value) {
  return JSON.stringify(String(value ?? ''));
}

function buildRefreshItemScript(itemId) {
  const safeItemId = toSafeStringLiteral(itemId);
  return `
    (function() {
      const itemId = ${safeItemId};

      let resultRow = document.querySelector('[data-id="' + itemId + '"]');
      if (!resultRow) {
        const containers = ['.resultset', '.results', '[class*="result"]'];
        for (const container of containers) {
          const parent = document.querySelector(container);
          if (parent) {
            resultRow = parent.querySelector('[data-id="' + itemId + '"]');
            if (resultRow) break;
          }
        }
      }

      if (!resultRow) {
        return { success: false, reason: 'Result row not found' };
      }

      const errorSpan = resultRow.querySelector('span.error');
      if (errorSpan && errorSpan.textContent.includes('Item no longer available')) {
        return { success: true, available: false };
      }

      const refreshBtn = resultRow.querySelector('button.refresh, button[title="Refresh"]');
      if (!refreshBtn) {
        return { success: false, reason: 'Refresh button not found' };
      }

      refreshBtn.click();

      return new Promise((resolve) => {
        setTimeout(() => {
          const errorSpanAfter = resultRow.querySelector('span.error');
          if (errorSpanAfter && errorSpanAfter.textContent.includes('Item no longer available')) {
            resolve({ success: true, available: false });
          } else {
            resolve({ success: true, available: true });
          }
        }, 500);
      });
    })();
  `;
}

function buildHideoutClickScript(itemId) {
  const safeItemId = toSafeStringLiteral(itemId);
  return `
    (function() {
      const itemId = ${safeItemId};
      const allDataIds = Array.from(document.querySelectorAll('[data-id]')).map((el) => el.getAttribute('data-id'));

      let resultRow = document.querySelector('[data-id="' + itemId + '"]');
      if (!resultRow) {
        const containers = ['.resultset', '.results', '[class*="result"]'];
        for (const container of containers) {
          const parent = document.querySelector(container);
          if (parent) {
            resultRow = parent.querySelector('[data-id="' + itemId + '"]');
            if (resultRow) break;
          }
        }
      }

      if (!resultRow) {
        return { success: false, reason: 'Result row not found', debug: { foundIds: allDataIds.slice(0, 5) } };
      }

      const allButtons = Array.from(resultRow.querySelectorAll('button, [role="button"], a.button, .btn'));
      const selectors = [
        '.direct-btn',
        'button.direct-btn',
        'button[data-token]',
        '[data-token]',
        'button[title*="Visit" i]',
        'button[title*="Hideout" i]'
      ];

      let hideoutBtn = null;
      for (const sel of selectors) {
        hideoutBtn = resultRow.querySelector(sel);
        if (hideoutBtn) break;
      }

      if (!hideoutBtn) {
        return {
          success: false,
          reason: 'Hideout button not found in row',
          debug: { buttons: allButtons.map((b) => b.className).join(', ') }
        };
      }

      hideoutBtn.click();
      return { success: true, buttonText: hideoutBtn.textContent.trim() };
    })();
  `;
}

function buildWhisperClickScript(itemId) {
  const safeItemId = toSafeStringLiteral(itemId);
  return `
    (function() {
      const itemId = ${safeItemId};

      const selectors = [
        '[data-id="' + itemId + '"]',
        '#' + itemId,
        '.resultset [data-id="' + itemId + '"]'
      ];

      let resultRow = null;
      for (const sel of selectors) {
        resultRow = document.querySelector(sel);
        if (resultRow) break;
      }

      if (!resultRow) {
        return { success: false, reason: 'Result row not found' };
      }

      let whisperBtn = null;
      const directBtns = Array.from(resultRow.querySelectorAll('.direct-btn'));
      whisperBtn = directBtns.find((btn) => btn.textContent.toLowerCase().includes('whisper'));

      if (!whisperBtn) {
        whisperBtn = resultRow.querySelector('.whisper-btn, [data-clipboard-text], .whisper-button, button[title*="whisper" i], button[title*="copy" i]');
      }

      if (!whisperBtn) {
        return { success: false, reason: 'Whisper button not found in row' };
      }

      whisperBtn.click();
      return { success: true, buttonText: whisperBtn.textContent.trim() };
    })();
  `;
}

module.exports = {
  buildRefreshItemScript,
  buildHideoutClickScript,
  buildWhisperClickScript,
};

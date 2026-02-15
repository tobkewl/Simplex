function registerOverlaySiteActionsIpc({
  ipcMain,
  logger,
  getAllFeeds,
  getOverlayWindow,
  buildRefreshItemScript,
  buildHideoutClickScript,
  buildWhisperClickScript,
  ensurePoeScriptPath,
}) {
  // Refresh item on trade website and check if still available
  ipcMain.on('overlay:refreshItemOnSite', async (_event, itemId) => {
    logger.info('overlay:refreshItemOnSite', { itemId });

    const allFeeds = getAllFeeds();

    for (const feed of allFeeds) {
      try {
        const result = await feed.webContents.executeJavaScript(buildRefreshItemScript(itemId));

        if (result.success) {
          logger.info('overlay:refreshItemOnSite:success', { itemId, available: result.available });

          if (result.available === false) {
            const overlayWindow = getOverlayWindow();
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.webContents.send('poe-live:item-unavailable', itemId);
            }
          }
          return;
        }

        logger.warn('overlay:refreshItemOnSite:not-found-in-feed', { itemId, reason: result.reason });
      } catch (err) {
        logger.error('overlay:refreshItemOnSite:error', { itemId, error: String(err) });
      }
    }

    logger.error('overlay:refreshItemOnSite:failed', { itemId, reason: 'Not found in any feed window' });
  });

  // Click hideout button on trade website
  ipcMain.on('overlay:clickHideoutOnSite', async (_event, itemId) => {
    logger.info('overlay:clickHideoutOnSite', { itemId });

    const allFeeds = getAllFeeds();

    for (const feed of allFeeds) {
      try {
        const result = await feed.webContents.executeJavaScript(buildHideoutClickScript(itemId));

        if (result.success) {
          logger.info('overlay:clickHideoutOnSite:success', { itemId, feed: feed.id });
          return;
        }

        logger.warn('overlay:clickHideoutOnSite:not-found-in-feed', {
          itemId,
          feed: feed.id,
          reason: result.reason,
        });
      } catch (err) {
        logger.error('overlay:clickHideoutOnSite:error', { itemId, feed: feed.id, error: String(err) });
      }
    }

    logger.error('overlay:clickHideoutOnSite:failed', { itemId, reason: 'Not found in any feed window' });
  });

  // Click whisper button on trade website
  ipcMain.on('overlay:clickWhisperOnSite', async (_event, itemId) => {
    logger.info('overlay:clickWhisperOnSite', { itemId });

    const allFeeds = getAllFeeds();

    for (const feed of allFeeds) {
      try {
        const result = await feed.webContents.executeJavaScript(buildWhisperClickScript(itemId));

        if (result.success) {
          logger.info('overlay:clickWhisperOnSite:success', { itemId, feed: feed.id });
          return;
        }
      } catch (err) {
        logger.error('overlay:clickWhisperOnSite:error', { itemId, error: String(err) });
      }
    }

    logger.error('overlay:clickWhisperOnSite:failed', { itemId });
  });

  // Send text to game using a PowerShell helper
  let sendInProgress = false;
  ipcMain.on('overlay:sendToGame', async (_event, text) => {
    if (sendInProgress) {
      logger.warn('overlay:sendToGame:blocked', { reason: 'already-in-progress' });
      return;
    }

    sendInProgress = true;
    try {
      logger.info('overlay:sendToGame', { textLength: text ? text.length : 0 });

      const { clipboard } = require('electron');
      clipboard.writeText(text || '');

      const scriptPath = ensurePoeScriptPath();

      const { execFile } = require('child_process');
      logger.info('overlay:sendToGame:executing');
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { timeout: 5000 },
        (err, stdout, stderr) => {
          sendInProgress = false;

          if (err) {
            logger.error('overlay:sendToGame:failed', {
              error: String(err),
              stdout: stdout ? stdout.trim() : '',
              stderr: String(stderr),
            });
            return;
          }

          const output = String(stdout || '').trim();

          if (output.includes('SUCCESS')) {
            logger.info('overlay:sendToGame:success', { method: 'AttachThreadInput' });
          } else if (output.includes('ERROR:SENDINPUT_FAILED')) {
            logger.error('overlay:sendToGame:sendinput-failed', {
              reason: 'Elevation mismatch - run app as admin if PoE runs as admin',
              output,
            });
          } else if (output.includes('ERROR:NO_POE_WINDOW')) {
            logger.error('overlay:sendToGame:no-poe-window', { reason: 'POEWindowClass not found' });
          } else if (output.includes('ERROR:FOCUS_TIMEOUT')) {
            logger.error('overlay:sendToGame:focus-timeout', { reason: 'Failed to focus PoE within 100ms' });
          } else if (output.includes('FOUND:POE_WINDOW') || output.includes('FOCUS_OK') || output.includes('WARN:FOCUS_TIMEOUT')) {
            logger.warn('overlay:sendToGame:partial-success', { output });
          } else {
            logger.warn('overlay:sendToGame:unexpected-output', { output });
          }
        }
      );
    } catch (err) {
      logger.error('overlay:sendToGame:error', { error: String(err) });
      sendInProgress = false;
    }
  });
}

module.exports = {
  registerOverlaySiteActionsIpc,
};

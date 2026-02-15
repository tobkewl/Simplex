function registerBuildAndSettingsUtilityIpc({
  ipcMain,
  logger,
  dialog,
  fs,
  autoDetectClientLogPath,
  getSettings,
  saveSettings,
  broadcastSettingsUpdate,
  maybeShowLevelUpPopup,
  createManagementWindow,
  getManagementWindow,
  getActiveGuideState,
  setActiveGuideState,
}) {
  let passiveTreeCache = null;

  async function fetchPassiveTreeData() {
    const https = require('https');
    const url = 'https://www.pathofexile.com/passive-skill-tree';

    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        (res) => {
          let html = '';
          res.on('data', (chunk) => {
            html += chunk;
          });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const startMarker = 'var passiveSkillTreeData = ';
            const endMarker = '};\n            var opts = {';
            const startIdx = html.indexOf(startMarker);
            const endIdx = html.indexOf(endMarker, startIdx);
            if (startIdx === -1 || endIdx === -1) {
              return reject(new Error('Could not locate passiveSkillTreeData block in PoE HTML'));
            }

            const jsonText = html.slice(startIdx + startMarker.length, endIdx + 1).trim();
            try {
              const data = JSON.parse(jsonText);
              resolve(data);
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Timeout while fetching passive skill tree data'));
      });
    });
  }

  ipcMain.handle('build:simulateLevelUp', () => {
    const settings = getSettings();
    const current = Number.isFinite(settings.characterLevel) ? settings.characterLevel : 1;
    const nextLevel = Math.max(1, Math.min(100, Math.floor(current + 1)));
    settings.characterLevel = nextLevel;
    if (settings.buildLevelDetection === 'manual') {
      settings.buildManualLevel = nextLevel;
    }
    saveSettings(settings);
    broadcastSettingsUpdate({ characterLevel: nextLevel });
    maybeShowLevelUpPopup(nextLevel);
    return nextLevel;
  });

  ipcMain.handle('build:getActiveBuild', () => {
    const settings = getSettings();
    return settings?.activeBuild || null;
  });

  ipcMain.handle('build:saveBuild', (_event, build) => {
    const settings = getSettings();
    const nextBuild =
      build && typeof build === 'object'
        ? {
          id: typeof build.id === 'string' ? build.id : null,
          name: typeof build.name === 'string' ? build.name : null,
        }
        : null;
    settings.activeBuild = nextBuild;
    saveSettings(settings);
    broadcastSettingsUpdate({ activeBuild: nextBuild });
    return nextBuild;
  });

  ipcMain.handle('build:getActiveGuideState', () => {
    const memoryState = typeof getActiveGuideState === 'function' ? getActiveGuideState() : null;
    if (memoryState) return memoryState;
    const settings = getSettings();
    return settings?.activeGuideState || null;
  });

  ipcMain.handle('build:setActiveGuideState', (_event, state) => {
    const nextState = state && typeof state === 'object' ? state : null;
    if (typeof setActiveGuideState === 'function') {
      setActiveGuideState(nextState);
    }
    const settings = getSettings();
    settings.activeGuideState = nextState;
    saveSettings(settings);
    return { ok: true };
  });

  ipcMain.on('build:positionLevelPopup', () => {
    const managementWindow = getManagementWindow();
    if (!managementWindow || managementWindow.isDestroyed()) {
      createManagementWindow();
    } else {
      managementWindow.show();
    }
    const nextManagementWindow = getManagementWindow();
    try {
      if (nextManagementWindow && !nextManagementWindow.isDestroyed()) {
        nextManagementWindow.webContents.send('build:positionLevelPopup');
      }
    } catch {}
  });

  ipcMain.handle('build:getPassiveTree', async () => {
    try {
      if (passiveTreeCache) {
        return { success: true, data: passiveTreeCache };
      }
      const data = await fetchPassiveTreeData();
      passiveTreeCache = data;
      return { success: true, data };
    } catch (err) {
      logger.error('build:getPassiveTree:error', { error: String(err) });
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('settings:checkFileExists', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });

  ipcMain.handle('settings:autoDetectClientLog', async () => {
    const detected = autoDetectClientLogPath();
    if (detected) {
      logger.info('settings:autoDetectClientLog:found', { path: detected });
      return detected;
    }
    logger.info('settings:autoDetectClientLog:not-found');
    return null;
  });

  ipcMain.handle('settings:browseClientLog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Path of Exile Client.txt',
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });
}

function registerLiveOverlayBridgeIpc({
  ipcMain,
  shell,
  logger,
  getFeedMeta,
  getSettings,
  saveSettings,
  getManagementWindow,
  getOverlayWindow,
  getSettingsWindow,
  forwardToOverlay,
  isAllowedExternalUrl,
  setOverlayVisible,
  getOverlayVisible,
  updateOverlayMouse,
  getManagementAllowFocus,
  setManagementAllowFocus,
  applyOverlayLock,
  onTradeEventObserved,
}) {
  let lastResizeTime = 0;
  let lastWindowPosition = null;

  ipcMain.on('poe-live:raw', (_event, raw) => {
    forwardToOverlay('poe-live:raw', raw);
  });

  ipcMain.on('poe-live:new-items', (_event, items) => {
    onTradeEventObserved();
    try {
      logger.info('overlay:incoming', { count: Array.isArray(items) ? items.length : 0 });
    } catch {}

    const senderId = _event.sender.id;
    const meta = getFeedMeta().get(senderId) || {};
    const enrichedItems = Array.isArray(items)
      ? items.map((item) => ({
        ...item,
        feedId: meta.feedId || '',
        feedName: meta.feedName || '',
        feedUrl: meta.feedUrl || '',
      }))
      : items;

    const settings = getSettings();
    if (Array.isArray(items) && items.length > 0 && meta.feedId && settings.feeds) {
      const feed = settings.feeds.find((entry) => entry.id === meta.feedId);
      if (feed && !feed.icon && items[0].icon) {
        feed.icon = items[0].icon;
        saveSettings(settings);
        logger.info('management:feedIcon', { feedId: feed.id, icon: feed.icon });

        const managementWindow = getManagementWindow();
        if (managementWindow && !managementWindow.isDestroyed()) {
          managementWindow.webContents.send('management:feedIconUpdate', {
            feedId: feed.id,
            icon: feed.icon,
          });
        }
      }
    }

    forwardToOverlay('poe-live:new-items', enrichedItems);
  });

  ipcMain.on('poe-live:removed', (_event, ids) => {
    onTradeEventObserved();
    try {
      logger.info('overlay:removed', { count: Array.isArray(ids) ? ids.length : 0 });
    } catch {}
    forwardToOverlay('poe-live:removed', ids);
  });

  ipcMain.on('poe-live:rate-limited', () => {
    logger.warn('feed:rate-limited', { message: 'PoE API returned 429 - Too Many Requests' });
    forwardToOverlay('poe-live:rate-limited');
  });

  ipcMain.on('overlay:openExternal', (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      logger.warn('overlay:openExternal:blocked', { url });
      return;
    }
    shell.openExternal(url).catch((err) => {
      logger.error('overlay:openExternal:failed', { url, error: String(err) });
    });
  });

  ipcMain.on('management:setClickThrough', (_event, enabled) => {
    const managementWindow = getManagementWindow();
    if (managementWindow && !managementWindow.isDestroyed()) {
      try {
        managementWindow.setIgnoreMouseEvents(enabled, { forward: true });
        logger.debug('management:setClickThrough', { enabled });
      } catch (err) {
        logger.error('management:setClickThrough:error', { error: String(err) });
      }
    }
  });

  ipcMain.on('management:setFocusMode', (_event, enabled) => {
    setManagementAllowFocus(!!enabled);
    const managementWindow = getManagementWindow();
    if (managementWindow && !managementWindow.isDestroyed()) {
      try {
        managementWindow.setFocusable(getManagementAllowFocus());
      } catch (err) {
        logger.error('management:setFocusMode:focusable:error', { error: String(err) });
      }
      try {
        if (getManagementAllowFocus()) {
          managementWindow.focus();
        } else {
          managementWindow.blur();
        }
      } catch {}
    }
  });

  ipcMain.handle('overlay:getState', () => ({
    locked: !!getSettings().overlayLocked,
  }));

  ipcMain.on('overlay:setLocked', (_event, locked) => {
    const settings = getSettings();
    settings.overlayLocked = !!locked;
    saveSettings(settings);
    applyOverlayLock();

    const settingsWindow = getSettingsWindow();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:updated', settings);
    }
  });

  ipcMain.on('overlay:setVisible', (_event, visible) => {
    setOverlayVisible(!!visible);
    logger.info('overlay:setVisible', { visible: getOverlayVisible(), locked: getSettings().overlayLocked });
    updateOverlayMouse();

    const settingsWindow = getSettingsWindow();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('overlay:visibilityChanged', getOverlayVisible());
    }
  });

  ipcMain.handle('overlay:isVisible', () => {
    const overlayWindow = getOverlayWindow();
    return getOverlayVisible() && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
  });

  ipcMain.on('overlay:resize', (_event, size) => {
    const overlayWindow = getOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return;

    const { width, height } = size;
    const currentBounds = overlayWindow.getBounds();

    if (lastWindowPosition && (lastWindowPosition.x !== currentBounds.x || lastWindowPosition.y !== currentBounds.y)) {
      logger.info('overlay:resize - position changed', {
        from: lastWindowPosition,
        to: { x: currentBounds.x, y: currentBounds.y },
      });
    }
    lastWindowPosition = { x: currentBounds.x, y: currentBounds.y };

    const now = Date.now();
    if (now - lastResizeTime < 100) return;
    lastResizeTime = now;

    if (Math.abs(currentBounds.height - height) > 5 || Math.abs(currentBounds.width - width) > 5) {
      logger.info('overlay:resize', {
        from: { w: currentBounds.width, h: currentBounds.height },
        to: { w: width, h: height },
      });

      overlayWindow.setSize(width, height, false);
    }
  });

  ipcMain.on('overlay:minimize', () => {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.minimize();
    }
  });

  ipcMain.on('overlay:maximize', () => {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (overlayWindow.isMaximized()) {
        overlayWindow.unmaximize();
      } else {
        overlayWindow.maximize();
      }
    }
  });

  ipcMain.on('overlay:close', () => {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  });

  ipcMain.handle('overlay:isMaximized', () => {
    const overlayWindow = getOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return false;
    return overlayWindow.isMaximized();
  });
}

module.exports = {
  registerBuildAndSettingsUtilityIpc,
  registerLiveOverlayBridgeIpc,
};

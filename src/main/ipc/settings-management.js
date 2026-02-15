function broadcastSettingsToCoreWindows(settings, getOverlayWindow, getSettingsWindow, getManagementWindow) {
  const overlayWindow = getOverlayWindow();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:updated', settings);
  }

  const settingsWindow = getSettingsWindow();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:updated', settings);
  }

  const managementWindow = getManagementWindow();
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('settings:updated', settings);
  }
}

function registerSettingsAndManagementIpc({
  ipcMain,
  logger,
  getSettings,
  setSettings,
  disableAllLiveTracking,
  toggleLiveTrackingForActiveCharacter,
  isValidLiveFeedUrl,
  destroyAllFeeds,
  createFeedWindow,
  normalizeLiveFeedList,
  getFeedWindows,
  setFeedWindows,
  createFeedWindowFor,
  getStatus,
  saveSettings,
  broadcastSettingsUpdate,
  refreshGlobalShortcuts,
  getOverlayWindow,
  getSettingsWindow,
  getManagementWindow,
  showSettingsWindow,
  toggleSettingsWindow,
  getFeedMeta,
  refreshCurrentCharacterLiveTrackingState,
  ensureClientLogWatcher,
}) {
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('live-tracking:disable-all', async () => {
    try {
      return await disableAllLiveTracking();
    } catch (err) {
      logger.error('live-tracking:disable-all-failed', { error: String(err) });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('live-tracking:toggle-active-character', async (_event, options) => {
    try {
      return await toggleLiveTrackingForActiveCharacter(options || {});
    } catch (err) {
      logger.error('live-tracking:toggle-active-character-failed', { error: String(err) });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('settings:set', (_event, partial) => {
    let settings = getSettings();
    if (!partial || typeof partial !== 'object') return settings;

    let refreshClientWatcher = false;
    let refreshShortcuts = false;

    // Normalize clientLogPath: convert empty strings to null and trim whitespace
    if (partial.clientLogPath !== undefined) {
      if (typeof partial.clientLogPath === 'string') {
        partial.clientLogPath = partial.clientLogPath.trim() || null;
      } else if (partial.clientLogPath !== null) {
        // Invalid type, don't change it
        delete partial.clientLogPath;
      }
    }

    if (partial.buildQuickPreviewShortcut !== undefined) {
      if (typeof partial.buildQuickPreviewShortcut === 'string') {
        partial.buildQuickPreviewShortcut = partial.buildQuickPreviewShortcut.trim() || null;
        refreshShortcuts = true;
      } else if (partial.buildQuickPreviewShortcut === null) {
        refreshShortcuts = true;
      } else {
        delete partial.buildQuickPreviewShortcut;
      }
    }
    if (partial.openSettingsShortcut !== undefined) {
      if (typeof partial.openSettingsShortcut === 'string') {
        partial.openSettingsShortcut = partial.openSettingsShortcut.trim() || null;
        refreshShortcuts = true;
      } else if (partial.openSettingsShortcut === null) {
        refreshShortcuts = true;
      } else {
        delete partial.openSettingsShortcut;
      }
    }
    if (partial.buildQuickPreviewControllerCombo !== undefined) {
      if (typeof partial.buildQuickPreviewControllerCombo === 'string') {
        partial.buildQuickPreviewControllerCombo = partial.buildQuickPreviewControllerCombo.trim() || null;
      } else if (partial.buildQuickPreviewControllerCombo !== null) {
        delete partial.buildQuickPreviewControllerCombo;
      }
    }
    if (partial.buildQuickPreviewControllerEnabled !== undefined) {
      if (typeof partial.buildQuickPreviewControllerEnabled !== 'boolean') {
        delete partial.buildQuickPreviewControllerEnabled;
      }
    }
    if (partial.openSettingsControllerCombo !== undefined) {
      if (typeof partial.openSettingsControllerCombo === 'string') {
        partial.openSettingsControllerCombo = partial.openSettingsControllerCombo.trim() || null;
      } else if (partial.openSettingsControllerCombo !== null) {
        delete partial.openSettingsControllerCombo;
      }
    }
    if (partial.openSettingsControllerEnabled !== undefined) {
      if (typeof partial.openSettingsControllerEnabled !== 'boolean') {
        delete partial.openSettingsControllerEnabled;
      }
    }
    if (partial.controllerType !== undefined) {
      if (typeof partial.controllerType === 'string') {
        const normalized = partial.controllerType.trim().toLowerCase();
        if (['auto', 'xbox', 'playstation', 'nintendo', 'generic'].includes(normalized)) {
          partial.controllerType = normalized;
        } else {
          delete partial.controllerType;
        }
      } else {
        delete partial.controllerType;
      }
    }

    if (partial.liveUrl && typeof partial.liveUrl === 'string' && partial.liveUrl !== settings.liveUrl) {
      if (!isValidLiveFeedUrl(partial.liveUrl)) {
        logger.warn('settings:liveUrl-invalid', { url: partial.liveUrl });
        delete partial.liveUrl;
      }
    }
    if (partial.liveUrl && typeof partial.liveUrl === 'string' && partial.liveUrl !== settings.liveUrl) {
      logger.info('settings:liveUrl-change', { old: settings.liveUrl, new: partial.liveUrl });
      destroyAllFeeds();
      settings.liveUrl = partial.liveUrl;
      // Only create feed if live searches are enabled
      if (settings.liveSearchesEnabled !== false && settings.liveUrl) {
        createFeedWindow(settings.liveUrl);
      }
    }
    if (typeof partial.liveUrls !== 'undefined' && Array.isArray(partial.liveUrls)) {
      const wasEmpty = !settings.liveUrls || !settings.liveUrls.length;
      settings.liveUrls = partial.liveUrls.filter((u) => typeof u === 'string' && isValidLiveFeedUrl(u));
      if (wasEmpty && settings.liveUrls.length) {
        destroyAllFeeds();
        // Only create feeds if live searches are enabled
        if (settings.liveSearchesEnabled !== false) {
          for (const url of settings.liveUrls) createFeedWindow(url);
        }
      }
    }
    if (typeof partial.readOnly === 'boolean') settings.readOnly = partial.readOnly;
    if (typeof partial.overlayBounds === 'object') settings.overlayBounds = partial.overlayBounds;
    if (partial.clientLogPath !== undefined) {
      const oldPath = settings.clientLogPath;
      settings.clientLogPath = partial.clientLogPath;
      logger.info('settings:clientLogPath-changed', {
        old: oldPath,
        new: settings.clientLogPath,
      });
      if (oldPath !== settings.clientLogPath) {
        refreshClientWatcher = true;
      }
    }
    // Handle whispersEnabled toggle
    if (typeof partial.whispersEnabled === 'boolean') {
      settings.whispersEnabled = partial.whispersEnabled;
      refreshClientWatcher = true;
    }

    if (partial.buildLevelDetection === 'auto' || partial.buildLevelDetection === 'manual') {
      settings.buildLevelDetection = partial.buildLevelDetection;
      refreshClientWatcher = true;
      if (partial.buildLevelDetection === 'manual' && partial.characterLevel === undefined) {
        const fallbackLevel = settings.buildManualLevel || settings.characterLevel || 1;
        partial.characterLevel = fallbackLevel;
      }
    }

    if (typeof partial.buildManualLevel === 'number') {
      const clampedManual = Math.max(1, Math.min(100, Math.floor(partial.buildManualLevel)));
      partial.buildManualLevel = clampedManual;
      settings.buildManualLevel = clampedManual;
      if ((partial.buildLevelDetection || settings.buildLevelDetection) === 'manual') {
        partial.characterLevel = clampedManual;
      }
    }

    if (typeof partial.characterLevel === 'number') {
      partial.characterLevel = Math.max(1, Math.min(100, Math.floor(partial.characterLevel)));
    }
    // Handle liveSearchesEnabled toggle
    if (typeof partial.liveSearchesEnabled === 'boolean') {
      settings.liveSearchesEnabled = partial.liveSearchesEnabled;
      if (!settings.liveSearchesEnabled) {
        // Destroy all feeds if disabled
        destroyAllFeeds();
      } else {
        // Reconnect feeds if enabled
        const validFeeds = normalizeLiveFeedList(settings.feeds || []).filter((f) => !f.muted);
        const nextFeedWindows = validFeeds.map((feed) => createFeedWindowFor(feed.url, feed)).filter(Boolean);
        setFeedWindows(nextFeedWindows);
        const status = getStatus();
        status.activeFeeds = nextFeedWindows.length;
        status.lastConnectTs = Date.now();
      }
    }
    if (typeof partial.feeds !== 'undefined') {
      partial.feeds = normalizeLiveFeedList(partial.feeds || []);
    }
    if (typeof partial.buildGuideEnabled === 'boolean') {
      settings.buildGuideEnabled = partial.buildGuideEnabled;
      refreshClientWatcher = true;
    }
    if (partial.liveTrackingDefaultVisibility !== undefined) {
      partial.liveTrackingDefaultVisibility = partial.liveTrackingDefaultVisibility === 'public' ? 'public' : 'private';
    }
    if (partial.liveTrackingPending !== undefined || partial.liveTrackingByCharacter !== undefined) {
      refreshClientWatcher = true;
    }
    // Merge partial settings into full settings object
    // Note: clientLogPath is already normalized above, so it's safe to merge
    settings = { ...settings, ...partial };
    setSettings(settings);

    if (
      partial.liveTrackingByCharacter !== undefined ||
      partial.activeCharacterName !== undefined ||
      partial.activeCharacterLeague !== undefined ||
      partial.liveTrackingDefaultVisibility !== undefined
    ) {
      refreshCurrentCharacterLiveTrackingState();
    }

    // Ensure clientLogPath is properly set (should already be normalized, but double-check)
    if (partial.clientLogPath !== undefined) {
      settings.clientLogPath = partial.clientLogPath;
    }

    if (refreshClientWatcher) {
      ensureClientLogWatcher();
    }

    saveSettings(settings);
    logger.info('settings:save', { keys: Object.keys(partial || {}) });

    broadcastSettingsUpdate(partial);
    if (refreshShortcuts) refreshGlobalShortcuts();

    return settings;
  });

  ipcMain.on('settings:focusOverlay', () => {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.focus();
  });

  // Show Settings window on demand (used by management + button)
  ipcMain.on('settings:show', (_event, tab) => {
    showSettingsWindow(tab);
  });

  ipcMain.on('settings:toggle', (_event, tab) => {
    toggleSettingsWindow(tab);
  });

  ipcMain.on('settings:destroyAllFeeds', () => {
    destroyAllFeeds();
  });

  ipcMain.on('settings:createFeed', (_event, url) => {
    if (!isValidLiveFeedUrl(url)) {
      logger.warn('settings:createFeed:invalid-url', { url });
      return;
    }
    createFeedWindow(url);
  });

  // Management IPC handlers
  ipcMain.handle('management:updateFeed', async (_event, feedId, updates) => {
    const settings = getSettings();
    if (!settings.feeds || !Array.isArray(settings.feeds)) {
      settings.feeds = [];
    }

    const feedIndex = settings.feeds.findIndex((f) => f.id === feedId);
    if (feedIndex === -1) {
      logger.warn('management:updateFeed - feed not found', { feedId });
      return settings;
    }

    const feed = settings.feeds[feedIndex];
    const oldUrl = feed.url;
    const oldMuted = feed.muted;

    // Update feed properties
    if (updates.name !== undefined) feed.name = updates.name;
    if (updates.url !== undefined) {
      const nextUrl = typeof updates.url === 'string' ? updates.url.trim() : '';
      if (!isValidLiveFeedUrl(nextUrl)) {
        logger.warn('management:updateFeed:invalid-url', { feedId, url: updates.url });
        return settings;
      }
      feed.url = nextUrl;
    }
    if (updates.muted !== undefined) feed.muted = updates.muted;
    if (updates.icon !== undefined) feed.icon = updates.icon;

    saveSettings(settings);
    logger.info('management:updateFeed', { feedId, updates });

    // If URL changed or mute status changed, restart the feed
    if (oldUrl !== feed.url || oldMuted !== feed.muted) {
      // Find feed window by feedId
      const feedMeta = getFeedMeta();
      let feedWindowToUpdate = null;
      for (const [, meta] of feedMeta.entries()) {
        if (meta.feedId === feedId && meta.window && !meta.window.isDestroyed()) {
          feedWindowToUpdate = meta.window;
          break;
        }
      }

      // If muting: simply destroy/close the window (this deactivates the feed)
      if (feed.muted && !oldMuted && feedWindowToUpdate) {
        try {
          // Remove from feedWindows array before destroying
          const feedWindows = getFeedWindows();
          const index = feedWindows.indexOf(feedWindowToUpdate);
          if (index > -1) {
            feedWindows.splice(index, 1);
          }
          feedWindowToUpdate.destroy();
          logger.info('management:feed:muted', { feedId, name: feed.name });
        } catch (err) {
          logger.error('management:feed:mute:error', { feedId, error: String(err) });
        }
        // Clean up feedMeta
        for (const [id, meta] of feedMeta.entries()) {
          if (meta.feedId === feedId) {
            feedMeta.delete(id);
            break;
          }
        }
      }

      // If unmuting: create new window (this activates the feed)
      if (!feed.muted && oldMuted && isValidLiveFeedUrl(feed.url)) {
        createFeedWindowFor(feed.url, feed);
        logger.info('management:feed:unmuted', { feedId, name: feed.name });
      }

      // If URL changed (but not muted): destroy old and create new
      if (oldUrl !== feed.url && !feed.muted && feedWindowToUpdate) {
        try {
          // Remove from feedWindows array before destroying
          const feedWindows = getFeedWindows();
          const index = feedWindows.indexOf(feedWindowToUpdate);
          if (index > -1) {
            feedWindows.splice(index, 1);
          }
          feedWindowToUpdate.destroy();
        } catch {}
        // Clean up feedMeta
        for (const [id, meta] of feedMeta.entries()) {
          if (meta.feedId === feedId) {
            feedMeta.delete(id);
            break;
          }
        }
        // Create new window with new URL
        if (isValidLiveFeedUrl(feed.url)) {
          createFeedWindowFor(feed.url, feed);
        }
      }
    }

    setSettings(settings);
    broadcastSettingsToCoreWindows(settings, getOverlayWindow, getSettingsWindow, getManagementWindow);
    return settings;
  });

  ipcMain.handle('management:addFeed', async (_event, feed) => {
    const settings = getSettings();
    if (!settings.feeds || !Array.isArray(settings.feeds)) {
      settings.feeds = [];
    }

    const [normalizedFeed] = normalizeLiveFeedList([feed || {}]);
    if (!normalizedFeed) {
      logger.warn('management:addFeed:invalid-url', { feed });
      return settings;
    }

    settings.feeds.push(normalizedFeed);
    saveSettings(settings);
    logger.info('management:addFeed', { feedId: normalizedFeed.id, name: normalizedFeed.name });

    // Create feed window if not muted and URL is set
    if (!normalizedFeed.muted) {
      createFeedWindowFor(normalizedFeed.url, normalizedFeed);
    }

    setSettings(settings);
    broadcastSettingsToCoreWindows(settings, getOverlayWindow, getSettingsWindow, getManagementWindow);
    return settings;
  });

  ipcMain.handle('management:toggleAllFeedsMute', async () => {
    const settings = getSettings();
    if (!settings.feeds || !Array.isArray(settings.feeds)) {
      settings.feeds = [];
    }

    const allMuted = settings.feeds.length > 0 && settings.feeds.every((feed) => feed?.muted);
    const nextMuted = !allMuted;

    settings.feeds = settings.feeds.map((feed) => ({
      ...feed,
      muted: nextMuted,
    }));
    saveSettings(settings);
    logger.info('management:toggleAllFeedsMute', { count: settings.feeds.length, muted: nextMuted });

    if (nextMuted) {
      destroyAllFeeds();
    } else if (settings.liveSearchesEnabled !== false) {
      const normalizedFeeds = normalizeLiveFeedList(settings.feeds || []).filter((feed) => !feed.muted);
      const nextFeedWindows = normalizedFeeds.map((feed) => createFeedWindowFor(feed.url, feed)).filter(Boolean);
      setFeedWindows(nextFeedWindows);
      const status = getStatus();
      status.activeFeeds = nextFeedWindows.length;
      status.lastConnectTs = Date.now();
    }

    setSettings(settings);
    broadcastSettingsToCoreWindows(settings, getOverlayWindow, getSettingsWindow, getManagementWindow);
    return settings;
  });

  ipcMain.handle('management:deleteFeed', async (_event, feedId) => {
    const settings = getSettings();
    if (!settings.feeds || !Array.isArray(settings.feeds)) {
      settings.feeds = [];
    }

    const feedIndex = settings.feeds.findIndex((f) => f.id === feedId);
    if (feedIndex === -1) {
      logger.warn('management:deleteFeed - feed not found', { feedId });
      return settings;
    }

    const feed = settings.feeds[feedIndex];
    settings.feeds.splice(feedIndex, 1);
    saveSettings(settings);
    logger.info('management:deleteFeed', { feedId, name: feed.name });

    // Destroy feed window
    const feedMeta = getFeedMeta();
    const feedInfo = feedMeta.get(feed.url);
    if (feedInfo && feedInfo.window) {
      try {
        feedInfo.window.destroy();
      } catch {}
      feedMeta.delete(feed.url);
    }

    setSettings(settings);
    broadcastSettingsToCoreWindows(settings, getOverlayWindow, getSettingsWindow, getManagementWindow);
    return settings;
  });
}

module.exports = {
  registerSettingsAndManagementIpc,
};

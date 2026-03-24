function registerAppLifecycleHandlers({
  app,
  BrowserWindow,
  logger,
  globalShortcut,
  getSettings,
  saveSettings,
  flushDeferredState,
  setIsQuitting,
  getIsQuitting,
  createOverlayWindow,
  createSettingsWindow,
}) {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createSettingsWindow();
    }
  });

  app.on('before-quit', () => {
    setIsQuitting(true);
    try { globalShortcut.unregisterAll(); } catch {}
    try {
      if (typeof flushDeferredState === 'function') {
        flushDeferredState();
      }
    } catch (error) {
      logger.warn('app:before-quit:flush-deferred-state-failed', { error: String(error) });
    }
    const settings = getSettings();
    if (settings) {
      saveSettings(settings);
      logger.info('app:before-quit:saved-settings', { clientLogPath: settings.clientLogPath });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && getIsQuitting()) {
      app.quit();
    }
  });
}

module.exports = {
  registerAppLifecycleHandlers,
};

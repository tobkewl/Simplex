function registerAppLifecycleHandlers({
  app,
  BrowserWindow,
  logger,
  globalShortcut,
  getSettings,
  saveSettings,
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

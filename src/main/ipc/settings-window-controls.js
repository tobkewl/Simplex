function isWindowAvailable(win) {
  return Boolean(win && !win.isDestroyed());
}

function registerSettingsWindowControlsIpc({
  ipcMain,
  createLoginWindow,
  getLoginWindow,
  getSettingsWindow,
}) {
  ipcMain.on('settings:openLogin', () => {
    const loginWindow = getLoginWindow();
    if (!isWindowAvailable(loginWindow)) {
      createLoginWindow();
      return;
    }
    loginWindow.focus();
  });

  ipcMain.on('settings:minimize', () => {
    const settingsWindow = getSettingsWindow();
    if (isWindowAvailable(settingsWindow)) {
      settingsWindow.minimize();
    }
  });

  ipcMain.on('settings:maximize', () => {
    const settingsWindow = getSettingsWindow();
    if (!isWindowAvailable(settingsWindow)) return;
    if (settingsWindow.isMaximized()) {
      settingsWindow.unmaximize();
    } else {
      settingsWindow.maximize();
    }
  });

  ipcMain.handle('settings:isMaximized', () => {
    const settingsWindow = getSettingsWindow();
    if (!isWindowAvailable(settingsWindow)) return false;
    return settingsWindow.isMaximized();
  });

  ipcMain.on('settings:close', () => {
    const settingsWindow = getSettingsWindow();
    if (isWindowAvailable(settingsWindow)) {
      settingsWindow.hide();
    }
  });
}

module.exports = {
  registerSettingsWindowControlsIpc,
};

function registerRunSyncIpc({
  ipcMain,
  logger,
  getManagementWindow,
  getNetworthOverlayWindow,
}) {
  // Run timer events - forward from networth overlay to management window
  ipcMain.on('run:timerUpdate', (_event, data) => {
    const managementWindow = getManagementWindow();
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('run:timerUpdate', data);
    }
  });

  ipcMain.on('run:started', () => {
    const managementWindow = getManagementWindow();
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('run:started');
    }
  });

  ipcMain.on('run:ended', () => {
    const managementWindow = getManagementWindow();
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('run:ended');
    }
  });

  ipcMain.on('run:togglePause', () => {
    logger.debug('run:togglePause:forward:start');
    const networthOverlayWindow = getNetworthOverlayWindow();
    if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
      networthOverlayWindow.webContents.send('run:togglePause');
      logger.debug('run:togglePause:forward:sent');
    } else {
      logger.warn('run:togglePause:forward:overlay-unavailable');
    }
  });
}

module.exports = {
  registerRunSyncIpc,
};

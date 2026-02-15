const { screen } = require('electron');

function isWindowAvailable(win) {
  return Boolean(win && !win.isDestroyed());
}

function ensureWindow(createWindow, getWindow) {
  let win = getWindow();
  if (!isWindowAvailable(win)) {
    createWindow();
    win = getWindow();
  }
  return isWindowAvailable(win) ? win : null;
}

function showAndFocus(win) {
  win.show();
  win.focus();
}

function moveWindow(win, deltaX, deltaY) {
  const bounds = win.getBounds();
  win.setBounds({
    x: bounds.x + deltaX,
    y: bounds.y + deltaY,
    width: bounds.width,
    height: bounds.height,
  });
}

function registerWindowOverlayControlsIpc({
  ipcMain,
  BrowserWindow,
  createManagementWindow,
  getManagementWindow,
  createNetworthOverlayWindow,
  getNetworthOverlayWindow,
  createBuildOverlayWindow,
  getBuildOverlayWindow,
  createOverlayWindow,
  getOverlayWindow,
}) {
  let networthOverlayPreMaxBounds = null;
  let networthOverlayIsManuallyMaximized = false;
  let buildOverlayPreMaxBounds = null;
  let buildOverlayIsManuallyMaximized = false;

  ipcMain.on('management:show', () => {
    const win = ensureWindow(createManagementWindow, getManagementWindow);
    if (win) win.show();
  });

  const showNetworthOverlay = () => {
    const win = ensureWindow(createNetworthOverlayWindow, getNetworthOverlayWindow);
    if (win) showAndFocus(win);
  };

  ipcMain.on('networth:show', showNetworthOverlay);
  ipcMain.on('networth:showOverlay', showNetworthOverlay);

  ipcMain.on('networth:toggleOverlay', () => {
    const win = getNetworthOverlayWindow();
    if (isWindowAvailable(win) && win.isVisible()) {
      win.hide();
      return;
    }
    showNetworthOverlay();
  });

  ipcMain.handle('networth-overlay:isVisible', () => {
    const win = getNetworthOverlayWindow();
    return Boolean(isWindowAvailable(win) && win.isVisible());
  });

  ipcMain.on('networth-overlay:close', () => {
    const win = getNetworthOverlayWindow();
    if (isWindowAvailable(win)) {
      win.hide();
    }
  });

  ipcMain.on('networth-overlay:minimize', () => {
    const win = getNetworthOverlayWindow();
    if (isWindowAvailable(win)) {
      win.minimize();
    }
  });

  ipcMain.on('networth-overlay:moveWindow', (_event, deltaX, deltaY) => {
    const win = getNetworthOverlayWindow();
    if (isWindowAvailable(win)) {
      moveWindow(win, deltaX, deltaY);
    }
  });

  ipcMain.handle('networth:isMaximized', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      return Boolean(isWindowAvailable(win) && win.isMaximized());
    } catch {
      return false;
    }
  });

  ipcMain.on('networth:maximize', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!isWindowAvailable(win)) return;
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    } catch {}
  });

  ipcMain.handle('networth-overlay:isMaximized', () => {
    const win = getNetworthOverlayWindow();
    if (!isWindowAvailable(win)) return false;
    return win.isMaximized() || networthOverlayIsManuallyMaximized;
  });

  ipcMain.on('networth-overlay:maximize', () => {
    const win = getNetworthOverlayWindow();
    if (!isWindowAvailable(win)) return;

    const currentlyMaximized = win.isMaximized() || networthOverlayIsManuallyMaximized;
    if (currentlyMaximized) {
      win.unmaximize();
      if (networthOverlayPreMaxBounds) {
        win.setBounds(networthOverlayPreMaxBounds);
        networthOverlayPreMaxBounds = null;
      }
      networthOverlayIsManuallyMaximized = false;
      win.webContents.send('window-maximized', false);
      return;
    }

    networthOverlayPreMaxBounds = win.getBounds();
    win.maximize();
    setTimeout(() => {
      const nextWin = getNetworthOverlayWindow();
      if (!isWindowAvailable(nextWin) || nextWin.isMaximized()) return;
      const display = screen.getDisplayNearestPoint(nextWin.getBounds());
      nextWin.setBounds(display.workArea);
      networthOverlayIsManuallyMaximized = true;
      nextWin.webContents.send('window-maximized', true);
    }, 50);
  });

  ipcMain.on('build-overlay:close', () => {
    const win = getBuildOverlayWindow();
    if (isWindowAvailable(win)) {
      win.hide();
    }
  });

  ipcMain.on('build-overlay:minimize', () => {
    const win = getBuildOverlayWindow();
    if (isWindowAvailable(win)) {
      win.minimize();
    }
  });

  ipcMain.on('build-overlay:moveWindow', (_event, deltaX, deltaY) => {
    const win = getBuildOverlayWindow();
    if (isWindowAvailable(win)) {
      moveWindow(win, deltaX, deltaY);
    }
  });

  ipcMain.handle('build-overlay:isMaximized', () => {
    const win = getBuildOverlayWindow();
    if (!isWindowAvailable(win)) return false;
    return win.isMaximized() || buildOverlayIsManuallyMaximized;
  });

  ipcMain.on('build-overlay:maximize', () => {
    const win = getBuildOverlayWindow();
    if (!isWindowAvailable(win)) return;

    const currentlyMaximized = win.isMaximized() || buildOverlayIsManuallyMaximized;
    if (currentlyMaximized) {
      win.unmaximize();
      if (buildOverlayPreMaxBounds) {
        win.setBounds(buildOverlayPreMaxBounds);
        buildOverlayPreMaxBounds = null;
      }
      buildOverlayIsManuallyMaximized = false;
      win.webContents.send('window-maximized', false);
      return;
    }

    buildOverlayPreMaxBounds = win.getBounds();
    win.maximize();
    setTimeout(() => {
      const nextWin = getBuildOverlayWindow();
      if (!isWindowAvailable(nextWin) || nextWin.isMaximized()) return;
      const display = screen.getDisplayNearestPoint(nextWin.getBounds());
      nextWin.setBounds(display.workArea);
      buildOverlayIsManuallyMaximized = true;
      nextWin.webContents.send('window-maximized', true);
    }, 50);
  });

  const showBuildOverlay = () => {
    const win = ensureWindow(createBuildOverlayWindow, getBuildOverlayWindow);
    if (win) showAndFocus(win);
  };

  ipcMain.on('build:showOverlay', showBuildOverlay);

  ipcMain.on('build:toggleOverlay', () => {
    const win = getBuildOverlayWindow();
    if (isWindowAvailable(win) && win.isVisible()) {
      win.hide();
      return;
    }
    showBuildOverlay();
  });

  ipcMain.handle('build-overlay:isVisible', () => {
    const win = getBuildOverlayWindow();
    return Boolean(isWindowAvailable(win) && win.isVisible());
  });

  ipcMain.on('whispers:show', () => {
    const win = ensureWindow(createOverlayWindow, getOverlayWindow);
    if (win) win.show();
  });
}

module.exports = {
  registerWindowOverlayControlsIpc,
};

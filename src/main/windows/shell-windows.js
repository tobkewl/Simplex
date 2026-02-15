function loadAppIcon({ path, fs, nativeImage, baseDir }) {
  const iconPath = path.join(baseDir, 'assets', 'app-icon.ico');
  return fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
}

function createShellWindowFactories({
  BrowserWindow,
  path,
  fs,
  nativeImage,
  screen,
  logger,
  baseDir,
  getSettings,
  getIsQuitting,
  getManagementAllowFocus,
  getSettingsWindow,
  setSettingsWindow,
  getManagementWindow,
  setManagementWindow,
  getOverlayWindow,
}) {
  function createSettingsWindow() {
    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const settingsWindow = new BrowserWindow({
      width: 700,
      height: 600,
      frame: true,
      resizable: true,
      minWidth: 700,
      minHeight: 600,
      alwaysOnTop: true,
      backgroundColor: '#0f0f14',
      title: 'Simplex - Settings',
      icon: icon || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'settings-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    setSettingsWindow(settingsWindow);
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.setMenu(null);
    settingsWindow.loadFile(path.join(baseDir, 'renderer', 'settings.html'));
    logger.info('settings:open');

    settingsWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        settingsWindow.hide();
        const managementWindow = getManagementWindow();
        if (managementWindow && !managementWindow.isDestroyed()) {
          managementWindow.webContents.send('settings:windowClosed');
        }
      }
    });

    settingsWindow.on('show', () => {
      const win = getSettingsWindow();
      if (win && !win.isDestroyed()) {
        win.webContents
          .executeJavaScript(`
        new Promise((resolve) => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            window.addEventListener('load', resolve);
          }
        });
      `)
          .then(() => {
            win.webContents.send('settings:updated', getSettings());
            setTimeout(() => {
              win.webContents.send('settings:window-ready');
            }, 300);
            win.focus();
          })
          .catch(() => {
            win.webContents.send('settings:updated', getSettings());
            setTimeout(() => {
              win.webContents.send('settings:window-ready');
            }, 300);
            win.focus();
          });
      }

      const managementWindow = getManagementWindow();
      if (managementWindow && !managementWindow.isDestroyed()) {
        managementWindow.webContents.send('settings:windowOpened');
      }

      const overlayWindow = getOverlayWindow();
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('settings:windowOpened', null);
      }
    });

    settingsWindow.on('hide', () => {
      const managementWindow = getManagementWindow();
      if (managementWindow && !managementWindow.isDestroyed()) {
        managementWindow.webContents.send('settings:windowClosed');
      }
      const overlayWindow = getOverlayWindow();
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('settings:windowClosed');
      }
    });

    settingsWindow.on('maximize', () => {
      if (!settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:window-maximized', true);
      }
    });

    settingsWindow.on('unmaximize', () => {
      if (!settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:window-maximized', false);
      }
    });

    settingsWindow.webContents.once('did-finish-load', () => {
      if (!settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:updated', getSettings());
        setTimeout(() => {
          settingsWindow.webContents.send('settings:window-ready');
        }, 500);
      }
    });

    return settingsWindow;
  }

  function createManagementWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const managementWindow = new BrowserWindow({
      width: screenWidth,
      height: screenHeight,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      icon: icon || undefined,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'management-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    setManagementWindow(managementWindow);
    managementWindow.loadFile(path.join(baseDir, 'renderer', 'management.html'));
    managementWindow.setAlwaysOnTop(true, 'screen-saver');
    managementWindow.setIgnoreMouseEvents(true, { forward: true });
    managementWindow.show();
    logger.info('management:create');

    managementWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        managementWindow.hide();
      }
    });

    managementWindow.on('focus', () => {
      if (!getManagementAllowFocus()) {
        try { managementWindow.blur(); } catch {}
      }
    });

    managementWindow.on('show', () => {
      try { managementWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
    });

    return managementWindow;
  }

  return {
    createSettingsWindow,
    createManagementWindow,
  };
}

module.exports = {
  createShellWindowFactories,
};

function loadAppIcon({ path, fs, nativeImage, baseDir }) {
  const iconPath = path.join(baseDir, 'assets', 'app-icon.ico');
  return fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
}

function createOverlayWindowFactories({
  BrowserWindow,
  path,
  fs,
  nativeImage,
  logger,
  baseDir,
  getSettings,
  saveSettings,
  getIsQuitting,
  updateOverlayMouse,
  getOverlayWindow,
  setOverlayWindow,
  getNetworthOverlayWindow,
  setNetworthOverlayWindow,
  getBuildOverlayWindow,
  setBuildOverlayWindow,
}) {
  function createOverlayWindow() {
    const settings = getSettings();
    const bounds = (settings && settings.overlayBounds) || {};
    logger.info('overlay:create', { bounds });

    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const overlayWindow = new BrowserWindow({
      width: bounds.width || 428,
      height: 150,
      minHeight: 150,
      maxHeight: 800,
      x: bounds.x,
      y: bounds.y,
      frame: false,
      transparent: true,
      icon: icon || undefined,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: true,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'overlay-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    setOverlayWindow(overlayWindow);
    overlayWindow.loadFile(path.join(baseDir, 'renderer', 'overlay.html'));
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setIgnoreMouseEvents(false);

    const savePosition = () => {
      try {
        const activeOverlayWindow = getOverlayWindow();
        if (!activeOverlayWindow || activeOverlayWindow.isDestroyed()) return;
        const currentSettings = getSettings();
        const boundsData = activeOverlayWindow.getBounds();
        currentSettings.overlayBounds = { x: boundsData.x, y: boundsData.y, width: boundsData.width };
        saveSettings(currentSettings);
      } catch {}
    };

    overlayWindow.on('moved', savePosition);
    overlayWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        overlayWindow.hide();
      }
    });
    overlayWindow.on('focus', () => {
      try { overlayWindow.blur(); } catch {}
    });
    overlayWindow.on('show', () => {
      try { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
    });
    overlayWindow.on('maximize', () => {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('overlay:window-maximized', true);
      }
    });
    overlayWindow.on('unmaximize', () => {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('overlay:window-maximized', false);
      }
    });

    updateOverlayMouse();
    return overlayWindow;
  }

  function createNetworthOverlayWindow() {
    const settings = getSettings();
    const bounds = (settings && settings.networthOverlayBounds) || {};
    logger.info('networth-overlay:create', { bounds });

    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const networthOverlayWindow = new BrowserWindow({
      width: bounds.width || 800,
      height: bounds.height || 600,
      minWidth: 600,
      minHeight: 400,
      x: bounds.x,
      y: bounds.y,
      frame: true,
      transparent: false,
      icon: icon || undefined,
      alwaysOnTop: true,
      focusable: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'networth-overlay-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    setNetworthOverlayWindow(networthOverlayWindow);
    networthOverlayWindow.setMenuBarVisibility(false);
    networthOverlayWindow.setMenu(null);
    networthOverlayWindow.loadFile(path.join(baseDir, 'renderer', 'networth-overlay.html'));
    networthOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

    const savePosition = () => {
      try {
        const activeWindow = getNetworthOverlayWindow();
        if (!activeWindow || activeWindow.isDestroyed()) return;
        const currentSettings = getSettings();
        const boundsData = activeWindow.getBounds();
        currentSettings.networthOverlayBounds = {
          x: boundsData.x,
          y: boundsData.y,
          width: boundsData.width,
          height: boundsData.height,
        };
        saveSettings(currentSettings);
      } catch {}
    };

    networthOverlayWindow.on('moved', savePosition);
    networthOverlayWindow.on('resized', savePosition);
    networthOverlayWindow.on('maximize', () => {
      if (!networthOverlayWindow.isDestroyed()) {
        networthOverlayWindow.webContents.send('window-maximized', true);
      }
    });
    networthOverlayWindow.on('unmaximize', () => {
      if (!networthOverlayWindow.isDestroyed()) {
        networthOverlayWindow.webContents.send('window-maximized', false);
      }
    });
    networthOverlayWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        networthOverlayWindow.hide();
      }
    });

    logger.info('networth-overlay:created');
    return networthOverlayWindow;
  }

  function createNetworthWindow() {
    logger.warn('networth:create:deprecated', {
      message: 'createNetworthWindow is deprecated, use overlay version instead',
    });
    const networthOverlayWindow = getNetworthOverlayWindow();
    if (!networthOverlayWindow || networthOverlayWindow.isDestroyed()) {
      createNetworthOverlayWindow();
    } else {
      networthOverlayWindow.show();
      networthOverlayWindow.focus();
    }
  }

  function createBuildOverlayWindow(showWindow = true) {
    const settings = getSettings();
    const bounds = (settings && settings.buildOverlayBounds) || {};
    logger.info('build-overlay:create', { bounds });

    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const buildOverlayWindow = new BrowserWindow({
      width: bounds.width || 900,
      height: bounds.height || 700,
      minWidth: 700,
      minHeight: 500,
      x: bounds.x,
      y: bounds.y,
      frame: true,
      transparent: false,
      icon: icon || undefined,
      alwaysOnTop: true,
      focusable: true,
      skipTaskbar: true,
      hasShadow: true,
      resizable: true,
      show: showWindow,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'build-overlay-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    setBuildOverlayWindow(buildOverlayWindow);
    buildOverlayWindow.setMenuBarVisibility(false);
    buildOverlayWindow.setMenu(null);
    buildOverlayWindow.loadFile(path.join(baseDir, 'renderer', 'build-overlay.html')).catch((error) => {
      logger.error('build-overlay:load-failed', { error: String(error) });
    });

    buildOverlayWindow.webContents.on('did-finish-load', () => {
      logger.info('build-overlay:did-finish-load');
    });
    buildOverlayWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
      logger.error('build-overlay:did-fail-load', { code, description, validatedURL });
    });
    buildOverlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      logger.info('build-overlay:console', { level, message, line, sourceId });
    });

    buildOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

    const savePosition = () => {
      try {
        const activeWindow = getBuildOverlayWindow();
        if (!activeWindow || activeWindow.isDestroyed()) return;
        const currentSettings = getSettings();
        const boundsData = activeWindow.getBounds();
        currentSettings.buildOverlayBounds = {
          x: boundsData.x,
          y: boundsData.y,
          width: boundsData.width,
          height: boundsData.height,
        };
        saveSettings(currentSettings);
      } catch {}
    };

    buildOverlayWindow.on('moved', savePosition);
    buildOverlayWindow.on('resized', savePosition);
    buildOverlayWindow.on('maximize', () => {
      if (!buildOverlayWindow.isDestroyed()) {
        buildOverlayWindow.webContents.send('window-maximized', true);
      }
    });
    buildOverlayWindow.on('unmaximize', () => {
      if (!buildOverlayWindow.isDestroyed()) {
        buildOverlayWindow.webContents.send('window-maximized', false);
      }
    });
    buildOverlayWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        buildOverlayWindow.hide();
      }
    });

    logger.info('build-overlay:created');
    return buildOverlayWindow;
  }

  return {
    createOverlayWindow,
    createNetworthWindow,
    createNetworthOverlayWindow,
    createBuildOverlayWindow,
  };
}

module.exports = {
  createOverlayWindowFactories,
};

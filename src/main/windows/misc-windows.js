function loadAppIcon({ path, fs, nativeImage, baseDir }) {
  const iconPath = path.join(baseDir, 'assets', 'app-icon.ico');
  return fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
}

function createMiscWindowFactories({
  BrowserWindow,
  session,
  path,
  fs,
  nativeImage,
  logger,
  baseDir,
  partition,
  getSettings,
  saveSettings,
  getIsQuitting,
  getCountdownTimerWindow,
  setCountdownTimerWindow,
  getWelcomeWindow,
  setWelcomeWindow,
  getLoginWindow,
  setLoginWindow,
  getBuildManagerWindow,
  setBuildManagerWindow,
}) {
  function createCountdownTimerWindow() {
    const currentWindow = getCountdownTimerWindow();
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.show();
      return;
    }

    const settings = getSettings();
    const bounds = (settings && settings.countdownTimerBounds) || { x: 100, y: 100 };
    logger.info('countdown-timer:create', { bounds });

    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const countdownTimerWindow = new BrowserWindow({
      width: 200,
      height: 50,
      x: bounds.x,
      y: bounds.y,
      frame: false,
      transparent: true,
      icon: icon || undefined,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'countdown-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    setCountdownTimerWindow(countdownTimerWindow);
    countdownTimerWindow.loadFile(path.join(baseDir, 'renderer', 'countdown-timer.html'));
    countdownTimerWindow.setAlwaysOnTop(true, 'screen-saver');

    const savePosition = () => {
      try {
        const activeWindow = getCountdownTimerWindow();
        if (!activeWindow || activeWindow.isDestroyed()) return;
        const currentSettings = getSettings();
        const boundsData = activeWindow.getBounds();
        currentSettings.countdownTimerBounds = { x: boundsData.x, y: boundsData.y };
        saveSettings(currentSettings);
      } catch {}
    };

    countdownTimerWindow.on('moved', savePosition);
    countdownTimerWindow.on('close', () => {
      setCountdownTimerWindow(null);
    });

    logger.info('countdown-timer:created');
  }

  function hideCountdownTimerWindow() {
    const countdownTimerWindow = getCountdownTimerWindow();
    if (countdownTimerWindow && !countdownTimerWindow.isDestroyed()) {
      countdownTimerWindow.close();
      setCountdownTimerWindow(null);
    }
  }

  function createWelcomeWindow() {
    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const welcomeWindow = new BrowserWindow({
      width: 800,
      height: 700,
      frame: true,
      resizable: false,
      alwaysOnTop: true,
      backgroundColor: '#0f0f14',
      title: 'Welcome to Simplex',
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

    setWelcomeWindow(welcomeWindow);
    welcomeWindow.setMenuBarVisibility(false);
    welcomeWindow.setMenu(null);
    welcomeWindow.loadFile(path.join(baseDir, 'renderer', 'welcome.html'));
    logger.info('welcome:open');

    welcomeWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        welcomeWindow.hide();
      }
    });

    welcomeWindow.on('closed', () => {
      const settings = getSettings();
      settings.tutorialCompleted = true;
      saveSettings(settings);
      setWelcomeWindow(null);
    });
  }

  function createLoginWindow() {
    const sess = session.fromPartition(partition);
    const loginWindow = new BrowserWindow({
      width: 900,
      height: 800,
      title: 'Login to pathofexile.com',
      webPreferences: {
        session: sess,
      },
    });

    setLoginWindow(loginWindow);
    loginWindow.loadURL('https://www.pathofexile.com/login');
    logger.info('login:open');
    loginWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        loginWindow.hide();
      }
    });
  }

  function createBuildManagerWindow() {
    const currentWindow = getBuildManagerWindow();
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.show();
      currentWindow.focus();
      return currentWindow;
    }

    const settings = getSettings();
    const bounds = (settings && settings.buildManagerBounds) || {};
    logger.info('build-manager:create', { bounds });

    const icon = loadAppIcon({ path, fs, nativeImage, baseDir });
    const buildManagerWindow = new BrowserWindow({
      width: bounds.width || 1200,
      height: bounds.height || 820,
      minWidth: 900,
      minHeight: 600,
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
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(baseDir, 'preload', 'build-manager-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    setBuildManagerWindow(buildManagerWindow);
    buildManagerWindow.setMenuBarVisibility(false);
    buildManagerWindow.setMenu(null);
    buildManagerWindow.loadFile(path.join(baseDir, 'renderer', 'build-manager.html')).catch((error) => {
      logger.error('build-manager:load-failed', { error: String(error) });
    });
    buildManagerWindow.setAlwaysOnTop(true, 'screen-saver');

    const savePosition = () => {
      try {
        const activeWindow = getBuildManagerWindow();
        if (!activeWindow || activeWindow.isDestroyed()) return;
        const currentSettings = getSettings();
        const boundsData = activeWindow.getBounds();
        currentSettings.buildManagerBounds = {
          x: boundsData.x,
          y: boundsData.y,
          width: boundsData.width,
          height: boundsData.height,
        };
        saveSettings(currentSettings);
      } catch {}
    };

    buildManagerWindow.on('moved', savePosition);
    buildManagerWindow.on('resized', savePosition);
    buildManagerWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault();
        buildManagerWindow.hide();
      }
    });
    buildManagerWindow.on('closed', () => {
      setBuildManagerWindow(null);
    });

    logger.info('build-manager:created');
    return buildManagerWindow;
  }

  return {
    createCountdownTimerWindow,
    hideCountdownTimerWindow,
    createWelcomeWindow,
    createLoginWindow,
    createBuildManagerWindow,
  };
}

module.exports = {
  createMiscWindowFactories,
};

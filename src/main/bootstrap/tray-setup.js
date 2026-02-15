function setupTray({
  Tray,
  Menu,
  nativeImage,
  path,
  fs,
  logger,
  baseDir,
  app,
  getSettings,
  saveSettings,
  createSettingsWindow,
  getSettingsWindow,
  createWelcomeWindow,
  getWelcomeWindow,
  createBuildOverlayWindow,
  getBuildOverlayWindow,
  createManagementWindow,
  getManagementWindow,
  openFeedbackModal,
  setIsQuitting,
}) {
  logger.info('tray:create:start');

  const icoPath = path.join(baseDir, 'assets', 'tray-icon.ico');
  const pngPath = path.join(baseDir, 'assets', 'tray-icon.png');
  const png2xPath = path.join(baseDir, 'assets', 'tray-icon@2x.png');
  logger.info('tray:icon-paths', {
    icoPath,
    pngPath,
    png2xPath,
    existsICO: fs.existsSync(icoPath),
    existsPNG: fs.existsSync(pngPath),
    existsPNG2x: fs.existsSync(png2xPath),
  });

  let img = null;

  if (fs.existsSync(pngPath)) {
    try {
      logger.info('tray:trying-png');
      const base = nativeImage.createEmpty();
      try {
        const b1 = fs.readFileSync(pngPath);
        base.addRepresentation({ scaleFactor: 1.0, width: 16, height: 16, buffer: b1 });
      } catch (e) {
        logger.warn('tray:add-rep:1x:failed', { error: String(e) });
      }

      if (fs.existsSync(png2xPath)) {
        try {
          const b2 = fs.readFileSync(png2xPath);
          base.addRepresentation({ scaleFactor: 2.0, width: 32, height: 32, buffer: b2 });
        } catch (e) {
          logger.warn('tray:add-rep:2x:failed', { error: String(e) });
        }
      }

      img = base;
      logger.info('tray:png-result', { isEmpty: img.isEmpty(), size: img.getSize() });
    } catch (e) {
      logger.warn('tray:png-build:failed', { error: String(e) });
    }
  }

  if ((!img || img.isEmpty()) && fs.existsSync(icoPath)) {
    logger.info('tray:trying-ico');
    img = nativeImage.createFromPath(icoPath);
    logger.info('tray:ico-result', { isEmpty: img.isEmpty(), size: img.getSize() });

    if (!img.isEmpty()) {
      const size = img.getSize();
      if (size.width !== 16 || size.height !== 16) {
        logger.info('tray:resizing-ico', { from: size, to: { width: 16, height: 16 } });
        img = img.resize({ width: 16, height: 16, quality: 'best' });
      }
    }
  }

  if (!img || img.isEmpty()) {
    logger.warn('tray:icon-load-failed-using-fallback');
    const workingBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const workingImg = nativeImage.createFromDataURL(workingBase64);
    if (!workingImg.isEmpty()) {
      img = workingImg.resize({ width: 16, height: 16 });
      logger.info('tray:fallback-icon-created');
    }
  }

  if (!img || img.isEmpty()) {
    logger.error('tray:no-icon-available');
    throw new Error('Cannot create tray icon - no icon available');
  }

  const tray = new Tray(img);
  tray.setToolTip('Simplex');
  logger.info('tray:created-successfully', { size: img.getSize() });

  const menu = Menu.buildFromTemplate([
    {
      label: 'Settings',
      click: () => {
        const settingsWindow = getSettingsWindow();
        if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
        else settingsWindow.show();
      },
    },
    {
      label: 'Welcome / Tutorial',
      click: () => {
        try {
          const settings = getSettings();
          settings.tutorialCompleted = false;
          saveSettings(settings);
        } catch (err) {
          logger.warn('welcome:reset:failed', { error: String(err) });
        }
        let welcomeWindow = getWelcomeWindow();
        if (!welcomeWindow || welcomeWindow.isDestroyed()) {
          createWelcomeWindow();
          welcomeWindow = getWelcomeWindow();
        }
        if (welcomeWindow && !welcomeWindow.isDestroyed()) {
          welcomeWindow.show();
          welcomeWindow.focus();
        }
      },
    },
    { label: 'Stash (Under Construction)', enabled: false },
    {
      label: 'Build',
      click: () => {
        const buildOverlayWindow = getBuildOverlayWindow();
        if (!buildOverlayWindow || buildOverlayWindow.isDestroyed()) createBuildOverlayWindow();
        else {
          buildOverlayWindow.show();
          buildOverlayWindow.focus();
        }
      },
    },
    {
      label: 'Live Feeds',
      click: () => {
        const managementWindow = getManagementWindow();
        if (!managementWindow || managementWindow.isDestroyed()) {
          createManagementWindow();
        } else {
          managementWindow.show();
        }
        const nextManagementWindow = getManagementWindow();
        try {
          if (nextManagementWindow && !nextManagementWindow.isDestroyed()) {
            nextManagementWindow.webContents.send('management:forceOpen');
          }
        } catch {}
      },
    },
    { type: 'separator' },
    { label: 'Report a bug', click: () => openFeedbackModal('bug') },
    { label: 'Request a feature', click: () => openFeedbackModal('feature') },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        setIsQuitting(true);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    const settingsWindow = getSettingsWindow();
    if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
    else settingsWindow.show();

    const nextSettingsWindow = getSettingsWindow();
    if (nextSettingsWindow && !nextSettingsWindow.isDestroyed()) {
      nextSettingsWindow.focus();
    }
  });

  logger.info('tray:ready');
  return tray;
}

module.exports = {
  setupTray,
};

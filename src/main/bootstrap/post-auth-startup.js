function runPostAuthStartup({
  app,
  session,
  partition,
  userAgentFallback,
  path,
  fs,
  nativeImage,
  logger,
  baseDir,
  loadSettings,
  isNewInstallation,
  refreshCurrentCharacterLiveTrackingState,
  setActiveGuideState,
  restoreLiveTrackingOnStartup,
  refreshCharacterInfoCache,
  createBuildOverlayWindow,
  autoDetectClientLogPath,
  saveSettings,
  writePoeScript,
  createOverlayWindow,
  createManagementWindow,
  refreshGlobalShortcuts,
  createWelcomeWindow,
  getWelcomeWindow,
  ensureClientLogWatcher,
  getOverlayWindow,
  normalizeLiveFeedList,
  createFeedWindowFor,
  setFeedWindows,
  getStatus,
}) {
  const settings = loadSettings();
  refreshCurrentCharacterLiveTrackingState();
  const isFirstRun = isNewInstallation();
  setActiveGuideState(settings.activeGuideState || null);

  void restoreLiveTrackingOnStartup();
  void refreshCharacterInfoCache();

  if (settings?.activeBuild?.id) {
    try {
      createBuildOverlayWindow(false);
      logger.info('build-overlay:background-worker-started', { buildId: settings.activeBuild.id });
    } catch (err) {
      logger.warn('build-overlay:background-worker-failed', { error: String(err) });
    }
  }

  if (!settings.clientLogPath) {
    const detected = autoDetectClientLogPath();
    if (detected) {
      settings.clientLogPath = detected;
      saveSettings(settings);
      logger.info('settings:autoDetectClientLog:startup-found', { path: detected });
    }
  }

  try {
    const iconPath = path.join(baseDir, 'assets', 'app-icon.ico');
    logger.info('app:icon-loading', { path: iconPath, exists: fs.existsSync(iconPath) });
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        if (typeof app.setAppIcon === 'function') {
          app.setAppIcon(icon);
          logger.info('app:icon-set', { path: iconPath, size: icon.getSize() });
        } else {
          logger.info('app:icon-skip', { reason: 'app.setAppIcon unsupported on this platform/runtime' });
        }
      } else {
        logger.warn('app:icon-empty', { path: iconPath });
      }
    } else {
      logger.warn('app:icon-not-found', { path: iconPath });
    }
  } catch (err) {
    logger.warn('app:icon-set-failed', { error: String(err) });
  }

  try { writePoeScript(); } catch {}
  try { app.userAgentFallback = userAgentFallback; } catch {}
  try { session.fromPartition(partition).setUserAgent(userAgentFallback); } catch {}

  createOverlayWindow();
  createManagementWindow();
  refreshGlobalShortcuts();

  const showWelcomeAlways = process.env.NODE_ENV === 'development' || process.env.SHOW_WELCOME === 'true';
  const shouldShowWelcome = showWelcomeAlways || isFirstRun || settings.tutorialCompleted === false;

  logger.info('welcome:check', {
    isNewInstallation: isFirstRun,
    tutorialCompleted: settings.tutorialCompleted,
    shouldShow: shouldShowWelcome,
    showAlways: showWelcomeAlways,
  });

  if (shouldShowWelcome) {
    logger.info('welcome:will-show');
    setTimeout(() => {
      createWelcomeWindow();
      const welcomeWindow = getWelcomeWindow();
      if (welcomeWindow && !welcomeWindow.isDestroyed()) {
        welcomeWindow.show();
      }
    }, 500);
  } else {
    logger.info('welcome:skipped', { reason: 'tutorial already completed' });
  }

  ensureClientLogWatcher();
  logger.info('app:ready');

  try {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        try { logger.debug('overlay:console', { level, message, line, sourceId }); } catch {}
      });
    }
  } catch {}

  try {
    if (settings.liveSearchesEnabled !== false) {
      const validFeeds = normalizeLiveFeedList(settings.feeds || []).filter((feed) => !feed.muted);
      if (validFeeds.length > 0) {
        logger.info('app:auto-connect:start', { count: validFeeds.length });
        const nextFeedWindows = validFeeds
          .map((feed) => createFeedWindowFor(feed.url, feed))
          .filter(Boolean);
        setFeedWindows(nextFeedWindows);

        const status = getStatus();
        status.activeFeeds = nextFeedWindows.length;
        status.lastConnectTs = Date.now();
        logger.info('app:auto-connect:done', { count: status.activeFeeds });
      }
    }
  } catch (err) {
    logger.error('app:auto-connect:failed', { error: String(err) });
  }

  try {
    const sess = session.fromPartition(partition);
    sess.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'notifications') return callback(false);
      if (permission === 'geolocation') return callback(false);
      callback(false);
    });
  } catch {}

  return { settings, isFirstRun };
}

module.exports = {
  runPostAuthStartup,
};

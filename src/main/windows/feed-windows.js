function createFeedWindowFactories({
  BrowserWindow,
  session,
  path,
  logger,
  partition,
  baseDir,
  isValidLiveFeedUrl,
  feedMeta,
  getFeedWindow,
  setFeedWindow,
  getFeedWindows,
  setFeedWindows,
}) {
  function attachFeedWindowDiagnostics(win) {
    try {
      const wc = win.webContents;
      wc.on('console-message', (_event, level, message, line, sourceId) => {
        try { logger.debug('feed:console', { id: wc.id, level, message, line, sourceId }); } catch {}
      });
      wc.on('did-start-navigation', (_event, url) => {
        logger.info('feed:navigate', { id: wc.id, url });
      });
      wc.on('did-finish-load', () => {
        logger.info('feed:loaded', { id: wc.id });
      });
    } catch {}
  }

  function createWindowForLiveUrl(normalizedUrl) {
    const sess = session.fromPartition(partition);
    return new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        session: sess,
        preload: path.join(baseDir, 'preload', 'live-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        backgroundThrottling: false,
        additionalArguments: [`--poe-live-url=${encodeURIComponent(normalizedUrl)}`],
      },
    });
  }

  function trackFeedWindow(win, { resetPrimaryOnClose = false } = {}) {
    const current = getFeedWindows();
    if (!current.includes(win)) {
      setFeedWindows([...current, win]);
    }

    win.on('closed', () => {
      const next = getFeedWindows().filter((entry) => entry !== win);
      setFeedWindows(next);
      try {
        for (const [key, meta] of feedMeta.entries()) {
          if (meta?.window === win) {
            feedMeta.delete(key);
          }
        }
      } catch {}
      if (resetPrimaryOnClose && getFeedWindow() === win) {
        setFeedWindow(null);
      }
    });
  }

  function createFeedWindow(liveUrl, feedInfo = {}) {
    const normalizedUrl = typeof liveUrl === 'string' ? liveUrl.trim() : '';
    if (!isValidLiveFeedUrl(normalizedUrl)) {
      logger.warn('feed:create-single:blocked-invalid-url', { liveUrl });
      return null;
    }

    logger.info('feed:create-single:start', { liveUrl: normalizedUrl, feedName: feedInfo.name });
    const win = createWindowForLiveUrl(normalizedUrl);
    setFeedWindow(win);

    win.loadURL(normalizedUrl);
    try { win.webContents.setAudioMuted(true); } catch {}
    feedMeta.set(feedInfo.url || normalizedUrl, {
      liveUrl: normalizedUrl,
      feedId: feedInfo.id || '',
      feedName: feedInfo.name || '',
      feedUrl: feedInfo.url || normalizedUrl,
      window: win,
    });
    attachFeedWindowDiagnostics(win);
    trackFeedWindow(win, { resetPrimaryOnClose: true });

    logger.info('feed:create-single:done', { id: win.webContents.id });
    return win;
  }

  function createFeedWindowFor(liveUrl, feedInfo = {}) {
    const normalizedUrl = typeof liveUrl === 'string' ? liveUrl.trim() : '';
    if (!isValidLiveFeedUrl(normalizedUrl)) {
      logger.warn('feed:create:blocked-invalid-url', { liveUrl, feedName: feedInfo.name });
      return null;
    }

    logger.info('feed:create:start', { liveUrl: normalizedUrl, feedName: feedInfo.name });
    const win = createWindowForLiveUrl(normalizedUrl);

    win.loadURL(normalizedUrl);
    try { win.webContents.setAudioMuted(true); } catch {}
    feedMeta.set(feedInfo.url || normalizedUrl, {
      liveUrl: normalizedUrl,
      feedId: feedInfo.id || '',
      feedName: feedInfo.name || '',
      feedUrl: feedInfo.url || normalizedUrl,
      window: win,
    });
    attachFeedWindowDiagnostics(win);
    trackFeedWindow(win, { resetPrimaryOnClose: false });

    logger.info('feed:create:done', { id: win.webContents.id });
    return win;
  }

  return {
    createFeedWindow,
    createFeedWindowFor,
  };
}

module.exports = {
  createFeedWindowFactories,
};

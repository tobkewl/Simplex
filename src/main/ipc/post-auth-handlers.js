function registerApiClientHandlers({
  ipcMain,
  logger,
  getApiClient,
}) {
  ipcMain.handle('api:get-builds', async () => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const data = await apiClient.getBuilds();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-builds:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-build', async (_event, buildId) => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const data = await apiClient.getBuild(buildId);
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-build:error', { buildId, error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-followed-guides', async () => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const data = await apiClient.getFollowedGuides();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-followed-guides:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-public-live-builds', async () => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const data = await apiClient.getPublicLiveBuilds();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-public-live-builds:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-public-guides', async () => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const data = await apiClient.getPublicGuides();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-public-guides:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:set-guide-follow', async (_event, payload) => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const buildId = typeof payload?.buildId === 'string' ? payload.buildId : null;
      const follow = payload?.follow !== false;
      if (!buildId) return { success: false, error: 'buildId is required' };
      const data = await apiClient.setGuideFollow(buildId, follow);
      return { success: true, data };
    } catch (error) {
      logger.error('api:set-guide-follow:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-gear-items', async (_event, slugs) => {
    try {
      const apiClient = getApiClient();
      if (!apiClient) return { success: false, error: 'API client not initialized' };
      const data = await apiClient.getGearItems(slugs || []);
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-gear-items:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-poe-oauth-status', async () => {
    try {
      const apiClient = getApiClient();
      if (!apiClient || typeof apiClient.getPoeOAuthStatus !== 'function') {
        return { authorized: false, message: 'API client not initialized' };
      }
      return await apiClient.getPoeOAuthStatus();
    } catch (err) {
      logger.error('api:get-poe-oauth-status:error', { error: String(err) });
      return { authorized: false, message: `Error checking status: ${String(err)}` };
    }
  });
}

function registerPostAuthIpcHandlers({
  ipcMain,
  BrowserWindow,
  session,
  shell,
  app,
  path,
  partition,
  logger,
  getApiClient,
  createBuildManagerWindow,
  getSettings,
  saveSettings,
  getWelcomeWindow,
  isValidLiveFeedUrl,
  destroyAllFeeds,
  createFeedWindow,
  createFeedWindowFor,
  normalizeLiveFeedList,
  setFeedWindow,
  setFeedWindows,
  getStatus,
  isAllowedExternalUrl,
  resolvePublicBaseUrl,
  submitFeedback,
}) {
  registerApiClientHandlers({
    ipcMain,
    logger,
    getApiClient,
  });

  ipcMain.on('open-build-manager', () => {
    createBuildManagerWindow();
  });

  ipcMain.on('app:relaunch', () => {
    try {
      app.relaunch();
      app.exit(0);
    } catch (err) {
      logger.error('app:relaunch:error', { error: String(err) });
    }
  });

  ipcMain.on('welcome:close', () => {
    const welcomeWindow = getWelcomeWindow();
    if (!welcomeWindow || welcomeWindow.isDestroyed()) return;
    try {
      const settings = getSettings();
      settings.tutorialCompleted = true;
      saveSettings(settings);
    } catch (err) {
      logger.warn('welcome:complete:failed', { error: String(err) });
    }
    welcomeWindow.setAlwaysOnTop(false);
    welcomeWindow.close();
  });

  ipcMain.on('settings:connectFeed', (_event, url) => {
    const settings = getSettings();
    if (settings.liveSearchesEnabled === false) {
      logger.info('feed:connect:skipped', { reason: 'liveSearchesEnabled is false' });
      return;
    }
    if (!isValidLiveFeedUrl(url)) {
      logger.warn('feed:connect:single:invalid-url', { url });
      return;
    }
    destroyAllFeeds();
    const nextFeedWindow = createFeedWindow(url);
    setFeedWindow(nextFeedWindow);
    const nextFeedWindows = nextFeedWindow ? [nextFeedWindow] : [];
    setFeedWindows(nextFeedWindows);
    const status = getStatus();
    status.activeFeeds = nextFeedWindows.length;
    status.lastConnectTs = Date.now();
    logger.info('feed:connect:single', { url });
  });

  ipcMain.on('settings:connectFeedsV2', (_event, feeds) => {
    const settings = getSettings();
    if (settings.liveSearchesEnabled === false) {
      logger.info('feed:connect:skipped', { reason: 'liveSearchesEnabled is false' });
      return;
    }
    destroyAllFeeds();
    const validFeeds = normalizeLiveFeedList(feeds).filter((feed) => !feed.muted);
    const nextFeedWindows = validFeeds
      .map((feed) => createFeedWindowFor(feed.url, feed))
      .filter(Boolean);
    setFeedWindows(nextFeedWindows);
    const status = getStatus();
    status.activeFeeds = nextFeedWindows.length;
    status.lastConnectTs = Date.now();
    logger.info('feed:connect:many-v2', {
      count: status.activeFeeds,
      feeds: validFeeds.map((feed) => ({ id: feed.id, name: feed.name })),
    });
  });

  ipcMain.on('settings:connectFeeds', (_event, urls) => {
    const settings = getSettings();
    if (settings.liveSearchesEnabled === false) {
      logger.info('feed:connect:skipped', { reason: 'liveSearchesEnabled is false' });
      return;
    }
    destroyAllFeeds();
    const uniq = Array.from(
      new Set(
        (Array.isArray(urls) ? urls : [])
          .map((value) => String(value || '').trim())
          .filter((url) => isValidLiveFeedUrl(url))
      )
    );
    const feedObjects = uniq.map((url, idx) => ({
      id: `feed-legacy-${Date.now()}-${idx}`,
      url,
      name: `Feed ${idx + 1}`,
    }));
    const nextFeedWindows = feedObjects
      .map((feed) => createFeedWindowFor(feed.url, feed))
      .filter(Boolean);
    setFeedWindows(nextFeedWindows);
    const status = getStatus();
    status.activeFeeds = nextFeedWindows.length;
    status.lastConnectTs = Date.now();
    logger.info('feed:connect:many', { count: status.activeFeeds });
  });

  try {
    ipcMain.removeHandler('shell:openExternal');
  } catch {}

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      logger.warn('shell:openExternal:blocked', { url });
      throw new Error('Blocked external URL');
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('login:checkStatus', async () => {
    try {
      logger.info('login:checkStatus:called');
      const sess = session.fromPartition(partition);
      const cookies = await sess.cookies.get({ domain: 'pathofexile.com' });
      logger.info('login:checkStatus:cookies-found', { count: cookies.length });

      const hasSessionCookie = cookies.some((cookie) =>
        cookie.name.toLowerCase().includes('session') ||
        cookie.name.toLowerCase().includes('poesess') ||
        cookie.name.toLowerCase().includes('auth')
      );

      if (!hasSessionCookie) {
        logger.info('login:checkStatus:no-session-cookie');
        return { loggedIn: false, message: 'Not logged in (no session cookies found)' };
      }

      logger.info('login:checkStatus:verifying-with-page-load');
      return await new Promise((resolve) => {
        let resolved = false;
        const testWindow = new BrowserWindow({
          show: false,
          webPreferences: { session: sess },
        });

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            if (!testWindow.isDestroyed()) {
              testWindow.close();
            }
          }
        };

        const resolveWithResult = (result) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            logger.info('login:checkStatus:result', result);
            resolve(result);
          }
        };

        testWindow.loadURL('https://www.pathofexile.com/account/view-profile');

        testWindow.webContents.once('did-finish-load', () => {
          logger.info('login:checkStatus:page-loaded');
          testWindow.webContents
            .executeJavaScript(`
              (function() {
                const url = window.location.href;
                const bodyText = document.body.innerText || '';
                if (url.includes('/login') || bodyText.includes('Log in') || bodyText.includes('Sign in')) {
                  return false;
                }
                return bodyText.includes('Account') || bodyText.includes('Profile') || document.querySelector('[data-account]');
              })();
            `)
            .then((isLoggedIn) => {
              resolveWithResult({
                loggedIn: isLoggedIn,
                message: isLoggedIn
                  ? 'Logged in to pathofexile.com'
                  : 'Not logged in (session expired or invalid)',
              });
            })
            .catch((err) => {
              logger.error('login:checkStatus:execute-js-failed', { error: String(err) });
              resolveWithResult({ loggedIn: false, message: 'Could not verify login status' });
            });
        });

        testWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
          logger.warn('login:checkStatus:page-load-failed', { errorCode, errorDescription });
          resolveWithResult({ loggedIn: false, message: 'Could not verify login status (network error)' });
        });

        setTimeout(() => {
          logger.warn('login:checkStatus:timeout');
          resolveWithResult({ loggedIn: false, message: 'Login check timed out' });
        }, 5000);
      });
    } catch (err) {
      logger.error('login:checkStatus:error', { error: String(err) });
      return { loggedIn: false, message: `Error checking login status: ${String(err)}` };
    }
  });

  ipcMain.handle('status:get', () => getStatus());
  ipcMain.handle('logs:open', async () => {
    const logPath = logger.getLogPath();
    if (!logPath) return false;
    try {
      const logDir = path.dirname(logPath);
      await shell.openPath(logDir);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('logs:getPath', () => logger.getLogPath());
  ipcMain.handle('logs:openFile', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      await shell.openPath(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion() || '1.0.5',
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    appDataPath: app.getPath('userData'),
  }));

  ipcMain.handle('app:getPublicBaseUrl', () => {
    try {
      return resolvePublicBaseUrl();
    } catch {
      return 'https://simplex.gg';
    }
  });

  ipcMain.handle('feedback:submit', async (_event, payload) => {
    try {
      return await submitFeedback(payload);
    } catch (error) {
      logger.error('feedback:submit:failed', { error: String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Feedback submission failed.' };
    }
  });
}

module.exports = {
  registerPostAuthIpcHandlers,
};

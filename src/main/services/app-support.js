function createAppSupportService({
  app,
  fs,
  os,
  path,
  fetch,
  autoUpdater,
  getAuth,
  logger,
}) {
  const ALLOWED_EXTERNAL_HOSTS = new Set([
    'simplex.gg',
    'www.simplex.gg',
    'localhost',
    '127.0.0.1',
    'pathofexile.com',
    'www.pathofexile.com',
  ]);

  function resolveFeedbackBaseUrl() {
    if (process.env.SIMPLEX_PUBLIC_BASE_URL) {
      return process.env.SIMPLEX_PUBLIC_BASE_URL.replace(/\/$/, '');
    }
    if (process.env.API_BASE_URL) {
      return process.env.API_BASE_URL.replace(/\/api\/client\/?$/, '');
    }
    return 'https://simplex.gg';
  }

  function isAllowedExternalUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    const value = rawUrl.trim();
    if (!value) return false;
    let parsed = null;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
  }

  function isValidLiveFeedUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    const value = rawUrl.trim();
    if (!value) return false;
    let parsed = null;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host !== 'www.pathofexile.com' && host !== 'pathofexile.com') return false;
    return /^\/trade\/search\/[^/]+\/[^/]+\/live\/?$/.test(parsed.pathname);
  }

  function normalizeLiveFeedList(feeds) {
    if (!Array.isArray(feeds)) return [];
    const seen = new Set();
    const normalized = [];
    for (const feed of feeds) {
      if (!feed || typeof feed.url !== 'string') continue;
      const url = feed.url.trim();
      if (!isValidLiveFeedUrl(url) || seen.has(url)) continue;
      seen.add(url);
      normalized.push({
        ...feed,
        id:
          typeof feed.id === 'string' && feed.id.trim()
            ? feed.id.trim()
            : `feed-${Date.now()}-${normalized.length}`,
        name:
          typeof feed.name === 'string' && feed.name.trim()
            ? feed.name.trim()
            : `Feed ${normalized.length + 1}`,
        url,
        muted: !!feed.muted,
      });
    }
    return normalized;
  }

  function resolveBuildPageUrl(buildId) {
    if (!buildId) return null;
    const base = resolveFeedbackBaseUrl();
    if (!base) return null;
    return `${base}/build?buildId=${encodeURIComponent(String(buildId))}`;
  }

  function buildFeedbackContext(extra = {}) {
    return {
      source: 'electron',
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: `${process.platform} ${os.release()} (${process.arch})`,
      locale: app.getLocale(),
      ...extra,
    };
  }

  async function submitFeedback(payload = {}) {
    const baseUrl = resolveFeedbackBaseUrl();
    if (!baseUrl) {
      throw new Error('Feedback endpoint is not configured.');
    }

    const auth = getAuth();
    const user = auth?.getUser?.() || null;
    const reporter = {
      id: auth?.getUserId?.() || null,
      name: user?.poeAccountName || user?.name || null,
    };

    const body = {
      ...payload,
      reporter,
      context: buildFeedbackContext(payload.context || {}),
    };

    const response = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'Feedback submission failed.');
    }

    return { success: true, discussionUrl: data?.discussionUrl || null };
  }

  function setupAutoUpdater() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('update-available', (info) => {
      logger.info('updates:available', { version: info?.version });
    });

    autoUpdater.on('update-not-available', (info) => {
      logger.info('updates:not-available', { version: info?.version });
    });

    autoUpdater.on('error', (err) => {
      logger.error('updates:error', { error: String(err) });
    });

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('updates:downloaded', { version: info?.version });
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logger.error('updates:check-failed', { error: String(err) });
    });
  }

  function autoDetectClientLogPath() {
    const possiblePaths = [];
    const userProfile = os.homedir();
    const commonDrives = ['C:', 'D:', 'E:'];

    possiblePaths.push(path.join(userProfile, 'Documents', 'My Games', 'Path of Exile', 'logs', 'Client.txt'));

    for (const drive of commonDrives) {
      possiblePaths.push(path.join(drive, 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt'));
      possiblePaths.push(path.join(drive, 'Program Files', 'Steam', 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt'));
    }

    for (const drive of commonDrives) {
      possiblePaths.push(path.join(drive, 'Program Files (x86)', 'Grinding Gear Games', 'Path of Exile', 'logs', 'Client.txt'));
      possiblePaths.push(path.join(drive, 'Program Files', 'Grinding Gear Games', 'Path of Exile', 'logs', 'Client.txt'));
    }

    for (const testPath of possiblePaths) {
      try {
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      } catch {}
    }

    if (process.platform === 'win32') {
      for (let drive = 'C'.charCodeAt(0); drive <= 'Z'.charCodeAt(0); drive++) {
        const driveLetter = String.fromCharCode(drive) + ':';
        if (commonDrives.includes(driveLetter)) continue;

        const steamPath = path.join(driveLetter, 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt');
        const directPath = path.join(driveLetter, 'Program Files (x86)', 'Grinding Gear Games', 'Path of Exile', 'logs', 'Client.txt');

        try {
          if (fs.existsSync(steamPath)) return steamPath;
          if (fs.existsSync(directPath)) return directPath;
        } catch {}
      }
    }

    return null;
  }

  return {
    resolveFeedbackBaseUrl,
    isAllowedExternalUrl,
    isValidLiveFeedUrl,
    normalizeLiveFeedList,
    resolveBuildPageUrl,
    submitFeedback,
    setupAutoUpdater,
    autoDetectClientLogPath,
  };
}

module.exports = {
  createAppSupportService,
};

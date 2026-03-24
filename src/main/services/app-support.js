function createAppSupportService({
  app,
  BrowserWindow,
  fs,
  os,
  path,
  fetch,
  autoUpdater,
  dialog,
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
  let updateCheckCompleted = false;
  let updatePromptActive = false;
  let updateDownloadInProgress = false;
  let portableDownloadPath = null;
  let updateProgressWindow = null;
  let updateProgressState = {
    title: '',
    message: '',
    percent: 0,
    indeterminate: false,
  };

  function getClientPackageInfo() {
    const candidatePaths = [
      path.join(app.getAppPath(), 'package.json'),
      path.join(__dirname, '..', '..', '..', 'package.json'),
    ];

    for (const candidatePath of candidatePaths) {
      try {
        if (!fs.existsSync(candidatePath)) continue;
        const raw = fs.readFileSync(candidatePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch {}
    }

    return null;
  }

  function getGitHubPublishConfig() {
    const packageInfo = getClientPackageInfo();
    const publishList = Array.isArray(packageInfo?.build?.publish)
      ? packageInfo.build.publish
      : [];
    const githubPublish = publishList.find((entry) => entry && entry.provider === 'github');
    const owner = typeof githubPublish?.owner === 'string' ? githubPublish.owner.trim() : '';
    const repo = typeof githubPublish?.repo === 'string' ? githubPublish.repo.trim() : '';
    if (!owner || !repo) return null;
    return {
      owner,
      repo,
      productName:
        typeof packageInfo?.build?.productName === 'string' && packageInfo.build.productName.trim()
          ? packageInfo.build.productName.trim()
          : app.getName(),
    };
  }

  function isPortableBuild() {
    return Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  }

  function getPortableExecutablePath() {
    if (typeof process.env.PORTABLE_EXECUTABLE_FILE === 'string' && process.env.PORTABLE_EXECUTABLE_FILE.trim()) {
      return process.env.PORTABLE_EXECUTABLE_FILE.trim();
    }
    return null;
  }

  function getUpdateDialogWindow() {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow && !focusedWindow.isDestroyed()) {
        return focusedWindow;
      }
    } catch {}
    return null;
  }

  async function showMessageBox(options) {
    return dialog.showMessageBox(getUpdateDialogWindow(), options);
  }

  function resetPortableUpdateState() {
    portableDownloadPath = null;
    updateDownloadInProgress = false;
  }

  function formatUpdateTitle() {
    return `${app.getName()} Update`;
  }

  function getUpdateProgressHtml() {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Simplex Update</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        background: #1f1f1f;
        color: #f2f2f2;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      .shell {
        box-sizing: border-box;
        width: 100%;
        height: 100vh;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        background:
          radial-gradient(circle at top right, rgba(227, 188, 52, 0.12), transparent 40%),
          #1f1f1f;
      }
      .title {
        font-size: 22px;
        font-weight: 700;
        color: #e3bc34;
      }
      .message {
        font-size: 15px;
        color: #d6d6d6;
        line-height: 1.45;
      }
      .track {
        width: 100%;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: #2c2c2c;
        border: 1px solid #3a3a3a;
      }
      .bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #d2a31f 0%, #f0cb4a 100%);
        transition: width 120ms linear;
      }
      .bar.indeterminate {
        width: 35%;
        animation: slide 1.2s infinite ease-in-out;
      }
      .meta {
        font-size: 13px;
        color: #a9a9a9;
      }
      @keyframes slide {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(340%); }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="title" id="title">Preparing update</div>
      <div class="message" id="message">Starting update…</div>
      <div class="track">
        <div class="bar indeterminate" id="bar"></div>
      </div>
      <div class="meta" id="meta">Please keep Simplex open until the update is ready.</div>
    </div>
    <script>
      const titleEl = document.getElementById('title');
      const messageEl = document.getElementById('message');
      const barEl = document.getElementById('bar');
      const metaEl = document.getElementById('meta');
      const applyState = (state) => {
        titleEl.textContent = state.title || 'Preparing update';
        messageEl.textContent = state.message || 'Starting update…';
        const percent = Number.isFinite(Number(state.percent)) ? Math.max(0, Math.min(100, Number(state.percent))) : 0;
        if (state.indeterminate) {
          barEl.classList.add('indeterminate');
          barEl.style.width = '35%';
          metaEl.textContent = 'Downloading update…';
        } else {
          barEl.classList.remove('indeterminate');
          barEl.style.width = percent + '%';
          metaEl.textContent = percent >= 100 ? 'Finishing update…' : ('Downloading update… ' + percent.toFixed(0) + '%');
        }
      };
      window.addEventListener('message', (event) => applyState(event.data || {}));
    </script>
  </body>
</html>`;
  }

  function postUpdateProgressState() {
    if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
    try {
      updateProgressWindow.webContents.executeJavaScript(
        `window.postMessage(${JSON.stringify(updateProgressState)}, '*');`,
        true
      ).catch(() => {});
    } catch {}
  }

  function ensureUpdateProgressWindow() {
    if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
      postUpdateProgressState();
      return updateProgressWindow;
    }

    updateProgressWindow = new BrowserWindow({
      width: 420,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      show: false,
      title: formatUpdateTitle(),
      parent: getUpdateDialogWindow() || undefined,
      modal: true,
      backgroundColor: '#1f1f1f',
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
      },
    });

    updateProgressWindow.on('closed', () => {
      updateProgressWindow = null;
    });

    updateProgressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getUpdateProgressHtml())}`);
    updateProgressWindow.webContents.once('did-finish-load', () => {
      if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
      postUpdateProgressState();
      updateProgressWindow.show();
    });

    return updateProgressWindow;
  }

  function updateProgressWindowState(nextState = {}) {
    updateProgressState = {
      ...updateProgressState,
      ...nextState,
    };
    ensureUpdateProgressWindow();
    postUpdateProgressState();
  }

  function closeUpdateProgressWindow() {
    if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
      try { updateProgressWindow.close(); } catch {}
    }
    updateProgressWindow = null;
  }

  function buildPortableAssetName(version) {
    const publishConfig = getGitHubPublishConfig();
    const productName = publishConfig?.productName || app.getName();
    return `${productName}-${version}.exe`;
  }

  async function resolvePortableRelease(version) {
    const publishConfig = getGitHubPublishConfig();
    if (!publishConfig) {
      throw new Error('GitHub publish configuration is missing.');
    }

    const releaseUrl = `https://api.github.com/repos/${encodeURIComponent(publishConfig.owner)}/${encodeURIComponent(publishConfig.repo)}/releases/tags/v${encodeURIComponent(version)}`;
    const response = await fetch(releaseUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${app.getName()}/${app.getVersion()}`,
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.message || `Failed to resolve portable release ${version}.`);
    }

    const expectedAssetName = buildPortableAssetName(version);
    const assets = Array.isArray(payload?.assets) ? payload.assets : [];
    const portableAsset = assets.find((asset) => asset?.name === expectedAssetName);
    if (!portableAsset?.browser_download_url) {
      throw new Error(`Portable asset ${expectedAssetName} was not found in release v${version}.`);
    }

    return {
      name: portableAsset.name,
      url: portableAsset.browser_download_url,
    };
  }

  async function downloadFile(downloadUrl, destinationPath, onProgress = null) {
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': `${app.getName()}/${app.getVersion()}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Download failed with status ${response.status}.`);
    }

    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

    const totalBytes = Number.parseInt(response.headers.get('content-length') || '0', 10);
    let downloadedBytes = 0;

    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(destinationPath);
      const onError = (error) => {
        stream.destroy();
        reject(error);
      };

      response.body.on('error', onError);
      response.body.on('data', (chunk) => {
        downloadedBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        if (typeof onProgress === 'function' && totalBytes > 0) {
          onProgress((downloadedBytes / totalBytes) * 100);
        }
      });
      stream.on('error', onError);
      stream.on('finish', resolve);
      response.body.pipe(stream);
    });
  }

  function escapePowerShellSingleQuoted(value) {
    return String(value).replace(/'/g, "''");
  }

  async function installPortableUpdate(downloadPath) {
    const currentExecutablePath = getPortableExecutablePath();
    if (!currentExecutablePath) {
      throw new Error('Portable executable path is not available.');
    }

    const tempScriptPath = path.join(
      os.tmpdir(),
      `simplex-portable-update-${Date.now()}.ps1`
    );
    const currentPid = process.pid;
    const escapedDownloadPath = escapePowerShellSingleQuoted(downloadPath);
    const escapedTargetPath = escapePowerShellSingleQuoted(currentExecutablePath);

    const scriptBody = [
      `$source = '${escapedDownloadPath}'`,
      `$target = '${escapedTargetPath}'`,
      `$pidToWait = ${currentPid}`,
      'while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }',
      '$targetDir = Split-Path -Parent $target',
      'if (-not (Test-Path $source)) { exit 1 }',
      'if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir | Out-Null }',
      'if (Test-Path $target) { Remove-Item -Path $target -Force }',
      'Move-Item -Path $source -Destination $target -Force',
      'Start-Process -FilePath $target',
    ].join('\r\n');

    await fs.promises.writeFile(tempScriptPath, scriptBody, 'utf8');

    const childProcess = require('child_process');
    childProcess.spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      tempScriptPath,
    ], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    logger.info('updates:portable-install-started', {
      downloadPath,
      targetPath: currentExecutablePath,
    });

    app.quit();
  }

  async function downloadPortableUpdate(info) {
    if (updateDownloadInProgress) return;
    updateDownloadInProgress = true;
    try {
      const release = await resolvePortableRelease(info?.version);
      const destinationPath = path.join(os.tmpdir(), 'simplex-updates', release.name);
      logger.info('updates:portable-download-start', {
        version: info?.version,
        asset: release.name,
      });
      updateProgressWindowState({
        title: 'Downloading new standalone version',
        message: `Downloading Simplex ${info?.version || 'update'} and preparing to open the new version.`,
        percent: 0,
        indeterminate: false,
      });
      await downloadFile(release.url, destinationPath, (percent) => {
        updateProgressWindowState({ percent, indeterminate: false });
      });
      portableDownloadPath = destinationPath;
      logger.info('updates:portable-downloaded', {
        version: info?.version,
        path: destinationPath,
      });
      updateProgressWindowState({
        title: 'Opening new standalone version',
        message: 'The new standalone version is ready. Simplex will close and open the new version from the same location.',
        percent: 100,
        indeterminate: false,
      });
      await installPortableUpdate(portableDownloadPath);
    } catch (error) {
      closeUpdateProgressWindow();
      resetPortableUpdateState();
      logger.error('updates:portable-download-failed', {
        version: info?.version,
        error: String(error),
      });
      await showMessageBox({
        type: 'error',
        buttons: ['OK'],
        defaultId: 0,
        noLink: true,
        title: formatUpdateTitle(),
        message: 'The standalone update could not be downloaded.',
        detail: String(error?.message || error),
      });
    }
  }

  async function promptUpdateAvailable(info) {
    if (updatePromptActive) return;
    updatePromptActive = true;
    try {
      const isPortable = isPortableBuild();
      const actionLabel = isPortable ? 'Download & Open New Version' : 'Download & Install';
      const result = await showMessageBox({
        type: 'info',
        buttons: [actionLabel, 'Later'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: formatUpdateTitle(),
        message: `A new version of Simplex is available (${info?.version || 'update'}).`,
        detail: isPortable
          ? 'The standalone build will download the new version, replace the current executable in place, and then open the new version automatically.'
          : 'The installer build will download the update, close Simplex when it is ready, and then launch the installer automatically.',
      });

      if (result.response !== 0) {
        return;
      }

      if (isPortable) {
        await downloadPortableUpdate(info);
      } else {
        updateDownloadInProgress = true;
        logger.info('updates:download-start', { version: info?.version, mode: 'installer' });
        updateProgressWindowState({
          title: 'Downloading installer update',
          message: `Downloading Simplex ${info?.version || 'update'}. The installer will start automatically when the download is complete.`,
          percent: 0,
          indeterminate: true,
        });
        await autoUpdater.downloadUpdate();
      }
    } finally {
      updatePromptActive = false;
    }
  }

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
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoRunAppAfterInstall = true;

    autoUpdater.on('checking-for-update', () => {
      logger.info('updates:checking');
    });

    autoUpdater.on('update-available', async (info) => {
      logger.info('updates:available', { version: info?.version });
      try {
        await promptUpdateAvailable(info);
      } catch (error) {
        logger.error('updates:prompt-failed', { error: String(error) });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      logger.info('updates:not-available', { version: info?.version });
    });

    autoUpdater.on('error', async (err) => {
      updateDownloadInProgress = false;
      closeUpdateProgressWindow();
      logger.error('updates:error', { error: String(err) });
      if (!updateCheckCompleted) {
        return;
      }
      try {
        await showMessageBox({
          type: 'error',
          buttons: ['OK'],
          defaultId: 0,
          noLink: true,
          title: formatUpdateTitle(),
          message: 'The update process failed.',
          detail: String(err?.message || err),
        });
      } catch {}
    });

    autoUpdater.on('download-progress', (progress) => {
      updateProgressWindowState({
        percent: Number.isFinite(Number(progress?.percent)) ? Number(progress.percent) : 0,
        indeterminate: false,
      });
    });

    autoUpdater.on('update-downloaded', async (info) => {
      updateDownloadInProgress = false;
      logger.info('updates:downloaded', { version: info?.version });
      try {
        updateProgressWindowState({
          title: 'Installing update',
          message: `Simplex ${info?.version || 'update'} is ready. The app will close and launch the installer now.`,
          percent: 100,
          indeterminate: false,
        });
        setTimeout(() => {
          autoUpdater.quitAndInstall(false, true);
        }, 500);
      } catch (error) {
        logger.error('updates:ready-prompt-failed', { error: String(error) });
      }
    });

    autoUpdater.checkForUpdates().then(() => {
      updateCheckCompleted = true;
    }).catch((err) => {
      updateCheckCompleted = true;
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

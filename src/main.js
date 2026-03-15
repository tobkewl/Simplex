const { app, BrowserWindow, ipcMain, shell, session, Tray, Menu, nativeImage, globalShortcut, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('node-fetch');
const { autoUpdater } = require('electron-updater');
const logger = require('./common/logger');
const ClientLogWatcher = require('./common/client-log-watcher');
const { loadEnv } = require('./config/loadEnv');
const { createSettingsStore } = require('./main/settings-store');
const { createLiveSnapshotBuilder } = require('./main/live-snapshot');
const { createOverlayWindowFactories } = require('./main/windows/overlay-windows');
const { createShellWindowFactories } = require('./main/windows/shell-windows');
const { createFeedWindowFactories } = require('./main/windows/feed-windows');
const { createMiscWindowFactories } = require('./main/windows/misc-windows');
const { createLiveTrackingService } = require('./main/services/live-tracking-service');
const { createPoeInputScriptService } = require('./main/services/poe-input-script');
const { createAppSupportService } = require('./main/services/app-support');
const { initializeAuthAndApiClient } = require('./main/bootstrap/auth-bootstrap');
const { runPostAuthStartup } = require('./main/bootstrap/post-auth-startup');
const { setupTray } = require('./main/bootstrap/tray-setup');
const { registerAppLifecycleHandlers } = require('./main/bootstrap/app-lifecycle');
const { registerCoreIpc } = require('./main/bootstrap/ipc-registration');
const { registerSettingsWindowControlsIpc } = require('./main/ipc/settings-window-controls');
const { registerPostAuthIpcHandlers } = require('./main/ipc/post-auth-handlers');
const { registerNetworthIpcHandlers } = require('./main/ipc/networth-handlers');

// Auth integration
const { initializeAuth, requireAuth, getAuth } = require('./services/authIntegration');
const BuildApiClient = require('./api/buildApiClient');

// Keep dev settings isolated from production installs.
if (!app.isPackaged) {
  const devUserData = path.join(app.getPath('appData'), `${app.getName()} (dev)`);
  app.setPath('userData', devUserData);
  process.env.SIMPLEX_USER_DATA_PATH = devUserData;
}

const PARTITION = 'persist:poe';
const UA_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';
let overlayWindow = null;
let feedWindow = null;
let feedWindows = [];
let settingsWindow = null;
let loginWindow = null;
let managementWindow = null;
let managementAllowFocus = false;
let networthOverlayWindow = null;
let buildOverlayWindow = null;
let welcomeWindow = null;
let countdownTimerWindow = null;
let overlayVisible = false;
let tray = null;
let isQuitting = false;
const feedMeta = new Map();
let status = { activeFeeds: 0, lastEventTs: 0, lastConnectTs: 0 };
let clientLogWatcher = null;

// Auth & API
let authService = null;
let apiClient = null;
let buildManagerWindow = null;
let activeGuideState = null;
const registeredShortcuts = {
  buildQuickPreview: null,
  openSettings: null
};

const { writePoeScript, ensurePoeScriptPath } = createPoeInputScriptService({
  app,
  fs,
  path,
  logger,
});

function ensureOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  return overlayWindow;
}

const settingsStore = createSettingsStore({ app, path, fs, logger });
const {
  isNewInstallation,
  saveSettings,
} = settingsStore;
let settings = null;

function loadSettings() {
  const merged = settingsStore.loadSettings();
  try {
    settings = merged;
    refreshCurrentCharacterLiveTrackingState();
  } catch {}
  return merged;
}

const {
  createSettingsWindow,
  createManagementWindow,
} = createShellWindowFactories({
  BrowserWindow,
  path,
  fs,
  nativeImage,
  screen,
  logger,
  baseDir: __dirname,
  getSettings: () => settings,
  getIsQuitting: () => isQuitting,
  getManagementAllowFocus: () => managementAllowFocus,
  getSettingsWindow: () => settingsWindow,
  setSettingsWindow: (nextWindow) => {
    settingsWindow = nextWindow;
  },
  getManagementWindow: () => managementWindow,
  setManagementWindow: (nextWindow) => {
    managementWindow = nextWindow;
  },
  getOverlayWindow: () => overlayWindow,
});

const {
  resolveFeedbackBaseUrl,
  isAllowedExternalUrl,
  isValidLiveFeedUrl,
  normalizeLiveFeedList,
  resolveBuildPageUrl,
  submitFeedback,
  setupAutoUpdater,
  autoDetectClientLogPath,
} = createAppSupportService({
  app,
  fs,
  os,
  path,
  fetch,
  autoUpdater,
  getAuth,
  logger,
});

function shouldWatchClientLog(currentSettings) {
  if (!currentSettings?.clientLogPath) return false;
  if (!fs.existsSync(currentSettings.clientLogPath)) return false;
  const whispersEnabled = currentSettings.whispersEnabled !== false;
  const levelAuto = currentSettings.buildLevelDetection !== 'manual';
  const liveMap = currentSettings?.liveTrackingByCharacter && typeof currentSettings.liveTrackingByCharacter === 'object'
    ? currentSettings.liveTrackingByCharacter
    : {};
  const liveTrackingActive = Object.values(liveMap).some((entry) => entry && entry.enabled === true);
  const liveTrackingArmed = Boolean(currentSettings?.liveTrackingPending);
  const buildGuideEnabled = currentSettings?.buildGuideEnabled !== false;
  return whispersEnabled || levelAuto || liveTrackingActive || liveTrackingArmed || buildGuideEnabled;
}

function broadcastSettingsUpdate(partial = {}) {
  const targets = [
    overlayWindow,
    managementWindow,
    settingsWindow,
    networthOverlayWindow,
    buildOverlayWindow,
    buildManagerWindow,
    countdownTimerWindow,
    welcomeWindow,
    loginWindow
  ];

  for (const win of targets) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:updated', settings);
    }
  }

  if (partial.characterLevel !== undefined && buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    buildOverlayWindow.webContents.send('build:levelChanged', partial.characterLevel);
  }
}

function normalizeShortcutValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sendToManagement(channel, payload) {
  if (!managementWindow || managementWindow.isDestroyed()) {
    createManagementWindow();
  }
  if (!managementWindow || managementWindow.isDestroyed()) return;
  const send = () => {
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send(channel, payload);
    }
  };
  if (managementWindow.webContents.isLoading()) {
    managementWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function isSettingsWindowVisible() {
  return !!(settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible());
}

function showSettingsWindow(tab) {
  try {
    logger.info('settings:show:called', { tab, hasWindow: !!settingsWindow, isDestroyed: settingsWindow?.isDestroyed() });

    if (!settingsWindow || settingsWindow.isDestroyed()) {
      logger.info('settings:show:creating-new-window');
      createSettingsWindow();
      settingsWindow.webContents.once('did-finish-load', () => {
        logger.info('settings:show:window-loaded');
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          setTimeout(() => {
            logger.info('settings:show:showing-window');
            settingsWindow.show();
            settingsWindow.focus();
            if (tab) {
              logger.info('settings:show:switching-tab', { tab });
              settingsWindow.webContents.send('settings:switchTab', tab);
            }
          }, 100);
        }
      });
    } else {
      logger.info('settings:show:showing-existing-window');
      settingsWindow.show();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
      }
    }

    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('settings:windowOpened', tab);
    }

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings:windowOpened', tab);
    }

    if (tab && settingsWindow && !settingsWindow.isDestroyed() && !settingsWindow.webContents.isLoading()) {
      logger.info('settings:show:switching-tab-existing', { tab });
      settingsWindow.webContents.send('settings:switchTab', tab);
    }
  } catch (err) {
    logger.error('settings:show:error', { error: String(err) });
  }
}

function toggleSettingsWindow(tab) {
  if (isSettingsWindowVisible()) {
    try { settingsWindow.hide(); } catch {}
    return;
  }
  showSettingsWindow(tab);
}

function refreshGlobalShortcuts() {
  if (!app.isReady()) return;
  const desiredQuickPreview = normalizeShortcutValue(settings?.buildQuickPreviewShortcut);
  const desiredOpenSettings = normalizeShortcutValue(settings?.openSettingsShortcut);

  if (registeredShortcuts.buildQuickPreview && registeredShortcuts.buildQuickPreview !== desiredQuickPreview) {
    globalShortcut.unregister(registeredShortcuts.buildQuickPreview);
    registeredShortcuts.buildQuickPreview = null;
  }
  if (registeredShortcuts.openSettings && registeredShortcuts.openSettings !== desiredOpenSettings) {
    globalShortcut.unregister(registeredShortcuts.openSettings);
    registeredShortcuts.openSettings = null;
  }

  if (desiredQuickPreview && registeredShortcuts.buildQuickPreview !== desiredQuickPreview) {
    try {
      const ok = globalShortcut.register(desiredQuickPreview, () => {
        sendToManagement('shortcut:buildQuickPreview');
      });
      if (ok) {
        registeredShortcuts.buildQuickPreview = desiredQuickPreview;
        logger.info('shortcut:registered', { action: 'buildQuickPreview', accelerator: desiredQuickPreview });
      } else {
        logger.warn('shortcut:register-failed', { action: 'buildQuickPreview', accelerator: desiredQuickPreview });
      }
    } catch (err) {
      logger.warn('shortcut:register-error', { action: 'buildQuickPreview', accelerator: desiredQuickPreview, error: String(err) });
    }
  }

  if (desiredOpenSettings && registeredShortcuts.openSettings !== desiredOpenSettings) {
    try {
      const ok = globalShortcut.register(desiredOpenSettings, () => {
        toggleSettingsWindow('general');
      });
      if (ok) {
        registeredShortcuts.openSettings = desiredOpenSettings;
        logger.info('shortcut:registered', { action: 'openSettings', accelerator: desiredOpenSettings });
      } else {
        logger.warn('shortcut:register-failed', { action: 'openSettings', accelerator: desiredOpenSettings });
      }
    } catch (err) {
      logger.warn('shortcut:register-error', { action: 'openSettings', accelerator: desiredOpenSettings, error: String(err) });
    }
  }
}

function maybeShowLevelUpPopup(level) {
  if (!settings?.buildLevelPopupEnabled) return;
  if (!managementWindow || managementWindow.isDestroyed()) {
    createManagementWindow();
  } else {
    managementWindow.show();
  }
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('build:levelUp', { level });
  }
  if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    buildOverlayWindow.webContents.send('build:localLevelUp', { level });
  }
  if (buildManagerWindow && !buildManagerWindow.isDestroyed()) {
    buildManagerWindow.webContents.send('build:localLevelUp', { level });
  }
}

function updateCharacterLevel(level, options = {}) {
  const parsed = Number.parseInt(level, 10);
  if (!Number.isFinite(parsed)) return;
  const clamped = Math.max(1, Math.min(100, parsed));
  if (settings.characterLevel === clamped && !options.force) return;

  settings.characterLevel = clamped;
  if (settings.buildLevelDetection === 'manual') {
    settings.buildManualLevel = clamped;
  }

  saveSettings(settings);
  broadcastSettingsUpdate({ characterLevel: clamped });

  if (options.showPopup) {
    maybeShowLevelUpPopup(clamped);
  }
}

const { buildLiveSnapshot, summarizeSkillChains } = createLiveSnapshotBuilder({
  logger,
  getApiClient: () => apiClient,
});

const liveTrackingService = createLiveTrackingService({
  logger,
  getApiClient: () => apiClient,
  getSettings: () => settings,
  setSettings: (nextSettings) => {
    settings = nextSettings;
  },
  loadSettings,
  saveSettings,
  broadcastSettingsUpdate,
  resolveBuildPageUrl,
  buildLiveSnapshot,
  summarizeSkillChains,
  getClientLogWatcher: () => clientLogWatcher,
});

const {
  refreshCurrentCharacterLiveTrackingState,
  restoreLiveTrackingOnStartup,
  refreshCharacterInfoCache,
  resolveCharacterInfo,
  setActiveCharacterState,
  clearActiveCharacterState,
  handleLiveTrackingLevelUp,
  disableAllLiveTracking,
  toggleLiveTrackingForActiveCharacter,
  getAllowedCharacterNames,
} = liveTrackingService;
function ensureClientLogWatcher() {
  if (!settings.clientLogPath && settings.buildLevelDetection !== 'manual') {
    const detected = autoDetectClientLogPath();
    if (detected) {
      settings.clientLogPath = detected;
      saveSettings(settings);
      broadcastSettingsUpdate({});
    }
  }
  if (shouldWatchClientLog(settings)) {
    initClientLogWatcher(settings.clientLogPath);
  } else if (clientLogWatcher) {
    clientLogWatcher.stop();
    clientLogWatcher = null;
  }
}

function initClientLogWatcher(clientPath) {
  if (clientLogWatcher) {
    clientLogWatcher.stop();
  }
  
  clientLogWatcher = new ClientLogWatcher();
  if (typeof clientLogWatcher.setAllowedCharacterNames === 'function') {
    const allowedCharacterNames = getAllowedCharacterNames();
    if (allowedCharacterNames.length > 0) {
      clientLogWatcher.setAllowedCharacterNames(allowedCharacterNames);
    }
  }
  
  clientLogWatcher.on('whisper', (whisper) => {
    logger.info('whispers:new', { type: whisper.type, player: whisper.playerName });
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:new-whisper', whisper);
    }
  });

  clientLogWatcher.on('level', (payload) => {
    if (payload?.characterName) {
      void setActiveCharacterState(payload.characterName, payload.className || null);
    }
    if (settings?.buildLevelDetection === 'manual') return;
    updateCharacterLevel(payload.level, { showPopup: true });
    void handleLiveTrackingLevelUp(payload);
  });

  clientLogWatcher.on('character', (payload) => {
    if (!payload || !payload.state) return;
    if (payload.state === 'logout') {
      logger.info('live-tracking:character-cleared', { reason: 'logout' });
      clearActiveCharacterState();
      return;
    }
    if (payload.characterName) {
      logger.info('live-tracking:character-detected', {
        characterName: payload.characterName,
        className: payload.className || null,
        bootstrap: payload.bootstrap === true
      });
      void setActiveCharacterState(payload.characterName, payload.className || null);
    }
  });
  
  clientLogWatcher.on('error', (err) => {
    logger.error('whispers:watcher:error', { error: String(err) });
  });
  
  clientLogWatcher.on('started', (path) => {
    logger.info('whispers:watcher:started', { path });
  });
  
  clientLogWatcher.on('stopped', () => {
    logger.info('whispers:watcher:stopped');
  });
  
  clientLogWatcher.start(clientPath);
}

const {
  createOverlayWindow,
  createNetworthOverlayWindow,
  createBuildOverlayWindow,
} = createOverlayWindowFactories({
  BrowserWindow,
  path,
  fs,
  nativeImage,
  logger,
  baseDir: __dirname,
  getSettings: () => settings,
  saveSettings,
  getIsQuitting: () => isQuitting,
  updateOverlayMouse,
  getOverlayWindow: () => overlayWindow,
  setOverlayWindow: (nextWindow) => {
    overlayWindow = nextWindow;
  },
  getNetworthOverlayWindow: () => networthOverlayWindow,
  setNetworthOverlayWindow: (nextWindow) => {
    networthOverlayWindow = nextWindow;
  },
  getBuildOverlayWindow: () => buildOverlayWindow,
  setBuildOverlayWindow: (nextWindow) => {
    buildOverlayWindow = nextWindow;
  },
});
const {
  createCountdownTimerWindow,
  hideCountdownTimerWindow,
  createWelcomeWindow,
  createLoginWindow,
  createBuildManagerWindow,
} = createMiscWindowFactories({
  BrowserWindow,
  session,
  path,
  fs,
  nativeImage,
  logger,
  baseDir: __dirname,
  partition: PARTITION,
  getSettings: () => settings,
  saveSettings,
  getIsQuitting: () => isQuitting,
  getCountdownTimerWindow: () => countdownTimerWindow,
  setCountdownTimerWindow: (nextWindow) => {
    countdownTimerWindow = nextWindow;
  },
  getWelcomeWindow: () => welcomeWindow,
  setWelcomeWindow: (nextWindow) => {
    welcomeWindow = nextWindow;
  },
  getLoginWindow: () => loginWindow,
  setLoginWindow: (nextWindow) => {
    loginWindow = nextWindow;
  },
  getBuildManagerWindow: () => buildManagerWindow,
  setBuildManagerWindow: (nextWindow) => {
    buildManagerWindow = nextWindow;
  },
});
function openFeedbackModal(type = 'bug') {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  } else {
    settingsWindow.show();
  }

  const sendOpen = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('feedback:open', type);
      settingsWindow.focus();
    }
  };

  if (settingsWindow && settingsWindow.webContents.isLoading()) {
    settingsWindow.webContents.once('did-finish-load', () => {
      setTimeout(sendOpen, 150);
    });
  } else {
    setTimeout(sendOpen, 50);
  }
}

const {
  createFeedWindow,
  createFeedWindowFor,
} = createFeedWindowFactories({
  BrowserWindow,
  session,
  path,
  logger,
  partition: PARTITION,
  baseDir: __dirname,
  isValidLiveFeedUrl,
  feedMeta,
  getFeedWindow: () => feedWindow,
  setFeedWindow: (nextWindow) => {
    feedWindow = nextWindow;
  },
  getFeedWindows: () => feedWindows,
  setFeedWindows: (nextFeedWindows) => {
    feedWindows = nextFeedWindows;
  },
});
function destroyAllFeeds() {
  logger.info('feed:destroyAll:start', { count: feedWindows.length + (feedWindow ? 1 : 0) });
  
  for (const w of feedWindows) {
    try {
      if (w && !w.isDestroyed()) {
        w.destroy();
      }
    } catch {}
  }
  
  try { 
    if (feedWindow && !feedWindow.isDestroyed()) {
      feedWindow.destroy();
    }
  } catch {}
  
  feedMeta.clear();
  feedWindow = null;
  feedWindows = [];
  status.activeFeeds = 0;
  logger.info('feed:destroyAll:done');
}

function forwardToOverlay(channel, payload) {
  // Don't forward if live searches are disabled
  if (settings.liveSearchesEnabled === false) {
    return;
  }
  
  try {
    if (channel === 'poe-live:new-items' && Array.isArray(payload)) {
      const sample = payload.slice(0, 3).map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        seller: it.seller
      }));
      logger.info('overlay:send', { count: payload.length, sample });
    }
    if (channel === 'poe-live:removed' && Array.isArray(payload)) {
      logger.info('overlay:send-removed', { count: payload.length });
    }
  } catch {}
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try { overlayWindow.webContents.send(channel, payload); } catch {}
}

registerCoreIpc({
  ipcMain,
  BrowserWindow,
  shell,
  dialog,
  fs,
  logger,
  autoDetectClientLogPath,
  maybeShowLevelUpPopup,
  getSettings: () => settings,
  setSettings: (nextSettings) => {
    settings = nextSettings;
  },
  disableAllLiveTracking,
  toggleLiveTrackingForActiveCharacter,
  isValidLiveFeedUrl,
  destroyAllFeeds,
  createFeedWindow,
  normalizeLiveFeedList,
  getFeedWindows: () => feedWindows,
  setFeedWindows: (nextFeedWindows) => {
    feedWindows = nextFeedWindows;
  },
  createFeedWindowFor,
  getStatus: () => status,
  saveSettings,
  broadcastSettingsUpdate,
  refreshGlobalShortcuts,
  getOverlayWindow: () => overlayWindow,
  createOverlayWindow,
  getNetworthOverlayWindow: () => networthOverlayWindow,
  createNetworthOverlayWindow,
  getBuildOverlayWindow: () => buildOverlayWindow,
  createBuildOverlayWindow,
  getSettingsWindow: () => settingsWindow,
  getManagementWindow: () => managementWindow,
  createManagementWindow,
  showSettingsWindow,
  toggleSettingsWindow,
  getFeedMeta: () => feedMeta,
  refreshCurrentCharacterLiveTrackingState,
  ensureClientLogWatcher,
  getActiveGuideState: () => activeGuideState,
  setActiveGuideState: (nextState) => {
    activeGuideState = nextState && typeof nextState === 'object' ? nextState : null;
  },
  getAllFeeds: () => [feedWindow, ...feedWindows].filter(Boolean),
  setOverlayVisible: (visible) => {
    overlayVisible = !!visible;
  },
  getOverlayVisible: () => overlayVisible,
  updateOverlayMouse,
  getManagementAllowFocus: () => managementAllowFocus,
  setManagementAllowFocus: (allowFocus) => {
    managementAllowFocus = !!allowFocus;
  },
  applyOverlayLock,
  onTradeEventObserved: () => {
    status.lastEventTs = Date.now();
  },
  isAllowedExternalUrl,
  ensurePoeScriptPath,
  forwardToOverlay,
  ensureOverlayWindow,
});
// ========================================
// APP INITIALIZATION
// ========================================

registerAppLifecycleHandlers({
  app,
  BrowserWindow,
  logger,
  globalShortcut,
  getSettings: () => settings,
  saveSettings,
  setIsQuitting: (value) => {
    isQuitting = !!value;
  },
  getIsQuitting: () => isQuitting,
  createOverlayWindow,
  createSettingsWindow,
});

app.whenReady().then(async () => {
  try {
    loadEnv();
  } catch (err) {
    logger.warn('dotenv not installed or failed to load', { error: String(err) });
  }

  if (app.isPackaged) {
    setupAutoUpdater();
  } else {
    logger.info('updates:skipped', { reason: 'app-not-packaged' });
  }

  const authContext = await initializeAuthAndApiClient({
    app,
    logger,
    initializeAuth,
    requireAuth,
    BuildApiClient,
    apiBaseUrl: process.env.API_BASE_URL,
    devLoginShortcutEnabled: process.env.SIMPLEX_DEV_LOGIN_SHORTCUT === '1',
  });
  if (!authContext) return;

  authService = authContext.authService;
  apiClient = authContext.apiClient;

  registerNetworthIpcHandlers({
    ipcMain,
    logger,
    getApiClient: () => apiClient,
    getSettings: () => settings,
    saveSettings,
    enableDevWebsiteFeatures: true,
  });

  registerPostAuthIpcHandlers({
    ipcMain,
    BrowserWindow,
    session,
    shell,
    app,
    path,
    partition: PARTITION,
    logger,
    getApiClient: () => apiClient,
    createBuildManagerWindow,
    getSettings: () => settings,
    saveSettings,
    getWelcomeWindow: () => welcomeWindow,
    isValidLiveFeedUrl,
    destroyAllFeeds,
    createFeedWindow,
    createFeedWindowFor,
    normalizeLiveFeedList,
    setFeedWindow: (nextWindow) => {
      feedWindow = nextWindow;
    },
    setFeedWindows: (nextFeedWindows) => {
      feedWindows = nextFeedWindows;
    },
    getStatus: () => status,
    isAllowedExternalUrl,
    resolvePublicBaseUrl: resolveFeedbackBaseUrl,
    submitFeedback,
  });

  const startupResult = runPostAuthStartup({
    app,
    session,
    partition: PARTITION,
    userAgentFallback: UA_FALLBACK,
    path,
    fs,
    nativeImage,
    logger,
    baseDir: __dirname,
    loadSettings,
    isNewInstallation,
    refreshCurrentCharacterLiveTrackingState,
    setActiveGuideState: (nextState) => {
      activeGuideState = nextState;
    },
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
    getWelcomeWindow: () => welcomeWindow,
    ensureClientLogWatcher,
    getOverlayWindow: () => overlayWindow,
    normalizeLiveFeedList,
    createFeedWindowFor,
    setFeedWindows: (nextFeedWindows) => {
      feedWindows = nextFeedWindows;
    },
    getStatus: () => status,
  });

  settings = startupResult.settings;

  try {
    tray = setupTray({
      Tray,
      Menu,
      nativeImage,
      path,
      fs,
      logger,
      baseDir: __dirname,
      app,
      getSettings: () => settings,
      saveSettings,
      createSettingsWindow,
      getSettingsWindow: () => settingsWindow,
      createWelcomeWindow,
      getWelcomeWindow: () => welcomeWindow,
      createNetworthOverlayWindow,
      getNetworthOverlayWindow: () => networthOverlayWindow,
      createBuildOverlayWindow,
      getBuildOverlayWindow: () => buildOverlayWindow,
      createManagementWindow,
      getManagementWindow: () => managementWindow,
      openFeedbackModal,
      setIsQuitting: (value) => {
        isQuitting = !!value;
      },
    });
    logger.info('tray:created:success');
  } catch (err) {
    logger.error('tray:create:failed', { error: String(err), stack: err.stack });
  }

  registerSettingsWindowControlsIpc({
    ipcMain,
    createLoginWindow,
    getLoginWindow: () => loginWindow,
    getSettingsWindow: () => settingsWindow,
  });
});

function applyOverlayLock() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try { updateOverlayMouse(); } catch {}
}

function updateOverlayMouse() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Overlay should always accept clicks when visible
  // Lock only affects draggability of the header (handled in renderer)
  const allowClicks = overlayVisible;
  logger.info('overlay:updateMouse', { overlayVisible, locked: settings.overlayLocked, allowClicks, ignoreMouseEvents: !allowClicks });
  try {
    overlayWindow.setIgnoreMouseEvents(!allowClicks, { forward: true });
  } catch (err) {
    logger.error('overlay:updateMouse:error', { error: String(err) });
  }
}

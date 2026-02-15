const {
  buildRefreshItemScript,
  buildHideoutClickScript,
  buildWhisperClickScript,
} = require('../feed-site-actions');
const { registerSettingsAndManagementIpc } = require('../ipc/settings-management');
const { registerRunSyncIpc } = require('../ipc/run-sync');
const { registerWindowOverlayControlsIpc } = require('../ipc/window-overlay-controls');
const { registerOverlaySiteActionsIpc } = require('../ipc/overlay-site-actions');
const { registerOverlayTestToolsIpc } = require('../ipc/overlay-test-tools');
const { registerBuildAndSettingsUtilityIpc, registerLiveOverlayBridgeIpc } = require('../ipc/ui-bridge');

function registerCoreIpc({
  ipcMain,
  BrowserWindow,
  shell,
  dialog,
  fs,
  logger,
  autoDetectClientLogPath,
  maybeShowLevelUpPopup,
  getSettings,
  setSettings,
  disableAllLiveTracking,
  toggleLiveTrackingForActiveCharacter,
  isValidLiveFeedUrl,
  destroyAllFeeds,
  createFeedWindow,
  normalizeLiveFeedList,
  getFeedWindows,
  setFeedWindows,
  createFeedWindowFor,
  getStatus,
  saveSettings,
  broadcastSettingsUpdate,
  refreshGlobalShortcuts,
  getOverlayWindow,
  createOverlayWindow,
  getNetworthOverlayWindow,
  createNetworthOverlayWindow,
  getBuildOverlayWindow,
  createBuildOverlayWindow,
  getSettingsWindow,
  getManagementWindow,
  createManagementWindow,
  showSettingsWindow,
  toggleSettingsWindow,
  getFeedMeta,
  refreshCurrentCharacterLiveTrackingState,
  ensureClientLogWatcher,
  getActiveGuideState,
  setActiveGuideState,
  getAllFeeds,
  setOverlayVisible,
  getOverlayVisible,
  updateOverlayMouse,
  getManagementAllowFocus,
  setManagementAllowFocus,
  applyOverlayLock,
  onTradeEventObserved,
  isAllowedExternalUrl,
  ensurePoeScriptPath,
  forwardToOverlay,
  ensureOverlayWindow,
}) {
  registerWindowOverlayControlsIpc({
    ipcMain,
    BrowserWindow,
    createManagementWindow,
    getManagementWindow,
    createNetworthOverlayWindow,
    getNetworthOverlayWindow,
    createBuildOverlayWindow,
    getBuildOverlayWindow,
    createOverlayWindow,
    getOverlayWindow,
  });

  registerRunSyncIpc({
    ipcMain,
    logger,
    getManagementWindow,
    getNetworthOverlayWindow,
  });

  registerBuildAndSettingsUtilityIpc({
    ipcMain,
    logger,
    dialog,
    fs,
    autoDetectClientLogPath,
    getSettings,
    saveSettings,
    broadcastSettingsUpdate,
    maybeShowLevelUpPopup,
    createManagementWindow,
    getManagementWindow,
    getActiveGuideState,
    setActiveGuideState,
  });

  registerLiveOverlayBridgeIpc({
    ipcMain,
    shell,
    logger,
    getFeedMeta,
    getSettings,
    saveSettings,
    getManagementWindow,
    getOverlayWindow,
    getSettingsWindow,
    forwardToOverlay,
    isAllowedExternalUrl,
    setOverlayVisible,
    getOverlayVisible,
    updateOverlayMouse,
    getManagementAllowFocus,
    setManagementAllowFocus,
    applyOverlayLock,
    onTradeEventObserved,
  });

  registerOverlaySiteActionsIpc({
    ipcMain,
    logger,
    getAllFeeds,
    getOverlayWindow,
    buildRefreshItemScript,
    buildHideoutClickScript,
    buildWhisperClickScript,
    ensurePoeScriptPath,
  });

  registerOverlayTestToolsIpc({
    ipcMain,
    logger,
    ensureOverlayWindow,
    getOverlayWindow,
    setOverlayVisible,
    updateOverlayMouse,
    forwardToOverlay,
  });

  registerSettingsAndManagementIpc({
    ipcMain,
    logger,
    getSettings,
    setSettings,
    disableAllLiveTracking,
    toggleLiveTrackingForActiveCharacter,
    isValidLiveFeedUrl,
    destroyAllFeeds,
    createFeedWindow,
    normalizeLiveFeedList,
    getFeedWindows,
    setFeedWindows,
    createFeedWindowFor,
    getStatus,
    saveSettings,
    broadcastSettingsUpdate,
    refreshGlobalShortcuts,
    getOverlayWindow,
    getSettingsWindow,
    getManagementWindow,
    showSettingsWindow,
    toggleSettingsWindow,
    getFeedMeta,
    refreshCurrentCharacterLiveTrackingState,
    ensureClientLogWatcher,
  });
}

module.exports = {
  registerCoreIpc,
};

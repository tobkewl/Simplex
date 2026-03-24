const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

const allowedInvokeChannels = new Set([
  'settings:get',
  'settings:set',
  'management:updateFeed',
  'management:addFeed',
  'management:toggleAllFeedsMute',
  'management:deleteFeed',
  'networth:getLastScan',
  'networth-overlay:isVisible',
  'build-overlay:isVisible',
  'build:getActiveGuideState',
  'live-tracking:toggle-active-character',
]);

const allowedSendChannels = new Set([
  'settings:show',
  'settings:toggle',
  'management:setClickThrough',
  'management:setFocusMode',
  'networth:showOverlay',
  'networth:toggleOverlay',
  'build:showOverlay',
  'build:toggleOverlay',
  'run:togglePause',
  'run:requestEnd',
]);

const allowedOnChannels = new Set([
  'management:feedIconUpdate',
  'settings:updated',
  'management:forceOpen',
  'build:positionLevelPopup',
  'build:levelUp',
  'settings:windowOpened',
  'settings:windowClosed',
  'shortcut:buildQuickPreview',
  'shortcut:openSettings',
  'run:timerUpdate',
  'run:started',
  'run:ended',
]);

function safeInvoke(channel, ...args) {
  if (!allowedInvokeChannels.has(channel)) {
    throw new Error(`IPC invoke not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function safeSend(channel, ...args) {
  if (!allowedSendChannels.has(channel)) {
    throw new Error(`IPC send not allowed: ${channel}`);
  }
  ipcRenderer.send(channel, ...args);
}

function safeOn(channel, callback) {
  if (!allowedOnChannels.has(channel)) {
    throw new Error(`IPC on not allowed: ${channel}`);
  }
  if (typeof callback !== 'function') {
    throw new Error('IPC on callback must be a function');
  }
  ipcRenderer.on(channel, (_e, ...args) => callback(...args));
}

contextBridge.exposeInMainWorld('managementAPI', {
  getPublicConfig: () => ({
    gearImagesBaseUrl:
      process.env.NEXT_PUBLIC_GEAR_IMAGES_BASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      '',
    gearImagesBucket: process.env.NEXT_PUBLIC_GEAR_IMAGES_BUCKET || 'gear-images',
  }),
  getSettings: () => safeInvoke('settings:get'),

  updateSettings: (partial) => safeInvoke('settings:set', partial),

  saveSettings: (partial) => safeInvoke('settings:set', partial),

  updateFeed: (feedId, updates) => safeInvoke('management:updateFeed', feedId, updates),

  addFeed: (feed) => safeInvoke('management:addFeed', feed),

  deleteFeed: (feedId) => safeInvoke('management:deleteFeed', feedId),

  toggleAllFeedsMute: () => safeInvoke('management:toggleAllFeedsMute'),

  // Open the focusable Settings window (Feeds tab) for adding feeds
  openSettings: (tab) => safeSend('settings:show', tab),
  toggleSettings: (tab) => safeSend('settings:toggle', tab),

  onFeedIconUpdate: (cb) => {
    safeOn('management:feedIconUpdate', cb);
  },

  onSettingsUpdated: (cb) => {
    safeOn('settings:updated', cb);
  },

  onForceOpen: (cb) => {
    safeOn('management:forceOpen', cb);
  },
  onPositionLevelPopup: (cb) => {
    safeOn('build:positionLevelPopup', cb);
  },

  setClickThrough: (enabled) => {
    safeSend('management:setClickThrough', enabled);
  },
  setFocusMode: (enabled) => {
    safeSend('management:setFocusMode', enabled);
  },

  // Net Worth API
  getLastScan: () => safeInvoke('networth:getLastScan'),
  openNetworthOverlay: () => safeSend('networth:showOverlay'),
  toggleNetworthOverlay: () => safeSend('networth:toggleOverlay'),
  isNetworthOverlayVisible: () => safeInvoke('networth-overlay:isVisible'),

  // Build Guide API
  openBuildOverlay: () => safeSend('build:showOverlay'),
  toggleBuildOverlay: () => safeSend('build:toggleOverlay'),
  isBuildOverlayVisible: () => safeInvoke('build-overlay:isVisible'),
  getActiveGuideState: () => safeInvoke('build:getActiveGuideState'),
  toggleLiveTrackingForActiveCharacter: (options) => safeInvoke('live-tracking:toggle-active-character', options || {}),
  onBuildLevelUp: (cb) => {
    safeOn('build:levelUp', cb);
  },

  // Settings window events
  onSettingsWindowOpened: (cb) => {
    safeOn('settings:windowOpened', cb);
  },
  onSettingsWindowClosed: (cb) => {
    safeOn('settings:windowClosed', cb);
  },
  onShortcutBuildQuickPreview: (cb) => {
    safeOn('shortcut:buildQuickPreview', cb);
  },
  onShortcutOpenSettings: (cb) => {
    safeOn('shortcut:openSettings', cb);
  },

  // Run timer events
  onRunTimerUpdate: (cb) => {
    safeOn('run:timerUpdate', cb);
  },
  onRunStarted: (cb) => {
    safeOn('run:started', cb);
  },
  onRunEnded: (cb) => {
    safeOn('run:ended', cb);
  },
  toggleRunPause: () => safeSend('run:togglePause'),
  requestRunEnd: () => safeSend('run:requestEnd')
});

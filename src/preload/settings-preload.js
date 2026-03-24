const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

const allowedInvokeChannels = new Set([
  'settings:get',
  'settings:set',
  'settings:browseClientLog',
  'settings:autoDetectClientLog',
  'settings:checkFileExists',
  'status:get',
  'logs:open',
  'logs:getPath',
  'app:getInfo',
  'app:getPublicBaseUrl',
  'logs:openFile',
  'build:simulateLevelUp',
  'live-tracking:disable-all',
  'live-tracking:toggle-active-character',
  'auth:check',
  'auth:logout',
  'shell:openExternal',
  'api:get-poe-oauth-status',
  'feedback:submit',
  'login:checkStatus',
]);

const allowedSendChannels = new Set([
  'settings:openLogin',
  'settings:connectFeed',
  'settings:connectFeeds',
  'settings:connectFeedsV2',
  'overlay:setLocked',
  'management:show',
  'whispers:show',
  'welcome:close',
  'settings:show',
  'build:positionLevelPopup',
  'app:relaunch',
]);

const allowedOnChannels = new Set([
  'settings:updated',
  'settings:switchTab',
  'settings:window-ready',
  'feedback:open',
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

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => safeInvoke('settings:get'),
  set: (partial) => safeInvoke('settings:set', partial),
  openLogin: () => safeSend('settings:openLogin'),
  connectFeed: (url) => safeSend('settings:connectFeed', url),
  connectFeeds: (urls) => safeSend('settings:connectFeeds', urls),
  connectFeedsV2: (feeds) => safeSend('settings:connectFeedsV2', feeds),
  setOverlayLocked: (locked) => safeSend('overlay:setLocked', locked),
  showManagement: () => safeSend('management:show'),
  showWhispers: () => safeSend('whispers:show'),
    browseClientLog: () => safeInvoke('settings:browseClientLog'),
    autoDetectClientLog: () => safeInvoke('settings:autoDetectClientLog'),
    checkFileExists: (filePath) => safeInvoke('settings:checkFileExists', filePath),
  getStatus: () => safeInvoke('status:get'),
  openLogs: () => safeInvoke('logs:open'),
  getLogPath: () => safeInvoke('logs:getPath'),
  getAppInfo: () => safeInvoke('app:getInfo'),
  getPublicBaseUrl: () => safeInvoke('app:getPublicBaseUrl'),
  openLogFile: (filePath) => safeInvoke('logs:openFile', filePath),
  closeWelcomeWindow: () => safeSend('welcome:close'),
  openSettings: () => safeSend('settings:show'),
  simulateLevelUp: () => safeInvoke('build:simulateLevelUp'),
  positionLevelPopup: () => safeSend('build:positionLevelPopup'),
  disableAllLiveTracking: () => safeInvoke('live-tracking:disable-all'),
  toggleLiveTrackingForActiveCharacter: (options) => safeInvoke('live-tracking:toggle-active-character', options || {}),
  authCheck: () => safeInvoke('auth:check'),
  authLogout: () => safeInvoke('auth:logout'),
  appRelaunch: () => safeSend('app:relaunch'),
  openExternal: (url) => safeInvoke('shell:openExternal', url),
  getPoeOAuthStatus: () => safeInvoke('api:get-poe-oauth-status'),
  submitFeedback: (payload) => safeInvoke('feedback:submit', payload),
  onSettingsUpdated: (cb) => {
    safeOn('settings:updated', cb);
  },
  onSwitchTab: (cb) => {
    safeOn('settings:switchTab', cb);
  },
  onWindowReady: (cb) => {
    safeOn('settings:window-ready', cb);
  },
  onFeedbackOpen: (cb) => {
    safeOn('feedback:open', cb);
  }
});

// Login API
contextBridge.exposeInMainWorld('loginAPI', {
  checkStatus: () => safeInvoke('login:checkStatus')
});


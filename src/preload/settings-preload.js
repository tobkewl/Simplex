const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (partial) => ipcRenderer.invoke('settings:set', partial),
  openLogin: () => ipcRenderer.send('settings:openLogin'),
  connectFeed: (url) => ipcRenderer.send('settings:connectFeed', url),
  connectFeeds: (urls) => ipcRenderer.send('settings:connectFeeds', urls),
  connectFeedsV2: (feeds) => ipcRenderer.send('settings:connectFeedsV2', feeds),
  setOverlayLocked: (locked) => ipcRenderer.send('overlay:setLocked', locked),
  showManagement: () => ipcRenderer.send('management:show'),
  showWhispers: () => ipcRenderer.send('whispers:show'),
    browseClientLog: () => ipcRenderer.invoke('settings:browseClientLog'),
    autoDetectClientLog: () => ipcRenderer.invoke('settings:autoDetectClientLog'),
    checkFileExists: (filePath) => ipcRenderer.invoke('settings:checkFileExists', filePath),
  getStatus: () => ipcRenderer.invoke('status:get'),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  getLogPath: () => ipcRenderer.invoke('logs:getPath'),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getPublicBaseUrl: () => ipcRenderer.invoke('app:getPublicBaseUrl'),
  openLogFile: (filePath) => ipcRenderer.invoke('logs:openFile', filePath),
  closeWelcomeWindow: () => ipcRenderer.send('welcome:close'),
  openSettings: () => ipcRenderer.send('settings:show'),
  simulateLevelUp: () => ipcRenderer.invoke('build:simulateLevelUp'),
  positionLevelPopup: () => ipcRenderer.send('build:positionLevelPopup'),
  disableAllLiveTracking: () => ipcRenderer.invoke('live-tracking:disable-all'),
  toggleLiveTrackingForActiveCharacter: (options) => ipcRenderer.invoke('live-tracking:toggle-active-character', options || {}),
  authCheck: () => ipcRenderer.invoke('auth:check'),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  appRelaunch: () => ipcRenderer.send('app:relaunch'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getPoeOAuthStatus: () => ipcRenderer.invoke('api:get-poe-oauth-status'),
  submitFeedback: (payload) => ipcRenderer.invoke('feedback:submit', payload),
  onSettingsUpdated: (cb) => {
    ipcRenderer.on('settings:updated', (_e, settings) => {
      cb(settings);
    });
  },
  onSwitchTab: (cb) => {
    ipcRenderer.on('settings:switchTab', (_e, tab) => {
      cb(tab);
    });
  },
  onWindowReady: (cb) => {
    ipcRenderer.on('settings:window-ready', () => {
      cb();
    });
  },
  onFeedbackOpen: (cb) => {
    ipcRenderer.on('feedback:open', (_e, type) => {
      cb(type);
    });
  }
});

// Login API
contextBridge.exposeInMainWorld('loginAPI', {
  checkStatus: () => ipcRenderer.invoke('login:checkStatus')
});


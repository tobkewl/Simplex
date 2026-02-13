const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

contextBridge.exposeInMainWorld('managementAPI', {
  getPublicConfig: () => ({
    gearImagesBaseUrl:
      process.env.NEXT_PUBLIC_GEAR_IMAGES_BASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      '',
    gearImagesBucket: process.env.NEXT_PUBLIC_GEAR_IMAGES_BUCKET || 'gear-images',
  }),
  getSettings: () => ipcRenderer.invoke('settings:get'),

  updateSettings: (partial) => ipcRenderer.invoke('settings:set', partial),

  saveSettings: (partial) => ipcRenderer.invoke('settings:set', partial),

  updateFeed: (feedId, updates) => ipcRenderer.invoke('management:updateFeed', feedId, updates),

  addFeed: (feed) => ipcRenderer.invoke('management:addFeed', feed),

  deleteFeed: (feedId) => ipcRenderer.invoke('management:deleteFeed', feedId),

  toggleAllFeedsMute: () => ipcRenderer.invoke('management:toggleAllFeedsMute'),

  // Open the focusable Settings window (Feeds tab) for adding feeds
  openSettings: (tab) => ipcRenderer.send('settings:show', tab),
  toggleSettings: (tab) => ipcRenderer.send('settings:toggle', tab),

  onFeedIconUpdate: (cb) => {
    ipcRenderer.on('management:feedIconUpdate', (_e, data) => {
      cb(data);
    });
  },

  onSettingsUpdated: (cb) => {
    ipcRenderer.on('settings:updated', (_e, settings) => {
      cb(settings);
    });
  },

  onForceOpen: (cb) => {
    ipcRenderer.on('management:forceOpen', () => {
      cb();
    });
  },
  onPositionLevelPopup: (cb) => {
    ipcRenderer.on('build:positionLevelPopup', () => {
      cb();
    });
  },

  setClickThrough: (enabled) => {
    ipcRenderer.send('management:setClickThrough', enabled);
  },
  setFocusMode: (enabled) => {
    ipcRenderer.send('management:setFocusMode', enabled);
  },

  // Net Worth API
  getLastScan: () => ipcRenderer.invoke('networth:getLastScan'),
  openNetworthOverlay: () => ipcRenderer.send('networth:showOverlay'),
  toggleNetworthOverlay: () => ipcRenderer.send('networth:toggleOverlay'),
  isNetworthOverlayVisible: () => ipcRenderer.invoke('networth-overlay:isVisible'),

  // Build Guide API
  openBuildOverlay: () => ipcRenderer.send('build:showOverlay'),
  toggleBuildOverlay: () => ipcRenderer.send('build:toggleOverlay'),
  isBuildOverlayVisible: () => ipcRenderer.invoke('build-overlay:isVisible'),
  getActiveGuideState: () => ipcRenderer.invoke('build:getActiveGuideState'),
  toggleLiveTrackingForActiveCharacter: (options) => ipcRenderer.invoke('live-tracking:toggle-active-character', options || {}),
  onBuildLevelUp: (cb) => {
    ipcRenderer.on('build:levelUp', (_e, payload) => {
      cb(payload);
    });
  },

  // Settings window events
  onSettingsWindowOpened: (cb) => {
    ipcRenderer.on('settings:windowOpened', (_e, tab) => {
      cb(tab);
    });
  },
  onSettingsWindowClosed: (cb) => {
    ipcRenderer.on('settings:windowClosed', () => {
      cb();
    });
  },
  onShortcutBuildQuickPreview: (cb) => {
    ipcRenderer.on('shortcut:buildQuickPreview', () => {
      cb();
    });
  },
  onShortcutOpenSettings: (cb) => {
    ipcRenderer.on('shortcut:openSettings', () => {
      cb();
    });
  },

  // Run timer events
  onRunTimerUpdate: (cb) => {
    ipcRenderer.on('run:timerUpdate', (_e, data) => {
      cb(data);
    });
  },
  onRunStarted: (cb) => {
    ipcRenderer.on('run:started', () => {
      cb();
    });
  },
  onRunEnded: (cb) => {
    ipcRenderer.on('run:ended', () => {
      cb();
    });
  },
  toggleRunPause: () => ipcRenderer.send('run:togglePause')
});

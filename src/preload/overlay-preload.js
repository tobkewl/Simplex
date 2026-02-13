const { contextBridge, ipcRenderer, clipboard } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

contextBridge.exposeInMainWorld('overlayAPI', {
  onNewItems: (cb) => {
    ipcRenderer.on('poe-live:new-items', (_e, items) => {
      cb(items);
    });
  },
  onRemoved: (cb) => {
    ipcRenderer.on('poe-live:removed', (_e, ids) => {
      cb(ids);
    });
  },
  onSettingsUpdated: (cb) => {
    ipcRenderer.on('settings:updated', (_e, settings) => {
      cb(settings);
    });
  },
  onRaw: (cb) => ipcRenderer.on('poe-live:raw', (_e, raw) => cb(raw)),
  onRateLimited: (cb) => {
    ipcRenderer.on('poe-live:rate-limited', () => {
      cb();
    });
  },
  openExternal: (url) => {
    ipcRenderer.send('overlay:openExternal', url);
  },
  copy: (text) => {
    clipboard.writeText(text || '');
  },
  sendToGame: (text) => {
    ipcRenderer.send('overlay:sendToGame', text);
  },
  clickHideoutOnSite: (itemId) => {
    ipcRenderer.send('overlay:clickHideoutOnSite', itemId);
  },
  clickWhisperOnSite: (itemId) => {
    ipcRenderer.send('overlay:clickWhisperOnSite', itemId);
  },
  refreshItemOnSite: (itemId) => {
    ipcRenderer.send('overlay:refreshItemOnSite', itemId);
  },
  onItemUnavailable: (cb) => {
    ipcRenderer.on('poe-live:item-unavailable', (_e, itemId) => {
      cb(itemId);
    });
  },
  onNewWhisper: (cb) => {
    ipcRenderer.on('overlay:new-whisper', (_e, whisper) => {
      cb(whisper);
    });
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getState: () => ipcRenderer.invoke('overlay:getState'),
  setLocked: (locked) => {
    ipcRenderer.send('overlay:setLocked', locked);
  },
  setVisible: (visible) => {
    ipcRenderer.send('overlay:setVisible', !!visible);
  },
  resizeWindow: (width, height) => {
    ipcRenderer.send('overlay:resize', { width, height });
  },
  onSettingsWindowOpened: (cb) => {
    ipcRenderer.on('settings:windowOpened', (_e, tab) => {
      cb(tab);
    });
  },
  onSettingsWindowClosed: (cb) => {
    ipcRenderer.on('settings:windowClosed', () => {
      cb();
    });
  }
});

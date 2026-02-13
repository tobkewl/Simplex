const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

contextBridge.exposeInMainWorld('networthOverlayAPI', {
  close: () => ipcRenderer.send('networth-overlay:close'),
  minimize: () => ipcRenderer.send('networth-overlay:minimize'),
  maximize: () => ipcRenderer.send('networth-overlay:maximize'),
  isMaximized: () => ipcRenderer.invoke('networth-overlay:isMaximized'),
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (_event, value) => callback(Boolean(value)));
  },
});

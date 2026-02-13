const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

contextBridge.exposeInMainWorld('countdownAPI', {
  togglePause: () => ipcRenderer.send('countdown:togglePause'),
  stopRun: () => ipcRenderer.send('countdown:stopRun'),
  onTimerUpdate: (callback) => ipcRenderer.on('countdown:update', (_event, data) => callback(data))
});

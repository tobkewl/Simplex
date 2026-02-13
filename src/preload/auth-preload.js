const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

const allowedInvokeChannels = new Set([
  'auth:device-login-start',
  'auth:device-login-poll',
  'auth:get-remember',
  'auth:check',
  'shell:openExternal',
]);

const allowedSendChannels = new Set([
  'auth:close-window',
  'auth:show-window',
  'auth:hide-window',
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

contextBridge.exposeInMainWorld('authAPI', {
  invoke: safeInvoke,
  send: safeSend,
});

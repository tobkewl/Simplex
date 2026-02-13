const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

const allowedInvokeChannels = new Set([
  'api:get-build',
  'api:get-builds',
  'api:get-followed-guides',
  'api:get-public-live-builds',
  'api:get-public-guides',
  'api:set-guide-follow',
  'api:get-gear-items',
  'auth:check',
  'build:setActiveGuideState',
  'build:saveBuild',
  'build:getActiveBuild',
]);

const allowedOnChannels = new Set([
  'build:localLevelUp',
]);

function safeInvoke(channel, ...args) {
  if (!allowedInvokeChannels.has(channel)) {
    throw new Error(`IPC invoke not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function safeOn(channel, callback) {
  if (!allowedOnChannels.has(channel)) {
    throw new Error(`IPC on not allowed: ${channel}`);
  }
  if (typeof callback !== 'function') {
    throw new Error('IPC on callback must be a function');
  }
  const wrapped = (_event, ...args) => callback(_event, ...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

function resolvePublicBaseUrl() {
  const direct = process.env.SIMPLEX_PUBLIC_BASE_URL || process.env.SIMPLEX_AUTH_BASE_URL || '';
  if (direct) return direct.replace(/\/$/, '');
  const apiBase = process.env.API_BASE_URL || '';
  if (!apiBase) return '';
  return apiBase.replace(/\/api\/client\/?$/, '').replace(/\/$/, '');
}

const publicConfig = {
  gearImagesBaseUrl: process.env.NEXT_PUBLIC_GEAR_IMAGES_BASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  gearImagesBucket: process.env.NEXT_PUBLIC_GEAR_IMAGES_BUCKET || 'gear-images',
  publicBaseUrl: resolvePublicBaseUrl(),
};

contextBridge.exposeInMainWorld('buildOverlayAPI', {
  ipcRenderer: {
    invoke: safeInvoke,
    on: safeOn,
  },
  getPublicConfig: () => ({ ...publicConfig }),
});

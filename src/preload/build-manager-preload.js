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
]);

function safeInvoke(channel, ...args) {
  if (!allowedInvokeChannels.has(channel)) {
    throw new Error(`IPC invoke not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
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

contextBridge.exposeInMainWorld('buildManagerAPI', {
  ipcRenderer: {
    invoke: safeInvoke,
  },
  getPublicConfig: () => ({ ...publicConfig }),
});

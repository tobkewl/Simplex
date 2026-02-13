const fs = require('fs');
const path = require('path');

function resolveEnvFilename() {
  let envRaw = process.env.SIMPLEX_ENV || process.env.APP_ENV || process.env.NODE_ENV;

  if (!envRaw) {
    try {
      const { app } = require('electron');
      if (app?.isPackaged) envRaw = 'production';
    } catch {}
  }

  if (!envRaw) envRaw = 'development';
  const env = String(envRaw).toLowerCase();

  if (env === 'production') return '.env.production';
  if (env === 'development') return '.env.development';
  return '.env';
}

function getSearchRoots() {
  const roots = new Set();
  try { roots.add(process.cwd()); } catch {}
  try { if (process.resourcesPath) roots.add(process.resourcesPath); } catch {}
  try { if (process.execPath) roots.add(path.dirname(process.execPath)); } catch {}
  try {
    const { app } = require('electron');
    if (app?.getAppPath) roots.add(app.getAppPath());
    if (app?.getPath) roots.add(app.getPath('userData'));
  } catch {}
  return Array.from(roots);
}

function findEnvFile() {
  const filename = resolveEnvFilename();
  const roots = getSearchRoots();

  for (const root of roots) {
    const candidate = path.resolve(root, filename);
    if (fs.existsSync(candidate)) return candidate;
  }

  if (filename !== '.env') {
    for (const root of roots) {
      const fallback = path.resolve(root, '.env');
      if (fs.existsSync(fallback)) return fallback;
    }
  }

  return null;
}

function loadEnv() {
  let dotenvConfig;
  try {
    dotenvConfig = require('dotenv').config;
  } catch (err) {
    return { error: err };
  }

  const envPath = findEnvFile();
  if (envPath) {
    return dotenvConfig({ path: envPath });
  }

  return dotenvConfig();
}

module.exports = { loadEnv };

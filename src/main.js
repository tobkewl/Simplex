const { app, BrowserWindow, ipcMain, shell, session, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('node-fetch');
const { autoUpdater } = require('electron-updater');
const logger = require('./common/logger');
const ClientLogWatcher = require('./common/client-log-watcher');
const { loadEnv } = require('./config/loadEnv');

// Auth integration
const { initializeAuth, requireAuth, getAuth } = require('./services/authIntegration');
const BuildApiClient = require('./api/buildApiClient');

// Keep dev settings isolated from production installs.
if (!app.isPackaged) {
  const devUserData = path.join(app.getPath('appData'), `${app.getName()} (dev)`);
  app.setPath('userData', devUserData);
  process.env.SIMPLEX_USER_DATA_PATH = devUserData;
}

const PARTITION = 'persist:poe';
const UA_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';
let overlayWindow = null;
let feedWindow = null;
let feedWindows = [];
let settingsWindow = null;
let loginWindow = null;
let managementWindow = null;
let managementAllowFocus = false;
let networthWindow = null;
let networthOverlayWindow = null;
let buildOverlayWindow = null;
let welcomeWindow = null;
let countdownTimerWindow = null;
let overlayVisible = false;
let tray = null;
let isQuitting = false;
const feedMeta = new Map();
let status = { activeFeeds: 0, lastEventTs: 0, lastConnectTs: 0 };
let clientLogWatcher = null;

// Auth & API
let authService = null;
let apiClient = null;
let buildManagerWindow = null;
let activeGuideState = null;
const registeredShortcuts = {
  buildQuickPreview: null,
  openSettings: null
};

// Persisted PowerShell helper script to interact with PoE using SendInput
const POE_PS_SCRIPT_NAME = 'send-to-poe.ps1';
let poeScriptPath = null;

function getPoeScriptPath() {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, POE_PS_SCRIPT_NAME);
  } catch (e) {
    // Fallback: current working directory
    return path.join(process.cwd(), POE_PS_SCRIPT_NAME);
  }
}

// Writes PowerShell helper script that sends keyboard input to PoE
// Uses keybd_event API (legacy but reliable) - optimized for low-latency dispatch
function writePoeScript() {
  if (!poeScriptPath) poeScriptPath = getPoeScriptPath();
  const L = [];
  L.push("Add-Type @'");
  L.push('using System;');
  L.push('using System.Runtime.InteropServices;');
  L.push('using System.Text;');
  L.push('public class WinAPI {');
  L.push('  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);');
  L.push('  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);');
  L.push('  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);');
  L.push('  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);');
  L.push('  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);');
  L.push('  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);');
  L.push('  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);');
  L.push('  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();');
  L.push('  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();');
  L.push('  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);');
  L.push('  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);');
  L.push('  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);');
  L.push('  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);');
  L.push('  public const uint KEYEVENTF_KEYUP = 0x0002;');
  L.push('}');
  L.push("'@");
  L.push('');
  L.push('$poeHandle = [IntPtr]::Zero');
  L.push("$wantedTitles = @('Path of Exile','Path of Exile 2','Path of Exile on GeForce NOW','Path of Exile 2 on GeForce NOW')");
  L.push('$callback = {');
  L.push('  param($hwnd, $lParam)');
  L.push('  $className = New-Object System.Text.StringBuilder 256');
  L.push('  [WinAPI]::GetClassName($hwnd, $className, $className.Capacity) | Out-Null');
  L.push('  $class = $className.ToString()');
  L.push("  if ($class -eq 'POEWindowClass') { $script:poeHandle = $hwnd; return $false }");
  L.push('  $title = New-Object System.Text.StringBuilder 512');
  L.push('  [WinAPI]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null');
  L.push('  if ($wantedTitles -contains $title.ToString()) { $script:poeHandle = $hwnd; return $false }');
  L.push('  return $true');
  L.push('}');
  L.push('[WinAPI]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null');
  L.push("if ($poeHandle -eq [IntPtr]::Zero) { Write-Output 'ERROR:NO_POE_WINDOW'; exit 1 }");
  L.push("Write-Output 'FOUND:POE_WINDOW'");
  L.push('');
  L.push('$currentThread = [WinAPI]::GetCurrentThreadId()');
  L.push('$targetThread = [WinAPI]::GetWindowThreadProcessId($poeHandle, [IntPtr]::Zero)');
  L.push('[WinAPI]::AttachThreadInput($currentThread, $targetThread, $true) | Out-Null');
  L.push('[WinAPI]::BringWindowToTop($poeHandle) | Out-Null');
  L.push('[WinAPI]::SetForegroundWindow($poeHandle) | Out-Null');
  L.push('[WinAPI]::SetFocus($poeHandle) | Out-Null');
  L.push('[WinAPI]::AttachThreadInput($currentThread, $targetThread, $false) | Out-Null');
  L.push('');
  L.push('$maxWait = 100; $waited = 0');
  L.push('while ($waited -lt $maxWait) {');
  L.push('  if ([WinAPI]::GetForegroundWindow() -eq $poeHandle) { break }');
  L.push('  Start-Sleep -Milliseconds 1; $waited++');
  L.push('}');
  L.push("if ($waited -ge $maxWait) { Write-Output 'WARN:FOCUS_TIMEOUT' }");
  L.push("Write-Output 'FOCUS_OK'");
  L.push('');
  L.push('$VK_RETURN = 0x0D; $VK_CONTROL = 0x11; $VK_V = 0x56; $VK_A = 0x41; $VK_MENU = 0x12');
  L.push('');
  L.push('# Clear Alt');
  L.push('[WinAPI]::keybd_event([byte]$VK_MENU, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_MENU, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push('');
  L.push('# Enter (open chat)');
  L.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push('');
  L.push('# Ctrl+A (select all) - minimal delay');
  L.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_A, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_A, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push('');
  L.push('# Ctrl+V (paste) - minimal delay');
  L.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_V, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_V, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_CONTROL, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push('');
  L.push('# Enter (send)');
  L.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, 0, [UIntPtr]::Zero)');
  L.push('[WinAPI]::keybd_event([byte]$VK_RETURN, 0, [WinAPI]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)');
  L.push("Write-Output 'SUCCESS'");
  try {
    const body = L.join('\r\n')
      .replace(/@\\\"/g, '@"')
      .replace(/\\\"@/g, '"@')
      .replace(/\\\"/g, '"');
    fs.writeFileSync(poeScriptPath, body, 'utf8');
  } catch (e) { try { logger.error('poe:script:write-failed', { error: String(e) }); } catch {} }
  return poeScriptPath;
}

const defaultSettings = {
  liveUrl: '',
  visibleSeconds: 6,
  showOnNewItem: true,
  clickToDismiss: true,
  overlayLocked: false,
  overlayBounds: null,
  liveUrls: [],
  feeds: [],           // New: array of {id, url, name}
  displayFeedName: false,  // New: show feed name instead of item name
  showModRanges: true,  // New: show mod ranges like [24-28]
  showManagementByDefault: false,  // New: show management overlay by default
  accentYellow: 'warm',
  readOnly: true,
  clientLogPath: null,  // Path to Client.txt file
  liveSearchesEnabled: true,  // Enable/disable live search functionality
  whispersEnabled: true,  // Enable/disable whisper functionality
  buildGuideEnabled: true,
  buildLevelDetection: 'auto',
  buildManualLevel: 1,
  characterLevel: 1,
  buildLevelPopupEnabled: false,
  activeBuild: null,
  activeGuideState: null,
  buildQuickPreviewShowTree: true,
  buildQuickPreviewShowSkills: true,
  buildQuickPreviewShowGear: true,
  buildQuickPreviewPosition: null,
  buildQuickPreviewShortcut: null,
  openSettingsShortcut: null,
  buildQuickPreviewControllerCombo: null,
  buildQuickPreviewControllerEnabled: false,
  openSettingsControllerCombo: null,
  openSettingsControllerEnabled: false,
  controllerType: 'auto',
  netWorthVisibility: 'disabled',
  tutorialCompleted: false,  // Track if welcome tutorial has been completed
  liveTrackingDefaultVisibility: 'private',
  liveTrackingPending: null,
  liveTrackingByCharacter: {},
  activeCharacterName: null,
  activeCharacterLeague: null,
  activeCharacterClass: null,
  activeCharacterSeenAt: null,
  currentCharacterLiveTracking: null
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// Check if this is a new installation
function isNewInstallation() {
  const p = settingsPath();
  return !fs.existsSync(p);
}

function loadSettings() {
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged = { ...defaultSettings, ...parsed };
      const normalizeShortcutValue = (value) => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      };
      merged.buildQuickPreviewShortcut = normalizeShortcutValue(merged.buildQuickPreviewShortcut);
      merged.openSettingsShortcut = normalizeShortcutValue(merged.openSettingsShortcut);
      merged.buildQuickPreviewControllerCombo = normalizeShortcutValue(merged.buildQuickPreviewControllerCombo);
      merged.openSettingsControllerCombo = normalizeShortcutValue(merged.openSettingsControllerCombo);
      if (!['auto', 'xbox', 'playstation', 'nintendo', 'generic'].includes(merged.controllerType)) {
        merged.controllerType = 'auto';
      }
      if (typeof merged.buildQuickPreviewControllerEnabled !== 'boolean') {
        merged.buildQuickPreviewControllerEnabled = false;
      }
      if (typeof merged.openSettingsControllerEnabled !== 'boolean') {
        merged.openSettingsControllerEnabled = false;
      }

      // Migrate old liveUrls to new feeds structure
      if (Array.isArray(merged.liveUrls) && merged.liveUrls.length > 0 && (!merged.feeds || merged.feeds.length === 0)) {
        merged.feeds = merged.liveUrls.map((url, idx) => ({
          id: `feed-${Date.now()}-${idx}`,
          url: url,
          name: `Feed ${idx + 1}`,
          icon: null  // Will be set when first item arrives
        }));
        logger.info('settings:migrated-feeds', { count: merged.feeds.length });
      }

      // Ensure all feeds have an icon property and remove any mute status (mute is temporary)
      if (Array.isArray(merged.feeds)) {
        merged.feeds = merged.feeds.map(feed => {
          const { muted, ...feedWithoutMuted } = feed;
          return {
            ...feedWithoutMuted,
            icon: feedWithoutMuted.icon || null  // Preserve existing icon or set to null
          };
        });
      }

      if (!merged.liveTrackingByCharacter || typeof merged.liveTrackingByCharacter !== 'object') {
        merged.liveTrackingByCharacter = {};
      }
      if (merged.liveTrackingDefaultVisibility !== 'public' && merged.liveTrackingDefaultVisibility !== 'private') {
        merged.liveTrackingDefaultVisibility = 'private';
      }
      if (merged.liveTrackingPending && typeof merged.liveTrackingPending !== 'object') {
        merged.liveTrackingPending = null;
      }
      if (typeof merged.activeCharacterName !== 'string' || !merged.activeCharacterName.trim()) {
        merged.activeCharacterName = null;
      }
      if (typeof merged.activeCharacterLeague !== 'string' || !merged.activeCharacterLeague.trim()) {
        merged.activeCharacterLeague = null;
      }
      if (typeof merged.activeCharacterClass !== 'string' || !merged.activeCharacterClass.trim()) {
        merged.activeCharacterClass = null;
      }
      if (!Number.isFinite(merged.activeCharacterSeenAt)) {
        merged.activeCharacterSeenAt = null;
      }

      try {
        settings = merged;
        refreshCurrentCharacterLiveTrackingState();
      } catch {}

      logger.info('settings:loaded', { 
        clientLogPath: merged.clientLogPath,
        path: p 
      });
      return merged;
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
    logger.error('settings:load-failed', { error: String(e) });
  }
  logger.info('settings:using-defaults');
  return { ...defaultSettings };
}

function saveSettings(s) {
  try {
    // Remove mute status from all feeds before saving (mute is temporary, not persisted)
    const cleanedSettings = { ...s };
    if (Array.isArray(cleanedSettings.feeds)) {
      cleanedSettings.feeds = cleanedSettings.feeds.map(feed => {
        const { muted, ...feedWithoutMuted } = feed;
        return feedWithoutMuted;
      });
    }
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const settingsFile = settingsPath();
    fs.writeFileSync(settingsFile, JSON.stringify(cleanedSettings, null, 2));
    logger.info('settings:saved', { 
      clientLogPath: cleanedSettings.clientLogPath,
      path: settingsFile 
    });
  } catch (e) {
    console.error('Failed to save settings:', e);
    logger.error('settings:save-failed', { error: String(e) });
  }
}

let settings = null;

function resolveFeedbackBaseUrl() {
  if (process.env.SIMPLEX_PUBLIC_BASE_URL) {
    return process.env.SIMPLEX_PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/api\/client\/?$/, '');
  }
  return 'https://simplex.gg';
}

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'simplex.gg',
  'www.simplex.gg',
  'localhost',
  '127.0.0.1',
  'pathofexile.com',
  'www.pathofexile.com',
]);

function isAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  const value = rawUrl.trim();
  if (!value) return false;
  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
}

function isValidLiveFeedUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  const value = rawUrl.trim();
  if (!value) return false;
  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'www.pathofexile.com' && host !== 'pathofexile.com') return false;
  return /^\/trade\/search\/[^/]+\/[^/]+\/live\/?$/.test(parsed.pathname);
}

function normalizeLiveFeedList(feeds) {
  if (!Array.isArray(feeds)) return [];
  const seen = new Set();
  const normalized = [];
  for (const feed of feeds) {
    if (!feed || typeof feed.url !== 'string') continue;
    const url = feed.url.trim();
    if (!isValidLiveFeedUrl(url) || seen.has(url)) continue;
    seen.add(url);
    normalized.push({
      ...feed,
      id:
        typeof feed.id === 'string' && feed.id.trim()
          ? feed.id.trim()
          : `feed-${Date.now()}-${normalized.length}`,
      name:
        typeof feed.name === 'string' && feed.name.trim()
          ? feed.name.trim()
          : `Feed ${normalized.length + 1}`,
      url,
      muted: !!feed.muted,
    });
  }
  return normalized;
}

const NETWORTH_FEATURE_DISABLED_MESSAGE =
  'Stash features are disabled in this open-source client build.';

function registerNetworthDisabledIpcHandlers() {
  const defaults = {
    'networth:getLeagues': [],
    'networth:getStashTabs': [],
    'networth:scanStashes': {
      success: false,
      error: NETWORTH_FEATURE_DISABLED_MESSAGE,
      scan: null,
      comparison: null,
    },
    'networth:getLastScan': null,
    'networth:getScanHistory': [],
    'networth:getCachedStashTabs': {
      numTabs: 0,
      tabs: [],
      rateLimited: false,
      retryAt: null,
      timestamp: null,
    },
    'networth:getLastLeague': null,
    'networth:setLastLeague': false,
    'networth:startRun': { success: false, error: NETWORTH_FEATURE_DISABLED_MESSAGE },
    'networth:stopRun': { success: false, error: NETWORTH_FEATURE_DISABLED_MESSAGE },
    'networth:getRuns': [],
    'networth:getActiveRun': null,
    'networth:priceItem': { success: false, error: NETWORTH_FEATURE_DISABLED_MESSAGE },
    'networth:getPricingQueue': [],
    'networth:resumePricingQueue': false,
    'networth:getTaskQueue': { pricing: [], scan: [] },
    'networth:removePricingQueueItem': false,
    'networth:clearPricingQueue': false,
    'networth:enqueuePricingItems': { queued: 0, error: NETWORTH_FEATURE_DISABLED_MESSAGE },
    'networth:saveManualPricing': { success: false, error: NETWORTH_FEATURE_DISABLED_MESSAGE },
    'networth:enqueueScanTask': null,
    'networth:getScanQueue': [],
    'networth:removeScanQueueItem': false,
    'networth:clearScanQueue': false,
    'networth:savePricingOverride': false,
    'networth:getPricingOverride': null,
  };
  for (const [channel, value] of Object.entries(defaults)) {
    try {
      ipcMain.removeHandler(channel);
    } catch {}
    ipcMain.handle(channel, async () => value);
  }
  logger.info('networth:ipc-disabled', { channels: Object.keys(defaults).length });
}

function resolveBuildPageUrl(buildId) {
  if (!buildId) return null;
  const base = resolveFeedbackBaseUrl();
  if (!base) return null;
  return `${base}/build?buildId=${encodeURIComponent(String(buildId))}`;
}

function buildFeedbackContext(extra = {}) {
  return {
    source: 'electron',
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: `${process.platform} ${os.release()} (${process.arch})`,
    locale: app.getLocale(),
    ...extra,
  };
}

async function submitFeedback(payload = {}) {
  const baseUrl = resolveFeedbackBaseUrl();
  if (!baseUrl) {
    throw new Error('Feedback endpoint is not configured.');
  }

  const auth = getAuth();
  const user = auth?.getUser?.() || null;
  const reporter = {
    id: auth?.getUserId?.() || null,
    name: user?.poeAccountName || user?.name || null,
  };

  const body = {
    ...payload,
    reporter,
    context: buildFeedbackContext(payload.context || {}),
  };

  const response = await fetch(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || 'Feedback submission failed.');
  }

  return { success: true, discussionUrl: data?.discussionUrl || null };
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', (info) => {
    logger.info('updates:available', { version: info?.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    logger.info('updates:not-available', { version: info?.version });
  });

  autoUpdater.on('error', (err) => {
    logger.error('updates:error', { error: String(err) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('updates:downloaded', { version: info?.version });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    logger.error('updates:check-failed', { error: String(err) });
  });
}

function autoDetectClientLogPath() {
  const os = require('os');
  const possiblePaths = [];
  const userProfile = os.homedir();
  const commonDrives = ['C:', 'D:', 'E:'];

  possiblePaths.push(path.join(userProfile, 'Documents', 'My Games', 'Path of Exile', 'logs', 'Client.txt'));

  for (const drive of commonDrives) {
    possiblePaths.push(path.join(drive, 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt'));
    possiblePaths.push(path.join(drive, 'Program Files', 'Steam', 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt'));
  }

  for (const drive of commonDrives) {
    possiblePaths.push(path.join(drive, 'Program Files (x86)', 'Grinding Gear Games', 'Path of Exile', 'logs', 'Client.txt'));
    possiblePaths.push(path.join(drive, 'Program Files', 'Grinding Gear Games', 'Path of Exile', 'logs', 'Client.txt'));
  }

  for (const testPath of possiblePaths) {
    try {
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    } catch {}
  }

  if (process.platform === 'win32') {
    for (let drive = 'C'.charCodeAt(0); drive <= 'Z'.charCodeAt(0); drive++) {
      const driveLetter = String.fromCharCode(drive) + ':';
      if (commonDrives.includes(driveLetter)) continue;

      const steamPath = path.join(driveLetter, 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt');
      const directPath = path.join(driveLetter, 'Program Files (x86)', 'Grinding Gear Games', 'Path of Exile', 'logs', 'Client.txt');

      try {
        if (fs.existsSync(steamPath)) return steamPath;
        if (fs.existsSync(directPath)) return directPath;
      } catch {}
    }
  }

  return null;
}

function shouldWatchClientLog(currentSettings) {
  if (!currentSettings?.clientLogPath) return false;
  if (!fs.existsSync(currentSettings.clientLogPath)) return false;
  const whispersEnabled = currentSettings.whispersEnabled !== false;
  const levelAuto = currentSettings.buildLevelDetection !== 'manual';
  const liveMap = currentSettings?.liveTrackingByCharacter && typeof currentSettings.liveTrackingByCharacter === 'object'
    ? currentSettings.liveTrackingByCharacter
    : {};
  const liveTrackingActive = Object.values(liveMap).some((entry) => entry && entry.enabled === true);
  const liveTrackingArmed = Boolean(currentSettings?.liveTrackingPending);
  const buildGuideEnabled = currentSettings?.buildGuideEnabled !== false;
  return whispersEnabled || levelAuto || liveTrackingActive || liveTrackingArmed || buildGuideEnabled;
}

function broadcastSettingsUpdate(partial = {}) {
  const targets = [
    overlayWindow,
    managementWindow,
    settingsWindow,
    networthOverlayWindow,
    networthWindow,
    buildOverlayWindow,
    buildManagerWindow,
    countdownTimerWindow,
    welcomeWindow,
    loginWindow
  ];

  for (const win of targets) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:updated', settings);
    }
  }

  if (partial.characterLevel !== undefined && buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    buildOverlayWindow.webContents.send('build:levelChanged', partial.characterLevel);
  }
}

function normalizeShortcutValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sendToManagement(channel, payload) {
  if (!managementWindow || managementWindow.isDestroyed()) {
    createManagementWindow();
  }
  if (!managementWindow || managementWindow.isDestroyed()) return;
  const send = () => {
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send(channel, payload);
    }
  };
  if (managementWindow.webContents.isLoading()) {
    managementWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function isSettingsWindowVisible() {
  return !!(settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible());
}

function showSettingsWindow(tab) {
  try {
    logger.info('settings:show:called', { tab, hasWindow: !!settingsWindow, isDestroyed: settingsWindow?.isDestroyed() });

    if (!settingsWindow || settingsWindow.isDestroyed()) {
      logger.info('settings:show:creating-new-window');
      createSettingsWindow();
      settingsWindow.webContents.once('did-finish-load', () => {
        logger.info('settings:show:window-loaded');
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          setTimeout(() => {
            logger.info('settings:show:showing-window');
            settingsWindow.show();
            settingsWindow.focus();
            if (tab) {
              logger.info('settings:show:switching-tab', { tab });
              settingsWindow.webContents.send('settings:switchTab', tab);
            }
          }, 100);
        }
      });
    } else {
      logger.info('settings:show:showing-existing-window');
      settingsWindow.show();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
      }
    }

    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('settings:windowOpened', tab);
    }

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings:windowOpened', tab);
    }

    if (tab && settingsWindow && !settingsWindow.isDestroyed() && !settingsWindow.webContents.isLoading()) {
      logger.info('settings:show:switching-tab-existing', { tab });
      settingsWindow.webContents.send('settings:switchTab', tab);
    }
  } catch (err) {
    logger.error('settings:show:error', { error: String(err) });
  }
}

function toggleSettingsWindow(tab) {
  if (isSettingsWindowVisible()) {
    try { settingsWindow.hide(); } catch {}
    return;
  }
  showSettingsWindow(tab);
}

function refreshGlobalShortcuts() {
  if (!app.isReady()) return;
  const desiredQuickPreview = normalizeShortcutValue(settings?.buildQuickPreviewShortcut);
  const desiredOpenSettings = normalizeShortcutValue(settings?.openSettingsShortcut);

  if (registeredShortcuts.buildQuickPreview && registeredShortcuts.buildQuickPreview !== desiredQuickPreview) {
    globalShortcut.unregister(registeredShortcuts.buildQuickPreview);
    registeredShortcuts.buildQuickPreview = null;
  }
  if (registeredShortcuts.openSettings && registeredShortcuts.openSettings !== desiredOpenSettings) {
    globalShortcut.unregister(registeredShortcuts.openSettings);
    registeredShortcuts.openSettings = null;
  }

  if (desiredQuickPreview && registeredShortcuts.buildQuickPreview !== desiredQuickPreview) {
    try {
      const ok = globalShortcut.register(desiredQuickPreview, () => {
        sendToManagement('shortcut:buildQuickPreview');
      });
      if (ok) {
        registeredShortcuts.buildQuickPreview = desiredQuickPreview;
        logger.info('shortcut:registered', { action: 'buildQuickPreview', accelerator: desiredQuickPreview });
      } else {
        logger.warn('shortcut:register-failed', { action: 'buildQuickPreview', accelerator: desiredQuickPreview });
      }
    } catch (err) {
      logger.warn('shortcut:register-error', { action: 'buildQuickPreview', accelerator: desiredQuickPreview, error: String(err) });
    }
  }

  if (desiredOpenSettings && registeredShortcuts.openSettings !== desiredOpenSettings) {
    try {
      const ok = globalShortcut.register(desiredOpenSettings, () => {
        toggleSettingsWindow('general');
      });
      if (ok) {
        registeredShortcuts.openSettings = desiredOpenSettings;
        logger.info('shortcut:registered', { action: 'openSettings', accelerator: desiredOpenSettings });
      } else {
        logger.warn('shortcut:register-failed', { action: 'openSettings', accelerator: desiredOpenSettings });
      }
    } catch (err) {
      logger.warn('shortcut:register-error', { action: 'openSettings', accelerator: desiredOpenSettings, error: String(err) });
    }
  }
}

function maybeShowLevelUpPopup(level) {
  if (!settings?.buildLevelPopupEnabled) return;
  if (!managementWindow || managementWindow.isDestroyed()) {
    createManagementWindow();
  } else {
    managementWindow.show();
  }
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('build:levelUp', { level });
  }
  if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    buildOverlayWindow.webContents.send('build:localLevelUp', { level });
  }
  if (buildManagerWindow && !buildManagerWindow.isDestroyed()) {
    buildManagerWindow.webContents.send('build:localLevelUp', { level });
  }
}

function updateCharacterLevel(level, options = {}) {
  const parsed = Number.parseInt(level, 10);
  if (!Number.isFinite(parsed)) return;
  const clamped = Math.max(1, Math.min(100, parsed));
  if (settings.characterLevel === clamped && !options.force) return;

  settings.characterLevel = clamped;
  if (settings.buildLevelDetection === 'manual') {
    settings.buildManualLevel = clamped;
  }

  saveSettings(settings);
  broadcastSettingsUpdate({ characterLevel: clamped });

  if (options.showPopup) {
    maybeShowLevelUpPopup(clamped);
  }
}

const LIVE_TRACKING_KEY_SEPARATOR = "::";
let liveCaptureInFlight = false;
let characterInfoCache = { fetchedAt: 0, byName: new Map(), unavailableUntil: 0 };
let characterInfoRefreshInFlight = null;

function buildLiveTrackingKey(league, characterName) {
  const leagueKey = String(league || "").trim().toLowerCase();
  const charKey = String(characterName || "").trim().toLowerCase();
  if (!leagueKey || !charKey) return null;
  return `${leagueKey}${LIVE_TRACKING_KEY_SEPARATOR}${charKey}`;
}

function normalizeLiveTrackingLeague(league) {
  const normalized = String(league || '').trim();
  return normalized || 'Unknown';
}

function getLiveTrackingDefaultVisibility() {
  return settings?.liveTrackingDefaultVisibility === 'public' ? 'public' : 'private';
}

function isUnknownLiveTrackingLeague(league) {
  return normalizeLiveTrackingLeague(league).toLowerCase() === 'unknown';
}

function resolveLiveTrackingEntry(characterName, league) {
  if (!settings?.liveTrackingByCharacter || typeof settings.liveTrackingByCharacter !== 'object') return null;
  const charKey = String(characterName || "").trim().toLowerCase();
  if (!charKey) return null;
  const map = settings.liveTrackingByCharacter;
  const keysForCharacter = Object.keys(map).filter((k) => k.endsWith(`${LIVE_TRACKING_KEY_SEPARATOR}${charKey}`));
  if (keysForCharacter.length === 0) return null;

  const normalizedLeague = normalizeLiveTrackingLeague(league);
  const exactKey = buildLiveTrackingKey(normalizedLeague, characterName);
  if (exactKey && map[exactKey]) {
    return { key: exactKey, entry: map[exactKey] };
  }

  if (!isUnknownLiveTrackingLeague(normalizedLeague)) {
    const unknownKey = buildLiveTrackingKey('Unknown', characterName);
    if (unknownKey && map[unknownKey]) {
      return { key: unknownKey, entry: map[unknownKey] };
    }
  }

  if (keysForCharacter.length === 1) {
    const key = keysForCharacter[0];
    return { key, entry: map[key] };
  }

  return null;
}

function refreshCurrentCharacterLiveTrackingState() {
  if (!settings || typeof settings !== 'object') return null;
  const characterName = typeof settings.activeCharacterName === 'string' ? settings.activeCharacterName : null;
  const league = typeof settings.activeCharacterLeague === 'string' ? settings.activeCharacterLeague : null;
  if (!characterName) {
    settings.currentCharacterLiveTracking = null;
    return null;
  }

  const resolved = resolveLiveTrackingEntry(characterName, league);
  const next = resolved && resolved.entry
    ? {
      enabled: resolved.entry.enabled === true,
      buildId: typeof resolved.entry.buildId === 'string' ? resolved.entry.buildId : null,
      visibility: resolved.entry.visibility === 'public' ? 'public' : 'private',
      characterName: typeof resolved.entry.characterName === 'string' ? resolved.entry.characterName : characterName,
      league: typeof resolved.entry.league === 'string' ? resolved.entry.league : (league || null),
      key: resolved.key,
      lastCapturedLevel: Number.isFinite(resolved.entry.lastCapturedLevel) ? resolved.entry.lastCapturedLevel : null,
    }
    : {
      enabled: false,
      buildId: null,
      visibility: getLiveTrackingDefaultVisibility(),
      characterName,
      league: league || null,
      key: null,
      lastCapturedLevel: null,
    };

  settings.currentCharacterLiveTracking = next;
  return next;
}

async function setActiveCharacterState(characterName, className = null) {
  if (!settings || typeof settings !== 'object') return null;
  const normalizedName = typeof characterName === 'string' ? characterName.trim() : '';
  if (!normalizedName) return null;

  const info = await resolveCharacterInfo(normalizedName);
  settings.activeCharacterName = normalizedName;
  settings.activeCharacterLeague = info?.league || settings.activeCharacterLeague || null;
  settings.activeCharacterClass = className || info?.class || settings.activeCharacterClass || null;
  settings.activeCharacterSeenAt = Date.now();
  const liveState = refreshCurrentCharacterLiveTrackingState();
  saveSettings(settings);
  broadcastSettingsUpdate({
    activeCharacterName: settings.activeCharacterName,
    activeCharacterLeague: settings.activeCharacterLeague,
    activeCharacterClass: settings.activeCharacterClass,
    activeCharacterSeenAt: settings.activeCharacterSeenAt,
    currentCharacterLiveTracking: liveState,
  });
  return { characterName: settings.activeCharacterName, league: settings.activeCharacterLeague, className: settings.activeCharacterClass };
}

function clearActiveCharacterState() {
  if (!settings || typeof settings !== 'object') return;
  settings.activeCharacterName = null;
  settings.activeCharacterLeague = null;
  settings.activeCharacterClass = null;
  settings.activeCharacterSeenAt = Date.now();
  refreshCurrentCharacterLiveTrackingState();
  saveSettings(settings);
  broadcastSettingsUpdate({
    activeCharacterName: null,
    activeCharacterLeague: null,
    activeCharacterClass: null,
    activeCharacterSeenAt: settings.activeCharacterSeenAt,
    currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
  });
}

async function refreshCharacterInfoCache() {
  if (!apiClient || typeof apiClient.getPoeCharacters !== 'function') return null;
  if (characterInfoRefreshInFlight) {
    return characterInfoRefreshInFlight;
  }
  const now = Date.now();
  if (characterInfoCache.unavailableUntil && now < characterInfoCache.unavailableUntil) {
    return null;
  }

  characterInfoRefreshInFlight = (async () => {
    try {
      const payload = await apiClient.getPoeCharacters();
      const list = Array.isArray(payload?.characters) ? payload.characters : [];
      const byName = new Map();
      list.forEach((row) => {
        if (!row || !row.name) return;
        byName.set(String(row.name).toLowerCase(), row);
      });
      characterInfoCache = { fetchedAt: Date.now(), byName, unavailableUntil: 0 };
      if (clientLogWatcher && typeof clientLogWatcher.setAllowedCharacterNames === 'function') {
        clientLogWatcher.setAllowedCharacterNames(Array.from(byName.keys()));
      }
      if (settings?.activeCharacterName) {
        const activeInfo = byName.get(String(settings.activeCharacterName).toLowerCase());
        if (activeInfo) {
          settings.activeCharacterLeague = activeInfo.league || settings.activeCharacterLeague || null;
          settings.activeCharacterClass = activeInfo.class || settings.activeCharacterClass || null;
          refreshCurrentCharacterLiveTrackingState();
          saveSettings(settings);
          broadcastSettingsUpdate({
            activeCharacterName: settings.activeCharacterName,
            activeCharacterLeague: settings.activeCharacterLeague,
            activeCharacterClass: settings.activeCharacterClass,
            currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
          });
        }
      }
      return characterInfoCache;
    } catch (err) {
      const message = String(err || '');
      if (message.includes('No linked Path of Exile OAuth token found')) {
        characterInfoCache.unavailableUntil = Date.now() + (5 * 60 * 1000);
        logger.warn('live-tracking:character-list-missing-oauth', {
          error: message,
          retryAfterMs: 5 * 60 * 1000,
        });
        return null;
      }

      const isRateLimited = message.includes('429') || /rate limit/i.test(message);
      if (isRateLimited) {
        const retryAfterMs = 60 * 1000;
        characterInfoCache.unavailableUntil = Date.now() + retryAfterMs;
        logger.warn('live-tracking:character-list-rate-limited', {
          error: message,
          retryAfterMs,
        });
        return null;
      }

      logger.warn('live-tracking:character-list-failed', { error: message });
      return null;
    } finally {
      characterInfoRefreshInFlight = null;
    }
  })();

  return characterInfoRefreshInFlight;
}

async function resolveCharacterInfo(characterName) {
  const normalized = String(characterName || '').trim().toLowerCase();
  if (!normalized) return null;
  const now = Date.now();
  if (characterInfoCache.byName.size === 0 || now - characterInfoCache.fetchedAt > 5 * 60 * 1000) {
    await refreshCharacterInfoCache();
  }
  return characterInfoCache.byName.get(normalized) || null;
}

function normalizeInventoryKey(inventoryId) {
  return String(inventoryId || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function getItemInventoryId(item) {
  return (
    item?.inventoryId ||
    item?.inventory_id ||
    item?.slot ||
    item?.equipmentSlot ||
    item?.equipment_slot ||
    item?.location ||
    null
  );
}

function inferSlotFromItem(item) {
  const raw = [
    item?.name || '',
    item?.typeLine || item?.type_line || '',
    item?.baseType || item?.base_type || '',
    item?.itemClass || item?.item_class || '',
  ].join(' ').toLowerCase();

  if (!raw) return null;
  if (/\b(flask)\b/.test(raw)) return 'flask';
  if (/\b(amulet|talisman)\b/.test(raw)) return 'amulet';
  if (/\b(ring)\b/.test(raw)) return 'ring';
  if (/\b(belt|sash)\b/.test(raw)) return 'belt';
  if (/\b(helmet|helm|hood|circlet|mask|crown)\b/.test(raw)) return 'helm';
  if (/\b(gloves|gauntlets|mitts|grips)\b/.test(raw)) return 'gloves';
  if (/\b(boots|greaves|slippers)\b/.test(raw)) return 'boots';
  if (/\b(body armour|body armor|vest|robe|chest|tunic|garb)\b/.test(raw)) return 'body';
  if (/\b(shield|buckler|focus|quiver)\b/.test(raw)) return 'offhand';
  if (/\b(bow|wand|sword|axe|mace|dagger|claw|staff|sceptre|scepter|spear|crossbow)\b/.test(raw)) return 'weapon';
  return null;
}

function mapInventoryIdToSlot(inventoryId, item = null) {
  const key = normalizeInventoryKey(inventoryId);
  const map = {
    weapon: 'weapon',
    weapon1: 'weapon',
    weaponset1mainhand: 'weapon',
    mainhand: 'weapon',
    mainhandweapon: 'weapon',
    weapon2: 'weapon',
    weaponset2mainhand: 'weapon',
    offhand: 'offhand',
    offhand1: 'offhand',
    weaponset1offhand: 'offhand',
    offhandweapon: 'offhand',
    offhand2: 'offhand',
    weaponset2offhand: 'offhand',
    helm: 'helm',
    helmet: 'helm',
    bodyarmour: 'body',
    bodyarmor: 'body',
    body: 'body',
    gloves: 'gloves',
    boots: 'boots',
    amulet: 'amulet',
    ring: 'ring1',
    ring1: 'ring1',
    ring2: 'ring2',
    belt: 'belt',
    flask: 'flask1',
    flask1: 'flask1',
    flask2: 'flask2',
    flask3: 'flask3',
    flask4: 'flask4',
    flask5: 'flask5',
  };
  if (map[key]) return map[key];

  if (key.startsWith('flask')) {
    const idx = Number.parseInt(key.replace(/\D+/g, ''), 10);
    if (Number.isFinite(idx) && idx >= 1 && idx <= 5) return `flask${idx}`;
    return 'flask';
  }

  if (key === 'leftring') return 'ring1';
  if (key === 'rightring') return 'ring2';

  // Some payloads expose equipped pieces without explicit slot ids.
  if (key === 'maininventory' || key === 'inventory' || key === 'main') {
    const inferred = inferSlotFromItem(item);
    return inferred || null;
  }

  const inferred = inferSlotFromItem(item);
  return inferred || null;
}

function nextAvailableIndexedSlot(base, usedSet, max) {
  for (let i = 1; i <= max; i += 1) {
    const candidate = `${base}${i}`;
    if (!usedSet.has(candidate)) return candidate;
  }
  return `${base}${max}`;
}

function resolveGearSlotId(item, usedSet) {
  const rawSlot = mapInventoryIdToSlot(getItemInventoryId(item), item);
  if (!rawSlot) return null;

  if (rawSlot === 'ring') {
    return nextAvailableIndexedSlot('ring', usedSet, 2);
  }
  if (rawSlot === 'flask') {
    const x = Number(item?.x);
    if (Number.isFinite(x)) {
      const idx = Math.min(5, Math.max(1, Math.floor(x) + 1));
      const candidate = `flask${idx}`;
      if (!usedSet.has(candidate)) return candidate;
    }
    return nextAvailableIndexedSlot('flask', usedSet, 5);
  }
  if (rawSlot === 'ring1' && usedSet.has('ring1') && !usedSet.has('ring2')) return 'ring2';
  if (rawSlot === 'flask1' && usedSet.has('flask1')) return nextAvailableIndexedSlot('flask', usedSet, 5);
  return rawSlot;
}

function mapItemSlot(inventoryId, item = null) {
  const key = normalizeInventoryKey(inventoryId);
  const map = {
    weapon: 'weapon1',
    weapon1: 'weapon1',
    weaponset1mainhand: 'weapon1',
    mainhand: 'weapon1',
    weapon2: 'weapon1',
    weaponset2mainhand: 'weapon1',
    offhand: 'weapon2',
    offhand1: 'weapon2',
    weaponset1offhand: 'weapon2',
    offhand2: 'weapon2',
    weaponset2offhand: 'weapon2',
    helm: 'helmet',
    helmet: 'helmet',
    bodyarmour: 'body',
    bodyarmor: 'body',
    body: 'body',
    gloves: 'gloves',
    boots: 'boots',
  };
  if (map[key]) return map[key];
  const base = mapInventoryIdToSlot(inventoryId, item);
  if (base === 'weapon') return 'weapon1';
  if (base === 'offhand') return 'weapon2';
  if (base === 'helm') return 'helmet';
  if (base === 'body') return 'body';
  if (base === 'gloves') return 'gloves';
  if (base === 'boots') return 'boots';
  return 'any';
}

function normalizeMods(item) {
  const mods = [];
  const pushMods = (list) => {
    if (Array.isArray(list)) {
      list.forEach((m) => {
        if (typeof m === 'string' && m.trim()) mods.push(m.trim());
      });
    }
  };
  pushMods(item?.implicitMods);
  pushMods(item?.implicit_mods);
  pushMods(item?.explicitMods);
  pushMods(item?.explicit_mods);
  pushMods(item?.craftedMods);
  pushMods(item?.crafted_mods);
  pushMods(item?.enchantMods);
  pushMods(item?.enchant_mods);
  pushMods(item?.rune_mods);
  return mods;
}

function rarityFromFrame(frameType) {
  const raw = Number.isFinite(frameType) ? Number(frameType) : Number.NaN;
  if (raw === 3) return 'unique';
  if (raw === 2) return 'rare';
  if (raw === 1) return 'magic';
  if (typeof frameType === 'string' && frameType.trim()) return frameType.trim().toLowerCase();
  return 'normal';
}

function slugifyLive(value) {
  const raw = String(value || '').toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'item';
}

function buildGearRowsFromItems(items) {
  const rows = [];
  const usedSlots = new Set();
  (items || []).forEach((item) => {
    const slotId = resolveGearSlotId(item, usedSlots);
    if (!slotId || usedSlots.has(slotId)) return;
    usedSlots.add(slotId);
    const typeLine = item?.typeLine || item?.type_line || item?.baseType || item?.base_type || '';
    const name = [item?.name, typeLine].filter(Boolean).join(' ').trim() || typeLine || 'Item';
    const rarity = rarityFromFrame(item?.frameType ?? item?.frame_type ?? item?.rarity);
    const mods = normalizeMods(item);
    const baseSlug = slugifyLive(`${slotId}-${name || item?.typeLine || 'item'}`);
    const liveSlug = `live-${baseSlug}`;
    const metadata = {
      name: item?.name || '',
      base_type: item?.baseType || item?.base_type || typeLine || '',
      item_type: rarity,
      image_url: item?.icon || null,
      mods,
      mod_entries: mods.map((text) => ({ text })),
      gear_item_slug: liveSlug,
      gear_item_snapshot: {
        slug: liveSlug,
        name,
        base_type: item?.baseType || item?.base_type || typeLine || '',
        item_type: rarity,
        image_url: item?.icon || null,
        mods,
      },
    };
    rows.push({ slotId, item_name: name, metadata });
  });
  return rows;
}

function parseGemProperty(item, key) {
  const props = Array.isArray(item?.properties) ? item.properties : (Array.isArray(item?.props) ? item.props : []);
  const prop = props.find((p) => p && typeof p.name === 'string' && p.name.toLowerCase() === key);
  if (!prop || !Array.isArray(prop.values)) return null;
  const value = prop.values[0]?.[0];
  const num = Number.parseInt(String(value || '').replace(/\D+/g, ''), 10);
  return Number.isFinite(num) ? num : null;
}

function isPlaceholderGemName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'empty' || normalized === 'none' || normalized === 'socket';
}

function buildSkillChainsFromItems(items) {
  const chains = [];
  let chainIndex = 1;
  (items || []).forEach((item) => {
    const socketedItems = Array.isArray(item?.socketedItems)
      ? item.socketedItems
      : (Array.isArray(item?.socketed_items) ? item.socketed_items : []);
    let sockets = Array.isArray(item?.sockets) ? item.sockets : [];
    if (sockets.length === 0 && socketedItems.length > 0) {
      sockets = socketedItems.map((gem, idx) => ({
        group: Number.isFinite(gem?.group) ? Number(gem.group) : 0,
        colour: gem?.colour || gem?.color || 'white',
        socket: idx,
      }));
    }
    if (sockets.length === 0) return;
    const inventoryId = getItemInventoryId(item);
    const byGroup = new Map();
    sockets.forEach((socket, idx) => {
      const group = Number.isFinite(socket?.group) ? socket.group : 0;
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push({ socket, index: idx });
    });

    byGroup.forEach((groupSockets) => {
      const ordered = groupSockets.sort((a, b) => a.index - b.index);
      const socketEntries = ordered.map(({ socket, index }) => {
        const gem = socketedItems.find((si) => Number(si?.socket ?? si?.socket_index) === index) || null;
        const color = socket?.colour ? String(socket.colour).toLowerCase() : (socket?.color ? String(socket.color).toLowerCase() : 'white');
        if (!gem) {
          return null;
        }
        const gemName = gem?.typeLine || gem?.type_line || gem?.name || 'Gem';
        if (isPlaceholderGemName(gemName)) {
          return null;
        }
        return {
          id: String(gemName).toLowerCase().replace(/\s+/g, '-'),
          color,
          name: gemName,
          type: 'gem',
          icon: gem?.icon || null,
          isSupport: gem?.support === true,
          itemSlot: mapItemSlot(inventoryId, item),
          socketColorOverride: color === 'white' ? 'white' : null,
          level: parseGemProperty(gem, 'level'),
          quality: parseGemProperty(gem, 'quality') ?? 0,
        };
      }).filter(Boolean);
      if (socketEntries.length === 0) return;
      chains.push({
        id: `chain-${chainIndex}`,
        label: `Skill ${chainIndex}:`,
        description: '',
        role: '',
        itemSlot: mapItemSlot(inventoryId, item),
        sockets: socketEntries,
      });
      chainIndex += 1;
    });
  });

  return chains;
}

function buildSkillChainsFromSkillList(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return [];
  const sockets = skills
    .map((skill) => {
      if (!skill || typeof skill !== 'object') return null;
      const name = skill?.name || skill?.typeLine || skill?.type_line || skill?.display_name || null;
      if (!name) return null;
      if (isPlaceholderGemName(name)) return null;
      const supportByFlag = skill?.support === true || skill?.isSupport === true || skill?.supportGem === true;
      const supportByText = String(skill?.typeLine || skill?.type_line || '').toLowerCase().includes('support');
      return {
        id: String(name).toLowerCase().replace(/\s+/g, '-'),
        color: 'white',
        name: String(name),
        type: 'gem',
        icon: skill?.icon || null,
        isSupport: supportByFlag || supportByText,
        itemSlot: 'any',
        socketColorOverride: 'white',
        level: Number.isFinite(skill?.level) ? Number(skill.level) : null,
        quality: Number.isFinite(skill?.quality) ? Number(skill.quality) : 0,
      };
    })
    .filter(Boolean);
  if (sockets.length === 0) return [];
  return [{
    id: 'chain-1',
    label: 'Skill 1:',
    description: '',
    role: '',
    itemSlot: 'any',
    sockets,
  }];
}

function normalizeNodeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const candidate = value[0];
    if (candidate === null || candidate === undefined) return null;
    return String(candidate);
  }
  if (typeof value === 'object') {
    const candidate = value.id ?? value.hash ?? value.node ?? value.nodeId;
    if (candidate === null || candidate === undefined) return null;
    return String(candidate);
  }
  return null;
}

function isLikelyItemObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Boolean(
    value?.inventoryId ||
    value?.inventory_id ||
    value?.slot ||
    value?.equipmentSlot ||
    value?.typeLine ||
    value?.type_line ||
    value?.baseType ||
    value?.base_type ||
    value?.icon ||
    value?.frameType !== undefined ||
    Array.isArray(value?.sockets) ||
    Array.isArray(value?.socketedItems) ||
    Array.isArray(value?.socketed_items)
  );
}

function buildItemDedupeKey(item) {
  const directId = item?.id || item?.item_id || item?.uuid || null;
  if (directId) return `id:${String(directId)}`;
  return [
    getItemInventoryId(item) || '',
    item?.x ?? '',
    item?.y ?? '',
    item?.w ?? '',
    item?.h ?? '',
    item?.name || '',
    item?.typeLine || item?.type_line || item?.baseType || item?.base_type || '',
    item?.icon || '',
  ].join('|');
}

function pushSnapshotItem(item, out, seen, fallbackInventoryId = null) {
  if (!item || typeof item !== 'object') return;
  let nextItem = item;
  if (!getItemInventoryId(item) && fallbackInventoryId) {
    nextItem = { ...item, inventoryId: fallbackInventoryId };
  }
  const key = buildItemDedupeKey(nextItem);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(nextItem);
}

function appendItemsFromCandidate(candidate, out, seen, fallbackInventoryId = null) {
  if (!candidate) return;
  if (Array.isArray(candidate)) {
    candidate.forEach((entry) => appendItemsFromCandidate(entry, out, seen, fallbackInventoryId));
    return;
  }
  if (isLikelyItemObject(candidate)) {
    pushSnapshotItem(candidate, out, seen, fallbackInventoryId);
    return;
  }
  if (typeof candidate === 'object') {
    Object.entries(candidate).forEach(([key, value]) => {
      const nestedFallback = fallbackInventoryId || key;
      appendItemsFromCandidate(value, out, seen, nestedFallback);
    });
  }
}

function collectSnapshotItems(detail, rawDetail = null) {
  const candidates = [
    detail?.items,
    detail?.item,
    detail?.equipment,
    detail?.inventory,
    detail?.jewels,
    detail?.flasks,
    detail?.weaponSet,
    detail?.weaponSets,
    detail?.weapon_set,
    detail?.weapon_sets,
    rawDetail?.items,
    rawDetail?.item,
    rawDetail?.equipment,
    rawDetail?.inventory,
    rawDetail?.jewels,
    rawDetail?.flasks,
    rawDetail?.weaponSet,
    rawDetail?.weaponSets,
    rawDetail?.weapon_set,
    rawDetail?.weapon_sets,
    rawDetail?.character?.items,
    rawDetail?.character?.item,
    rawDetail?.character?.equipment,
    rawDetail?.character?.inventory,
    rawDetail?.character?.jewels,
    rawDetail?.character?.flasks,
    rawDetail?.character?.weaponSet,
    rawDetail?.character?.weaponSets,
    rawDetail?.character?.weapon_set,
    rawDetail?.character?.weapon_sets,
  ];
  const out = [];
  const seen = new Set();
  candidates.forEach((list) => {
    appendItemsFromCandidate(list, out, seen, null);
  });
  return out;
}

function collectSkillsFromCandidate(candidate, out, seen) {
  if (!candidate) return;
  if (Array.isArray(candidate)) {
    candidate.forEach((entry) => collectSkillsFromCandidate(entry, out, seen));
    return;
  }
  if (typeof candidate === 'object') {
    if (isLikelyItemObject(candidate) || candidate?.name || candidate?.typeLine || candidate?.type_line || candidate?.display_name) {
      const key = [
        candidate?.id || '',
        candidate?.name || '',
        candidate?.typeLine || candidate?.type_line || candidate?.display_name || '',
        candidate?.icon || '',
      ].join('|');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(candidate);
      }
      return;
    }
    Object.values(candidate).forEach((entry) => collectSkillsFromCandidate(entry, out, seen));
  }
}

function collectSnapshotSkills(detail, rawDetail = null) {
  const candidates = [
    detail?.skills,
    detail?.skillGems,
    detail?.skill_gems,
    rawDetail?.skills,
    rawDetail?.skillGems,
    rawDetail?.skill_gems,
    rawDetail?.character?.skills,
    rawDetail?.character?.skillGems,
    rawDetail?.character?.skill_gems,
  ];
  const out = [];
  const seen = new Set();
  candidates.forEach((value) => collectSkillsFromCandidate(value, out, seen));
  return out;
}

function summarizeSkillChains(chains, maxChains = 6, maxSockets = 6) {
  if (!Array.isArray(chains)) return [];
  return chains.slice(0, maxChains).map((chain, index) => {
    const sockets = Array.isArray(chain?.sockets) ? chain.sockets : [];
    return {
      chainIndex: index + 1,
      id: chain?.id || null,
      label: chain?.label || null,
      itemSlot: chain?.itemSlot || null,
      socketNames: sockets
        .slice(0, maxSockets)
        .map((socket) => socket?.name || socket?.typeLine || socket?.type_line || null)
        .filter(Boolean),
      supportCount: sockets.filter((socket) => socket?.isSupport === true).length,
    };
  });
}

function summarizePassivesPayload(passives, detail, rawDetail) {
  const hashes = Array.isArray(passives?.hashes)
    ? passives.hashes
    : (Array.isArray(passives?.hashes_ex)
      ? passives.hashes_ex
      : (Array.isArray(passives?.passiveSkillTree)
        ? passives.passiveSkillTree
        : (Array.isArray(detail?.passiveSkillTree)
          ? detail.passiveSkillTree
          : (Array.isArray(rawDetail?.passiveSkillTree) ? rawDetail.passiveSkillTree : []))));
  return {
    hasPassivesObject: Boolean(passives && typeof passives === 'object'),
    passivesKeys: passives && typeof passives === 'object' ? Object.keys(passives).slice(0, 30) : [],
    detailPassiveSkillTreeCount: Array.isArray(detail?.passiveSkillTree) ? detail.passiveSkillTree.length : 0,
    rawPassiveSkillTreeCount: Array.isArray(rawDetail?.passiveSkillTree) ? rawDetail.passiveSkillTree.length : 0,
    hashCount: hashes.length,
    hashSample: hashes.slice(0, 25).map((id) => String(id)),
  };
}

async function buildLiveSnapshot(characterName, league) {
  if (!apiClient || typeof apiClient.getLiveBuildSnapshot !== 'function') {
    throw new Error('Snapshot API client is not available');
  }
  logger.info('live-tracking:snapshot:server-oauth', { characterName });
  const snapshotData = await apiClient.getLiveBuildSnapshot({ characterName });
  const rawDetail = snapshotData?.detail ?? null;
  const detail = rawDetail?.character ?? rawDetail;
  const passives = snapshotData?.passives ?? detail?.passives ?? rawDetail?.passives ?? null;
  if (!detail) {
    throw new Error('Unable to fetch character snapshot data from server OAuth');
  }

  const hashes = Array.isArray(passives?.hashes)
    ? passives.hashes
    : (Array.isArray(passives?.hashes_ex)
      ? passives.hashes_ex
      : (Array.isArray(passives?.passiveSkillTree)
        ? passives.passiveSkillTree
        : (Array.isArray(detail?.passiveSkillTree) ? detail.passiveSkillTree : [])));

  const treeSelectionOrder = hashes.map(normalizeNodeId).filter(Boolean);
  const items = collectSnapshotItems(detail, rawDetail);
  const gear = buildGearRowsFromItems(items);
  let chains = buildSkillChainsFromItems(items);
  if (chains.length === 0) {
    const skillsList = collectSnapshotSkills(detail, rawDetail);
    chains = buildSkillChainsFromSkillList(skillsList);
  }
  logger.info('live-tracking:snapshot:normalized', {
    characterName,
    itemCount: items.length,
    gearCount: gear.length,
    chainCount: chains.length,
    treeCount: treeSelectionOrder.length,
    inventoryIds: items.slice(0, 12).map((item) => String(getItemInventoryId(item) || '')).filter(Boolean),
    mappedSlots: gear.map((row) => row.slotId),
    sampleItems: items.slice(0, 8).map((item) => ({
      inventoryId: getItemInventoryId(item),
      name: item?.name || null,
      typeLine: item?.typeLine || item?.type_line || null,
      baseType: item?.baseType || item?.base_type || null,
      x: Number.isFinite(item?.x) ? Number(item.x) : null,
      y: Number.isFinite(item?.y) ? Number(item.y) : null,
      socketCount: Array.isArray(item?.sockets) ? item.sockets.length : 0,
      socketedCount: Array.isArray(item?.socketedItems)
        ? item.socketedItems.length
        : (Array.isArray(item?.socketed_items) ? item.socketed_items.length : 0),
    })),
    sampleChains: summarizeSkillChains(chains),
    passives: summarizePassivesPayload(passives, detail, rawDetail),
  });

  const meta = {
    version: 1,
    general: {
      league,
      class: detail?.class || '',
      ascendancy: detail?.ascendancyClass || detail?.ascendancy || '',
      bloodline: detail?.bloodline || '',
      source: 'server-oauth',
    },
    tree: {
      sectionMode: 'manual',
    },
  };

  return { treeSelectionOrder, gear, chains, meta };
}

async function handleLiveTrackingLevelUp(payload) {
  try {
    if (!payload || !payload.level || !payload.characterName) {
      logger.info('live-tracking:skip', { reason: 'invalid-payload', payload: payload || null });
      return;
    }
    if (liveCaptureInFlight) {
      logger.info('live-tracking:skip', { reason: 'capture-in-flight', payload });
      return;
    }
    const characterName = String(payload.characterName || '').trim();
    if (!characterName) {
      logger.info('live-tracking:skip', { reason: 'empty-character-name', payload });
      return;
    }
    if (!apiClient) {
      logger.info('live-tracking:skip', { reason: 'api-client-unavailable', payload });
      return;
    }
    logger.info('live-tracking:level-up', {
      characterName,
      level: payload.level,
      className: payload.className || null,
      leagueFromPayload: payload.league || null,
    });
    await setActiveCharacterState(characterName, payload.className || null);

    const info = await resolveCharacterInfo(characterName);
    const league = normalizeLiveTrackingLeague(info?.league || payload.league || 'Unknown');
    logger.info('live-tracking:character-info', {
      characterName,
      level: payload.level,
      league,
      hasResolvedInfo: Boolean(info),
    });

    let resolved = resolveLiveTrackingEntry(characterName, league);
    let mapChanged = false;
    const expectedKey = buildLiveTrackingKey(league, characterName);
    if (
      resolved?.entry &&
      expectedKey &&
      resolved.key !== expectedKey &&
      !settings.liveTrackingByCharacter?.[expectedKey] &&
      !isUnknownLiveTrackingLeague(league)
    ) {
      const previousKey = resolved.key;
      const migratedEntry = {
        ...resolved.entry,
        league,
      };
      delete settings.liveTrackingByCharacter[previousKey];
      settings.liveTrackingByCharacter[expectedKey] = migratedEntry;
      resolved = { key: expectedKey, entry: migratedEntry };
      mapChanged = true;
      logger.info('live-tracking:key-migrated', {
        characterName,
        previousKey,
        nextKey: expectedKey,
        buildId: migratedEntry.buildId || null,
      });
    }

    if (resolved?.entry) {
      const entryCharacter = String(resolved.entry.characterName || '').trim().toLowerCase();
      if (entryCharacter && entryCharacter !== characterName.toLowerCase()) {
        logger.warn('live-tracking:entry-character-mismatch', {
          characterName,
          entryCharacter: resolved.entry.characterName || null,
          entryKey: resolved.key,
        });
        resolved = null;
      }
    }
    logger.info('live-tracking:resolve-entry', {
      characterName,
      league,
      hasEntry: Boolean(resolved?.entry),
      enabled: resolved?.entry?.enabled === true,
      hasPending: Boolean(settings?.liveTrackingPending),
      pendingCharacter: settings?.liveTrackingPending?.characterName || null,
      pendingLeague: settings?.liveTrackingPending?.league || null,
    });
    if (settings?.liveTrackingPending && (!resolved || resolved.entry?.enabled !== true)) {
      const visibility = settings.liveTrackingPending.visibility === 'public'
        ? 'public'
        : getLiveTrackingDefaultVisibility();
      const bindLeague = isUnknownLiveTrackingLeague(league)
        ? normalizeLiveTrackingLeague(resolved?.entry?.league || league)
        : league;
      const startResult = await apiClient.startLiveBuild({
        characterName,
        league: bindLeague,
        visibility,
      });
      const buildId = startResult?.id;
      const key = buildLiveTrackingKey(bindLeague, characterName);
      if (key && buildId) {
        settings.liveTrackingByCharacter[key] = {
          buildId,
          league: bindLeague,
          characterName,
          visibility,
          enabled: true,
          lastCapturedLevel: null,
        };
        settings.liveTrackingPending = null;
        refreshCurrentCharacterLiveTrackingState();
        saveSettings(settings);
        broadcastSettingsUpdate({
          liveTrackingPending: null,
          liveTrackingByCharacter: settings.liveTrackingByCharacter,
          currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
        });
        logger.info('live-tracking:build-bound', {
          buildId,
          resumed: Boolean(startResult?.resumed),
          characterName,
          league: bindLeague,
          buildUrl: resolveBuildPageUrl(buildId),
        });
        resolved = { key, entry: settings.liveTrackingByCharacter[key] };
      }
    }

    if (!resolved || !resolved.entry || resolved.entry.enabled !== true) {
      if (mapChanged) {
        refreshCurrentCharacterLiveTrackingState();
        saveSettings(settings);
        broadcastSettingsUpdate({
          liveTrackingByCharacter: settings.liveTrackingByCharacter,
          currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
        });
      }
      logger.info('live-tracking:skip', {
        reason: 'tracking-not-enabled-for-character',
        characterName,
        league,
      });
      return;
    }
    if (resolved.entry.lastCapturedLevel === payload.level) {
      logger.info('live-tracking:skip', {
        reason: 'level-already-captured',
        characterName,
        league,
        level: payload.level,
        buildId: resolved.entry.buildId,
      });
      return;
    }

    const captureLeague = !isUnknownLiveTrackingLeague(league)
      ? league
      : normalizeLiveTrackingLeague(resolved.entry.league || league);

    liveCaptureInFlight = true;
    const snapshot = await buildLiveSnapshot(characterName, captureLeague);
    logger.info('live-tracking:capture:start', {
      characterName,
      league: captureLeague,
      level: payload.level,
      buildId: resolved.entry.buildId,
      treeCount: Array.isArray(snapshot?.treeSelectionOrder) ? snapshot.treeSelectionOrder.length : 0,
      gearCount: Array.isArray(snapshot?.gear) ? snapshot.gear.length : 0,
      chainCount: Array.isArray(snapshot?.chains) ? snapshot.chains.length : 0,
      sampleChains: summarizeSkillChains(snapshot?.chains),
    });
    const captureResult = await apiClient.captureLiveBuildLevel({
      buildId: resolved.entry.buildId,
      level: payload.level,
      characterName,
      league: captureLeague,
      snapshot,
    });
    const buildUrl = resolveBuildPageUrl(resolved.entry.buildId);
    logger.info('live-tracking:captured', {
      buildId: resolved.entry.buildId,
      characterName,
      league: captureLeague,
      level: payload.level,
      buildUrl,
      captureResult: captureResult || null,
    });

    resolved.entry.lastCapturedLevel = payload.level;
    settings.liveTrackingByCharacter[resolved.key] = resolved.entry;
    refreshCurrentCharacterLiveTrackingState();
    saveSettings(settings);
    broadcastSettingsUpdate({
      liveTrackingByCharacter: settings.liveTrackingByCharacter,
      currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
    });
  } catch (err) {
    logger.warn('live-tracking:capture-failed', { error: String(err) });
  } finally {
    liveCaptureInFlight = false;
  }
}

async function disableAllLiveTracking() {
  if (!settings) {
    settings = loadSettings();
  }
  const map = settings?.liveTrackingByCharacter && typeof settings.liveTrackingByCharacter === 'object'
    ? { ...settings.liveTrackingByCharacter }
    : {};

  const buildIds = Array.from(new Set(
    Object.values(map)
      .filter((entry) => entry && entry.enabled === true && typeof entry.buildId === 'string')
      .map((entry) => entry.buildId)
  ));

  let remoteUpdated = 0;
  let remoteFailed = 0;
  if (apiClient) {
    for (const buildId of buildIds) {
      try {
        await apiClient.setLiveBuildTracking(buildId, false);
        remoteUpdated += 1;
      } catch (err) {
        remoteFailed += 1;
        logger.warn('live-tracking:disable-remote-failed', { buildId, error: String(err) });
      }
    }
  }

  Object.keys(map).forEach((key) => {
    map[key] = { ...(map[key] || {}), enabled: false };
  });

  settings.liveTrackingByCharacter = map;
  settings.liveTrackingPending = null;
  refreshCurrentCharacterLiveTrackingState();
  saveSettings(settings);
  broadcastSettingsUpdate({
    liveTrackingByCharacter: map,
    liveTrackingPending: null,
    currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
  });

  return {
    ok: true,
    remoteUpdated,
    remoteFailed,
  };
}

async function toggleLiveTrackingForActiveCharacter(options = {}) {
  if (!settings) settings = loadSettings();
  if (!apiClient) {
    return { ok: false, error: 'API client not initialized' };
  }

  const activeName = typeof settings.activeCharacterName === 'string' ? settings.activeCharacterName.trim() : '';
  if (!activeName) {
    return { ok: false, error: 'No active character detected yet' };
  }

  const info = await resolveCharacterInfo(activeName);
  const league = info?.league || settings.activeCharacterLeague || 'Unknown';
  if (!settings.activeCharacterLeague && league) {
    settings.activeCharacterLeague = league;
  }

  let resolved = resolveLiveTrackingEntry(activeName, league);
  const desiredVisibility = options.visibility === 'public'
    ? 'public'
    : (
      settings.liveTrackingPending?.visibility === 'public'
        ? 'public'
        : getLiveTrackingDefaultVisibility()
    );

  if (!resolved || !resolved.entry) {
    const startResult = await apiClient.startLiveBuild({
      characterName: activeName,
      league,
      visibility: desiredVisibility,
    });
    const key = buildLiveTrackingKey(league, activeName);
    if (!startResult?.id || !key) {
      return { ok: false, error: 'Unable to create live build for active character' };
    }
    settings.liveTrackingByCharacter[key] = {
      buildId: startResult.id,
      league,
      characterName: activeName,
      visibility: desiredVisibility,
      enabled: true,
      lastCapturedLevel: null,
    };
    settings.liveTrackingPending = null;
    refreshCurrentCharacterLiveTrackingState();
    saveSettings(settings);
    broadcastSettingsUpdate({
      liveTrackingByCharacter: settings.liveTrackingByCharacter,
      liveTrackingPending: null,
      activeCharacterName: settings.activeCharacterName,
      activeCharacterLeague: settings.activeCharacterLeague,
      currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
    });
    return {
      ok: true,
      enabled: true,
      characterName: activeName,
      league,
      buildId: startResult.id,
      resumed: Boolean(startResult?.resumed),
    };
  }

  const currentlyEnabled = resolved.entry.enabled === true;
  const nextEnabled = !currentlyEnabled;
  const buildId = typeof resolved.entry.buildId === 'string' ? resolved.entry.buildId : null;
  if (!buildId) {
    return { ok: false, error: 'Active character live build is missing buildId' };
  }

  await apiClient.setLiveBuildTracking(buildId, nextEnabled);

  resolved.entry.enabled = nextEnabled;
  if (nextEnabled && typeof resolved.entry.visibility !== 'string') {
    resolved.entry.visibility = desiredVisibility;
  }
  settings.liveTrackingByCharacter[resolved.key] = resolved.entry;
  if (nextEnabled) settings.liveTrackingPending = null;

  refreshCurrentCharacterLiveTrackingState();
  saveSettings(settings);
  broadcastSettingsUpdate({
    liveTrackingByCharacter: settings.liveTrackingByCharacter,
    liveTrackingPending: settings.liveTrackingPending,
    activeCharacterName: settings.activeCharacterName,
    activeCharacterLeague: settings.activeCharacterLeague,
    currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
  });

  return {
    ok: true,
    enabled: nextEnabled,
    characterName: activeName,
    league,
    buildId,
  };
}

function ensureClientLogWatcher() {
  if (!settings.clientLogPath && settings.buildLevelDetection !== 'manual') {
    const detected = autoDetectClientLogPath();
    if (detected) {
      settings.clientLogPath = detected;
      saveSettings(settings);
      broadcastSettingsUpdate({});
    }
  }
  if (shouldWatchClientLog(settings)) {
    initClientLogWatcher(settings.clientLogPath);
  } else if (clientLogWatcher) {
    clientLogWatcher.stop();
    clientLogWatcher = null;
  }
}

function initClientLogWatcher(clientPath) {
  if (clientLogWatcher) {
    clientLogWatcher.stop();
  }
  
  clientLogWatcher = new ClientLogWatcher();
  if (characterInfoCache?.byName?.size > 0 && typeof clientLogWatcher.setAllowedCharacterNames === 'function') {
    clientLogWatcher.setAllowedCharacterNames(Array.from(characterInfoCache.byName.keys()));
  }
  
  clientLogWatcher.on('whisper', (whisper) => {
    logger.info('whispers:new', { type: whisper.type, player: whisper.playerName });
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:new-whisper', whisper);
    }
  });

  clientLogWatcher.on('level', (payload) => {
    if (payload?.characterName) {
      void setActiveCharacterState(payload.characterName, payload.className || null);
    }
    if (settings?.buildLevelDetection === 'manual') return;
    updateCharacterLevel(payload.level, { showPopup: true });
    void handleLiveTrackingLevelUp(payload);
  });

  clientLogWatcher.on('character', (payload) => {
    if (!payload || !payload.state) return;
    if (payload.state === 'logout') {
      logger.info('live-tracking:character-cleared', { reason: 'logout' });
      clearActiveCharacterState();
      return;
    }
    if (payload.characterName) {
      logger.info('live-tracking:character-detected', {
        characterName: payload.characterName,
        className: payload.className || null,
        bootstrap: payload.bootstrap === true
      });
      void setActiveCharacterState(payload.characterName, payload.className || null);
    }
  });
  
  clientLogWatcher.on('error', (err) => {
    logger.error('whispers:watcher:error', { error: String(err) });
  });
  
  clientLogWatcher.on('started', (path) => {
    logger.info('whispers:watcher:started', { path });
  });
  
  clientLogWatcher.on('stopped', () => {
    logger.info('whispers:watcher:stopped');
  });
  
  clientLogWatcher.start(clientPath);
}

function createOverlayWindow() {
  const bounds = (settings && settings.overlayBounds) || {};
  logger.info('overlay:create', { bounds });
  
  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
  
  overlayWindow = new BrowserWindow({
    width: bounds.width || 428,
    height: 150, // Always start at minimum, will be resized dynamically
    minHeight: 150,
    maxHeight: 800,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    icon: icon || undefined,
    // Keep above PoE without ever taking focus (non-focus overlay behavior)
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true  // Enable web security with CSP for external images
    }
  });
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  
  // Set always on top with 'floating' level
  // This ensures the window stays on top of PoE, even during focus changes
  // Use the highest level on Windows to stay above borderless/fullscreen
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  
  // Start with mouse events enabled (overlay is hidden via CSS anyway)
  // Will be updated when renderer calls setVisible
  overlayWindow.setIgnoreMouseEvents(false);
  
  // persist position (not size - that's dynamic based on content)
  const savePosition = () => {
    try {
      const b = overlayWindow.getBounds();
      settings.overlayBounds = { x: b.x, y: b.y, width: b.width };
      saveSettings(settings);
    } catch {}
  };
  overlayWindow.on('moved', savePosition);
  // Don't save on resize - size is dynamic
  overlayWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      overlayWindow.hide();
    }
  });
  // Ensure consistent behavior: never focus, always on top
  overlayWindow.on('focus', () => {
    try { overlayWindow.blur(); } catch {}
  });
  overlayWindow.on('show', () => {
    try { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  });
  overlayWindow.on('maximize', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:window-maximized', true);
    }
  });
  overlayWindow.on('unmaximize', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:window-maximized', false);
    }
  });
  updateOverlayMouse();
}

function createSettingsWindow() {
  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
  
  settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    frame: true,
    resizable: true,
    minWidth: 700,
    minHeight: 600,
    alwaysOnTop: true,
    backgroundColor: '#0f0f14',
    title: 'Simplex - Settings',
    icon: icon || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true  // Enable web security with CSP for external images
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  logger.info('settings:open');
  settingsWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      settingsWindow.hide();
      // Notify management window that settings are closed
      if (managementWindow && !managementWindow.isDestroyed()) {
        managementWindow.webContents.send('settings:windowClosed');
      }
    }
  });
  settingsWindow.on('show', () => {
    // Reload settings when window is shown to ensure latest values are displayed
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      // Wait for DOM to be ready before sending messages
      settingsWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            window.addEventListener('load', resolve);
          }
        });
      `).then(() => {
        settingsWindow.webContents.send('settings:updated', settings);
        // Signal that window is ready for status checks
        setTimeout(() => {
          settingsWindow.webContents.send('settings:window-ready');
        }, 300);
        // Ensure window has focus
        settingsWindow.focus();
      }).catch(() => {
        // Fallback: send anyway
        settingsWindow.webContents.send('settings:updated', settings);
        setTimeout(() => {
          settingsWindow.webContents.send('settings:window-ready');
        }, 300);
        settingsWindow.focus();
      });
    }
    // Notify management window that settings are open
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('settings:windowOpened');
    }
    // Notify overlay window that settings are open
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings:windowOpened', null);
    }
  });
  settingsWindow.on('hide', () => {
    // Notify management window that settings are closed
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('settings:windowClosed');
    }
    // Notify overlay window that settings are closed
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings:windowClosed');
    }
  });
  settingsWindow.on('maximize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:window-maximized', true);
    }
  });
  settingsWindow.on('unmaximize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:window-maximized', false);
    }
  });
  // Send settings when window finishes loading (for initial load)
  settingsWindow.webContents.once('did-finish-load', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:updated', settings);
      // Signal that window is ready for status checks
      setTimeout(() => {
        settingsWindow.webContents.send('settings:window-ready');
      }, 500);
    }
  });
}

function createManagementWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  managementWindow = new BrowserWindow({
    width: screenWidth, // Full width for positioning flexibility
    height: screenHeight, // Full height
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'management-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true  // Enable web security with CSP for external images
    }
  });

  managementWindow.loadFile(path.join(__dirname, 'renderer', 'management.html'));

  // Keep on top with screen-saver level
  managementWindow.setAlwaysOnTop(true, 'screen-saver');

  // Start with click-through enabled (renderer will disable when hovering UI)
  managementWindow.setIgnoreMouseEvents(true, { forward: true });

  // Always show (body is transparent, only handle/bar are visible)
  managementWindow.show();

  logger.info('management:create');

  managementWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      managementWindow.hide();
    }
  });

  // Ensure always on top
  managementWindow.on('focus', () => {
    if (!managementAllowFocus) {
      try { managementWindow.blur(); } catch {}
    }
  });
  managementWindow.on('show', () => {
    try { managementWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  });
}

function createBuildManagerWindow() {
  if (buildManagerWindow && !buildManagerWindow.isDestroyed()) {
    buildManagerWindow.focus();
    return;
  }

  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  buildManagerWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: true,
    backgroundColor: '#1a1a1a',
    icon: icon || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'build-manager-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    }
  });
  buildManagerWindow.setMenuBarVisibility(false);
  buildManagerWindow.setMenu(null);

  buildManagerWindow.loadFile(path.join(__dirname, 'renderer', 'build-manager.html'))
    .catch((error) => {
      logger.error('build-manager:load-failed', { error: String(error) });
    });

  buildManagerWindow.webContents.on('did-finish-load', () => {
    logger.info('build-manager:did-finish-load');
  });

  buildManagerWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    logger.error('build-manager:did-fail-load', { code, description, validatedURL });
  });

  buildManagerWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info('build-manager:console', { level, message, line, sourceId });
  });

  logger.info('build-manager:create');

  buildManagerWindow.on('closed', () => {
    buildManagerWindow = null;
  });
}

function createNetworthWindow() {
  // This function is deprecated - use createNetworthOverlayWindow() instead
  // Keeping for backwards compatibility but redirecting to overlay version
  logger.warn('networth:create:deprecated', { message: 'createNetworthWindow is deprecated, use overlay version instead' });
  if (!networthOverlayWindow || networthOverlayWindow.isDestroyed()) createNetworthOverlayWindow();
  else {
    networthOverlayWindow.show();
    networthOverlayWindow.focus();
  }
}

function createNetworthOverlayWindow() {
  const bounds = (settings && settings.networthOverlayBounds) || {};
  logger.info('networth-overlay:create', { bounds });
  
  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
  
  networthOverlayWindow = new BrowserWindow({
    width: bounds.width || 800,
    height: bounds.height || 600,
    minWidth: 600,
    minHeight: 400,
    x: bounds.x,
    y: bounds.y,
    frame: true,
    transparent: false,
    icon: icon || undefined,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'networth-overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true  // Enable web security with CSP for external images
    }
  });
  
  networthOverlayWindow.setMenuBarVisibility(false);
  networthOverlayWindow.setMenu(null);
  networthOverlayWindow.loadFile(path.join(__dirname, 'renderer', 'networth-overlay.html'));
  
  // Keep on top
  networthOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  
  // Save position
  const savePosition = () => {
    try {
      const b = networthOverlayWindow.getBounds();
      settings.networthOverlayBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      saveSettings(settings);
    } catch {}
  };
  
  networthOverlayWindow.on('moved', savePosition);
  networthOverlayWindow.on('resized', savePosition);

  networthOverlayWindow.on('maximize', () => {
    if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
      networthOverlayWindow.webContents.send('window-maximized', true);
    }
  });

  networthOverlayWindow.on('unmaximize', () => {
    if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
      networthOverlayWindow.webContents.send('window-maximized', false);
    }
  });

  networthOverlayWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      networthOverlayWindow.hide();
    }
  });
  
  logger.info('networth-overlay:created');
}

function createBuildOverlayWindow(showWindow = true) {
  const bounds = (settings && settings.buildOverlayBounds) || {};
  logger.info('build-overlay:create', { bounds });

  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  buildOverlayWindow = new BrowserWindow({
    width: bounds.width || 900,
    height: bounds.height || 700,
    minWidth: 700,
    minHeight: 500,
    x: bounds.x,
    y: bounds.y,
    frame: true,
    transparent: false,
    icon: icon || undefined,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    hasShadow: true,
    resizable: true,
    show: showWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'build-overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    }
  });

  buildOverlayWindow.setMenuBarVisibility(false);
  buildOverlayWindow.setMenu(null);

  buildOverlayWindow.loadFile(path.join(__dirname, 'renderer', 'build-overlay.html'))
    .catch((error) => {
      logger.error('build-overlay:load-failed', { error: String(error) });
    });

  buildOverlayWindow.webContents.on('did-finish-load', () => {
    logger.info('build-overlay:did-finish-load');
  });

  buildOverlayWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    logger.error('build-overlay:did-fail-load', { code, description, validatedURL });
  });

  buildOverlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info('build-overlay:console', { level, message, line, sourceId });
  });

  // Keep on top
  buildOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Save position
  const savePosition = () => {
    try {
      const b = buildOverlayWindow.getBounds();
      settings.buildOverlayBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      saveSettings(settings);
    } catch {}
  };

  buildOverlayWindow.on('moved', savePosition);
  buildOverlayWindow.on('resized', savePosition);

  buildOverlayWindow.on('maximize', () => {
    if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
      buildOverlayWindow.webContents.send('window-maximized', true);
    }
  });

  buildOverlayWindow.on('unmaximize', () => {
    if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
      buildOverlayWindow.webContents.send('window-maximized', false);
    }
  });

  buildOverlayWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      buildOverlayWindow.hide();
    }
  });

  logger.info('build-overlay:created');
}

function createCountdownTimerWindow() {
  if (countdownTimerWindow && !countdownTimerWindow.isDestroyed()) {
    countdownTimerWindow.show();
    return;
  }

  const bounds = (settings && settings.countdownTimerBounds) || { x: 100, y: 100 };
  logger.info('countdown-timer:create', { bounds });

  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  countdownTimerWindow = new BrowserWindow({
    width: 200,
    height: 50,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    icon: icon || undefined,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'countdown-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  countdownTimerWindow.loadFile(path.join(__dirname, 'renderer', 'countdown-timer.html'));

  // Keep on top
  countdownTimerWindow.setAlwaysOnTop(true, 'screen-saver');

  // Save position when moved
  const savePosition = () => {
    try {
      const b = countdownTimerWindow.getBounds();
      settings.countdownTimerBounds = { x: b.x, y: b.y };
      saveSettings(settings);
    } catch {}
  };

  countdownTimerWindow.on('moved', savePosition);

  countdownTimerWindow.on('close', (e) => {
    // Don't prevent close - this window can be closed independently
    countdownTimerWindow = null;
  });

  logger.info('countdown-timer:created');
}

function hideCountdownTimerWindow() {
  if (countdownTimerWindow && !countdownTimerWindow.isDestroyed()) {
    countdownTimerWindow.close();
    countdownTimerWindow = null;
  }
}

function createWelcomeWindow() {
  // Load app icon
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
  
  welcomeWindow = new BrowserWindow({
    width: 800,
    height: 700,
    frame: true,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0f0f14',
    title: 'Welcome to Simplex',
    icon: icon || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true  // Enable web security with CSP for external images
    }
  });
  welcomeWindow.setMenuBarVisibility(false);
  welcomeWindow.setMenu(null);
  
  welcomeWindow.loadFile(path.join(__dirname, 'renderer', 'welcome.html'));
  logger.info('welcome:open');
  
  welcomeWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      welcomeWindow.hide();
    }
  });
  
  // Mark tutorial as completed when window is closed
  welcomeWindow.on('closed', () => {
    settings.tutorialCompleted = true;
    saveSettings(settings);
    welcomeWindow = null;
  });
}

function openFeedbackModal(type = 'bug') {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  } else {
    settingsWindow.show();
  }

  const sendOpen = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('feedback:open', type);
      settingsWindow.focus();
    }
  };

  if (settingsWindow && settingsWindow.webContents.isLoading()) {
    settingsWindow.webContents.once('did-finish-load', () => {
      setTimeout(sendOpen, 150);
    });
  } else {
    setTimeout(sendOpen, 50);
  }
}

function createLoginWindow() {
  const sess = session.fromPartition(PARTITION);
  loginWindow = new BrowserWindow({
    width: 900,
    height: 800,
    title: 'Login to pathofexile.com',
    webPreferences: {
      session: sess,
    }
  });
  loginWindow.loadURL('https://www.pathofexile.com/login');
  logger.info('login:open');
  loginWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      loginWindow.hide();
    }
  });
}

function createFeedWindow(liveUrl, feedInfo = {}) {
  const normalizedUrl = typeof liveUrl === 'string' ? liveUrl.trim() : '';
  if (!isValidLiveFeedUrl(normalizedUrl)) {
    logger.warn('feed:create-single:blocked-invalid-url', { liveUrl });
    return null;
  }
  const sess = session.fromPartition(PARTITION);
  logger.info('feed:create-single:start', { liveUrl: normalizedUrl, feedName: feedInfo.name });
  feedWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      session: sess,
      preload: path.join(__dirname, 'preload', 'live-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false,
      additionalArguments: [
        `--poe-live-url=${encodeURIComponent(normalizedUrl)}`
      ]
    }
  });
  feedWindow.loadURL(normalizedUrl);
  try { feedWindow.webContents.setAudioMuted(true); } catch {}
  try { setupFeedDebugger(feedWindow, normalizedUrl, feedInfo); } catch {}
  try {
    const wc = feedWindow.webContents;
    wc.on('console-message', (_e, level, message, line, sourceId) => {
      try { logger.debug('feed:console', { id: wc.id, level, message, line, sourceId }); } catch {}
    });
    wc.on('did-start-navigation', (_e, url) => { logger.info('feed:navigate', { id: wc.id, url }); });
    wc.on('did-finish-load', () => { logger.info('feed:loaded', { id: wc.id }); });
  } catch {}
  
  // Add to feedWindows array for tracking (if not already there)
  if (feedWindow && feedWindows.indexOf(feedWindow) === -1) {
    feedWindows.push(feedWindow);
  }
  
  // Clean up from array when window is destroyed
  feedWindow.on('closed', () => {
    const index = feedWindows.indexOf(feedWindow);
    if (index > -1) {
      feedWindows.splice(index, 1);
    }
    feedWindow = null;
  });
  
  logger.info('feed:create-single:done', { id: feedWindow.webContents.id });
  return feedWindow;
}

function createFeedWindowFor(liveUrl, feedInfo = {}) {
  const normalizedUrl = typeof liveUrl === 'string' ? liveUrl.trim() : '';
  if (!isValidLiveFeedUrl(normalizedUrl)) {
    logger.warn('feed:create:blocked-invalid-url', { liveUrl, feedName: feedInfo.name });
    return null;
  }
  const sess = session.fromPartition(PARTITION);
  logger.info('feed:create:start', { liveUrl: normalizedUrl, feedName: feedInfo.name });
  const bw = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      session: sess,
      preload: path.join(__dirname, 'preload', 'live-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false,
      additionalArguments: [
        `--poe-live-url=${encodeURIComponent(normalizedUrl)}`
      ]
    }
  });
  bw.loadURL(normalizedUrl);
  try { bw.webContents.setAudioMuted(true); } catch {}
  try { setupFeedDebugger(bw, normalizedUrl, feedInfo); } catch {}
  try {
    const wc = bw.webContents;
    wc.on('console-message', (_e, level, message, line, sourceId) => {
      try { logger.debug('feed:console', { id: wc.id, level, message, line, sourceId }); } catch {}
    });
    wc.on('did-start-navigation', (_e, url) => { logger.info('feed:navigate', { id: wc.id, url }); });
    wc.on('did-finish-load', () => { logger.info('feed:loaded', { id: wc.id }); });
  } catch {}
  
  // Add to feedWindows array for tracking
  feedWindows.push(bw);
  
  // Clean up from array when window is destroyed
  bw.on('closed', () => {
    const index = feedWindows.indexOf(bw);
    if (index > -1) {
      feedWindows.splice(index, 1);
    }
  });
  
  logger.info('feed:create:done', { id: bw.webContents.id });
  return bw;
}

function destroyAllFeeds() {
  logger.info('feed:destroyAll:start', { count: feedWindows.length + (feedWindow ? 1 : 0) });
  
  // Detach debuggers before destroying windows to prevent alerts from continuing
  for (const w of feedWindows) {
    try {
      if (w && !w.isDestroyed()) {
        const wc = w.webContents;
        const id = wc.id;
        const dbg = wc.debugger;
        if (dbg && dbg.isAttached()) {
          dbg.detach();
        }
        feedMeta.delete(id);
        w.destroy();
      }
    } catch {}
  }
  
  try { 
    if (feedWindow && !feedWindow.isDestroyed()) {
      const wc = feedWindow.webContents;
      const id = wc.id;
      const dbg = wc.debugger;
      if (dbg && dbg.isAttached()) {
        dbg.detach();
      }
      feedMeta.delete(id);
      feedWindow.destroy();
    }
  } catch {}
  
  feedWindow = null;
  feedWindows = [];
  status.activeFeeds = 0;
  logger.info('feed:destroyAll:done');
}

function forwardToOverlay(channel, payload) {
  // Don't forward if live searches are disabled
  if (settings.liveSearchesEnabled === false) {
    return;
  }
  
  try {
    if (channel === 'poe-live:new-items' && Array.isArray(payload)) {
      const sample = payload.slice(0, 3).map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        seller: it.seller
      }));
      logger.info('overlay:send', { count: payload.length, sample });
    }
    if (channel === 'poe-live:removed' && Array.isArray(payload)) {
      logger.info('overlay:send-removed', { count: payload.length });
    }
  } catch {}
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try { overlayWindow.webContents.send(channel, payload); } catch {}
}

function setupFeedDebugger(bw, liveUrl, feedInfo = {}) {
  const wc = bw.webContents;
  const id = wc.id;
  // Extract search hash from URL
  let queryId = '';
  try {
    const m = /\/trade\/search\/[^/]+\/([^/]+)\/live/.exec(liveUrl);
    if (m) queryId = m[1];
  } catch {}
  feedMeta.set(id, {
    liveUrl,
    queryId,
    feedId: feedInfo.id || '',
    feedName: feedInfo.name || '',
    feedUrl: feedInfo.url || liveUrl,
    window: bw  // Store window reference
  });
  logger.info('feed:debugger:attach:start', { id, queryId, liveUrl, feedName: feedInfo.name });

  const dbg = wc.debugger;
  if (dbg.isAttached()) {
    logger.warn('feed:debugger:already-attached', { id });
    return;
  }
  
  try { 
    dbg.attach('1.3'); 
    logger.info('feed:debugger:attached', { id });
  } catch (err) {
    logger.error('feed:debugger:attach-failed', { id, error: String(err) });
    return;
  }
  
  try { 
    dbg.sendCommand('Network.enable'); 
    logger.info('feed:debugger:network-enabled', { id });
  } catch (err) {
    logger.error('feed:debugger:network-enable-failed', { id, error: String(err) });
  }
  
  try { 
    dbg.sendCommand('Network.setCacheDisabled', { cacheDisabled: true }); 
    logger.info('feed:debugger:cache-disabled', { id });
  } catch (err) {
    logger.error('feed:debugger:cache-disable-failed', { id, error: String(err) });
  }

  dbg.on('message', async (_event, method, params) => {
    if (method === 'Network.responseReceived') {
      try {
        const mime = params?.response?.mimeType;
        if (mime === 'text/event-stream') {
          logger.info('feed:es:response', { id, url: params?.response?.url });
        }
      } catch (err) {}
    }
    if (method === 'Network.eventSourceMessageReceived') {
      try {
        const data = params?.data;
        let obj = null;
        try { obj = JSON.parse(data); } catch (parseErr) {}
        
        if (obj && typeof obj === 'object') {
          const ids = []
            .concat(obj.new || [])
            .concat(obj.update || [])
            .concat(obj.created || [])
            .concat(obj.live || [])
            .filter(x => typeof x === 'string');
          const removed = []
            .concat(obj.gone || [])
            .concat(obj.remove || [])
            .concat(obj.deleted || [])
            .filter(x => typeof x === 'string');
          if (ids.length || removed.length) {
            status.lastEventTs = Date.now();
          }
          // Removed redundant fetch - poe-shim already fetches and forwards items
          // if (ids.length) {
          //   const meta = feedMeta.get(id) || {};
          //   try {
          //     const details = await fetchItemDetailsViaPage(wc, meta.queryId, ids);
          //     if (Array.isArray(details) && details.length) {
          //       forwardToOverlay('poe-live:new-items', details);
          //     }
          //   } catch (e) {}
          // }
          if (removed.length) {
            forwardToOverlay('poe-live:removed', removed);
          }
        }
      } catch (err) {}
    }
    if (method === 'Network.webSocketFrameReceived') {
      const payload = params?.response?.payloadData;
      if (!payload || typeof payload !== 'string') return;
      
      let obj = null;
      try { obj = JSON.parse(payload); } catch (parseErr) {}
      if (!obj || typeof obj !== 'object') return;
      
      // Check if this is a JWT-based result (PoE trade uses this format)
      // The website handles this JWT client-side, so let it handle it
      // We'll intercept the fetch calls instead
      if (obj.result && typeof obj.result === 'string' && obj.result.startsWith('eyJ')) {
        status.lastEventTs = Date.now();
        return;
      }
      
      const ids = []
        .concat(obj.new || [])
        .concat(obj.update || [])
        .concat(obj.created || [])
        .concat(obj.live || [])
        .filter(x => typeof x === 'string');
      const removed = []
        .concat(obj.gone || [])
        .concat(obj.remove || [])
        .concat(obj.deleted || [])
        .filter(x => typeof x === 'string');
      
      if (ids.length || removed.length) {
        status.lastEventTs = Date.now();
      }

      // Removed redundant fetch - poe-shim already fetches and forwards items
      // if (ids.length) {
      //   const meta = feedMeta.get(id) || {};
      //   try {
      //     const details = await fetchItemDetailsViaPage(wc, meta.queryId, ids);
      //     if (Array.isArray(details) && details.length) {
      //       forwardToOverlay('poe-live:new-items', details);
      //     }
      //   } catch (e) {}
      // }
      if (removed.length) {
        forwardToOverlay('poe-live:removed', removed);
      }
    }
  });

  wc.on('destroyed', () => {
    try { if (dbg.isAttached()) dbg.detach(); } catch {}
    feedMeta.delete(id);
    logger.info('feed:destroyed', { id });
  });
}

async function fetchItemDetailsViaPage(wc, queryId, ids) {
  const js = `
    (async () => {
      const queryId = ${JSON.stringify(queryId || '')};
      const ids = ${JSON.stringify(ids)};
      const chunk = (arr, size) => { const out = []; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };
      const b64urlDecode = (b) => { try { b = String(b||''); b = b.replace(/-/g,'+').replace(/_/g,'/'); const pad = b.length % 4; if (pad) b += '='.repeat(4-pad); return atob(b); } catch { return ''; } };
      const items = [];
      for (const batch of chunk(ids, 10)) {
        const url = '/api/trade/fetch/' + batch.join(',') + (queryId ? ('?query=' + encodeURIComponent(queryId)) : '');
        try {
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) continue;
          const json = await res.json();
          if (Array.isArray(json.result)) {
            for (const r of json.result) {
              try {
                const nm = (r.item?.name && r.item?.typeLine) ? (r.item.name + ' ' + r.item.typeLine) : (r.item?.typeLine || r.item?.name || 'Item');
                const price = r.listing?.price ? (r.listing.price.amount + ' ' + r.listing.price.currency) : (r.listing?.convertedPrice ? (r.listing.convertedPrice.amount + ' ' + r.listing.convertedPrice.currency) : '');
                const basePath = location.pathname.replace(/\\/live$/, '');
                const url = location.origin + basePath + '#' + (r.id || '');
                const mods = ([]).concat(r.item?.implicitMods || [], r.item?.explicitMods || [], r.item?.enchantMods || [], r.item?.fracturedMods || [], r.item?.craftedMods || []).filter(Boolean).slice(0, 10);
                const props = { ilvl: r.item?.ilvl, quality: r.item?.quality };
                items.push({ id: r.id, name: nm, price, seller: r.listing?.account?.name || '', online: !!r.listing?.account?.online, whisper: r.listing?.whisper || '', url, mods, props });
              } catch {}
            }
          }
        } catch {}
      }
      return items;
    })();
  `;
  try { return await wc.executeJavaScript(js, true); } catch { return []; }
}

// ========================================
ipcMain.on('management:show', () => {
  if (!managementWindow || managementWindow.isDestroyed()) createManagementWindow();
  else managementWindow.show();
});

ipcMain.on('networth:show', () => {
  // Show the overlay version (the real built-in version)
  if (!networthOverlayWindow || networthOverlayWindow.isDestroyed()) createNetworthOverlayWindow();
  else {
    networthOverlayWindow.show();
    networthOverlayWindow.focus();
  }
});

ipcMain.on('networth:showOverlay', () => {
  if (!networthOverlayWindow || networthOverlayWindow.isDestroyed()) createNetworthOverlayWindow();
  else {
    networthOverlayWindow.show();
    networthOverlayWindow.focus();
  }
});

// Toggle net worth overlay visibility
ipcMain.on('networth:toggleOverlay', () => {
  try {
    if (networthOverlayWindow && !networthOverlayWindow.isDestroyed() && networthOverlayWindow.isVisible()) {
      networthOverlayWindow.hide();
      return;
    }
  } catch {}
  if (!networthOverlayWindow || networthOverlayWindow.isDestroyed()) createNetworthOverlayWindow();
  else {
    networthOverlayWindow.show();
    networthOverlayWindow.focus();
  }
});

// Expose visibility state of net worth overlay
ipcMain.handle('networth-overlay:isVisible', () => {
  try {
    return !!(networthOverlayWindow && !networthOverlayWindow.isDestroyed() && networthOverlayWindow.isVisible());
  } catch {
    return false;
  }
});

ipcMain.on('networth-overlay:close', () => {
  if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
    networthOverlayWindow.hide();
  }
});

// Run timer events - forward from networth overlay to management window
ipcMain.on('run:timerUpdate', (_e, data) => {
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('run:timerUpdate', data);
  }
});

ipcMain.on('run:started', () => {
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('run:started');
  }
});

ipcMain.on('run:ended', () => {
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('run:ended');
  }
});

ipcMain.on('run:togglePause', () => {
  console.log('[MAIN] Received run:togglePause from management, forwarding to networth overlay');
  if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
    networthOverlayWindow.webContents.send('run:togglePause');
    console.log('[MAIN] Sent run:togglePause to networth overlay');
  } else {
    console.log('[MAIN] Networth overlay window not available');
  }
});

ipcMain.on('networth-overlay:minimize', () => {
  if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
    networthOverlayWindow.minimize();
  }
});

ipcMain.on('networth-overlay:moveWindow', (_event, deltaX, deltaY) => {
  if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
    const bounds = networthOverlayWindow.getBounds();
    networthOverlayWindow.setBounds({
      x: bounds.x + deltaX,
      y: bounds.y + deltaY,
      width: bounds.width,
      height: bounds.height
    });
  }
});

// Generic maximize/restore for legacy net worth window (non-overlay)
ipcMain.handle('networth:isMaximized', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    return !!(win && !win.isDestroyed() && win.isMaximized());
  } catch {
    return false;
  }
});

ipcMain.on('networth:maximize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  } catch {}
});

// Store pre-maximize bounds for transparent window workaround
let networthOverlayPreMaxBounds = null;
let networthOverlayIsManuallyMaximized = false;

ipcMain.handle('networth-overlay:isMaximized', () => {
  if (!networthOverlayWindow || networthOverlayWindow.isDestroyed()) return false;
  return networthOverlayWindow.isMaximized() || networthOverlayIsManuallyMaximized;
});

ipcMain.on('networth-overlay:maximize', () => {
  if (networthOverlayWindow && !networthOverlayWindow.isDestroyed()) {
    const currentlyMaximized = networthOverlayWindow.isMaximized() || networthOverlayIsManuallyMaximized;

    if (currentlyMaximized) {
      // Restore to previous size
      networthOverlayWindow.unmaximize();
      if (networthOverlayPreMaxBounds) {
        networthOverlayWindow.setBounds(networthOverlayPreMaxBounds);
        networthOverlayPreMaxBounds = null;
      }
      networthOverlayIsManuallyMaximized = false;
      networthOverlayWindow.webContents.send('window-maximized', false);
    } else {
      // Maximize
      networthOverlayPreMaxBounds = networthOverlayWindow.getBounds();
      networthOverlayWindow.maximize();
      // For transparent windows, manually set to screen size if maximize doesn't work
      setTimeout(() => {
        if (networthOverlayWindow && !networthOverlayWindow.isDestroyed() && !networthOverlayWindow.isMaximized()) {
          const { screen } = require('electron');
          const display = screen.getDisplayNearestPoint(networthOverlayWindow.getBounds());
          networthOverlayWindow.setBounds(display.workArea);
          networthOverlayIsManuallyMaximized = true;
          networthOverlayWindow.webContents.send('window-maximized', true);
        }
      }, 50);
    }
  }
});

// Build Overlay IPC handlers
let buildOverlayPreMaxBounds = null;
let buildOverlayIsManuallyMaximized = false;

ipcMain.on('build-overlay:close', () => {
  if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    buildOverlayWindow.hide();
  }
});

ipcMain.on('build-overlay:minimize', () => {
  if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    buildOverlayWindow.minimize();
  }
});

ipcMain.on('build-overlay:moveWindow', (_event, deltaX, deltaY) => {
  if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    const bounds = buildOverlayWindow.getBounds();
    buildOverlayWindow.setBounds({
      x: bounds.x + deltaX,
      y: bounds.y + deltaY,
      width: bounds.width,
      height: bounds.height
    });
  }
});

ipcMain.handle('build-overlay:isMaximized', () => {
  if (!buildOverlayWindow || buildOverlayWindow.isDestroyed()) return false;
  return buildOverlayWindow.isMaximized() || buildOverlayIsManuallyMaximized;
});

ipcMain.on('build-overlay:maximize', () => {
  if (buildOverlayWindow && !buildOverlayWindow.isDestroyed()) {
    const currentlyMaximized = buildOverlayWindow.isMaximized() || buildOverlayIsManuallyMaximized;

    if (currentlyMaximized) {
      // Restore to previous size
      buildOverlayWindow.unmaximize();
      if (buildOverlayPreMaxBounds) {
        buildOverlayWindow.setBounds(buildOverlayPreMaxBounds);
        buildOverlayPreMaxBounds = null;
      }
      buildOverlayIsManuallyMaximized = false;
      buildOverlayWindow.webContents.send('window-maximized', false);
    } else {
      // Maximize
      buildOverlayPreMaxBounds = buildOverlayWindow.getBounds();
      buildOverlayWindow.maximize();
      // For transparent windows, manually set to screen size if maximize doesn't work
      setTimeout(() => {
        if (buildOverlayWindow && !buildOverlayWindow.isDestroyed() && !buildOverlayWindow.isMaximized()) {
          const { screen } = require('electron');
          const display = screen.getDisplayNearestPoint(buildOverlayWindow.getBounds());
          buildOverlayWindow.setBounds(display.workArea);
          buildOverlayIsManuallyMaximized = true;
          buildOverlayWindow.webContents.send('window-maximized', true);
        }
      }, 50);
    }
  }
});

// Build data handlers
ipcMain.handle('build:getSettings', () => {
  return settings;
});

ipcMain.handle('build:saveBuild', async (_event, buildData) => {
  try {
    settings.activeBuild = buildData;
    await saveSettings(settings);
    return { success: true };
  } catch (err) {
    logger.error('build:saveBuild:error', { error: String(err) });
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('build:getActiveBuild', () => {
  return settings.activeBuild || null;
});

ipcMain.handle('build:setActiveGuideState', (_event, state) => {
  activeGuideState = state && typeof state === 'object' ? state : null;
  settings.activeGuideState = activeGuideState;
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('build:getActiveGuideState', () => {
  return activeGuideState;
});

// Build overlay show/toggle handlers
ipcMain.on('build:showOverlay', () => {
  if (!buildOverlayWindow || buildOverlayWindow.isDestroyed()) createBuildOverlayWindow();
  else {
    buildOverlayWindow.show();
    buildOverlayWindow.focus();
  }
});

ipcMain.on('build:toggleOverlay', () => {
  try {
    if (buildOverlayWindow && !buildOverlayWindow.isDestroyed() && buildOverlayWindow.isVisible()) {
      buildOverlayWindow.hide();
      return;
    }
  } catch {}
  if (!buildOverlayWindow || buildOverlayWindow.isDestroyed()) createBuildOverlayWindow();
  else {
    buildOverlayWindow.show();
    buildOverlayWindow.focus();
  }
});

ipcMain.handle('build-overlay:isVisible', () => {
  try {
    return !!(buildOverlayWindow && !buildOverlayWindow.isDestroyed() && buildOverlayWindow.isVisible());
  } catch {
    return false;
  }
});

ipcMain.handle('build:simulateLevelUp', () => {
  const current = Number.isFinite(settings.characterLevel) ? settings.characterLevel : 1;
  const nextLevel = Math.max(1, Math.min(100, Math.floor(current + 1)));
  settings.characterLevel = nextLevel;
  if (settings.buildLevelDetection === 'manual') {
    settings.buildManualLevel = nextLevel;
  }
  saveSettings(settings);
  broadcastSettingsUpdate({ characterLevel: nextLevel });
  maybeShowLevelUpPopup(nextLevel);
  return nextLevel;
});

ipcMain.on('build:positionLevelPopup', () => {
  if (!managementWindow || managementWindow.isDestroyed()) createManagementWindow();
  else managementWindow.show();
  try {
    if (managementWindow && !managementWindow.isDestroyed()) {
      managementWindow.webContents.send('build:positionLevelPopup');
    }
  } catch {}
});

  // Passive skill tree fetcher (PoE)
  let passiveTreeCache = null;

  async function fetchPassiveTreeData() {
    const https = require('https');
    const url = 'https://www.pathofexile.com/passive-skill-tree';

    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        },
        (res) => {
          let html = '';
          res.on('data', (chunk) => {
            html += chunk;
          });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const startMarker = 'var passiveSkillTreeData = ';
            const endMarker = '};\n            var opts = {';
            const startIdx = html.indexOf(startMarker);
            const endIdx = html.indexOf(endMarker, startIdx);
            if (startIdx === -1 || endIdx === -1) {
              return reject(new Error('Could not locate passiveSkillTreeData block in PoE HTML'));
            }

            const jsonText = html.slice(startIdx + startMarker.length, endIdx + 1).trim();
            try {
              const data = JSON.parse(jsonText);
              resolve(data);
            } catch (e) {
              reject(e);
            }
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Timeout while fetching passive skill tree data'));
      });
    });
  }

  ipcMain.handle('build:getPassiveTree', async () => {
    try {
      if (passiveTreeCache) {
        return { success: true, data: passiveTreeCache };
      }
      const data = await fetchPassiveTreeData();
      passiveTreeCache = data;
      return { success: true, data };
    } catch (err) {
      logger.error('build:getPassiveTree:error', { error: String(err) });
      return { success: false, error: String(err) };
    }
  });

ipcMain.on('whispers:show', () => {
  // Whispers are now shown in the main overlay, so just show that
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
  else overlayWindow.show();
});

ipcMain.handle('settings:checkFileExists', async (_e, filePath) => {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
});

ipcMain.handle('settings:autoDetectClientLog', async () => {
  const detected = autoDetectClientLogPath();
  if (detected) {
    logger.info('settings:autoDetectClientLog:found', { path: detected });
    return detected;
  }
  logger.info('settings:autoDetectClientLog:not-found');
  return null;
});

ipcMain.handle('settings:browseClientLog', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    title: 'Select Path of Exile Client.txt',
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC HANDLERS (Registered ONCE, before app.whenReady)
// ========================================

// IPC from live-preload
ipcMain.on('poe-live:raw', (_e, raw) => {
  forwardToOverlay('poe-live:raw', raw);
});
ipcMain.on('poe-live:new-items', (_e, items) => {
  try {
    status.lastEventTs = Date.now();
    logger.info('overlay:incoming', { count: Array.isArray(items) ? items.length : 0 });
  } catch {}

  // Enrich items with feed metadata
  const senderId = _e.sender.id;
  const meta = feedMeta.get(senderId) || {};
  const enrichedItems = Array.isArray(items) ? items.map(item => ({
    ...item,
    feedId: meta.feedId || '',
    feedName: meta.feedName || '',
    feedUrl: meta.feedUrl || ''
  })) : items;

  // Track feed icon (first item icon for each feed)
  if (Array.isArray(items) && items.length > 0 && meta.feedId && settings.feeds) {
    const feed = settings.feeds.find(f => f.id === meta.feedId);
    if (feed && !feed.icon && items[0].icon) {
      // Store the first item's icon as the feed icon
      feed.icon = items[0].icon;
      saveSettings(settings);
      logger.info('management:feedIcon', { feedId: feed.id, icon: feed.icon });

      // Notify management window
      if (managementWindow && !managementWindow.isDestroyed()) {
        managementWindow.webContents.send('management:feedIconUpdate', {
          feedId: feed.id,
          icon: feed.icon
        });
      }
    }
  }

  forwardToOverlay('poe-live:new-items', enrichedItems);
});
ipcMain.on('poe-live:removed', (_e, ids) => {
  try {
    status.lastEventTs = Date.now();
    logger.info('overlay:removed', { count: Array.isArray(ids) ? ids.length : 0 });
  } catch {}
  forwardToOverlay('poe-live:removed', ids);
});

ipcMain.on('poe-live:rate-limited', () => {
  logger.warn('feed:rate-limited', { message: 'PoE API returned 429 - Too Many Requests' });
  forwardToOverlay('poe-live:rate-limited');
});

// Overlay actions
ipcMain.on('overlay:openExternal', (_e, url) => {
  if (!isAllowedExternalUrl(url)) {
    logger.warn('overlay:openExternal:blocked', { url });
    return;
  }
  shell.openExternal(url).catch((err) => {
    logger.error('overlay:openExternal:failed', { url, error: String(err) });
  });
});

// Refresh item on trade website and check if still available
ipcMain.on('overlay:refreshItemOnSite', async (_e, itemId) => {
  logger.info('overlay:refreshItemOnSite', { itemId });

  const allFeeds = [feedWindow, ...feedWindows].filter(Boolean);

  for (const feed of allFeeds) {
    try {
      const result = await feed.webContents.executeJavaScript(`
        (function() {
          const itemId = '${itemId}';

          // Try to find row by data-id in results
          let resultRow = document.querySelector(\`[data-id="\${itemId}"]\`);

          if (!resultRow) {
            // Try finding in the live search results container
            const containers = ['.resultset', '.results', '[class*="result"]'];
            for (const container of containers) {
              const parent = document.querySelector(container);
              if (parent) {
                resultRow = parent.querySelector(\`[data-id="\${itemId}"]\`);
                if (resultRow) break;
              }
            }
          }

          if (!resultRow) {
            return { success: false, reason: 'Result row not found' };
          }

          // Check if item shows "Item no longer available" error
          const errorSpan = resultRow.querySelector('span.error');
          if (errorSpan && errorSpan.textContent.includes('Item no longer available')) {
            console.log('[REFRESH] Item no longer available:', itemId);
            return { success: true, available: false };
          }

          // Find and click refresh button
          const refreshBtn = resultRow.querySelector('button.refresh, button[title="Refresh"]');
          if (!refreshBtn) {
            return { success: false, reason: 'Refresh button not found' };
          }

          // Click the refresh button
          refreshBtn.click();
          console.log('[REFRESH] Clicked refresh button for item:', itemId);

          // Wait a moment and check if error appears
          return new Promise((resolve) => {
            setTimeout(() => {
              const errorSpanAfter = resultRow.querySelector('span.error');
              if (errorSpanAfter && errorSpanAfter.textContent.includes('Item no longer available')) {
                console.log('[REFRESH] Item no longer available after refresh:', itemId);
                resolve({ success: true, available: false });
              } else {
                resolve({ success: true, available: true });
              }
            }, 500);
          });
        })();
      `);

      if (result.success) {
        logger.info('overlay:refreshItemOnSite:success', { itemId, available: result.available });

        // If item is no longer available, notify overlay to remove it
        if (result.available === false && overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('poe-live:item-unavailable', itemId);
        }
        return;
      } else {
        logger.warn('overlay:refreshItemOnSite:not-found-in-feed', { itemId, reason: result.reason });
      }
    } catch (err) {
      logger.error('overlay:refreshItemOnSite:error', { itemId, error: String(err) });
    }
  }

  logger.error('overlay:refreshItemOnSite:failed', { itemId, reason: 'Not found in any feed window' });
});

// Click hideout button on trade website
ipcMain.on('overlay:clickHideoutOnSite', async (_e, itemId) => {
  logger.info('overlay:clickHideoutOnSite', { itemId });

  // Try to find and click the hideout button on the trade site
  const allFeeds = [feedWindow, ...feedWindows].filter(Boolean);

  for (const feed of allFeeds) {
    try {
      const result = await feed.webContents.executeJavaScript(`
        (function() {
          const itemId = '${itemId}';

          // Debug: Log all data-id attributes
          const allDataIds = Array.from(document.querySelectorAll('[data-id]')).map(el => el.getAttribute('data-id'));
          console.log('[HIDEOUT DEBUG] All data-ids found:', allDataIds);
          console.log('[HIDEOUT DEBUG] Looking for itemId:', itemId);

          // Try to find row by data-id in results
          let resultRow = document.querySelector(\`[data-id="\${itemId}"]\`);

          if (!resultRow) {
            // Try finding in the live search results container
            const containers = ['.resultset', '.results', '[class*="result"]'];
            for (const container of containers) {
              const parent = document.querySelector(container);
              if (parent) {
                resultRow = parent.querySelector(\`[data-id="\${itemId}"]\`);
                if (resultRow) break;
              }
            }
          }

          if (!resultRow) {
            return { success: false, reason: 'Result row not found', debug: { foundIds: allDataIds.slice(0, 5) } };
          }

          console.log('[HIDEOUT DEBUG] Found row:', resultRow.outerHTML.substring(0, 200));

          // Debug: Log all buttons in the row
          const allButtons = Array.from(resultRow.querySelectorAll('button, [role="button"], a.button, .btn'));
          console.log('[HIDEOUT DEBUG] Button count:', allButtons.length);
          allButtons.forEach((b, idx) => {
            const info = {
              tag: b.tagName,
              class: b.className,
              text: b.textContent.trim().substring(0, 30),
              title: b.title,
              hasToken: !!b.getAttribute('data-token'),
              dataToken: b.getAttribute('data-token') ? 'HAS_TOKEN' : null
            };
            console.log(\`[HIDEOUT DEBUG] Button \${idx}:\`, JSON.stringify(info));
          });

          // Look for hideout button - try multiple selectors
          const selectors = [
            '.direct-btn',                    // Primary: Travel to Hideout button
            'button.direct-btn',
            'button[data-token]',             // Fallback: older selectors
            '[data-token]',
            'button[title*="Visit" i]',
            'button[title*="Hideout" i]'
          ];

          let hideoutBtn = null;
          for (const sel of selectors) {
            hideoutBtn = resultRow.querySelector(sel);
            if (hideoutBtn) {
              console.log('[HIDEOUT DEBUG] Found button with selector:', sel);
              break;
            }
          }

          if (!hideoutBtn) {
            return {
              success: false,
              reason: 'Hideout button not found in row',
              debug: {
                buttons: allButtons.map(b => b.className).join(', ')
              }
            };
          }

          // Click the button
          console.log('[HIDEOUT DEBUG] Clicking button:', hideoutBtn.outerHTML.substring(0, 100));
          hideoutBtn.click();
          return { success: true, buttonText: hideoutBtn.textContent.trim() };
        })();
      `);

      if (result.success) {
        logger.info('overlay:clickHideoutOnSite:success', { itemId, feed: feed.id });
        return;
      } else {
        logger.warn('overlay:clickHideoutOnSite:not-found-in-feed', { itemId, feed: feed.id, reason: result.reason });
      }
    } catch (err) {
      logger.error('overlay:clickHideoutOnSite:error', { itemId, feed: feed.id, error: String(err) });
    }
  }

  logger.error('overlay:clickHideoutOnSite:failed', { itemId, reason: 'Not found in any feed window' });
});

// Click whisper button on trade website
ipcMain.on('overlay:clickWhisperOnSite', async (_e, itemId) => {
  logger.info('overlay:clickWhisperOnSite', { itemId });

  const allFeeds = [feedWindow, ...feedWindows].filter(Boolean);

  for (const feed of allFeeds) {
    try {
      const result = await feed.webContents.executeJavaScript(`
        (function() {
          const itemId = '${itemId}';

          const selectors = [
            \`[data-id="\${itemId}"]\`,
            \`#\${itemId}\`,
            \`.resultset [data-id="\${itemId}"]\`
          ];

          let resultRow = null;
          for (const sel of selectors) {
            resultRow = document.querySelector(sel);
            if (resultRow) break;
          }

          if (!resultRow) {
            return { success: false, reason: 'Result row not found' };
          }

          // Look for whisper/copy button
          // There are two types: "Direct Whisper" (class="direct-btn") and "Copy Whisper" (class="whisper-btn")
          let whisperBtn = null;

          // First try: direct-btn with "Whisper" text
          const directBtns = Array.from(resultRow.querySelectorAll('.direct-btn'));
          whisperBtn = directBtns.find(btn => btn.textContent.toLowerCase().includes('whisper'));

          // Fallback: other whisper selectors
          if (!whisperBtn) {
            whisperBtn = resultRow.querySelector('.whisper-btn, [data-clipboard-text], .whisper-button, button[title*="whisper" i], button[title*="copy" i]');
          }

          if (!whisperBtn) {
            return { success: false, reason: 'Whisper button not found in row' };
          }

          whisperBtn.click();
          return { success: true, buttonText: whisperBtn.textContent.trim() };
        })();
      `);

      if (result.success) {
        logger.info('overlay:clickWhisperOnSite:success', { itemId, feed: feed.id });
        return;
      }
    } catch (err) {
      logger.error('overlay:clickWhisperOnSite:error', { itemId, error: String(err) });
    }
  }

  logger.error('overlay:clickWhisperOnSite:failed', { itemId });
});

// Send text to game using a PowerShell helper
let sendInProgress = false;
ipcMain.on('overlay:sendToGame', async (_e, text) => {
  if (sendInProgress) {
    logger.warn('overlay:sendToGame:blocked', { reason: 'already-in-progress' });
    return;
  }
  
  sendInProgress = true;
  try {
    logger.info('overlay:sendToGame', { textLength: text ? text.length : 0 });

    // Copy to clipboard
    const { clipboard } = require('electron');
    clipboard.writeText(text || '');

    // Ensure PS helper exists once, reuse afterwards
    try { if (!poeScriptPath) writePoeScript(); } catch {}
    let scriptPath = poeScriptPath || getPoeScriptPath();
    // If script missing (first run or cleanup), write it now
    try { if (!fs.existsSync(scriptPath)) writePoeScript(); } catch {}
    // Migrate legacy script with @" here-string to @' variant
    try {
      const head = fs.readFileSync(scriptPath, 'utf8').slice(0, 200);
      if (head.includes('Add-Type @"')) { writePoeScript(); scriptPath = poeScriptPath; }
    } catch {}

    const { execFile } = require('child_process');
    logger.info('overlay:sendToGame:executing');
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ], { timeout: 5000 }, (err, stdout, stderr) => {
        sendInProgress = false;
        
        if (err) {
          logger.error('overlay:sendToGame:failed', { error: String(err), stdout: stdout ? stdout.trim() : '', stderr: String(stderr) });
          return;
        }
        
        const output = stdout.trim();
        
        if (output.includes('SUCCESS')) {
          logger.info('overlay:sendToGame:success', { method: 'AttachThreadInput' });
        } else if (output.includes('ERROR:SENDINPUT_FAILED')) {
          logger.error('overlay:sendToGame:sendinput-failed', { reason: 'Elevation mismatch - run app as admin if PoE runs as admin', output });
        } else if (output.includes('ERROR:NO_POE_WINDOW')) {
          logger.error('overlay:sendToGame:no-poe-window', { reason: 'POEWindowClass not found' });
        } else if (output.includes('ERROR:FOCUS_TIMEOUT')) {
          logger.error('overlay:sendToGame:focus-timeout', { reason: 'Failed to focus PoE within 100ms' });
        } else if (output.includes('FOUND:POE_WINDOW') || output.includes('FOCUS_OK') || output.includes('WARN:FOCUS_TIMEOUT')) {
          // Partial success - found window but something went wrong after
          logger.warn('overlay:sendToGame:partial-success', { output });
        } else {
          logger.warn('overlay:sendToGame:unexpected-output', { output });
        }
      });
  } catch (err) {
    logger.error('overlay:sendToGame:error', { error: String(err) });
    sendInProgress = false;
  }
});

function createTestItem(index) {
  // Currency icon mapping - same as in client-log-watcher.js
  const currencyIconMap = {
    'chaos': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
    'divine': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
    'exalted': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png'
  };
  
  const testItems = [
    {
      name: 'Phoenix Mitts Murder Mitts',
      price: '15 chaos',
      priceAmount: '15',
      priceCurrency: 'chaos',
      currencyIcon: currencyIconMap['chaos'],
      seller: 'TestPlayer1',
      online: true,
      status: 'online',
      modsDetailed: [
        { text: '+32 to Evasion Rating', type: 'explicit', tier: 'P1', range: '[21—42]', affix: 'prefix' },
        { text: '+143 to maximum Life', type: 'explicit', tier: 'P1 + P1', range: '[24—28] + [115—129]', affix: 'prefix' },
        { text: 'Regenerate 41.1 Life per second', type: 'explicit', tier: 'S3', range: '[32.1—48]', affix: 'suffix' },
        { text: '0.37% of Physical Attack Damage Leeched as Life', type: 'explicit', tier: 'S1', range: '[0.2—0.4]', affix: 'suffix' }
      ]
    },
    {
      name: 'Mystic Shadows Iceberg Map',
      price: '1 chaos',
      priceAmount: '1',
      priceCurrency: 'chaos',
      currencyIcon: currencyIconMap['chaos'],
      seller: 'TestPlayer2',
      online: true,
      status: 'online',
      modsDetailed: [
        { text: 'Area contains The Sacred Grove', type: 'implicit', tier: '', range: '', affix: '' },
        { text: 'Area has increased monster variety', type: 'explicit', tier: 'P1', range: '[3—3]', affix: 'prefix' },
        { text: '25% increased Magic Monsters', type: 'explicit', tier: 'S1', range: '[20—30]', affix: 'suffix' },
        { text: 'Monsters have 30% chance to Avoid Elemental Ailments', type: 'explicit', tier: 'S1', range: '[30—30]', affix: 'suffix' },
        { text: '20% increased Monster Movement Speed', type: 'explicit', tier: 'P1', range: '[15—20]', affix: 'prefix' },
        { text: '20% increased Monster Attack Speed', type: 'explicit', tier: 'P1', range: '[20—25]', affix: 'prefix' },
        { text: '25% increased Monster Cast Speed', type: 'explicit', tier: 'P1', range: '[20—25]', affix: 'prefix' },
        { text: 'Unique Boss has 25% increased Life', type: 'explicit', tier: 'P1', range: '[25—25]', affix: 'prefix' },
        { text: 'Unique Boss has 45% increased Area of Effect', type: 'explicit', tier: 'P1', range: '[45—45]', affix: 'prefix' },
        { text: 'Players have 15% less Accuracy Rating', type: 'explicit', tier: 'S1', range: '[-15—-15]', affix: 'suffix' }
      ]
    },
    {
      name: 'Steel Ring of Rage',
      price: '50 chaos',
      priceAmount: '50',
      priceCurrency: 'chaos',
      currencyIcon: currencyIconMap['chaos'],
      seller: 'TestPlayer3',
      online: true,
      status: 'online',
      modsDetailed: [
        { text: 'Adds 3 to 4 Physical Damage to Attacks', type: 'implicit', tier: '', range: '', affix: '' },
        { text: '+45 to Strength', type: 'explicit', tier: 'P2', range: '[38—42]', affix: 'prefix' },
        { text: '+72 to maximum Life', type: 'explicit', tier: 'P2', range: '[70—79]', affix: 'prefix' },
        { text: '48% increased Elemental Damage with Attack Skills', type: 'explicit', tier: 'S1', range: '[46—48]', affix: 'suffix' },
        { text: '+39% to Fire Resistance', type: 'explicit', tier: 'S2', range: '[36—41]', affix: 'suffix' }
      ]
    }
  ];

  const template = testItems[index % testItems.length];
  return {
    id: 'test-item-' + Date.now() + '-' + Math.random(),
    name: template.name,
    feedName: `Test Feed ${(index % testItems.length) + 1}`, // Add feedName for testing displayFeedName setting
    price: template.price,
    priceAmount: template.priceAmount,
    priceCurrency: template.priceCurrency,
    currencyIcon: template.currencyIcon,
    seller: template.seller,
    character: template.seller.replace('Player', 'Char'),
    online: template.online !== undefined ? template.online : true,
    status: template.status || 'online',
    whisper: `@${template.seller} Hi, I would like to buy your ${template.name} listed for ${template.price}`,
    url: 'https://www.pathofexile.com/trade/',
    icon: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvUmluZ3MvUmluZzEzIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/e4732f6815/Ring13.png',
    mods: template.modsDetailed.map(m => m.text),
    modsDetailed: template.modsDetailed,
    props: { ilvl: 75, quality: 20 },
    availableButtons: {
      hideout: false,
      whisper: true
    }
  };
}

let testItemCounter = 0;
let testWhisperCounter = 0;

function createTestWhisper(index) {
  // Currency icon mapping - same as in client-log-watcher.js
  const currencyIconMap = {
    'chaos': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
    'divine': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
    'exalted': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png'
  };
  
  const testWhispers = [
    {
      type: 'incoming',
      playerName: 'TestPlayer1',
      guildName: 'TestGuild',
      message: 'Hi, I would like to buy your Phoenix Mitts Murder Mitts listed for 15 chaos in Standard (stash tab "Tab1"; position: left 5, top 3).',
      date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      time: new Date().toTimeString().split(' ')[0],
      // Parsed trade details
      itemName: 'Phoenix Mitts Murder Mitts',
      itemQuantity: 1,
      priceQuantity: 15,
      priceType: 'chaos',
      currencyIcon: currencyIconMap['chaos'],
      league: 'Standard',
      stashTabName: 'Tab1',
      stashX: 5,
      stashY: 3
    },
    {
      type: 'outgoing',
      playerName: 'TestPlayer2',
      guildName: null,
      message: 'Hi, I would like to buy your Mystic Shadows Iceberg Map listed for 1 chaos in Standard (stash tab "Tab2"; position: left 2, top 1).',
      date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      time: new Date().toTimeString().split(' ')[0],
      // Parsed trade details
      itemName: 'Mystic Shadows Iceberg Map',
      itemQuantity: 1,
      priceQuantity: 1,
      priceType: 'chaos',
      currencyIcon: currencyIconMap['chaos'],
      league: 'Standard',
      stashTabName: 'Tab2',
      stashX: 2,
      stashY: 1
    },
    {
      type: 'incoming',
      playerName: 'TestPlayer3',
      guildName: null,
      message: 'Hi, I\'d like to buy your Steel Ring of Rage listed for 50 chaos in Standard.',
      date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      time: new Date().toTimeString().split(' ')[0],
      // Parsed trade details
      itemName: 'Steel Ring of Rage',
      itemQuantity: 1,
      priceQuantity: 50,
      priceType: 'chaos',
      currencyIcon: currencyIconMap['chaos'],
      league: 'Standard'
    }
  ];

  const template = testWhispers[index % testWhispers.length];
  return {
    ...template,
    timestamp: Date.now()
  };
}

ipcMain.on('overlay:test', () => {
  logger.info('overlay:test:start');
  
  // Show overlay window first
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    logger.info('overlay:test:creating-window');
    createOverlayWindow();
  }
  
  // Show window and make sure it's not click-through
  overlayWindow.show();
  overlayWindow.setIgnoreMouseEvents(false);
  overlayVisible = true;
  updateOverlayMouse();
  
  logger.info('overlay:test:window-shown');
  
  // Wait for window to be ready before sending messages
  const sendTestData = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      logger.warn('overlay:test:window-destroyed');
      return;
    }
    
    logger.info('overlay:test:sending-data');
    
    // Add test items - send directly to overlay window
    const testItem1 = createTestItem(0);
    const testItem2 = createTestItem(1);
    logger.info('overlay:test:sending', { testItems: [testItem1, testItem2] });
    
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('poe-live:new-items', [testItem1, testItem2]);
      logger.info('overlay:test:items-sent');
    }
    
    // Add test whispers
    const testWhisper1 = createTestWhisper(0);
    const testWhisper2 = createTestWhisper(1);
    logger.info('overlay:test:sending-whispers', { testWhispers: [testWhisper1, testWhisper2] });
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:new-whisper', testWhisper1);
      overlayWindow.webContents.send('overlay:new-whisper', testWhisper2);
      logger.info('overlay:test:whispers-sent');
    }
    
    logger.info('overlay:test:sent');
    testItemCounter = 2;
    testWhisperCounter = 2;
  };
  
  // Wait for webContents to be ready
  if (overlayWindow.webContents.isLoading()) {
    logger.info('overlay:test:waiting-for-load');
    overlayWindow.webContents.once('did-finish-load', () => {
      logger.info('overlay:test:load-complete');
      setTimeout(sendTestData, 500); // Longer delay to ensure renderer is ready
    });
  } else {
    logger.info('overlay:test:already-loaded');
    setTimeout(sendTestData, 500); // Longer delay to ensure renderer is ready
  }
});

ipcMain.on('overlay:addTestItem', () => {
  // Ensure overlay window is visible
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  overlayWindow.show();
  
  // Wait a bit for window to be ready
  setTimeout(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const newItem = createTestItem(testItemCounter);
    testItemCounter++;
    logger.info('overlay:addTestItem:sending', { item: newItem });
    forwardToOverlay('poe-live:new-items', [newItem]);
    logger.info('overlay:addTestItem:sent');
  }, 100);
});

ipcMain.on('overlay:addTestWhisper', () => {
  // Ensure overlay window is visible
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  overlayWindow.show();
  
  // Wait a bit for window to be ready
  setTimeout(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const newWhisper = createTestWhisper(testWhisperCounter);
    testWhisperCounter++;
    logger.info('overlay:addTestWhisper:sending', { whisper: newWhisper });
    overlayWindow.webContents.send('overlay:new-whisper', newWhisper);
    logger.info('overlay:addTestWhisper:sent');
  }, 100);
});

ipcMain.on('management:setClickThrough', (_e, enabled) => {
  if (managementWindow && !managementWindow.isDestroyed()) {
    try {
      managementWindow.setIgnoreMouseEvents(enabled, { forward: true });
      logger.debug('management:setClickThrough', { enabled });
    } catch (err) {
      logger.error('management:setClickThrough:error', { error: String(err) });
    }
  }
});
ipcMain.on('management:setFocusMode', (_e, enabled) => {
  managementAllowFocus = !!enabled;
  if (managementWindow && !managementWindow.isDestroyed()) {
    try {
      managementWindow.setFocusable(managementAllowFocus);
    } catch (err) {
      logger.error('management:setFocusMode:focusable:error', { error: String(err) });
    }
    try {
      if (managementAllowFocus) {
        managementWindow.focus();
      } else {
        managementWindow.blur();
      }
    } catch {}
  }
});

ipcMain.handle('overlay:getState', () => ({
  locked: !!settings.overlayLocked
}));
ipcMain.on('overlay:setLocked', (_e, locked) => {
  settings.overlayLocked = !!locked;
  saveSettings(settings);
  applyOverlayLock();

  // Broadcast updated lock state to settings window if open
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:updated', settings);
  }
});
ipcMain.on('overlay:setVisible', (_e, visible) => {
  overlayVisible = !!visible;
  logger.info('overlay:setVisible', { visible: overlayVisible, locked: settings.overlayLocked });
  updateOverlayMouse();
  
  // Notify settings window about overlay visibility change
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('overlay:visibilityChanged', overlayVisible);
  }
});

ipcMain.handle('overlay:isVisible', () => {
  return overlayVisible && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
});

let lastResizeTime = 0;
let lastWindowPosition = null;
let isDragging = false;

ipcMain.on('overlay:resize', (_e, size) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const { width, height } = size;
  const currentBounds = overlayWindow.getBounds();

  // Don't block resize if position changed - that can happen naturally
  // Only track position for logging
  if (lastWindowPosition && (lastWindowPosition.x !== currentBounds.x || lastWindowPosition.y !== currentBounds.y)) {
    logger.info('overlay:resize - position changed', {
      from: lastWindowPosition,
      to: { x: currentBounds.x, y: currentBounds.y }
    });
  }
  lastWindowPosition = { x: currentBounds.x, y: currentBounds.y };

  // Debounce resize calls (max once per 100ms) to avoid excessive calls
  const now = Date.now();
  if (now - lastResizeTime < 100) {
    return;
  }
  lastResizeTime = now;

  // Only resize if dimensions changed significantly (avoid jitter)
  if (Math.abs(currentBounds.height - height) > 5 || Math.abs(currentBounds.width - width) > 5) {
    logger.info('overlay:resize', {
      from: { w: currentBounds.width, h: currentBounds.height },
      to: { w: width, h: height }
    });

    overlayWindow.setSize(width, height, false);
  }
});

ipcMain.on('overlay:minimize', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.minimize();
  }
});

ipcMain.on('overlay:maximize', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (overlayWindow.isMaximized()) {
      overlayWindow.unmaximize();
    } else {
      overlayWindow.maximize();
    }
  }
});

ipcMain.on('overlay:close', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
});

ipcMain.handle('overlay:isMaximized', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  return overlayWindow.isMaximized();
});

// Settings IPC
ipcMain.handle('settings:get', () => {
  return settings;
});
ipcMain.handle('live-tracking:disable-all', async () => {
  try {
    return await disableAllLiveTracking();
  } catch (err) {
    logger.error('live-tracking:disable-all-failed', { error: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('live-tracking:toggle-active-character', async (_event, options) => {
  try {
    return await toggleLiveTrackingForActiveCharacter(options || {});
  } catch (err) {
    logger.error('live-tracking:toggle-active-character-failed', { error: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('settings:set', (e, partial) => {
  if (!partial || typeof partial !== 'object') return settings;

  let refreshClientWatcher = false;
  let refreshShortcuts = false;
  
  // Normalize clientLogPath: convert empty strings to null and trim whitespace
  if (partial.clientLogPath !== undefined) {
    if (typeof partial.clientLogPath === 'string') {
      partial.clientLogPath = partial.clientLogPath.trim() || null;
    } else if (partial.clientLogPath !== null) {
      // Invalid type, don't change it
      delete partial.clientLogPath;
    }
  }

  if (partial.buildQuickPreviewShortcut !== undefined) {
    if (typeof partial.buildQuickPreviewShortcut === 'string') {
      partial.buildQuickPreviewShortcut = partial.buildQuickPreviewShortcut.trim() || null;
      refreshShortcuts = true;
    } else if (partial.buildQuickPreviewShortcut === null) {
      refreshShortcuts = true;
    } else {
      delete partial.buildQuickPreviewShortcut;
    }
  }
  if (partial.openSettingsShortcut !== undefined) {
    if (typeof partial.openSettingsShortcut === 'string') {
      partial.openSettingsShortcut = partial.openSettingsShortcut.trim() || null;
      refreshShortcuts = true;
    } else if (partial.openSettingsShortcut === null) {
      refreshShortcuts = true;
    } else {
      delete partial.openSettingsShortcut;
    }
  }
  if (partial.buildQuickPreviewControllerCombo !== undefined) {
    if (typeof partial.buildQuickPreviewControllerCombo === 'string') {
      partial.buildQuickPreviewControllerCombo = partial.buildQuickPreviewControllerCombo.trim() || null;
    } else if (partial.buildQuickPreviewControllerCombo !== null) {
      delete partial.buildQuickPreviewControllerCombo;
    }
  }
  if (partial.buildQuickPreviewControllerEnabled !== undefined) {
    if (typeof partial.buildQuickPreviewControllerEnabled !== 'boolean') {
      delete partial.buildQuickPreviewControllerEnabled;
    }
  }
  if (partial.openSettingsControllerCombo !== undefined) {
    if (typeof partial.openSettingsControllerCombo === 'string') {
      partial.openSettingsControllerCombo = partial.openSettingsControllerCombo.trim() || null;
    } else if (partial.openSettingsControllerCombo !== null) {
      delete partial.openSettingsControllerCombo;
    }
  }
  if (partial.openSettingsControllerEnabled !== undefined) {
    if (typeof partial.openSettingsControllerEnabled !== 'boolean') {
      delete partial.openSettingsControllerEnabled;
    }
  }
  if (partial.controllerType !== undefined) {
    if (typeof partial.controllerType === 'string') {
      const normalized = partial.controllerType.trim().toLowerCase();
      if (['auto', 'xbox', 'playstation', 'nintendo', 'generic'].includes(normalized)) {
        partial.controllerType = normalized;
      } else {
        delete partial.controllerType;
      }
    } else {
      delete partial.controllerType;
    }
  }
  
  if (partial.liveUrl && typeof partial.liveUrl === 'string' && partial.liveUrl !== settings.liveUrl) {
    if (!isValidLiveFeedUrl(partial.liveUrl)) {
      logger.warn('settings:liveUrl-invalid', { url: partial.liveUrl });
      delete partial.liveUrl;
    }
  }
  if (partial.liveUrl && typeof partial.liveUrl === 'string' && partial.liveUrl !== settings.liveUrl) {
    logger.info('settings:liveUrl-change', { old: settings.liveUrl, new: partial.liveUrl });
    destroyAllFeeds();
    settings.liveUrl = partial.liveUrl;
    // Only create feed if live searches are enabled
    if (settings.liveSearchesEnabled !== false && settings.liveUrl) {
      createFeedWindow(settings.liveUrl);
    }
  }
  if (typeof partial.liveUrls !== 'undefined' && Array.isArray(partial.liveUrls)) {
    const wasEmpty = !settings.liveUrls || !settings.liveUrls.length;
    settings.liveUrls = partial.liveUrls.filter((u) => typeof u === 'string' && isValidLiveFeedUrl(u));
    if (wasEmpty && settings.liveUrls.length) {
      destroyAllFeeds();
      // Only create feeds if live searches are enabled
      if (settings.liveSearchesEnabled !== false) {
        for (const url of settings.liveUrls) createFeedWindow(url);
      }
    }
  }
  if (typeof partial.readOnly === 'boolean') settings.readOnly = partial.readOnly;
  if (typeof partial.overlayBounds === 'object') settings.overlayBounds = partial.overlayBounds;
    if (partial.clientLogPath !== undefined) {
      const oldPath = settings.clientLogPath;
      settings.clientLogPath = partial.clientLogPath;
      logger.info('settings:clientLogPath-changed', { 
        old: oldPath, 
        new: settings.clientLogPath 
      });
      if (oldPath !== settings.clientLogPath) {
        refreshClientWatcher = true;
      }
    }
    // Handle whispersEnabled toggle
    if (typeof partial.whispersEnabled === 'boolean') {
      settings.whispersEnabled = partial.whispersEnabled;
      refreshClientWatcher = true;
    }

    if (partial.buildLevelDetection === 'auto' || partial.buildLevelDetection === 'manual') {
      settings.buildLevelDetection = partial.buildLevelDetection;
      refreshClientWatcher = true;
      if (partial.buildLevelDetection === 'manual' && partial.characterLevel === undefined) {
        const fallbackLevel = settings.buildManualLevel || settings.characterLevel || 1;
        partial.characterLevel = fallbackLevel;
      }
    }

    if (typeof partial.buildManualLevel === 'number') {
      const clampedManual = Math.max(1, Math.min(100, Math.floor(partial.buildManualLevel)));
      partial.buildManualLevel = clampedManual;
      settings.buildManualLevel = clampedManual;
      if ((partial.buildLevelDetection || settings.buildLevelDetection) === 'manual') {
        partial.characterLevel = clampedManual;
      }
    }

    if (typeof partial.characterLevel === 'number') {
      partial.characterLevel = Math.max(1, Math.min(100, Math.floor(partial.characterLevel)));
    }
  // Handle liveSearchesEnabled toggle
  if (typeof partial.liveSearchesEnabled === 'boolean') {
    settings.liveSearchesEnabled = partial.liveSearchesEnabled;
    if (!settings.liveSearchesEnabled) {
      // Destroy all feeds if disabled
      destroyAllFeeds();
    } else {
      // Reconnect feeds if enabled
      const validFeeds = normalizeLiveFeedList(settings.feeds || []).filter((f) => !f.muted);
      if (validFeeds.length > 0) {
        feedWindows = validFeeds
          .map((feed) => createFeedWindowFor(feed.url, feed))
          .filter(Boolean);
        status.activeFeeds = feedWindows.length;
        status.lastConnectTs = Date.now();
      }
    }
  }
  if (typeof partial.feeds !== 'undefined') {
    partial.feeds = normalizeLiveFeedList(partial.feeds || []);
  }
  if (typeof partial.buildGuideEnabled === 'boolean') {
    settings.buildGuideEnabled = partial.buildGuideEnabled;
    refreshClientWatcher = true;
  }
  if (partial.liveTrackingDefaultVisibility !== undefined) {
    partial.liveTrackingDefaultVisibility = partial.liveTrackingDefaultVisibility === 'public' ? 'public' : 'private';
  }
  if (partial.liveTrackingPending !== undefined || partial.liveTrackingByCharacter !== undefined) {
    refreshClientWatcher = true;
  }
  // Merge partial settings into full settings object
  // Note: clientLogPath is already normalized above, so it's safe to merge
  settings = { ...settings, ...partial };

    if (
      partial.liveTrackingByCharacter !== undefined ||
      partial.activeCharacterName !== undefined ||
      partial.activeCharacterLeague !== undefined ||
      partial.liveTrackingDefaultVisibility !== undefined
    ) {
      refreshCurrentCharacterLiveTrackingState();
    }

    // Ensure clientLogPath is properly set (should already be normalized, but double-check)
    if (partial.clientLogPath !== undefined) {
      settings.clientLogPath = partial.clientLogPath;
    }

    if (refreshClientWatcher) {
      ensureClientLogWatcher();
    }

  saveSettings(settings);
  logger.info('settings:save', { keys: Object.keys(partial || {}) });

  broadcastSettingsUpdate(partial);
  if (refreshShortcuts) refreshGlobalShortcuts();

  return settings;
});
ipcMain.on('settings:focusOverlay', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.focus();
});
// Show Settings window on demand (used by management + button)
ipcMain.on('settings:show', (_e, tab) => {
  showSettingsWindow(tab);
});
ipcMain.on('settings:toggle', (_e, tab) => {
  toggleSettingsWindow(tab);
});
ipcMain.on('settings:destroyAllFeeds', () => {
  destroyAllFeeds();
});
ipcMain.on('settings:createFeed', (_e, url) => {
  if (!isValidLiveFeedUrl(url)) {
    logger.warn('settings:createFeed:invalid-url', { url });
    return;
  }
  createFeedWindow(url);
});

// Management IPC handlers
ipcMain.handle('management:updateFeed', async (_e, feedId, updates) => {
  if (!settings.feeds || !Array.isArray(settings.feeds)) {
    settings.feeds = [];
  }

  const feedIndex = settings.feeds.findIndex(f => f.id === feedId);
  if (feedIndex === -1) {
    logger.warn('management:updateFeed - feed not found', { feedId });
    return settings;
  }

  const feed = settings.feeds[feedIndex];
  const oldUrl = feed.url;
  const oldMuted = feed.muted;

  // Update feed properties
  if (updates.name !== undefined) feed.name = updates.name;
  if (updates.url !== undefined) {
    const nextUrl = typeof updates.url === 'string' ? updates.url.trim() : '';
    if (!isValidLiveFeedUrl(nextUrl)) {
      logger.warn('management:updateFeed:invalid-url', { feedId, url: updates.url });
      return settings;
    }
    feed.url = nextUrl;
  }
  if (updates.muted !== undefined) feed.muted = updates.muted;
  if (updates.icon !== undefined) feed.icon = updates.icon;

  saveSettings(settings);
  logger.info('management:updateFeed', { feedId, updates });

  // If URL changed or mute status changed, restart the feed
  if (oldUrl !== feed.url || oldMuted !== feed.muted) {
    // Find feed window by feedId
    let feedWindowToUpdate = null;
    for (const [id, meta] of feedMeta.entries()) {
      if (meta.feedId === feedId && meta.window && !meta.window.isDestroyed()) {
        feedWindowToUpdate = meta.window;
        break;
      }
    }
    
    // If muting: simply destroy/close the window (this deactivates the feed)
    if (feed.muted && !oldMuted && feedWindowToUpdate) {
      try {
        // Remove from feedWindows array before destroying
        const index = feedWindows.indexOf(feedWindowToUpdate);
        if (index > -1) {
          feedWindows.splice(index, 1);
        }
        feedWindowToUpdate.destroy();
        logger.info('management:feed:muted', { feedId, name: feed.name });
      } catch (err) {
        logger.error('management:feed:mute:error', { feedId, error: String(err) });
      }
      // Clean up feedMeta
      for (const [id, meta] of feedMeta.entries()) {
        if (meta.feedId === feedId) {
          feedMeta.delete(id);
          break;
        }
      }
    }
    
    // If unmuting: create new window (this activates the feed)
    if (!feed.muted && oldMuted && isValidLiveFeedUrl(feed.url)) {
      createFeedWindowFor(feed.url, feed);
      logger.info('management:feed:unmuted', { feedId, name: feed.name });
    }
    
    // If URL changed (but not muted): destroy old and create new
    if (oldUrl !== feed.url && !feed.muted && feedWindowToUpdate) {
      try {
        // Remove from feedWindows array before destroying
        const index = feedWindows.indexOf(feedWindowToUpdate);
        if (index > -1) {
          feedWindows.splice(index, 1);
        }
        feedWindowToUpdate.destroy();
      } catch {}
      // Clean up feedMeta
      for (const [id, meta] of feedMeta.entries()) {
        if (meta.feedId === feedId) {
          feedMeta.delete(id);
          break;
        }
      }
      // Create new window with new URL
      if (isValidLiveFeedUrl(feed.url)) {
        createFeedWindowFor(feed.url, feed);
      }
    }
  }

  // Broadcast update to all windows
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:updated', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:updated', settings);
  }
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('settings:updated', settings);
  }

  return settings;
});

ipcMain.handle('management:addFeed', async (_e, feed) => {
  if (!settings.feeds || !Array.isArray(settings.feeds)) {
    settings.feeds = [];
  }

  const [normalizedFeed] = normalizeLiveFeedList([feed || {}]);
  if (!normalizedFeed) {
    logger.warn('management:addFeed:invalid-url', { feed });
    return settings;
  }

  settings.feeds.push(normalizedFeed);
  saveSettings(settings);
  logger.info('management:addFeed', { feedId: normalizedFeed.id, name: normalizedFeed.name });

  // Create feed window if not muted and URL is set
  if (!normalizedFeed.muted) {
    createFeedWindowFor(normalizedFeed.url, normalizedFeed);
  }

  // Broadcast update to all windows
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:updated', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:updated', settings);
  }
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('settings:updated', settings);
  }

  return settings;
});

ipcMain.handle('management:toggleAllFeedsMute', async () => {
  if (!settings.feeds || !Array.isArray(settings.feeds)) {
    settings.feeds = [];
  }

  const allMuted = settings.feeds.length > 0 && settings.feeds.every(feed => feed?.muted);
  const nextMuted = !allMuted;

  settings.feeds = settings.feeds.map(feed => ({
    ...feed,
    muted: nextMuted
  }));
  saveSettings(settings);
  logger.info('management:toggleAllFeedsMute', { count: settings.feeds.length, muted: nextMuted });

  if (nextMuted) {
    destroyAllFeeds();
  } else if (settings.liveSearchesEnabled !== false) {
    const normalizedFeeds = normalizeLiveFeedList(settings.feeds || []).filter((feed) => !feed.muted);
    feedWindows = normalizedFeeds
      .map((feed) => createFeedWindowFor(feed.url, feed))
      .filter(Boolean);
    status.activeFeeds = feedWindows.length;
    status.lastConnectTs = Date.now();
  }

  // Broadcast update to all windows
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:updated', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:updated', settings);
  }
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('settings:updated', settings);
  }

  return settings;
});

ipcMain.handle('management:deleteFeed', async (_e, feedId) => {
  if (!settings.feeds || !Array.isArray(settings.feeds)) {
    settings.feeds = [];
  }

  const feedIndex = settings.feeds.findIndex(f => f.id === feedId);
  if (feedIndex === -1) {
    logger.warn('management:deleteFeed - feed not found', { feedId });
    return settings;
  }

  const feed = settings.feeds[feedIndex];
  settings.feeds.splice(feedIndex, 1);
  saveSettings(settings);
  logger.info('management:deleteFeed', { feedId, name: feed.name });

  // Destroy feed window
  const feedInfo = feedMeta.get(feed.url);
  if (feedInfo && feedInfo.window) {
    try {
      feedInfo.window.destroy();
    } catch {}
    feedMeta.delete(feed.url);
  }

  // Broadcast update to all windows
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:updated', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:updated', settings);
  }
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send('settings:updated', settings);
  }

  return settings;
});

// ========================================
// APP INITIALIZATION
// ========================================

app.whenReady().then(async () => {
  // Load environment variables
    try {
      loadEnv();
    } catch (err) {
      logger.warn('dotenv not installed or failed to load', { error: String(err) });
    }

    if (app.isPackaged) {
      setupAutoUpdater();
    } else {
      logger.info('updates:skipped', { reason: 'app-not-packaged' });
    }

    // ========================================
    // STEP 1: AUTHENTICATION (REQUIRED)
  // ========================================
  logger.info('auth:initializing');

  try {
    authService = await initializeAuth();
    logger.info('auth:initialized', {
      authenticated: authService.isAuthenticated(),
      username: authService.getUser()?.poeAccountName || authService.getUser()?.username || authService.getUser()?.name || null
    });

    const authUser = authService.getUser();
    const hasUserIdentity = Boolean(
      authUser?.poeAccountId ||
      authUser?.poeAccountName ||
      authUser?.username ||
      authUser?.name
    );
    const devShortcutEnabled = process.env.SIMPLEX_DEV_LOGIN_SHORTCUT === '1';
    const isLegacyDevShortcutUser =
      authUser?.poeAccountId === 'dev-local' ||
      authUser?.poeAccountName === 'Local Dev';
    // If a local testing session token leaks into a production-like run,
    // force logout so the user must complete real OAuth login.
    const staleReason =
      authService.isAuthenticated() && !hasUserIdentity
        ? 'authenticated session has no user identity'
        : authService.isAuthenticated() && isLegacyDevShortcutUser && !devShortcutEnabled
          ? 'legacy dev shortcut session detected while shortcut is disabled'
          : null;
    if (staleReason) {
      logger.warn('auth:stale-session-detected', { reason: staleReason });
      if (typeof authService.clearSession === 'function') {
        authService.clearSession();
        logger.info('auth:stale-session-cleared', { reason: staleReason });
      }
    }

    // If not logged in, require login
    if (!authService.isAuthenticated()) {
      logger.info('auth:not-authenticated', { message: 'Showing login window' });
      const isLoggedIn = await requireAuth();

      if (!isLoggedIn) {
        logger.info('auth:required', { message: 'Login window closed. Quitting app.' });
        app.quit();
        return;
      } else {
        logger.info('auth:login-success', {
          username: authService.getUser()?.poeAccountName || authService.getUser()?.username || authService.getUser()?.name || null
        });
      }
    } else {
      logger.info('auth:already-authenticated', {
        username: authService.getUser()?.poeAccountName || authService.getUser()?.username || authService.getUser()?.name || null
      });
    }

    // Initialize API client with auth service
    apiClient = new BuildApiClient({
      baseUrl: process.env.API_BASE_URL,
      authService: authService,
    });
    logger.info('api:client-initialized');

  } catch (err) {
    logger.error('auth:initialization-failed', { error: String(err), stack: err.stack });
    app.quit();
    return;
  }

  // ========================================
  // STEP 2: REMAINING APP INITIALIZATION
  // ========================================
  registerNetworthDisabledIpcHandlers();

  // API IPC Handlers
  ipcMain.handle('api:get-builds', async () => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const data = await apiClient.getBuilds();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-builds:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-build', async (event, buildId) => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const data = await apiClient.getBuild(buildId);
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-build:error', { buildId, error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-followed-guides', async () => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const data = await apiClient.getFollowedGuides();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-followed-guides:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-public-live-builds', async () => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const data = await apiClient.getPublicLiveBuilds();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-public-live-builds:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-public-guides', async () => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const data = await apiClient.getPublicGuides();
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-public-guides:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:set-guide-follow', async (_event, payload) => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const buildId = typeof payload?.buildId === 'string' ? payload.buildId : null;
      const follow = payload?.follow !== false;
      if (!buildId) {
        return { success: false, error: 'buildId is required' };
      }
      const data = await apiClient.setGuideFollow(buildId, follow);
      return { success: true, data };
    } catch (error) {
      logger.error('api:set-guide-follow:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api:get-gear-items', async (_event, slugs) => {
    try {
      if (!apiClient) {
        return { success: false, error: 'API client not initialized' };
      }
      const data = await apiClient.getGearItems(slugs || []);
      return { success: true, data };
    } catch (error) {
      logger.error('api:get-gear-items:error', { error: String(error) });
      return { success: false, error: error.message };
    }
  });

  // Build Manager window handler
  ipcMain.on('open-build-manager', () => {
    createBuildManagerWindow();
  });

  settings = loadSettings();
  refreshCurrentCharacterLiveTrackingState();
  const isFirstRun = isNewInstallation();
  activeGuideState = settings.activeGuideState || null;

  void refreshCharacterInfoCache();

  // Keep live-follow refresh logic active even when the build window is not visible.
  // The renderer handles startup + local level-up refresh for active live runs.
  if (settings?.activeBuild?.id) {
    try {
      createBuildOverlayWindow(false);
      logger.info('build-overlay:background-worker-started', { buildId: settings.activeBuild.id });
    } catch (err) {
      logger.warn('build-overlay:background-worker-failed', { error: String(err) });
    }
  }

  if (!settings.clientLogPath) {
    const detected = autoDetectClientLogPath();
    if (detected) {
      settings.clientLogPath = detected;
      saveSettings(settings);
      logger.info('settings:autoDetectClientLog:startup-found', { path: detected });
    }
  }

  // Set app icon
  try {
    const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
    logger.info('app:icon-loading', { path: iconPath, exists: fs.existsSync(iconPath) });
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        if (typeof app.setAppIcon === 'function') {
          app.setAppIcon(icon);
          logger.info('app:icon-set', { path: iconPath, size: icon.getSize() });
        } else {
          logger.info('app:icon-skip', { reason: 'app.setAppIcon unsupported on this platform/runtime' });
        }
      } else {
        logger.warn('app:icon-empty', { path: iconPath });
      }
    } else {
      logger.warn('app:icon-not-found', { path: iconPath });
    }
  } catch (err) {
    logger.warn('app:icon-set-failed', { error: String(err) });
  }

  // Prepare the (single) PowerShell helper on startup
  try { writePoeScript(); } catch {}
  try { app.userAgentFallback = UA_FALLBACK; } catch {}
  try { session.fromPartition(PARTITION).setUserAgent(UA_FALLBACK); } catch {}

  createOverlayWindow();
  createManagementWindow();
  refreshGlobalShortcuts();

  // Show welcome window if this is a new installation or tutorial hasn't been completed
  // For development/testing: set SHOW_WELCOME_ALWAYS to true to always show welcome screen
  const SHOW_WELCOME_ALWAYS = process.env.NODE_ENV === 'development' || process.env.SHOW_WELCOME === 'true';
  const shouldShowWelcome = SHOW_WELCOME_ALWAYS || isFirstRun || settings.tutorialCompleted === false;

  logger.info('welcome:check', {
    isNewInstallation: isFirstRun,
    tutorialCompleted: settings.tutorialCompleted,
    shouldShow: shouldShowWelcome,
    showAlways: SHOW_WELCOME_ALWAYS
  });

  if (shouldShowWelcome) {
    logger.info('welcome:will-show');
    setTimeout(() => {
      createWelcomeWindow();
      welcomeWindow.show();
    }, 500); // Small delay to ensure other windows are ready
  } else {
    logger.info('welcome:skipped', { reason: 'tutorial already completed' });
  }
  
  // Don't open settings window on startup - user opens it via tray
  // createSettingsWindow();
  
  // Initialize client log watcher if path is configured and needed
  ensureClientLogWatcher();
  logger.info('app:ready');
  try { overlayWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    try { logger.debug('overlay:console', { level, message, line, sourceId }); } catch {}
  }); } catch {}

  // Auto-connect all feeds on startup if live searches are enabled
  try {
    if (settings.liveSearchesEnabled !== false) {
      const validFeeds = normalizeLiveFeedList(settings.feeds || []).filter((f) => !f.muted);
      if (validFeeds.length > 0) {
        logger.info('app:auto-connect:start', { count: validFeeds.length });
        feedWindows = validFeeds
          .map((feed) => createFeedWindowFor(feed.url, feed))
          .filter(Boolean);
        status.activeFeeds = feedWindows.length;
        status.lastConnectTs = Date.now();
        logger.info('app:auto-connect:done', { count: status.activeFeeds });
      }
    }
  } catch (err) {
    logger.error('app:auto-connect:failed', { error: String(err) });
  }

  // Deny desktop notifications from feed pages
  try {
    const sess = session.fromPartition(PARTITION);
    sess.setPermissionRequestHandler((wc, permission, callback) => {
      if (permission === 'notifications') return callback(false);
      if (permission === 'geolocation') return callback(false);
      callback(false);
    });
  } catch {}

  // System tray menu
  try {
    logger.info('tray:create:start');

    // Load icon from file - prefer PNG (supports transparency), then ICO
    const icoPath = path.join(__dirname, 'assets', 'tray-icon.ico');
    const pngPath = path.join(__dirname, 'assets', 'tray-icon.png');
    const png2xPath = path.join(__dirname, 'assets', 'tray-icon@2x.png');
    logger.info('tray:icon-paths', { icoPath, pngPath, png2xPath, existsICO: fs.existsSync(icoPath), existsPNG: fs.existsSync(pngPath), existsPNG2x: fs.existsSync(png2xPath) });

    let img = null;

    // Try PNG first (keeps transparency). Build multi-representation image for HiDPI.
    if (fs.existsSync(pngPath)) {
      try {
        logger.info('tray:trying-png');
        const base = nativeImage.createEmpty();
        try {
          const b1 = fs.readFileSync(pngPath);
          base.addRepresentation({ scaleFactor: 1.0, width: 16, height: 16, buffer: b1 });
        } catch (e) { logger.warn('tray:add-rep:1x:failed', { error: String(e) }); }
        if (fs.existsSync(png2xPath)) {
          try {
            const b2 = fs.readFileSync(png2xPath);
            base.addRepresentation({ scaleFactor: 2.0, width: 32, height: 32, buffer: b2 });
          } catch (e) { logger.warn('tray:add-rep:2x:failed', { error: String(e) }); }
        }
        img = base;
        logger.info('tray:png-result', { isEmpty: img.isEmpty(), size: img.getSize() });
      } catch (e) {
        logger.warn('tray:png-build:failed', { error: String(e) });
      }
    }

    // Try ICO if PNG failed
    if ((!img || img.isEmpty()) && fs.existsSync(icoPath)) {
      logger.info('tray:trying-ico');
      img = nativeImage.createFromPath(icoPath);
      logger.info('tray:ico-result', { isEmpty: img.isEmpty(), size: img.getSize() });

      // Force resize to 16x16 for tray if needed
      if (!img.isEmpty()) {
        const size = img.getSize();
        if (size.width !== 16 || size.height !== 16) {
          logger.info('tray:resizing-ico', { from: size, to: { width: 16, height: 16 } });
          img = img.resize({ width: 16, height: 16, quality: 'best' });
        }
      }
    }

    // If file loading failed, create a simple colored square in memory as fallback
    if (!img || img.isEmpty()) {
      logger.warn('tray:icon-load-failed-using-fallback');
      // Bright golden/orange pixel (fully opaque) - fallback
      const workingBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const workingImg = nativeImage.createFromDataURL(workingBase64);
      if (!workingImg.isEmpty()) {
        img = workingImg.resize({ width: 16, height: 16 });
        logger.info('tray:fallback-icon-created');
      }
    }

    // Create tray with loaded icon
    if (img && !img.isEmpty()) {
      tray = new Tray(img);
      tray.setToolTip('Simplex');
      logger.info('tray:created-successfully', { size: img.getSize() });
    } else {
      logger.error('tray:no-icon-available');
      throw new Error('Cannot create tray icon - no icon available');
    }

    logger.info('tray:created:success');
    const menu = Menu.buildFromTemplate([
      { label: 'Settings', click: () => {
          if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
          else settingsWindow.show();
        }
      },
      { label: 'Welcome / Tutorial', click: () => {
          try {
            settings.tutorialCompleted = false;
            saveSettings(settings);
          } catch (err) {
            logger.warn('welcome:reset:failed', { error: String(err) });
          }
          if (!welcomeWindow || welcomeWindow.isDestroyed()) createWelcomeWindow();
          if (welcomeWindow && !welcomeWindow.isDestroyed()) {
            welcomeWindow.show();
            welcomeWindow.focus();
          }
        }
      },
        { label: 'Stash (Under Construction)', enabled: false },
      { label: 'Build', click: () => {
          if (!buildOverlayWindow || buildOverlayWindow.isDestroyed()) createBuildOverlayWindow();
          else {
            buildOverlayWindow.show();
            buildOverlayWindow.focus();
          }
        }
      },
      { label: 'Live Feeds', click: () => {
          // Show the management window (docking block for live feeds)
          if (!managementWindow || managementWindow.isDestroyed()) createManagementWindow();
          else managementWindow.show();
          // When user opens via tray, force-open the feed bar (useful when handle is disabled)
          try { if (managementWindow && !managementWindow.isDestroyed()) managementWindow.webContents.send('management:forceOpen'); } catch {}
        }
      },
      { type: 'separator' },
      { label: 'Report a bug', click: () => openFeedbackModal('bug') },
      { label: 'Request a feature', click: () => openFeedbackModal('feature') },
      { type: 'separator' },
      { label: 'Exit', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
      else settingsWindow.show();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
      }
    });
    logger.info('tray:ready');
  } catch (err) {
    logger.error('tray:create:failed', { error: String(err), stack: err.stack });
  }

  // Legacy settings IPC handlers (unique to app lifecycle)
  ipcMain.on('settings:openLogin', () => {
    if (!loginWindow || loginWindow.isDestroyed()) createLoginWindow();
    else loginWindow.focus();
  });

  ipcMain.on('settings:minimize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.minimize();
    }
  });

  ipcMain.on('settings:maximize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMaximized()) {
        settingsWindow.unmaximize();
      } else {
        settingsWindow.maximize();
      }
    }
  });

  ipcMain.handle('settings:isMaximized', () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return false;
    return settingsWindow.isMaximized();
  });

ipcMain.on('settings:close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.hide();
  }
});

ipcMain.on('app:relaunch', () => {
  try {
    app.relaunch();
    app.exit(0);
  } catch (err) {
    logger.error('app:relaunch:error', { error: String(err) });
  }
});

// Separate handler for welcome window
ipcMain.on('welcome:close', () => {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    try {
      settings.tutorialCompleted = true;
      saveSettings(settings);
    } catch (err) {
      logger.warn('welcome:complete:failed', { error: String(err) });
    }
    // Disable alwaysOnTop before closing to prevent blocking other windows
    welcomeWindow.setAlwaysOnTop(false);
    welcomeWindow.close();
  }
  // Don't automatically show settings window - let the welcome.js handle it via setTimeout
  // This prevents showing the window before it's fully loaded
});

  ipcMain.on('settings:connectFeed', (e, url) => {
    // Only connect if live searches are enabled
    if (settings.liveSearchesEnabled === false) {
      logger.info('feed:connect:skipped', { reason: 'liveSearchesEnabled is false' });
      return;
    }
    if (!isValidLiveFeedUrl(url)) {
      logger.warn('feed:connect:single:invalid-url', { url });
      return;
    }
    destroyAllFeeds();
    feedWindow = createFeedWindow(url);
    feedWindows = feedWindow ? [feedWindow] : [];
    status.activeFeeds = feedWindows.length;
    status.lastConnectTs = Date.now();
    logger.info('feed:connect:single', { url });
  });

  // New handler for feed objects
  ipcMain.on('settings:connectFeedsV2', (e, feeds) => {
    // Only connect if live searches are enabled
    if (settings.liveSearchesEnabled === false) {
      logger.info('feed:connect:skipped', { reason: 'liveSearchesEnabled is false' });
      return;
    }
    destroyAllFeeds();
    // Filter out muted feeds
    const validFeeds = normalizeLiveFeedList(feeds).filter((feed) => !feed.muted);
    feedWindows = validFeeds
      .map((feed) => createFeedWindowFor(feed.url, feed))
      .filter(Boolean);
    status.activeFeeds = feedWindows.length;
    status.lastConnectTs = Date.now();
    logger.info('feed:connect:many-v2', { count: status.activeFeeds, feeds: validFeeds.map(f => ({ id: f.id, name: f.name })) });
  });

  // Backwards compatibility: convert URLs to feed objects
  ipcMain.on('settings:connectFeeds', (e, urls) => {
    // Only connect if live searches are enabled
    if (settings.liveSearchesEnabled === false) {
      logger.info('feed:connect:skipped', { reason: 'liveSearchesEnabled is false' });
      return;
    }
    destroyAllFeeds();
    const uniq = Array.from(
      new Set(
        (Array.isArray(urls) ? urls : [])
          .map((s) => String(s || '').trim())
          .filter((url) => isValidLiveFeedUrl(url))
      )
    );
    const feedObjects = uniq.map((url, idx) => ({
      id: `feed-legacy-${Date.now()}-${idx}`,
      url: url,
      name: `Feed ${idx + 1}`
    }));
    feedWindows = feedObjects
      .map((feed) => createFeedWindowFor(feed.url, feed))
      .filter(Boolean);
    status.activeFeeds = feedWindows.length;
    status.lastConnectTs = Date.now();
    logger.info('feed:connect:many', { count: status.activeFeeds });
  });

  // DUPLICATE IPC HANDLERS REMOVED - They are registered ONCE before app.whenReady()

  // Net Worth handlers intentionally disabled in OSS client build.

  ipcMain.handle('api:get-poe-oauth-status', async () => {
    try {
      if (!apiClient || typeof apiClient.getPoeOAuthStatus !== 'function') {
        return { authorized: false, message: 'API client not initialized' };
      }
      return await apiClient.getPoeOAuthStatus();
    } catch (err) {
      logger.error('api:get-poe-oauth-status:error', { error: String(err) });
      return { authorized: false, message: `Error checking status: ${String(err)}` };
    }
  });

  try {
    ipcMain.removeHandler('shell:openExternal');
  } catch {
    // Ignore if the handler was not registered yet.
  }
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      logger.warn('shell:openExternal:blocked', { url });
      throw new Error('Blocked external URL');
    }
    await shell.openExternal(url);
    return true;
  });

  // Check login status for pathofexile.com
  ipcMain.handle('login:checkStatus', async () => {
    try {
      logger.info('login:checkStatus:called');
      const sess = session.fromPartition(PARTITION);
      
      // Check cookies for pathofexile.com
      const cookies = await sess.cookies.get({ domain: 'pathofexile.com' });
      logger.info('login:checkStatus:cookies-found', { count: cookies.length });
      
      // Check if we have a session cookie (POESESSID or similar)
      const hasSessionCookie = cookies.some(cookie => 
        cookie.name.toLowerCase().includes('session') || 
        cookie.name.toLowerCase().includes('poesess') ||
        cookie.name.toLowerCase().includes('auth')
      );
      
      if (!hasSessionCookie) {
        logger.info('login:checkStatus:no-session-cookie');
        return { loggedIn: false, message: 'Not logged in (no session cookies found)' };
      }
      
      logger.info('login:checkStatus:verifying-with-page-load');
      // Try to verify by loading a page that requires login
      return new Promise((resolve) => {
        let resolved = false;
        
        const testWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            session: sess,
          }
        });
        
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            if (!testWindow.isDestroyed()) {
              testWindow.close();
            }
          }
        };
        
        const resolveWithResult = (result) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            logger.info('login:checkStatus:result', result);
            resolve(result);
          }
        };
        
        testWindow.loadURL('https://www.pathofexile.com/account/view-profile');
        
        testWindow.webContents.once('did-finish-load', () => {
          logger.info('login:checkStatus:page-loaded');
          testWindow.webContents.executeJavaScript(`
            (function() {
              // Check if we're redirected to login page or if we see account info
              const url = window.location.href;
              const bodyText = document.body.innerText || '';
              if (url.includes('/login') || bodyText.includes('Log in') || bodyText.includes('Sign in')) {
                return false;
              }
              // If we see account-related content, we're logged in
              return bodyText.includes('Account') || bodyText.includes('Profile') || document.querySelector('[data-account]');
            })();
          `).then((isLoggedIn) => {
            resolveWithResult({ 
              loggedIn: isLoggedIn, 
              message: isLoggedIn ? 'Logged in to pathofexile.com' : 'Not logged in (session expired or invalid)' 
            });
          }).catch((err) => {
            logger.error('login:checkStatus:execute-js-failed', { error: String(err) });
            resolveWithResult({ loggedIn: false, message: 'Could not verify login status' });
          });
        });
        
        testWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          logger.warn('login:checkStatus:page-load-failed', { errorCode, errorDescription });
          resolveWithResult({ loggedIn: false, message: 'Could not verify login status (network error)' });
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          logger.warn('login:checkStatus:timeout');
          resolveWithResult({ loggedIn: false, message: 'Login check timed out' });
        }, 5000);
      });
    } catch (err) {
      logger.error('login:checkStatus:error', { error: String(err) });
      return { loggedIn: false, message: `Error checking login status: ${String(err)}` };
    }
  });

  // Status + logs IPC
  ipcMain.handle('status:get', () => status);
  ipcMain.handle('logs:open', async () => {
    const p = logger.getLogPath();
    if (!p) return false;
    try {
      // Open the folder containing the log file
      const path = require('path');
      const logDir = path.dirname(p);
      await shell.openPath(logDir);
      return true;
    } catch { return false; }
  });
  ipcMain.handle('logs:getPath', () => {
    return logger.getLogPath();
  });
  ipcMain.handle('logs:openFile', async (_e, filePath) => {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      await shell.openPath(filePath);
      return true;
    } catch { return false; }
  });
  ipcMain.handle('app:getInfo', () => {
    const packageJson = require('../package.json');
    return {
      version: packageJson.version || app.getVersion() || '1.0.0',
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      appDataPath: app.getPath('userData')
    };
  });
  ipcMain.handle('app:getPublicBaseUrl', () => {
    try {
      return resolvePublicBaseUrl();
    } catch {
      return 'https://simplex.gg';
    }
  });

  ipcMain.handle('feedback:submit', async (_event, payload) => {
    try {
      return await submitFeedback(payload);
    } catch (error) {
      logger.error('feedback:submit:failed', { error: String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Feedback submission failed.' };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createSettingsWindow();
    }
  });
});

app.on('before-quit', () => { 
  isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch {}
  // Ensure settings are saved before quitting
  if (settings) {
    saveSettings(settings);
    logger.info('app:before-quit:saved-settings', { clientLogPath: settings.clientLogPath });
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

function applyOverlayLock() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try { updateOverlayMouse(); } catch {}
}

function updateOverlayMouse() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Overlay should always accept clicks when visible
  // Lock only affects draggability of the header (handled in renderer)
  const allowClicks = overlayVisible;
  logger.info('overlay:updateMouse', { overlayVisible, locked: settings.overlayLocked, allowClicks, ignoreMouseEvents: !allowClicks });
  try {
    overlayWindow.setIgnoreMouseEvents(!allowClicks, { forward: true });
  } catch (err) {
    logger.error('overlay:updateMouse:error', { error: String(err) });
  }
}


// DOM Elements
console.log('[SETTINGS] Script loading, document.readyState:', document.readyState);

const visibleSecondsEl = document.getElementById('visibleSeconds');
const overlayLockedEl = document.getElementById('overlayLocked');
const displayFeedNameEl = document.getElementById('displayFeedName');
const showModRangesEl = document.getElementById('showModRanges');

const showManagementByDefaultEl = null; // Removed
const btnConnect = document.getElementById('btnConnect');
const btnLogin = document.getElementById('btnLogin');
const feedsListEl = document.getElementById('feedsList');
const btnLogs = document.getElementById('btnLogs');
const btnClearData = document.getElementById('btnClearData');
const statusLine = document.getElementById('statusLine');
const btnShowManagement = null; // Removed
const clientLogPathInput = document.getElementById('clientLogPathInput');
const btnBrowseClientLog = document.getElementById('btnBrowseClientLog');
const btnAutoDetectClientLog = document.getElementById('btnAutoDetectClientLog');
const clientLogStatus = document.getElementById('clientLogStatus');
const clientLogStatusIcon = document.getElementById('clientLogStatusIcon');
const clientLogStatusText = document.getElementById('clientLogStatusText');
const netWorthCurrencyDisplay = document.getElementById('netWorthCurrencyDisplay');
const netWorthVisibility = document.getElementById('netWorthVisibility');
const netWorthAutoSyncOnOpen = document.getElementById('netWorthAutoSyncOnOpen');
const netWorthPricingListingMode = document.getElementById('netWorthPricingListingMode');
const netWorthLocked = null; // Removed
const dockingHandleVisibility = document.getElementById('dockingHandleVisibility');
const buildDockVisibility = document.getElementById('buildDockVisibility');
const buildLevelDetection = document.getElementById('buildLevelDetection');
const buildManualLevel = document.getElementById('buildManualLevel');
const buildCurrentLevel = document.getElementById('buildCurrentLevel');
const buildLevelPopupEnabled = document.getElementById('buildLevelPopupEnabled');
const buildLevelPopupTest = document.getElementById('buildLevelPopupTest');
const buildLevelPopupPosition = document.getElementById('buildLevelPopupPosition');
const buildQuickPreviewShowTree = document.getElementById('buildQuickPreviewShowTree');
const buildQuickPreviewShowSkills = document.getElementById('buildQuickPreviewShowSkills');
const buildQuickPreviewShowGear = document.getElementById('buildQuickPreviewShowGear');
const liveTrackingVisibility = document.getElementById('liveTrackingVisibility');
const liveTrackingEnabled = document.getElementById('liveTrackingEnabled');
const liveTrackingStateLabel = document.getElementById('liveTrackingStateLabel');
const liveTrackingStatus = document.getElementById('liveTrackingStatus');
const liveTrackingControls = document.getElementById('liveTrackingControls');
const liveTrackingCard = document.getElementById('liveTrackingCard');
const buildDockResetPosition = document.getElementById('buildDockResetPosition');
const buildQuickPreviewShortcut = document.getElementById('buildQuickPreviewShortcut');
const buildQuickPreviewShortcutClear = document.getElementById('buildQuickPreviewShortcutClear');
const buildQuickPreviewControllerEnabled = document.getElementById('buildQuickPreviewControllerEnabled');
const buildQuickPreviewControllerConfig = document.getElementById('buildQuickPreviewControllerConfig');
const openSettingsShortcut = document.getElementById('openSettingsShortcut');
const openSettingsShortcutClear = document.getElementById('openSettingsShortcutClear');
const buildQuickPreviewControllerCombo = document.getElementById('buildQuickPreviewControllerCombo');
const buildQuickPreviewControllerComboClear = document.getElementById('buildQuickPreviewControllerComboClear');
const openSettingsControllerCombo = document.getElementById('openSettingsControllerCombo');
const openSettingsControllerComboClear = document.getElementById('openSettingsControllerComboClear');
const openSettingsControllerEnabled = document.getElementById('openSettingsControllerEnabled');
const openSettingsControllerConfig = document.getElementById('openSettingsControllerConfig');
const controllerType = document.getElementById('controllerType');
const liveSearchesLoginStatus = document.getElementById('liveSearchesLoginStatus');
const btnCheckLoginStatus = document.getElementById('btnCheckLoginStatus');
const netWorthOAuthStatus = document.getElementById('netWorthOAuthStatus');
const netWorthOAuthDetails = document.getElementById('netWorthOAuthDetails');
const btnOAuthAuthorize = document.getElementById('btnOAuthAuthorize');
const btnCheckOAuthStatus = document.getElementById('btnCheckOAuthStatus');
const buildLiveOAuthStatus = document.getElementById('buildLiveOAuthStatus');
const buildLiveOAuthDetails = document.getElementById('buildLiveOAuthDetails');
const btnBuildOAuthAuthorize = document.getElementById('btnBuildOAuthAuthorize');
const btnBuildCheckOAuthStatus = document.getElementById('btnBuildCheckOAuthStatus');
const linkedAccountStatus = document.getElementById('linkedAccountStatus');
const btnUnlinkAccount = document.getElementById('btnUnlinkAccount');
const unlinkModal = document.getElementById('unlinkModal');
const unlinkCancel = document.getElementById('unlinkCancel');
const unlinkConfirm = document.getElementById('unlinkConfirm');

// About tab elements
const appVersionEl = document.getElementById('appVersion');
const btnOpenLogs = document.getElementById('btnOpenLogs');
const btnViewLogs = document.getElementById('btnViewLogs');
const logPathDisplayEl = document.getElementById('logPathDisplay');

// Feedback modal elements
const btnFeedbackBug = document.getElementById('btnFeedbackBug');
const btnFeedbackFeature = document.getElementById('btnFeedbackFeature');
const feedbackModal = document.getElementById('feedbackModal');
const feedbackForm = document.getElementById('feedbackForm');
const feedbackTitle = document.getElementById('feedbackTitle');
const feedbackDetails = document.getElementById('feedbackDetails');
const feedbackSteps = document.getElementById('feedbackSteps');
const feedbackStepsGroup = document.getElementById('feedbackStepsGroup');
const feedbackStatus = document.getElementById('feedbackStatus');
const feedbackTabBug = document.getElementById('feedbackTabBug');
const feedbackTabFeature = document.getElementById('feedbackTabFeature');
const feedbackCancel = document.getElementById('feedbackCancel');
const feedbackSubmit = document.getElementById('feedbackSubmit');

// Throttling for status checks (5 minutes = 300000 ms)
const STATUS_CHECK_THROTTLE_MS = 5 * 60 * 1000;
let lastLoginStatusCheck = 0;
let lastOAuthStatusCheck = 0;

let feeds = [];
let newFeedDraft = { name: '', url: '' };
let focusNewFeedUrlAfterRender = false;
let feedbackType = 'bug';
let controllerTypeValue = 'auto';
let publicBaseUrlCache = null;
let publicOAuthUrlCache = null;
let liveTrackingToggleBusy = false;
const NETWORTH_LISTING_MODES = new Set([
  'instant_buyout_and_in_person',
  'instant_buyout',
  'in_person_online_in_league',
  'in_person_online',
  'any',
]);

function normalizeNetWorthListingMode(value) {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : '';
  if (normalized === 'available') return 'instant_buyout_and_in_person';
  if (normalized === 'securable') return 'instant_buyout';
  if (normalized === 'onlineleague') return 'in_person_online_in_league';
  if (normalized === 'online') return 'in_person_online';
  return NETWORTH_LISTING_MODES.has(normalized) ? normalized : 'instant_buyout';
}

function isValidFeedUrl(value) {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (!raw) return false;
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'www.pathofexile.com' && host !== 'pathofexile.com') return false;
  return /^\/trade\/search\/[^/]+\/[^/]+\/live\/?$/.test(parsed.pathname);
}

function sanitizeFeeds(feedList) {
  if (!Array.isArray(feedList)) return [];
  return feedList
    .filter((feed) => feed && typeof feed === 'object' && isValidFeedUrl(feed.url))
    .map((feed, index) => ({
      id: typeof feed.id === 'string' && feed.id.trim() ? feed.id : `feed-${Date.now()}-${index}`,
      url: String(feed.url).trim(),
      name: typeof feed.name === 'string' && feed.name.trim() ? feed.name.trim() : `Feed ${index + 1}`,
    }));
}

async function getSimplexOAuthUrl() {
  if (publicOAuthUrlCache) return publicOAuthUrlCache;
  // GGG callback is registered on simplex.gg, so always start OAuth on production website.
  publicBaseUrlCache = 'https://simplex.gg';
  publicOAuthUrlCache = `${publicBaseUrlCache}/poe/oauth/start?env=prod`;
  return publicOAuthUrlCache;
}

function getOAuthStatusWidgets() {
  return [
    { statusEl: netWorthOAuthStatus, detailsEl: netWorthOAuthDetails },
    { statusEl: buildLiveOAuthStatus, detailsEl: buildLiveOAuthDetails },
  ].filter((widget) => !!widget.statusEl);
}

function mirrorStashOAuthToBuild() {
  if (!buildLiveOAuthStatus || !netWorthOAuthStatus) return;
  buildLiveOAuthStatus.textContent = netWorthOAuthStatus.textContent || 'Unknown';
  buildLiveOAuthStatus.style.background = netWorthOAuthStatus.style.background;
  buildLiveOAuthStatus.style.color = netWorthOAuthStatus.style.color;
  buildLiveOAuthStatus.style.border = netWorthOAuthStatus.style.border;
  if (buildLiveOAuthDetails && netWorthOAuthDetails) {
    buildLiveOAuthDetails.textContent = netWorthOAuthDetails.textContent || '';
    buildLiveOAuthDetails.style.color = netWorthOAuthDetails.style.color || 'rgba(180, 160, 120, 0.8)';
  }
}

function setFeedbackType(type) {
  feedbackType = type === 'feature' ? 'feature' : 'bug';
  if (feedbackTabBug) feedbackTabBug.classList.toggle('active', feedbackType === 'bug');
  if (feedbackTabFeature) feedbackTabFeature.classList.toggle('active', feedbackType === 'feature');
  if (feedbackStepsGroup) {
    feedbackStepsGroup.style.display = feedbackType === 'bug' ? 'block' : 'none';
  }
}

function resetFeedbackForm() {
  if (feedbackTitle) feedbackTitle.value = '';
  if (feedbackDetails) feedbackDetails.value = '';
  if (feedbackSteps) feedbackSteps.value = '';
  if (feedbackStatus) {
    feedbackStatus.style.display = 'none';
    feedbackStatus.textContent = '';
  }
  if (feedbackSubmit) {
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = 'Submit feedback';
  }
}

function openFeedbackModal(type = 'bug') {
  if (!feedbackModal) return;
  setFeedbackType(type);
  resetFeedbackForm();
  feedbackModal.classList.remove('hidden');
  if (feedbackTitle) feedbackTitle.focus();
}

function closeFeedbackModal() {
  if (!feedbackModal) return;
  feedbackModal.classList.add('hidden');
  resetFeedbackForm();
}

function setFeedbackStatus(message, kind = 'info', discussionUrl) {
  if (!feedbackStatus) return;
  feedbackStatus.style.display = 'block';
  feedbackStatus.textContent = message;

  if (kind === 'success') {
    feedbackStatus.style.borderColor = 'rgba(76, 175, 80, 0.6)';
    feedbackStatus.style.background = 'rgba(76, 175, 80, 0.15)';
  } else if (kind === 'error') {
    feedbackStatus.style.borderColor = 'rgba(244, 67, 54, 0.6)';
    feedbackStatus.style.background = 'rgba(244, 67, 54, 0.15)';
  } else {
    feedbackStatus.style.borderColor = '#333';
    feedbackStatus.style.background = '#1a1a1a';
  }

  if (discussionUrl) {
    const link = document.createElement('a');
    link.href = discussionUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open discussion';
    link.style.color = 'var(--accent-yellow)';
    link.style.display = 'inline-block';
    link.style.marginTop = '6px';
    feedbackStatus.appendChild(document.createElement('br'));
    feedbackStatus.appendChild(link);
  }
}

// Get elements that might not exist yet
const liveSearchesEnabled = document.getElementById('liveSearchesEnabled');
const whispersEnabled = document.getElementById('whispersEnabled');
const stashEnabled = document.getElementById('stashEnabled');
const buildGuideEnabled = document.getElementById('buildGuideEnabled');
const liveSearchesContent = document.getElementById('liveSearchesContent');
const whispersContent = document.getElementById('whispersContent');

console.log('[SETTINGS] DOM elements loaded:', {
  btnConnect: !!btnConnect,
  liveSearchesEnabled: !!liveSearchesEnabled,
  whispersEnabled: !!whispersEnabled,
  stashEnabled: !!stashEnabled,
  buildGuideEnabled: !!buildGuideEnabled
});

// Auto-update settings when checkboxes change (instant preview)
async function updateSettingsInstant() {
  const partial = {};

  // Only include keys for elements that exist in the DOM
  if (displayFeedNameEl) partial.displayFeedName = !!displayFeedNameEl.checked;
  if (showModRangesEl) partial.showModRanges = !!showModRangesEl.checked;
  if (overlayLockedEl) partial.overlayLocked = !!overlayLockedEl.checked;
  if (netWorthCurrencyDisplay) partial.netWorthCurrencyDisplay = netWorthCurrencyDisplay.value;
  if (netWorthVisibility) partial.netWorthVisibility = netWorthVisibility.value;
  if (netWorthAutoSyncOnOpen) partial.netWorthAutoSyncOnOpen = !!netWorthAutoSyncOnOpen.checked;
  if (netWorthPricingListingMode) partial.netWorthPricingListingMode = normalizeNetWorthListingMode(netWorthPricingListingMode.value);
  if (dockingHandleVisibility) partial.dockingHandleVisibility = dockingHandleVisibility.value;
  if (buildDockVisibility) partial.buildDockVisibility = buildDockVisibility.value;
  if (buildLevelDetection) partial.buildLevelDetection = buildLevelDetection.value;
  if (buildManualLevel) partial.buildManualLevel = parseInt(buildManualLevel.value, 10) || 1;
  if (buildLevelPopupEnabled) partial.buildLevelPopupEnabled = !!buildLevelPopupEnabled.checked;
  if (buildQuickPreviewShowTree) partial.buildQuickPreviewShowTree = !!buildQuickPreviewShowTree.checked;
  if (buildQuickPreviewShowSkills) partial.buildQuickPreviewShowSkills = !!buildQuickPreviewShowSkills.checked;
  if (buildQuickPreviewShowGear) partial.buildQuickPreviewShowGear = !!buildQuickPreviewShowGear.checked;
  if (controllerType) partial.controllerType = controllerType.value;

  await window.settingsAPI.set(partial);

  // Force overlay to re-render if it's visible (for instant preview)
  // The settings:updated event should trigger render(), but we ensure it happens
  console.log('[SETTINGS] Settings updated, overlay should re-render automatically');
}

function getLiveTrackingEnabledEntries(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter((entry) => entry && entry.enabled === true);
}

function isLiveTrackingActiveState(settings) {
  const pending = settings?.liveTrackingPending;
  const enabledEntries = getLiveTrackingEnabledEntries(settings?.liveTrackingByCharacter);
  const current = settings?.currentCharacterLiveTracking && typeof settings.currentCharacterLiveTracking === 'object'
    ? settings.currentCharacterLiveTracking
    : null;
  return Boolean(pending || enabledEntries.length > 0 || current?.enabled === true);
}

function setLiveTrackingUiState(isActive) {
  if (liveTrackingEnabled) {
    liveTrackingEnabled.checked = isActive;
  }
  if (liveTrackingStateLabel) {
    liveTrackingStateLabel.textContent = isActive ? 'Active' : 'Inactive';
    liveTrackingStateLabel.style.color = isActive ? 'var(--accent-yellow)' : '#999';
  }
  if (liveTrackingControls) {
    liveTrackingControls.classList.toggle('disabled-content', !isActive);
  }
  if (liveTrackingCard) {
    liveTrackingCard.classList.toggle('live-tracking-card-inactive', !isActive);
  }
}

function renderLiveTrackingStatus(settings) {
  if (!liveTrackingStatus) return;
  const defaultVisibility = settings?.liveTrackingDefaultVisibility === 'public' ? 'public' : 'private';
  const activeCharacterName = typeof settings?.activeCharacterName === 'string' ? settings.activeCharacterName : null;
  const activeCharacterLeague = typeof settings?.activeCharacterLeague === 'string' ? settings.activeCharacterLeague : null;
  const current = settings?.currentCharacterLiveTracking && typeof settings.currentCharacterLiveTracking === 'object'
    ? settings.currentCharacterLiveTracking
    : null;
  const isActive = isLiveTrackingActiveState(settings);
  const characterLabel = activeCharacterName
    ? `${activeCharacterName}${activeCharacterLeague ? ` (${activeCharacterLeague})` : ''}`
    : 'none detected yet';

  const trackingLabel = isActive
    ? (
      current?.enabled === true
        ? `Tracking character: ${characterLabel}.`
        : `Tracking is armed and waiting for a detected character. Last detected: ${characterLabel}.`
    )
    : 'Tracking is disabled. No character is tracked and no snapshots are sent.';
  const scopeLabel = defaultVisibility === 'public'
    ? 'Visibility: Public. Other players can follow your build.'
    : 'Visibility: Private. Only your account can see this live build.';
  liveTrackingStatus.textContent = `${trackingLabel} ${scopeLabel}`;

  setLiveTrackingUiState(isActive);

  if (liveTrackingEnabled) {
    liveTrackingEnabled.disabled = liveTrackingToggleBusy;
    liveTrackingEnabled.title = isActive
      ? 'Disable live tracking'
      : 'Enable live tracking';
  }
}

function setTabVisibility(tabName, visible) {
  const tabButton = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(`tab-${tabName}`);

  if (tabButton) {
    tabButton.style.display = visible ? '' : 'none';
  }
  if (tabContent) {
    tabContent.style.display = visible ? '' : 'none';
    if (!visible) {
      tabContent.classList.remove('active');
    }
  }
}

function updateModuleTabs() {
  const tradeEnabled = (!!liveSearchesEnabled && liveSearchesEnabled.checked)
    || (!!whispersEnabled && whispersEnabled.checked);
  const stashEnabledValue = !!stashEnabled && stashEnabled.checked;
  const buildEnabledValue = !!buildGuideEnabled && buildGuideEnabled.checked;

  setTabVisibility('trade', tradeEnabled);
  setTabVisibility('stash', stashEnabledValue);
  setTabVisibility('build', buildEnabledValue);

  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.style.display === 'none') {
    const generalTab = document.querySelector('.tab[data-tab="general"]');
    if (generalTab) {
      generalTab.click();
    }
  }
}

function syncOpenSettingsControllerConfigState() {
  const enabled = !!openSettingsControllerEnabled?.checked;
  const typeEnabled = enabled || !!buildQuickPreviewControllerEnabled?.checked;
  if (openSettingsControllerConfig) {
    openSettingsControllerConfig.classList.toggle('disabled-content', !typeEnabled);
  }
  if (openSettingsControllerCombo) openSettingsControllerCombo.disabled = !enabled;
  if (openSettingsControllerComboClear) openSettingsControllerComboClear.disabled = !enabled;
}

function syncBuildQuickPreviewControllerConfigState() {
  const enabled = !!buildQuickPreviewControllerEnabled?.checked;
  if (buildQuickPreviewControllerConfig) {
    buildQuickPreviewControllerConfig.classList.toggle('disabled-content', !enabled);
  }
  if (buildQuickPreviewControllerCombo) buildQuickPreviewControllerCombo.disabled = !enabled;
  if (buildQuickPreviewControllerComboClear) buildQuickPreviewControllerComboClear.disabled = !enabled;
}

function syncControllerTypeState() {
  const openEnabled = !!openSettingsControllerEnabled?.checked;
  const quickPreviewEnabled = !!buildQuickPreviewControllerEnabled?.checked;
  const enabled = openEnabled || quickPreviewEnabled;
  if (controllerType) controllerType.disabled = !enabled;
}

function syncControllerShortcutConfigState() {
  syncOpenSettingsControllerConfigState();
  syncBuildQuickPreviewControllerConfigState();
  syncControllerTypeState();
}

// Update enabled/disabled state for modules
function updateModuleStates() {
  // Live Searches
  if (liveSearchesEnabled && liveSearchesContent) {
    if (liveSearchesEnabled.checked) {
      liveSearchesContent.classList.remove('disabled-content');
    } else {
      liveSearchesContent.classList.add('disabled-content');
    }
  }

  // Whispers
  if (whispersEnabled && whispersContent) {
    if (whispersEnabled.checked) {
      whispersContent.classList.remove('disabled-content');
    } else {
      whispersContent.classList.add('disabled-content');
    }
  }

  updateModuleTabs();
}

async function refreshLinkedAccountStatus() {
  if (!linkedAccountStatus) return;

  linkedAccountStatus.textContent = 'Checking...';
  linkedAccountStatus.style.background = '#1a1a1a';
  linkedAccountStatus.style.border = '1px solid #333';
  linkedAccountStatus.style.color = '#e8e8e8';
  if (btnUnlinkAccount) {
    btnUnlinkAccount.disabled = true;
    btnUnlinkAccount.textContent = 'Unlink device';
  }

  try {
    const result = await window.settingsAPI.authCheck();
    if (result?.authenticated) {
      const name = result.user?.poeAccountName || result.user?.poeAccountId || result.username || 'Unknown';
      linkedAccountStatus.textContent = name;
      linkedAccountStatus.style.background = '#2a2a2a';
      linkedAccountStatus.style.border = '1px solid #333';
      linkedAccountStatus.style.color = '#e8e8e8';
      if (btnUnlinkAccount) {
        btnUnlinkAccount.disabled = false;
      }
    } else {
      linkedAccountStatus.textContent = 'Not linked';
      linkedAccountStatus.style.background = '#2a2a2a';
      linkedAccountStatus.style.border = '1px solid #333';
      linkedAccountStatus.style.color = '#999';
      if (btnUnlinkAccount) {
        btnUnlinkAccount.disabled = true;
      }
    }
  } catch (err) {
    console.error('[SETTINGS] Failed to fetch linked account:', err);
    linkedAccountStatus.textContent = 'Unable to load account status.';
    linkedAccountStatus.style.background = '#2a2a2a';
    linkedAccountStatus.style.border = '1px solid #333';
    linkedAccountStatus.style.color = '#ef9a9a';
    if (btnUnlinkAccount) {
      btnUnlinkAccount.disabled = true;
    }
  }
}

function openUnlinkModal() {
  if (!unlinkModal) return;
  unlinkModal.classList.remove('hidden');
}

function closeUnlinkModal() {
  if (!unlinkModal) return;
  unlinkModal.classList.add('hidden');
}

// Handle module enable/disable switches - ensure elements exist
function attachModuleListeners() {
  console.log('[SETTINGS] Attaching module listeners...');
  
  if (liveSearchesEnabled) {
    liveSearchesEnabled.addEventListener('change', async () => {
      await window.settingsAPI.set({ liveSearchesEnabled: liveSearchesEnabled.checked });
      updateModuleStates();
      // If disabled, destroy all feeds (deactivate them)
      if (!liveSearchesEnabled.checked) {
        await window.settingsAPI.destroyAllFeeds();
      } else {
        // If enabled, reactivate all feeds
        await window.settingsAPI.connectFeedsV2(feeds);
      }
    });
  }
  
  if (whispersEnabled) {
    whispersEnabled.addEventListener('change', async () => {
      await window.settingsAPI.set({ whispersEnabled: whispersEnabled.checked });
      updateModuleStates();
      // The main process will handle starting/stopping the watcher based on this setting
    });
  }

  if (stashEnabled) {
    stashEnabled.addEventListener('change', async () => {
      const nextVisibility = stashEnabled.checked
        ? (netWorthVisibility && netWorthVisibility.value !== 'disabled' ? netWorthVisibility.value : 'always')
        : 'disabled';

      if (netWorthVisibility) {
        netWorthVisibility.value = nextVisibility;
      }

      await window.settingsAPI.set({ netWorthVisibility: nextVisibility });
      updateModuleTabs();
    });
  }

  if (buildGuideEnabled) {
    buildGuideEnabled.addEventListener('change', async () => {
      const nextVisibility = buildGuideEnabled.checked
        ? (buildDockVisibility && buildDockVisibility.value !== 'disabled' ? buildDockVisibility.value : 'always')
        : 'disabled';

      if (buildDockVisibility) {
        buildDockVisibility.value = nextVisibility;
      }

      await window.settingsAPI.set({
        buildGuideEnabled: buildGuideEnabled.checked,
        buildDockVisibility: nextVisibility
      });
      updateModuleTabs();
    });
  }
}

// Attach module listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachModuleListeners);
} else {
  attachModuleListeners();
}

// Attach instant update listeners - ensure elements exist
function attachInstantUpdateListeners() {
  console.log('[SETTINGS] Attaching instant update listeners...');
  
  if (showModRangesEl) showModRangesEl.addEventListener('change', updateSettingsInstant);
  if (displayFeedNameEl) displayFeedNameEl.addEventListener('change', updateSettingsInstant);
  if (overlayLockedEl) overlayLockedEl.addEventListener('change', updateSettingsInstant);
  if (netWorthCurrencyDisplay) netWorthCurrencyDisplay.addEventListener('change', updateSettingsInstant);
  if (netWorthPricingListingMode) netWorthPricingListingMode.addEventListener('change', updateSettingsInstant);
  if (netWorthVisibility) {
    netWorthVisibility.addEventListener('change', () => {
      if (stashEnabled) {
        stashEnabled.checked = netWorthVisibility.value !== 'disabled';
      }
      updateModuleTabs();
      updateSettingsInstant();
    });
  }
  if (dockingHandleVisibility) dockingHandleVisibility.addEventListener('change', updateSettingsInstant);
  if (buildDockVisibility) {
    buildDockVisibility.addEventListener('change', () => {
      updateModuleTabs();
      updateSettingsInstant();
    });
  }
  if (buildLevelDetection) {
    buildLevelDetection.addEventListener('change', () => {
      const manualLevelGroup = document.getElementById('manualLevelGroup');
      if (buildLevelDetection.value === 'manual') {
        manualLevelGroup.style.display = 'block';
      } else {
        manualLevelGroup.style.display = 'none';
      }
      updateSettingsInstant();
    });
  }
  if (buildManualLevel) buildManualLevel.addEventListener('change', updateSettingsInstant);
  if (buildLevelPopupEnabled) buildLevelPopupEnabled.addEventListener('change', updateSettingsInstant);
  if (buildQuickPreviewShowTree) buildQuickPreviewShowTree.addEventListener('change', updateSettingsInstant);
  if (buildQuickPreviewShowSkills) buildQuickPreviewShowSkills.addEventListener('change', updateSettingsInstant);
  if (buildQuickPreviewShowGear) buildQuickPreviewShowGear.addEventListener('change', updateSettingsInstant);
  if (liveTrackingVisibility) {
    liveTrackingVisibility.addEventListener('change', async () => {
      const visibility = liveTrackingVisibility.value === 'public' ? 'public' : 'private';
      await window.settingsAPI.set({ liveTrackingDefaultVisibility: visibility });
      const s = await window.settingsAPI.get();
      renderLiveTrackingStatus(s);
    });
  }
  if (netWorthAutoSyncOnOpen) {
    netWorthAutoSyncOnOpen.addEventListener('change', async () => {
      if (netWorthAutoSyncOnOpen.checked) {
        const confirmed = window.confirm(
          'Enabling automatic stash sync can quickly hit Path of Exile API rate limits. Do you want to enable it anyway?'
        );
        if (!confirmed) {
          netWorthAutoSyncOnOpen.checked = false;
          return;
        }
      }
      await updateSettingsInstant();
    });
  }
  if (liveTrackingEnabled) {
    liveTrackingEnabled.addEventListener('change', async () => {
      if (liveTrackingToggleBusy) return;
      liveTrackingToggleBusy = true;
      liveTrackingEnabled.disabled = true;
      const shouldEnable = !!liveTrackingEnabled.checked;

      try {
        const visibility = liveTrackingVisibility?.value === 'public' ? 'public' : 'private';
        await window.settingsAPI.set({ liveTrackingDefaultVisibility: visibility });

        if (!shouldEnable) {
          await window.settingsAPI.disableAllLiveTracking();
        } else {
          const currentSettings = await window.settingsAPI.get();
          if (!isLiveTrackingActiveState(currentSettings)) {
            const result = await window.settingsAPI.toggleLiveTrackingForActiveCharacter({ visibility });
            if (!result?.ok) {
              const noActiveCharacter =
                typeof result?.error === 'string' &&
                result.error.toLowerCase().includes('no active character');
              if (noActiveCharacter) {
                await window.settingsAPI.set({ liveTrackingPending: { visibility } });
              } else {
                console.warn('[SETTINGS] Enable live tracking failed:', result?.error || 'unknown error');
              }
            }
          }
        }
      } catch (err) {
        console.warn('[SETTINGS] Live tracking toggle failed:', err);
      } finally {
        liveTrackingToggleBusy = false;
        try {
          const nextSettings = await window.settingsAPI.get();
          renderLiveTrackingStatus(nextSettings);
        } catch (err) {
          console.warn('[SETTINGS] Failed to refresh live tracking state:', err);
          setLiveTrackingUiState(shouldEnable);
        }
      }
    });
  }
  if (controllerType) {
    controllerType.addEventListener('change', async () => {
      controllerTypeValue = controllerType.value || 'auto';
      await window.settingsAPI.set({ controllerType: controllerTypeValue });
    });
  }
  if (openSettingsControllerEnabled) {
    openSettingsControllerEnabled.addEventListener('change', async () => {
      syncControllerShortcutConfigState();
      await window.settingsAPI.set({ openSettingsControllerEnabled: !!openSettingsControllerEnabled.checked });
    });
  }
  if (buildQuickPreviewControllerEnabled) {
    buildQuickPreviewControllerEnabled.addEventListener('change', async () => {
      syncControllerShortcutConfigState();
      await window.settingsAPI.set({ buildQuickPreviewControllerEnabled: !!buildQuickPreviewControllerEnabled.checked });
    });
  }
  if (buildDockResetPosition) {
    buildDockResetPosition.addEventListener('click', async () => {
      await window.settingsAPI.set({ buildPosition: null });
    });
  }

  bindShortcutInput(buildQuickPreviewShortcut, 'buildQuickPreviewShortcut');
  bindShortcutInput(openSettingsShortcut, 'openSettingsShortcut');
  bindControllerInput(buildQuickPreviewControllerCombo, 'buildQuickPreviewControllerCombo');
  bindControllerInput(openSettingsControllerCombo, 'openSettingsControllerCombo');

  if (buildQuickPreviewShortcutClear) {
    buildQuickPreviewShortcutClear.addEventListener('click', async () => {
      if (buildQuickPreviewShortcut) buildQuickPreviewShortcut.value = '';
      await window.settingsAPI.set({ buildQuickPreviewShortcut: null });
    });
  }
  if (openSettingsShortcutClear) {
    openSettingsShortcutClear.addEventListener('click', async () => {
      if (openSettingsShortcut) openSettingsShortcut.value = '';
      await window.settingsAPI.set({ openSettingsShortcut: null });
    });
  }
  if (buildQuickPreviewControllerComboClear) {
    buildQuickPreviewControllerComboClear.addEventListener('click', async () => {
      if (buildQuickPreviewControllerCombo) buildQuickPreviewControllerCombo.value = '';
      await window.settingsAPI.set({ buildQuickPreviewControllerCombo: null });
    });
  }
  if (openSettingsControllerComboClear) {
    openSettingsControllerComboClear.addEventListener('click', async () => {
      if (openSettingsControllerCombo) openSettingsControllerCombo.value = '';
      await window.settingsAPI.set({ openSettingsControllerCombo: null });
    });
  }
}

// Attach listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachInstantUpdateListeners);
} else {
  attachInstantUpdateListeners();
}

if (buildLevelPopupTest) {
  buildLevelPopupTest.addEventListener('click', async () => {
    try {
      await window.settingsAPI.simulateLevelUp();
    } catch (err) {
      console.error('[SETTINGS] Failed to simulate level up:', err);
    }
  });
}

if (buildLevelPopupPosition) {
  buildLevelPopupPosition.addEventListener('click', () => {
    window.settingsAPI.positionLevelPopup();
  });
}

// Tab switching - ensure DOM is ready
function attachTabListeners() {
  console.log('[SETTINGS] Attaching tab listeners...');
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update tab buttons
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      const targetContent = document.getElementById(`tab-${targetTab}`);
      if (targetContent) {
        targetContent.classList.add('active');
        
        // Check login/OAuth status when switching to relevant tabs
        if (targetTab === 'trade') {
          console.log('[SETTINGS] Switched to Trade tab, checking login status...');
          setTimeout(() => {
            if (liveSearchesLoginStatus) {
              checkLoginStatus().catch(err => {
                console.error('[SETTINGS] Tab switch check login status failed:', err);
              });
            }
          }, 100);
        } else if (targetTab === 'stash' || targetTab === 'build') {
          console.log('[SETTINGS] Switched to tab with OAuth section, checking OAuth status...');
          setTimeout(() => {
            if (getOAuthStatusWidgets().length > 0) {
              checkOAuthStatus().catch(err => {
                console.error('[SETTINGS] Tab switch check OAuth status failed:', err);
              }).finally(() => {
                mirrorStashOAuthToBuild();
              });
            }
          }, 100);
        }
      }
    });
  });
}

// Attach tab listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachTabListeners);
} else {
  attachTabListeners();
}

document.addEventListener('pointerdown', () => {
  controllerNavMousePauseUntil = performance.now() + 1200;
});

document.addEventListener('focusin', (event) => {
  setControllerFocus(event.target);
});
document.addEventListener('focusout', (event) => {
  if (controllerFocusEl === event.target) {
    controllerFocusEl.classList.remove('controller-focus');
    controllerFocusEl = null;
  }
  const toggleWrapper = event.target?.closest?.('.toggle-switch');
  if (toggleWrapper) toggleWrapper.classList.remove('controller-focus-toggle');
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startControllerNavigation);
} else {
  startControllerNavigation();
}

// Listen for tab switch command from IPC
window.settingsAPI.onSwitchTab((tab) => {
  const tabMap = {
    'live-searches': 'trade',
    whispers: 'trade',
    overlay: 'trade',
    networth: 'stash',
    'net-worth': 'stash',
    'build-guide': 'build'
  };
  const targetTab = tabMap[tab] || tab;
  const tabButton = document.querySelector(`.tab[data-tab="${targetTab}"]`);
  if (tabButton) {
    tabButton.click();
    // The click handler will trigger the status checks
  }
});

if (window.settingsAPI && window.settingsAPI.onFeedbackOpen) {
  window.settingsAPI.onFeedbackOpen((type) => {
    openFeedbackModal(type);
  });
}

function formatShortcutKey(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  const keyMap = {
    ' ': 'Space',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    Tab: 'Tab',
    Enter: 'Enter'
  };
  let key = keyMap[event.key] || event.key;
  if (!key || key === 'Unidentified') return null;
  if (key.length === 1) key = key.toUpperCase();
  if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key.toUpperCase())) return null;
  return [...parts, key].join('+');
}

function normalizeControllerComboInput(value) {
  if (typeof value !== 'string') return '';
  return value
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^\+/, '')
    .replace(/\+$/, '');
}

const CONTROLLER_LABELS_BY_TYPE = {
  xbox: {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'BACK',
    9: 'START',
    10: 'LS',
    11: 'RS',
    12: 'DPADUP',
    13: 'DPADDOWN',
    14: 'DPADLEFT',
    15: 'DPADRIGHT',
    16: 'GUIDE'
  },
  playstation: {
    0: 'CROSS',
    1: 'CIRCLE',
    2: 'SQUARE',
    3: 'TRIANGLE',
    4: 'L1',
    5: 'R1',
    6: 'L2',
    7: 'R2',
    8: 'SHARE',
    9: 'OPTIONS',
    10: 'L3',
    11: 'R3',
    12: 'DPADUP',
    13: 'DPADDOWN',
    14: 'DPADLEFT',
    15: 'DPADRIGHT',
    16: 'PS'
  },
  nintendo: {
    0: 'B',
    1: 'A',
    2: 'Y',
    3: 'X',
    4: 'L',
    5: 'R',
    6: 'ZL',
    7: 'ZR',
    8: 'MINUS',
    9: 'PLUS',
    10: 'L3',
    11: 'R3',
    12: 'DPADUP',
    13: 'DPADDOWN',
    14: 'DPADLEFT',
    15: 'DPADRIGHT',
    16: 'HOME'
  },
  generic: {}
};

const controllerCaptureState = new Map();
let controllerNavHandle = null;
let controllerNavLastMoveAt = 0;
let controllerNavLastClick = false;
const CONTROLLER_NAV_AXIS_THRESHOLD = 0.6;
const CONTROLLER_NAV_REPEAT_MS = 180;
let controllerNavMousePauseUntil = 0;
let controllerFocusEl = null;

function getActiveGamepad() {
  if (!navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  if (!pads) return null;
  let fallback = null;
  for (const pad of pads) {
    if (!pad) continue;
    fallback = fallback || pad;
    const hasPressed = pad.buttons?.some(btn => btn && btn.pressed);
    const hasAxis = pad.axes?.some(axis => Math.abs(axis) > 0.2);
    if (hasPressed || hasAxis) return pad;
  }
  return fallback;
}

function resolveControllerType(gamepad) {
  if (controllerTypeValue && controllerTypeValue !== 'auto') return controllerTypeValue;
  const id = (gamepad?.id || '').toLowerCase();
  if (id.includes('playstation') || id.includes('dualshock') || id.includes('dualsense') || id.includes('ps4') || id.includes('ps5')) {
    return 'playstation';
  }
  if (id.includes('nintendo') || id.includes('switch') || id.includes('joy-con') || id.includes('pro controller')) {
    return 'nintendo';
  }
  if (id.includes('xbox')) {
    return 'xbox';
  }
  return gamepad?.mapping === 'standard' ? 'xbox' : 'generic';
}

function getControllerLabels(gamepad) {
  const type = resolveControllerType(gamepad);
  if (type === 'generic') return CONTROLLER_LABELS_BY_TYPE.generic;
  return CONTROLLER_LABELS_BY_TYPE[type] || CONTROLLER_LABELS_BY_TYPE.xbox;
}

function getPressedButtonNames(gamepad) {
  if (!gamepad || !Array.isArray(gamepad.buttons)) return [];
  const labels = getControllerLabels(gamepad);
  const pressed = [];
  for (let i = 0; i < gamepad.buttons.length; i++) {
    if (gamepad.buttons[i]?.pressed) {
      const label = labels[i] || `BTN${i}`;
      pressed.push(label);
    }
  }
  return pressed;
}

function stopControllerCapture(inputEl) {
  const state = controllerCaptureState.get(inputEl);
  if (!state) return;
  if (state.handle) cancelAnimationFrame(state.handle);
  controllerCaptureState.delete(inputEl);
  if (inputEl.dataset.controllerCapture === '1') delete inputEl.dataset.controllerCapture;
  if (inputEl.dataset.controllerPrevValue !== undefined) {
    delete inputEl.dataset.controllerPrevValue;
  }
}

function startControllerCapture(inputEl, settingKey) {
  if (!inputEl || controllerCaptureState.has(inputEl)) return;
  const previousValue = inputEl.value;
  inputEl.dataset.controllerCapture = '1';
  inputEl.dataset.controllerPrevValue = previousValue;
  inputEl.value = 'Listening...';

  let lastSignature = '';
  let lastStableAt = 0;
  const stableMs = 80;

  const tick = () => {
    if (document.activeElement !== inputEl) {
      if (inputEl.value === 'Listening...') {
        inputEl.value = previousValue;
      }
      stopControllerCapture(inputEl);
      return;
    }

    const gamepad = getActiveGamepad();
    const pressed = getPressedButtonNames(gamepad);
    if (pressed.length > 0) {
      const signature = pressed.join('+');
      if (signature === lastSignature) {
        if (!lastStableAt) lastStableAt = performance.now();
        if (performance.now() - lastStableAt >= stableMs) {
          inputEl.value = signature;
          window.settingsAPI.set({ [settingKey]: signature });
          stopControllerCapture(inputEl);
          return;
        }
      } else {
        lastSignature = signature;
        lastStableAt = performance.now();
      }
    } else {
      if (lastSignature) {
        inputEl.value = lastSignature;
        window.settingsAPI.set({ [settingKey]: lastSignature });
        stopControllerCapture(inputEl);
        return;
      }
      lastSignature = '';
      lastStableAt = 0;
    }
    const handle = requestAnimationFrame(tick);
    controllerCaptureState.set(inputEl, { handle });
  };

  const handle = requestAnimationFrame(tick);
  controllerCaptureState.set(inputEl, { handle });
}

function bindShortcutInput(inputEl, settingKey) {
  if (!inputEl) return;
  inputEl.addEventListener('keydown', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = formatShortcutKey(e);
    if (!combo) return;
    inputEl.value = combo;
    await window.settingsAPI.set({ [settingKey]: combo });
  });
  inputEl.addEventListener('blur', async () => {
    const trimmed = inputEl.value.trim();
    inputEl.value = trimmed;
    await window.settingsAPI.set({ [settingKey]: trimmed || null });
  });
}

function bindControllerInput(inputEl, settingKey) {
  if (!inputEl) return;
  const update = async () => {
    const normalized = normalizeControllerComboInput(inputEl.value);
    inputEl.value = normalized;
    await window.settingsAPI.set({ [settingKey]: normalized || null });
  };
  inputEl.addEventListener('change', update);
  inputEl.addEventListener('click', () => {
    startControllerCapture(inputEl, settingKey);
  });
  inputEl.addEventListener('blur', async () => {
    if (inputEl.dataset.controllerCapture === '1') {
      const prev = inputEl.dataset.controllerPrevValue || '';
      stopControllerCapture(inputEl);
      inputEl.value = prev;
      return;
    }
    await update();
  });
}

function isControllerCaptureActive() {
  return controllerCaptureState.size > 0;
}

function getFocusableElements() {
  const nodes = Array.from(document.querySelectorAll('button, input, select, textarea, [tabindex]'));
  return nodes.filter((el) => {
    if (!el) return false;
    if (el.disabled) return false;
    const tabindex = el.getAttribute('tabindex');
    if (tabindex === '-1') return false;
    if (el.offsetParent === null && el !== document.activeElement) return false;
    return true;
  });
}

function setControllerFocus(el) {
  if (controllerFocusEl && controllerFocusEl !== el) {
    controllerFocusEl.classList.remove('controller-focus');
  }
  const previousToggle = controllerFocusEl?.closest?.('.toggle-switch');
  if (previousToggle) previousToggle.classList.remove('controller-focus-toggle');

  controllerFocusEl = el || null;
  if (!controllerFocusEl) return;

  const toggleWrapper = controllerFocusEl.closest?.('.toggle-switch');
  if (toggleWrapper) {
    toggleWrapper.classList.add('controller-focus-toggle');
    return;
  }
  controllerFocusEl.classList.add('controller-focus');
}

function moveFocus(delta) {
  const focusables = getFocusableElements();
  if (!focusables.length) return;
  const active = document.activeElement;
  let index = focusables.indexOf(active);
  if (index === -1) index = 0;
  let next = index + delta;
  if (next < 0) next = focusables.length - 1;
  if (next >= focusables.length) next = 0;
  focusables[next].focus();
  focusables[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  setControllerFocus(focusables[next]);
}

function resolveControllerClickIndex(gamepad) {
  const type = resolveControllerType(gamepad);
  if (type === 'playstation') return 0; // Cross
  if (type === 'nintendo') return 3; // X
  if (type === 'xbox') return 2; // X
  return 0;
}

function triggerFocusedClick() {
  const el = document.activeElement;
  if (!el) return;
  if (el.tagName === 'INPUT' && el.type === 'checkbox') {
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (typeof el.click === 'function') {
    el.click();
  }
}

function startControllerNavigation() {
  if (controllerNavHandle) return;
  const poll = () => {
    const gamepad = getActiveGamepad();
    if (!gamepad || isControllerCaptureActive()) {
      controllerNavHandle = requestAnimationFrame(poll);
      return;
    }
    if (performance.now() < controllerNavMousePauseUntil) {
      controllerNavHandle = requestAnimationFrame(poll);
      return;
    }

    const axisY = gamepad.axes?.[3] ?? 0;
    const now = performance.now();
    if (Math.abs(axisY) >= CONTROLLER_NAV_AXIS_THRESHOLD && now - controllerNavLastMoveAt >= CONTROLLER_NAV_REPEAT_MS) {
      moveFocus(axisY > 0 ? 1 : -1);
      controllerNavLastMoveAt = now;
    }

    const clickIndex = resolveControllerClickIndex(gamepad);
    const pressed = !!gamepad.buttons?.[clickIndex]?.pressed;
    if (pressed && !controllerNavLastClick) {
      triggerFocusedClick();
    }
    controllerNavLastClick = pressed;

    controllerNavHandle = requestAnimationFrame(poll);
  };
  controllerNavHandle = requestAnimationFrame(poll);
}

async function reconnectFeedsIfLiveSearchesEnabled() {
  await window.settingsAPI.destroyAllFeeds();
  if (liveSearchesEnabled && liveSearchesEnabled.checked && feeds.length > 0) {
    await window.settingsAPI.connectFeedsV2(feeds);
  }
}

function renderFeeds() {
  if (!feedsListEl) return;
  feedsListEl.innerHTML = '';

  const createTextInput = (value, placeholder) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.placeholder = placeholder;
    return input;
  };

  feeds.forEach((feed, idx) => {
    const li = document.createElement('li');
    li.className = 'feed-item';
    li.dataset.feedId = feed.id;

    const row = document.createElement('div');
    row.className = 'feed-row';

    const nameInput = createTextInput(feed.name || '', 'Feed name (optional)');
    const urlInput = createTextInput(feed.url || '', 'Live search URL (pathofexile.com/trade)');
    urlInput.title = feed.url || '';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-secondary btn-small';
    saveBtn.textContent = 'Save';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-danger btn-small';
    removeBtn.textContent = 'Remove';

    const saveFeedRow = async () => {
      const nextName = (nameInput.value || '').trim();
      const nextUrl = (urlInput.value || '').trim();
      if (!nextUrl) {
        alert('Please enter a feed URL');
        return;
      }
      if (!isValidFeedUrl(nextUrl)) {
        alert('Please enter a valid Path of Exile live search URL (https://www.pathofexile.com/trade/search/.../live)');
        return;
      }
      const isDuplicate = feeds.some((f, i) => i !== idx && f.url === nextUrl);
      if (isDuplicate) {
        alert('This feed URL is already added');
        return;
      }

      feeds[idx] = {
        ...feed,
        name: nextName || `Feed ${idx + 1}`,
        url: nextUrl,
      };
      renderFeeds();
      await window.settingsAPI.set({ feeds });
      await reconnectFeedsIfLiveSearchesEnabled();
    };

    saveBtn.addEventListener('click', () => {
      saveFeedRow().catch((err) => {
        console.error('[SETTINGS] Failed to save feed row:', err);
      });
    });
    removeBtn.addEventListener('click', () => {
      (async () => {
        feeds.splice(idx, 1);
        renderFeeds();
        await window.settingsAPI.set({ feeds });
        await reconnectFeedsIfLiveSearchesEnabled();
      })().catch((err) => {
        console.error('[SETTINGS] Failed to remove feed row:', err);
      });
    });

    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });

    actions.appendChild(saveBtn);
    actions.appendChild(removeBtn);
    row.appendChild(nameInput);
    row.appendChild(urlInput);
    row.appendChild(actions);
    li.appendChild(row);
    feedsListEl.appendChild(li);
  });

  const addRowItem = document.createElement('li');
  addRowItem.className = 'feed-item';
  addRowItem.dataset.feedId = 'new';

  const addRow = document.createElement('div');
  addRow.className = 'feed-row';

  const draftNameInput = createTextInput(newFeedDraft.name, 'Feed name (optional)');
  const draftUrlInput = createTextInput(newFeedDraft.url, 'Live search URL (pathofexile.com/trade)');

  const addActions = document.createElement('div');
  addActions.style.display = 'flex';
  addActions.style.gap = '6px';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-secondary btn-small';
  addBtn.textContent = 'Add Feed';

  const addFeedFromDraft = async () => {
    const name = (draftNameInput.value || '').trim();
    const url = (draftUrlInput.value || '').trim();

    if (!url) {
      alert('Please enter a feed URL');
      return;
    }
    if (!isValidFeedUrl(url)) {
      alert('Please enter a valid Path of Exile live search URL (https://www.pathofexile.com/trade/search/.../live)');
      return;
    }
    if (feeds.some((f) => f.url === url)) {
      alert('This feed URL is already added');
      return;
    }

    feeds.push({
      id: `feed-${Date.now()}`,
      url,
      name: name || `Feed ${feeds.length + 1}`,
    });
    newFeedDraft = { name: '', url: '' };
    focusNewFeedUrlAfterRender = true;
    renderFeeds();
    await window.settingsAPI.set({ feeds });
  };

  addBtn.addEventListener('click', () => {
    addFeedFromDraft().catch((err) => {
      console.error('[SETTINGS] Failed to add feed:', err);
    });
  });
  draftNameInput.addEventListener('input', () => {
    newFeedDraft.name = draftNameInput.value || '';
  });
  draftUrlInput.addEventListener('input', () => {
    newFeedDraft.url = draftUrlInput.value || '';
  });
  draftNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    }
  });
  draftUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    }
  });

  addActions.appendChild(addBtn);
  addRow.appendChild(draftNameInput);
  addRow.appendChild(draftUrlInput);
  addRow.appendChild(addActions);
  addRowItem.appendChild(addRow);
  feedsListEl.appendChild(addRowItem);

  if (focusNewFeedUrlAfterRender) {
    focusNewFeedUrlAfterRender = false;
    setTimeout(() => {
      draftUrlInput.focus();
    }, 0);
  }
}

(async () => {
  try {
    const s = await window.settingsAPI.get();

    // Load feeds (try new format first, fall back to old liveUrls)
    if (Array.isArray(s.feeds) && s.feeds.length > 0) {
      feeds = sanitizeFeeds(s.feeds);
    } else if (Array.isArray(s.liveUrls) && s.liveUrls.length > 0) {
      // Migrate old liveUrls to new feeds format
      feeds = sanitizeFeeds(s.liveUrls.map((url, idx) => ({
        id: `feed-${Date.now()}-${idx}`,
        url: url,
        name: `Feed ${idx + 1}`
      })));
      // Save migrated feeds
      await window.settingsAPI.set({ feeds });
    } else if (s.liveUrl) {
      feeds = sanitizeFeeds([{
        id: `feed-${Date.now()}`,
        url: s.liveUrl,
        name: 'Feed 1'
      }]);
      await window.settingsAPI.set({ feeds });
    }

    renderFeeds();

    if (typeof s.visibleSeconds === 'number') visibleSecondsEl.value = s.visibleSeconds;
    if (overlayLockedEl && typeof s.overlayLocked === 'boolean') overlayLockedEl.checked = s.overlayLocked;
    if (typeof s.displayFeedName === 'boolean') displayFeedNameEl.checked = s.displayFeedName;
    if (typeof s.showModRanges === 'boolean') showModRangesEl.checked = s.showModRanges;
    // showManagementByDefault removed
    if (typeof s.liveSearchesEnabled === 'boolean') liveSearchesEnabled.checked = s.liveSearchesEnabled;
    if (typeof s.whispersEnabled === 'boolean') whispersEnabled.checked = s.whispersEnabled;
    
    // Net Worth settings
    if (s.netWorthCurrencyDisplay === 'chaos' || s.netWorthCurrencyDisplay === 'divines') {
      netWorthCurrencyDisplay.value = s.netWorthCurrencyDisplay;
    } else {
      netWorthCurrencyDisplay.value = 'divines'; // default
    }
    if (s.netWorthVisibility === 'hover' || s.netWorthVisibility === 'always' || s.netWorthVisibility === 'disabled') {
      netWorthVisibility.value = s.netWorthVisibility;
    } else {
      netWorthVisibility.value = 'disabled'; // default
    }
    if (netWorthAutoSyncOnOpen) {
      netWorthAutoSyncOnOpen.checked = s.netWorthAutoSyncOnOpen === true;
    }
    if (netWorthPricingListingMode) {
      netWorthPricingListingMode.value = normalizeNetWorthListingMode(s.netWorthPricingListingMode);
    }
    if (stashEnabled) {
      stashEnabled.checked = netWorthVisibility.value !== 'disabled';
      stashEnabled.disabled = false;
    }
    // netWorthLocked removed
    
    // Docking Handle visibility
    if (s.dockingHandleVisibility === 'hover' || s.dockingHandleVisibility === 'always' || s.dockingHandleVisibility === 'disabled') {
      dockingHandleVisibility.value = s.dockingHandleVisibility;
    } else {
      dockingHandleVisibility.value = 'always'; // default
    }

    // Build Dock visibility
    if (buildDockVisibility) {
      if (s.buildDockVisibility === 'hover' || s.buildDockVisibility === 'always' || s.buildDockVisibility === 'disabled') {
        buildDockVisibility.value = s.buildDockVisibility;
      } else {
        buildDockVisibility.value = 'always'; // default
      }
    }
    if (buildGuideEnabled) {
      if (typeof s.buildGuideEnabled === 'boolean') {
        buildGuideEnabled.checked = s.buildGuideEnabled;
      } else if (buildDockVisibility) {
        buildGuideEnabled.checked = buildDockVisibility.value !== 'disabled';
      }
    }

    // Build Level Detection
    if (buildLevelDetection) {
      buildLevelDetection.value = s.buildLevelDetection || 'auto';
      const manualLevelGroup = document.getElementById('manualLevelGroup');
      if (buildLevelDetection.value === 'manual') {
        manualLevelGroup.style.display = 'block';
      } else {
        manualLevelGroup.style.display = 'none';
      }
    }

    if (buildManualLevel) {
      buildManualLevel.value = s.buildManualLevel || 1;
    }

    if (buildCurrentLevel) {
      const level = s.buildLevelDetection === 'manual' ? s.buildManualLevel || 1 : s.characterLevel || 1;
      buildCurrentLevel.textContent = `Level: ${level}`;
    }

    if (buildLevelPopupEnabled) {
      buildLevelPopupEnabled.checked = !!s.buildLevelPopupEnabled;
    }

    if (buildQuickPreviewShowTree) {
      buildQuickPreviewShowTree.checked = s.buildQuickPreviewShowTree !== false;
    }
    if (buildQuickPreviewShowSkills) {
      buildQuickPreviewShowSkills.checked = s.buildQuickPreviewShowSkills !== false;
    }
    if (buildQuickPreviewShowGear) {
      buildQuickPreviewShowGear.checked = s.buildQuickPreviewShowGear !== false;
    }
    if (liveTrackingVisibility) {
      const visibility = s.liveTrackingDefaultVisibility === 'public'
        ? 'public'
        : (s.liveTrackingPending?.visibility === 'public' ? 'public' : 'private');
      liveTrackingVisibility.value = visibility;
    }
    renderLiveTrackingStatus(s);
    if (controllerType) {
      controllerTypeValue = s.controllerType || 'auto';
      controllerType.value = controllerTypeValue;
    }
    if (buildQuickPreviewShortcut) {
      buildQuickPreviewShortcut.value = s.buildQuickPreviewShortcut || '';
    }
    if (openSettingsShortcut) {
      openSettingsShortcut.value = s.openSettingsShortcut || '';
    }
    if (buildQuickPreviewControllerCombo) {
      buildQuickPreviewControllerCombo.value = normalizeControllerComboInput(s.buildQuickPreviewControllerCombo || '');
    }
    if (buildQuickPreviewControllerEnabled) {
      if (typeof s.buildQuickPreviewControllerEnabled === 'boolean') {
        buildQuickPreviewControllerEnabled.checked = s.buildQuickPreviewControllerEnabled;
      } else {
        buildQuickPreviewControllerEnabled.checked = false;
      }
    }
    if (openSettingsControllerCombo) {
      openSettingsControllerCombo.value = normalizeControllerComboInput(s.openSettingsControllerCombo || '');
    }
    if (openSettingsControllerEnabled) {
      if (typeof s.openSettingsControllerEnabled === 'boolean') {
        openSettingsControllerEnabled.checked = s.openSettingsControllerEnabled;
      } else {
        openSettingsControllerEnabled.checked = false;
      }
    }
    syncControllerShortcutConfigState();

    // Update module states based on enabled flags
    updateModuleStates();
    
    // Don't check status immediately - wait for window-ready signal
    // This prevents checks from running before IPC is fully ready
    console.log('[SETTINGS] Settings loaded, waiting for window-ready signal before status checks');
    
    // Load app info for About tab
    loadAppInfo();
    
    if (typeof s.clientLogPath === 'string' && s.clientLogPath.trim()) {
      clientLogPathInput.value = s.clientLogPath;
      // Update status after a short delay to ensure DOM is ready
      setTimeout(() => updateClientLogStatus(), 100);
    } else {
      // Auto-detect Client.txt if not set
      try {
        const autoPath = await window.settingsAPI.autoDetectClientLog();
        if (autoPath) {
          clientLogPathInput.value = autoPath;
          await window.settingsAPI.set({ clientLogPath: autoPath });
          console.log('[SETTINGS] Auto-detected Client.txt:', autoPath);
          setTimeout(() => updateClientLogStatus(), 100);
        }
      } catch (err) {
        console.warn('[SETTINGS] Auto-detect failed:', err);
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Listen for settings updates (e.g., when overlay lock button is clicked)
  window.settingsAPI.onSettingsUpdated((newSettings) => {
    if (newSettings) {
      if (overlayLockedEl && typeof newSettings.overlayLocked === 'boolean') {
        overlayLockedEl.checked = newSettings.overlayLocked;
        console.log('[SETTINGS] Lock state updated from overlay:', newSettings.overlayLocked);
      }
      if (typeof newSettings.displayFeedName === 'boolean') {
        displayFeedNameEl.checked = newSettings.displayFeedName;
      }
      if (typeof newSettings.showModRanges === 'boolean') {
        showModRangesEl.checked = newSettings.showModRanges;
      }
      // showManagementByDefault removed
      if (typeof newSettings.liveSearchesEnabled === 'boolean') {
        liveSearchesEnabled.checked = newSettings.liveSearchesEnabled;
        updateModuleStates();
      }
      if (typeof newSettings.whispersEnabled === 'boolean') {
        whispersEnabled.checked = newSettings.whispersEnabled;
        updateModuleStates();
      }
      // Net Worth settings
      if (newSettings.netWorthCurrencyDisplay === 'chaos' || newSettings.netWorthCurrencyDisplay === 'divines') {
        netWorthCurrencyDisplay.value = newSettings.netWorthCurrencyDisplay;
      }
      if (newSettings.netWorthVisibility === 'hover' || newSettings.netWorthVisibility === 'always' || newSettings.netWorthVisibility === 'disabled') {
        netWorthVisibility.value = newSettings.netWorthVisibility;
      }
      if (netWorthAutoSyncOnOpen && typeof newSettings.netWorthAutoSyncOnOpen === 'boolean') {
        netWorthAutoSyncOnOpen.checked = newSettings.netWorthAutoSyncOnOpen;
      }
      if (netWorthPricingListingMode && typeof newSettings.netWorthPricingListingMode === 'string') {
        netWorthPricingListingMode.value = normalizeNetWorthListingMode(newSettings.netWorthPricingListingMode);
      }
      if (stashEnabled) {
        stashEnabled.checked = netWorthVisibility.value !== 'disabled';
        stashEnabled.disabled = false;
      }
      // netWorthLocked removed
      // Docking Handle visibility
      if (newSettings.dockingHandleVisibility === 'hover' || newSettings.dockingHandleVisibility === 'always' || newSettings.dockingHandleVisibility === 'disabled') {
        dockingHandleVisibility.value = newSettings.dockingHandleVisibility;
      }
      // Build Dock visibility
      if (buildDockVisibility && (newSettings.buildDockVisibility === 'hover' || newSettings.buildDockVisibility === 'always' || newSettings.buildDockVisibility === 'disabled')) {
        buildDockVisibility.value = newSettings.buildDockVisibility;
      }
      if (buildGuideEnabled) {
        if (typeof newSettings.buildGuideEnabled === 'boolean') {
          buildGuideEnabled.checked = newSettings.buildGuideEnabled;
        } else if (buildDockVisibility) {
          buildGuideEnabled.checked = buildDockVisibility.value !== 'disabled';
        }
      }
      // Build Level Detection
      if (buildLevelDetection && (newSettings.buildLevelDetection === 'auto' || newSettings.buildLevelDetection === 'manual')) {
        buildLevelDetection.value = newSettings.buildLevelDetection;
        const manualLevelGroup = document.getElementById('manualLevelGroup');
        if (buildLevelDetection.value === 'manual') {
          manualLevelGroup.style.display = 'block';
        } else {
          manualLevelGroup.style.display = 'none';
        }
      }
      if (buildManualLevel && typeof newSettings.buildManualLevel === 'number') {
        buildManualLevel.value = newSettings.buildManualLevel;
      }
      if (buildCurrentLevel) {
        const level = newSettings.buildLevelDetection === 'manual' ? newSettings.buildManualLevel || 1 : newSettings.characterLevel || 1;
        buildCurrentLevel.textContent = `Level: ${level}`;
      }
      if (buildLevelPopupEnabled && typeof newSettings.buildLevelPopupEnabled === 'boolean') {
        buildLevelPopupEnabled.checked = newSettings.buildLevelPopupEnabled;
      }
      if (buildQuickPreviewShowTree && typeof newSettings.buildQuickPreviewShowTree === 'boolean') {
        buildQuickPreviewShowTree.checked = newSettings.buildQuickPreviewShowTree;
      }
      if (buildQuickPreviewShowSkills && typeof newSettings.buildQuickPreviewShowSkills === 'boolean') {
        buildQuickPreviewShowSkills.checked = newSettings.buildQuickPreviewShowSkills;
      }
      if (buildQuickPreviewShowGear && typeof newSettings.buildQuickPreviewShowGear === 'boolean') {
        buildQuickPreviewShowGear.checked = newSettings.buildQuickPreviewShowGear;
      }
      if (liveTrackingVisibility && (newSettings.liveTrackingDefaultVisibility !== undefined || newSettings.liveTrackingPending)) {
        const visibility = newSettings.liveTrackingDefaultVisibility === 'public'
          ? 'public'
          : (newSettings.liveTrackingPending?.visibility === 'public' ? 'public' : 'private');
        liveTrackingVisibility.value = visibility;
      }
      renderLiveTrackingStatus(newSettings);
      if (controllerType && typeof newSettings.controllerType === 'string') {
        controllerTypeValue = newSettings.controllerType;
        controllerType.value = controllerTypeValue;
      }
      if (buildQuickPreviewShortcut) {
        buildQuickPreviewShortcut.value = newSettings.buildQuickPreviewShortcut || '';
      }
      if (openSettingsShortcut) {
        openSettingsShortcut.value = newSettings.openSettingsShortcut || '';
      }
      if (buildQuickPreviewControllerCombo) {
        buildQuickPreviewControllerCombo.value =
          normalizeControllerComboInput(newSettings.buildQuickPreviewControllerCombo || '');
      }
      if (buildQuickPreviewControllerEnabled && typeof newSettings.buildQuickPreviewControllerEnabled === 'boolean') {
        buildQuickPreviewControllerEnabled.checked = newSettings.buildQuickPreviewControllerEnabled;
      }
      if (openSettingsControllerCombo) {
        openSettingsControllerCombo.value =
          normalizeControllerComboInput(newSettings.openSettingsControllerCombo || '');
      }
      if (openSettingsControllerEnabled && typeof newSettings.openSettingsControllerEnabled === 'boolean') {
        openSettingsControllerEnabled.checked = newSettings.openSettingsControllerEnabled;
      }
      syncControllerShortcutConfigState();
      updateModuleTabs();
      // Update clientLogPath when settings are updated
      if (typeof newSettings.clientLogPath === 'string' && newSettings.clientLogPath.trim()) {
        if (clientLogPathInput.value !== newSettings.clientLogPath) {
          clientLogPathInput.value = newSettings.clientLogPath;
          updateClientLogStatus();
        }
      } else if (newSettings.clientLogPath === null || newSettings.clientLogPath === '') {
        if (clientLogPathInput.value !== '') {
          clientLogPathInput.value = '';
          updateClientLogStatus();
        }
      }
    }
  });
  
  // Listen for window ready signal from main process
  window.settingsAPI.onWindowReady(() => {
    console.log('[SETTINGS] Window ready signal received, performing status checks...');
    
    // Check if Trade tab is active
    const tradeTab = document.getElementById('tab-trade');
    const isTradeActive = tradeTab && tradeTab.classList.contains('active');
    
    console.log('[SETTINGS] Auto-checking login status, element exists:', !!liveSearchesLoginStatus, 'tab active:', isTradeActive);
    if (liveSearchesLoginStatus && isTradeActive) {
      setTimeout(() => {
        checkLoginStatus().catch(err => {
          console.error('[SETTINGS] Auto-check login status failed:', err);
        });
      }, 200);
    }
    
    // Check if Stash or Build tab is active
    const stashTab = document.getElementById('tab-stash');
    const isStashActive = stashTab && stashTab.classList.contains('active');
    const buildTab = document.getElementById('tab-build');
    const isBuildActive = buildTab && buildTab.classList.contains('active');
    
    console.log('[SETTINGS] Auto-checking OAuth status, widget count:', getOAuthStatusWidgets().length, 'stash active:', isStashActive, 'build active:', isBuildActive);
    if (getOAuthStatusWidgets().length > 0 && (isStashActive || isBuildActive)) {
      setTimeout(() => {
        checkOAuthStatus().catch(err => {
          console.error('[SETTINGS] Auto-check OAuth status failed:', err);
        }).finally(() => {
          mirrorStashOAuthToBuild();
        });
      }, 200);
    }
  });
  
  // Also reload settings when window becomes visible (handles case when window is reopened)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      try {
        const s = await window.settingsAPI.get();
        if (typeof s.clientLogPath === 'string' && s.clientLogPath.trim()) {
          if (clientLogPathInput.value !== s.clientLogPath) {
            clientLogPathInput.value = s.clientLogPath;
            updateClientLogStatus();
          }
        } else if (!s.clientLogPath || s.clientLogPath === '') {
          if (clientLogPathInput.value !== '') {
            clientLogPathInput.value = '';
            updateClientLogStatus();
          }
        }
      } catch (err) {
        console.warn('[SETTINGS] Failed to reload clientLogPath on visibility change:', err);
      }
    }
  });
})();


// Load app information for About tab
async function loadAppInfo() {
  try {
    const appInfo = await window.settingsAPI.getAppInfo();
    if (appInfo) {
      if (appVersionEl) appVersionEl.textContent = appInfo.version || '1.0.5';
    }
    
    // Load log path
    const logPath = await window.settingsAPI.getLogPath();
    if (logPathDisplayEl && logPath) {
      logPathDisplayEl.textContent = `Current log: ${logPath}`;
    } else if (logPathDisplayEl) {
      logPathDisplayEl.textContent = 'No log file available';
    }
  } catch (err) {
    console.error('[SETTINGS] Failed to load app info:', err);
  }
}

// Attach all button listeners when DOM is ready
function attachAllButtonListeners() {
  console.log('[SETTINGS] Attaching all button listeners...');
  
  if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
      console.log('[SETTINGS] Connect button clicked');
      const safeFeeds = sanitizeFeeds(feeds);
      await window.settingsAPI.set({ feeds: safeFeeds });
      window.settingsAPI.connectFeedsV2(safeFeeds);

      // Show success feedback
      btnConnect.textContent = '✓ Activating...';
      btnConnect.style.background = 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)';
      setTimeout(() => {
        btnConnect.textContent = 'Activate All Feeds';
        btnConnect.style.background = '';
      }, 2000);
    });
  }

  if (btnLogin) {
    btnLogin.addEventListener('click', () => {
      window.settingsAPI.openLogin();
    });
  }

  if (btnUnlinkAccount) {
    btnUnlinkAccount.addEventListener('click', () => {
      openUnlinkModal();
    });
  }

  if (unlinkCancel) {
    unlinkCancel.addEventListener('click', () => {
      closeUnlinkModal();
    });
  }

  if (unlinkModal) {
    unlinkModal.addEventListener('click', (event) => {
      if (event.target === unlinkModal) {
        closeUnlinkModal();
      }
    });
  }

  if (unlinkConfirm) {
    unlinkConfirm.addEventListener('click', async () => {
      closeUnlinkModal();
      if (btnUnlinkAccount) {
        btnUnlinkAccount.disabled = true;
        btnUnlinkAccount.textContent = 'Unlinking...';
      }

      try {
        const result = await window.settingsAPI.authLogout();
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to unlink device.');
        }
        if (linkedAccountStatus) {
          linkedAccountStatus.textContent = 'Logged out. Restarting...';
          linkedAccountStatus.style.background = '#2a2a2a';
          linkedAccountStatus.style.border = '1px solid #333';
          linkedAccountStatus.style.color = '#e8e8e8';
        }
        window.settingsAPI.appRelaunch();
      } catch (err) {
        console.error('[SETTINGS] Failed to unlink device:', err);
        alert(err.message || 'Failed to unlink device.');
      } finally {
        if (btnUnlinkAccount) {
          btnUnlinkAccount.textContent = 'Unlink device';
        }
        await refreshLinkedAccountStatus();
      }
    });
  }

  if (btnCheckLoginStatus) {
    btnCheckLoginStatus.addEventListener('click', () => {
      checkLoginStatus(true); // Force check when button is clicked
    });
  }
  
  if (btnCheckOAuthStatus) {
    btnCheckOAuthStatus.addEventListener('click', () => {
      checkOAuthStatus(true).finally(() => {
        mirrorStashOAuthToBuild();
      }); // Force check when button is clicked
    });
  }

  if (btnBuildCheckOAuthStatus) {
    btnBuildCheckOAuthStatus.addEventListener('click', () => {
      checkOAuthStatus(true).finally(() => {
        mirrorStashOAuthToBuild();
      });
    });
  }

  if (btnOAuthAuthorize) {
    btnOAuthAuthorize.addEventListener('click', async () => {
      try {
        await window.settingsAPI.openExternal(await getSimplexOAuthUrl());
        netWorthOAuthStatus.textContent = '⏳ Waiting for linked server OAuth...';
        netWorthOAuthStatus.style.background = 'var(--accent-yellow)';
        netWorthOAuthStatus.style.color = '#1a1a1a';
        netWorthOAuthDetails.textContent = 'Complete OAuth link on the account page, then click "Check Status".';
      } catch (err) {
        console.error('[SETTINGS] OAuth authorization error:', err);
        netWorthOAuthStatus.textContent = '✗ Error';
        netWorthOAuthStatus.style.background = '#e57373';
        netWorthOAuthStatus.style.color = '#1a1a1a';
        netWorthOAuthDetails.textContent = 'Failed to open simplex.gg account page. Please try again.';
      }
    });
  }

  if (btnBuildOAuthAuthorize) {
    btnBuildOAuthAuthorize.addEventListener('click', async () => {
      try {
        await window.settingsAPI.openExternal(await getSimplexOAuthUrl());
        if (buildLiveOAuthStatus) {
          buildLiveOAuthStatus.textContent = 'Waiting...';
          buildLiveOAuthStatus.style.background = 'var(--accent-yellow)';
          buildLiveOAuthStatus.style.color = '#1a1a1a';
        }
        if (buildLiveOAuthDetails) {
          buildLiveOAuthDetails.textContent = 'Complete OAuth link on the account page, then click "Check Status".';
          buildLiveOAuthDetails.style.color = 'rgba(180, 160, 120, 0.8)';
        }
      } catch (err) {
        console.error('[SETTINGS] Build OAuth authorization error:', err);
        if (buildLiveOAuthStatus) {
          buildLiveOAuthStatus.textContent = 'Error';
          buildLiveOAuthStatus.style.background = '#e57373';
          buildLiveOAuthStatus.style.color = '#1a1a1a';
        }
        if (buildLiveOAuthDetails) {
          buildLiveOAuthDetails.textContent = 'Failed to open simplex.gg account page. Please try again.';
          buildLiveOAuthDetails.style.color = 'rgba(239, 154, 154, 0.9)';
        }
      }
    });
  }

  if (btnViewLogs) {
    btnViewLogs.addEventListener('click', async () => {
      try {
        const logPath = await window.settingsAPI.getLogPath();
        if (logPath) {
          await window.settingsAPI.openLogFile(logPath);
        } else {
          alert('No log file found');
        }
      } catch (err) {
        console.error('Failed to view logs:', err);
        alert('Failed to open log file');
      }
    });
  }

  if (btnOpenLogs) {
    btnOpenLogs.addEventListener('click', async () => {
      try {
        await window.settingsAPI.openLogs();
      } catch (err) {
        console.error('Failed to open logs folder:', err);
        alert('Failed to open logs folder');
      }
    });
  }

  if (btnFeedbackBug) {
    btnFeedbackBug.addEventListener('click', () => {
      openFeedbackModal('bug');
    });
  }

  if (btnFeedbackFeature) {
    btnFeedbackFeature.addEventListener('click', () => {
      openFeedbackModal('feature');
    });
  }

  if (feedbackTabBug) {
    feedbackTabBug.addEventListener('click', () => {
      setFeedbackType('bug');
    });
  }

  if (feedbackTabFeature) {
    feedbackTabFeature.addEventListener('click', () => {
      setFeedbackType('feature');
    });
  }

  if (feedbackCancel) {
    feedbackCancel.addEventListener('click', () => {
      closeFeedbackModal();
    });
  }

  if (feedbackModal) {
    feedbackModal.addEventListener('click', (event) => {
      if (event.target === feedbackModal) {
        closeFeedbackModal();
      }
    });
  }

  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const title = feedbackTitle?.value?.trim() || '';
      const message = feedbackDetails?.value?.trim() || '';
      const steps = feedbackSteps?.value?.trim() || '';

      if (title.length < 6) {
        setFeedbackStatus('Please provide a longer title.', 'error');
        return;
      }
      if (message.length < 10) {
        setFeedbackStatus('Please provide more details.', 'error');
        return;
      }

      if (feedbackSubmit) {
        feedbackSubmit.disabled = true;
        feedbackSubmit.textContent = 'Sending...';
      }

      setFeedbackStatus('Sending feedback...', 'info');

      try {
        const result = await window.settingsAPI.submitFeedback({
          type: feedbackType,
          title,
          message,
          steps: feedbackType === 'bug' && steps ? steps : undefined,
        });

        if (!result?.success) {
          throw new Error(result?.error || 'Unable to submit feedback.');
        }

        setFeedbackStatus('Thanks for the feedback!', 'success', result?.discussionUrl);
        if (feedbackSubmit) {
          feedbackSubmit.disabled = false;
          feedbackSubmit.textContent = 'Submit feedback';
        }
      } catch (err) {
        console.error('[SETTINGS] Feedback submit failed:', err);
        const message = err instanceof Error ? err.message : 'Unable to submit feedback.';
        setFeedbackStatus(message, 'error');
        if (feedbackSubmit) {
          feedbackSubmit.disabled = false;
          feedbackSubmit.textContent = 'Submit feedback';
        }
      }
    });
  }

  // btnShowManagement removed

  if (btnAutoDetectClientLog) {
    btnAutoDetectClientLog.addEventListener('click', async () => {
      const path = await window.settingsAPI.autoDetectClientLog();
      if (path) {
        clientLogPathInput.value = path;
        await window.settingsAPI.set({ clientLogPath: path });
        await updateClientLogStatus();
        // Show success feedback
        btnAutoDetectClientLog.textContent = '✓ Found!';
        btnAutoDetectClientLog.style.background = 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)';
        setTimeout(() => {
          btnAutoDetectClientLog.textContent = 'Auto Detect';
          btnAutoDetectClientLog.style.background = '';
        }, 2000);
      } else {
        // Show error feedback
        btnAutoDetectClientLog.textContent = '✗ Not Found';
        btnAutoDetectClientLog.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
        setTimeout(() => {
          btnAutoDetectClientLog.textContent = 'Auto Detect';
          btnAutoDetectClientLog.style.background = '';
        }, 2000);
      }
    });
  }

  if (btnBrowseClientLog) {
    btnBrowseClientLog.addEventListener('click', async () => {
      const path = await window.settingsAPI.browseClientLog();
      if (path) {
        clientLogPathInput.value = path;
        await window.settingsAPI.set({ clientLogPath: path });
        await updateClientLogStatus();
      }
    });
  }

  if (btnLogs) {
    btnLogs.addEventListener('click', async () => {
      try {
        await window.settingsAPI.openLogs();
      } catch (err) {
        console.error('Failed to open logs:', err);
      }
    });
  }

  if (btnClearData) {
    btnClearData.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all data? This will remove all feeds and settings.')) {
        feeds = [];
        renderFeeds();
        await window.settingsAPI.set({
          feeds: [],
          liveUrls: [],
          liveUrl: '',
          visibleSeconds: 6,
          overlayLocked: false,
          readOnly: true,
          displayFeedName: false
        });
        location.reload();
      }
    });
  }

  if (clientLogPathInput) {
    clientLogPathInput.addEventListener('input', updateClientLogStatus);
    clientLogPathInput.addEventListener('change', async () => {
      const path = clientLogPathInput.value.trim() || null;
      await window.settingsAPI.set({ clientLogPath: path });
      await updateClientLogStatus();
    });
    clientLogPathInput.addEventListener('blur', async () => {
      const path = clientLogPathInput.value.trim() || null;
      await window.settingsAPI.set({ clientLogPath: path });
      await updateClientLogStatus();
    });
  }
  
  console.log('[SETTINGS] All button listeners attached');
}

// Attach all button listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachAllButtonListeners);
} else {
  attachAllButtonListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshLinkedAccountStatus);
} else {
  refreshLinkedAccountStatus();
}

if (window.settingsAPI && window.settingsAPI.onWindowReady) {
  window.settingsAPI.onWindowReady(() => {
    refreshLinkedAccountStatus();
  });
}

// Check login status for live searches
async function checkLoginStatus(force = false) {
  console.log('[SETTINGS] checkLoginStatus called, element exists:', !!liveSearchesLoginStatus, 'force:', force);
  if (!liveSearchesLoginStatus) {
    console.warn('[SETTINGS] liveSearchesLoginStatus element not found');
    return;
  }
  
  // Throttle automatic checks (but allow manual checks)
  const now = Date.now();
  if (!force && (now - lastLoginStatusCheck) < STATUS_CHECK_THROTTLE_MS) {
    const timeSinceLastCheck = Math.floor((now - lastLoginStatusCheck) / 1000);
    const timeUntilNextCheck = Math.floor((STATUS_CHECK_THROTTLE_MS - (now - lastLoginStatusCheck)) / 1000);
    console.log(`[SETTINGS] Login status check throttled. Last check was ${timeSinceLastCheck}s ago. Next check in ${timeUntilNextCheck}s.`);
    return;
  }
  
  lastLoginStatusCheck = now;
  
  liveSearchesLoginStatus.textContent = 'Checking...';
  liveSearchesLoginStatus.style.background = 'rgba(0, 0, 0, 0.3)';
  liveSearchesLoginStatus.style.color = 'rgba(200, 180, 140, 0.9)';
  
  // Add timeout to prevent hanging forever
  const timeoutId = setTimeout(() => {
    console.error('[SETTINGS] Login status check timed out after 10 seconds');
    liveSearchesLoginStatus.textContent = 'Timeout';
    liveSearchesLoginStatus.style.background = 'rgba(244, 67, 54, 0.2)';
    liveSearchesLoginStatus.style.color = 'rgba(239, 154, 154, 0.9)';
  }, 10000); // 10 second timeout
  
  try {
    console.log('[SETTINGS] Calling loginAPI.checkStatus()...');
    const status = await window.loginAPI.checkStatus();
    clearTimeout(timeoutId);
    console.log('[SETTINGS] Login status received:', status);
    
    if (status && status.loggedIn) {
      liveSearchesLoginStatus.innerHTML = '<span style="color: #4ade80;">●</span> <span style="color: var(--accent-yellow);">Logged In</span>';
      liveSearchesLoginStatus.style.background = '#2a2a2a';
      liveSearchesLoginStatus.style.color = '#e8e8e8';
      liveSearchesLoginStatus.style.border = '1px solid #333';
    } else {
      liveSearchesLoginStatus.innerHTML = '<span style="color: #ef9a9a;">●</span> <span style="color: #e8e8e8;">Not Logged In</span>';
      liveSearchesLoginStatus.style.background = '#2a2a2a';
      liveSearchesLoginStatus.style.color = '#e8e8e8';
      liveSearchesLoginStatus.style.border = '1px solid #333';
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[SETTINGS] Failed to check login status:', err);
    liveSearchesLoginStatus.innerHTML = '<span style="color: #ef9a9a;">●</span> <span style="color: #e8e8e8;">Error</span>';
    liveSearchesLoginStatus.style.background = '#2a2a2a';
    liveSearchesLoginStatus.style.color = '#e8e8e8';
    liveSearchesLoginStatus.style.border = '1px solid #333';
  }
}

// Check OAuth status for net worth
async function checkOAuthStatus(force = false) {
  if (!netWorthOAuthStatus) {
    mirrorStashOAuthToBuild();
    return;
  }

  // Throttle automatic checks (but allow manual checks)
  const now = Date.now();
  if (!force && (now - lastOAuthStatusCheck) < STATUS_CHECK_THROTTLE_MS) {
    const timeSinceLastCheck = Math.floor((now - lastOAuthStatusCheck) / 1000);
    const timeUntilNextCheck = Math.floor((STATUS_CHECK_THROTTLE_MS - (now - lastOAuthStatusCheck)) / 1000);
    console.log(`[SETTINGS] OAuth status check throttled. Last check was ${timeSinceLastCheck}s ago. Next check in ${timeUntilNextCheck}s.`);
    mirrorStashOAuthToBuild();
    return;
  }

  lastOAuthStatusCheck = now;

  netWorthOAuthStatus.textContent = 'Checking...';
  netWorthOAuthStatus.style.background = 'rgba(0, 0, 0, 0.3)';
  netWorthOAuthStatus.style.color = 'rgba(200, 180, 140, 0.9)';
  netWorthOAuthStatus.style.border = 'none';
  if (netWorthOAuthDetails) {
    netWorthOAuthDetails.textContent = 'Checking server OAuth status...';
    netWorthOAuthDetails.style.color = 'rgba(180, 160, 120, 0.8)';
  }

  try {
    const status = await window.settingsAPI.getPoeOAuthStatus();
    if (status.authorized) {
      netWorthOAuthStatus.textContent = 'Authorized';
      netWorthOAuthStatus.style.background = 'rgba(76, 175, 80, 0.2)';
      netWorthOAuthStatus.style.color = 'rgba(129, 199, 132, 0.9)';
      netWorthOAuthStatus.style.border = '1px solid rgba(76, 175, 80, 0.4)';

      if (status.refreshExpiresIn !== undefined) {
        if (status.refreshExpiresIn < 1) {
          netWorthOAuthDetails.textContent = 'Refresh token expires soon - re-authorization needed';
          netWorthOAuthDetails.style.color = 'rgba(255, 152, 0, 0.9)';
        } else {
          netWorthOAuthDetails.textContent = `Token expires in ${status.refreshExpiresIn} days. Access token expires in ${status.accessExpiresIn || '?'} hours.`;
          netWorthOAuthDetails.style.color = 'rgba(180, 160, 120, 0.8)';
        }
      } else {
        netWorthOAuthDetails.textContent = status.message || 'Authorized';
        netWorthOAuthDetails.style.color = 'rgba(180, 160, 120, 0.8)';
      }
    } else {
      netWorthOAuthStatus.textContent = 'Not Authorized';
      netWorthOAuthStatus.style.background = 'rgba(244, 67, 54, 0.2)';
      netWorthOAuthStatus.style.color = 'rgba(239, 154, 154, 0.9)';
      netWorthOAuthStatus.style.border = '1px solid rgba(244, 67, 54, 0.4)';
      netWorthOAuthDetails.textContent = status.message || 'Link OAuth on simplex.gg/account to use server-side PoE access.';
      netWorthOAuthDetails.style.color = 'rgba(180, 160, 120, 0.8)';
    }
  } catch (err) {
    netWorthOAuthStatus.textContent = 'Error';
    netWorthOAuthStatus.style.background = 'rgba(244, 67, 54, 0.2)';
    netWorthOAuthStatus.style.color = 'rgba(239, 154, 154, 0.9)';
    netWorthOAuthStatus.style.border = '1px solid rgba(244, 67, 54, 0.4)';
    if (netWorthOAuthDetails) {
      netWorthOAuthDetails.textContent = 'Failed to check OAuth status.';
      netWorthOAuthDetails.style.color = 'rgba(239, 154, 154, 0.9)';
    }
    console.error('Failed to check OAuth status:', err);
  } finally {
    mirrorStashOAuthToBuild();
  }
}

// Update Client.txt status indicator
async function updateClientLogStatus() {
  const path = clientLogPathInput.value.trim();
  if (!path) {
    clientLogStatusIcon.textContent = '';
    clientLogStatusIcon.style.display = 'none';
    return;
  }
  
  const exists = await window.settingsAPI.checkFileExists(path);
  clientLogStatusIcon.style.display = 'flex';
  
  if (exists) {
    clientLogStatusIcon.textContent = '●';
    clientLogStatusIcon.style.color = 'rgba(76, 175, 80, 0.9)';
  } else {
    clientLogStatusIcon.textContent = '●';
    clientLogStatusIcon.style.color = 'rgba(244, 67, 54, 0.9)';
  }
}


async function refreshStatus() {
  try {
    const st = await window.settingsAPI.getStatus();
    const active = st?.activeFeeds ?? 0;
    const last = st?.lastEventTs ? new Date(st.lastEventTs).toLocaleTimeString() : '–';
    statusLine.innerHTML = `<strong>Active feeds:</strong> ${active} | <strong>Last event:</strong> ${last}`;
  } catch (err) {}
}

setInterval(refreshStatus, 1000);
refreshStatus();



function createSettingsStore({ app, path, fs, logger }) {
  const defaultSettings = {
    liveUrl: '',
    visibleSeconds: 6,
    showOnNewItem: true,
    clickToDismiss: true,
    overlayLocked: false,
    overlayBounds: null,
    liveUrls: [],
    feeds: [],
    displayFeedName: false,
    showModRanges: true,
    showManagementByDefault: false,
    accentYellow: 'warm',
    readOnly: true,
    clientLogPath: null,
    liveSearchesEnabled: true,
    whispersEnabled: true,
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
    tutorialCompleted: false,
    liveTrackingDefaultVisibility: 'private',
    liveTrackingPending: null,
    liveTrackingByCharacter: {},
    activeCharacterName: null,
    activeCharacterLeague: null,
    activeCharacterClass: null,
    activeCharacterSeenAt: null,
    currentCharacterLiveTracking: null,
  };

  function settingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
  }

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

        if (Array.isArray(merged.liveUrls) && merged.liveUrls.length > 0 && (!merged.feeds || merged.feeds.length === 0)) {
          merged.feeds = merged.liveUrls.map((url, idx) => ({
            id: `feed-${Date.now()}-${idx}`,
            url,
            name: `Feed ${idx + 1}`,
            icon: null,
          }));
          logger.info('settings:migrated-feeds', { count: merged.feeds.length });
        }

        if (Array.isArray(merged.feeds)) {
          merged.feeds = merged.feeds.map((feed) => {
            const { muted, ...feedWithoutMuted } = feed;
            return {
              ...feedWithoutMuted,
              icon: feedWithoutMuted.icon || null,
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

        logger.info('settings:loaded', {
          clientLogPath: merged.clientLogPath,
          path: p,
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
      const cleanedSettings = { ...s };
      if (Array.isArray(cleanedSettings.feeds)) {
        cleanedSettings.feeds = cleanedSettings.feeds.map((feed) => {
          const { muted, ...feedWithoutMuted } = feed;
          return feedWithoutMuted;
        });
      }
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      const settingsFile = settingsPath();
      fs.writeFileSync(settingsFile, JSON.stringify(cleanedSettings, null, 2));
      logger.info('settings:saved', {
        clientLogPath: cleanedSettings.clientLogPath,
        path: settingsFile,
      });
    } catch (e) {
      console.error('Failed to save settings:', e);
      logger.error('settings:save-failed', { error: String(e) });
    }
  }

  return {
    defaultSettings,
    settingsPath,
    isNewInstallation,
    loadSettings,
    saveSettings,
  };
}

module.exports = {
  createSettingsStore,
};
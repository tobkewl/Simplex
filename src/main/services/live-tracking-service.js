function createLiveTrackingService({
  logger,
  getApiClient,
  getSettings,
  setSettings,
  loadSettings,
  saveSettings,
  broadcastSettingsUpdate,
  resolveBuildPageUrl,
  buildLiveSnapshot,
  summarizeSkillChains,
  getClientLogWatcher,
}) {
  const LIVE_TRACKING_KEY_SEPARATOR = '::';
  let liveCaptureInFlight = false;
  let characterInfoCache = { fetchedAt: 0, byName: new Map(), unavailableUntil: 0 };
  let characterInfoRefreshInFlight = null;

  function ensureSettings() {
    const current = getSettings();
    if (current && typeof current === 'object') return current;
    const loaded = typeof loadSettings === 'function' ? loadSettings() : null;
    if (loaded && typeof loaded === 'object') {
      if (typeof setSettings === 'function') {
        setSettings(loaded);
      }
      return loaded;
    }
    return null;
  }

  function buildLiveTrackingKey(league, characterName) {
    const leagueKey = String(league || '').trim().toLowerCase();
    const charKey = String(characterName || '').trim().toLowerCase();
    if (!leagueKey || !charKey) return null;
    return `${leagueKey}${LIVE_TRACKING_KEY_SEPARATOR}${charKey}`;
  }

  function normalizeLiveTrackingLeague(league) {
    const normalized = String(league || '').trim();
    return normalized || 'Unknown';
  }

  function getLiveTrackingDefaultVisibility() {
    const settings = ensureSettings();
    return settings?.liveTrackingDefaultVisibility === 'public' ? 'public' : 'private';
  }

  function getEnabledLiveTrackingEntries() {
    const settings = ensureSettings();
    if (!settings?.liveTrackingByCharacter || typeof settings.liveTrackingByCharacter !== 'object') {
      return [];
    }
    return Object.values(settings.liveTrackingByCharacter).filter((entry) => entry && entry.enabled === true);
  }

  function getPreferredLiveTrackingVisibility() {
    const enabledEntries = getEnabledLiveTrackingEntries();
    const enabledPublic = enabledEntries.find((entry) => entry?.visibility === 'public');
    if (enabledPublic) return 'public';
    const firstEnabled = enabledEntries.find((entry) => entry?.visibility === 'public' || entry?.visibility === 'private');
    if (firstEnabled?.visibility === 'public') return 'public';
    if (firstEnabled?.visibility === 'private') return 'private';
    return getLiveTrackingDefaultVisibility();
  }

  function isLiveTrackingCharacterNotReadyError(err) {
    const message = String(err || '').toLowerCase();
    if (!message) return false;
    return (
      message.includes('character') &&
      (
        message.includes('not found') ||
        message.includes('unknown') ||
        message.includes('not available') ||
        message.includes('missing')
      )
    );
  }

  function armLiveTrackingPending(visibility = null) {
    const settings = ensureSettings();
    if (!settings) return;
    const nextVisibility = visibility === 'public' ? 'public' : 'private';
    settings.liveTrackingPending = { visibility: nextVisibility };
    refreshCurrentCharacterLiveTrackingState();
    saveSettings(settings);
    broadcastSettingsUpdate({
      liveTrackingPending: settings.liveTrackingPending,
      currentCharacterLiveTracking: settings.currentCharacterLiveTracking,
    });
  }

  function isUnknownLiveTrackingLeague(league) {
    return normalizeLiveTrackingLeague(league).toLowerCase() === 'unknown';
  }

  function resolveLiveTrackingEntry(characterName, league) {
    const settings = ensureSettings();
    if (!settings?.liveTrackingByCharacter || typeof settings.liveTrackingByCharacter !== 'object') return null;
    const charKey = String(characterName || '').trim().toLowerCase();
    if (!charKey) return null;
    const map = settings.liveTrackingByCharacter;
    const keysForCharacter = Object.keys(map).filter((key) => key.endsWith(`${LIVE_TRACKING_KEY_SEPARATOR}${charKey}`));
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
    const settings = ensureSettings();
    if (!settings) return null;

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

  async function restoreLiveTrackingOnStartup() {
    const settings = ensureSettings();
    const apiClient = getApiClient();
    if (!settings || !apiClient || typeof apiClient.setLiveBuildTracking !== 'function') return;

    const map = settings.liveTrackingByCharacter && typeof settings.liveTrackingByCharacter === 'object'
      ? settings.liveTrackingByCharacter
      : {};

    const enabledEntries = Object.values(map)
      .filter((entry) => entry && entry.enabled === true && typeof entry.buildId === 'string')
      .map((entry) => entry.buildId.trim())
      .filter(Boolean);

    const uniqueBuildIds = Array.from(new Set(enabledEntries));
    if (uniqueBuildIds.length === 0) {
      logger.info('live-tracking:startup:restore-skip', { reason: 'no-enabled-builds' });
      return;
    }

    let restored = 0;
    let failed = 0;
    for (const buildId of uniqueBuildIds) {
      try {
        await apiClient.setLiveBuildTracking(buildId, true);
        restored += 1;
      } catch (err) {
        failed += 1;
        logger.warn('live-tracking:startup:restore-failed', {
          buildId,
          error: String(err),
        });
      }
    }

    logger.info('live-tracking:startup:restore-done', {
      enabledBuilds: uniqueBuildIds.length,
      restored,
      failed,
    });
  }

  async function refreshCharacterInfoCache() {
    const apiClient = getApiClient();
    if (!apiClient || typeof apiClient.getPoeCharacters !== 'function') return null;
    if (characterInfoRefreshInFlight) return characterInfoRefreshInFlight;

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
        const clientLogWatcher = getClientLogWatcher();
        if (clientLogWatcher && typeof clientLogWatcher.setAllowedCharacterNames === 'function') {
          clientLogWatcher.setAllowedCharacterNames(Array.from(byName.keys()));
        }

        const settings = ensureSettings();
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

  async function setActiveCharacterState(characterName, className = null) {
    const settings = ensureSettings();
    if (!settings) return null;

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
    return {
      characterName: settings.activeCharacterName,
      league: settings.activeCharacterLeague,
      className: settings.activeCharacterClass,
    };
  }

  function clearActiveCharacterState() {
    const settings = ensureSettings();
    if (!settings) return;

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

  async function handleLiveTrackingLevelUp(payload) {
    const settings = ensureSettings();
    if (!settings) return;

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

      const apiClient = getApiClient();
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

      if (!settings?.liveTrackingPending && (!resolved || !resolved.entry)) {
        const enabledElsewhere = getEnabledLiveTrackingEntries().length > 0;
        if (enabledElsewhere) {
          const fallbackVisibility = getPreferredLiveTrackingVisibility();
          armLiveTrackingPending(fallbackVisibility);
          logger.info('live-tracking:auto-arm', {
            characterName,
            league,
            visibility: fallbackVisibility,
            reason: 'enabled-on-different-character',
          });
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
    let settings = ensureSettings();
    if (!settings) return { ok: false, error: 'settings unavailable' };

    const map = settings.liveTrackingByCharacter && typeof settings.liveTrackingByCharacter === 'object'
      ? { ...settings.liveTrackingByCharacter }
      : {};

    const buildIds = Array.from(new Set(
      Object.values(map)
        .filter((entry) => entry && entry.enabled === true && typeof entry.buildId === 'string')
        .map((entry) => entry.buildId)
    ));

    let remoteUpdated = 0;
    let remoteFailed = 0;
    const apiClient = getApiClient();
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
    let settings = ensureSettings();
    if (!settings) return { ok: false, error: 'settings unavailable' };

    const apiClient = getApiClient();
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
      let startResult = null;
      try {
        startResult = await apiClient.startLiveBuild({
          characterName: activeName,
          league,
          visibility: desiredVisibility,
        });
      } catch (err) {
        if (isLiveTrackingCharacterNotReadyError(err)) {
          armLiveTrackingPending(desiredVisibility);
          logger.info('live-tracking:armed', {
            characterName: activeName,
            league,
            visibility: desiredVisibility,
            reason: 'character-not-ready',
            error: String(err),
          });
          return {
            ok: true,
            enabled: true,
            armed: true,
            characterName: activeName,
            league,
          };
        }
        throw err;
      }

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

  function getAllowedCharacterNames() {
    return Array.from(characterInfoCache?.byName?.keys?.() || []);
  }

  return {
    refreshCurrentCharacterLiveTrackingState,
    restoreLiveTrackingOnStartup,
    refreshCharacterInfoCache,
    resolveCharacterInfo,
    setActiveCharacterState,
    clearActiveCharacterState,
    handleLiveTrackingLevelUp,
    disableAllLiveTracking,
    toggleLiveTrackingForActiveCharacter,
    getAllowedCharacterNames,
  };
}

module.exports = {
  createLiveTrackingService,
};

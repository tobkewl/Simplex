const { contextBridge, ipcRenderer } = require('electron');
const { setupAccentTheme } = require('./theme');

setupAccentTheme();

const DEFAULT_REALM = 'pc';
const NETWORTH_ACTIVE_LEAGUE = 'Mirage';

const DEFAULT_CURRENCY_RATES = {
  chaos: 1,
  divine: 200,
  exalted: 15,
  mirror: 50000,
  alchemy: 0.1,
  alteration: 0.05,
  fusing: 0.5,
  jewellers: 0.1,
  chromatic: 0.1,
  vaal: 1,
  regal: 2,
  regret: 1,
  scour: 0.5,
  blessed: 0.1,
  gcp: 0.5,
};

const CURRENCY_NAME_TO_KEY = {
  'Chaos Orb': 'chaos',
  'Divine Orb': 'divine',
  'Exalted Orb': 'exalted',
  'Mirror of Kalandra': 'mirror',
  'Orb of Alchemy': 'alchemy',
  'Orb of Alteration': 'alteration',
  'Orb of Fusing': 'fusing',
  "Jeweller's Orb": 'jewellers',
  'Chromatic Orb': 'chromatic',
  'Vaal Orb': 'vaal',
  'Regal Orb': 'regal',
  'Orb of Regret': 'regret',
  'Orb of Scouring': 'scour',
  'Blessed Orb': 'blessed',
  "Gemcutter's Prism": 'gcp',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeLeague(league) {
  const value = asString(league);
  return value.length > 0 ? value : null;
}

function resolveNetworthLeague(_league) {
  return NETWORTH_ACTIVE_LEAGUE;
}

function normalizeCurrencyRates(rawRates) {
  const source = asObject(rawRates) || {};
  const rates = { ...DEFAULT_CURRENCY_RATES };

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = asString(rawKey).toLowerCase();
    if (!key) continue;
    const parsed = Number(rawValue?.chaos ?? rawValue?.rate ?? rawValue?.value ?? rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    rates[key] = parsed;
  }

  rates.chaos = 1;
  if (!Number.isFinite(rates.divine) || rates.divine <= 0) {
    rates.divine = DEFAULT_CURRENCY_RATES.divine;
  }
  return rates;
}

function getRate(currencyKey, rates = DEFAULT_CURRENCY_RATES) {
  if (!currencyKey) return 1;
  return rates[String(currencyKey).toLowerCase()] || 1;
}

function getCurrencyKeyFromName(name, typeLine) {
  return CURRENCY_NAME_TO_KEY[name] || CURRENCY_NAME_TO_KEY[typeLine] || null;
}

function toEpochMillis(input) {
  const asNumber = Number(input);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const date = new Date(input);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : Date.now();
}

function toTabIndex(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toLegacyItem(item, index, league) {
  const source = asObject(item) || {};
  const stackSize = Math.max(1, Math.floor(toNumber(source.stackSize, 1)));
  const tabIndex = toTabIndex(source.tabIndex ?? source.tab_index ?? source._tabIndex);
  const tabName =
    asString(source.tabName || source.tab_name || source._tabName)
    || (source.source === 'inventory' ? 'Inventory' : null);
  const name = asString(source.name) || asString(source.typeLine) || 'Unknown Item';
  const typeLine = asString(source.typeLine);
  const currencyKey = getCurrencyKeyFromName(name, typeLine);
  const existingNetworth = asObject(source._networth);
  const hasExistingNetworth =
    existingNetworth !== null &&
    Number.isFinite(Number(existingNetworth.value)) &&
    asString(existingNetworth.currency).length > 0;
  const value = hasExistingNetworth
    ? Number(existingNetworth.value)
    : (currencyKey ? stackSize : 0);
  const currency = hasExistingNetworth
    ? asString(existingNetworth.currency).toLowerCase()
    : (currencyKey || 'chaos');

  return {
    ...source,
    id: asString(source.id) || `item-${index}`,
    name,
    typeLine,
    stackSize,
    _league: safeLeague(source.league) || safeLeague(league) || null,
    _tabIndex: tabIndex,
    _tabName: tabName,
    _networth: {
      value,
      currency,
      source: hasExistingNetworth ? (asString(existingNetworth.source) || null) : null,
    },
  };
}

function addTabValuesFromItems(tabMap, items, rates) {
  for (const item of items) {
    const tabIndex = Number.isFinite(item._tabIndex) ? Number(item._tabIndex) : null;
    if (tabIndex === null) continue;
    const tab = tabMap.get(tabIndex);
    if (!tab) continue;

    const itemValue = toNumber(item?._networth?.value, 0);
    const rate = getRate(item?._networth?.currency, rates);
    const chaos = itemValue * rate;
    tab.itemCount += 1;
    tab.netWorth.chaos += chaos;
    tab.netWorth.divine = tab.netWorth.chaos / getRate('divine', rates);
  }
}

function toLegacyTabDetails(scan, legacyItems, timestamp, rates) {
  const tabs = asArray(scan?.stash?.tabs);
  const stashNumTabs = Math.max(0, Math.floor(toNumber(scan?.stash?.numTabs, tabs.length)));
  const tabMap = new Map();
  const requestedSet = new Set(
    asArray(scan?.stash?.requestedTabIndices)
      .map((entry) => toTabIndex(entry))
      .filter((entry) => entry !== null)
  );
  const scannedSet = new Set(
    asArray(scan?.stash?.scannedTabIndices)
      .map((entry) => toTabIndex(entry))
      .filter((entry) => entry !== null)
  );
  const pendingSet = new Set(
    asArray(scan?.pendingTabIndices ?? scan?.stash?.pendingTabIndices)
      .map((entry) => toTabIndex(entry))
      .filter((entry) => entry !== null)
  );
  const failedSet = new Set(
    asArray(scan?.failedTabIndices ?? scan?.stash?.failedTabIndices)
      .map((entry) => toTabIndex(entry))
      .filter((entry) => entry !== null)
  );
  const partial = scan?.partial === true;
  const partialReason = asString(scan?.partialReason).toLowerCase();
  const explicitRetryAt = toNumber(scan?.retryAt, 0);
  const retryAt = explicitRetryAt > 0
    ? explicitRetryAt
    : (partial && partialReason === 'rate_limit' ? timestamp + 60000 : null);

  for (const tab of tabs) {
    const normalizedTab = asObject(tab) || {};
    const index = Number.isFinite(normalizedTab.index) ? Number(normalizedTab.index) : null;
    if (index === null) continue;
    const scanned = scannedSet.has(index);
    const pending = pendingSet.has(index);
    const failed = failedSet.has(index) || (
      partial
      && !scanned
      && !pending
      && requestedSet.has(index)
      && pendingSet.size === 0
    );
    const syncStatus = scanned
      ? 'ok'
      : (pending
        ? (partialReason === 'rate_limit' ? 'rate_limited' : 'pending')
        : (failed ? 'failed' : 'ok'));

    tabMap.set(index, {
      index,
      name: asString(normalizedTab.name) || `Tab ${index + 1}`,
      type: asString(normalizedTab.type) || 'NormalStash',
      source: 'stash',
      syncStatus,
      retryAt: syncStatus === 'rate_limited' ? retryAt : null,
      netWorth: { chaos: 0, divine: 0 },
      itemCount: 0,
    });
  }

  if (tabMap.size === 0 && stashNumTabs > 0) {
    for (let index = 0; index < stashNumTabs; index += 1) {
      const scanned = scannedSet.has(index);
      const pending = pendingSet.has(index);
      const failed = failedSet.has(index) || (
        partial
        && !scanned
        && !pending
        && requestedSet.has(index)
        && pendingSet.size === 0
      );
      const syncStatus = scanned
        ? 'ok'
        : (pending
          ? (partialReason === 'rate_limit' ? 'rate_limited' : 'pending')
          : (failed ? 'failed' : 'ok'));
      tabMap.set(index, {
        index,
        name: `Tab ${index + 1}`,
        type: 'NormalStash',
        source: 'stash',
        syncStatus,
        retryAt: syncStatus === 'rate_limited' ? retryAt : null,
        netWorth: { chaos: 0, divine: 0 },
        itemCount: 0,
      });
    }
  }

  addTabValuesFromItems(tabMap, legacyItems, rates);
  return Array.from(tabMap.values()).sort((a, b) => a.index - b.index);
}

function toLegacyNetWorth(legacyItems, rates) {
  const netWorth = {};
  let totalChaos = 0;
  for (const item of legacyItems) {
    const amount = toNumber(item?._networth?.value, 0);
    const currency = asString(item?._networth?.currency).toLowerCase() || 'chaos';
    if (!netWorth[currency]) {
      netWorth[currency] = 0;
    }
    netWorth[currency] += amount;
    totalChaos += amount * getRate(currency, rates);
  }

  return {
    netWorth,
    converted: {
      chaos: totalChaos,
      divine: totalChaos / getRate('divine', rates),
    },
  };
}

function toLegacyScan(scan, fallbackLeague = null) {
  if (!scan) return null;
  if (Array.isArray(scan?.tabDetails) && Array.isArray(scan?.items)) {
    return scan;
  }

  let sourceItems = asArray(scan?.items);
  if (sourceItems.length === 0) {
    sourceItems = [
      ...asArray(scan?.stash?.items),
      ...asArray(scan?.inventory?.items),
    ];
  }
  const legacyItems = sourceItems.map((item, index) => toLegacyItem(item, index, scan?.league || fallbackLeague));
  const timestamp = toEpochMillis(scan?.scannedAt || scan?.timestamp);
  const currencyRates = normalizeCurrencyRates(scan?.currencyRates);
  const { netWorth, converted } = toLegacyNetWorth(legacyItems, currencyRates);
  const tabDetails = toLegacyTabDetails(scan, legacyItems, timestamp, currencyRates);
  const partialReason = asString(scan?.partialReason) || null;
  const pendingTabIndices = asArray(scan?.pendingTabIndices ?? scan?.stash?.pendingTabIndices)
    .map((entry) => toTabIndex(entry))
    .filter((entry) => entry !== null);
  const explicitRetryAt = toNumber(scan?.retryAt, 0);
  const retryAt = explicitRetryAt > 0
    ? explicitRetryAt
    : (scan?.partial === true && partialReason === 'rate_limit' ? timestamp + 60000 : null);

  return {
    ...scan,
    league: safeLeague(scan?.league) || safeLeague(fallbackLeague) || null,
    timestamp,
    items: legacyItems,
    itemsArray: legacyItems,
    netWorth,
    converted,
    currencyRates,
    tabDetails,
    partialReason,
    pendingTabIndices,
    retryAt,
  };
}

function normalizeLeagues(leagues, realm = DEFAULT_REALM) {
  const normalized = asArray(leagues)
    .map((entry) => {
      if (typeof entry === 'string') {
        const id = asString(entry);
        return id ? { id, realm } : null;
      }
      const obj = asObject(entry);
      if (!obj) return null;
      const id = asString(obj.id || obj.name || obj.league);
      const itemRealm = asString(obj.realm) || realm;
      return id ? { id, realm: itemRealm } : null;
    })
    .filter(Boolean);
  return normalized.filter((entry) => entry.id === NETWORTH_ACTIVE_LEAGUE);
}

function toLegacyTaskQueue(data) {
  const source = asObject(data) || {};
  return {
    pricing: asArray(source.pricing),
    scans: asArray(source.scans || source.scan),
    rateLimits: asObject(source.rateLimits) || null,
    cachedStashTabs: asObject(source.cachedStashTabs) || null,
    scanHistoryClearedAt: Number(source.scanHistoryClearedAt || 0),
  };
}

function toScanPayload(arg1, arg2) {
  if (asObject(arg1)) {
    const payload = { realm: DEFAULT_REALM, ...arg1, league: resolveNetworthLeague(arg1?.league) };
    if (typeof payload.includeInventory !== 'boolean') {
      payload.includeInventory = true;
    }
    return payload;
  }
  return {
    realm: DEFAULT_REALM,
    league: resolveNetworthLeague(arg1),
    tabIndices: Array.isArray(arg2) ? arg2 : undefined,
    includeInventory: true,
  };
}

async function invokeLegacyScan(arg1, arg2) {
  const payload = toScanPayload(arg1, arg2);
  const result = await ipcRenderer.invoke('networth:scanStashes', payload);
  if (result?.success === false) {
    throw new Error(asString(result.error) || 'Scan failed');
  }
  if (!result?.scan) {
    throw new Error('Scan returned no data');
  }
  return {
    ...result,
    scan: toLegacyScan(result.scan, NETWORTH_ACTIVE_LEAGUE),
    comparison: result.comparison || null,
  };
}

contextBridge.exposeInMainWorld('networthOverlayAPI', {
  close: () => ipcRenderer.send('networth-overlay:close'),
  minimize: () => ipcRenderer.send('networth-overlay:minimize'),
  maximize: () => ipcRenderer.send('networth-overlay:maximize'),
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('networth-overlay:moveWindow', deltaX, deltaY),
  isMaximized: () => ipcRenderer.invoke('networth-overlay:isMaximized'),
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (_event, value) => callback(Boolean(value)));
  },

  getPoeOAuthStatus: () => ipcRenderer.invoke('api:get-poe-oauth-status'),
  getPreferences: async () => {
    const prefs = await ipcRenderer.invoke('networth:getPreferences');
    return {
      autoSyncOnOpen: prefs?.autoSyncOnOpen === true,
      serverPricingEnabled: prefs?.serverPricingEnabled === true,
      pricingListingMode: asString(prefs?.pricingListingMode) || 'instant_buyout',
      autoQueueUnpriced: prefs?.autoQueueUnpriced === true,
    };
  },
  setPreferences: (payload) => ipcRenderer.invoke('networth:setPreferences', payload || {}),
  getPricingConfig: () => ipcRenderer.invoke('networth:getPricingConfig'),
  getLeagues: async (payload) => {
    const realm = asString(payload?.realm) || DEFAULT_REALM;
    const leagues = await ipcRenderer.invoke('networth:getLeagues', payload || { realm });
    const normalized = normalizeLeagues(leagues, realm);
    return normalized.length > 0 ? normalized : [{ id: NETWORTH_ACTIVE_LEAGUE, realm }];
  },
  getCharacters: (payload) => ipcRenderer.invoke('networth:getCharacters', payload || {}),
  getStashTabs: (payload) => {
    const normalizedPayload = typeof payload === 'string' ? { league: payload } : (payload || {});
    return ipcRenderer.invoke('networth:getStashTabs', {
      realm: DEFAULT_REALM,
      ...normalizedPayload,
      league: resolveNetworthLeague(normalizedPayload.league),
    });
  },
  getCachedStashTabs: async () => ipcRenderer.invoke('networth:getCachedStashTabs'),
  scanStashes: (payload, tabIndices) => invokeLegacyScan(payload, tabIndices),
  scanStashesSnapshot: async (payload, tabIndices) => {
    const normalizedPayload = toScanPayload(payload, tabIndices);
    const result = await ipcRenderer.invoke('networth:scanStashesSnapshot', normalizedPayload);
    if (result?.success === false) {
      throw new Error(asString(result.error) || 'Snapshot scan failed');
    }
    if (!result?.scan) {
      throw new Error('Snapshot scan returned no data');
    }
    return {
      ...result,
      scan: toLegacyScan(result.scan, normalizedPayload.league),
      comparison: result.comparison || null,
    };
  },
  onSnapshotScanProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('networth:scanSnapshotProgress', handler);
    return () => ipcRenderer.removeListener('networth:scanSnapshotProgress', handler);
  },
  getLastScan: async (league) => {
    const payload = { league: resolveNetworthLeague(league), realm: DEFAULT_REALM };
    const scan = await ipcRenderer.invoke('networth:getLastScan', payload);
    return toLegacyScan(scan, NETWORTH_ACTIVE_LEAGUE);
  },
  getScanHistory: async (limit = 50, league = null) => {
    const payload = {
      limit,
      league: resolveNetworthLeague(league),
      realm: DEFAULT_REALM,
    };
    const history = await ipcRenderer.invoke('networth:getScanHistory', payload);
    const normalized = asArray(history)
      .map((entry) => toLegacyScan(entry, NETWORTH_ACTIVE_LEAGUE))
      .filter((entry) => !entry?.league || entry.league === NETWORTH_ACTIVE_LEAGUE);
    return normalized.slice(0, Math.max(1, Number(limit) || 50));
  },
  getLastLeague: () => ipcRenderer.invoke('networth:getLastLeague'),
  setLastLeague: (_league, realm) => ipcRenderer.invoke('networth:setLastLeague', {
    league: NETWORTH_ACTIVE_LEAGUE,
    realm: asString(realm) || DEFAULT_REALM,
  }),

  sendRunTimerUpdate: (data) => ipcRenderer.send('run:timerUpdate', data),
  sendRunStarted: (data) => ipcRenderer.send('run:started', data),
  sendRunEnded: () => ipcRenderer.send('run:ended'),
  onRunTogglePause: (callback) => ipcRenderer.on('run:togglePause', () => callback()),
  onRunRequestEnd: (callback) => ipcRenderer.on('run:requestEnd', () => callback()),

  openExternal: (url) => ipcRenderer.send('overlay:openExternal', url),

  priceItem: (item, _league, options) => ipcRenderer.invoke('networth:priceItem', item, NETWORTH_ACTIVE_LEAGUE, options),
  saveManualPricing: (item, pricing, _league) => ipcRenderer.invoke('networth:saveManualPricing', item, pricing, NETWORTH_ACTIVE_LEAGUE),

  getTaskQueue: async () => {
    const queue = await ipcRenderer.invoke('networth:getTaskQueue');
    return toLegacyTaskQueue(queue);
  },
  removePricingQueueItem: (itemKey) => ipcRenderer.invoke('networth:removePricingQueueItem', itemKey),
  clearPricingQueue: () => ipcRenderer.invoke('networth:clearPricingQueue'),
  enqueuePricingItems: (items, _league) => ipcRenderer.invoke('networth:enqueuePricingItems', items, NETWORTH_ACTIVE_LEAGUE),
  enqueueUnpricedItems: (payload) => ipcRenderer.invoke('networth:enqueueUnpricedItems', {
    ...(payload || {}),
    league: NETWORTH_ACTIVE_LEAGUE,
  }),
  enqueueScanTask: (payload) => ipcRenderer.invoke('networth:enqueueScanTask', {
    ...(payload || {}),
    league: NETWORTH_ACTIVE_LEAGUE,
  }),
  getScanQueue: () => ipcRenderer.invoke('networth:getScanQueue'),
  removeScanQueueItem: (id) => ipcRenderer.invoke('networth:removeScanQueueItem', id),
  clearScanQueue: () => ipcRenderer.invoke('networth:clearScanQueue'),
  clearScanHistory: () => ipcRenderer.invoke('networth:clearScanHistory'),
});

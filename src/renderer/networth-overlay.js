// Net Worth Overlay - Volledig herwerkt met iconen en breakdown
let MIRAGE_STACKABLE_CURRENCY_BY_NAME = {};
let MIRAGE_STACKABLE_CURRENCY_BY_KEY = {};
let normalizeMirageStackableCurrencyKey = (value) => String(value || '').trim().toLowerCase();

try {
  ({
    MIRAGE_STACKABLE_CURRENCY_BY_NAME,
    MIRAGE_STACKABLE_CURRENCY_BY_KEY,
    normalizeMirageStackableCurrencyKey,
  } = require('../common/mirage-stackable-currencies'));
} catch (_error) {
  // Optional generated file; fall back to the built-in currency map.
}

const NETWORTH_ACTIVE_LEAGUE = 'Mirage';
const QUEUE_VIEW_FILTER_STORAGE_KEY = 'networth.queueViewFilter';
const TRACK_RUN_HISTORY_STORAGE_KEY = 'networth.trackRunHistory.v1';
const MAX_PERSISTED_RUNS = 24;

function loadPersistedQueueViewFilter() {
  try {
    const raw = String(window?.localStorage?.getItem(QUEUE_VIEW_FILTER_STORAGE_KEY) || '').toLowerCase();
    return raw === 'history' ? 'history' : 'active';
  } catch (_error) {
    return 'active';
  }
}

function persistQueueViewFilter(value) {
  try {
    window?.localStorage?.setItem(
      QUEUE_VIEW_FILTER_STORAGE_KEY,
      value === 'history' ? 'history' : 'active'
    );
  } catch (_error) {
    // Best-effort only.
  }
}

function safeReadJsonStorage(key, fallbackValue) {
  try {
    const raw = window?.localStorage?.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch (_error) {
    return fallbackValue;
  }
}

function safeWriteJsonStorage(key, value) {
  try {
    window?.localStorage?.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Best-effort only.
  }
}

let currentLeague = null;
let leagues = [];
let lastScan = null;
let lastComparison = null;
let scanHistory = [];
let selectedTabIndex = null;
let selectedItems = new Set();
let renderedItems = [];
let lastItemSelectionIndex = null;
let scanTabSelection = new Set();
let retryStatusTimer = null;
let breakdownView = 'divines'; // 'divines' or 'percentage'
let scanMenuOpen = false;
let sidebarSelection = new Set();
let lastSidebarIndex = null;
let queueViewActive = false;
let lastPricingUpdateTs = 0;
let queueViewLoading = false;
let queueViewFilter = loadPersistedQueueViewFilter();
let scanHistoryClearedAt = 0;
let latestTaskQueueData = { pricing: [], scans: [] };
let valueDisplayCurrency = 'chaos';
let availableCharacters = [];
let availableStashTabs = [];
let serverPricingEnabled = false;
let autoQueueUnpriced = false;
let hideLargeTabScanWarning = false;
let scanInFlight = false;
let pendingScanResumeTimer = null;
let pendingScanResumeInFlight = false;
let sessionSyncActivated = false;
const DEFAULT_SCAN_BATCH_SIZE = 8;
const ENABLE_AUTO_SCAN_RESUME = true;
let stashTabSortState = { key: 'value', direction: 'desc' };
let itemsSortState = { key: 'total', direction: 'desc' };
const ALL_STASH_TAB_LABEL = 'All';
const DEFAULT_PRICING_LISTING_MODE = 'instant_buyout';
const PRICING_LISTING_MODE_ALIASES = {
  instant_buyout_and_in_person: 'instant_buyout_and_in_person',
  available: 'instant_buyout_and_in_person',
  instant_buyout: 'instant_buyout',
  securable: 'instant_buyout',
  in_person_online_in_league: 'in_person_online_in_league',
  onlineleague: 'in_person_online_in_league',
  in_person_online: 'in_person_online',
  online: 'in_person_online',
  any: 'any',
};
let preferredPricingListingMode = DEFAULT_PRICING_LISTING_MODE;
let pricingSelectionConfig = null;
let pricingSelectionConfigFetchedAt = 0;
const PRICING_CONFIG_REFRESH_MS = 30 * 60 * 1000;
const DEFAULT_PRICING_MAX_SELECTED_MODS = 4;
const LOCAL_FALLBACK_SELECTION_RULES = [
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?) to maximum Life/i, minValue: 40, score: 10 },
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?)% to all Elemental Resistances/i, minValue: 8, score: 10 },
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?)% to (Fire|Cold|Lightning) Resistance/i, minValue: 28, score: 9 },
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?)% to (?:Global )?Critical Strike Multiplier/i, minValue: 15, score: 9 },
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?)% to Damage over Time Multiplier/i, minValue: 10, score: 9 },
  { type: 'explicit', pattern: /(\d+(?:\.\d+)?)% increased (?:[\w ]+ )?Damage/i, minValue: 20, score: 8 },
  { type: 'explicit', pattern: /Adds (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?) [\w ]*Damage/i, minValue: 20, score: 8 },
  { type: 'explicit', pattern: /(\d+(?:\.\d+)?)% increased Attack Speed/i, minValue: 5, score: 7 },
  { type: 'explicit', pattern: /(\d+(?:\.\d+)?)% increased Cast Speed/i, minValue: 5, score: 7 },
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?) to maximum Energy Shield/i, minValue: 40, score: 6 },
  { type: 'explicit', pattern: /\+(\d+(?:\.\d+)?) to (Strength|Dexterity|Intelligence)/i, minValue: 40, score: 5 },
];
const PRICING_PSEUDO_AGGREGATES = [
  { statId: 'pseudo.pseudo_total_elemental_resistance', label: 'total Elemental Resistance', unit: '%' },
  { statId: 'pseudo.pseudo_total_chaos_resistance', label: 'total Chaos Resistance', unit: '%' },
  { statId: 'pseudo.pseudo_total_life', label: 'total maximum Life', unit: '' },
  { statId: 'pseudo.pseudo_total_mana', label: 'total maximum Mana', unit: '' },
  { statId: 'pseudo.pseudo_total_energy_shield', label: 'total maximum Energy Shield', unit: '' },
];
const PRICING_PSEUDO_AGGREGATE_MAP = new Map(
  PRICING_PSEUDO_AGGREGATES.map((entry) => [entry.statId, entry])
);

function getOperationalLeague(_league = null) {
  return NETWORTH_ACTIVE_LEAGUE;
}

function normalizePricingListingMode(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PRICING_LISTING_MODE_ALIASES[normalized] || DEFAULT_PRICING_LISTING_MODE;
}

function setPreferredPricingListingMode(value) {
  const normalized = normalizePricingListingMode(value);
  preferredPricingListingMode = normalized;
  return normalized;
}

// Currency icon mapping - prefer local assets
function getCurrencyIconPath(currency) {
  // Try local assets first (relative to the renderer folder).
  const localPath = `../assets/currency/${currency.toLowerCase()}.png`;
  // Keep CDN fallbacks available if a local asset is missing.
  const cdnUrls = {
    'chaos': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
    'divine': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
    'exalted': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png',
    'mirror': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MX1d/7111e35254/CurrencyDuplicate.png',
    'alchemy': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlVG9SYXJlIiwic2NhbGUiOjF9XQ/9817b9b70c/CurrencyUpgradeToRare.png',
    'alteration': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxNYWdpYyIsInNjYWxlIjoxfV0/88e4f67b0a/CurrencyRerollMagic.png',
    'chromatic': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRDb2xvdXJzIiwic2NhbGUiOjF9XQ/c7ece1f0b0/CurrencyRerollSocketColours.png',
    'jewellers': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXROdW1iZXJzIiwic2NhbGUiOjF9XQ/275c8d09d3/CurrencyRerollSocketNumbers.png',
    'fusing': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRMaW5rcyIsInNjYWxlIjoxfV0/ee65d31e75/CurrencyRerollSocketLinks.png',
    'vaal': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lWYWFsIiwic2NhbGUiOjF9XQ/2fb6e0089f/CurrencyVaal.png',
    'regal': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlTWFnaWNUb1JhcmUiLCJzY2FsZSI6MX1d/c6b68437cd/CurrencyUpgradeMagicToRare.png',
    'regret': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lQYXNzaXZlUmVmdW5kIiwic2NhbGUiOjF9XQ/7e3b8c2683/CurrencyPassiveRefund.png',
    'scour': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lDb252ZXJ0VG9Ob3JtYWwiLCJzY2FsZSI6MX1d/e34e6c8ba5/CurrencyConvertToNormal.png',
    'blessed': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lJbXByaW50Iiwic2NhbGUiOjF9XQ/afd4b7b7f5/CurrencyImprint.png',
    'gcp': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lHZW1RdWFsaXR5Iiwic2NhbGUiOjF9XQ/5eb318f69f/CurrencyGemQuality.png'
  };
  return localPath; // The DOM img tag handles fallback via onerror.
}

const CURRENCY_ICONS = {
  'chaos': '../assets/currency/chaos.png',
  'divine': '../assets/currency/divine.png',
  'exalted': '../assets/currency/exalted.png',
  'mirror': '../assets/currency/mirror.png',
  'alchemy': '../assets/currency/alchemy.png',
  'alteration': '../assets/currency/alteration.png',
  'chromatic': '../assets/currency/chromatic.png',
  'jewellers': '../assets/currency/jewellers.png',
  'fusing': '../assets/currency/fusing.png',
  'vaal': '../assets/currency/vaal.png',
  'regal': '../assets/currency/regal.png',
  'regret': '../assets/currency/regret.png',
  'scour': '../assets/currency/scour.png',
  'blessed': '../assets/currency/blessed.png',
  'gcp': '../assets/currency/gcp.png',
  'chance': 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyUpgradeRandomly.png' // use CDN to avoid missing local asset
};

Object.entries(MIRAGE_STACKABLE_CURRENCY_BY_KEY).forEach(([key, entry]) => {
  if (!key || !entry?.iconUrl || CURRENCY_ICONS[key]) return;
  CURRENCY_ICONS[key] = entry.iconUrl;
});

// Format currency value
function formatCurrency(value, currency = 'chaos', showIcon = false) {
  const formatted = value >= 1000 
    ? `${(value / 1000).toFixed(2)}K` 
    : value.toFixed(2);
  
  if (showIcon && CURRENCY_ICONS[currency]) {
    return `${formatted} <img src="${CURRENCY_ICONS[currency]}" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 2px;" alt="${currency}"/>`;
  }
  
  return `${formatted}${currency === 'chaos' ? 'c' : currency === 'divine' ? 'd' : currency}`;
}

function formatChaosValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const sign = numeric < 0 ? '-' : '';
  const absolute = Math.abs(numeric);
  if (absolute >= 1) {
    const rounded = Math.round(absolute * 100) / 100;
    return `${sign}${rounded}c`;
  }
  if (absolute > 0) {
    const precision = absolute >= 0.01 ? 3 : 4;
    const precise = absolute.toFixed(precision);
    const rounded = Number(precise);
    if (rounded <= 0) {
      const minDisplay = (1 / (10 ** precision)).toFixed(precision);
      return `${sign}<${minDisplay}c`;
    }
    const compact = precise.replace(/0+$/, '').replace(/\.$/, '');
    return `${sign}${compact}c`;
  }
  return `${sign}0c`;
}

function formatSignedChaosValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0c';
  if (numeric === 0) return '0c';
  const sign = numeric > 0 ? '+' : '-';
  return `${sign}${formatChaosValue(Math.abs(numeric)).replace('-', '')}`;
}

function normalizeValueDisplayCurrency(value) {
  return String(value || '').trim().toLowerCase() === 'divine' ? 'divine' : 'chaos';
}

function formatDivineValue(value, { signed = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return signed ? '0d' : '-';
  if (numeric === 0) return '0d';
  const sign = numeric < 0 ? '-' : (signed ? '+' : '');
  const absolute = Math.abs(numeric);
  const precision = absolute >= 1 ? 2 : 3;
  const compact = absolute.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '');
  return `${sign}${compact}d`;
}

function formatDisplayValueFromChaos(chaosValue, { signed = false } = {}) {
  const numericChaos = Number(chaosValue);
  if (!Number.isFinite(numericChaos)) return signed ? '0c' : '-';
  if (valueDisplayCurrency === 'divine') {
    return formatDivineValue(numericChaos / getDivineRate(), { signed });
  }
  return signed ? formatSignedChaosValue(numericChaos) : formatChaosValue(numericChaos);
}

function updateValueColumnHeaders() {
  const suffix = valueDisplayCurrency === 'divine' ? ' (d)' : ' (c)';
  const priceHeader = document.querySelector('.items-table th.price-col');
  const totalHeader = document.querySelector('.items-table th.total-col');
  if (priceHeader) priceHeader.textContent = `Price${suffix}`;
  if (totalHeader) totalHeader.textContent = `Total${suffix}`;
}

function updateValueModeButtons() {
  const chaosBtn = document.getElementById('displayChaosBtn');
  const divineBtn = document.getElementById('displayDivineBtn');
  if (chaosBtn) chaosBtn.classList.toggle('active', valueDisplayCurrency === 'chaos');
  if (divineBtn) divineBtn.classList.toggle('active', valueDisplayCurrency === 'divine');
}

function setValueDisplayCurrency(value, { refresh = true } = {}) {
  valueDisplayCurrency = normalizeValueDisplayCurrency(value);
  updateValueModeButtons();
  updateValueColumnHeaders();
  if (refresh) {
    updateAll();
    if (queueViewActive) {
      loadQueueViewInternal({ silent: true });
    }
  }
}

// Get currency key from item name
function getCurrencyKeyFromItemName(itemName) {
  const mapping = {
    'Divine Orb': 'divine',
    'Orb of Alteration': 'alteration',
    'Orb of Scouring': 'scour',
    'Gemcutter\'s Prism': 'gcp',
    'Orb of Fusing': 'fusing',
    'Vaal Orb': 'vaal',
    'Orb of Chance': 'chance',
    'Jeweller\'s Orb': 'jewellers',
    'Orb of Alchemy': 'alchemy',
    'Chromatic Orb': 'chromatic',
    'Chaos Orb': 'chaos',
    'Exalted Orb': 'exalted',
    'Mirror of Kalandra': 'mirror',
    'Regal Orb': 'regal',
    'Orb of Regret': 'regret',
    'Blessed Orb': 'blessed'
  };
  if (mapping[itemName]) return mapping[itemName];
  const direct = MIRAGE_STACKABLE_CURRENCY_BY_NAME[itemName];
  if (direct?.key) return direct.key;
  const normalized = normalizeMirageStackableCurrencyKey(itemName);
  if (normalized && MIRAGE_STACKABLE_CURRENCY_BY_KEY[normalized]) return normalized;
  return null;
}

// Get CDN fallback URL for an item
function getCdnFallbackUrl(itemName) {
  const cdnUrls = {
    'Divine Orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
    'Orb of Alteration': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxNYWdpYyIsInNjYWxlIjoxfV0/88e4f67b0a/CurrencyRerollMagic.png',
    'Orb of Scouring': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lDb252ZXJ0VG9Ob3JtYWwiLCJzY2FsZSI6MX1d/e34e6c8ba5/CurrencyConvertToNormal.png',
    'Gemcutter\'s Prism': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lHZW1RdWFsaXR5Iiwic2NhbGUiOjF9XQ/5eb318f69f/CurrencyGemQuality.png',
    'Orb of Fusing': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRMaW5rcyIsInNjYWxlIjoxfV0/ee65d31e75/CurrencyRerollSocketLinks.png',
    'Vaal Orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lWYWFsIiwic2NhbGUiOjF9XQ/2fb6e0089f/CurrencyVaal.png',
    'Orb of Chance': 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyUpgradeRandomly.png',
    'Jeweller\'s Orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXROdW1iZXJzIiwic2NhbGUiOjF9XQ/275c8d09d3/CurrencyRerollSocketNumbers.png',
    'Orb of Alchemy': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlVG9SYXJlIiwic2NhbGUiOjF9XQ/9817b9b70c/CurrencyUpgradeToRare.png',
    'Chromatic Orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRDb2xvdXJzIiwic2NhbGUiOjF9XQ/c7ece1f0b0/CurrencyRerollSocketColours.png'
  };
  const direct = MIRAGE_STACKABLE_CURRENCY_BY_NAME[itemName];
  if (direct?.iconUrl) return direct.iconUrl;
  return cdnUrls[itemName] || '';
}

// Get icon HTML for an item
function getItemIconHtml(item) {
  if (!item) return '?';

  const itemName = item.name || item.typeLine || 'Unknown Item';
  
  // ALTIJD eerst proberen currency key te vinden (betrouwbaarder dan item.icon)
  const currencyKey = getCurrencyKeyFromItemName(itemName);
  if (currencyKey && CURRENCY_ICONS[currencyKey]) {
    const cdnFallback = getCdnFallbackUrl(itemName);
    const iconPath = CURRENCY_ICONS[currencyKey];
    return `<img src="${escapeHtml(iconPath)}" alt="${escapeHtml(itemName)}" onerror="this.onerror=null; this.src='${escapeHtml(cdnFallback)}'; this.onerror=function(){this.parentElement.innerHTML='?';}">`;
  }
  
  // Als geen currency key match, probeer item.icon
  if (item.icon) {
    const cdnFallback = getCdnFallbackUrl(itemName);
    return `<img src="${escapeHtml(item.icon)}" alt="${escapeHtml(itemName)}" onerror="this.onerror=null; this.src='${escapeHtml(cdnFallback)}'; this.onerror=function(){this.parentElement.innerHTML='?';}">`;
  }
  
  // Fallback naar item icon path
  const safeName = itemName.replace(/[^a-zA-Z0-9]/g, '_');
  const itemIconPath = `../assets/items/${safeName}.png`;
  const cdnFallback = getCdnFallbackUrl(itemName);
  return `<img src="${escapeHtml(itemIconPath)}" alt="${escapeHtml(itemName)}" onerror="this.onerror=null; this.src='${escapeHtml(cdnFallback)}'; this.onerror=function(){this.parentElement.innerHTML='?';}">`;
}

function getItemDisplayName(item) {
  return item?.name || item?.typeLine || item?.baseType || 'Unknown Item';
}

function getPropertyValue(item, propName) {
  if (!item || !Array.isArray(item.properties)) return null;
  const prop = item.properties.find(p => p.name === propName);
  if (!prop || !Array.isArray(prop.values) || prop.values.length === 0) return null;
  return prop.values[0][0]; // value text
}

function parseRangeAverage(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  const parts = rangeStr.split('-').map(n => parseFloat(n.replace(/[^0-9.]/g, '')));
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return (parts[0] + parts[1]) / 2;
  }
  return null;
}

function formatSockets(item) {
  if (!Array.isArray(item?.sockets) || item.sockets.length === 0) return '';
  const groups = {};
  const mapColor = (c) => {
    const v = (c || '').toUpperCase();
    if (v === 'S' || v === 'R') return 'R';
    if (v === 'D' || v === 'G') return 'G';
    if (v === 'I' || v === 'B') return 'B';
    if (v === 'W') return 'W';
    return '?';
  };
  item.sockets.forEach(s => {
    const key = s.group ?? 0;
    groups[key] = groups[key] || [];
    groups[key].push(mapColor(s.attr || s.sColour || s.colour));
  });
  return Object.values(groups).map(g => g.join('')).join(' | ');
}

function buildItemTooltip(item) {
  if (!item) return '';
  const rarityMap = {
    0: 'Normal',
    1: 'Magic',
    2: 'Rare',
    3: 'Unique',
    4: 'Gem',
    5: 'Currency',
    6: 'Divination Card',
    7: 'Quest',
    8: 'Prophecy',
    9: 'Relic'
  };

  const name = getItemDisplayName(item);
  const type = item.typeLine || item.baseType || '';
  const rarity = rarityMap[item.frameType] || 'Item';

  const phys = getPropertyValue(item, 'Physical Damage');
  const elem = getPropertyValue(item, 'Elemental Damage');
  const chaos = getPropertyValue(item, 'Chaos Damage');
  const crit = getPropertyValue(item, 'Critical Strike Chance');
  const aps = getPropertyValue(item, 'Attacks per Second');
  const quality = getPropertyValue(item, 'Quality') || (item.quality ? `+${item.quality}%` : null);
  const itemLevel = item.ilvl || item.itemLevel || null;
  const reqs = getPropertyValue(item, 'Requirements');
  const armourVal = getPropertyValue(item, 'Armour');
  const evasionVal = getPropertyValue(item, 'Evasion Rating');
  const esVal = getPropertyValue(item, 'Energy Shield');
  const socketsStr = formatSockets(item);

  let dpsLine = null;
  const avgPhys = parseRangeAverage(phys);
  const apsNum = aps ? parseFloat(String(aps).replace(/[^0-9.]/g, '')) : null;
  if (avgPhys !== null && apsNum) {
    const physDps = Math.round(avgPhys * apsNum * 10) / 10;
    dpsLine = `Physical DPS: ${physDps}`;
  }

  const influences = [];
  if (item.shaper) influences.push('Shaper');
  if (item.elder) influences.push('Elder');
  if (item.crusader) influences.push('Crusader');
  if (item.hunter) influences.push('Hunter');
  if (item.redeemer) influences.push('Redeemer');
  if (item.warlord) influences.push('Warlord');
  if (item.fractured) influences.push('Fractured');

  const addMods = (label, mods) =>
    Array.isArray(mods) && mods.length
      ? `<div class="tt-section-title">${label}</div><div class="tt-mods">${mods.map(m => `<div>${escapeHtml(m)}</div>`).join('')}</div>`
      : '';

  const socketsBlock = socketsStr
    ? `<div class="tt-row">Sockets: <span class="tt-muted">${escapeHtml(socketsStr)}</span></div>`
    : '';
  const stackBlock = item.stackSize
    ? `<div class="tt-row">Stack: <span class="tt-muted">${item.stackSize}${item.maxStackSize ? '/' + item.maxStackSize : ''}</span></div>`
    : '';

  const influencesBlock = influences.length
    ? `<div class="tt-row">Influences: <span class="tt-muted">${escapeHtml(influences.join(', '))}</span></div>`
    : '';

  const propertiesBlock = `
    ${quality ? `<div class="tt-row">Quality: <span class="tt-muted">${escapeHtml(String(quality))}</span></div>` : ''}
    ${phys ? `<div class="tt-row">Physical Damage: <span class="tt-muted">${escapeHtml(String(phys))}</span></div>` : ''}
    ${elem ? `<div class="tt-row">Elemental Damage: <span class="tt-muted">${escapeHtml(String(elem))}</span></div>` : ''}
    ${chaos ? `<div class="tt-row">Chaos Damage: <span class="tt-muted">${escapeHtml(String(chaos))}</span></div>` : ''}
    ${crit ? `<div class="tt-row">Crit Chance: <span class="tt-muted">${escapeHtml(String(crit))}</span></div>` : ''}
    ${aps ? `<div class="tt-row">Attacks/sec: <span class="tt-muted">${escapeHtml(String(aps))}</span></div>` : ''}
    ${dpsLine ? `<div class="tt-row">DPS: <span class="tt-muted">${escapeHtml(dpsLine)}</span></div>` : ''}
    ${armourVal ? `<div class="tt-row">Armour: <span class="tt-muted">${escapeHtml(String(armourVal))}</span></div>` : ''}
    ${evasionVal ? `<div class="tt-row">Evasion: <span class="tt-muted">${escapeHtml(String(evasionVal))}</span></div>` : ''}
    ${esVal ? `<div class="tt-row">Energy Shield: <span class="tt-muted">${escapeHtml(String(esVal))}</span></div>` : ''}
    ${itemLevel ? `<div class="tt-row">Item Level: <span class="tt-muted">${itemLevel}</span></div>` : ''}
    ${reqs ? `<div class="tt-row">Requires: <span class="tt-muted">${escapeHtml(String(reqs))}</span></div>` : ''}
    ${socketsBlock}
    ${stackBlock}
    ${influencesBlock}
  `;

  const modsBlock = `
    ${addMods('Implicit', item.implicitMods)}
    ${addMods('Explicit', item.explicitMods)}
    ${addMods('Enchant', item.enchantMods)}
    ${addMods('Crafted', item.craftedMods)}
    ${addMods('Fractured', item.fracturedMods)}
    ${addMods('Utility', item.utilityMods)}
    ${addMods('Veiled', item.veiledMods)}
    ${addMods('Scourge', item.scourgeMods)}
    ${addMods('Eldritch', item.eldritchMods)}
    ${addMods('Crucible', item.crucibleMods)}
    ${addMods('Delve', item.delveMods)}
    ${addMods('Synth', item.synthesisedMods)}
    ${addMods('Pseudo', item.pseudoMods)}
  `;

  const tooltipRawValue = Number(item?._networth?.value);
  const tooltipCurrency = String(item?._networth?.currency || 'chaos').toLowerCase();
  const tooltipRate = getCurrencyRate(tooltipCurrency);
  const tooltipChaosValue = Number.isFinite(tooltipRawValue) && Number.isFinite(tooltipRate)
    ? tooltipRawValue * tooltipRate
    : null;
  const valueLine = tooltipChaosValue !== null
    ? `<div class="tt-row tt-value">Value: <span class="tt-muted">${escapeHtml(formatDisplayValueFromChaos(tooltipChaosValue))}</span></div>`
    : '';

  const tabLine = item._tabName ? `<div class="tt-row tt-tab">Tab: <span class="tt-muted">${escapeHtml(item._tabName)}</span></div>` : '';
  const noteLine = item.note ? `<div class="tt-row tt-note">${escapeHtml(item.note)}</div>` : '';

  return `
    <div class="tt-header">
      <div class="tt-name">${escapeHtml(name)}</div>
      ${type && type !== name ? `<div class="tt-type">${escapeHtml(type)}</div>` : ''}
      <div class="tt-rarity">${escapeHtml(rarity)}</div>
    </div>
    <div class="tt-body">
      ${propertiesBlock}
      ${modsBlock}
      ${valueLine}
      ${tabLine}
      ${noteLine}
    </div>
  `;
}

// Item tooltip element (follows mouse, does not affect layout)
let hoverTooltipEl = null;

function getHoverTooltipEl() {
  if (hoverTooltipEl) return hoverTooltipEl;
  hoverTooltipEl = document.createElement('div');
  hoverTooltipEl.className = 'item-tooltip';
  hoverTooltipEl.style.display = 'none';
  document.body.appendChild(hoverTooltipEl);
  return hoverTooltipEl;
}

function showHoverTooltip(text, event) {
  if (!text) return;
  const el = getHoverTooltipEl();
  el.innerHTML = text;
  el.style.display = 'block';
  positionHoverTooltip(event);
}

function hideHoverTooltip() {
  if (!hoverTooltipEl) return;
  hoverTooltipEl.style.display = 'none';
}

function positionHoverTooltip(event) {
  if (!hoverTooltipEl || hoverTooltipEl.style.display === 'none') return;
  const offsetX = 16;
  const offsetY = 12;
  let x = event.clientX + offsetX;
  let y = event.clientY - offsetY;
  const rect = hoverTooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (x + rect.width > vw - 8) {
    x = vw - rect.width - 8;
  }
  if (y + rect.height > vh - 8) {
    y = vh - rect.height - 8;
  }
  if (y < 0) y = 0;
  hoverTooltipEl.style.left = `${x}px`;
  hoverTooltipEl.style.top = `${y}px`;
}

// Format timestamp
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / 86400000);
  
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}

// Load leagues
async function loadLeagues() {
  console.log('[NETWORTH-OVERLAY] loadLeagues() started');
  try {
    console.log('[NETWORTH-OVERLAY] Calling window.networthOverlayAPI.getLeagues()...');
    leagues = await window.networthOverlayAPI.getLeagues();
    leagues = Array.isArray(leagues)
      ? leagues.filter((entry) => String(entry?.id || '').trim() === NETWORTH_ACTIVE_LEAGUE)
      : [];
    if (leagues.length === 0) {
      leagues = [{ id: NETWORTH_ACTIVE_LEAGUE, realm: 'pc' }];
    }
    console.log('[NETWORTH-OVERLAY] Received leagues:', leagues);

    const select = document.getElementById('leagueSelect');
    if (!select) {
      console.error('[NETWORTH-OVERLAY] leagueSelect element not found in DOM!');
      return;
    }

    select.innerHTML = '<option value="">Select League</option>';

    for (const league of leagues) {
      const option = document.createElement('option');
      option.value = league.id;
      option.textContent = league.id;
      select.appendChild(option);
    }

    console.log('[NETWORTH-OVERLAY] Populated league dropdown with', leagues.length, 'leagues');

    const defaultLeague = getOperationalLeague();

    if (defaultLeague) {
      select.value = defaultLeague;
      currentLeague = defaultLeague;
      console.log('[NETWORTH-OVERLAY] Set current league to:', currentLeague);
      await window.networthOverlayAPI.setLastLeague(currentLeague, leagues.find(l => l.id === currentLeague)?.realm || 'pc');
      console.log('[NETWORTH-OVERLAY] Loading cached scan for selected league...');
      await loadLastScan(currentLeague);
    } else {
      console.warn('[NETWORTH-OVERLAY] No leagues available');
    }
  } catch (err) {
    console.error('[NETWORTH-OVERLAY] Failed to load leagues:', err);
    console.error('[NETWORTH-OVERLAY] Error stack:', err.stack);

    // Fallback: try to use last scan league so UI can continue
    const scanData = await window.networthOverlayAPI.getLastScan(getOperationalLeague());
    if (scanData) {
      leagues = [{ id: NETWORTH_ACTIVE_LEAGUE, realm: 'pc' }];
      const select = document.getElementById('leagueSelect');
      if (select) {
        select.innerHTML = '';
        const option = document.createElement('option');
        option.value = NETWORTH_ACTIVE_LEAGUE;
        option.textContent = NETWORTH_ACTIVE_LEAGUE;
        select.appendChild(option);
        select.value = NETWORTH_ACTIVE_LEAGUE;
      }
      currentLeague = NETWORTH_ACTIVE_LEAGUE;
      console.warn('[NETWORTH-OVERLAY] Using fallback league from last scan:', currentLeague);
      await loadLastScan(NETWORTH_ACTIVE_LEAGUE);
    }
  }
}

// Load last scan
async function loadLastScan(targetLeague = currentLeague || NETWORTH_ACTIVE_LEAGUE) {
  console.log('[NETWORTH-OVERLAY] loadLastScan() started', targetLeague);
  try {
    const scanData = await window.networthOverlayAPI.getLastScan(getOperationalLeague(targetLeague));
    console.log('[NETWORTH-OVERLAY] Received scan data:', scanData ? 'YES' : 'NO', scanData);

    if (scanData) {
      lastScan = scanData;
      lastComparison = scanData.comparison || null;
      currentLeague = getOperationalLeague(scanData.league || targetLeague || currentLeague);
      resetScanTabSelectionFromLastScan();
      console.log('[NETWORTH-OVERLAY] Last scan loaded. Items:', lastScan?.items?.length || 0);
      console.log('[NETWORTH-OVERLAY] Comparison available:', !!lastComparison);
      updateAll();
      await loadScanHistory();
      startRetryStatusTimer();
      schedulePendingScanResume();
    } else {
      console.warn('[NETWORTH-OVERLAY] No scan data available - showing empty state');
      lastScan = null;
      lastComparison = null;
      scanTabSelection.clear();
      if (retryStatusTimer) {
        clearInterval(retryStatusTimer);
        retryStatusTimer = null;
      }
      clearPendingScanResumeTimer();
      updateSyncStatus();
      updateStashTabsSidebar();
    }
  } catch (err) {
    console.error('[NETWORTH-OVERLAY] Failed to load last scan:', err);
    console.error('[NETWORTH-OVERLAY] Error stack:', err.stack);
  }
}

async function preloadLeagueDataAndAutoScan() {
  currentLeague = getOperationalLeague(currentLeague);

  const selectedLeague = leagues.find((entry) => entry.id === currentLeague);
  const realm = selectedLeague?.realm || 'pc';
  let autoSyncOnOpen = false;
  try {
    const preferences = await window.networthOverlayAPI.getPreferences();
    autoSyncOnOpen = preferences?.autoSyncOnOpen === true;
    serverPricingEnabled = preferences?.serverPricingEnabled === true;
    autoQueueUnpriced = preferences?.autoQueueUnpriced === true;
    hideLargeTabScanWarning = preferences?.hideLargeTabScanWarning === true;
    setPreferredPricingListingMode(preferences?.pricingListingMode || DEFAULT_PRICING_LISTING_MODE);
    syncAutoQueueToggleUi();
  } catch (error) {
    autoSyncOnOpen = false;
    serverPricingEnabled = false;
    autoQueueUnpriced = false;
    hideLargeTabScanWarning = false;
    setPreferredPricingListingMode(DEFAULT_PRICING_LISTING_MODE);
    syncAutoQueueToggleUi();
    console.warn('[NETWORTH-OVERLAY] Failed to load networth preferences:', error);
  }

  const shouldRefreshPricingConfig =
    !pricingSelectionConfig ||
    (Date.now() - pricingSelectionConfigFetchedAt) > PRICING_CONFIG_REFRESH_MS;
  if (shouldRefreshPricingConfig && window.networthOverlayAPI?.getPricingConfig) {
    try {
      const configPayload = await window.networthOverlayAPI.getPricingConfig();
      if (configPayload && typeof configPayload === 'object') {
        pricingSelectionConfig = configPayload;
        pricingSelectionConfigFetchedAt = Date.now();
        console.log('[NETWORTH-OVERLAY] Pricing selection config loaded', {
          version: String(configPayload.version || 'unknown'),
        });
      }
    } catch (error) {
      console.warn('[NETWORTH-OVERLAY] Failed to load pricing selection config:', error);
    }
  }

  try {
    const stashData = await window.networthOverlayAPI.getStashTabs({ realm, league: currentLeague });
    availableStashTabs = Array.isArray(stashData?.tabs) ? stashData.tabs : [];
    renderScanMenuList();
    updateStashTabsSidebar();
    updateSyncStatus();
  } catch (error) {
    availableStashTabs = [];
    console.warn('[NETWORTH-OVERLAY] Failed to preload stash tabs:', error);
  }

  if (!autoSyncOnOpen) {
    console.log('[NETWORTH-OVERLAY] Auto sync on open is disabled');
    return;
  }
  console.warn('[NETWORTH-OVERLAY] Auto sync on open is enabled in settings but disabled at startup to prevent rate limiting');
}

// Update alles
function updateAll() {
  updateWealth();
  updateBreakdown();
  updateStashTabsSidebar();
  updateItemsTable();
  updateSyncStatus();
  updateSelectedTotal();
  updateRunActionButton();
  updateChart();
  renderViewTabs(); // Render view tabs including "+ Track Run" tab

  // Ensure timer visibility matches run state
  if (trackRunState.isRunning) {
    showCountdownDock();
  } else {
    hideCountdownDock();
  }
}

// Update wealth section
function updateWealth() {
  const scopedViewData = buildScopedViewData(getViewData());
  if (!scopedViewData) {
    document.getElementById('wealthTotal').textContent = '-';
    document.getElementById('wealthDelta').textContent = '';
    return;
  }

  const converted = scopedViewData.converted || { chaos: 0, divine: 0 };
  const hasScopedFilter = Number.isFinite(selectedTabIndex) || Boolean(getActiveSearchTerm());
  const totalChaos = Number.isFinite(Number(converted.chaos))
    ? Number(converted.chaos)
    : (Number(converted.divine || 0) * getDivineRate());
  document.getElementById('wealthTotal').textContent = formatDisplayValueFromChaos(totalChaos);
  
  // Update delta als comparison beschikbaar is
  const deltaEl = document.getElementById('wealthDelta');
  if (!hasScopedFilter && lastComparison && lastComparison.hasPrevious) {
    const deltaChaos = lastComparison.delta?.chaos || 0;
    deltaEl.textContent = formatDisplayValueFromChaos(deltaChaos, { signed: true });
    deltaEl.className = deltaChaos >= 0 ? 'wealth-delta positive' : 'wealth-delta negative';
  } else {
    deltaEl.textContent = '';
    deltaEl.className = 'wealth-delta';
  }
}

// Update breakdown
function updateBreakdown() {
  const container = document.getElementById('breakdownList');
  container.innerHTML = '';

  const scopedViewData = buildScopedViewData(getViewData());
  if (!scopedViewData || !scopedViewData.netWorth) {
    container.innerHTML = '<div class="breakdown-item">No data</div>';
    return;
  }

  const netWorth = scopedViewData.netWorth;
  const converted = scopedViewData.converted || { chaos: 0, divine: 0 };
  const totalChaos = Number.isFinite(Number(converted.chaos))
    ? Number(converted.chaos)
    : (Number(converted.divine || 0) * getDivineRate());
  
  // Sorteer currencies op waarde (hoogste eerst)
  const currencies = Object.keys(netWorth)
    .map(currency => ({
      currency,
      value: netWorth[currency],
      icon: CURRENCY_ICONS[currency.toLowerCase()] || null
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => {
      // Converteer naar chaos voor vergelijking
      const rateA = getCurrencyRate(a.currency);
      const rateB = getCurrencyRate(b.currency);
      return (b.value * rateB) - (a.value * rateA);
    });
  
  for (const curr of currencies.slice(0, 15)) { // Top 15 currencies
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    
    const chaosValue = curr.value * getCurrencyRate(curr.currency);
    
    let valueText = '';
    if (breakdownView === 'divines') {
      valueText = formatDisplayValueFromChaos(chaosValue);
    } else {
      const percentage = totalChaos > 0 ? ((chaosValue / totalChaos) * 100).toFixed(1) : 0;
      valueText = `${percentage}%`;
    }
    
    const iconPath = CURRENCY_ICONS[curr.currency.toLowerCase()] || null;
    const iconHtml = iconPath 
      ? `<img src="${escapeHtml(iconPath)}" alt="${escapeHtml(curr.currency)}" onerror="this.onerror=null; this.src='https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png'">`
      : '<div style="width: 24px; height: 24px; background: rgba(139,104,56,0.3); border-radius: 3px;"></div>';
    
    item.innerHTML = `
      <div class="breakdown-icon">${iconHtml}</div>
      <div class="breakdown-name">${escapeHtml(curr.currency)}</div>
      <div class="breakdown-value">${valueText}</div>
    `;
    
    container.appendChild(item);
  }
}

function normalizeRateLookupKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRateLookupCandidates(value) {
  const normalized = normalizeRateLookupKey(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.startsWith('orb of ')) variants.add(normalized.slice(7));
  if (normalized.endsWith(' orb')) variants.add(normalized.slice(0, -4));
  if (normalized.startsWith('scroll of ')) variants.add(normalized.slice(10));
  if (normalized.endsWith(' scroll')) variants.add(normalized.slice(0, -7));

  const candidates = new Set();
  for (const variant of variants) {
    const compact = normalizeRateLookupKey(variant);
    if (!compact) continue;
    candidates.add(compact);
    candidates.add(compact.replace(/\s+/g, '-'));
    candidates.add(compact.replace(/-/g, ' '));
    candidates.add(compact.replace(/[\s-]+/g, ''));
  }
  return Array.from(candidates).filter(Boolean);
}

// Get currency exchange rate
function getCurrencyRate(currency) {
  if (!currency) return null;
  const rates =
    (lastScan && lastScan.currencyRates) ||
    {
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
      gcp: 0.5
    };
  const lookup = buildRateLookupCandidates(currency);
  for (const key of lookup) {
    if (key === 'chaos') return 1;
    const value = Number(rates[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function getDivineRate() {
  const rate = getCurrencyRate('divine');
  return Number.isFinite(rate) && rate > 0 ? rate : 200;
}

function isCurrencyExchangeValuedItem(item) {
  const source = String(item?._networth?.source || '').trim().toLowerCase();
  return source === 'currency_exchange';
}

function isAuctionHouseCandidateItem(item) {
  if (!item || typeof item !== 'object') return false;
  const frameType = Number(item?.frameType ?? item?.frame_type);
  if (isCurrencyExchangeValuedItem(item) && frameType !== 6) return true;
  if (Number.isFinite(frameType) && frameType === 5) return true;
  return false;
}

function getActiveSearchTerm() {
  const input = document.getElementById('searchInput');
  return (input?.value || '').trim().toLowerCase();
}

function applySearchToItems(items, searchTerm) {
  if (!searchTerm) return Array.isArray(items) ? items.slice() : [];

  const source = Array.isArray(items) ? items : [];
  try {
    const regex = new RegExp(searchTerm, 'i');
    return source.filter((item) => regex.test(item?.name || ''));
  } catch {
    return source.filter((item) => String(item?.name || '').toLowerCase().includes(searchTerm));
  }
}

function applyScopeToItems(items, scope = {}) {
  let output = Array.isArray(items) ? items.slice() : [];

  const tabIndex = Number.isFinite(scope?.tabIndex) ? scope.tabIndex : null;
  if (tabIndex !== null) {
    output = output.filter((item) => resolveItemTabIndex(item) === tabIndex);
  }

  const searchTerm = typeof scope?.searchTerm === 'string'
    ? scope.searchTerm.trim().toLowerCase()
    : getActiveSearchTerm();
  output = applySearchToItems(output, searchTerm);
  return output;
}

function buildScopedViewData(viewData, scope = {}) {
  if (!viewData || !Array.isArray(viewData.items)) return null;

  const effectiveScope = {
    tabIndex: Object.prototype.hasOwnProperty.call(scope, 'tabIndex') ? scope.tabIndex : selectedTabIndex,
    searchTerm: Object.prototype.hasOwnProperty.call(scope, 'searchTerm') ? scope.searchTerm : getActiveSearchTerm(),
  };
  const scopedItems = applyScopeToItems(viewData.items, effectiveScope);
  const totals = buildTotalsFromItems(scopedItems);
  const tabDetails = buildTabDetailsFromItems(viewData, scopedItems);

  return {
    ...viewData,
    items: scopedItems,
    itemsArray: scopedItems,
    netWorth: totals.netWorth,
    converted: totals.converted,
    tabDetails,
  };
}

function getSelectableStashTabs() {
  if (Array.isArray(lastScan?.tabDetails) && lastScan.tabDetails.length > 0) {
    return lastScan.tabDetails
      .filter((tab) => tab.source !== 'character')
      .map((tab) => ({
        index: Number.isFinite(tab.index) ? tab.index : null,
        name: tab.name || `Tab ${Number(tab.index || 0) + 1}`,
        type: tab.type || 'NormalStash',
        source: tab.source || 'stash',
        syncStatus: tab.syncStatus || 'ok',
        retryAt: tab.retryAt || null,
        netWorth: tab.netWorth || { chaos: 0, divine: 0 },
        itemCount: Number.isFinite(tab.itemCount) ? tab.itemCount : 0,
      }))
      .filter((tab) => tab.index !== null);
  }

  return availableStashTabs
    .map((tab) => ({
      index: Number.isFinite(tab?.index) ? tab.index : null,
      name: tab?.name || `Tab ${Number(tab?.index || 0) + 1}`,
      type: tab?.type || 'NormalStash',
      source: 'stash',
      syncStatus: 'ok',
      retryAt: null,
      netWorth: { chaos: 0, divine: 0 },
      itemCount: 0,
    }))
    .filter((tab) => tab.index !== null);
}

function getTabChaosValue(tab) {
  const chaosValue = Number(tab?.netWorth?.chaos);
  if (Number.isFinite(chaosValue)) return chaosValue;
  const divineValue = Number(tab?.netWorth?.divine);
  return Number.isFinite(divineValue) ? (divineValue * getDivineRate()) : 0;
}

function sortStashTabs(tabs) {
  const key = stashTabSortState?.key || 'value';
  const direction = stashTabSortState?.direction === 'asc' ? 1 : -1;
  return tabs.slice().sort((a, b) => {
    let left = 0;
    let right = 0;
    if (key === 'name') {
      left = String(a?.name || '').toLowerCase();
      right = String(b?.name || '').toLowerCase();
    } else if (key === 'items') {
      left = Number(a?.itemCount || 0);
      right = Number(b?.itemCount || 0);
    } else {
      left = getTabChaosValue(a);
      right = getTabChaosValue(b);
    }

    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return (Number(a?.index || 0) - Number(b?.index || 0));
  });
}

function updateSidebarSortButtons() {
  const buttons = document.querySelectorAll('.sidebar-sort-btn[data-tab-sort-key]');
  buttons.forEach((button) => {
    const key = button.dataset.tabSortKey;
    const active = key === stashTabSortState.key;
    button.classList.toggle('active', active);
    if (!active) {
      button.textContent = button.textContent.replace(/\s*[\^v]$/, '');
      return;
    }
    const baseLabel = button.textContent.replace(/\s*[\^v]$/, '');
    const arrow = stashTabSortState.direction === 'asc' ? ' ^' : ' v';
    button.textContent = `${baseLabel}${arrow}`;
  });
}

function syncAutoQueueToggleUi() {
  const toggle = document.getElementById('autoQueueUnpricedToggle');
  if (!toggle) return;
  toggle.checked = autoQueueUnpriced === true;
}

async function queueUnpricedItemsNow({ silent = false } = {}) {
  if (!currentLeague) {
    if (!silent) alert('Please select a league first');
    return { queued: 0, error: 'league is required' };
  }

  const selectedLeague = leagues.find((entry) => entry.id === currentLeague);
  const result = await window.networthOverlayAPI.enqueueUnpricedItems({
    league: currentLeague,
    realm: selectedLeague?.realm || 'pc',
  });

  if (!silent) {
    const queued = Number(result?.queued || 0);
    if (queued > 0) {
      alert(`Queued ${queued} unpriced item(s) for smart pricing.`);
    } else if (result?.error) {
      alert(result.error);
    } else {
      alert('No eligible unpriced items found to queue.');
    }
  }

  if (queueViewActive) {
    loadQueueView();
  }

  return result;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseScanTimestamp(scan) {
  const scannedAt = Number(scan?.scannedAt);
  if (Number.isFinite(scannedAt) && scannedAt > 0) return scannedAt;

  const numericTimestamp = Number(scan?.timestamp);
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) return numericTimestamp;

  const parsedTimestamp = Date.parse(String(scan?.timestamp || ''));
  return Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : null;
}

function scanIncludesTab(scan, tabIndex) {
  const normalizedTabIndex = toTabIndex(tabIndex);
  if (normalizedTabIndex === null || !scan || typeof scan !== 'object') return false;

  const scannedTabIndices = Array.isArray(scan?.stash?.scannedTabIndices)
    ? scan.stash.scannedTabIndices
      .map((value) => toTabIndex(value))
      .filter((value) => value !== null)
    : [];
  if (scannedTabIndices.length > 0) {
    return scannedTabIndices.includes(normalizedTabIndex);
  }

  const tabDetails = Array.isArray(scan?.tabDetails) ? scan.tabDetails : [];
  const matchedTab = tabDetails.find((tab) => toTabIndex(tab?.index) === normalizedTabIndex);
  if (!matchedTab) return false;
  const status = String(matchedTab?.syncStatus || '').toLowerCase();
  return status !== 'pending' && status !== 'rate_limited';
}

function getLatestTabSyncTimestamp(tabIndex) {
  const normalizedTabIndex = toTabIndex(tabIndex);
  if (normalizedTabIndex === null) return null;

  let latestTimestamp = null;
  const scans = [lastScan, ...(Array.isArray(scanHistory) ? scanHistory : [])];

  for (const scan of scans) {
    if (!scanIncludesTab(scan, normalizedTabIndex)) continue;
    const timestamp = parseScanTimestamp(scan);
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    if (latestTimestamp === null || timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
    }
  }

  return latestTimestamp;
}

function formatRelativeSyncAge(ageMs) {
  const safeAge = Math.max(0, Number(ageMs) || 0);
  const minutes = Math.floor(safeAge / (60 * 1000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getTabSyncIndicatorMeta(tabIndex) {
  const lastSyncedAt = getLatestTabSyncTimestamp(tabIndex);
  if (!Number.isFinite(lastSyncedAt) || lastSyncedAt <= 0) {
    return {
      state: 'never',
      title: 'Never synced',
    };
  }

  const ageMs = Date.now() - lastSyncedAt;
  if (ageMs < ONE_DAY_MS) {
    return {
      state: 'fresh',
      title: `Synced ${formatRelativeSyncAge(ageMs)}`,
    };
  }

  return {
    state: 'stale',
    title: `Synced ${formatRelativeSyncAge(ageMs)}`,
  };
}

function getItemSortValue(item, key) {
  const quantity = Math.max(1, Number(item?.stackSize || 1));
  const value = Number(item?._networth?.value || 0);
  const rate = Number(getCurrencyRate(item?._networth?.currency || 'chaos') || 0);
  const totalChaos = value * rate;
  if (key === 'name') return String(getItemDisplayName(item)).toLowerCase();
  if (key === 'tab') return String(item?._tabName || '').toLowerCase();
  if (key === 'quantity') return quantity;
  if (key === 'price') return totalChaos / quantity;
  return totalChaos;
}

function sortItemsForTable(items) {
  const key = itemsSortState?.key || 'total';
  const direction = itemsSortState?.direction === 'asc' ? 1 : -1;
  return items.slice().sort((a, b) => {
    const left = getItemSortValue(a, key);
    const right = getItemSortValue(b, key);
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function updateItemsSortHeaders() {
  const headers = document.querySelectorAll('.items-table th.sortable-col[data-sort-key]');
  headers.forEach((header) => {
    const key = header.dataset.sortKey;
    const active = key === itemsSortState.key;
    header.classList.toggle('active', active);
    header.classList.toggle('sort-asc', active && itemsSortState.direction === 'asc');
    header.classList.toggle('sort-desc', active && itemsSortState.direction === 'desc');
  });
}

function getPendingScanTabIndices() {
  if (!lastScan) return [];
  const source = Array.isArray(lastScan.pendingTabIndices)
    ? lastScan.pendingTabIndices
    : (Array.isArray(lastScan?.stash?.pendingTabIndices) ? lastScan.stash.pendingTabIndices : []);
  return Array.from(new Set(
    source
      .map((value) => Number.parseInt(String(value), 10))
      .filter((value) => Number.isFinite(value) && value >= 0)
  ));
}

function getScanRetryAt() {
  if (!lastScan) return null;
  const directRetry = Number(lastScan.retryAt || 0);
  if (Number.isFinite(directRetry) && directRetry > Date.now()) {
    return directRetry;
  }
  const tabRetry = Array.isArray(lastScan.tabDetails)
    ? lastScan.tabDetails
      .map((tab) => Number(tab?.retryAt || 0))
      .filter((retryAt) => Number.isFinite(retryAt) && retryAt > Date.now())
    : [];
  return tabRetry.length > 0 ? Math.min(...tabRetry) : null;
}

function clearPendingScanResumeTimer() {
  if (pendingScanResumeTimer) {
    clearTimeout(pendingScanResumeTimer);
    pendingScanResumeTimer = null;
  }
}

async function resumePendingScanIfPossible() {
  if (pendingScanResumeInFlight || scanInFlight) {
    return;
  }
  const pendingTabIndices = getPendingScanTabIndices();
  if (pendingTabIndices.length === 0) {
    return;
  }
  const retryAt = getScanRetryAt();
  if (retryAt && retryAt > Date.now()) {
    schedulePendingScanResume();
    return;
  }
  pendingScanResumeInFlight = true;
  try {
    await scanStashes(true, {
      tabIndices: pendingTabIndices,
      silent: true,
      keepSelection: true,
      includeInventory: false,
      maxTabsPerScan: DEFAULT_SCAN_BATCH_SIZE,
      resume: true,
    });
  } finally {
    pendingScanResumeInFlight = false;
  }
}

function schedulePendingScanResume() {
  if (!ENABLE_AUTO_SCAN_RESUME) {
    return;
  }
  if (!sessionSyncActivated) {
    return;
  }
  clearPendingScanResumeTimer();
  const pendingTabIndices = getPendingScanTabIndices();
  if (pendingTabIndices.length === 0) {
    return;
  }
  const retryAt = getScanRetryAt();
  const delay = retryAt && retryAt > Date.now()
    ? Math.max(250, retryAt - Date.now())
    : 350;
  pendingScanResumeTimer = setTimeout(() => {
    pendingScanResumeTimer = null;
    resumePendingScanIfPossible().catch((error) => {
      console.warn('[NETWORTH-OVERLAY] Failed to resume pending scan', error);
      schedulePendingScanResume();
    });
  }, delay);
}

// Update stash tabs sidebar
function updateStashTabsSidebar() {
  const container = document.getElementById('stashTabsSidebar');
  container.innerHTML = '';
  updateSidebarSortButtons();

  const viewData = getViewData();
  const sourceTabs = (viewData && Array.isArray(viewData.tabDetails) && viewData.tabDetails.length > 0)
    ? viewData.tabDetails
    : (activeViewTab === 'networth' ? getSelectableStashTabs() : []);

  if (!sourceTabs || sourceTabs.length === 0) {
    if (activeViewTab !== 'networth') {
      container.innerHTML = '<div style="padding: 16px; color: #999; font-size: 12px; text-align: center;">No stash data for this run</div>';
    }
    return;
  }

  const availableIndices = new Set(
    sourceTabs
      .map((tab) => toTabIndex(tab?.index))
      .filter((index) => index !== null)
  );
  if (selectedTabIndex !== null && !availableIndices.has(selectedTabIndex)) {
    selectedTabIndex = null;
  }

  const tabs = sortStashTabs(sourceTabs);

  const refreshScopedPanels = () => {
    updateWealth();
    updateBreakdown();
    updateItemsTable();
    updateSelectedTotal();
    updateChart();
    renderScanMenuList();
  };

  const allItem = document.createElement('div');
  allItem.className = 'stash-tab-sidebar-item';
  if (selectedTabIndex === null) {
    allItem.classList.add('active');
  }
  allItem.dataset.tabIndex = 'all';
  allItem.innerHTML = `
    <div class="stash-tab-name-sidebar">
      <span class="stash-tab-label">${ALL_STASH_TAB_LABEL}</span>
    </div>
  `;
  allItem.addEventListener('click', (event) => {
    queueViewActive = false;
    updateMainViewVisibility();
    selectedTabIndex = null;
    sidebarSelection.clear();
    scanTabSelection.clear();
    lastSidebarIndex = null;
    updateStashTabsSidebar();
    refreshScopedPanels();
  });
  container.appendChild(allItem);

  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = 'stash-tab-sidebar-item';
    if (selectedTabIndex === tab.index) {
      item.classList.add('active');
    }
    if (sidebarSelection.has(tab.index)) {
      item.classList.add('selected');
    }
    item.dataset.tabIndex = tab.index;

    const syncMeta = getTabSyncIndicatorMeta(tab.index);

    item.innerHTML = `
      <div class="stash-tab-name-sidebar">
        <span class="stash-tab-label">${escapeHtml(tab.name)}</span>
        <span class="tab-sync-indicator ${escapeHtml(syncMeta.state)}" title="${escapeHtml(syncMeta.title)}" aria-label="${escapeHtml(syncMeta.title)}"></span>
      </div>
    `;

    item.addEventListener('click', (event) => {
      queueViewActive = false;
      updateMainViewVisibility();
      const stashTabsSorted = tabs.slice().sort((a, b) => a.index - b.index);
      if (event.shiftKey && lastSidebarIndex !== null) {
        const start = Math.min(lastSidebarIndex, tab.index);
        const end = Math.max(lastSidebarIndex, tab.index);
        for (const t of stashTabsSorted) {
          if (t.index >= start && t.index <= end) {
            sidebarSelection.add(t.index);
            scanTabSelection.add(t.index);
          }
        }
      } else if (event.ctrlKey || event.metaKey) {
        if (sidebarSelection.has(tab.index)) {
          sidebarSelection.delete(tab.index);
          scanTabSelection.delete(tab.index);
        } else {
          sidebarSelection.add(tab.index);
          scanTabSelection.add(tab.index);
        }
        lastSidebarIndex = tab.index;
      } else {
        sidebarSelection.clear();
        scanTabSelection.clear();
        sidebarSelection.add(tab.index);
        scanTabSelection.add(tab.index);
        lastSidebarIndex = tab.index;
      }
      selectedTabIndex = tab.index;
      updateStashTabsSidebar();
      refreshScopedPanels();
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!sidebarSelection.has(tab.index)) {
        sidebarSelection.clear();
        scanTabSelection.clear();
        sidebarSelection.add(tab.index);
        scanTabSelection.add(tab.index);
        lastSidebarIndex = tab.index;
        updateStashTabsSidebar();
      }
      showContextMenu(e.clientX, e.clientY, tab.index);
    });

    container.appendChild(item);
  }
}

function showContextMenu(x, y, tabIndex) {
  let menu = document.getElementById('tabContextMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'tabContextMenu';
    menu.className = 'context-menu';
    document.body.appendChild(menu);
  }
  const actionTabIndices = getSelectedTabIndicesForActions(tabIndex);
  const queueableCount = getQueueableCountForTabIndices(actionTabIndices);

  menu.innerHTML = '';

  const scanTabsItem = document.createElement('div');
  scanTabsItem.className = 'context-menu-item';
  scanTabsItem.textContent = 'Scan tab(s) for items.';
  scanTabsItem.addEventListener('click', () => {
    closeContextMenu();
    scanStashes(true, { tabIndices: actionTabIndices });
  });

  const smartPriceTabsItem = document.createElement('div');
  smartPriceTabsItem.className = `context-menu-item${queueableCount > 0 ? '' : ' disabled'}`;
  smartPriceTabsItem.textContent = 'Smart price tab(s).';
  if (queueableCount > 0) {
    smartPriceTabsItem.addEventListener('click', async () => {
      closeContextMenu();
      await queueTabItemsForSmartPricing(actionTabIndices);
    });
  }

  menu.appendChild(scanTabsItem);
  menu.appendChild(smartPriceTabsItem);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'block';

  const closeOnClick = (e) => {
    if (!menu.contains(e.target)) {
      closeContextMenu();
      document.removeEventListener('click', closeOnClick);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnClick), 0);
}

function closeContextMenu() {
  const tabMenu = document.getElementById('tabContextMenu');
  if (tabMenu) tabMenu.style.display = 'none';
  const itemMenu = document.getElementById('itemContextMenu');
  if (itemMenu) itemMenu.style.display = 'none';
}

// Update items table
function updateItemsTable() {
  const tbody = document.getElementById('itemsTableBody');
  tbody.innerHTML = '';
  updateItemsSortHeaders();

  const viewData = getViewData();
  if (!viewData || !viewData.items) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #888;">No items</td></tr>';
    return;
  }

  let items = applyScopeToItems(viewData.items, {
    tabIndex: selectedTabIndex,
    searchTerm: getActiveSearchTerm(),
  });
  
  items = sortItemsForTable(items);
  
  const displayedItems = items.slice(0, 500); // Limit to 500 items
  renderedItems = displayedItems;

  displayedItems.forEach((item, index) => {
    const row = document.createElement('tr');
    row.dataset.itemId = item.id;
    row.dataset.rowIndex = index;
    const deltaSign = Number(item?._deltaSign) < 0 ? -1 : 1;
    if (deltaSign < 0) {
      row.classList.add('queue-row', 'failed');
    }
    
    const value = item._networth?.value || 0;
    const currency = item._networth?.currency || 'chaos';
    const quantity = item.stackSize || 1;
    const pricePerUnit = value / quantity;
    const totalValue = value;
    const hasPositiveValuation = Number.isFinite(Number(item?._networth?.value)) && Number(item._networth.value) > 0;
    let priceText = '-';
    let totalText = '-';
    let quantityText = String(quantity);

    const rate = getCurrencyRate(currency);
    if (!hasPositiveValuation || !rate || rate <= 0) {
      priceText = '-';
      totalText = '-';
    } else {
      const priceChaos = pricePerUnit * rate;
      const totalChaos = totalValue * rate * deltaSign;
      priceText = formatDisplayValueFromChaos(priceChaos);
      totalText = formatDisplayValueFromChaos(totalChaos, { signed: deltaSign < 0 });
    }
    if (deltaSign < 0) {
      quantityText = `-${quantity}`;
    }
    
    const isSelected = selectedItems.has(item.id);

    const allowTradePricingDetails = !isAuctionHouseCandidateItem(item);
    const displayName = getItemDisplayName(item);
    const tooltip = buildItemTooltip(item);
    const runPricingStatus = activeViewTab !== 'networth' ? getRunItemPricingStatus(item) : null;

    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="item-checkbox" data-item-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''}>
      </td>
      <td class="name-col">
        <div class="item-row">
          <div class="item-icon-cell">
            ${getItemIconHtml(item)}
          </div>
          <div class="item-name-cell">
            <div class="item-name-main">
              <span>${escapeHtml(displayName)}</span>
              ${allowTradePricingDetails ? `<button class="btn-price-details" data-item-id="${escapeHtml(item.id)}">Details</button>` : ''}
            </div>
            ${runPricingStatus ? `<div class="run-item-pricing-badge ${escapeHtml(runPricingStatus.className)}">${escapeHtml(runPricingStatus.label)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="tab-col item-tab-cell">${escapeHtml(item._tabName || '-')}</td>
      <td class="quantity-col item-quantity-cell">${quantityText}</td>
      <td class="price-col item-price-cell">${priceText}</td>
      <td class="total-col item-total-cell">${totalText}</td>
    `;

    if (tooltip) {
      row.addEventListener('mouseenter', (e) => showHoverTooltip(tooltip, e));
      row.addEventListener('mousemove', positionHoverTooltip);
      row.addEventListener('mouseleave', hideHoverTooltip);
    }

    const checkbox = row.querySelector('.item-checkbox');
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();

      const isShift = e.shiftKey && lastItemSelectionIndex !== null;
      if (isShift && renderedItems.length > 0) {
        const start = Math.min(lastItemSelectionIndex, index);
        const end = Math.max(lastItemSelectionIndex, index);
        const shouldSelect = checkbox.checked;
        for (let i = start; i <= end; i += 1) {
          const targetItem = renderedItems[i];
          if (!targetItem) continue;
          if (shouldSelect) {
            selectedItems.add(targetItem.id);
          } else {
            selectedItems.delete(targetItem.id);
          }
        }
      } else if (checkbox.checked) {
        selectedItems.add(item.id);
      } else {
        selectedItems.delete(item.id);
      }

      lastItemSelectionIndex = index;
      refreshItemSelectionStyles();
      updateSelectedTotal();
    });

    const priceBtn = row.querySelector('.btn-price-details');
    if (priceBtn) {
      priceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPricingDetails(item);
      });
    }

    row.addEventListener('click', (e) => handleItemRowClick(e, item, index));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!selectedItems.has(item.id)) {
        selectedItems.clear();
        selectedItems.add(item.id);
        lastItemSelectionIndex = index;
        refreshItemSelectionStyles();
        updateSelectedTotal();
      }
      showItemContextMenu(e.clientX, e.clientY, item);
    });

    row.classList.toggle('selected', isSelected);
    tbody.appendChild(row);
  });
}

function handleItemRowClick(event, item, index) {
  const isShift = event.shiftKey && lastItemSelectionIndex !== null;

  if (isShift && renderedItems.length > 0 && lastItemSelectionIndex !== null) {
    const start = Math.min(lastItemSelectionIndex, index);
    const end = Math.max(lastItemSelectionIndex, index);
    for (let i = start; i <= end; i++) {
      const targetItem = renderedItems[i];
      if (targetItem) {
        selectedItems.add(targetItem.id);
      }
    }
    lastItemSelectionIndex = index;
  } else {
    if (selectedItems.has(item.id)) {
      selectedItems.delete(item.id);
    } else {
      selectedItems.add(item.id);
    }
    lastItemSelectionIndex = index;
  }

  refreshItemSelectionStyles();
  updateSelectedTotal();
}

function refreshItemSelectionStyles() {
  const rows = document.querySelectorAll('#itemsTableBody tr[data-item-id]');
  rows.forEach((row) => {
    const id = row.dataset.itemId;
    const selected = selectedItems.has(id);
    row.classList.toggle('selected', selected);
    const cb = row.querySelector('.item-checkbox');
    if (cb) cb.checked = selected;
  });
}

function showItemContextMenu(x, y, item) {
  closeContextMenu();
  let menu = document.getElementById('itemContextMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'itemContextMenu';
    menu.className = 'context-menu';
    document.body.appendChild(menu);
  }

  const hasSingleSelection = selectedItems.size === 1;
  const singleItemId = hasSingleSelection ? Array.from(selectedItems)[0] : null;
  const viewData = getViewData();
  const singleItem = hasSingleSelection && viewData?.items
    ? viewData.items.find((entry) => String(entry?.id) === String(singleItemId))
    : null;
  const canManualPrice = !!(
    singleItem &&
    !isAuctionHouseCandidateItem(singleItem)
  );
  const selectedItemIds = new Set(Array.from(selectedItems).map((entry) => String(entry)));
  const queueableSelectionCount = (viewData?.items || []).filter((entry) => (
    selectedItemIds.has(String(entry?.id)) && isQueueableForSmartPricing(entry)
  )).length;

  const queueItem = document.createElement('div');
  queueItem.className = `context-menu-item${queueableSelectionCount > 0 ? '' : ' disabled'}`;
  queueItem.textContent = 'Queue for smart pricing';
  if (queueableSelectionCount > 0) {
    queueItem.addEventListener('click', () => {
      closeContextMenu();
      queueSelectedItemsForSmartPricing();
    });
  }

  const manualItem = document.createElement('div');
  manualItem.className = `context-menu-item${canManualPrice ? '' : ' disabled'}`;
  manualItem.textContent = 'Manually price item';
  if (canManualPrice) {
    manualItem.addEventListener('click', () => {
      closeContextMenu();
      showPricingDetails(singleItem);
    });
  }

  menu.innerHTML = '';
  menu.appendChild(queueItem);
  menu.appendChild(manualItem);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'block';

  const closeOnClick = (e) => {
    if (!menu.contains(e.target)) {
      closeContextMenu();
      document.removeEventListener('click', closeOnClick);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnClick), 0);
}

function normalizeItemTextForQueue(value) {
  return String(value || '')
    .replace(/<<[^>]+>>/g, '')
    .trim();
}

function isQueueableForSmartPricing(item) {
  if (!item || typeof item !== 'object') return false;
  if (isAuctionHouseCandidateItem(item)) return false;
  const frameType = Number(item.frameType);
  if (Number.isFinite(frameType) && ![1, 2, 3, 6].includes(frameType)) return false;

  const typeLine = normalizeItemTextForQueue(item.typeLine || item.type_line || '');
  const baseType = normalizeItemTextForQueue(item.baseType || item.base_type || '');
  return Boolean(typeLine || baseType);
}

function getSelectedTabIndicesForActions(fallbackTabIndex = null) {
  const indices = Array.from(scanTabSelection)
    .map((entry) => Number.parseInt(String(entry), 10))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);
  if (indices.length > 0) {
    return Array.from(new Set(indices));
  }
  const parsedFallback = Number.parseInt(String(fallbackTabIndex), 10);
  if (Number.isFinite(parsedFallback) && parsedFallback >= 0) {
    return [parsedFallback];
  }
  return [];
}

function getTabNameMap() {
  const tabMap = new Map();
  for (const tab of getSelectableStashTabs()) {
    if (Number.isFinite(tab?.index)) {
      tabMap.set(Number(tab.index), String(tab.name || `Tab ${Number(tab.index) + 1}`));
    }
  }
  return tabMap;
}

function getBaseStashViewData() {
  return buildDerivedNetworthViewData(lastScan) || getViewData();
}

function getQueueableCountForTabIndices(tabIndices) {
  if (!Array.isArray(tabIndices) || tabIndices.length === 0) return 0;
  const tabSet = new Set(tabIndices);
  const sourceData = getBaseStashViewData();
  const sourceItems = Array.isArray(sourceData?.items) ? sourceData.items : [];
  return sourceItems.filter((entry) => (
    tabSet.has(resolveItemTabIndex(entry)) && isQueueableForSmartPricing(entry)
  )).length;
}

async function queueTabItemsForSmartPricing(tabIndices) {
  if (!Array.isArray(tabIndices) || tabIndices.length === 0) {
    alert('Select at least one stash tab first.');
    return;
  }

  const sourceData = getBaseStashViewData();
  const sourceItems = Array.isArray(sourceData?.items) ? sourceData.items : [];
  if (sourceItems.length === 0) {
    alert('No scanned stash items are available yet.');
    return;
  }

  const tabSet = new Set(tabIndices);
  const itemsToQueue = sourceItems.filter((entry) => (
    tabSet.has(resolveItemTabIndex(entry)) && isQueueableForSmartPricing(entry)
  ));

  if (itemsToQueue.length === 0) {
    alert('No queueable items found in the selected stash tab(s). Smart pricing supports magic, rare, and unique items.');
    return;
  }

  try {
    const league = getOperationalLeague(currentLeague || sourceData?.league);
    const tabNameMap = getTabNameMap();
    const tabNames = tabIndices
      .map((index) => tabNameMap.get(index) || `Tab ${Number(index) + 1}`)
      .filter(Boolean);
    const taskName = tabNames.length <= 2
      ? tabNames.join(', ')
      : `${tabNames.length} tabs`;
    let queueTask = null;
    try {
      queueTask = await window.networthOverlayAPI.enqueueScanTask({
        type: 'tab_smart_price',
        name: taskName,
        league,
        status: 'in_progress',
        tabIndices,
        tabNames,
        queuedItems: 0,
      });
    } catch (queueTaskError) {
      console.warn('[PRICING] Failed to enqueue tab smart-pricing task row', queueTaskError);
    }

    const result = await window.networthOverlayAPI.enqueuePricingItems(itemsToQueue, league);
    if (queueTask?.id) {
      await window.networthOverlayAPI.enqueueScanTask({
        id: queueTask.id,
        type: 'tab_smart_price',
        name: taskName,
        league,
        status: result?.queued > 0 ? 'queued' : 'failed',
        tabIndices,
        tabNames,
        queuedItems: Number(result?.queued || 0),
        lastError: result?.queued > 0
          ? ''
          : (typeof result?.error === 'string' ? result.error : 'No items were queued for smart pricing.'),
      });
    }

    if (result?.queued > 0) {
      console.log(`[PRICING] Queued ${result.queued} items from tab selection for smart pricing`);
      if (queueViewActive) {
        loadQueueView();
      }
    } else {
      const reason = typeof result?.error === 'string' && result.error.trim()
        ? ` (${result.error.trim()})`
        : '';
      alert(`No items were added to the pricing queue${reason}.`);
    }
  } catch (err) {
    console.error('Failed to queue tab items for pricing', err);
    try {
      const league = getOperationalLeague(currentLeague || sourceData?.league);
      const tabNameMap = getTabNameMap();
      const tabNames = tabIndices
        .map((index) => tabNameMap.get(index) || `Tab ${Number(index) + 1}`)
        .filter(Boolean);
      const taskName = tabNames.length <= 2
        ? tabNames.join(', ')
        : `${tabNames.length} tabs`;
      await window.networthOverlayAPI.enqueueScanTask({
        type: 'tab_smart_price',
        name: taskName,
        league,
        status: 'failed',
        tabIndices,
        tabNames,
        queuedItems: 0,
        lastError: err?.message || 'Failed to queue smart pricing for selected tabs.',
      });
    } catch (queueTaskError) {
      console.warn('[PRICING] Failed to append failed tab smart-pricing task row', queueTaskError);
    }
    alert('Could not add selected tab items to the pricing queue.');
  }
}

async function queueSelectedItemsForSmartPricing() {
  const viewData = getViewData();
  if (!viewData || !viewData.items || selectedItems.size === 0) {
    alert('Select at least one priceable item first.');
    return;
  }

  const selectedItemIds = new Set(Array.from(selectedItems).map((entry) => String(entry)));
  const itemsToQueue = viewData.items.filter((entry) => (
    selectedItemIds.has(String(entry?.id)) && isQueueableForSmartPricing(entry)
  ));
  if (itemsToQueue.length === 0) {
    alert('No queueable items selected. Smart pricing supports magic, rare, and unique items.');
    return;
  }

  try {
    const league = getOperationalLeague(currentLeague || viewData.league);
    const result = await window.networthOverlayAPI.enqueuePricingItems(itemsToQueue, league);
    if (result?.queued > 0) {
      console.log(`[PRICING] Queued ${result.queued} items for smart pricing`);
      if (queueViewActive) {
        loadQueueView();
      }
    } else {
      const reason = typeof result?.error === 'string' && result.error.trim()
        ? ` (${result.error.trim()})`
        : '';
      alert(`No items were added to the pricing queue${reason}.`);
    }
  } catch (err) {
    console.error('Failed to queue items for pricing', err);
    alert('Could not add selected items to the pricing queue.');
  }
}

// Update selected total
function updateSelectedTotal() {
  const viewData = getViewData();
  if (!viewData || !viewData.items) {
    document.getElementById('selectedTotal').textContent = 'Selected total: -';
    return;
  }

  let totalChaos = 0;

  for (const itemId of selectedItems) {
    const item = viewData.items.find(i => i.id === itemId);
    if (item && item._networth) {
      const rate = getCurrencyRate(item._networth.currency);
      const sign = Number(item?._deltaSign) < 0 ? -1 : 1;
      totalChaos += sign * (item._networth.value || 0) * rate;
    }
  }
  
  const totalText = formatDisplayValueFromChaos(totalChaos);

  document.getElementById('selectedTotal').textContent = `Selected total: ${totalText}`;
}

function resetScanTabSelectionFromLastScan() {
  const previousScanSelection = new Set(scanTabSelection);
  const previousSidebarSelection = new Set(sidebarSelection);
  scanTabSelection.clear();
  sidebarSelection.clear();
  lastSidebarIndex = null;
  const stashTabs = (lastScan?.tabDetails || []).filter((tab) => tab.source !== 'character');
  if (stashTabs.length > 0) {
    const available = new Set(
      stashTabs
        .map((tab) => Number.parseInt(String(tab.index), 10))
        .filter((index) => Number.isFinite(index) && index >= 0)
    );
    for (const index of previousScanSelection) {
      if (available.has(index)) {
        scanTabSelection.add(index);
      }
    }
    for (const index of previousSidebarSelection) {
      if (available.has(index)) {
        sidebarSelection.add(index);
      }
    }
    if (Number.isFinite(selectedTabIndex) && available.has(selectedTabIndex)) {
      scanTabSelection.add(selectedTabIndex);
      sidebarSelection.add(selectedTabIndex);
    }
  }
  renderScanMenuList();
}

function startRetryStatusTimer() {
  if (retryStatusTimer) {
    clearInterval(retryStatusTimer);
    retryStatusTimer = null;
  }
  const hasCooldown = () => {
    if (!lastScan) return false;
    if (lastScan.retryAt && lastScan.retryAt > Date.now()) return true;
    return (lastScan.tabDetails || []).some(tab => tab.retryAt && tab.retryAt > Date.now());
  };
  if (!hasCooldown()) {
    schedulePendingScanResume();
    return;
  }
  retryStatusTimer = setInterval(() => {
    updateSyncStatus();
    updateStashTabsSidebar();
    if (!hasCooldown()) {
      clearInterval(retryStatusTimer);
      retryStatusTimer = null;
      schedulePendingScanResume();
    }
  }, 1000);
}

function toggleScanMenu() {
  scanMenuOpen = !scanMenuOpen;
  const menu = document.getElementById('scanMenu');
  if (menu) {
    menu.style.display = scanMenuOpen ? 'block' : 'none';
  }
  if (scanMenuOpen) {
    renderScanMenuList();
  }
}

function closeScanMenu() {
  scanMenuOpen = false;
  const menu = document.getElementById('scanMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

function renderScanMenuList() {
  const listEl = document.getElementById('scanMenuList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const stashTabs = getSelectableStashTabs().sort((a, b) => a.index - b.index);
  if (stashTabs.length === 0) {
    listEl.innerHTML = '<div class="dropdown-empty">No stash tabs</div>';
    return;
  }

  const headerActions = document.createElement('div');
  headerActions.className = 'dropdown-header-actions';
  const btnAll = document.createElement('button');
  btnAll.className = 'btn btn-secondary btn-small';
  btnAll.textContent = 'Select all';
  btnAll.addEventListener('click', () => {
    stashTabs.forEach(t => scanTabSelection.add(t.index));
    renderScanMenuList();
  });
  const btnNone = document.createElement('button');
  btnNone.className = 'btn btn-secondary btn-small';
  btnNone.textContent = 'Clear all';
  btnNone.addEventListener('click', () => {
    scanTabSelection.clear();
    renderScanMenuList();
  });
  // Keep dropdown open while clicking these controls
  btnAll.addEventListener('mousedown', (e) => e.stopPropagation());
  btnNone.addEventListener('mousedown', (e) => e.stopPropagation());
  headerActions.addEventListener('mousedown', (e) => e.stopPropagation());
  headerActions.appendChild(btnAll);
  headerActions.appendChild(btnNone);
  listEl.appendChild(headerActions);

  for (const tab of stashTabs) {
    const row = document.createElement('div');
    row.className = 'dropdown-item';
    const checked = scanTabSelection.has(tab.index);
    const waiting = sessionSyncActivated && (tab.syncStatus === 'rate_limited' || tab.syncStatus === 'pending');
    const statusTitle = tab.syncStatus === 'rate_limited'
      ? 'Waiting for rate limit'
      : (tab.syncStatus === 'pending' ? 'Pending scan' : '');
    row.innerHTML = `
      <label>
        <input type="checkbox" data-tab-index="${tab.index}" ${checked ? 'checked' : ''}>
        <span>${escapeHtml(tab.name)} (${tab.index})</span>
      </label>
      <span class="dropdown-item-status-icon${waiting ? '' : ' hidden'}" title="${statusTitle}"></span>
    `;
    const input = row.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) {
        scanTabSelection.add(tab.index);
      } else {
        scanTabSelection.delete(tab.index);
      }
    });
    listEl.appendChild(row);
  }
}

// Update sync status
function setSyncStatusIndicator(state, title) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.className = `sync-status ${state}`;
  el.innerHTML = '<span class="sync-status-icon" aria-hidden="true"></span>';
  el.title = title || '';
}

function updateSyncStatus() {
  if (scanInFlight) {
    setSyncStatusIndicator('scanning', 'Sync in progress');
    return;
  }

  if (!lastScan) {
    setSyncStatusIndicator(
      'idle',
      availableStashTabs.length > 0 ? 'Tabs loaded - not synced yet' : 'Not synced'
    );
    return;
  }

  const formatAge = (ts) => {
    if (!ts) return '';
    const diffMs = Date.now() - ts;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const rem = minutes % 60;
      return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  };

  const nextRetryAt = sessionSyncActivated ? getScanRetryAt() : null;
  const pendingCount = sessionSyncActivated ? getPendingScanTabIndices().length : 0;
  const partialReason = String(lastScan.partialReason || (nextRetryAt ? 'rate_limit' : '')).toLowerCase();
  let statusText = '';
  if (nextRetryAt && partialReason === 'rate_limit') {
    const retryInMs = Math.max(0, nextRetryAt - Date.now());
    const retrySeconds = Math.ceil(retryInMs / 1000);
    statusText = `Rate limit cooldown (${retrySeconds}s) - last scan ${formatAge(lastScan.timestamp)}`;
    setSyncStatusIndicator('rate-limited', statusText);
  } else if (pendingCount > 0) {
    statusText = `Partial sync - open Queue for remaining work (last scan ${formatAge(lastScan.timestamp)})`;
    setSyncStatusIndicator('partial', statusText);
  } else {
    statusText = `Synced ${formatAge(lastScan.timestamp)}`;
    setSyncStatusIndicator('synced', statusText);
  }
}
function updateMainViewVisibility() {
  const itemsView = document.getElementById('itemsView');
  const queueView = document.getElementById('queueView');
  const queueBtn = document.getElementById('queueBtn');
  if (!itemsView || !queueView) return;

  if (queueViewActive) {
    itemsView.classList.add('hidden');
    queueView.classList.add('visible');
    queueView.classList.remove('hidden');
    if (queueBtn) queueBtn.classList.add('active');
  } else {
    itemsView.classList.remove('hidden');
    queueView.classList.remove('visible');
    queueView.classList.add('hidden');
    if (queueBtn) queueBtn.classList.remove('active');
  }
}

async function loadQueueView() {
  return loadQueueViewInternal({ silent: false });
}

function getDerivedPendingScanQueueEntries() {
  if (!lastScan || typeof lastScan !== 'object') {
    return [];
  }
  const hasPlannedScanWork =
    scanInFlight ||
    pendingScanResumeInFlight ||
    pendingScanResumeTimer !== null;
  if (!sessionSyncActivated || !hasPlannedScanWork) {
    return [];
  }
  const pendingIndices = getPendingScanTabIndices();
  if (pendingIndices.length === 0) {
    return [];
  }

  const tabMap = new Map(
    (Array.isArray(lastScan.tabDetails) ? lastScan.tabDetails : [])
      .map((tab) => [toTabIndex(tab?.index), tab])
      .filter(([index]) => index !== null)
  );
  const league = lastScan.league || currentLeague || '';
  const updatedAt = Number.isFinite(Number(lastScan.timestamp)) ? Number(lastScan.timestamp) : Date.now();

  return pendingIndices.map((tabIndex) => {
    const tab = tabMap.get(tabIndex);
    const tabName = String(tab?.name || `Tab ${tabIndex + 1}`);
    const tabStatus = String(tab?.syncStatus || '').toLowerCase();
    const status = tabStatus === 'rate_limited' ? 'pending' : 'queued';
    return {
      id: `pending-scan-${league}-${tabIndex}`,
      kind: 'scan',
      type: 'tab_scan_pending',
      name: tabName,
      league,
      status,
      tabIndices: [tabIndex],
      tabNames: [tabName],
      queuedItems: 0,
      hasPrice: false,
      lastError: '',
      createdAt: updatedAt,
      updatedAt,
      isVirtual: true,
    };
  });
}

function getDerivedCompletedScanHistoryEntries() {
  const scans = [];
  const isVisible = (scan) => {
    const ts = Number(scan?.scannedAt || scan?.timestamp || 0);
    return !(scanHistoryClearedAt > 0 && Number.isFinite(ts) && ts > 0 && ts <= scanHistoryClearedAt);
  };
  if (lastScan && typeof lastScan === 'object' && isVisible(lastScan)) scans.push(lastScan);
  if (Array.isArray(scanHistory) && scanHistory.length > 0) {
    scans.push(...scanHistory.filter((scan) => isVisible(scan)));
  }
  if (scans.length === 0) return [];

  const entries = [];
  const seen = new Set();
  for (const scan of scans) {
    if (!scan || typeof scan !== 'object') continue;
    const tabDetails = Array.isArray(scan.tabDetails) ? scan.tabDetails : [];
    if (!tabDetails.length) continue;
    const league = String(scan.league || currentLeague || '').trim();
    const timestamp = Number.isFinite(Number(scan.timestamp)) ? Number(scan.timestamp) : Date.now();
    const scanIdPart = String(scan.id || timestamp);
    for (const tab of tabDetails) {
      const tabIndex = Number.parseInt(String(tab?.index), 10);
      if (!Number.isFinite(tabIndex) || tabIndex < 0) continue;
      if (String(tab?.source || '').toLowerCase() === 'character') continue;
      const syncStatus = String(tab?.syncStatus || '').toLowerCase();
      if (syncStatus !== 'ok' && syncStatus !== 'synced') continue;
      const id = `history-scan-${league}-${scanIdPart}-${tabIndex}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const tabName = String(tab?.name || `Tab ${tabIndex + 1}`);
      entries.push({
        id,
        kind: 'scan',
        type: 'tab_scan_history',
        name: tabName,
        league,
        status: 'done',
        tabIndices: [tabIndex],
        tabNames: [tabName],
        queuedItems: 0,
        hasPrice: false,
        lastError: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        isVirtual: true,
        isHistory: true,
      });
    }
  }

  return entries;
}

function isSameLocalDay(rawTs, referenceTs = Date.now()) {
  const tsMs = normalizeQueueTimestampMs(rawTs);
  if (!tsMs) return false;
  const a = new Date(tsMs);
  const b = new Date(referenceTs);
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function shouldKeepInActiveQueue(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.kind !== 'pricing') return false;
  const status = String(entry.status || '').toLowerCase();
  if (status !== 'done') return false;
  if (entry.hasPrice !== true) return false;
  return isSameLocalDay(entry.updatedAt || entry.createdAt);
}

function isHistoryQueueEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isHistory === true) return true;
  if (shouldKeepInActiveQueue(entry)) return false;
  const status = String(entry.status || '').toLowerCase();
  return status === 'done' || status === 'failed';
}

function setQueueViewFilter(nextFilter) {
  queueViewFilter = nextFilter === 'history' ? 'history' : 'active';
  persistQueueViewFilter(queueViewFilter);
  const activeBtn = document.getElementById('queueFilterActiveBtn');
  const historyBtn = document.getElementById('queueFilterHistoryBtn');
  if (activeBtn) activeBtn.classList.toggle('active', queueViewFilter === 'active');
  if (historyBtn) historyBtn.classList.toggle('active', queueViewFilter === 'history');
}

function normalizeQueueTimestampMs(rawTs) {
  const parsed = Number(rawTs);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  // Support both Unix seconds and epoch milliseconds from mixed sources.
  return parsed < 1e12 ? Math.trunc(parsed * 1000) : Math.trunc(parsed);
}

function formatQueueTimestamp(rawTs) {
  const tsMs = normalizeQueueTimestampMs(rawTs);
  if (!tsMs) return '-';
  const date = new Date(tsMs);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQueueCooldown(rawTs) {
  const tsMs = normalizeQueueTimestampMs(rawTs);
  if (!tsMs) return '';
  const remainingMs = tsMs - Date.now();
  if (remainingMs <= 0) return 'now';
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function renderQueueCooldownStatus(taskQueueData) {
  const el = document.getElementById('queueCooldownStatus');
  if (!el) return;

  const source = taskQueueData && typeof taskQueueData === 'object' ? taskQueueData : {};
  const pricingUntil = Number(source?.rateLimits?.pricingUntil || source?.rateLimits?.globalUntil || 0);
  const scanUntil = Number(
    source?.cachedStashTabs?.retryAt
    || source?.rateLimits?.scanUntil
    || source?.rateLimits?.globalUntil
    || 0
  );

  const pricingText = pricingUntil > Date.now() ? `Pricing retry in ${formatQueueCooldown(pricingUntil)}` : '';
  const scanText = scanUntil > Date.now() ? `Next scan in ${formatQueueCooldown(scanUntil)}` : '';
  const parts = [scanText, pricingText].filter(Boolean);
  el.textContent = parts.join(' | ');
}

async function loadQueueViewInternal({ silent = false } = {}) {
  if (queueViewLoading) {
    return;
  }
  queueViewLoading = true;
  const tbody = document.getElementById('queueTableBody');
  if (!tbody) {
    queueViewLoading = false;
    return;
  }
  if (!silent) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 12px; color: #999;">Loading queue...</td></tr>';
  }

  try {
    const data = await window.networthOverlayAPI.getTaskQueue();
    latestTaskQueueData = {
      pricing: Array.isArray(data?.pricing) ? data.pricing : [],
      scans: Array.isArray(data?.scans) ? data.scans : [],
    };
    applyPricingQueueStateToAllRuns();
    scanHistoryClearedAt = Number(data?.scanHistoryClearedAt || 0);
    renderQueueCooldownStatus(data);
    const pricing = Array.isArray(data?.pricing) ? data.pricing : [];
    const scans = Array.isArray(data?.scans) ? data.scans : [];
    const entries = [];
    let latestPricingDoneTs = lastPricingUpdateTs;

    pricing.forEach(entry => entries.push({ ...entry, kind: 'pricing' }));
    scans.forEach(entry => entries.push({ ...entry, kind: 'scan' }));
    const hasRealPerTabScanEntries = scans.some((entry) => String(entry?.type || '').toLowerCase() === 'tab_scan');
    const derivedScanEntries = hasRealPerTabScanEntries ? [] : getDerivedPendingScanQueueEntries();
    const derivedHistoryEntries = hasRealPerTabScanEntries ? [] : getDerivedCompletedScanHistoryEntries();
    const seenIds = new Set(entries.map((entry) => String(entry?.id || '')));
    for (const derivedEntry of derivedScanEntries) {
      const id = String(derivedEntry.id || '');
      if (id && seenIds.has(id)) continue;
      entries.push(derivedEntry);
      if (id) seenIds.add(id);
    }
    for (const derivedEntry of derivedHistoryEntries) {
      const id = String(derivedEntry.id || '');
      if (id && seenIds.has(id)) continue;
      entries.push(derivedEntry);
      if (id) seenIds.add(id);
    }

    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding: 12px; color: #999;">Queue is empty</td></tr>';
      return;
    }

    entries.sort((a, b) => {
      const priorityForStatus = (entry) => {
        const status = String(entry?.status || '').toLowerCase();
        if (status === 'in_progress' || status === 'running') return 0;
        if (status === 'queued') return 1;
        if (status === 'pending') return 2;
        if (status === 'failed') return 3;
        if (status === 'done') return 4;
        return 5;
      };
      const aPriority = priorityForStatus(a);
      const bPriority = priorityForStatus(b);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      const aCreated = Number(a.createdAt || 0);
      const bCreated = Number(b.createdAt || 0);
      if (aCreated !== bCreated) {
        return bCreated - aCreated;
      }
      const aUpdated = Number(a.updatedAt || 0);
      const bUpdated = Number(b.updatedAt || 0);
      return bUpdated - aUpdated;
    });

    const visibleEntries = entries.filter((entry) => (
      queueViewFilter === 'history'
        ? isHistoryQueueEntry(entry)
        : !isHistoryQueueEntry(entry)
    ));

    if (!visibleEntries.length) {
      const emptyLabel = queueViewFilter === 'history'
        ? 'No history entries yet'
        : 'No active queue entries';
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 12px; color: #999;">${escapeHtml(emptyLabel)}</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    visibleEntries.forEach(entry => {
      const tr = document.createElement('tr');
      tr.className = 'queue-row';
      if (entry.status === 'failed') tr.classList.add('failed');
      if (entry.status === 'done') tr.classList.add('done');
      if (entry.lastError) {
        tr.title = `Last error: ${entry.lastError}`;
      }

      const typeLabel = (() => {
        if (entry.kind === 'pricing') return 'Price item';
        if (entry.type === 'tab_smart_price') return 'Smart price tabs';
        if (entry.type === 'tab_scan') return 'Scan tab';
        if (entry.type === 'tab_scan_history') return 'Scanned tab';
        if (entry.type === 'tab_scan_pending') return 'Scan tab';
        if (entry.type === 'all') return 'Scan all';
        return 'Scan tabs';
      })();
      const typeIconClass = (() => {
        if (entry.kind === 'pricing') return 'pricing';
        if (entry.type === 'tab_smart_price') return 'smart-price';
        if (entry.type === 'tab_scan') return 'scan';
        if (entry.type === 'tab_scan_history') return 'scan';
        if (entry.type === 'tab_scan_pending') return 'scan-pending';
        if (entry.type === 'all') return 'scan-all';
        return 'scan';
      })();
      const name = entry.name || entry.itemKey || entry.id || 'Unknown';
      const status = String(entry.status || 'pending').toLowerCase();
      const statusKey = (() => {
        if (status === 'done') return 'done';
        if (status === 'failed') return 'failed';
        if (status === 'in_progress' || status === 'running') return 'in_progress';
        return 'pending';
      })();
      const statusClass = `queue-status-icon ${statusKey}`;
      const statusTitle = (() => {
        const retryAt = Number(entry.retryAt || 0);
        if (retryAt > Date.now()) return `Rate limited - retry in ${formatQueueCooldown(retryAt)}`;
        if (statusKey === 'in_progress') return 'In progress';
        if (statusKey === 'done') return 'Done';
        if (statusKey === 'failed') return 'Failed';
        return status === 'queued' ? 'Queued' : 'Pending';
      })();
      const resultText = (() => {
        const retryAt = Number(entry.retryAt || 0);
        if (retryAt > Date.now()) {
          return `Retry in ${formatQueueCooldown(retryAt)}`;
        }
        if (entry.kind === 'pricing' && entry.hasPrice) {
          const chaos = Number(entry.pricingChaos ?? 0);
          if (chaos > 0) {
            return formatDisplayValueFromChaos(chaos);
          }
        }
        if (entry.kind === 'scan' && entry.type === 'tab_smart_price') {
          const queuedItems = Number(entry.queuedItems || 0);
          if (queuedItems > 0) {
            return `Queued ${queuedItems}`;
          }
        }
        if (entry.kind === 'scan' && status === 'done') {
          return 'Done';
        }
        if (entry.lastError) return 'Failed';
        return '-';
      })();
      const whenTs = entry.updatedAt || entry.createdAt || 0;
      const whenText = formatQueueTimestamp(whenTs);

      tr.innerHTML = `
        <td class="queue-type-cell"><span class="queue-type-icon ${escapeHtml(typeIconClass)}" aria-hidden="true"></span>${escapeHtml(typeLabel)}</td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(entry.league || '')}</td>
        <td class="queue-status"><span class="${statusClass}" title="${escapeHtml(statusTitle)}"></span></td>
        <td class="queue-when">${escapeHtml(whenText)}</td>
        <td class="queue-result">${escapeHtml(resultText)}</td>
        <td style="text-align: right;"></td>
      `;

      const actionCell = tr.querySelector('td:last-child');
    const actionsWrapper = document.createElement('div');
    actionsWrapper.style.display = 'flex';
    actionsWrapper.style.gap = '6px';

    if (entry.kind === 'pricing' && entry.pricing) {
      const detailBtn = document.createElement('button');
      detailBtn.className = 'btn btn-secondary btn-small';
      detailBtn.textContent = 'Details';
      detailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = entry.item || { name: entry.name || 'Item' };
        // If entry.item is missing pricing info, attach it
        item._pricing = entry.pricing;
        showPricingModal(item, entry.pricing);
      });
      actionsWrapper.appendChild(detailBtn);
    }

    if (!entry.isVirtual) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-secondary btn-small';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (entry.kind === 'pricing' && entry.itemKey) {
            await window.networthOverlayAPI.removePricingQueueItem(entry.itemKey);
          } else if (entry.kind === 'scan' && entry.id) {
          await window.networthOverlayAPI.removeScanQueueItem(entry.id);
        }
        await loadQueueView();
      });
      actionsWrapper.appendChild(removeBtn);
    }
    actionCell.appendChild(actionsWrapper);

      fragment.appendChild(tr);

      // Track if we have new pricing results to refresh stash view
      if (entry.kind === 'pricing' && entry.status === 'done' && entry.hasPrice) {
        const ts = Number(entry.updatedAt || entry.createdAt || 0);
        if (Number.isFinite(ts) && ts > latestPricingDoneTs) {
          latestPricingDoneTs = ts;
        }
      }
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    // If pricing was updated, refresh last scan + UI so stash tab values update immediately
    if (latestPricingDoneTs > lastPricingUpdateTs) {
      lastPricingUpdateTs = latestPricingDoneTs;
      try {
        const scanData = await window.networthOverlayAPI.getLastScan(currentLeague);
        if (scanData) {
          lastScan = scanData;
          updateAll();
        }
      } catch (err) {
        console.warn('Failed to refresh last scan after pricing update', err);
      }
    }
  } catch (err) {
    console.error('Failed to load queue', err);
    renderQueueCooldownStatus(null);
    if (!silent) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding: 12px; color: #f87171;">Failed to load queue</td></tr>';
    }
  } finally {
    queueViewLoading = false;
  }
}

async function clearEntireQueue({ includeHistory = false } = {}) {
  try {
    await window.networthOverlayAPI.clearPricingQueue();
    await window.networthOverlayAPI.clearScanQueue();
    if (includeHistory) {
      await window.networthOverlayAPI.clearScanHistory();
      scanHistory = [];
      scanHistoryClearedAt = Date.now();
    }
    await loadQueueView();
  } catch (err) {
    console.error('Failed to clear queue', err);
  }
}

// Load scan history
async function loadScanHistory() {
  try {
    scanHistory = await window.networthOverlayAPI.getScanHistory(50, currentLeague);
    updateChart();
  } catch (err) {
    console.error('Failed to load scan history:', err);
  }
}

// Update chart
function updateChart() {
  const canvas = document.getElementById('netWorthChart');
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (scanHistory.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No scan history yet', canvas.width / 2, canvas.height / 2);
    return;
  }

  const searchTerm = getActiveSearchTerm();
  const scopedTabIndex = Number.isFinite(selectedTabIndex) ? selectedTabIndex : null;
  const values = scanHistory.map((scan) => {
    if (!scan || typeof scan !== 'object') return 0;

    if (scopedTabIndex !== null && !searchTerm && Array.isArray(scan.tabDetails)) {
      const matchedTab = scan.tabDetails.find((tab) => toTabIndex(tab?.index) === scopedTabIndex);
      if (matchedTab) {
        const tabChaos = Number(matchedTab?.netWorth?.chaos);
        if (Number.isFinite(tabChaos)) {
          return tabChaos;
        }
        const tabDivine = Number(matchedTab?.netWorth?.divine);
        return Number.isFinite(tabDivine) ? tabDivine * getDivineRate() : 0;
      }
    }

    const items = getItemsForScan(scan);
    if (!items.length) {
      const converted = scan.converted || { chaos: 0, divine: 0 };
      return Number.isFinite(Number(converted.chaos))
        ? Number(converted.chaos)
        : (Number(converted.divine || 0) * getDivineRate());
    }

    const scopedItems = applyScopeToItems(items, {
      tabIndex: scopedTabIndex,
      searchTerm,
    });
    const totals = buildTotalsFromItems(scopedItems);
    return Number(totals?.converted?.chaos || 0);
  });
  
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  
  const padding = 30;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  
  // Draw grid
  ctx.strokeStyle = 'rgba(139, 104, 56, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
    
    // Labels
    const value = maxValue - (range / 5) * i;
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    const labelValue = formatDisplayValueFromChaos(value);
    ctx.fillText(labelValue, padding - 8, y + 3);
  }
  
  // Draw line
  ctx.strokeStyle = 'rgba(74, 144, 226, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const singlePoint = values.length === 1;
  
  for (let i = 0; i < values.length; i++) {
    const x = singlePoint
      ? padding + (chartWidth / 2)
      : padding + (chartWidth / (values.length - 1)) * i;
    const y = padding + chartHeight - ((values[i] - minValue) / range) * chartHeight;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  
  // Draw points
  ctx.fillStyle = 'rgba(74, 144, 226, 0.9)';
  for (let i = 0; i < values.length; i++) {
    const x = singlePoint
      ? padding + (chartWidth / 2)
      : padding + (chartWidth / (values.length - 1)) * i;
    const y = padding + chartHeight - ((values[i] - minValue) / range) * chartHeight;
    
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // X-axis labels
  ctx.fillStyle = '#666';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(values.length / 5));
  const formatHistoryLabel = (timestamp) => {
    const safeTs = Number(timestamp);
    if (!Number.isFinite(safeTs)) return '';
    const date = new Date(safeTs);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  for (let i = 0; i < values.length; i += step) {
    const x = singlePoint
      ? padding + (chartWidth / 2)
      : padding + (chartWidth / (values.length - 1)) * i;
    const time = formatHistoryLabel(scanHistory[i].timestamp);
    ctx.fillText(time, x, canvas.height - padding + 15);
  }
}

// Scan stashes
async function scanStashes(selectedOnly = false, options = {}) {
  const silent = options?.silent === true;
  const keepSelection = options?.keepSelection === true;
  const includeInventory = options?.includeInventory === true;
  const maxTabsPerScan = Number.isFinite(Number(options?.maxTabsPerScan))
    ? Math.max(1, Math.min(50, Number(options.maxTabsPerScan)))
    : DEFAULT_SCAN_BATCH_SIZE;
  const resumeMode = options?.resume === true;
  if (!resumeMode) {
    sessionSyncActivated = true;
  }
  const explicitTabIndices = Array.isArray(options?.tabIndices)
    ? Array.from(
      new Set(
        options.tabIndices
          .map((value) => Number.parseInt(String(value), 10))
          .filter((value) => Number.isFinite(value) && value >= 0)
      )
    )
    : [];
  if (!currentLeague) {
    if (!silent) {
      await showAlertModal('League required', 'Please select a league first.');
    }
    return false;
  }
  if (scanInFlight) {
    return false;
  }
  scanInFlight = true;

  const primaryBtn = document.getElementById('scanAllBtn') || document.getElementById('syncTabsBtn');
  const dropdownBtn = document.getElementById('scanMenuToggle') || document.getElementById('syncDropdownBtn');
  if (!resumeMode && primaryBtn) primaryBtn.disabled = true;
  if (!resumeMode && dropdownBtn) dropdownBtn.disabled = true;
  const prevPrimaryText = primaryBtn ? primaryBtn.textContent : '';
  if (!resumeMode && primaryBtn) primaryBtn.textContent = 'Syncing...';

  try {
    const stashTabsOnly = (lastScan?.tabDetails || []).filter(tab => tab.source !== 'character');
    if (selectedOnly && explicitTabIndices.length === 0 && scanTabSelection.size === 0) {
      if (!silent && !Number.isFinite(selectedTabIndex)) {
        await showAlertModal('No tabs selected', 'You need to select tabs first.');
        return false;
      }
    }
    const selectedIndices = Array.from(scanTabSelection);
    let selectedTabIndices = null;
    if (explicitTabIndices.length > 0) {
      selectedTabIndices = explicitTabIndices;
    } else if (selectedOnly) {
      if (selectedIndices.length > 0) {
        selectedTabIndices = selectedIndices;
      } else if (Number.isFinite(selectedTabIndex)) {
        selectedTabIndices = [selectedTabIndex];
      } else {
        if (!silent) {
          await showAlertModal('No tabs selected', 'You need to select tabs first.');
        }
        return false;
      }
    } else {
      selectedTabIndices =
        scanTabSelection.size > 0 && scanTabSelection.size < stashTabsOnly.length
          ? selectedIndices
          : null;
    }

    const shouldProceed = await confirmLargeTabScanIfNeeded(selectedTabIndices, {
      silent,
      resumeMode,
    });
    if (!shouldProceed) {
      return false;
    }

    const selectedLeague = leagues.find((entry) => entry.id === currentLeague);
    const result = await window.networthOverlayAPI.scanStashes({
      league: currentLeague,
      realm: selectedLeague?.realm || 'pc',
      tabIndices: selectedTabIndices || undefined,
      includeInventory,
      maxTabsPerScan,
    });
    lastScan = result.scan;
    lastComparison = result.comparison;
    if (!keepSelection) {
      resetScanTabSelectionFromLastScan();
    }

    updateAll();
    await loadScanHistory();
    startRetryStatusTimer();
    schedulePendingScanResume();

    if (!resumeMode && primaryBtn) {
      primaryBtn.textContent = 'Synced!';
      setTimeout(() => {
        primaryBtn.textContent = prevPrimaryText || 'Sync tab';
      }, 1200);
    }
    return true;
  } catch (err) {
    console.error('Scan failed:', err);
    if (!silent) {
      await showAlertModal('Scan failed', err?.message ? `Scan failed: ${err.message}` : 'Scan failed.');
    }
    if (!resumeMode && primaryBtn) {
      primaryBtn.textContent = 'Failed';
      setTimeout(() => {
        primaryBtn.textContent = prevPrimaryText || 'Sync tab';
      }, 2000);
    }
    return false;
  } finally {
    scanInFlight = false;
    if (!resumeMode && primaryBtn) primaryBtn.disabled = false;
    if (!resumeMode && dropdownBtn) dropdownBtn.disabled = false;
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
const leagueSelectEl = document.getElementById('leagueSelect');
if (leagueSelectEl) {
  leagueSelectEl.addEventListener('change', async (e) => {
    currentLeague = e.target.value;
    selectedTabIndex = null;
    selectedItems.clear();
    const selectedLeague = leagues.find(l => l.id === currentLeague);
    await window.networthOverlayAPI.setLastLeague(currentLeague, selectedLeague?.realm || 'pc');
    await loadLastScan(currentLeague);
    await preloadLeagueDataAndAutoScan();
  });
}

const displayChaosBtn = document.getElementById('displayChaosBtn');
if (displayChaosBtn) {
  displayChaosBtn.addEventListener('click', () => {
    setValueDisplayCurrency('chaos');
  });
}

const displayDivineBtn = document.getElementById('displayDivineBtn');
if (displayDivineBtn) {
  displayDivineBtn.addEventListener('click', () => {
    setValueDisplayCurrency('divine');
  });
}

const syncTabsBtn = document.getElementById('syncTabsBtn') || document.getElementById('scanAllBtn');
if (syncTabsBtn) {
  syncTabsBtn.addEventListener('click', async () => {
    const activeTabIndex = Number.isFinite(selectedTabIndex) ? selectedTabIndex : null;
    if (activeTabIndex === null) {
      await showAlertModal('No tab selected', 'Select one stash tab first.');
      return;
    }
    closeScanMenu();
    scanStashes(true, { tabIndices: [activeTabIndex] });
  });
}

const scanSelectedBtn = document.getElementById('scanSelectedBtn');
if (scanSelectedBtn) {
  scanSelectedBtn.addEventListener('click', () => {
    closeScanMenu();
    scanStashes(true);
  });
}

const syncAllAction = document.getElementById('syncAllAction');
if (syncAllAction) {
  syncAllAction.addEventListener('click', () => {
    closeScanMenu();
    scanStashes(false);
  });
}

const syncDropdownBtn = document.getElementById('syncDropdownBtn') || document.getElementById('scanMenuToggle');
if (syncDropdownBtn) {
  syncDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleScanMenu();
  });
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('scanMenu');
  const toggle = document.getElementById('syncDropdownBtn') || document.getElementById('scanMenuToggle');
  if (!menu || !toggle) return;
  if (!menu.contains(e.target) && !toggle.contains(e.target)) {
    closeScanMenu();
  }
});

const queueBtn = document.getElementById('queueBtn');
if (queueBtn) {
  queueBtn.addEventListener('click', () => {
    queueViewActive = !queueViewActive;
    updateMainViewVisibility();
    if (queueViewActive) {
    loadQueueView();
    } else {
      updateItemsTable();
      updateSelectedTotal();
    }
  });
}

const autoQueueUnpricedToggle = document.getElementById('autoQueueUnpricedToggle');
if (autoQueueUnpricedToggle) {
  autoQueueUnpricedToggle.addEventListener('change', async () => {
    const nextValue = autoQueueUnpricedToggle.checked === true;
    try {
      const preferences = await window.networthOverlayAPI.setPreferences({
        autoQueueUnpriced: nextValue,
      });
      autoQueueUnpriced = preferences?.autoQueueUnpriced === true;
      syncAutoQueueToggleUi();
    } catch (error) {
      console.warn('[NETWORTH-OVERLAY] Failed to update auto-queue preference:', error);
      syncAutoQueueToggleUi();
    }
  });
}

const queueUnpricedNowAction = document.getElementById('queueUnpricedNowAction');
if (queueUnpricedNowAction) {
  queueUnpricedNowAction.addEventListener('click', async () => {
    closeScanMenu();
    try {
      await queueUnpricedItemsNow({ silent: false });
    } catch (error) {
      console.warn('[NETWORTH-OVERLAY] Failed to queue unpriced items:', error);
      alert(`Failed to queue unpriced items: ${error?.message || 'Unknown error'}`);
    }
  });
}

setQueueViewFilter(queueViewFilter);

const queueFilterActiveBtn = document.getElementById('queueFilterActiveBtn');
if (queueFilterActiveBtn) {
  queueFilterActiveBtn.addEventListener('click', () => {
    setQueueViewFilter('active');
    if (queueViewActive) loadQueueView();
  });
}

const queueFilterHistoryBtn = document.getElementById('queueFilterHistoryBtn');
if (queueFilterHistoryBtn) {
  queueFilterHistoryBtn.addEventListener('click', () => {
    setQueueViewFilter('history');
    if (queueViewActive) loadQueueView();
  });
}

const queueRefreshBtn = document.getElementById('queueRefreshBtn');
if (queueRefreshBtn) {
  queueRefreshBtn.addEventListener('click', () => loadQueueView());
}

const queueClearBtn = document.getElementById('queueClearBtn');
if (queueClearBtn) {
  queueClearBtn.addEventListener('click', () => {
    if (queueViewFilter === 'history') {
      clearEntireQueue({ includeHistory: true });
      return;
    }
    clearEntireQueue({ includeHistory: false });
  });
}

// Double-click header to maximize/restore
// Use a custom double-click detection because -webkit-app-region: drag can interfere
let headerClickCount = 0;
let headerClickTimer = null;

// Dragging and double-click functionality
const headerElement = document.getElementById('overlayHeader');
const warningBanner = document.getElementById('warningBanner');

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let hasMoved = false;

// Add drag and double-click handler
function addHeaderHandlers(element, name) {
  element.addEventListener('mousedown', (e) => {
    console.log(`mousedown event fired on ${name}`, e.target, e.button);

    // Ignore if clicking on action buttons or inputs/selects
    if (e.target.closest('.header-actions') ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'BUTTON' ||
        e.target.tagName === 'INPUT') {
      return;
    }

    // Only handle left clicks
    if (e.button === 0) {
      isDragging = true;
      hasMoved = false;
      lastMouseX = e.screenX;
      lastMouseY = e.screenY;

      // Track for double-click
      headerClickCount++;

      if (headerClickCount === 1) {
        headerClickTimer = setTimeout(() => {
          headerClickCount = 0;
        }, 300);
      } else if (headerClickCount === 2) {
        // Double-click detected
        clearTimeout(headerClickTimer);
        headerClickCount = 0;
        isDragging = false;
        console.log(`Double click detected on ${name}! Calling maximize...`);
        window.networthOverlayAPI.maximize();
      }

      e.preventDefault();
    }
  });
}

// Global mousemove handler for dragging
document.addEventListener('mousemove', (e) => {
  if (isDragging && headerClickCount <= 1) {
    const deltaX = e.screenX - lastMouseX;
    const deltaY = e.screenY - lastMouseY;

    // Only move if there's actual movement (prevents jitter)
    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      hasMoved = true;
      window.networthOverlayAPI.moveWindow(deltaX, deltaY);
      lastMouseX = e.screenX;
      lastMouseY = e.screenY;
    }
  }
});

// Global mouseup handler
document.addEventListener('mouseup', (e) => {
  if (isDragging && hasMoved && headerClickCount === 1) {
    // Was dragging, reset click count to prevent false double-click
    clearTimeout(headerClickTimer);
    headerClickCount = 0;
  }
  isDragging = false;
  hasMoved = false;
});

// Add handlers to header and banner
addHeaderHandlers(headerElement, 'header');
if (warningBanner) addHeaderHandlers(warningBanner, 'banner');

// Wealth period buttons
document.querySelectorAll('.wealth-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.wealth-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // In echte implementatie zou je hier de grafiek periode aanpassen
    updateChart();
  });
});

// Breakdown view buttons
document.querySelectorAll('.breakdown-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.breakdown-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    breakdownView = btn.dataset.view;
    updateBreakdown();
  });
});

// Select all checkbox
document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = e.target.checked;
    const itemId = cb.dataset.itemId;
    if (e.target.checked) {
      selectedItems.add(itemId);
    } else {
      selectedItems.delete(itemId);
    }
  });
  updateSelectedTotal();
});

// Search input
document.getElementById('searchInput').addEventListener('input', () => {
  updateItemsTable();
  updateWealth();
  updateBreakdown();
  updateSelectedTotal();
  updateChart();
});

document.querySelectorAll('.items-table th.sortable-col[data-sort-key]').forEach((header) => {
  header.addEventListener('click', () => {
    const key = header.dataset.sortKey;
    if (!key) return;
    if (itemsSortState.key === key) {
      itemsSortState.direction = itemsSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      itemsSortState = {
        key,
        direction: key === 'name' || key === 'tab' ? 'asc' : 'desc',
      };
    }
    updateItemsTable();
  });
});

document.querySelectorAll('.sidebar-sort-btn[data-tab-sort-key]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.tabSortKey;
    if (!key) return;
    if (stashTabSortState.key === key) {
      stashTabSortState.direction = stashTabSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      stashTabSortState = {
        key,
        direction: key === 'name' ? 'asc' : 'desc',
      };
    }
    updateStashTabsSidebar();
  });
});

setValueDisplayCurrency('chaos', { refresh: false });

// Initialize
(async () => {
  console.log('[NETWORTH-OVERLAY] ============= INITIALIZATION STARTED =============');
  console.log('[NETWORTH-OVERLAY] document.readyState:', document.readyState);
  console.log('[NETWORTH-OVERLAY] window.networthOverlayAPI available:', !!window.networthOverlayAPI);

  try {
    console.log('[NETWORTH-OVERLAY] Starting loadLeagues()...');
    await loadLeagues();
    console.log('[NETWORTH-OVERLAY] loadLeagues() completed');
    await preloadLeagueDataAndAutoScan();
    console.log('[NETWORTH-OVERLAY] preloadLeagueDataAndAutoScan() completed');

    // Ensure tabs are rendered on initial load
    console.log('[NETWORTH-OVERLAY] Rendering view tabs...');
    renderViewTabs();
    console.log('[NETWORTH-OVERLAY] View tabs rendered');
    updateMainViewVisibility();

    console.log('[NETWORTH-OVERLAY] ============= INITIALIZATION COMPLETE =============');
  } catch (err) {
    console.error('[NETWORTH-OVERLAY] ============= INITIALIZATION FAILED =============');
    console.error('[NETWORTH-OVERLAY] Initialization error:', err);
    console.error('[NETWORTH-OVERLAY] Error stack:', err.stack);
  }

  // Update periodically
  setInterval(() => {
    updateChart();
    updateSyncStatus();
  }, 30000);

  // Poll pricing queue periodically to refresh stash values without opening queue
  setInterval(async () => {
    try {
      const data = await window.networthOverlayAPI.getTaskQueue();
      latestTaskQueueData = {
        pricing: Array.isArray(data?.pricing) ? data.pricing : [],
        scans: Array.isArray(data?.scans) ? data.scans : [],
      };
      const runPricingStateChanged = applyPricingQueueStateToAllRuns();
      const pricing = Array.isArray(data?.pricing) ? data.pricing : [];
      let maxTs = lastPricingUpdateTs;
      const hasNew = pricing.some(p => {
        const ts = p.updatedAt || p.createdAt || 0;
        if (p.status === 'done' && p.hasPrice && ts > lastPricingUpdateTs) {
          if (ts > maxTs) maxTs = ts;
          return true;
        }
        return false;
      });
      if (hasNew && maxTs > lastPricingUpdateTs) {
        lastPricingUpdateTs = maxTs;
        const scanData = await window.networthOverlayAPI.getLastScan(currentLeague);
        if (scanData) {
          lastScan = scanData;
          updateAll();
        }
      } else if (activeViewTab !== 'networth' && runPricingStateChanged) {
        updateItemsTable();
      }
    } catch (err) {
      // ignore polling errors
    }
  }, 7000);

  // Keep queue view live while it is open.
  setInterval(() => {
    if (!queueViewActive) return;
    loadQueueViewInternal({ silent: true });
  }, 2000);
})();

// ============================================
// TRACK RUN FEATURE
// ============================================

let trackingRun = null;
let countdownInterval = null;
let runEndTimeout = null;
let pendingTrackRunStart = null;
let trackRunWaitingTabStatus = new Map();
let runTabs = []; // Store completed run tabs
let viewTabs = [{ id: 'networth', name: 'Net Worth', icon: '💰', type: 'networth' }]; // View tabs (networth + runs)
let activeViewTab = 'networth'; // Currently active view tab

// Track run state
const trackRunState = {
  isRunning: false,
  isPaused: false,
  name: '',
  durationMinutes: 60,
  startTime: null,
  pausedTime: null,
  totalPausedMs: 0,
  lastIntermediateScanBucket: 0,
  isIntermediateScanRunning: false,
  remainingSeconds: 0,
  startScan: null,
  endScan: null,
  intermediateScan: null,
  runId: null,
  trackedTabIndices: [],
  trackedTabNames: [],
  autoPriceOnComplete: false,
  isStarting: false,
  isEnding: false,
};

const trackRunTabSelection = new Set();

function normalizePersistedRun(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const runId = typeof entry.runId === 'string' && entry.runId.trim() ? entry.runId.trim() : null;
  if (!runId) return null;
  return {
    runId,
    name: typeof entry.name === 'string' ? entry.name : '',
    isActive: false,
    startTime: Number(entry.startTime) || Date.now(),
    endTime: Number(entry.endTime) || Number(entry.startTime) || Date.now(),
    startScan: entry.startScan && typeof entry.startScan === 'object' ? entry.startScan : null,
    intermediateScan: entry.intermediateScan && typeof entry.intermediateScan === 'object' ? entry.intermediateScan : null,
    endScan: entry.endScan && typeof entry.endScan === 'object' ? entry.endScan : null,
    delta: entry.delta && typeof entry.delta === 'object' ? entry.delta : null,
    trackedTabIndices: normalizeTrackRunTabIndices(entry.trackedTabIndices),
    trackedTabNames: Array.isArray(entry.trackedTabNames) ? entry.trackedTabNames.map((value) => String(value || '')) : [],
    autoPriceOnComplete: entry.autoPriceOnComplete === true,
    warningMessage: typeof entry.warningMessage === 'string' ? entry.warningMessage : null,
  };
}

function persistTrackRunHistory() {
  const completedRuns = runTabs
    .filter((entry) => entry && entry.isActive === false)
    .sort((left, right) => Number(right?.endTime || 0) - Number(left?.endTime || 0))
    .slice(0, MAX_PERSISTED_RUNS);
  safeWriteJsonStorage(TRACK_RUN_HISTORY_STORAGE_KEY, completedRuns);
}

function restoreTrackRunHistory() {
  const restoredRuns = safeReadJsonStorage(TRACK_RUN_HISTORY_STORAGE_KEY, [])
    .map(normalizePersistedRun)
    .filter(Boolean)
    .sort((left, right) => Number(right?.endTime || 0) - Number(left?.endTime || 0));
  if (restoredRuns.length === 0) return;
  runTabs = restoredRuns;
  viewTabs = [
    { id: 'networth', name: 'Net Worth', icon: '💰', type: 'networth' },
    ...restoredRuns.map((run, index) => ({
      id: run.runId,
      name: run.name || `Run ${index + 1}`,
      icon: '?',
      type: 'run',
      isActive: false,
      index: index + 1,
    })),
  ];
}

restoreTrackRunHistory();

// Mock items voor pricing testing
const MOCK_PRICING_ITEMS = {
  rares: [
    { id: 'mock_rare_1', name: 'Entropy Guardian', typeLine: 'Wyrmscale Doublet', baseType: 'Wyrmscale Doublet', category: 'Body Armour', frameType: 2, ilvl: 71, corrupted: false,
      icon: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQXJtb3Vycy9Cb2R5QXJtb3Vycy9Cb2R5U3RyM0ludDMiLCJ3IjoyLCJoIjozLCJzY2FsZSI6MX1d/4f2ca10709/BodyStr3Int3.png',
      explicitMods: ['+34 to Strength', '+225 to Armour', '+327 to Evasion Rating', '+157 to maximum Life', '+23% to Lightning Resistance'],
      _networth: { value: 5, currency: 'chaos' },
      _pricing: {
        estimated: true,
        chaos: 5,
        divine: 0.025,
        confidence: 'low',
        sampleSize: 3,
        range: { min: 3, max: 8 },
        tradeUrl: 'https://www.pathofexile.com/trade/search/Mirage?q=' + encodeURIComponent(JSON.stringify({
          query: {
            status: { option: 'online' },
            type: 'Wyrmscale Doublet',
            stats: [{
              type: 'and',
              filters: [
                { id: 'pseudo.pseudo_total_life', value: { min: 140 } },
                { id: 'pseudo.pseudo_total_elemental_resistance', value: { min: 20 } }
              ]
            }],
            filters: {
              type_filters: { filters: { rarity: { option: 'rare' } } },
              misc_filters: { filters: { ilvl: { min: 70 } } }
            }
          },
          sort: { price: 'asc' }
        })),
        allMods: [
          { text: '+34 to Strength', type: 'explicit', selected: false, range: { min: 34 } },
          { text: '+225 to Armour', type: 'explicit', selected: false, range: { min: 225 } },
          { text: '+327 to Evasion Rating', type: 'explicit', selected: false, range: { min: 327 } },
          { text: '+157 to maximum Life', type: 'explicit', selected: true, range: { min: 140 } },
          { text: '+23% to Lightning Resistance', type: 'explicit', selected: true, range: { min: 20 } }
        ],
        priceDetails: {
          all: [
            { amount: 3, currency: 'chaos', chaos: 3 },
            { amount: 5, currency: 'chaos', chaos: 5 },
            { amount: 8, currency: 'chaos', chaos: 8 }
          ],
          usedForAverage: [
            { amount: 3, currency: 'chaos', chaos: 3 },
            { amount: 5, currency: 'chaos', chaos: 5 },
            { amount: 8, currency: 'chaos', chaos: 8 }
          ]
        }
      } },
    { id: 'mock_rare_2', name: 'Mind Guardian', typeLine: 'Legion Plate', baseType: 'Legion Plate', category: 'Body Armour', frameType: 2, ilvl: 82, corrupted: false,
      icon: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQXJtb3Vycy9Cb2R5QXJtb3Vycy9Cb2R5U3RyOSIsInciOjIsImgiOjMsInNjYWxlIjoxfV0/ea82aa7c43/BodyStr9.png',
      explicitMods: ['+85 to Armour', '79% increased Armour', '+203 to maximum Life', '+35% to Chaos Resistance'],
      craftedMods: ['+12% to Fire and Chaos Resistances'],
      _networth: { value: 16, currency: 'chaos' },
      _pricing: {
        estimated: true,
        chaos: 16,
        divine: 0.08,
        confidence: 'high',
        sampleSize: 10,
        range: { min: 12, max: 22 },
        tradeUrl: 'https://www.pathofexile.com/trade/search/Mirage?q=' + encodeURIComponent(JSON.stringify({
          query: {
            status: { option: 'online' },
            type: 'Legion Plate',
            stats: [{
              type: 'and',
              filters: [
                { id: 'pseudo.pseudo_total_life', value: { min: 182 } },
                { id: 'pseudo.pseudo_total_chaos_resistance', value: { min: 31 } }
              ]
            }],
            filters: {
              type_filters: { filters: { rarity: { option: 'rare' } } },
              misc_filters: { filters: { ilvl: { min: 82 } } }
            }
          },
          sort: { price: 'asc' }
        })),
        allMods: [
          { text: '+85 to Armour', type: 'explicit', selected: false, range: { min: 85 } },
          { text: '79% increased Armour', type: 'explicit', selected: false, range: { min: 79 } },
          { text: '+203 to maximum Life', type: 'explicit', selected: true, range: { min: 182 } },
          { text: '+35% to Chaos Resistance', type: 'explicit', selected: true, range: { min: 31 } },
          { text: '+12% to Fire and Chaos Resistances', type: 'crafted', selected: false, range: { min: 12 } }
        ],
        priceDetails: {
          all: [
            { amount: 12, currency: 'chaos', chaos: 12 },
            { amount: 14, currency: 'chaos', chaos: 14 },
            { amount: 15, currency: 'chaos', chaos: 15 },
            { amount: 16, currency: 'chaos', chaos: 16 },
            { amount: 18, currency: 'chaos', chaos: 18 },
            { amount: 20, currency: 'chaos', chaos: 20 },
            { amount: 22, currency: 'chaos', chaos: 22 },
            { amount: 25, currency: 'chaos', chaos: 25 },
            { amount: 30, currency: 'chaos', chaos: 30 },
            { amount: 35, currency: 'chaos', chaos: 35 }
          ],
          usedForAverage: [
            { amount: 12, currency: 'chaos', chaos: 12 },
            { amount: 14, currency: 'chaos', chaos: 14 },
            { amount: 15, currency: 'chaos', chaos: 15 },
            { amount: 16, currency: 'chaos', chaos: 16 },
            { amount: 18, currency: 'chaos', chaos: 18 }
          ]
        }
      } },
    { id: 'mock_rare_3', name: 'Rune Coat', typeLine: 'Varnished Coat', baseType: 'Varnished Coat', category: 'Body Armour', frameType: 2, ilvl: 83, corrupted: false, fractured: true,
      icon: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQXJtb3Vycy9Cb2R5QXJtb3Vycy9Cb2R5RGV4SW50NCIsInciOjIsImgiOjMsInNjYWxlIjoxfV0/9a74ae1c1f/BodyDexInt4.png',
      implicitMods: ['Determination has 19% increased Aura Effect'],
      fracturedMods: ['+1 to maximum number of Spectres'],
      explicitMods: ['+164 to maximum Life', '+44 to maximum Mana', '+15% to Cold Resistance', '+29% to Chaos Resistance'],
      influences: { searing: true, eater: true },
      _networth: { value: 10, currency: 'chaos' },
      _pricing: {
        estimated: true,
        chaos: 10,
        divine: 0.05,
        confidence: 'medium',
        sampleSize: 4,
        range: { min: 7, max: 15 },
        tradeUrl: 'https://www.pathofexile.com/trade/search/Mirage?q=' + encodeURIComponent(JSON.stringify({
          query: {
            status: { option: 'online' },
            type: 'Varnished Coat',
            stats: [{
              type: 'and',
              filters: [
                { id: 'implicit.stat_3653400807', value: { min: 19 } },
                { id: 'fractured.stat_125218179', value: { min: 1 } },
                { id: 'pseudo.pseudo_total_life', value: { min: 150 } }
              ]
            }],
            filters: {
              type_filters: { filters: { rarity: { option: 'rare' } } },
              misc_filters: { filters: { ilvl: { min: 83 }, fractured_item: { option: 'true' } } }
            }
          },
          sort: { price: 'asc' }
        })),
        allMods: [
          { text: 'Determination has 19% increased Aura Effect', type: 'implicit', selected: true, range: { min: 19 } },
          { text: '+1 to maximum number of Spectres', type: 'fractured', selected: true, range: {} },
          { text: '+164 to maximum Life', type: 'explicit', selected: true, range: { min: 150 } },
          { text: '+44 to maximum Mana', type: 'explicit', selected: false, range: { min: 44 } },
          { text: '+15% to Cold Resistance', type: 'explicit', selected: false, range: { min: 15 } },
          { text: '+29% to Chaos Resistance', type: 'explicit', selected: false, range: { min: 29 } }
        ],
        priceDetails: {
          all: [
            { amount: 7, currency: 'chaos', chaos: 7 },
            { amount: 9, currency: 'chaos', chaos: 9 },
            { amount: 11, currency: 'chaos', chaos: 11 },
            { amount: 15, currency: 'chaos', chaos: 15 }
          ],
          usedForAverage: [
            { amount: 7, currency: 'chaos', chaos: 7 },
            { amount: 9, currency: 'chaos', chaos: 9 },
            { amount: 11, currency: 'chaos', chaos: 11 },
            { amount: 15, currency: 'chaos', chaos: 15 }
          ]
        }
      } }
  ],
  uniques: [
    { id: 'mock_unique_1', name: "Berek's Respite", typeLine: 'Two-Stone Ring', baseType: 'Two-Stone Ring', category: 'Ring', frameType: 3, ilvl: 83, corrupted: false, isFoulborn: true,
      icon: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvUmluZ3MvVHdvU3RvbmVSaW5nIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/6f0e047d08/TwoStoneRing.png',
      implicitMods: ['+13% to Fire and Lightning Resistances'],
      explicitMods: ["Ignited Enemies you Kill Explode, dealing 5% of their Life as Fire Damage which cannot Ignite", 'Adds 24 to 33 Fire Damage to Spells and Attacks', '28% increased Lightning Damage', '+34 to maximum Mana'],
      foulbornMods: ["Shocked Enemies you Kill Explode, dealing 5% of their Life as Lightning Damage which cannot Shock"],
      _networth: { value: 12000, currency: 'chaos' },
      _pricing: {
        estimated: true,
        chaos: 12000,
        divine: 60,
        confidence: 'medium',
        sampleSize: 2,
        range: { min: 10000, max: 14000 },
        tradeUrl: 'https://www.pathofexile.com/trade/search/Mirage?q=' + encodeURIComponent(JSON.stringify({
          query: {
            status: { option: 'online' },
            name: "Berek's Respite",
            type: 'Two-Stone Ring',
            stats: [{
              type: 'and',
              filters: [
                { id: 'explicit.stat_3141070085', disabled: false },
                { id: 'explicit.stat_1334060246', value: { min: 24, max: 33 } }
              ]
            }],
            filters: {
              type_filters: { filters: { rarity: { option: 'unique' } } },
              misc_filters: { filters: { ilvl: { min: 83 }, foulborn_item: { option: 'true' } } }
            }
          },
          sort: { price: 'asc' }
        })),
        allMods: [
          { text: '+13% to Fire and Lightning Resistances', type: 'implicit', selected: false, range: { min: 13 } },
          { text: "Ignited Enemies you Kill Explode, dealing 5% of their Life as Fire Damage which cannot Ignite", type: 'explicit', selected: true, range: {} },
          { text: 'Adds 24 to 33 Fire Damage to Spells and Attacks', type: 'explicit', selected: true, range: { min: 24, max: 33 } },
          { text: '28% increased Lightning Damage', type: 'explicit', selected: true, range: { min: 28 } },
          { text: '+34 to maximum Mana', type: 'explicit', selected: true, range: { min: 34 } },
          { text: "Shocked Enemies you Kill Explode, dealing 5% of their Life as Lightning Damage which cannot Shock", type: 'foulborn', selected: true, range: {} }
        ],
        priceDetails: {
          all: [
            { amount: 50, currency: 'divine', chaos: 10000 },
            { amount: 70, currency: 'divine', chaos: 14000 }
          ],
          usedForAverage: [
            { amount: 50, currency: 'divine', chaos: 10000 },
            { amount: 70, currency: 'divine', chaos: 14000 }
          ]
        }
      } }
  ]
};

function normalizeTrackRunTabIndices(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => toTabIndex(value))
        .filter((value) => value !== null)
    )
  );
}

function getTrackRunSelectableTabs() {
  return sortStashTabs(getSelectableStashTabs());
}

function getDefaultTrackRunTabIndices() {
  const available = new Set(getTrackRunSelectableTabs().map((tab) => tab.index));
  if (trackRunTabSelection.size > 0) {
    return Array.from(trackRunTabSelection).filter((index) => available.has(index));
  }
  return getContextTrackRunTabIndices();
}

function getContextTrackRunTabIndices() {
  const available = new Set(getTrackRunSelectableTabs().map((tab) => tab.index));
  if (Number.isFinite(selectedTabIndex) && available.has(selectedTabIndex)) {
    return [selectedTabIndex];
  }
  const sidebar = Array.from(sidebarSelection).filter((index) => available.has(index));
  if (sidebar.length > 0) {
    return sidebar;
  }
  const scanSelection = Array.from(scanTabSelection).filter((index) => available.has(index));
  if (scanSelection.length > 0) {
    return scanSelection;
  }
  return [];
}

function getTrackRunTabNames(tabIndices) {
  const namesByIndex = new Map(getTrackRunSelectableTabs().map((tab) => [tab.index, tab.name]));
  return normalizeTrackRunTabIndices(tabIndices).map((index) => namesByIndex.get(index) || `Tab ${index + 1}`);
}

function filterScanToTrackedTabs(scan, tabIndices, { fallbackTimestamp = Date.now(), warningMessage = null } = {}) {
  if (!scan || typeof scan !== 'object') return null;
  const selected = new Set(normalizeTrackRunTabIndices(tabIndices));
  if (selected.size === 0) return null;
  const items = getItemsForScan(scan).filter((item) => selected.has(resolveItemTabIndex(item)));
  const tabDetails = buildTabDetailsFromItems(scan, items)
    .filter((tab) => selected.has(toTabIndex(tab?.index)))
    .map((tab) => ({ ...tab }));
  return buildDerivedNetworthViewData({
    ...scan,
    timestamp: Number(scan.timestamp) || fallbackTimestamp,
    items,
    itemsArray: items,
    tabDetails,
    warningMessage: warningMessage || scan.warningMessage || null,
  });
}

function getBestAvailableRunSnapshot(tabIndices, warningMessage = null) {
  const candidates = [
    lastScan,
    trackRunState.intermediateScan,
    trackRunState.startScan,
  ];
  for (const candidate of candidates) {
    const filtered = filterScanToTrackedTabs(candidate, tabIndices, { warningMessage });
    if (filtered && Array.isArray(filtered.items)) {
      return filtered;
    }
  }
  return null;
}

function mergeTrackedSnapshotIntoLastScan(snapshot, tabIndices) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const trackedSet = new Set(normalizeTrackRunTabIndices(tabIndices));
  if (trackedSet.size === 0) return false;

  const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : getItemsForScan(snapshot);
  const snapshotTabDetails = Array.isArray(snapshot.tabDetails) ? snapshot.tabDetails : [];

  if (!lastScan || typeof lastScan !== 'object') {
    lastScan = buildDerivedNetworthViewData(snapshot);
    return true;
  }

  const previousItems = getItemsForScan(lastScan);
  const preservedItems = previousItems.filter((item) => {
    const tabIndex = resolveItemTabIndex(item);
    return tabIndex === null || !trackedSet.has(tabIndex);
  });
  const mergedItems = preservedItems.concat(snapshotItems);

  const previousTabDetails = Array.isArray(lastScan.tabDetails) ? lastScan.tabDetails : [];
  const preservedTabDetails = previousTabDetails.filter((tab) => {
    const tabIndex = toTabIndex(tab?.index);
    return tabIndex === null || !trackedSet.has(tabIndex);
  });
  const mergedTabDetails = preservedTabDetails.concat(
    snapshotTabDetails.filter((tab) => trackedSet.has(toTabIndex(tab?.index)))
  );

  lastScan = buildDerivedNetworthViewData({
    ...lastScan,
    ...snapshot,
    timestamp: Number(snapshot.timestamp) || Date.now(),
    items: mergedItems,
    itemsArray: mergedItems,
    tabDetails: mergedTabDetails,
    warningMessage: snapshot.warningMessage || lastScan.warningMessage || null,
  });

  return true;
}

function setTrackRunModalBusy(isBusy, label = 'Start Run') {
  const startButton = document.getElementById('startTrackRun');
  const cancelButton = document.getElementById('cancelTrackRun');
  const closeButton = document.getElementById('closeTrackRunModal');
  if (startButton) {
    startButton.disabled = isBusy;
    startButton.textContent = isBusy ? label : 'Start Run';
  }
  if (cancelButton) {
    cancelButton.disabled = isBusy;
  }
  if (closeButton) {
    closeButton.disabled = isBusy;
  }
}

function getRunQueueableDeltaItems(run) {
  if (!run || !run.delta || !Array.isArray(run.delta.itemsArray)) return [];
  return run.delta.itemsArray.filter((item) => Number(item?._deltaSign) > 0 && isQueueableForSmartPricing(item));
}

function toRunPricingItemKey(item) {
  if (!item || typeof item !== 'object') return '';
  const directId = String(item.id || item.itemId || item.item_id || '').trim();
  if (directId) return directId;

  const tabIndex = toTabIndex(item.tabIndex ?? item._tabIndex);
  const stackSize = Number.parseInt(String(item.stackSize ?? item.stack_size ?? 1), 10);
  const x = Number.isFinite(item?.position?.x) ? item.position.x : item.x;
  const y = Number.isFinite(item?.position?.y) ? item.position.y : item.y;

  return [
    String(item.league || '').trim(),
    String(item.characterName || item.character || '').trim(),
    String(item.baseType || item.typeLine || item.type_line || item.name || 'unknown').trim(),
    Number.isFinite(tabIndex) ? tabIndex : String(item.inventoryId || item.inventory_id || '').trim(),
    Number.isFinite(x) ? x : '',
    Number.isFinite(y) ? y : '',
    Number.isFinite(stackSize) ? stackSize : '',
  ].join('|');
}

function getLatestPricingEntriesByItemKey() {
  const pricingEntries = Array.isArray(latestTaskQueueData?.pricing) ? latestTaskQueueData.pricing : [];
  const map = new Map();
  pricingEntries.forEach((entry) => {
    const itemKey = String(entry?.itemKey || '').trim();
    if (!itemKey) return;
    map.set(itemKey, entry);
  });
  return map;
}

function getRunItemPricingStatus(item) {
  if (Number(item?._deltaSign) <= 0) {
    return null;
  }
  if (!isQueueableForSmartPricing(item)) {
    return { label: 'Not priceable', className: 'na' };
  }

  const explicitStatus = String(item?._runPricingStatus || '').trim().toLowerCase();
  if (explicitStatus === 'priced') return { label: 'Priced', className: 'priced' };
  if (explicitStatus === 'processing') return { label: 'Pricing', className: 'processing' };
  if (explicitStatus === 'queued') return { label: 'Queued', className: 'queued' };
  if (explicitStatus === 'failed') return { label: 'Failed', className: 'failed' };
  return { label: 'Todo', className: 'todo' };
}

function applyPricingQueueStateToRun(run) {
  if (!run?.delta || !Array.isArray(run.delta.itemsArray)) return false;
  const pricingEntriesByKey = getLatestPricingEntriesByItemKey();
  let changed = false;

  run.delta.itemsArray.forEach((item) => {
    if (Number(item?._deltaSign) <= 0) return;

    let nextStatus = 'todo';
    if (!isQueueableForSmartPricing(item)) {
      nextStatus = 'na';
    } else {
      const queueEntry = pricingEntriesByKey.get(toRunPricingItemKey(item));
      const status = String(queueEntry?.status || '').toLowerCase();
      if (queueEntry?.hasPrice === true && status === 'done') {
        nextStatus = 'priced';
      } else if (status === 'processing' || status === 'in_progress' || status === 'running') {
        nextStatus = 'processing';
      } else if (status === 'queued' || status === 'pending') {
        nextStatus = 'queued';
      } else if (status === 'failed') {
        nextStatus = 'failed';
      } else if (run.autoPriceOnComplete === true) {
        nextStatus = 'todo';
      }

      if (queueEntry?.hasPrice === true && status === 'done') {
        const nextChaosValue = Number(queueEntry.pricingChaos ?? queueEntry?.pricing?.chaos ?? 0);
        if (Number.isFinite(nextChaosValue) && nextChaosValue > 0) {
          const previousValue = Number(item?._networth?.value ?? 0);
          const previousCurrency = String(item?._networth?.currency || 'chaos').toLowerCase();
          if (previousValue !== nextChaosValue || previousCurrency !== 'chaos') {
            item._networth = {
              ...(item._networth || {}),
              value: nextChaosValue,
              currency: 'chaos',
              source: 'trade',
            };
            changed = true;
          }
        }
        if (queueEntry?.pricing && item._pricing !== queueEntry.pricing) {
          item._pricing = queueEntry.pricing;
          changed = true;
        }
      }
    }

    if (item._runPricingStatus !== nextStatus) {
      item._runPricingStatus = nextStatus;
      changed = true;
    }
  });

  return changed;
}

function applyPricingQueueStateToAllRuns() {
  let changed = false;
  runTabs.forEach((run) => {
    if (applyPricingQueueStateToRun(run)) {
      changed = true;
    }
  });
  return changed;
}

async function queueRunDeltaItems(run, { silent = false } = {}) {
  const itemsToQueue = getRunQueueableDeltaItems(run);
  if (itemsToQueue.length === 0) {
    if (run && typeof run === 'object') {
      run.warningMessage = 'No queueable run loot found for automatic smart pricing.';
    }
    if (!silent) {
      alert('No queueable run loot found. Only added magic, rare, and unique items can be smart-priced.');
    }
    return { queued: 0 };
  }

  try {
    const league = getOperationalLeague(currentLeague || run?.startScan?.league || run?.endScan?.league);
    const runLabel = String(run?.name || run?.runId || 'Tracked run').trim() || 'Tracked run';
    let queueTask = null;
    try {
      queueTask = await window.networthOverlayAPI.enqueueScanTask({
        type: 'run_smart_price',
        name: runLabel,
        league,
        status: 'in_progress',
        runId: run?.runId || null,
        queuedItems: 0,
      });
    } catch (queueTaskError) {
      console.warn('[PRICING] Failed to enqueue run smart-pricing task row', queueTaskError);
    }

    const result = await window.networthOverlayAPI.enqueuePricingItems(itemsToQueue, league);
    itemsToQueue.forEach((item) => {
      item._runPricingStatus = result?.queued > 0 ? 'queued' : 'todo';
    });
    if (queueTask?.id) {
      await window.networthOverlayAPI.enqueueScanTask({
        id: queueTask.id,
        type: 'run_smart_price',
        name: runLabel,
        league,
        status: result?.queued > 0 ? 'queued' : 'failed',
        runId: run?.runId || null,
        queuedItems: Number(result?.queued || 0),
        lastError: result?.queued > 0
          ? ''
          : (typeof result?.error === 'string' ? result.error : 'No run items were queued for smart pricing.'),
      });
    }

    if (run && typeof run === 'object') {
      run.warningMessage = result?.queued > 0
        ? null
        : (typeof result?.error === 'string' && result.error.trim()
          ? `Automatic smart pricing queued 0 items: ${result.error.trim()}`
          : 'Automatic smart pricing queued 0 items.');
    }

    if (!silent) {
      if (result?.queued > 0) {
        alert(`Queued ${result.queued} run item(s) for smart pricing.`);
      } else {
        const reason = typeof result?.error === 'string' && result.error.trim()
          ? ` (${result.error.trim()})`
          : '';
        alert(`No run items were added to the pricing queue${reason}.`);
      }
    }
    if (queueViewActive) {
      loadQueueView();
    }
    if (activeViewTab === run?.runId) {
      updateAll();
    }
    return result || { queued: 0 };
  } catch (error) {
    console.error('[NETWORTH-OVERLAY] Failed to queue run delta items for pricing', error);
    if (run && typeof run === 'object') {
      run.warningMessage = `Automatic smart pricing failed: ${error?.message || String(error)}`;
    }
    if (!silent) {
      alert('Could not add run loot to the pricing queue.');
    }
    return { queued: 0, error: error?.message || String(error) };
  }
}

function updateRunActionButton() {
  const button = document.getElementById('runSmartPriceBtn');
  if (!button) return;
  const run = runTabs.find((entry) => entry.runId === activeViewTab);
  const isCompletedRun = !!(run && run.isActive === false && run.delta);
  const queueableCount = isCompletedRun ? getRunQueueableDeltaItems(run).length : 0;

  if (!isCompletedRun || queueableCount === 0) {
    button.style.display = 'none';
    button.disabled = false;
    button.textContent = 'Smart price run loot';
    return;
  }

  button.style.display = 'inline-flex';
  button.disabled = false;
  button.textContent = `Smart price run loot (${queueableCount})`;
}

function renderTrackRunTabList() {
  const listEl = document.getElementById('trackRunTabList');
  if (!listEl) return;
  const tabs = getTrackRunSelectableTabs();
  listEl.innerHTML = '';
  if (tabs.length === 0) {
    listEl.innerHTML = '<div class="track-run-tab-empty">No stash tabs loaded for the current league.</div>';
    return;
  }

  for (const tab of tabs) {
    const row = document.createElement('div');
    row.className = 'track-run-tab-row';
    const checked = trackRunTabSelection.has(tab.index);
    const valueText = formatDisplayValueFromChaos(getTabChaosValue(tab));
    row.innerHTML = `
      <label>
        <input type="checkbox" data-run-tab-index="${tab.index}" ${checked ? 'checked' : ''}>
        <span>${escapeHtml(tab.name)} (${tab.index})</span>
      </label>
      <div class="track-run-tab-meta">${tab.itemCount || 0} items | ${escapeHtml(valueText)}</div>
    `;
    const input = row.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) {
        trackRunTabSelection.add(tab.index);
      } else {
        trackRunTabSelection.delete(tab.index);
      }
    });
    row.addEventListener('click', (event) => {
      if (event.target instanceof HTMLInputElement) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change'));
    });
    listEl.appendChild(row);
  }
}

async function ensureTrackRunTabsLoaded() {
  if (getTrackRunSelectableTabs().length > 0 || !currentLeague) {
    return;
  }
  try {
    const selectedLeague = leagues.find((entry) => entry.id === currentLeague);
    const stashData = await window.networthOverlayAPI.getStashTabs({
      realm: selectedLeague?.realm || 'pc',
      league: currentLeague,
    });
    availableStashTabs = Array.isArray(stashData?.tabs) ? stashData.tabs : [];
  } catch (error) {
    console.warn('[NETWORTH-OVERLAY] Failed to load tabs for run tracking:', error);
  }
}

async function captureTrackRunSnapshot(tabIndices) {
  const selectedLeague = leagues.find((entry) => entry.id === currentLeague);
  const result = await window.networthOverlayAPI.scanStashesSnapshot({
    league: currentLeague,
    realm: selectedLeague?.realm || 'pc',
    tabIndices: normalizeTrackRunTabIndices(tabIndices),
    includeInventory: false,
    maxTabsPerScan: Math.max(1, normalizeTrackRunTabIndices(tabIndices).length),
  });
  const snapshot = buildDerivedNetworthViewData(result.scan);
  if (mergeTrackedSnapshotIntoLastScan(snapshot, tabIndices)) {
    updateStashTabsSidebar();
    if (activeViewTab === 'networth') {
      updateAll();
    }
  }
  return snapshot;
}

function getRunItemStableKey(item) {
  if (!item || typeof item !== 'object') return '';
  const directId = String(item.id || item.itemId || item.item_id || '').trim();
  if (directId) return directId;
  const fragments = [
    String(item.name || '').trim(),
    String(item.typeLine || '').trim(),
    String(item.baseType || '').trim(),
    String(item._tabIndex ?? item.tabIndex ?? ''),
    String(item.x ?? ''),
    String(item.y ?? ''),
    String(item.w ?? ''),
    String(item.h ?? ''),
    String(item.inventoryId || item.inventory_id || ''),
  ];
  return fragments.join('|');
}

function scaleRunItemNetworthValue(item, quantity) {
  const safeQuantity = Math.max(1, Number(quantity) || 1);
  const sourceQuantity = Math.max(1, Number(item?.stackSize || 1));
  const sourceValue = Number(item?._networth?.value);
  if (!Number.isFinite(sourceValue) || sourceValue <= 0) return 0;
  return sourceValue * (safeQuantity / sourceQuantity);
}

function buildRunDeltaItem(item, quantity, sign, stableKey) {
  const safeQuantity = Math.max(1, Number(quantity) || 1);
  const totalValue = scaleRunItemNetworthValue(item, safeQuantity);
  return {
    ...item,
    id: `run-delta:${stableKey}:${sign > 0 ? 'add' : 'remove'}`,
    stackSize: safeQuantity,
    _deltaSign: sign > 0 ? 1 : -1,
    _deltaStableKey: stableKey,
    _networth: {
      ...(item?._networth || {}),
      value: totalValue,
    },
  };
}

function calculateDelta(startScan, endScan) {
  if (!startScan || !endScan) return null;

  const startItems = Array.isArray(startScan.items) ? startScan.items : getItemsForScan(startScan);
  const endItems = Array.isArray(endScan.items) ? endScan.items : getItemsForScan(endScan);
  const startByKey = new Map(startItems.map((item) => [getRunItemStableKey(item), item]).filter(([key]) => key));
  const endByKey = new Map(endItems.map((item) => [getRunItemStableKey(item), item]).filter(([key]) => key));
  const allKeys = new Set([...startByKey.keys(), ...endByKey.keys()]);

  const itemsArray = [];
  let addedChaos = 0;
  let removedChaos = 0;

  for (const key of allKeys) {
    const startItem = startByKey.get(key) || null;
    const endItem = endByKey.get(key) || null;
    const startQuantity = Math.max(0, Number(startItem?.stackSize || 0));
    const endQuantity = Math.max(0, Number(endItem?.stackSize || 0));
    const diff = endQuantity - startQuantity;
    if (diff === 0) continue;

    const sourceItem = diff > 0 ? endItem : startItem;
    if (!sourceItem) continue;
    const deltaItem = buildRunDeltaItem(sourceItem, Math.abs(diff), diff > 0 ? 1 : -1, key);
    itemsArray.push(deltaItem);

    const chaosValue = Number(deltaItem?._networth?.value || 0) * (getCurrencyRate(deltaItem?._networth?.currency || 'chaos') || 1);
    if (diff > 0) {
      addedChaos += chaosValue;
    } else {
      removedChaos += chaosValue;
    }
  }

  itemsArray.sort((left, right) => {
    const leftValue = Number(left?._networth?.value || 0) * (getCurrencyRate(left?._networth?.currency || 'chaos') || 1);
    const rightValue = Number(right?._networth?.value || 0) * (getCurrencyRate(right?._networth?.currency || 'chaos') || 1);
    return rightValue - leftValue;
  });

  const totalChaos = addedChaos - removedChaos;
  return {
    itemsArray,
    addedChaos,
    removedChaos,
    totalChaos,
    totalDivine: totalChaos / getDivineRate(),
    summary: {
      addedItems: itemsArray.filter((item) => Number(item?._deltaSign) > 0).length,
      removedItems: itemsArray.filter((item) => Number(item?._deltaSign) < 0).length,
    },
  };
}

// Format time for display
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getTrackRunRemainingSeconds(now = Date.now()) {
  if (!trackRunState.isRunning || !Number.isFinite(trackRunState.startTime)) {
    return Math.max(0, Number(trackRunState.remainingSeconds) || 0);
  }

  const totalRunMs = Math.max(0, Number(trackRunState.durationMinutes) || 0) * 60 * 1000;
  let elapsedMs = now - trackRunState.startTime - trackRunState.totalPausedMs;

  if (trackRunState.isPaused && Number.isFinite(trackRunState.pausedTime)) {
    elapsedMs -= Math.max(0, now - trackRunState.pausedTime);
  }

  const remainingMs = Math.max(0, totalRunMs - Math.max(0, elapsedMs));
  return Math.ceil(remainingMs / 1000);
}

function getTrackRunElapsedSeconds(now = Date.now()) {
  const totalSeconds = Math.max(0, Number(trackRunState.durationMinutes) || 0) * 60;
  return Math.max(0, totalSeconds - getTrackRunRemainingSeconds(now));
}

function syncTrackRunClock({ now = Date.now(), allowEndRun = true } = {}) {
  if (!trackRunState.isRunning) {
    return Math.max(0, Number(trackRunState.remainingSeconds) || 0);
  }

  const remainingSeconds = getTrackRunRemainingSeconds(now);
  trackRunState.remainingSeconds = remainingSeconds;

  if (!trackRunState.isPaused && !trackRunState.isEnding) {
    const elapsedSeconds = getTrackRunElapsedSeconds(now);
    const intermediateBucket = Math.floor(elapsedSeconds / 300);
    if (intermediateBucket > trackRunState.lastIntermediateScanBucket) {
      trackRunState.lastIntermediateScanBucket = intermediateBucket;
      if (!trackRunState.isIntermediateScanRunning && elapsedSeconds > 0) {
        void performIntermediateScan();
      }
    }

    if (allowEndRun && remainingSeconds <= 0) {
      void endRun();
    }
  }

  return remainingSeconds;
}

// Update countdown timer display
function updateCountdownDisplay() {
  const timerEl = document.getElementById('runTimerText');
  const profitEl = document.getElementById('runTimerProfit');
  syncTrackRunClock({ allowEndRun: false });

  if (trackRunState.isRunning && !trackRunState.isPaused && !trackRunState.isEnding && trackRunState.remainingSeconds <= 0) {
    void endRun();
  }

  timerEl.textContent = formatTime(trackRunState.remainingSeconds);

  // Update timer color based on remaining time
  timerEl.className = 'run-timer-text';
  if (trackRunState.remainingSeconds <= 60) {
    timerEl.classList.add('critical');
  } else if (trackRunState.remainingSeconds <= 300) {
    timerEl.classList.add('warning');
  }

  // Show intermediate profit if available
  let delta = null;
  if (trackRunState.intermediateScan && trackRunState.startScan) {
    delta = calculateDelta(trackRunState.startScan, trackRunState.intermediateScan);
    if (delta) {
      const profitText = formatDisplayValueFromChaos(delta.totalChaos, { signed: true });
      profitEl.textContent = profitText;
      profitEl.className = 'run-timer-profit' + (delta.totalChaos >= 0 ? '' : ' negative');
    }
  } else {
    profitEl.textContent = '-';
    profitEl.className = 'run-timer-profit';
  }

  // Send timer update to management window (dock)
  if (window.networthOverlayAPI?.sendRunTimerUpdate) {
    const endsAt = trackRunState.isPaused
      ? null
      : Date.now() + (Math.max(0, Number(trackRunState.remainingSeconds) || 0) * 1000);
    window.networthOverlayAPI.sendRunTimerUpdate({
      remainingSeconds: trackRunState.remainingSeconds,
      profit: delta,
      isPaused: trackRunState.isPaused,
      endsAt,
    });
  }
}

function clearRunEndTimeout() {
  if (!runEndTimeout) return;
  clearTimeout(runEndTimeout);
  runEndTimeout = null;
}

function scheduleRunEndTimeout() {
  clearRunEndTimeout();
  if (!trackRunState.isRunning || trackRunState.isPaused || trackRunState.isEnding) {
    return;
  }
  const remainingSeconds = syncTrackRunClock({ allowEndRun: false });
  const delayMs = Math.max(0, remainingSeconds * 1000);
  runEndTimeout = setTimeout(() => {
    if (!trackRunState.isRunning || trackRunState.isPaused || trackRunState.isEnding) return;
    void endRun();
  }, delayMs);
}

// Start countdown
function startCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  syncTrackRunClock();
  updateCountdownDisplay();

  countdownInterval = setInterval(() => {
    if (!trackRunState.isRunning) return;
    syncTrackRunClock();
    updateCountdownDisplay();
  }, 1000);
}

// Perform intermediate scan
async function performIntermediateScan() {
  if (!trackRunState.isRunning || trackRunState.trackedTabIndices.length === 0 || trackRunState.isIntermediateScanRunning) {
    return;
  }
  trackRunState.isIntermediateScanRunning = true;
  try {
    trackRunState.intermediateScan = await captureTrackRunSnapshot(trackRunState.trackedTabIndices);
    const runIndex = runTabs.findIndex((run) => run.runId === trackRunState.runId);
    if (runIndex !== -1) {
      runTabs[runIndex].intermediateScan = trackRunState.intermediateScan;
      runTabs[runIndex].delta = calculateDelta(trackRunState.startScan, trackRunState.intermediateScan);
    }
    if (activeViewTab === trackRunState.runId) {
      updateAll();
    }
    updateCountdownDisplay();
  } catch (error) {
    console.warn('[NETWORTH-OVERLAY] Intermediate run scan failed:', error);
  } finally {
    trackRunState.isIntermediateScanRunning = false;
  }
}

function renderTrackRunWaitingTabs(tabNames) {
  const listEl = document.getElementById('trackRunWaitingTabs');
  if (!listEl) return;
  const rows = Array.isArray(tabNames) ? tabNames : [];
  listEl.innerHTML = rows.length > 0
    ? rows.map((name) => `
      <div class="track-run-waiting-tab" data-tab-name="${escapeHtml(String(name || 'Unknown tab'))}">
        <span>${escapeHtml(String(name || 'Unknown tab'))}</span>
        <span class="track-run-waiting-tab-status">Scanning...</span>
      </div>
    `).join('')
    : '<div class="track-run-tab-empty">No tabs selected.</div>';
  trackRunWaitingTabStatus = new Map(rows.map((name) => [String(name || 'Unknown tab'), 'queued']));
}

function updateTrackRunWaitingProgress(progress) {
  const listEl = document.getElementById('trackRunWaitingTabs');
  const statusEl = document.getElementById('trackRunWaitingStatus');
  if (!listEl || !pendingTrackRunStart) return;

  const tabName = String(progress?.tabName || '');
  const phase = String(progress?.phase || '');
  const totalTabs = Number(progress?.totalTabs) || pendingTrackRunStart.trackedTabNames.length;
  const completedTabs = Number(progress?.completedTabs) || 0;

  if (statusEl) {
    if (phase === 'tab_scanning' && tabName) {
      statusEl.textContent = `Scanning ${tabName} (${Math.min(completedTabs + 1, totalTabs)}/${totalTabs})...`;
    } else if (phase === 'completed') {
      statusEl.textContent = 'Selected stash tabs are synced. Starting run...';
    } else if (phase === 'rate_limited') {
      statusEl.textContent = 'Run preparation hit a Path of Exile rate limit.';
    } else if (phase === 'error') {
      statusEl.textContent = 'Run preparation scan failed.';
    }
  }

  if (tabName && trackRunWaitingTabStatus.has(tabName)) {
    if (phase === 'tab_scanning') trackRunWaitingTabStatus.set(tabName, 'active');
    if (phase === 'tab_scanned') trackRunWaitingTabStatus.set(tabName, 'done');
    if (phase === 'tab_failed' || phase === 'rate_limited') trackRunWaitingTabStatus.set(tabName, 'failed');
  }

  Array.from(listEl.querySelectorAll('.track-run-waiting-tab')).forEach((row) => {
    const rowTabName = row.getAttribute('data-tab-name') || '';
    const rowStatus = trackRunWaitingTabStatus.get(rowTabName) || 'queued';
    row.classList.remove('active', 'done', 'failed');
    if (rowStatus === 'active') row.classList.add('active');
    if (rowStatus === 'done') row.classList.add('done');
    if (rowStatus === 'failed') row.classList.add('failed');
    const statusNode = row.querySelector('.track-run-waiting-tab-status');
    if (!statusNode) return;
    statusNode.textContent = rowStatus === 'active'
      ? 'Scanning...'
      : rowStatus === 'done'
        ? 'Done'
        : rowStatus === 'failed'
          ? 'Failed'
          : 'Queued';
  });
}

function showTrackRunWaitingModal(tabNames) {
  const modal = document.getElementById('trackRunWaitingModal');
  const statusEl = document.getElementById('trackRunWaitingStatus');
  if (statusEl) {
    statusEl.textContent = 'Syncing selected stash tabs before the run starts...';
  }
  renderTrackRunWaitingTabs(tabNames);
  if (modal) {
    modal.style.display = 'flex';
  }
}

function hideTrackRunWaitingModal() {
  const modal = document.getElementById('trackRunWaitingModal');
  if (modal) {
    modal.style.display = 'none';
  }
  trackRunWaitingTabStatus = new Map();
}

// Show track run modal
async function showTrackRunModal() {
  await ensureTrackRunTabsLoaded();
  trackRunTabSelection.clear();
  getDefaultTrackRunTabIndices().forEach((index) => trackRunTabSelection.add(index));
  renderTrackRunTabList();
  setTrackRunModalBusy(false);
  document.getElementById('trackRunModal').style.display = 'flex';
  document.getElementById('runDuration').value = 60;
  document.getElementById('runName').value = '';
  const autoPriceToggle = document.getElementById('trackRunAutoSmartPrice');
  if (autoPriceToggle) {
    autoPriceToggle.checked = false;
  }
}

// Hide track run modal
function hideTrackRunModal(options = {}) {
  if (trackRunState.isStarting && options.force !== true) return;
  document.getElementById('trackRunModal').style.display = 'none';
  setTrackRunModalBusy(false);
}

// Custom confirm dialog
function showConfirmModal(optionsOrTitle, legacyMessage = '') {
  return new Promise((resolve) => {
    const options = typeof optionsOrTitle === 'object' && optionsOrTitle
      ? optionsOrTitle
      : { title: optionsOrTitle, message: legacyMessage };
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const messageEl = document.getElementById('confirmModalMessage');
    const detailsEl = document.getElementById('confirmModalDetails');
    const checkboxRowEl = document.getElementById('confirmModalCheckboxRow');
    const checkboxEl = document.getElementById('confirmModalCheckbox');
    const checkboxLabelEl = document.getElementById('confirmModalCheckboxLabel');
    const confirmBtn = document.getElementById('confirmModalConfirm');
    const cancelBtn = document.getElementById('confirmModalCancel');

    titleEl.textContent = String(options.title || 'Confirm');
    messageEl.textContent = String(options.message || '');
    detailsEl.textContent = String(options.details || '');
    detailsEl.style.display = detailsEl.textContent ? 'block' : 'none';
    checkboxEl.checked = options.checkboxChecked === true;
    checkboxLabelEl.textContent = String(options.checkboxLabel || "Don't show again");
    checkboxRowEl.style.display = options.checkboxLabel ? 'flex' : 'none';
    confirmBtn.textContent = String(options.confirmText || 'Confirm');
    cancelBtn.textContent = String(options.cancelText || 'Cancel');
    cancelBtn.style.display = options.showCancel === false ? 'none' : '';
    modal.style.display = 'flex';

    const handleConfirm = () => {
      modal.style.display = 'none';
      cleanup();
      resolve({ confirmed: true, checked: checkboxEl.checked });
    };

    const handleCancel = () => {
      modal.style.display = 'none';
      cleanup();
      resolve({ confirmed: false, checked: checkboxEl.checked });
    };

    const handleBackdrop = (event) => {
      if (event.target === modal && options.allowBackdropClose !== false) {
        handleCancel();
      }
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackdrop);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackdrop);
  });
}

async function showAlertModal(title, message, details = '') {
  await showConfirmModal({
    title,
    message,
    details,
    confirmText: 'OK',
    showCancel: false,
  });
}

function getLargeScanWarningTabs(tabIndices) {
  const allTabs = getSelectableStashTabs();
  const requestedIndices = Array.isArray(tabIndices) && tabIndices.length > 0
    ? new Set(tabIndices)
    : new Set(allTabs.map((tab) => Number.parseInt(String(tab.index), 10)).filter((index) => Number.isFinite(index)));
  const largeTypes = new Set(['MapStash', 'UniqueStash']);
  return allTabs.filter((tab) => requestedIndices.has(Number.parseInt(String(tab.index), 10)) && largeTypes.has(String(tab.type || '')));
}

async function confirmLargeTabScanIfNeeded(tabIndices, options = {}) {
  if (options?.silent === true || options?.resumeMode === true) {
    return true;
  }
  if (hideLargeTabScanWarning === true) {
    return true;
  }

  const largeTabs = getLargeScanWarningTabs(tabIndices);
  if (largeTabs.length === 0) {
    return true;
  }

  const details = `Affected tabs: ${largeTabs.map((tab) => `${tab.name} (${tab.type})`).join(', ')}`;
  const response = await showConfirmModal({
    title: 'Large tab sync',
    message: 'Some selected stash tabs are large specialized tabs and may take longer to sync.',
    details,
    confirmText: 'Sync anyway',
    cancelText: 'Cancel',
    checkboxLabel: "Don't show this warning again",
  });

  if (response.checked === true) {
    try {
      const preferences = await window.networthOverlayAPI.setPreferences({
        hideLargeTabScanWarning: true,
      });
      hideLargeTabScanWarning = preferences?.hideLargeTabScanWarning === true;
    } catch (error) {
      console.warn('[NETWORTH-OVERLAY] Failed to save large tab scan warning preference:', error);
    }
  }

  return response.confirmed === true;
}

// Show countdown timer (inline under net worth)
function showCountdownDock() {
  document.getElementById('wealthRunTimer').style.display = 'flex';
}

// Hide countdown timer (inline under net worth)
function hideCountdownDock() {
  document.getElementById('wealthRunTimer').style.display = 'none';
}

// Render view tabs in tab bar
function renderViewTabs() {
  const tabBar = document.getElementById('viewTabsBar');

  // Keep only the networth tab, remove all others
  const existingTabs = tabBar.querySelectorAll('.view-tab');
  existingTabs.forEach(tab => {
    if (tab.dataset.tabId !== 'networth') {
      tab.remove();
    }
  });

  // Add run tabs
  viewTabs.forEach(tab => {
    if (tab.type === 'networth') return; // Skip networth tab (already in HTML)

    const tabEl = document.createElement('div');
    tabEl.className = 'view-tab run-tab';
    tabEl.dataset.tabId = tab.id;

    if (tab.id === activeViewTab) {
      tabEl.classList.add('active');
    }

    if (tab.isActive) {
      // Active run (not completed yet)
      tabEl.classList.remove('completed');
    } else {
      tabEl.classList.add('completed');
    }

    const displayName = tab.name || `Run ${tab.index}`;

    tabEl.innerHTML = `
      <span class="view-tab-icon">${tab.icon || '?'}</span>
      <span class="view-tab-name">${escapeHtml(displayName)}</span>
      <button class="view-tab-close" title="Close tab">&times;</button>
    `;

    // Click to select tab
    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('view-tab-close')) {
        selectViewTab(tab.id);
      }
    });

    // Close button
    const closeBtn = tabEl.querySelector('.view-tab-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeViewTab(tab.id);
    });

    tabBar.appendChild(tabEl);
  });

  // Add "+ Track Run" tab as rightmost tab
  const newRunTab = document.createElement('div');
  newRunTab.className = 'view-tab new-run-tab';
  newRunTab.dataset.tabId = 'new-run';
  newRunTab.innerHTML = `
    <span class="view-tab-icon">+</span>
    <span class="view-tab-name">Track Run</span>
  `;

  // Click opens track run modal
  newRunTab.addEventListener('click', () => {
    void showTrackRunModal();
  });

  tabBar.appendChild(newRunTab);

  // Update active state on networth tab
  const networthTab = tabBar.querySelector('[data-tab-id="networth"]');
  if (networthTab) {
    if (activeViewTab === 'networth') {
      networthTab.classList.add('active');
    } else {
      networthTab.classList.remove('active');
    }

    // Add click listener if not already added
    if (!networthTab.dataset.listenerAdded) {
      networthTab.addEventListener('click', () => selectViewTab('networth'));
      networthTab.dataset.listenerAdded = 'true';
    }
  }
}

// Select a view tab
function selectViewTab(tabId) {
  activeViewTab = tabId;
  queueViewActive = false;
  updateMainViewVisibility();
  renderViewTabs();
  updateAll(); // Re-render everything with filtered data

  // Make sure timer is visible if a run is active
  if (trackRunState.isRunning) {
    showCountdownDock();
  } else {
    hideCountdownDock();
  }
}

// Close a view tab
function closeViewTab(tabId) {
  // Find the tab
  const tabIndex = viewTabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  // Remove from viewTabs
  viewTabs.splice(tabIndex, 1);

  // Also remove from runTabs if it's a run
  const runIndex = runTabs.findIndex(r => r.runId === tabId);
  if (runIndex !== -1) {
    runTabs.splice(runIndex, 1);
    persistTrackRunHistory();
  }

  // If we're closing the active tab, switch to networth
  if (activeViewTab === tabId) {
    activeViewTab = 'networth';
  }

  renderViewTabs();
  updateAll();
}

function toTabIndex(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolveItemTabIndex(item) {
  const direct = toTabIndex(item?._tabIndex);
  if (direct !== null) return direct;
  return toTabIndex(item?.tabIndex);
}

function getItemsForScan(scan) {
  if (!scan || typeof scan !== 'object') return [];
  if (Array.isArray(scan.items) && scan.items.length > 0) {
    return scan.items;
  }
  return [
    ...(Array.isArray(scan?.stash?.items) ? scan.stash.items : []),
    ...(Array.isArray(scan?.inventory?.items) ? scan.inventory.items : []),
  ];
}

function buildTotalsFromItems(items) {
  const netWorth = {};
  let totalChaos = 0;
  const divineRate = getDivineRate();

  for (const item of items) {
    const amount = Number(item?._networth?.value);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = String(item?._networth?.currency || 'chaos').toLowerCase();
    const rate = getCurrencyRate(currency) || 1;
    const sign = Number(item?._deltaSign) < 0 ? -1 : 1;
    netWorth[currency] = (netWorth[currency] || 0) + (amount * sign);
    totalChaos += amount * rate * sign;
  }

  return {
    netWorth,
    converted: {
      chaos: totalChaos,
      divine: totalChaos / divineRate,
    },
  };
}

function buildTabDetailsFromItems(scan, items) {
  const tabMap = new Map();
  const divineRate = getDivineRate();

  const addBaseTab = (tab, fallbackIndex = null) => {
    if (!tab || typeof tab !== 'object') return;
    const index = toTabIndex(tab.index ?? tab.i ?? fallbackIndex);
    if (index === null) return;

    if (tabMap.has(index)) {
      return;
    }

    tabMap.set(index, {
      index,
      name: tab.name || tab.n || `Tab ${index + 1}`,
      type: tab.type || tab.t || 'NormalStash',
      source: tab.source || 'stash',
      syncStatus: tab.syncStatus || 'ok',
      retryAt: tab.retryAt || null,
      netWorth: { chaos: 0, divine: 0 },
      itemCount: 0,
    });
  };

  if (Array.isArray(scan?.tabDetails) && scan.tabDetails.length > 0) {
    scan.tabDetails.forEach((tab, index) => addBaseTab(tab, index));
  } else if (Array.isArray(scan?.stash?.tabs) && scan.stash.tabs.length > 0) {
    scan.stash.tabs.forEach((tab, index) => addBaseTab(tab, index));
  } else if (Array.isArray(availableStashTabs) && availableStashTabs.length > 0) {
    availableStashTabs.forEach((tab, index) => addBaseTab(tab, index));
  }

  for (const item of items) {
    const tabIndex = resolveItemTabIndex(item);
    if (tabIndex === null) continue;

    if (!tabMap.has(tabIndex)) {
      addBaseTab({ index: tabIndex, name: `Tab ${tabIndex + 1}`, type: 'NormalStash', source: 'stash', syncStatus: 'ok' }, tabIndex);
    }

    const tab = tabMap.get(tabIndex);
    if (!tab) continue;

    tab.itemCount += 1;
    const amount = Number(item?._networth?.value);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = String(item?._networth?.currency || 'chaos').toLowerCase();
    const rate = getCurrencyRate(currency) || 1;
    const sign = Number(item?._deltaSign) < 0 ? -1 : 1;
    tab.netWorth.chaos += amount * rate * sign;
    tab.netWorth.divine = tab.netWorth.chaos / divineRate;
  }

  return Array.from(tabMap.values()).sort((a, b) => (a.index || 0) - (b.index || 0));
}

function buildDerivedNetworthViewData(scan) {
  if (!scan) return null;
  const items = getItemsForScan(scan);
  const totals = buildTotalsFromItems(items);
  const tabDetails = buildTabDetailsFromItems(scan, items);

  return {
    ...scan,
    items,
    itemsArray: items,
    netWorth: totals.netWorth,
    converted: totals.converted,
    tabDetails,
  };
}

// Get data for currently selected view (either all or specific run)
function getViewData() {
  if (activeViewTab === 'networth') {
    return buildDerivedNetworthViewData(lastScan);
  }

  const run = runTabs.find(r => r.runId === activeViewTab);
  if (!run || !run.delta) {
    return null;
  }
  return buildDerivedNetworthViewData({
    items: Array.isArray(run.delta.itemsArray) ? run.delta.itemsArray : [],
    timestamp: run.endTime,
    tabDetails: Array.isArray(run.endScan?.tabDetails)
      ? run.endScan.tabDetails.filter((tab) => run.trackedTabIndices.includes(toTabIndex(tab?.index)))
      : run.trackedTabIndices.map((tabIndex, index) => ({
        index: tabIndex,
        name: run.trackedTabNames[index] || `Tab ${tabIndex + 1}`,
        type: 'NormalStash',
        source: 'stash',
        syncStatus: 'ok',
        retryAt: null,
      })),
  });
}

// Start tracking run
async function startTrackingRun() {
  const duration = parseInt(document.getElementById('runDuration').value);
  const name = document.getElementById('runName').value.trim();
  const trackedTabIndices = normalizeTrackRunTabIndices(Array.from(trackRunTabSelection));

  if (!duration || duration < 1) {
    await showAlertModal('Invalid duration', 'Please enter a valid duration.');
    return;
  }
  if (trackedTabIndices.length === 0) {
    await showAlertModal('No tabs selected', 'Select at least one stash tab to track for this run.');
    return;
  }

  if (trackRunState.isRunning || trackRunState.isStarting) {
    return;
  }

  try {
    trackRunState.isStarting = true;
    setTrackRunModalBusy(true, 'Starting...');
    const runId = `run-${Date.now()}`;
    const trackedTabNames = getTrackRunTabNames(trackedTabIndices);
    pendingTrackRunStart = {
      runId,
      cancelled: false,
      trackedTabNames,
    };
    const trackRunModal = document.getElementById('trackRunModal');
    if (trackRunModal) {
      trackRunModal.style.display = 'none';
    }
    hideTrackRunModal({ force: true });
    showTrackRunWaitingModal(trackedTabNames);
    const initialStartScan = await captureTrackRunSnapshot(trackedTabIndices);
    if (pendingTrackRunStart?.cancelled === true || pendingTrackRunStart?.runId !== runId) {
      pendingTrackRunStart = null;
      hideTrackRunWaitingModal();
      trackRunState.isStarting = false;
      setTrackRunModalBusy(false);
      return;
    }
    const startedAt = Date.now();

    trackRunState.isRunning = true;
    trackRunState.isPaused = false;
    trackRunState.name = name;
    trackRunState.durationMinutes = duration;
    trackRunState.remainingSeconds = duration * 60;
    trackRunState.startTime = startedAt;
    trackRunState.pausedTime = null;
    trackRunState.totalPausedMs = 0;
    trackRunState.lastIntermediateScanBucket = 0;
    trackRunState.isIntermediateScanRunning = false;
    trackRunState.runId = runId;
    trackRunState.startScan = initialStartScan;
    trackRunState.intermediateScan = null;
    trackRunState.endScan = null;
    trackRunState.trackedTabIndices = trackedTabIndices;
    trackRunState.trackedTabNames = trackedTabNames;
    trackRunState.autoPriceOnComplete = document.getElementById('trackRunAutoSmartPrice')?.checked === true;

    runTabs.push({
      runId,
      name,
      isActive: true,
      startTime: startedAt,
      endTime: null,
      startScan: initialStartScan,
      intermediateScan: null,
      endScan: null,
      delta: null,
      trackedTabIndices,
      trackedTabNames,
      autoPriceOnComplete: trackRunState.autoPriceOnComplete,
      warningMessage: null,
    });

    const tabIndex = viewTabs.length;
    viewTabs.push({
      id: runId,
      name: name || `Run ${tabIndex}`,
      icon: 'T',
      type: 'run',
      isActive: true,
      index: tabIndex
    });

    activeViewTab = runId;
    renderViewTabs();
    updateAll();

    hideTrackRunWaitingModal();
    showCountdownDock();
    startCountdown();
    scheduleRunEndTimeout();
    trackRunState.isStarting = false;
    pendingTrackRunStart = null;
    setTrackRunModalBusy(false);

    if (window.networthOverlayAPI?.sendRunStarted) {
      window.networthOverlayAPI.sendRunStarted({
        remainingSeconds: trackRunState.remainingSeconds,
        endsAt: Date.now() + (trackRunState.remainingSeconds * 1000),
        isPaused: false,
      });
    }
  } catch (error) {
    hideTrackRunWaitingModal();
    pendingTrackRunStart = null;
    trackRunState.isStarting = false;
    trackRunState.isRunning = false;
    setTrackRunModalBusy(false);
    console.error('[NETWORTH-OVERLAY] Failed to start run tracking:', error);
    await showAlertModal('Run start failed', `Could not start the run: ${error.message || error}`);
  }
}

// Pause/Resume run
function togglePauseRun() {
  trackRunState.isPaused = !trackRunState.isPaused;

  const pauseBtn = document.getElementById('pauseRunBtnInline');
  const timerContainer = document.getElementById('wealthRunTimer');

  if (trackRunState.isPaused) {
    pauseBtn.textContent = '>';
    pauseBtn.title = 'Resume';
    timerContainer.classList.add('paused');
    trackRunState.pausedTime = Date.now();
    clearRunEndTimeout();
  } else {
    pauseBtn.textContent = '||';
    pauseBtn.title = 'Pause';
    timerContainer.classList.remove('paused');
    if (Number.isFinite(trackRunState.pausedTime)) {
      trackRunState.totalPausedMs += Math.max(0, Date.now() - trackRunState.pausedTime);
    }
    trackRunState.pausedTime = null;
    scheduleRunEndTimeout();
  }

  syncTrackRunClock();
  updateCountdownDisplay();
}

// Stop run early
async function stopRun() {
  syncTrackRunClock({ allowEndRun: false });
  if (trackRunState.remainingSeconds <= 0) {
    await endRun();
    return;
  }

  const response = await showConfirmModal(
    'Stop Run',
    'Are you sure you want to stop this run early?'
  );

  if (response.confirmed === true) {
    await endRun();
  }
}

// End run and save results
async function endRun() {
  if (trackRunState.isEnding) {
    return;
  }
  trackRunState.isEnding = true;
  clearRunEndTimeout();
  syncTrackRunClock({ allowEndRun: false });
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  try {
    trackRunState.endScan = await captureTrackRunSnapshot(trackRunState.trackedTabIndices);
  } catch (error) {
    console.error('[NETWORTH-OVERLAY] Failed to capture final run snapshot:', error);
    const fallbackEndScan = getBestAvailableRunSnapshot(
      trackRunState.trackedTabIndices,
      `Final run snapshot failed. Showing the latest cached tab state instead. ${error?.message || error}`
    ) || trackRunState.intermediateScan || trackRunState.startScan;
    trackRunState.endScan = fallbackEndScan;
  }
  const delta = calculateDelta(trackRunState.startScan, trackRunState.endScan);

  const runIndex = runTabs.findIndex(r => r.runId === trackRunState.runId);
  if (runIndex !== -1) {
    runTabs[runIndex].isActive = false;
    runTabs[runIndex].endTime = Date.now();
    runTabs[runIndex].endScan = trackRunState.endScan;
    runTabs[runIndex].delta = delta;
    runTabs[runIndex].warningMessage =
      trackRunState.endScan?.warningMessage ||
      runTabs[runIndex].warningMessage ||
      null;
  }

  const viewTabIndex = viewTabs.findIndex(t => t.id === trackRunState.runId);
  if (viewTabIndex !== -1) {
    viewTabs[viewTabIndex].isActive = false;
    viewTabs[viewTabIndex].icon = '?';
  }

  hideCountdownDock();
  renderViewTabs();
  activeViewTab = trackRunState.runId;
  updateAll();

  const completedRun = runTabs.find((entry) => entry.runId === trackRunState.runId);
  if (completedRun?.autoPriceOnComplete === true) {
    await queueRunDeltaItems(completedRun, { silent: true });
  }
  persistTrackRunHistory();

  trackRunState.isRunning = false;
  trackRunState.isPaused = false;
  trackRunState.isEnding = false;
  trackRunState.runId = null;
  trackRunState.startTime = null;
  trackRunState.pausedTime = null;
  trackRunState.totalPausedMs = 0;
  trackRunState.lastIntermediateScanBucket = 0;
  trackRunState.isIntermediateScanRunning = false;
  trackRunState.trackedTabIndices = [];
  trackRunState.trackedTabNames = [];
  trackRunState.autoPriceOnComplete = false;
  trackRunState.startScan = null;
  trackRunState.endScan = null;
  trackRunState.intermediateScan = null;

  if (window.networthOverlayAPI?.sendRunEnded) {
    window.networthOverlayAPI.sendRunEnded();
  }
}

// Event listeners for track run feature
// Track Run button removed - now handled by tab click in renderViewTabs()
document.getElementById('closeTrackRunModal').addEventListener('click', hideTrackRunModal);
document.getElementById('cancelTrackRun').addEventListener('click', hideTrackRunModal);
document.getElementById('startTrackRun').addEventListener('click', () => { void startTrackingRun(); });
document.getElementById('pauseRunBtnInline').addEventListener('click', togglePauseRun);
document.getElementById('stopRunBtnInline').addEventListener('click', () => { void stopRun(); });
document.getElementById('trackRunSelectVisible').addEventListener('click', () => {
  trackRunTabSelection.clear();
  getContextTrackRunTabIndices().forEach((index) => trackRunTabSelection.add(index));
  renderTrackRunTabList();
});
document.getElementById('trackRunSelectAll').addEventListener('click', () => {
  getTrackRunSelectableTabs().forEach((tab) => trackRunTabSelection.add(tab.index));
  renderTrackRunTabList();
});
document.getElementById('trackRunClearSelection').addEventListener('click', () => {
  trackRunTabSelection.clear();
  renderTrackRunTabList();
});
document.getElementById('runSmartPriceBtn').addEventListener('click', async () => {
  const button = document.getElementById('runSmartPriceBtn');
  const run = runTabs.find((entry) => entry.runId === activeViewTab);
  if (!button || !run) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Queueing...';
  try {
    await queueRunDeltaItems(run, { silent: false });
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    updateRunActionButton();
  }
});

// Close modal when clicking outside
document.getElementById('trackRunModal').addEventListener('click', (e) => {
  if (e.target.id === 'trackRunModal') {
    hideTrackRunModal();
  }
});

document.getElementById('cancelTrackRunWaiting').addEventListener('click', () => {
  if (pendingTrackRunStart) {
    pendingTrackRunStart.cancelled = true;
  }
  hideTrackRunWaitingModal();
  trackRunState.isStarting = false;
  setTrackRunModalBusy(false);
});

if (window.networthOverlayAPI?.onSnapshotScanProgress) {
  window.networthOverlayAPI.onSnapshotScanProgress((payload) => {
    if (!pendingTrackRunStart) return;
    updateTrackRunWaitingProgress(payload || {});
  });
}

// Listen for pause toggle from management window (dock click)
if (window.networthOverlayAPI?.onRunTogglePause) {
  window.networthOverlayAPI.onRunTogglePause(() => {
    console.log('[NETWORTH-OVERLAY] Received pause toggle from management window');
    if (trackRunState.isRunning) {
      console.log('[NETWORTH-OVERLAY] Run is active, toggling pause');
      togglePauseRun();
    } else {
      console.log('[NETWORTH-OVERLAY] Run is not active, ignoring pause toggle');
    }
  });
  console.log('[NETWORTH-OVERLAY] Pause toggle listener attached successfully');
} else {
  console.error('[NETWORTH-OVERLAY] onRunTogglePause not available on networthOverlayAPI');
}

if (window.networthOverlayAPI?.onRunRequestEnd) {
  window.networthOverlayAPI.onRunRequestEnd(() => {
    if (!trackRunState.isRunning || trackRunState.isEnding) return;
    void endRun();
  });
}

document.addEventListener('visibilitychange', () => {
  if (!trackRunState.isRunning) return;
  syncTrackRunClock();
  updateCountdownDisplay();
});

window.addEventListener('focus', () => {
  if (!trackRunState.isRunning) return;
  syncTrackRunClock();
  updateCountdownDisplay();
});

// ===========================
// PRICING MODAL FUNCTIONALITY
// ===========================

let currentPricingItem = null;
let currentPricingData = null;

function showPricingDetails(item) {
  if (isAuctionHouseCandidateItem(item)) {
    return;
  }
  currentPricingItem = item;
  const pricingData = ensurePricingData(item);
  currentPricingData = pricingData;
  item._pricing = pricingData;
  showPricingModal(item, pricingData);
}

function parseModRange(text) {
  if (!text || typeof text !== 'string') return null;
  const numericTokens = text.match(/-?\d+(?:\.\d+)?/g);
  if (!numericTokens || numericTokens.length === 0) return null;

  const numbers = numericTokens
    .map((entry) => Number.parseFloat(entry))
    .filter((entry) => Number.isFinite(entry));

  if (numbers.length === 0) return null;
  if (numbers.length >= 2) {
    return { min: numbers[0], max: numbers[1] };
  }
  return { min: numbers[0] };
}

function getModNumericValue(mod) {
  const minValue = Number(mod?.range?.min);
  const maxValue = Number(mod?.range?.max);
  if (Number.isFinite(maxValue)) return maxValue;
  if (Number.isFinite(minValue)) return minValue;
  const values = extractModNumbers(mod?.text || '');
  if (!values.length) return null;
  return Math.max(...values);
}

function normalizePricingModPattern(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+/g, ' ');
}

function slugifyPricingCategory(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractModNumbers(text) {
  const matches = String(text || '').match(/-?\d+(?:\.\d+)?/g) || [];
  return matches
    .map((entry) => Number.parseFloat(entry))
    .filter((entry) => Number.isFinite(entry));
}

function getPricingModKey(mod) {
  const type = String(mod?.type || 'explicit').trim().toLowerCase() || 'explicit';
  const pattern = normalizePricingModPattern(mod?.text || '');
  const statId = String(mod?.statId || '').trim().toLowerCase();
  return `${type}|${pattern}|${statId}`;
}

function normalizePseudoStatId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('pseudo.') ? normalized : '';
}

function getConfiguredPseudoStats() {
  const raw = Array.isArray(pricingSelectionConfig?.pseudoStats)
    ? pricingSelectionConfig.pseudoStats
    : [];
  const dedup = new Map();
  for (const entry of raw) {
    const statId = normalizePseudoStatId(entry?.id);
    const text = String(entry?.text || '').trim();
    if (!statId || !text) continue;
    if (dedup.has(statId)) continue;
    dedup.set(statId, {
      statId,
      text,
      prefix: String(entry?.prefix || 'pseudo').trim().toLowerCase() || 'pseudo',
      type: String(entry?.type || 'pseudo').trim().toLowerCase() || 'pseudo',
    });
  }
  return Array.from(dedup.values());
}

function getPseudoDescriptor(statId) {
  const normalized = normalizePseudoStatId(statId);
  if (!normalized) return null;

  const aggregate = PRICING_PSEUDO_AGGREGATE_MAP.get(normalized);
  if (aggregate) {
    return {
      statId: normalized,
      label: aggregate.label,
      text: aggregate.label,
      unit: aggregate.unit || '',
    };
  }

  const configured = getConfiguredPseudoStats().find((entry) => entry.statId === normalized);
  if (!configured) return null;
  return {
    statId: normalized,
    label: configured.text,
    text: configured.text,
    unit: '',
  };
}

function formatPseudoLabel(value) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.replace(/#/g, 'X');
}

function formatPseudoValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  const rounded = Math.round(numeric * 100) / 100;
  if (Number.isInteger(rounded)) return String(Math.trunc(rounded));
  return String(rounded.toFixed(2)).replace(/0+$/, '').replace(/\.$/, '');
}

function normalizePseudoTail(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/g, '')
    .trim();
}

function extractPseudoIncreasedTail(text) {
  const match = String(text || '').match(/^#%\s+(?:total\s+)?increased\s+(.+)$/i);
  if (!match) return '';
  return normalizePseudoTail(match[1]);
}

function extractPseudoAddsTail(text) {
  const match = String(text || '').match(/^adds\s+#\s+to\s+#\s+(.+)$/i);
  if (!match) return '';
  return normalizePseudoTail(match[1]);
}

function createPseudoNumericMod(statId, amount, sourceKeys) {
  const descriptor = getPseudoDescriptor(statId);
  const formattedValue = formatPseudoValue(amount);
  const unit = descriptor?.unit || '';
  const label = formatPseudoLabel(descriptor?.label || descriptor?.text || statId) || statId;
  return {
    text: `+${formattedValue}${unit} ${label}`,
    type: 'pseudo',
    statId,
    selected: false,
    range: { min: Number(formattedValue) },
    sourceCount: Array.isArray(sourceKeys) ? sourceKeys.length : 0,
    sourceModKeys: Array.isArray(sourceKeys) ? sourceKeys : [],
  };
}

function createPseudoAddsMod(statId, minValue, maxValue, sourceKeys) {
  const descriptor = getPseudoDescriptor(statId);
  const rawTail = extractPseudoAddsTail(descriptor?.text || '');
  const tail = formatPseudoLabel(rawTail || descriptor?.label || descriptor?.text || statId) || statId;
  const formattedMin = formatPseudoValue(minValue);
  const formattedMax = formatPseudoValue(maxValue);
  return {
    text: `Adds ${formattedMin} to ${formattedMax} ${tail}`,
    type: 'pseudo',
    statId,
    selected: false,
    range: {
      min: Number(formattedMin),
      max: Number(formattedMax),
    },
    sourceCount: Array.isArray(sourceKeys) ? sourceKeys.length : 0,
    sourceModKeys: Array.isArray(sourceKeys) ? sourceKeys : [],
  };
}

function buildPseudoAggregateMods(baseMods) {
  const totals = {
    elementalRes: 0,
    chaosRes: 0,
    life: 0,
    mana: 0,
    energyShield: 0,
  };
  const sourceCounts = {
    elementalRes: 0,
    chaosRes: 0,
    life: 0,
    mana: 0,
    energyShield: 0,
  };
  const sourceSets = {
    elementalRes: new Set(),
    chaosRes: new Set(),
    life: new Set(),
    mana: new Set(),
    energyShield: new Set(),
  };

  const attributeTotals = {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    allAttributes: 0,
  };
  const attributeSources = {
    strength: new Set(),
    dexterity: new Set(),
    intelligence: new Set(),
    allAttributes: new Set(),
  };

  const increasedBuckets = new Map();
  const addsBuckets = new Map();

  const addIncreased = (tail, value, sourceKey) => {
    const normalizedTail = normalizePseudoTail(tail);
    const numeric = Number(value);
    if (!normalizedTail || !Number.isFinite(numeric)) return;
    const existing = increasedBuckets.get(normalizedTail) || { amount: 0, sourceKeys: new Set() };
    existing.amount += numeric;
    existing.sourceKeys.add(sourceKey);
    increasedBuckets.set(normalizedTail, existing);
  };

  const addAdds = (tail, minValue, maxValue, sourceKey) => {
    const normalizedTail = normalizePseudoTail(tail);
    const minNumeric = Number(minValue);
    const maxNumeric = Number(maxValue);
    if (!normalizedTail || !Number.isFinite(minNumeric) || !Number.isFinite(maxNumeric)) return;
    const existing = addsBuckets.get(normalizedTail) || { min: 0, max: 0, sourceKeys: new Set() };
    existing.min += minNumeric;
    existing.max += maxNumeric;
    existing.sourceKeys.add(sourceKey);
    addsBuckets.set(normalizedTail, existing);
  };

  const addAttribute = (name, value, sourceKey) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    if (name === 'strength' || name === 'dexterity' || name === 'intelligence' || name === 'allAttributes') {
      attributeTotals[name] += numeric;
      attributeSources[name].add(sourceKey);
    }
  };

  for (const mod of baseMods) {
    const text = String(mod?.text || '').toLowerCase();
    if (!text) continue;
    const sourceKey = getPricingModKey(mod);
    const value = getModNumericValue(mod);
    if (!Number.isFinite(value) || value <= 0) continue;

    if (text.includes('maximum life') && !text.includes('minion')) {
      totals.life += value;
      sourceCounts.life += 1;
      sourceSets.life.add(sourceKey);
    }
    if (text.includes('maximum mana')) {
      totals.mana += value;
      sourceCounts.mana += 1;
      sourceSets.mana.add(sourceKey);
    }
    if (text.includes('maximum energy shield')) {
      totals.energyShield += value;
      sourceCounts.energyShield += 1;
      sourceSets.energyShield.add(sourceKey);
    }

    const resistanceTargetMatch = text.match(/to\s+(.+?)\s+resistances?/i);
    if (resistanceTargetMatch) {
      const resistanceTarget = String(resistanceTargetMatch[1] || '').toLowerCase();
      if (resistanceTarget) {
        if (resistanceTarget.includes('chaos')) {
          totals.chaosRes += value;
          sourceCounts.chaosRes += 1;
          sourceSets.chaosRes.add(sourceKey);
        }

        let hasElementalContribution = false;
        if (resistanceTarget.includes('all elemental') || resistanceTarget === 'elemental') {
          totals.elementalRes += value * 3;
          hasElementalContribution = true;
        }

        let elementCount = 0;
        if (resistanceTarget.includes('fire')) elementCount += 1;
        if (resistanceTarget.includes('cold')) elementCount += 1;
        if (resistanceTarget.includes('lightning')) elementCount += 1;
        if (elementCount > 0) {
          totals.elementalRes += value * elementCount;
          hasElementalContribution = true;
        }
        if (hasElementalContribution) {
          sourceCounts.elementalRes += 1;
          sourceSets.elementalRes.add(sourceKey);
        }
      }
    }

    const attributeMatch = text.match(/^\+(\d+(?:\.\d+)?)\s+to\s+(.+)$/i);
    if (attributeMatch) {
      const attributeValue = Number(attributeMatch[1]);
      const attributeTarget = normalizePseudoTail(attributeMatch[2]);
      const parts = [];
      const isAllAttributesMod = attributeTarget.includes('all attributes');
      if (attributeTarget.includes('all attributes')) {
        parts.push('strength', 'dexterity', 'intelligence');
      } else {
        if (attributeTarget.includes('strength')) parts.push('strength');
        if (attributeTarget.includes('dexterity')) parts.push('dexterity');
        if (attributeTarget.includes('intelligence')) parts.push('intelligence');
      }
      if (parts.length > 0) {
        for (const part of parts) {
          addAttribute(part, attributeValue, sourceKey);
        }
        if (isAllAttributesMod) {
          addAttribute('allAttributes', attributeValue, sourceKey);
        }
      }
    }

    const increasedMatch = text.match(/(-?\d+(?:\.\d+)?)%\s+(?:total\s+)?increased\s+(.+)/i);
    if (increasedMatch) {
      const increasedValue = Number(increasedMatch[1]);
      const increasedTail = increasedMatch[2];
      addIncreased(increasedTail, increasedValue, sourceKey);
      if (/minions?\s+deal/i.test(text)) {
        addIncreased(`minion ${increasedTail}`, increasedValue, sourceKey);
      }
    }

    const addsMatch = text.match(/adds\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\s+(.+)/i);
    if (addsMatch) {
      addAdds(addsMatch[3], Number(addsMatch[1]), Number(addsMatch[2]), sourceKey);
    }
  }

  const aggregates = [
    {
      statId: 'pseudo.pseudo_total_elemental_resistance',
      amount: totals.elementalRes,
      sourceCount: sourceCounts.elementalRes,
      sourceModKeys: Array.from(sourceSets.elementalRes),
    },
    {
      statId: 'pseudo.pseudo_total_chaos_resistance',
      amount: totals.chaosRes,
      sourceCount: sourceCounts.chaosRes,
      sourceModKeys: Array.from(sourceSets.chaosRes),
    },
    {
      statId: 'pseudo.pseudo_total_life',
      amount: totals.life,
      sourceCount: sourceCounts.life,
      sourceModKeys: Array.from(sourceSets.life),
    },
    {
      statId: 'pseudo.pseudo_total_mana',
      amount: totals.mana,
      sourceCount: sourceCounts.mana,
      sourceModKeys: Array.from(sourceSets.mana),
    },
    {
      statId: 'pseudo.pseudo_total_energy_shield',
      amount: totals.energyShield,
      sourceCount: sourceCounts.energyShield,
      sourceModKeys: Array.from(sourceSets.energyShield),
    },
  ];

  const output = aggregates
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0 && Number(entry.sourceCount) > 1)
    .map((entry) => createPseudoNumericMod(entry.statId, entry.amount, entry.sourceModKeys));

  const attrPseudoCandidates = [
    { statId: 'pseudo.pseudo_total_strength', amount: attributeTotals.strength, source: attributeSources.strength },
    { statId: 'pseudo.pseudo_total_dexterity', amount: attributeTotals.dexterity, source: attributeSources.dexterity },
    { statId: 'pseudo.pseudo_total_intelligence', amount: attributeTotals.intelligence, source: attributeSources.intelligence },
    { statId: 'pseudo.pseudo_total_all_attributes', amount: attributeTotals.allAttributes, source: attributeSources.allAttributes },
  ];
  for (const entry of attrPseudoCandidates) {
    if (!Number.isFinite(entry.amount) || entry.amount <= 0 || entry.source.size <= 1) continue;
    if (!getPseudoDescriptor(entry.statId)) continue;
    output.push(createPseudoNumericMod(entry.statId, entry.amount, Array.from(entry.source)));
  }

  const increasedByTail = new Map();
  for (const descriptor of getConfiguredPseudoStats()) {
    if (!String(descriptor.statId).startsWith('pseudo.pseudo_increased_')) continue;
    const tail = extractPseudoIncreasedTail(descriptor.text);
    if (!tail || increasedByTail.has(tail)) continue;
    increasedByTail.set(tail, descriptor);
  }
  for (const [tail, bucket] of increasedBuckets.entries()) {
    const descriptor = increasedByTail.get(tail);
    if (!descriptor) continue;
    if (!Number.isFinite(bucket.amount) || bucket.amount <= 0 || bucket.sourceKeys.size <= 1) continue;
    output.push(createPseudoNumericMod(descriptor.statId, bucket.amount, Array.from(bucket.sourceKeys)));
  }

  const addsByTail = new Map();
  for (const descriptor of getConfiguredPseudoStats()) {
    if (!String(descriptor.statId).startsWith('pseudo.pseudo_adds_')) continue;
    const tail = extractPseudoAddsTail(descriptor.text);
    if (!tail || addsByTail.has(tail)) continue;
    addsByTail.set(tail, descriptor);
  }
  for (const [tail, bucket] of addsBuckets.entries()) {
    const descriptor = addsByTail.get(tail);
    if (!descriptor) continue;
    if (bucket.sourceKeys.size <= 1) continue;
    if (!Number.isFinite(bucket.min) || !Number.isFinite(bucket.max)) continue;
    output.push(createPseudoAddsMod(descriptor.statId, bucket.min, bucket.max, Array.from(bucket.sourceKeys)));
  }

  const dedupByStatId = new Map();
  for (const mod of output) {
    const statId = normalizePseudoStatId(mod?.statId);
    if (!statId || dedupByStatId.has(statId)) continue;
    dedupByStatId.set(statId, mod);
  }
  return Array.from(dedupByStatId.values());
}

function mergePseudoAggregateMods(allMods) {
  const sourceMods = Array.isArray(allMods) ? allMods : [];
  const baseMods = sourceMods.filter((mod) => String(mod?.type || '').toLowerCase() !== 'pseudo');
  const existingPseudoById = new Map();
  sourceMods
    .filter((mod) => String(mod?.type || '').toLowerCase() === 'pseudo')
    .forEach((mod) => {
      const statId = String(mod?.statId || '').trim().toLowerCase();
      if (!statId) return;
      existingPseudoById.set(statId, mod);
    });

  const generated = buildPseudoAggregateMods(baseMods).map((mod) => {
    const existing = existingPseudoById.get(String(mod.statId || '').toLowerCase());
    if (!existing) return mod;
    const preservedRange = (existing?.range && typeof existing.range === 'object') ? existing.range : mod.range;
    return {
      ...mod,
      selected: existing.selected === true,
      range: preservedRange || mod.range,
    };
  });

  return [...baseMods, ...generated];
}

function getPricingConfigMaxSelectedMods() {
  const value = Number(pricingSelectionConfig?.maxSelectedMods);
  if (Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.min(8, Math.floor(value)));
  }
  return DEFAULT_PRICING_MAX_SELECTED_MODS;
}

function normalizePropertySelection(source) {
  const raw = (source && typeof source === 'object') ? source : {};
  return {
    useBaseType: raw.useBaseType === true,
    useItemLevel: raw.useItemLevel === true,
    useQuality: raw.useQuality === true,
    useSockets: raw.useSockets === true,
    useLinks: raw.useLinks === true,
  };
}

function readPropertySelectionFromDom() {
  const selection = {
    useBaseType: false,
    useItemLevel: false,
    useQuality: false,
    useSockets: false,
    useLinks: false,
  };
  document.querySelectorAll('.property-checkbox:checked').forEach((cb) => {
    const prop = cb.dataset.property;
    if (prop === 'baseType') selection.useBaseType = true;
    if (prop === 'itemLevel') selection.useItemLevel = true;
    if (prop === 'quality') selection.useQuality = true;
    if (prop === 'sockets') selection.useSockets = true;
    if (prop === 'links') selection.useLinks = true;
  });
  return selection;
}

function getFallbackSelectionRules() {
  const rules = Array.isArray(pricingSelectionConfig?.fallbackRules)
    ? pricingSelectionConfig.fallbackRules
    : [];
  if (rules.length === 0) {
    return LOCAL_FALLBACK_SELECTION_RULES;
  }

  const compiled = rules
    .map((entry) => {
      const pattern = String(entry?.pattern || '').trim();
      const type = String(entry?.type || '').trim().toLowerCase();
      if (!pattern || !type) return null;
      try {
        return {
          type,
          regex: new RegExp(pattern, String(entry?.flags || 'i')),
          minValue: Number(entry?.minValue) || 0,
          score: Number(entry?.score) || 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return compiled.length > 0 ? compiled : LOCAL_FALLBACK_SELECTION_RULES;
}

function choosePricingRuleCategory(item) {
  const rules = pricingSelectionConfig?.rules;
  if (!rules || typeof rules !== 'object') return null;

  const tradeMap = pricingSelectionConfig?.tradeCategoryMap || {};
  const candidates = [
    item?.category,
    item?.tradeCategory,
    item?.itemClass,
    item?.item_class,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const mapped = raw.includes('.')
      ? (tradeMap[String(raw).toLowerCase()] || raw)
      : raw;
    const slug = slugifyPricingCategory(mapped);
    if (slug && rules[slug]) {
      return slug;
    }
  }

  return null;
}

function findModsByPricingPatterns(allMods, patterns) {
  const byPattern = new Map();
  for (const mod of allMods) {
    const key = normalizePricingModPattern(mod?.text);
    if (!key) continue;
    const list = byPattern.get(key) || [];
    list.push(mod);
    byPattern.set(key, list);
  }

  const output = [];
  const seen = new Set();
  for (const pattern of patterns) {
    const normalized = normalizePricingModPattern(pattern);
    if (!normalized) return [];
    const matches = byPattern.get(normalized) || [];
    if (!matches.length) {
      return [];
    }
    const picked = matches[0];
    if (seen.has(picked)) continue;
    seen.add(picked);
    output.push(picked);
  }
  return output;
}

function selectFallbackModsFromRules(allMods, maxSelectedMods) {
  const scored = [];
  const rules = getFallbackSelectionRules();

  for (const mod of allMods) {
    const modType = String(mod?.type || '').toLowerCase();
    for (const rule of rules) {
      if (rule.type !== modType) continue;
      if (!rule.regex.test(String(mod?.text || ''))) continue;
      const values = extractModNumbers(mod?.text || '');
      const valueScore = values.length > 0 ? Math.max(...values) : 0;
      if (valueScore < rule.minValue) continue;
      scored.push({
        mod,
        score: rule.score + valueScore / Math.max(rule.minValue || 1, 1),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  const seen = new Set();
  for (const entry of scored) {
    const key = normalizePricingModPattern(entry?.mod?.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(entry.mod);
    if (selected.length >= maxSelectedMods) break;
  }

  return selected;
}

function selectDefaultPricingMods(allMods, item) {
  const maxSelectedMods = getPricingConfigMaxSelectedMods();
  const rules = pricingSelectionConfig?.rules;
  const category = choosePricingRuleCategory(item);
  const categoryRules = category && rules ? rules[category] : null;

  if (categoryRules && typeof categoryRules === 'object') {
    const combos = [];
    for (const size of [5, 4, 3, 2]) {
      const key = `${size}mod`;
      const entries = Array.isArray(categoryRules?.combos?.[key]) ? categoryRules.combos[key] : [];
      for (const entry of entries) {
        combos.push({
          mods: Array.isArray(entry?.mods) ? entry.mods : [],
          avgChaos: Number(entry?.avgChaos || 0),
        });
      }
    }
    combos.sort((a, b) => b.avgChaos - a.avgChaos);

    for (const combo of combos) {
      const comboMods = findModsByPricingPatterns(allMods, combo.mods);
      if (comboMods.length >= 2 && comboMods.length === combo.mods.length) {
        return comboMods.slice(0, maxSelectedMods);
      }
    }

    const patternRules = [
      ...(Array.isArray(categoryRules?.highImpactUnique) ? categoryRules.highImpactUnique : []),
      ...(Array.isArray(categoryRules?.highImpact) ? categoryRules.highImpact : []),
      ...(Array.isArray(categoryRules?.commonExpensive) ? categoryRules.commonExpensive : []),
    ]
      .map((entry) => ({
        pattern: String(entry?.pattern || ''),
        avgChaos: Number(entry?.avgChaos || 0),
      }))
      .filter((entry) => entry.pattern)
      .sort((a, b) => b.avgChaos - a.avgChaos);

    const selectedFromPatterns = [];
    const seen = new Set();
    for (const rule of patternRules) {
      const matches = findModsByPricingPatterns(allMods, [rule.pattern]);
      if (!matches.length) continue;
      const picked = matches[0];
      const key = normalizePricingModPattern(picked?.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selectedFromPatterns.push(picked);
      if (selectedFromPatterns.length >= maxSelectedMods) break;
    }

    if (selectedFromPatterns.length >= 2) {
      return selectedFromPatterns.slice(0, maxSelectedMods);
    }
  }

  const fallback = selectFallbackModsFromRules(allMods, maxSelectedMods);
  if (fallback.length > 0) {
    return fallback;
  }
  return allMods.slice(0, maxSelectedMods);
}

function applyDefaultPricingSelection(allMods, item) {
  if (!Array.isArray(allMods) || allMods.length === 0) return [];
  const maxSelectedMods = getPricingConfigMaxSelectedMods();
  const pseudoPriorityMods = allMods
    .filter((mod) =>
      String(mod?.type || '').toLowerCase() === 'pseudo'
      && Array.isArray(mod?.sourceModKeys)
      && mod.sourceModKeys.length > 1
    )
    .sort((a, b) => {
      const countDiff = Number(b?.sourceCount || 0) - Number(a?.sourceCount || 0);
      if (countDiff !== 0) return countDiff;
      const aValue = getModNumericValue(a);
      const bValue = getModNumericValue(b);
      if (Number.isFinite(aValue) && Number.isFinite(bValue) && aValue !== bValue) {
        return bValue - aValue;
      }
      return String(a?.text || '').localeCompare(String(b?.text || ''));
    });

  const selectedKeys = new Set();
  const blockedBaseKeys = new Set();
  for (const pseudoMod of pseudoPriorityMods) {
    if (selectedKeys.size >= maxSelectedMods) break;
    const pseudoKey = getPricingModKey(pseudoMod);
    selectedKeys.add(pseudoKey);
    for (const sourceKey of pseudoMod.sourceModKeys) {
      if (sourceKey) blockedBaseKeys.add(sourceKey);
    }
  }

  const candidateMods = allMods.filter((mod) => {
    const modKey = getPricingModKey(mod);
    if (selectedKeys.has(modKey)) return false;
    if (String(mod?.type || '').toLowerCase() === 'pseudo') return true;
    return !blockedBaseKeys.has(modKey);
  });

  const selectedByRules = selectDefaultPricingMods(candidateMods, item);
  for (const mod of selectedByRules) {
    if (selectedKeys.size >= maxSelectedMods) break;
    const modKey = getPricingModKey(mod);
    if (!modKey || selectedKeys.has(modKey)) continue;
    if (String(mod?.type || '').toLowerCase() !== 'pseudo' && blockedBaseKeys.has(modKey)) continue;
    selectedKeys.add(modKey);
  }

  return allMods.map((mod) => ({
    ...mod,
    selected: selectedKeys.has(getPricingModKey(mod)),
  }));
}

function enforcePseudoPrioritySelection(allMods) {
  if (!Array.isArray(allMods) || allMods.length === 0) return [];
  const maxSelectedMods = getPricingConfigMaxSelectedMods();
  const modByKey = new Map();
  const initiallySelected = new Set();
  for (const mod of allMods) {
    const key = getPricingModKey(mod);
    if (!key) continue;
    modByKey.set(key, mod);
    if (mod.selected) initiallySelected.add(key);
  }

  const selectedKeys = new Set(initiallySelected);
  const pseudoCandidates = allMods
    .filter((mod) =>
      String(mod?.type || '').toLowerCase() === 'pseudo'
      && Array.isArray(mod?.sourceModKeys)
      && mod.sourceModKeys.length > 1
    )
    .sort((a, b) => {
      const countDiff = Number(b?.sourceCount || 0) - Number(a?.sourceCount || 0);
      if (countDiff !== 0) return countDiff;
      const aValue = getModNumericValue(a);
      const bValue = getModNumericValue(b);
      if (Number.isFinite(aValue) && Number.isFinite(bValue) && aValue !== bValue) {
        return bValue - aValue;
      }
      return String(a?.text || '').localeCompare(String(b?.text || ''));
    });

  for (const pseudo of pseudoCandidates) {
    const pseudoKey = getPricingModKey(pseudo);
    if (!pseudoKey) continue;
    for (const sourceKey of pseudo.sourceModKeys) {
      if (!sourceKey) continue;
      selectedKeys.delete(sourceKey);
    }
    selectedKeys.add(pseudoKey);
  }

  const scoredSelected = Array.from(selectedKeys)
    .map((key) => {
      const mod = modByKey.get(key);
      if (!mod) return null;
      const isPseudo = String(mod?.type || '').toLowerCase() === 'pseudo';
      const sourceWeight = Number(mod?.sourceCount || 0);
      const numericValue = getModNumericValue(mod);
      return {
        key,
        score:
          (isPseudo ? 100_000 : 10_000)
          + sourceWeight * 100
          + (Number.isFinite(numericValue) ? Number(numericValue) : 0)
          + (initiallySelected.has(key) ? 1 : 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const keptKeys = new Set(scoredSelected.slice(0, maxSelectedMods).map((entry) => entry.key));
  return allMods.map((mod) => ({
    ...mod,
    selected: keptKeys.has(getPricingModKey(mod)),
  }));
}

function buildDetailedModLookup(item) {
  const lookup = new Map();
  const details = Array.isArray(item?.modsDetailed) ? item.modsDetailed : [];
  for (const entry of details) {
    const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
    if (!text) continue;
    const type = typeof entry?.type === 'string' ? entry.type.trim().toLowerCase() : '';
    lookup.set(`${type}:${text}`, {
      tier: typeof entry?.tier === 'string' ? entry.tier.trim() : '',
      tierRange: typeof entry?.range === 'string' ? entry.range.trim() : '',
      affix: typeof entry?.affix === 'string' ? entry.affix.trim() : '',
      affixName: typeof entry?.affixName === 'string' ? entry.affixName.trim() : '',
    });
  }
  return lookup;
}

function buildModsFromItem(item) {
  const modGroups = [
    { type: 'implicit', mods: item?.implicitMods },
    { type: 'explicit', mods: item?.explicitMods },
    { type: 'crafted', mods: item?.craftedMods },
    { type: 'fractured', mods: item?.fracturedMods },
    { type: 'enchant', mods: item?.enchantMods },
    { type: 'veiled', mods: item?.veiledMods },
    { type: 'utility', mods: item?.utilityMods },
  ];

  const output = [];
  const dedup = new Set();
  const detailedLookup = buildDetailedModLookup(item);

  for (const group of modGroups) {
    const values = Array.isArray(group.mods) ? group.mods : [];
    for (const rawText of values) {
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      if (!text) continue;
      const key = `${group.type}:${text}`;
      if (dedup.has(key)) continue;
      dedup.add(key);
      const detailed = detailedLookup.get(key) || null;
      output.push({
        text,
        type: group.type,
        statId: undefined,
        selected: false,
        range: parseModRange(text),
        tier: detailed?.tier || '',
        tierRange: detailed?.tierRange || '',
        affix: detailed?.affix || '',
        affixName: detailed?.affixName || '',
      });
    }
  }

  if (output.length === 0 && detailedLookup.size > 0) {
    for (const [key, detailed] of detailedLookup.entries()) {
      const separator = key.indexOf(':');
      const type = separator >= 0 ? key.slice(0, separator) : 'explicit';
      const text = separator >= 0 ? key.slice(separator + 1) : key;
      output.push({
        text,
        type,
        statId: undefined,
        selected: false,
        range: parseModRange(text),
        tier: detailed?.tier || '',
        tierRange: detailed?.tierRange || '',
        affix: detailed?.affix || '',
        affixName: detailed?.affixName || '',
      });
    }
  }

  const withPseudo = mergePseudoAggregateMods(output);
  return applyDefaultPricingSelection(withPseudo, item);
}

function buildFallbackPricingData(item) {
  const rawValue = Number(item?._networth?.value);
  const currency = String(item?._networth?.currency || 'chaos').toLowerCase();
  const rate = getCurrencyRate(currency) || (currency === 'chaos' ? 1 : null);
  const chaosValue = Number.isFinite(rawValue) && Number.isFinite(rate) ? rawValue * rate : null;
  const divineRate = getDivineRate();
  const allMods = buildModsFromItem(item);

  return {
    estimated: Number.isFinite(chaosValue) && chaosValue > 0,
    chaos: Number.isFinite(chaosValue) ? Number(chaosValue.toFixed(2)) : 0,
    divine: Number.isFinite(chaosValue) ? Number((chaosValue / divineRate).toFixed(2)) : 0,
    confidence: Number.isFinite(chaosValue) && chaosValue > 0 ? 'derived from current scan' : 'no estimate',
    sampleSize: 0,
    range: Number.isFinite(chaosValue) && chaosValue > 0
      ? { min: Number(chaosValue.toFixed(2)), max: Number(chaosValue.toFixed(2)) }
      : null,
    allMods,
    selectedMods: allMods
      .filter((mod) => mod.selected)
      .map((mod) => ({ text: mod.text, type: mod.type, statId: mod.statId, range: mod.range, enabled: true })),
    priceDetails: null,
    tradeUrl: null,
    source: 'item_inspector',
    serverPricingAvailable: serverPricingEnabled === true,
    listingMode: preferredPricingListingMode,
  };
}

function ensurePricingData(item) {
  const existing = item && typeof item._pricing === 'object' ? { ...item._pricing } : null;
  const pricing = existing || buildFallbackPricingData(item);

  if (!Array.isArray(pricing.allMods) || pricing.allMods.length === 0) {
    pricing.allMods = buildModsFromItem(item);
  }

  const detailedLookup = buildDetailedModLookup(item);
  const selectedModKeys = new Set(
    Array.isArray(pricing.selectedMods)
      ? pricing.selectedMods.map((mod) => getPricingModKey(mod))
      : []
  );

  pricing.allMods = pricing.allMods.map((mod) => {
    const text = mod?.text || '';
    const type = typeof mod?.type === 'string' && mod.type.trim()
      ? mod.type.trim().toLowerCase()
      : 'explicit';
    const key = `${type}:${text}`;
    const detailed = detailedLookup.get(key) || null;
    const mapped = {
      text,
      type,
      statId: typeof mod?.statId === 'string' && mod.statId.trim() ? mod.statId.trim() : undefined,
      selected: mod?.selected !== false,
      range: mod?.range || parseModRange(text),
      tier: typeof mod?.tier === 'string' && mod.tier.trim() ? mod.tier : (detailed?.tier || ''),
      tierRange: typeof mod?.tierRange === 'string' && mod.tierRange.trim() ? mod.tierRange : (detailed?.tierRange || ''),
      affix: typeof mod?.affix === 'string' && mod.affix.trim() ? mod.affix : (detailed?.affix || ''),
      affixName: typeof mod?.affixName === 'string' && mod.affixName.trim() ? mod.affixName : (detailed?.affixName || ''),
    };
    if (selectedModKeys.has(getPricingModKey(mapped))) {
      mapped.selected = true;
    }
    return mapped;
  }).filter((mod) => mod.text);

  pricing.allMods = mergePseudoAggregateMods(pricing.allMods).map((mod) => {
    if (selectedModKeys.has(getPricingModKey(mod))) {
      return { ...mod, selected: true };
    }
    return mod;
  });
  pricing.allMods = enforcePseudoPrioritySelection(pricing.allMods);

  if (!Array.isArray(pricing.selectedMods) || pricing.selectedMods.length === 0) {
    pricing.selectedMods = pricing.allMods
      .filter((mod) => mod.selected)
      .map((mod) => ({ text: mod.text, type: mod.type, statId: mod.statId, range: mod.range, enabled: true }));
  } else {
    pricing.selectedMods = pricing.allMods
      .filter((mod) => mod.selected)
      .map((mod) => ({ text: mod.text, type: mod.type, statId: mod.statId, range: mod.range, enabled: true }));
  }

  if (typeof pricing.serverPricingAvailable !== 'boolean') {
    pricing.serverPricingAvailable = pricing.estimated === true;
  }

  pricing.propertySelection = normalizePropertySelection(
    pricing.propertySelection || pricing.options || pricing
  );

  pricing.listingMode = normalizePricingListingMode(
    pricing.listingMode || pricing.statusOption || preferredPricingListingMode
  );
  setPreferredPricingListingMode(pricing.listingMode);

  return pricing;
}

function showPricingModal(item, pricingData) {
  currentPricingData = pricingData;

  const hasEstimatedPricing = pricingData?.estimated === true && Number.isFinite(Number(pricingData?.chaos));
  const chaosValue = hasEstimatedPricing ? Number(pricingData.chaos) : null;
  const divineValue = hasEstimatedPricing
    ? Number(pricingData.divine ?? ((chaosValue || 0) / getDivineRate()))
    : null;
  const rangeMin = Number(pricingData?.range?.min);
  const rangeMax = Number(pricingData?.range?.max);
  const hasRange = Number.isFinite(rangeMin) && Number.isFinite(rangeMax);
  const priceSummary = hasEstimatedPricing
    ? `${chaosValue}c (${Number.isFinite(divineValue) ? divineValue.toFixed(2) : '0.00'}d)`
    : 'No server price yet';
  const confidenceSummary = hasEstimatedPricing
    ? `${pricingData.confidence || 'estimated'} | ${pricingData.sampleSize || 0} listings${hasRange ? ` | ${rangeMin}-${rangeMax}c` : ''}`
    : 'Inspect item mods and select what should be included for pricing.';
  const repriceAvailable = pricingData?.serverPricingAvailable === true;
  pricingData.listingMode = setPreferredPricingListingMode(pricingData?.listingMode || preferredPricingListingMode);

  const modal = document.createElement('div');
  modal.className = 'pricing-modal';
  modal.id = 'pricingModal';

  modal.innerHTML = `
    <div class="pricing-modal-content">
      <div class="pricing-modal-header">
        <h2>${escapeHtml(item.name || 'Item Pricing Details')}</h2>
        <button class="pricing-modal-close">&times;</button>
      </div>

      <div class="final-price-display">
        <div class="final-price-value">${priceSummary}</div>
        <div class="final-price-confidence">
          ${confidenceSummary}
        </div>
        ${pricingData.tradeUrl ? '<button class="trade-url-btn" id="openTradeBtn">Open Trade Search</button>' : ''}
      </div>

      <div class="pricing-section">
        <h3>Item Properties</h3>
        <div class="item-properties">
          ${renderItemProperties(item, pricingData)}
        </div>
      </div>

      <div class="pricing-section">
        <h3>Mods</h3>
        <div class="mod-list" id="modList">
          ${renderModList(pricingData.allMods || [])}
        </div>
      </div>

      <div class="pricing-section">
        <h3>Prices</h3>
        <div class="price-list" id="priceList">
          ${renderPriceList(pricingData.priceDetails)}
        </div>
      </div>

      <div class="pricing-feedback" id="pricingFeedback" style="display: none;"></div>

      <div class="pricing-actions">
        <button class="pricing-action-btn secondary" id="repriceBtn" title="${repriceAvailable ? 'Recalculate price from selected mods' : 'Server pricing is not available in this client build.'}">Re-price</button>
        <input type="number" class="manual-price-input" id="manualPriceInput" placeholder="chaos">
        <button class="pricing-action-btn secondary" id="setManualPriceBtn">Set Price</button>
        <button class="pricing-action-btn primary" id="saveAndCloseBtn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.pricing-modal-close').addEventListener('click', closePricingModal);
  modal.querySelector('#saveAndCloseBtn').addEventListener('click', closePricingModal);
  modal.querySelector('#repriceBtn').addEventListener('click', () => {
    if (!repriceAvailable) {
      setPricingFeedback('Server pricing is currently unavailable in this client build.', 'warn');
      return;
    }
    repriceItem(item);
  });
  modal.querySelector('#setManualPriceBtn').addEventListener('click', setManualPrice);

  const tradeBtn = modal.querySelector('#openTradeBtn');
  if (tradeBtn && pricingData.tradeUrl) {
    tradeBtn.addEventListener('click', () => {
      window.networthOverlayAPI.openExternal(pricingData.tradeUrl);
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePricingModal();
  });

  document.querySelectorAll('.mod-checkbox').forEach(cb => {
    cb.addEventListener('change', onModCheckboxChange);
  });

  document.querySelectorAll('.mod-range-edit').forEach(input => {
    input.addEventListener('change', onRangeChange);
  });

  bindPricingSelectionRowClicks(modal);
  setPricingFeedback('', 'info');
  bindPriceRowQuickSelect(modal);
}

function renderItemProperties(item, pricingData) {
  let html = '';
  const propertySelection = normalizePropertySelection(pricingData?.propertySelection || {});
  const isChecked = (key) => propertySelection[key] ? 'checked' : '';

  // Base Type
  const baseType = item.baseType || item.typeLine;
  html += `<div class="property-item">
    <input type="checkbox" class="property-checkbox" data-property="baseType" id="baseTypeCheckbox" ${isChecked('useBaseType')}>
    <span>Specific base type: ${escapeHtml(baseType)} <span style="color: #666; font-size: 10px;">(optional)</span></span>
  </div>`;

  // Item level
  if (item.ilvl) {
    html += `<div class="property-item">
      <input type="checkbox" class="property-checkbox" data-property="itemLevel" id="itemLevelCheckbox" ${isChecked('useItemLevel')}>
      <span>Item Level: ${item.ilvl} <span style="color: #666; font-size: 10px;">(+/-5 range)</span></span>
    </div>`;
  }

  // Sockets and links
  if (item.sockets && item.sockets.length > 0) {
    const totalSockets = item.sockets.length;
    const maxLink = calculateMaxLink(item.sockets);

    html += `<div class="property-item">
      <input type="checkbox" class="property-checkbox" data-property="sockets" id="socketsCheckbox" ${isChecked('useSockets')}>
      <span>Sockets: ${totalSockets}</span>
    </div>`;

    if (maxLink >= 5) {
      html += `<div class="property-item">
        <input type="checkbox" class="property-checkbox" data-property="links" id="linksCheckbox" ${isChecked('useLinks')}>
        <span>Links: ${maxLink} <span style="color: var(--accent-yellow);">(valuable!)</span></span>
      </div>`;
    }
  }

  // Quality
  if (item.quality && item.quality > 0) {
    html += `<div class="property-item">
      <input type="checkbox" class="property-checkbox" data-property="quality" ${isChecked('useQuality')}>
      <span>Quality: ${item.quality}%</span>
    </div>`;
  }

  return html;
}

function calculateMaxLink(sockets) {
  if (!sockets || sockets.length === 0) return 0;

  let maxLink = 1;
  let currentLink = 1;
  let lastGroup = sockets[0].group;

  for (let i = 1; i < sockets.length; i++) {
    if (sockets[i].group === lastGroup) {
      currentLink++;
      maxLink = Math.max(maxLink, currentLink);
    } else {
      currentLink = 1;
      lastGroup = sockets[i].group;
    }
  }

  return maxLink;
}

function renderModList(allMods) {
  if (!allMods || allMods.length === 0) {
    return '<div style="color: #999; padding: 6px;">No mods detected</div>';
  }

  const selectedMods = allMods.filter(m => m.selected);
  const unselectedMods = allMods.filter(m => !m.selected);

  let html = '';

  if (selectedMods.length > 0) {
    html += '<div style="color: var(--accent-yellow); font-weight: 600; margin-bottom: 6px; font-size: 11px;">? Used for pricing:</div>';
    selectedMods.forEach(mod => {
      html += renderModItem(mod, true);
    });
  }

  if (unselectedMods.length > 0) {
    html += '<div style="color: #666; font-weight: 600; margin: 10px 0 6px 0; font-size: 11px;">? Not used:</div>';
    unselectedMods.forEach(mod => {
      html += renderModItem(mod, false);
    });
  }

  return html;
}

function renderModItem(mod, isSelected) {
  const modKey = getPricingModKey(mod);
  const rangeDisplay = formatRangeDisplay(mod.range);
  const isPseudo = String(mod?.type || '').toLowerCase() === 'pseudo';
  const sourceCount = Number(mod?.sourceCount || (Array.isArray(mod?.sourceModKeys) ? mod.sourceModKeys.length : 0));
  const pseudoCountBadge = isPseudo && sourceCount > 1
    ? `<span class="mod-pseudo-sources">${sourceCount} mods</span>`
    : '';
  const tierValue = typeof mod?.tier === 'string' ? mod.tier.trim() : '';
  const tierRange = typeof mod?.tierRange === 'string' ? mod.tierRange.trim() : '';
  const affix = typeof mod?.affix === 'string' ? mod.affix.trim().toLowerCase() : '';
  const affixName = typeof mod?.affixName === 'string' ? mod.affixName.trim() : '';
  const tierClass = affix === 'suffix' ? 'suffix' : (affix === 'prefix' ? 'prefix' : 'neutral');
  const tierTitle = affixName
    ? ` title="${escapeHtml(affixName)}"`
    : '';
  const tierText = tierRange ? `${tierValue} ${tierRange}` : tierValue;
  const tierBadge = tierText
    ? `<span class="mod-tier-badge ${tierClass}"${tierTitle}>${escapeHtml(tierText)}</span>`
    : '';

  return `
    <div class="mod-item ${isSelected ? 'selected' : ''}" data-mod-type="${mod.type}">
      <input type="checkbox" class="mod-checkbox"
             data-mod-key="${escapeHtml(modKey)}"
             data-mod-text="${escapeHtml(mod.text)}"
             data-mod-type="${mod.type}"
             data-mod-stat-id="${escapeHtml(mod.statId || '')}"
             ${isSelected ? 'checked' : ''}>
      ${tierBadge}
      <span class="mod-text">${escapeHtml(mod.text)}</span>
      <span class="mod-type">${isPseudo ? 'PSEUDO' : mod.type}</span>
      ${pseudoCountBadge}
      ${rangeDisplay}
    </div>
  `;
}

function formatRangeDisplay(range) {
  if (!range) return '';

  const hasMin = range.min !== undefined && range.min !== null && Number.isFinite(Number(range.min));
  const hasMax = range.max !== undefined && range.max !== null && Number.isFinite(Number(range.max));
  if (!hasMin && !hasMax) return '';

  const minValue = hasMin ? Number(range.min) : null;
  const maxValue = hasMax ? Number(range.max) : null;
  const minInput = hasMin
    ? `<input type="number" class="mod-range-edit" data-range-type="min" value="${minValue}">`
    : '';
  const maxInput = hasMax
    ? `<input type="number" class="mod-range-edit" data-range-type="max" value="${maxValue}">`
    : '';

  if (hasMin && hasMax) {
    return `<span class="mod-range">${minInput}<span>-</span>${maxInput}</span>`;
  }
  if (hasMin) {
    return `<span class="mod-range">${minInput}<span>+</span></span>`;
  }
  return `<span class="mod-range"><span><=</span>${maxInput}</span>`;
}

function renderPriceList(priceDetails) {
  if (!priceDetails || !priceDetails.all || priceDetails.all.length === 0) {
    return '<div style="color: #999; padding: 10px;">No price data available</div>';
  }

  let html = '';
  priceDetails.all.forEach((price, idx) => {
    const isUsed = idx < (priceDetails.usedForAverage?.length || 0);
    const chaosValue = Number(price?.chaos);
    const chaosAttr = Number.isFinite(chaosValue) ? ` data-chaos="${chaosValue}"` : '';
    html += `
      <div class="price-item ${isUsed ? 'used' : ''}"${chaosAttr}>
        <span class="price-item-number">${isUsed ? '?' : ''} ${idx + 1}.</span>
        <span class="price-item-value">${price.amount} ${price.currency}</span>
        <span class="price-item-chaos">${price.chaos}c</span>
      </div>
    `;
  });

  if (priceDetails.usedForAverage && priceDetails.usedForAverage.length > 0) {
    html += `<div style="color: #999; font-size: 12px; margin-top: 8px;">
      ? = Used for average calculation (cheapest ${priceDetails.usedForAverage.length})
    </div>`;
  }

  return html;
}

function formatManualInputChaos(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const safe = Math.max(0, numeric);
  return safe.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function setManualPriceInputValue(value) {
  const input = document.getElementById('manualPriceInput');
  if (!input) return;
  const formatted = formatManualInputChaos(value);
  if (!formatted) return;
  input.value = formatted;
}

function setPricingFeedback(message, tone = 'info') {
  const feedbackEl = document.getElementById('pricingFeedback');
  if (!feedbackEl) {
    if (message) {
      console.info('[PRICING]', message);
    }
    return;
  }

  if (!message) {
    feedbackEl.textContent = '';
    feedbackEl.className = 'pricing-feedback';
    feedbackEl.style.display = 'none';
    return;
  }

  feedbackEl.textContent = message;
  feedbackEl.className = `pricing-feedback ${tone}`;
  feedbackEl.style.display = 'block';
}

function bindPriceRowQuickSelect(modal) {
  if (!modal) return;
  modal.querySelectorAll('.price-item[data-chaos]').forEach((row) => {
    row.addEventListener('click', () => {
      const chaos = Number(row.dataset.chaos);
      if (!Number.isFinite(chaos)) return;
      setManualPriceInputValue(chaos);
      setPricingFeedback(`Set price input updated to ${formatChaosValue(chaos)}.`, 'info');
    });
  });
}

function closePricingModal() {
  const modal = document.getElementById('pricingModal');
  if (modal) modal.remove();
}

function shouldIgnorePricingRowToggle(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest(
      'input, button, select, textarea, a, label, .mod-range, .pricing-action-btn, .pricing-modal-close, details, summary'
    )
  );
}

function toggleCheckboxWithChange(checkbox) {
  if (!checkbox || checkbox.disabled) return;
  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

function bindPricingSelectionRowClicks(modal) {
  if (!modal) return;

  modal.querySelectorAll('.mod-item').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (shouldIgnorePricingRowToggle(event.target)) return;
      const checkbox = row.querySelector('.mod-checkbox');
      toggleCheckboxWithChange(checkbox);
    });
  });

  modal.querySelectorAll('.property-item').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (shouldIgnorePricingRowToggle(event.target)) return;
      const checkbox = row.querySelector('.property-checkbox');
      if (!checkbox || checkbox.disabled) return;
      checkbox.checked = !checkbox.checked;
    });
  });
}

function onModCheckboxChange(e) {
  const checkbox = e.target;
  const modKey = checkbox.dataset.modKey || '';

  // Update in currentPricingData
  if (currentPricingData && currentPricingData.allMods) {
    const mod = currentPricingData.allMods.find(m => getPricingModKey(m) === modKey)
      || currentPricingData.allMods.find(m => m.text === checkbox.dataset.modText);
    if (mod) {
      mod.selected = checkbox.checked;
      applyPseudoSelectionConflicts(currentPricingData.allMods, mod);
      syncModalModSelectionFromData(currentPricingData.allMods);
    }
  }
}

function applyPseudoSelectionConflicts(allMods, changedMod) {
  if (!Array.isArray(allMods) || !changedMod) return;
  if (changedMod.selected !== true) return;

  const changedKey = getPricingModKey(changedMod);
  const changedIsPseudo = String(changedMod?.type || '').toLowerCase() === 'pseudo';

  if (changedIsPseudo && Array.isArray(changedMod.sourceModKeys)) {
    const sourceSet = new Set(changedMod.sourceModKeys);
    for (const mod of allMods) {
      const modKey = getPricingModKey(mod);
      if (!modKey || modKey === changedKey) continue;
      if (sourceSet.has(modKey)) {
        mod.selected = false;
      }
    }
    return;
  }

  for (const mod of allMods) {
    if (String(mod?.type || '').toLowerCase() !== 'pseudo') continue;
    if (!mod.selected || !Array.isArray(mod.sourceModKeys) || mod.sourceModKeys.length === 0) continue;
    if (mod.sourceModKeys.includes(changedKey)) {
      mod.selected = false;
    }
  }
}

function syncModalModSelectionFromData(allMods) {
  if (!Array.isArray(allMods) || allMods.length === 0) return;
  const selectedByKey = new Map();
  for (const mod of allMods) {
    selectedByKey.set(getPricingModKey(mod), mod.selected === true);
  }

  document.querySelectorAll('.mod-checkbox').forEach((cb) => {
    const key = cb.dataset.modKey || '';
    if (!selectedByKey.has(key)) return;
    const selected = selectedByKey.get(key) === true;
    cb.checked = selected;
    const item = cb.closest('.mod-item');
    if (item) {
      item.classList.toggle('selected', selected);
    }
  });
}

function onRangeChange(e) {
  const input = e.target;
  const rangeType = input.dataset.rangeType;
  const value = parseFloat(input.value);
  if (!Number.isFinite(value)) return;

  // Find the mod this range belongs to
  const modItem = input.closest('.mod-item');
  const checkbox = modItem?.querySelector('.mod-checkbox');
  if (!checkbox) return;

  const modKey = checkbox.dataset.modKey || '';
  if (!currentPricingData || !currentPricingData.allMods) return;

  const mod = currentPricingData.allMods.find(m => getPricingModKey(m) === modKey)
    || currentPricingData.allMods.find(m => m.text === checkbox.dataset.modText);
  if (!mod || !mod.range) return;

  // Update range
  if (rangeType === 'min') {
    mod.range.min = value;
  } else if (rangeType === 'max') {
    mod.range.max = value;
  }
}

function getPrioritizedSelectedModsForRequest(allMods) {
  const source = Array.isArray(allMods) ? allMods : [];
  if (!source.length) return [];
  const prioritized = enforcePseudoPrioritySelection(source.map((mod) => ({ ...mod })));
  return prioritized.filter((mod) => mod.selected);
}

async function repriceItem(item) {
  if (isAuctionHouseCandidateItem(item)) {
    setPricingFeedback('This item uses Currency Exchange pricing and is excluded from trade repricing.', 'info');
    return;
  }
  if (!currentPricingData || !currentPricingData.allMods) {
    setPricingFeedback('No pricing context available for this item.', 'warn');
    return;
  }

  const itemLeague = getOperationalLeague(item._league || currentLeague);
  console.log('[REPRICE] Using league:', itemLeague, '(from item._league:', item._league, ', currentLeague:', currentLeague, ')');

  const repriceBtn = document.getElementById('repriceBtn');
  const originalText = repriceBtn ? repriceBtn.textContent : 'Re-price';
  if (repriceBtn) {
    repriceBtn.disabled = true;
    repriceBtn.textContent = 'Pricing...';
  }
  setPricingFeedback('Pricing item using selected filters...', 'info');

  try {
    try {
      const preferences = await window.networthOverlayAPI.getPreferences();
      setPreferredPricingListingMode(preferences?.pricingListingMode || preferredPricingListingMode);
    } catch {}

    syncModalModSelectionFromData(currentPricingData.allMods);
    const checkedBoxes = Array.from(document.querySelectorAll('.mod-checkbox:checked'));
    const forcedModsFromUi = checkedBoxes
      .map((cb) => {
        const modKey = cb.dataset.modKey || '';
        const mod = currentPricingData.allMods.find((m) => getPricingModKey(m) === modKey)
          || currentPricingData.allMods.find((m) => m.text === cb.dataset.modText);
        if (!mod) return null;
        return {
          text: mod.text,
          type: mod.type,
          statId: mod.statId || cb.dataset.modStatId || undefined,
          range: mod.range || {},
        };
      })
      .filter(Boolean);

    const forcedMods = forcedModsFromUi.length > 0
      ? forcedModsFromUi
      : getPrioritizedSelectedModsForRequest(currentPricingData.allMods).map((mod) => ({
        text: mod.text,
        type: mod.type,
        statId: mod.statId,
        range: mod.range || {},
      }));

    const forcedModKeys = new Set(forcedMods.map((mod) => getPricingModKey(mod)));
    currentPricingData.allMods = currentPricingData.allMods.map((mod) => ({
      ...mod,
      selected: forcedModKeys.has(getPricingModKey(mod)),
    }));
    currentPricingData.selectedMods = forcedMods.map((mod) => ({
      text: mod.text,
      type: mod.type,
      statId: mod.statId,
      range: mod.range,
      enabled: true,
    }));

    const properties = readPropertySelectionFromDom();
    currentPricingData.propertySelection = normalizePropertySelection(properties);
    const listingMode = setPreferredPricingListingMode(
      currentPricingData?.listingMode || preferredPricingListingMode
    );

    const options = {
      forcedMods: forcedMods.length > 0 ? forcedMods : null,
      useCache: false,
      listingMode,
      ...properties,
    };

    console.info('[REPRICE] API call -> networth:priceItem', {
      league: itemLeague,
      item: {
        id: item?.id || null,
        name: item?.name || null,
        typeLine: item?.typeLine || item?.type_line || null,
        baseType: item?.baseType || item?.base_type || null,
        frameType: item?.frameType ?? item?.frame_type ?? null,
        ilvl: item?.ilvl ?? null,
      },
      options: {
        ...options,
        forcedModsCount: Array.isArray(forcedMods) ? forcedMods.length : 0,
        forcedMods: forcedMods.map((mod) => ({
          type: mod.type,
          statId: mod.statId || null,
          text: mod.text,
          range: mod.range || null,
        })),
      },
    });

    const pricingResponse = await window.networthOverlayAPI.priceItem(item, itemLeague, options);
    if (pricingResponse?.success === false) {
      throw new Error(pricingResponse.error || 'Server pricing is unavailable.');
    }

    const pricingPayload = (() => {
      if (pricingResponse && typeof pricingResponse === 'object') {
        if (pricingResponse.pricing && typeof pricingResponse.pricing === 'object') {
          return pricingResponse.pricing;
        }
        return pricingResponse;
      }
      return null;
    })();

    if (!pricingPayload || typeof pricingPayload !== 'object') {
      throw new Error('Invalid pricing response returned by the pricing service.');
    }

    if (pricingPayload.estimated !== true) {
      const noEstimatePricing = {
        ...ensurePricingData(item),
        ...pricingPayload,
        estimated: false,
        chaos: Number.isFinite(Number(pricingPayload.chaos)) ? Number(pricingPayload.chaos) : 0,
        divine: Number.isFinite(Number(pricingPayload.divine)) ? Number(pricingPayload.divine) : 0,
        listingMode: normalizePricingListingMode(pricingPayload.listingMode || listingMode),
        propertySelection: normalizePropertySelection(currentPricingData.propertySelection || properties),
        selectedMods: Array.isArray(pricingPayload.selectedMods) && pricingPayload.selectedMods.length > 0
          ? pricingPayload.selectedMods
          : forcedMods,
      };
      item._pricing = noEstimatePricing;
      const hydratedNoEstimatePricing = ensurePricingData(item);
      item._pricing = hydratedNoEstimatePricing;
      currentPricingData = hydratedNoEstimatePricing;
      closePricingModal();
      showPricingModal(item, hydratedNoEstimatePricing);
      setPricingFeedback(
        pricingPayload.error || 'No comparable listings found for this item/mod selection.',
        'warn'
      );
      return;
    }

    const newPricing = pricingPayload;

    newPricing.source = 'repriced';
    newPricing.listingMode = normalizePricingListingMode(newPricing.listingMode || listingMode);
    newPricing.propertySelection = normalizePropertySelection(currentPricingData.propertySelection || properties);
    setPreferredPricingListingMode(newPricing.listingMode);
    newPricing.selectedMods = newPricing.selectedMods || forcedMods;
    item._pricing = newPricing;
    const hydratedPricing = ensurePricingData(item);
    item._pricing = hydratedPricing;
    currentPricingData = hydratedPricing;

    closePricingModal();
    showPricingModal(item, hydratedPricing);
    setManualPriceInputValue(hydratedPricing.chaos);
    setPricingFeedback('Price estimate updated. Click Set Price to apply it.', 'success');

    console.log('[REPRICE] Success! New price:', hydratedPricing.chaos, 'chaos');
  } catch (error) {
    console.error('[REPRICE] Error:', error);
    setPricingFeedback(`Repricing failed: ${error.message || String(error)}`, 'warn');
    if (repriceBtn) {
      repriceBtn.disabled = false;
      repriceBtn.textContent = originalText;
    }
  }
}

async function setManualPrice() {
  const input = document.getElementById('manualPriceInput');
  const chaosValue = parseFloat(input.value);

  if (isNaN(chaosValue) || chaosValue < 0) {
    setPricingFeedback('Please enter a valid price.', 'warn');
    return;
  }

  if (!currentPricingItem) {
    setPricingFeedback('No item selected.', 'warn');
    return;
  }
  if (isAuctionHouseCandidateItem(currentPricingItem)) {
    setPricingFeedback('This item uses Currency Exchange pricing and cannot be manually trade-priced.', 'warn');
    return;
  }

  // Capture the current mod selection from the UI so we persist how the price was derived
  const selectedModTexts = new Set();
  const selectedModKeys = new Set();
  document.querySelectorAll('.mod-checkbox:checked').forEach(cb => {
    if (cb.dataset.modKey) selectedModKeys.add(cb.dataset.modKey);
    if (cb.dataset.modText) selectedModTexts.add(cb.dataset.modText);
  });

  const allMods = (currentPricingData?.allMods || []).map(mod => ({
    ...mod,
    selected: selectedModKeys.has(getPricingModKey(mod)) || selectedModTexts.has(mod.text)
  }));

  const selectedMods = getPrioritizedSelectedModsForRequest(allMods)
    .map(mod => ({
      text: mod.text,
      type: mod.type,
      statId: mod.statId,
      range: mod.range,
      enabled: true
    }));
  const prioritizedSelectedModKeys = new Set(selectedMods.map((mod) => getPricingModKey(mod)));
  currentPricingData.allMods = allMods.map((mod) => ({
    ...mod,
    selected: prioritizedSelectedModKeys.has(getPricingModKey(mod)),
  }));
  currentPricingData.selectedMods = selectedMods;
  const listingMode = setPreferredPricingListingMode(currentPricingData?.listingMode || preferredPricingListingMode);
  currentPricingData.listingMode = listingMode;
  currentPricingData.propertySelection = normalizePropertySelection(readPropertySelectionFromDom());

  const league = getOperationalLeague(currentPricingItem._league || currentLeague);

  const manualPricing = {
    estimated: true,
    chaos: chaosValue,
    divine: (chaosValue / getDivineRate()).toFixed(2),
    confidence: 'manual',
    sampleSize: 0,
    range: { min: chaosValue, max: chaosValue },
    selectedMods,
    allMods: currentPricingData.allMods,
    priceDetails: currentPricingData?.priceDetails || null,
    tradeUrl: currentPricingData?.tradeUrl || null,
    propertySelection: currentPricingData.propertySelection,
    listingMode,
    source: 'manual_override',
    timestamp: Date.now()
  };

  // Update item display
  currentPricingItem._pricing = manualPricing;
  currentPricingItem._networth = {
    value: chaosValue,
    currency: 'chaos',
    source: 'manual_override'
  };

  // Update the final price display
  const priceValue = document.querySelector('.final-price-value');
  if (priceValue) {
    priceValue.textContent = `${chaosValue}c (${(chaosValue / getDivineRate()).toFixed(2)}d)`;
  }

  // Persist to backend/cache/queue
  try {
    await window.networthOverlayAPI.saveManualPricing(currentPricingItem, manualPricing, league);
    setPricingFeedback(`Price saved at ${formatChaosValue(chaosValue)}.`, 'success');
  } catch (err) {
    console.error('Failed to persist manual price', err);
    setPricingFeedback('Price updated locally, but persistence failed.', 'warn');
  }

  // Refresh the items table and queue to show new price
  updateAll();
  if (queueViewActive) {
    loadQueueView();
  }

}

function saveFeedbackData(item, selectedMods) {
  // Prepare feedback data for server (future feature)
  const feedback = {
    itemType: item.baseType || item.typeLine,
    frameType: item.frameType,
    selectedMods: selectedMods.map(m => ({
      text: m.text,
      type: m.type,
      statId: m.statId,
      range: m.range
    })),
    timestamp: Date.now(),
    league: currentLeague
  };

  // Placeholder until explicit pricing feedback is persisted separately.
  console.log('[FEEDBACK] User mod selection:', feedback);

  // TODO: Send to server when backend is ready
  // await fetch('/api/pricing-feedback', { method: 'POST', body: JSON.stringify(feedback) });
}






















const DEFAULT_REALM = 'pc';
const NETWORTH_ACTIVE_LEAGUE = 'Mirage';
const NETWORTH_SCAN_HISTORY_LIMIT = 20;
const WEBSITE_FEATURE_MESSAGE =
  'Pricing and run management are handled by website services and are not available in this client module.';
const PRICING_QUEUE_LIMIT = 500;
const SCAN_QUEUE_LIMIT = 200;
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
const CURRENCY_RATES_CACHE_MS = 10 * 60 * 1000;
const PRICING_CONFIG_CACHE_MS = 60 * 60 * 1000;
const CURRENCY_SHARD_DIVISOR = 20;
const STASH_SCAN_RETRY_MS = 60 * 1000;
const STASH_SCAN_BATCH_RETRY_MS = 1500;
const PRICING_QUEUE_REQUEST_INTERVAL_MS = 5000;
const PRICING_QUEUE_REMOTE_PERSIST_INTERVAL_MS = 10000;
const RATE_LIMIT_MIN_RETRY_MS = 1500;
const RATE_LIMIT_MAX_RETRY_MS = 5 * 60 * 1000;
const AUTO_QUEUE_UNPRICED_MAX_FAILURES = 2;
const AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const AUTO_QUEUE_UNPRICED_DEFAULT = false;
const DEFAULT_MAX_TABS_PER_SCAN = 8;
const MAX_TABS_PER_SCAN = 50;
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
const CX_TEXT_MARKUP_REGEX = /<<[^>]+>>/g;
const CURRENCY_RATE_KEY_ALIASES = {
  'chromatic orb': ['chromatic'],
  'jewellers orb': ['jewellers', 'jeweller'],
  'jeweller orb': ['jewellers', 'jeweller'],
  'scroll of wisdom': ['wisdom'],
  'portal scroll': ['portal'],
  'glassblowers bauble': ['bauble'],
  'blacksmiths whetstone': ['whetstone'],
  'armourers scrap': ['scrap'],
  'cartographers chisel': ['chisel'],
  'gemcutters prism': ['gcp'],
  'orb of transmutation': ['transmutation', 'transmute'],
  'orb of augmentation': ['augmentation', 'aug'],
  'orb of annulment': ['annul'],
  'annulment orb': ['annul'],
  'primal crystallised lifeforce': ['primal lifeforce', 'primal-lifeforce'],
  'wild crystallised lifeforce': ['wild lifeforce', 'wild-lifeforce'],
  'vivid crystallised lifeforce': ['vivid lifeforce', 'vivid-lifeforce'],
  'sacred crystallised lifeforce': ['sacred lifeforce', 'sacred-lifeforce'],
};

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePricingListingMode(value) {
  const normalized = safeString(value).toLowerCase().replace(/[\s-]+/g, '_');
  return PRICING_LISTING_MODE_ALIASES[normalized] || DEFAULT_PRICING_LISTING_MODE;
}

function normalizePricingOptions(options) {
  const source = asObject(options) || {};
  return {
    ...source,
    listingMode: normalizePricingListingMode(source.listingMode),
    queueMode: source.queueMode === true,
  };
}

function sanitizeRealm(value) {
  const raw = safeString(value).toLowerCase();
  if (raw === 'xbox' || raw === 'sony' || raw === 'pc') return raw;
  return DEFAULT_REALM;
}

function sanitizeLeague(value) {
  const raw = safeString(value);
  return raw.length > 0 ? raw : null;
}

function resolveNetworthLeague(_value) {
  return NETWORTH_ACTIVE_LEAGUE;
}

function sanitizeCharacterName(value) {
  const raw = safeString(value);
  return raw.length > 0 ? raw : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizePricingConfigPayload(payload) {
  const source = asObject(payload);
  if (!source) return null;

  const version = safeString(source.version);
  const generatedAt = Number(source.generatedAt);
  const maxSelectedMods = Number(source.maxSelectedMods);
  const fallbackRules = asArray(source.fallbackRules)
    .map((entry) => {
      const rule = asObject(entry);
      if (!rule) return null;
      const type = safeString(rule.type).toLowerCase();
      const pattern = safeString(rule.pattern);
      if (!type || !pattern) return null;
      return {
        type,
        pattern,
        flags: safeString(rule.flags),
        minValue: Number(rule.minValue) || 0,
        score: Number(rule.score) || 0,
      };
    })
    .filter(Boolean);

  const pseudoStats = asArray(source.pseudoStats)
    .map((entry) => {
      const pseudo = asObject(entry);
      if (!pseudo) return null;
      const id = safeString(pseudo.id).toLowerCase();
      const text = safeString(pseudo.text);
      if (!id.startsWith('pseudo.') || !text) return null;
      return {
        id,
        text,
        prefix: safeString(pseudo.prefix).toLowerCase() || 'pseudo',
        type: safeString(pseudo.type).toLowerCase() || 'pseudo',
      };
    })
    .filter(Boolean);

  const tradeCategoryMapSource = asObject(source.tradeCategoryMap) || {};
  const tradeCategoryMap = {};
  for (const [key, value] of Object.entries(tradeCategoryMapSource)) {
    const safeKey = safeString(key).toLowerCase();
    const safeValue = safeString(value).toLowerCase();
    if (!safeKey || !safeValue) continue;
    tradeCategoryMap[safeKey] = safeValue;
  }

  const rulesSource = asObject(source.rules) || {};
  const rules = {};
  for (const [categoryKey, rawRules] of Object.entries(rulesSource)) {
    const safeCategory = safeString(categoryKey).toLowerCase();
    const ruleSet = asObject(rawRules);
    if (!safeCategory || !ruleSet) continue;
    rules[safeCategory] = ruleSet;
  }

  return {
    version: version || 'unknown',
    generatedAt: Number.isFinite(generatedAt) && generatedAt > 0 ? generatedAt : Date.now(),
    maxSelectedMods: Number.isFinite(maxSelectedMods) && maxSelectedMods > 0 ? Math.floor(maxSelectedMods) : 4,
    fallbackRules,
    pseudoStats,
    tradeCategoryMap,
    rules,
  };
}

function realmPrefix(realm) {
  return realm && realm !== DEFAULT_REALM ? `/${encodeURIComponent(realm)}` : '';
}

function normalizeErrorMessage(error) {
  return buildErrorMessage(error).toLowerCase();
}

function isRateLimitError(error) {
  const message = normalizeErrorMessage(error);
  const status = Number(error?.status);
  return status === 429 || message.includes('429') || message.includes('rate limit');
}

function isNotFoundError(error) {
  const message = normalizeErrorMessage(error);
  return message.includes('404') || message.includes('resource not found');
}

function isUnauthorizedError(error) {
  const message = normalizeErrorMessage(error);
  const status = Number(error?.status);
  return status === 401 || status === 403 || message.includes('unauthorized') || message.includes('invalid or missing access token');
}

function buildErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || 'Unknown error');
}

function clampRateLimitDelayMs(value, fallbackMs = STASH_SCAN_RETRY_MS) {
  const fallback = Math.max(RATE_LIMIT_MIN_RETRY_MS, Number(fallbackMs) || STASH_SCAN_RETRY_MS);
  const parsed = Number(value);
  const delay = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  return Math.min(RATE_LIMIT_MAX_RETRY_MS, Math.max(RATE_LIMIT_MIN_RETRY_MS, Math.round(delay)));
}

function parseRetryAfterDelayMs(value) {
  if (value === null || value === undefined) return null;
  const raw = safeString(value);
  if (!raw) return null;

  const numericSeconds = Number(raw);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return numericSeconds * 1000;
  }

  const asDateMs = Date.parse(raw);
  if (!Number.isFinite(asDateMs)) return null;
  return Math.max(0, asDateMs - Date.now());
}

function parseRetryDelayFromMessage(message) {
  const normalized = safeString(message).toLowerCase();
  if (!normalized) return null;

  const retryAfterMatch = normalized.match(/retry(?:-| )?after[^0-9]*(\d+(?:\.\d+)?)/i);
  if (retryAfterMatch) {
    const seconds = Number(retryAfterMatch[1]);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  const resetMatch = normalized.match(/(?:resets?|reset in|retry in)[^0-9]*(\d+(?:\.\d+)?)(?:\s*)(ms|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes)?/i);
  if (resetMatch) {
    const amount = Number(resetMatch[1]);
    const unit = safeString(resetMatch[2]).toLowerCase();
    if (!Number.isFinite(amount) || amount < 0) return null;
    if (unit.startsWith('ms')) return amount;
    if (unit.startsWith('m')) return amount * 60 * 1000;
    return amount * 1000;
  }

  const waitMatch = normalized.match(/please wait[^0-9]*(\d+(?:\.\d+)?)(?:\s*)(ms|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes)?/i);
  if (waitMatch) {
    const amount = Number(waitMatch[1]);
    const unit = safeString(waitMatch[2]).toLowerCase();
    if (!Number.isFinite(amount) || amount < 0) return null;
    if (unit.startsWith('ms')) return amount;
    if (unit.startsWith('m')) return amount * 60 * 1000;
    return amount * 1000;
  }

  return null;
}

function resolveRateLimitDelayMs(error, fallbackMs = STASH_SCAN_RETRY_MS) {
  const retryAfterMs = Number(error?.retryAfterMs);
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return clampRateLimitDelayMs(retryAfterMs, fallbackMs);
  }

  const retryAfterAt = Number(error?.retryAfterAt);
  if (Number.isFinite(retryAfterAt) && retryAfterAt > 0) {
    return clampRateLimitDelayMs(retryAfterAt - Date.now(), fallbackMs);
  }

  const parsedHeaderDelay = parseRetryAfterDelayMs(error?.retryAfter);
  if (parsedHeaderDelay !== null) {
    return clampRateLimitDelayMs(parsedHeaderDelay, fallbackMs);
  }

  const parsedMessageDelay = parseRetryDelayFromMessage(buildErrorMessage(error));
  if (parsedMessageDelay !== null) {
    return clampRateLimitDelayMs(parsedMessageDelay, fallbackMs);
  }

  return clampRateLimitDelayMs(fallbackMs, fallbackMs);
}

function normalizeRateLimitState(source) {
  const input = asObject(source) || {};
  const normalizeUntil = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return {
    globalUntil: normalizeUntil(input.globalUntil),
    pricingUntil: normalizeUntil(input.pricingUntil),
    scanUntil: normalizeUntil(input.scanUntil),
  };
}

function getRateLimitUntil(state, scope) {
  const rateLimitState = normalizeRateLimitState(state?.rateLimits);
  if (scope === 'pricing') {
    return Math.max(rateLimitState.globalUntil, rateLimitState.pricingUntil);
  }
  if (scope === 'scan') {
    return Math.max(rateLimitState.globalUntil, rateLimitState.scanUntil);
  }
  return Math.max(rateLimitState.globalUntil, rateLimitState.pricingUntil, rateLimitState.scanUntil);
}

function getRateLimitDelayMs(state, scope) {
  return Math.max(0, getRateLimitUntil(state, scope) - Date.now());
}

function markRateLimited(state, scope, delayMs) {
  const now = Date.now();
  const nextUntil = now + clampRateLimitDelayMs(delayMs, STASH_SCAN_RETRY_MS);
  const rateLimits = normalizeRateLimitState(state?.rateLimits);
  rateLimits.globalUntil = Math.max(rateLimits.globalUntil, nextUntil);
  if (scope === 'pricing') {
    rateLimits.pricingUntil = Math.max(rateLimits.pricingUntil, nextUntil);
  } else if (scope === 'scan') {
    rateLimits.scanUntil = Math.max(rateLimits.scanUntil, nextUntil);
  }
  state.rateLimits = rateLimits;
  return nextUntil;
}

function parseTabIndices(input) {
  if (!Array.isArray(input)) return [];
  const dedup = new Set();
  for (const value of input) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    dedup.add(parsed);
  }
  return Array.from(dedup).sort((a, b) => a - b);
}

function normalizeTab(tab, fallbackIndex = 0, inheritedParentId = '') {
  const source = asObject(tab) || {};
  const metadata = asObject(source.metadata) || asObject(source.stash) || asObject(source.tab) || {};
  const indexCandidate = Number.parseInt(
    String(source.i ?? source.index ?? source.tabIndex ?? source.tab_id ?? metadata.i ?? metadata.index ?? metadata.tabIndex ?? fallbackIndex),
    10
  );
  const index = Number.isFinite(indexCandidate) ? indexCandidate : fallbackIndex;
  const id = safeString(
    source.id ||
    source.public_id ||
    source.publicId ||
    source.tabId ||
    source.tab_id ||
    source.stashId ||
    source.stash_id ||
    metadata.id ||
    metadata.public_id ||
    metadata.publicId ||
    metadata.stashId ||
    metadata.stash_id ||
    ''
  );
  const parentId = safeString(
    source.parent ||
    source.parentId ||
    source.parent_id ||
    source.parentStashId ||
    source.parent_stash_id ||
    metadata.parent ||
    metadata.parentId ||
    metadata.parent_id ||
    metadata.parentStashId ||
    metadata.parent_stash_id ||
    inheritedParentId ||
    ''
  );
  const name = safeString(
    source.n ||
    source.name ||
    source.label ||
    source.tabName ||
    source.tab_name ||
    metadata.n ||
    metadata.name ||
    metadata.label ||
    metadata.tabName ||
    metadata.tab_name ||
    ''
  ) || `Tab ${index + 1}`;
  const type = safeString(
    source.type ||
    source.t ||
    source.tabType ||
    source.tab_type ||
    metadata.type ||
    metadata.t ||
    metadata.tabType ||
    metadata.tab_type ||
    ''
  ) || 'NormalStash';
  return {
    index,
    id: id || String(index),
    stashId: id || null,
    parentId: parentId || null,
    name,
    type,
    color: safeString(source.colour || source.color || metadata.colour || metadata.color || ''),
    hidden: Boolean(source.hidden ?? metadata.hidden),
    removeOnly: Boolean(source.removeOnly || source.remove_only || metadata.removeOnly || metadata.remove_only),
  };
}

function extractTabsFromPayload(payload) {
  const root = asObject(payload) || {};
  const nested = asObject(root.stash) || {};
  const result = asObject(root.result) || {};
  const data = asObject(root.data) || {};
  const candidates = [
    asArray(root.tabs),
    asArray(root.stashTabs),
    asArray(root.stashes),
    asArray(root.stash),
    asArray(nested.tabs),
    asArray(nested.stashTabs),
    asArray(nested.stashes),
    asArray(result.tabs),
    asArray(result.stashes),
    asArray(result.stashTabs),
    asArray(data.tabs),
    asArray(data.stashes),
    asArray(data.stashTabs),
  ];

  const flattenTabs = (list) => {
    const output = [];
    const seen = new Set();
    const visit = (entry, fallbackIndex = output.length, inheritedParentId = '') => {
      const normalized = normalizeTab(entry, fallbackIndex, inheritedParentId);
      const dedupeKey = `${normalized.index}:${normalized.stashId || normalized.id}:${normalized.parentId || ''}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        output.push(normalized);
      }

      const source = asObject(entry) || {};
      const childrenCandidates = [
        asArray(source.children),
        asArray(source.tabs),
        asArray(source.stashes),
        asArray(source.subtabs),
        asArray(source.subStashes),
        asArray(source.substashes),
      ];
      for (const group of childrenCandidates) {
        group.forEach((child, childIndex) => {
          visit(child, childIndex, normalized.stashId || normalized.id || inheritedParentId);
        });
      }
    };

    list.forEach((entry, index) => visit(entry, index, ''));
    return output;
  };

  for (const list of candidates) {
    if (list.length === 0) continue;
    return flattenTabs(list);
  }

  const singletonCandidates = [
    asObject(root.stash),
    asObject(root.tab),
    asObject(root.currentTab),
    asObject(result.stash),
    asObject(data.stash),
  ];
  for (const entry of singletonCandidates) {
    if (!entry) continue;
    const normalized = normalizeTab(entry, 0);
    if (normalized.id || normalized.name) {
      return [normalized];
    }
  }

  return [];
}

function extractNumTabs(payload, fallbackTabs = []) {
  const root = asObject(payload) || {};
  const nested = asObject(root.stash) || {};
  const result = asObject(root.result) || {};
  const data = asObject(root.data) || {};
  const candidates = [
    root.numTabs,
    root.num_tabs,
    root.totalTabs,
    root.total_tabs,
    nested.numTabs,
    nested.num_tabs,
    nested.totalTabs,
    nested.total_tabs,
    result.numTabs,
    result.num_tabs,
    result.totalTabs,
    result.total_tabs,
    data.numTabs,
    data.num_tabs,
    data.totalTabs,
    data.total_tabs,
  ];

  for (const candidate of candidates) {
    const parsed = Number.parseInt(String(candidate), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallbackTabs.length;
}

function collectItemCandidates(input, out, fallbackInventoryId = null) {
  if (!input) return;

  if (Array.isArray(input)) {
    for (const entry of input) {
      collectItemCandidates(entry, out, fallbackInventoryId);
    }
    return;
  }

  const obj = asObject(input);
  if (!obj) return;

  const looksLikeItem =
    Boolean(
      obj.typeLine ||
      obj.type_line ||
      obj.baseType ||
      obj.base_type ||
      obj.icon ||
      obj.inventoryId ||
      obj.inventory_id ||
      obj.frameType ||
      obj.frame_type ||
      obj.stackSize ||
      obj.stack_size ||
      Number.isFinite(obj.x) ||
      Number.isFinite(obj.y)
    ) || Array.isArray(obj.sockets) || Array.isArray(obj.socketedItems) || Array.isArray(obj.socketed_items);

  if (looksLikeItem) {
    if (!obj.inventoryId && !obj.inventory_id && fallbackInventoryId) {
      out.push({ ...obj, inventoryId: fallbackInventoryId });
    } else {
      out.push(obj);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const nextFallback = fallbackInventoryId || key;
    collectItemCandidates(value, out, nextFallback);
  }
}

function dedupeItems(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const id = safeString(item?.id || item?.itemId || '');
    const key = id || [
      safeString(item?.name || ''),
      safeString(item?.typeLine || item?.type_line || ''),
      safeString(item?.inventoryId || item?.inventory_id || ''),
      Number.isFinite(item?.x) ? Number(item.x) : '',
      Number.isFinite(item?.y) ? Number(item.y) : '',
      Number.isFinite(item?.stackSize) ? Number(item.stackSize) : '',
    ].join('|');

    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalFloat(value) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrencyRateKey(value) {
  return safeString(value)
    .replace(CX_TEXT_MARKUP_REGEX, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCurrencyRates(rawRates) {
  const source = asObject(rawRates) || {};
  const normalized = { ...DEFAULT_CURRENCY_RATES };

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = normalizeCurrencyRateKey(rawKey);
    if (!key) continue;

    let chaosRate = null;
    if (typeof rawValue === 'number') {
      chaosRate = Number.isFinite(rawValue) ? Number(rawValue) : null;
    } else {
      const valueObj = asObject(rawValue);
      chaosRate = parseOptionalFloat(valueObj?.chaos ?? valueObj?.rate ?? valueObj?.value);
    }
    if (chaosRate === null || chaosRate <= 0) continue;
    normalized[key] = chaosRate;
  }

  normalized.chaos = 1;
  if (!Number.isFinite(normalized.divine) || normalized.divine <= 0) {
    normalized.divine = DEFAULT_CURRENCY_RATES.divine;
  }
  return normalized;
}

function buildRateKeyCandidates(rawValue) {
  const normalized = normalizeCurrencyRateKey(rawValue);
  if (!normalized) return [];
  const compact = normalized.replace(/\s+/g, ' ');
  const baseVariants = new Set([compact]);

  if (compact.startsWith('orb of ')) {
    baseVariants.add(compact.slice(7));
  }
  if (compact.endsWith(' orb')) {
    baseVariants.add(compact.slice(0, -4));
  }
  if (compact.startsWith('scroll of ')) {
    baseVariants.add(compact.slice(10));
  }
  if (compact.endsWith(' scroll')) {
    baseVariants.add(compact.slice(0, -7));
  }
  if (compact.includes('crystallised')) {
    baseVariants.add(compact.replace(/\bcrystallised\b/g, '').replace(/\s+/g, ' ').trim());
  }
  if (compact.endsWith(' shard')) {
    const stem = compact.slice(0, -6).trim();
    if (stem) {
      baseVariants.add(stem);
      baseVariants.add(`${stem} orb`);
      baseVariants.add(`orb of ${stem}`);
    }
  }

  for (const variant of Array.from(baseVariants)) {
    const aliases = asArray(CURRENCY_RATE_KEY_ALIASES[variant]);
    for (const alias of aliases) {
      const normalizedAlias = normalizeCurrencyRateKey(alias);
      if (normalizedAlias) {
        baseVariants.add(normalizedAlias);
      }
    }
  }

  const candidates = new Set();
  const addForms = (value) => {
    const normalizedValue = normalizeCurrencyRateKey(value);
    if (!normalizedValue) return;
    const spaced = normalizedValue.replace(/\s+/g, ' ').trim();
    if (!spaced) return;
    candidates.add(spaced);
    candidates.add(spaced.replace(/\s+/g, '-'));
    candidates.add(spaced.replace(/\s+/g, ''));
  };

  for (const variant of baseVariants) {
    addForms(variant);
  }

  return Array.from(candidates).filter(Boolean);
}

function resolveCurrencyExchangeRateForItem(item, rates) {
  const source = asObject(item) || {};
  const rateMap = asObject(rates) || {};
  const values = [
    safeString(source.name),
    safeString(source.typeLine || source.type_line),
    safeString(source.baseType || source.base_type),
  ].filter(Boolean);

  for (const value of values) {
    const candidates = buildRateKeyCandidates(value);
    for (const candidate of candidates) {
      const chaosRate = parseOptionalFloat(rateMap[candidate]);
      if (chaosRate !== null && chaosRate > 0) {
        return { key: candidate, chaosRate };
      }
    }

    const normalizedValue = normalizeCurrencyRateKey(value);
    if (normalizedValue.endsWith(' shard')) {
      const stem = normalizedValue.slice(0, -6).trim();
      if (stem) {
        const shardBaseCandidates = buildRateKeyCandidates(`orb of ${stem}`);
        shardBaseCandidates.push(...buildRateKeyCandidates(stem));
        for (const baseCandidate of shardBaseCandidates) {
          const baseRate = parseOptionalFloat(rateMap[baseCandidate]);
          if (baseRate !== null && baseRate > 0) {
            return {
              key: `${baseCandidate}-shard`,
              chaosRate: baseRate / CURRENCY_SHARD_DIVISOR,
            };
          }
        }
      }
    }
  }
  return null;
}

function isExchangePricedCandidate(item) {
  const source = asObject(item) || {};
  const stackSize = parseOptionalInteger(source.stackSize ?? source.stack_size) || 1;
  const maxStackSize = parseOptionalInteger(source.maxStackSize ?? source.max_stack_size) || 0;
  const frameType = parseOptionalInteger(source.frameType ?? source.frame_type);
  if (maxStackSize > 1) return true;
  if (stackSize > 1) return true;
  if (frameType === 5) return true;
  return false;
}

function applyCurrencyExchangePricingToItem(item, rates) {
  const source = asObject(item);
  if (!source) return false;
  if (!isExchangePricedCandidate(source)) return false;

  const existingNetworth = asObject(source._networth);
  const existingSource = safeString(existingNetworth?.source).toLowerCase();
  const existingValue = parseOptionalFloat(existingNetworth?.value);
  if (
    existingValue !== null &&
    existingValue > 0 &&
    existingSource &&
    existingSource !== 'currency_exchange'
  ) {
    return false;
  }

  const resolved = resolveCurrencyExchangeRateForItem(source, rates);
  if (!resolved) return false;

  const stackSize = parseOptionalInteger(source.stackSize ?? source.stack_size) || 1;
  source._networth = {
    value: stackSize,
    currency: resolved.key,
    source: 'currency_exchange',
  };
  return true;
}

function applyCurrencyExchangePricingToScan(scan) {
  const source = asObject(scan);
  if (!source) return 0;
  const rates = normalizeCurrencyRates(source.currencyRates);
  source.currencyRates = rates;

  const collections = [
    asArray(source.items),
    asArray(source?.stash?.items),
    asArray(source?.inventory?.items),
  ];
  const seenIds = new Set();
  let updated = 0;

  for (const collection of collections) {
    for (const item of collection) {
      const itemObj = asObject(item);
      if (!itemObj) continue;
      const itemId = safeString(itemObj.id || itemObj.itemId || '');
      if (itemId && seenIds.has(itemId)) continue;
      if (itemId) seenIds.add(itemId);
      if (applyCurrencyExchangePricingToItem(itemObj, rates)) {
        updated += 1;
      }
    }
  }
  return updated;
}

function extractCurrencyRatesFromCxPayload(payload, league) {
  const root = asObject(payload) || {};
  const directRates = asObject(root.rates);
  if (directRates) {
    return normalizeCurrencyRates(directRates);
  }

  const nestedContainers = [
    asObject(root.data),
    asObject(root.result),
    asObject(root.snapshot),
    asObject(root.current),
  ].filter(Boolean);

  for (const container of nestedContainers) {
    if (asObject(container.rates)) {
      return normalizeCurrencyRates(container.rates);
    }
  }

  const snapshots = asArray(root.snapshots)
    .map((entry) => asObject(entry))
    .filter(Boolean);

  if (snapshots.length === 0) {
    for (const container of nestedContainers) {
      const nestedSnapshots = asArray(container.snapshots)
        .map((entry) => asObject(entry))
        .filter(Boolean);
      if (nestedSnapshots.length > 0) {
        snapshots.push(...nestedSnapshots);
        break;
      }
    }
  }

  if (snapshots.length === 0) return null;

  const normalizedLeague = safeString(league).toLowerCase();
  const matchedSnapshot = normalizedLeague
    ? snapshots.find((entry) => safeString(entry.league).toLowerCase() === normalizedLeague)
    : null;
  const selectedSnapshot = matchedSnapshot || snapshots[0];
  const rates = normalizeCurrencyRates(selectedSnapshot?.rates);
  return rates;
}

function toCurrencyRatesCacheKey(league, realm) {
  const safeLeague = safeString(league).toLowerCase();
  const safeRealm = sanitizeRealm(realm);
  if (!safeLeague) return null;
  return `${safeRealm}:${safeLeague}`;
}

function readCachedCurrencyRates(state, league, realm, { allowStale = false } = {}) {
  const cacheKey = toCurrencyRatesCacheKey(league, realm);
  if (!cacheKey) return null;
  const entry = asObject(state.currencyRatesByScope?.[cacheKey]);
  if (!entry) return null;
  const updatedAt = Number(entry.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  if (!allowStale && Date.now() - updatedAt > CURRENCY_RATES_CACHE_MS) return null;
  const rates = normalizeCurrencyRates(entry.rates);
  return rates;
}

function writeCachedCurrencyRates(state, league, realm, rates) {
  const cacheKey = toCurrencyRatesCacheKey(league, realm);
  if (!cacheKey) return;
  state.currencyRatesByScope[cacheKey] = {
    rates: normalizeCurrencyRates(rates),
    updatedAt: Date.now(),
  };
}

function hydrateScanCurrencyRatesFromCache(state, scan) {
  const source = asObject(scan);
  if (!source) return;
  const league = sanitizeLeague(source.league);
  const realm = sanitizeRealm(source.realm || DEFAULT_REALM);
  if (league) {
    const cached = readCachedCurrencyRates(state, league, realm, { allowStale: true });
    if (cached) {
      source.currencyRates = cached;
    }
  }
  source.currencyRates = normalizeCurrencyRates(source.currencyRates);
  applyCurrencyExchangePricingToScan(source);
}

async function fetchCurrencyRatesForLeague(apiClient, logger, state, league, realm) {
  const safeLeague = sanitizeLeague(league);
  const safeRealm = sanitizeRealm(realm);
  if (!safeLeague) return { ...DEFAULT_CURRENCY_RATES };

  const cached = readCachedCurrencyRates(state, safeLeague, safeRealm);
  if (cached) return cached;
  const staleCached = readCachedCurrencyRates(state, safeLeague, safeRealm, { allowStale: true });

  if (!apiClient || typeof apiClient.getNetworthCurrencyExchangeRates !== 'function') {
    if (staleCached) return staleCached;
    return { ...DEFAULT_CURRENCY_RATES };
  }

  try {
    const payload = await apiClient.getNetworthCurrencyExchangeRates({
      league: safeLeague,
      realm: safeRealm,
    });
    const rates = extractCurrencyRatesFromCxPayload(payload, safeLeague);
    if (rates) {
      writeCachedCurrencyRates(state, safeLeague, safeRealm, rates);
      return rates;
    }
  } catch (error) {
    logger.warn('networth:currency-rates:fetch-failed', {
      league: safeLeague,
      realm: safeRealm,
      error: buildErrorMessage(error),
    });
  }

  if (staleCached) {
    return staleCached;
  }

  return { ...DEFAULT_CURRENCY_RATES };
}

async function enrichScanWithCurrencyRates(apiClient, logger, state, scan, fallbackLeague = null, fallbackRealm = DEFAULT_REALM) {
  const source = asObject(scan);
  if (!source) return scan;
  const league = sanitizeLeague(source.league) || sanitizeLeague(fallbackLeague);
  if (!league) {
    source.currencyRates = normalizeCurrencyRates(source.currencyRates);
    applyCurrencyExchangePricingToScan(source);
    return source;
  }
  const realm = sanitizeRealm(source.realm || fallbackRealm);
  const rates = await fetchCurrencyRatesForLeague(apiClient, logger, state, league, realm);
  source.currencyRates = rates;
  applyCurrencyExchangePricingToScan(source);
  return source;
}

function toStringArray(value) {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') return safeString(entry);
      const obj = asObject(entry);
      if (!obj) return '';
      return safeString(obj.text || obj.name || obj.value || '');
    })
    .filter(Boolean);
}

function inferAffixTypeFromTier(tierText) {
  const tier = safeString(tierText).toUpperCase();
  if (tier.startsWith('P')) return 'prefix';
  if (tier.startsWith('S')) return 'suffix';
  return '';
}

function getExtendedModByIndex(modsByType, index) {
  if (!modsByType) return null;
  if (Array.isArray(modsByType)) {
    return asObject(modsByType[index]) || null;
  }
  if (typeof modsByType === 'object' && modsByType !== null) {
    return asObject(modsByType[index]) || asObject(modsByType[String(index)]) || null;
  }
  return null;
}

function getHashEntryMeta(hashesList, index) {
  if (!Array.isArray(hashesList) || !Array.isArray(hashesList[index])) {
    return {
      statHash: null,
      modIndices: [index],
    };
  }

  const entry = hashesList[index];
  const statHash = safeString(entry[0]) || null;
  const rawIndices = Array.isArray(entry[1]) ? entry[1] : [];
  const modIndices = rawIndices
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return {
    statHash,
    modIndices: modIndices.length > 0 ? modIndices : [index],
  };
}

function buildDetailedModEntry(text, type, hashesList, extendedModsByType, index) {
  const safeText = safeString(text);
  if (!safeText) return null;

  const tiers = [];
  const ranges = [];
  const affixTypes = [];
  const affixNames = [];
  const { statHash, modIndices } = getHashEntryMeta(hashesList, index);

  for (const modIndex of modIndices) {
    const modObj = getExtendedModByIndex(extendedModsByType, modIndex);
    if (!modObj) continue;

    const tier = safeString(modObj.tier);
    if (tier) {
      tiers.push(tier);
      const affixType = inferAffixTypeFromTier(tier);
      if (affixType) affixTypes.push(affixType);
    }

    const affixName = safeString(modObj.name);
    if (affixName) affixNames.push(affixName);

    for (const magnitude of asArray(modObj.magnitudes)) {
      const magnitudeObj = asObject(magnitude);
      if (!magnitudeObj) continue;
      const min = parseOptionalFloat(magnitudeObj.min);
      const max = parseOptionalFloat(magnitudeObj.max);
      if (min === null || max === null) continue;
      const hash = safeString(magnitudeObj.hash);
      if (statHash && hash && hash !== statHash) continue;
      ranges.push(`[${min}-${max}]`);
    }
  }

  return {
    text: safeText,
    type,
    tier: tiers.join(' + '),
    range: ranges.join(' + '),
    affix: affixTypes[0] || '',
    affixName: affixNames.join(' + '),
  };
}

function collectModsDetailed(item) {
  const source = asObject(item) || {};
  const extended = asObject(source.extended) || {};
  const extendedMods = asObject(extended.mods) || {};
  const hashes = asObject(extended.hashes) || {};
  const output = [];

  const pushPlainMods = (mods, type) => {
    for (const modText of toStringArray(mods)) {
      output.push({
        text: modText,
        type,
        tier: '',
        range: '',
        affix: '',
        affixName: '',
      });
    }
  };

  const pushDetailedMods = (mods, type, hashKey, modKey) => {
    const list = toStringArray(mods);
    const hashesList = Array.isArray(hashes[hashKey]) ? hashes[hashKey] : null;
    const modsByType = extendedMods[modKey];
    list.forEach((modText, index) => {
      const detailed = buildDetailedModEntry(modText, type, hashesList, modsByType, index);
      if (detailed) {
        output.push(detailed);
      }
    });
  };

  pushPlainMods(source.implicitMods || source.implicit_mods, 'implicit');
  pushDetailedMods(source.explicitMods || source.explicit_mods, 'explicit', 'explicit', 'explicit');
  pushPlainMods(source.enchantMods || source.enchant_mods || source.enchantedMods || source.enchanted_mods, 'enchant');
  pushDetailedMods(source.fracturedMods || source.fractured_mods, 'fractured', 'fractured', 'fractured');
  pushDetailedMods(source.craftedMods || source.crafted_mods, 'crafted', 'crafted', 'crafted');

  return output;
}

function extractQuality(item) {
  const direct = parseOptionalFloat(item.quality);
  if (direct !== null) return direct;

  const properties = asArray(item.properties);
  for (const property of properties) {
    const name = safeString(property?.name).toLowerCase();
    if (name !== 'quality') continue;
    const firstValue = property?.values?.[0]?.[0];
    const match = String(firstValue || '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    return parseOptionalFloat(match[0]);
  }

  return null;
}

function normalizeItem(rawItem, source, fallbackIndex) {
  const item = asObject(rawItem) || {};
  const name = safeString(item.name || item.fullName || item.full_name || '');
  const typeLine = safeString(item.typeLine || item.type_line || item.baseType || item.base_type || '');
  const baseType = safeString(item.baseType || item.base_type || typeLine);
  const stackSizeCandidate = Number.parseInt(String(item.stackSize ?? item.stack_size ?? item.stack ?? 1), 10);
  const stackSize = Number.isFinite(stackSizeCandidate) && stackSizeCandidate > 0 ? stackSizeCandidate : 1;
  const x = Number.isFinite(item.x) ? Number(item.x) : null;
  const y = Number.isFinite(item.y) ? Number(item.y) : null;
  const w = Number.isFinite(item.w) ? Number(item.w) : null;
  const h = Number.isFinite(item.h) ? Number(item.h) : null;
  const ilvl = parseOptionalInteger(item.ilvl ?? item.itemLevel ?? item.item_level);
  const frameType = parseOptionalInteger(item.frameType ?? item.frame_type);
  const quality = extractQuality(item);
  const sockets = asArray(item.sockets);

  return {
    id: safeString(item.id || item.itemId || '') || `${source.scope}-${fallbackIndex}`,
    source: source.scope,
    realm: source.realm,
    league: source.league,
    characterName: source.characterName || null,
    tabIndex: Number.isFinite(source.tabIndex) ? source.tabIndex : null,
    tabName: source.tabName || null,
    inventoryId: safeString(item.inventoryId || item.inventory_id || source.inventoryId || ''),
    name: name || typeLine || 'Unknown Item',
    typeLine: typeLine || 'Unknown Type',
    baseType: baseType || typeLine || 'Unknown Type',
    category: safeString(item.category || item.itemClass || item.item_class || ''),
    stackSize,
    icon: safeString(item.icon || ''),
    note: safeString(item.note || ''),
    frameType,
    ilvl,
    quality,
    identified: typeof item.identified === 'boolean' ? item.identified : null,
    corrupted: typeof item.corrupted === 'boolean' ? item.corrupted : null,
    fractured: typeof item.fractured === 'boolean' ? item.fractured : null,
    mirrored: typeof item.mirrored === 'boolean' ? item.mirrored : null,
    split: typeof item.split === 'boolean' ? item.split : null,
    sockets,
    socketedItems: asArray(item.socketedItems || item.socketed_items),
    properties: asArray(item.properties),
    requirements: asArray(item.requirements),
    implicitMods: toStringArray(item.implicitMods || item.implicit_mods),
    explicitMods: toStringArray(item.explicitMods || item.explicit_mods),
    craftedMods: toStringArray(item.craftedMods || item.crafted_mods),
    fracturedMods: toStringArray(item.fracturedMods || item.fractured_mods),
    enchantMods: toStringArray(item.enchantMods || item.enchant_mods || item.enchantedMods || item.enchanted_mods),
    veiledMods: toStringArray(item.veiledMods || item.veiled_mods),
    utilityMods: toStringArray(item.utilityMods || item.utility_mods),
    influencedMods: toStringArray(item.influencedMods || item.influenced_mods),
    modsDetailed: collectModsDetailed(item),
    shaper: Boolean(item.shaper),
    elder: Boolean(item.elder),
    crusader: Boolean(item.crusader),
    redeemer: Boolean(item.redeemer),
    hunter: Boolean(item.hunter),
    warlord: Boolean(item.warlord),
    position: { x, y, w, h },
  };
}

const POE_TEXT_MARKUP_REGEX = /<<[^>]+>>/g;

function normalizePoeText(value) {
  return safeString(value)
    .replace(POE_TEXT_MARKUP_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholderItemType(value) {
  const text = normalizePoeText(value).toLowerCase();
  return !text || text === 'unknown' || text === 'unknown item' || text === 'unknown type' || text === '-';
}

function normalizeItemForPricing(rawItem) {
  const source = asObject(rawItem) || {};
  const frameType = parseOptionalInteger(source.frameType ?? source.frame_type);
  const cleanedName = normalizePoeText(
    source.name ||
    source.typeLine ||
    source.type_line ||
    source.baseType ||
    source.base_type ||
    ''
  );
  const rawTypeLine = normalizePoeText(source.typeLine || source.type_line || '');
  const rawBaseType = normalizePoeText(source.baseType || source.base_type || '');

  let typeLine = isPlaceholderItemType(rawTypeLine) ? '' : rawTypeLine;
  let baseType = isPlaceholderItemType(rawBaseType) ? '' : rawBaseType;

  if (!baseType && typeLine) baseType = typeLine;
  if (!typeLine && baseType) typeLine = baseType;

  // Magic items often include affixes in typeLine; baseType is the trade-safe lookup key.
  if (frameType === 1 && baseType) {
    typeLine = baseType;
  }

  if (!typeLine && !baseType && !isPlaceholderItemType(cleanedName)) {
    typeLine = cleanedName;
    baseType = cleanedName;
  }

  return {
    ...source,
    name: cleanedName || safeString(source.name || source.typeLine || source.baseType || '') || 'Unknown Item',
    typeLine,
    type_line: typeLine,
    baseType,
    base_type: baseType,
  };
}

function hasValidPricingItemType(item) {
  const source = asObject(item) || {};
  const typeLine = normalizePoeText(source.typeLine || source.type_line || '');
  const baseType = normalizePoeText(source.baseType || source.base_type || '');
  return !isPlaceholderItemType(typeLine) || !isPlaceholderItemType(baseType);
}

async function callPoeCandidates(apiClient, endpointCandidates, label, logger) {
  const failures = [];

  for (const endpoint of endpointCandidates) {
    try {
      const response = await apiClient.callPoeApi(endpoint, { method: 'GET' });
      const data = asObject(response) && Object.prototype.hasOwnProperty.call(response, 'data')
        ? response.data
        : response;
      return {
        endpoint,
        data,
      };
    } catch (error) {
      if (isRateLimitError(error)) {
        const rateLimitMessage = buildErrorMessage(error);
        logger.warn('networth:poe-endpoint-rate-limited', { label, endpoint, error: rateLimitMessage });
        const rateLimitError = new Error(rateLimitMessage);
        rateLimitError.status = Number(error?.status) || 429;
        if (Number.isFinite(Number(error?.retryAfterMs))) {
          rateLimitError.retryAfterMs = Number(error.retryAfterMs);
        }
        if (Number.isFinite(Number(error?.retryAfterAt))) {
          rateLimitError.retryAfterAt = Number(error.retryAfterAt);
        }
        throw rateLimitError;
      }
      failures.push({ endpoint, error: buildErrorMessage(error) });
    }
  }

  logger.warn('networth:poe-endpoint-failed', {
    label,
    failures,
  });

  const details = failures.map((entry) => `${entry.endpoint} -> ${entry.error}`).join(' | ');
  throw new Error(`Unable to fetch ${label} from Path of Exile API: ${details}`);
}

function hasExplicitStashItemsArray(payload) {
  const root = asObject(payload) || {};
  const nested = asObject(root.stash) || {};
  const result = asObject(root.result) || {};
  const data = asObject(root.data) || {};

  if (Array.isArray(root.items)) return true;
  if (Array.isArray(nested.items)) return true;
  if (Array.isArray(result.items)) return true;
  if (Array.isArray(data.items)) return true;

  const tabGroups = [
    asArray(root.tabs),
    asArray(root.stashes),
    asArray(nested.tabs),
    asArray(nested.stashes),
    asArray(data.tabs),
  ];

  const hasGroupedItems = tabGroups.some((group) =>
    group.some((entry) => {
      const obj = asObject(entry) || {};
      return Array.isArray(obj.items);
    })
  );
  return hasGroupedItems;
}

function hasStashItemPayload(payload) {
  if (hasExplicitStashItemsArray(payload)) return true;

  const candidates = [];
  collectItemCandidates(payload, candidates);
  return dedupeItems(candidates).length > 0;
}

function isMetadataOnlyEmptyMapStashPayload(payload, tabMeta = null) {
  const tabType = safeString(tabMeta?.type || '');
  if (tabType !== 'MapStash') return false;

  const root = asObject(payload) || {};
  const stash = asObject(root.stash) || {};
  const metadata = asObject(stash.metadata) || {};
  const mapMeta = asObject(metadata.map) || {};

  const hasNoItems =
    asArray(root.items).length === 0 &&
    asArray(stash.items).length === 0;
  const hasNoChildren =
    asArray(root.children).length === 0 &&
    asArray(stash.children).length === 0 &&
    asArray(root.tabs).length === 0 &&
    asArray(root.stashes).length === 0 &&
    asArray(stash.tabs).length === 0 &&
    asArray(stash.stashes).length === 0;
  const looksLikeMapRoot =
    safeString(stash.type || tabType) === 'MapStash' &&
    (Object.keys(mapMeta).length > 0 || safeString(stash.name || tabMeta?.name) !== '');

  return hasNoItems && hasNoChildren && looksLikeMapRoot;
}

function summarizePayloadShape(payload) {
  const root = asObject(payload) || {};
  const stash = asObject(root.stash) || {};
  const stashMetadata = asObject(stash.metadata) || {};
  const result = asObject(root.result) || {};
  const data = asObject(root.data) || {};
  const candidates = [];
  collectItemCandidates(payload, candidates);
  const dedupedCandidates = dedupeItems(candidates);

  const summarizeObjectKeys = (obj) => Object.keys(asObject(obj) || {}).slice(0, 20);
  const summarizeArrayField = (obj, key) => {
    const list = asArray(asObject(obj)?.[key]);
    if (list.length === 0) return null;
    const first = asObject(list[0]);
    return {
      length: list.length,
      firstKeys: first ? Object.keys(first).slice(0, 12) : [],
    };
  };
  const summarizeMetadataPreview = (obj) => {
    const source = asObject(obj) || {};
    const preview = {};
    for (const [key, value] of Object.entries(source).slice(0, 20)) {
      if (Array.isArray(value)) {
        preview[key] = {
          kind: 'array',
          length: value.length,
          firstKeys: asObject(value[0]) ? Object.keys(value[0]).slice(0, 10) : [],
        };
      } else if (asObject(value)) {
        preview[key] = {
          kind: 'object',
          keys: Object.keys(value).slice(0, 10),
        };
      } else {
        preview[key] = {
          kind: typeof value,
        };
      }
    }
    return preview;
  };

  return {
    topLevelKeys: summarizeObjectKeys(root),
    stashKeys: summarizeObjectKeys(stash),
    stashMetadataKeys: summarizeObjectKeys(stashMetadata),
    stashMetadataPreview: summarizeMetadataPreview(stashMetadata),
    resultKeys: summarizeObjectKeys(result),
    dataKeys: summarizeObjectKeys(data),
    explicitItems: {
      root: asArray(root.items).length,
      stash: asArray(stash.items).length,
      result: asArray(result.items).length,
      data: asArray(data.items).length,
    },
    tabArrays: {
      tabs: summarizeArrayField(root, 'tabs'),
      stashes: summarizeArrayField(root, 'stashes'),
      stashTabs: summarizeArrayField(root, 'stashTabs'),
      stashTabsNested: summarizeArrayField(stash, 'tabs'),
      stashStashesNested: summarizeArrayField(stash, 'stashes'),
      resultTabs: summarizeArrayField(result, 'tabs'),
      resultStashes: summarizeArrayField(result, 'stashes'),
      dataTabs: summarizeArrayField(data, 'tabs'),
      dataStashes: summarizeArrayField(data, 'stashes'),
    },
    parserSignals: {
      hasExplicitItemsArray: hasExplicitStashItemsArray(payload),
      hasItemPayload: dedupedCandidates.length > 0,
      itemCandidateCount: candidates.length,
      dedupedItemCandidateCount: dedupedCandidates.length,
      hasOverviewPayload: hasStashOverviewPayload(payload),
    },
  };
}

function extractSubstashCandidatesFromPayload(payload, parentTabMeta = null) {
  const root = asObject(payload) || {};
  const rootStash = asObject(root.stash) || root;
  const rootParentId = safeString(
    parentTabMeta?.stashId ||
    parentTabMeta?.id ||
    rootStash.id ||
    ''
  );
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (entry, fallbackIndex, inheritedParentId) => {
    const normalized = normalizeTab(entry, fallbackIndex, inheritedParentId);
    const stashId = safeString(normalized.stashId || normalized.id || '');
    if (!stashId || stashId === rootParentId) return null;
    const dedupeKey = `${stashId}:${normalized.parentId || inheritedParentId || ''}:${normalized.index}`;
    if (seen.has(dedupeKey)) return normalized;
    seen.add(dedupeKey);
    candidates.push(normalized);
    return normalized;
  };

  const visit = (input, inheritedParentId = rootParentId, depth = 0) => {
    if (depth > 5) return;
    const obj = asObject(input);
    if (!obj) return;

    const groups = [
      asArray(obj.children),
      asArray(obj.tabs),
      asArray(obj.stashes),
      asArray(obj.subtabs),
      asArray(obj.subStashes),
      asArray(obj.substashes),
    ];

    for (const group of groups) {
      group.forEach((entry, index) => {
        const normalized = pushCandidate(entry, index, inheritedParentId);
        const nextParentId = safeString(normalized?.stashId || normalized?.id || inheritedParentId);
        visit(entry, nextParentId, depth + 1);
      });
    }

    const metadata = asObject(obj.metadata);
    if (metadata) {
      visit(metadata, inheritedParentId, depth + 1);
    }
  };

  visit(rootStash, rootParentId, 0);
  return candidates;
}

async function fetchNestedSpecialTabPayload(apiClient, league, realm, payload, tabMeta, logger, visited = new Set(), depth = 0) {
  if (depth > 5) return null;

  const childTabs = extractSubstashCandidatesFromPayload(payload, tabMeta);
  if (childTabs.length === 0) {
    return null;
  }

  const nestedPayloads = [];

  for (const childTab of childTabs) {
    const childStashId = safeString(childTab?.stashId || childTab?.id || '');
    if (!childStashId) continue;

    const childParentId = safeString(childTab?.parentId || tabMeta?.stashId || tabMeta?.id || '');
    const visitKey = `${childParentId}:${childStashId}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    const endpoints = buildStashItemEndpointCandidates({
      league,
      realm,
      stashId: childStashId,
      parentId: childParentId,
    });

    for (const endpoint of endpoints) {
      try {
        const childData = await callPoeEndpoint(apiClient, endpoint, { suppressErrorLog: true });
        if (hasStashItemPayload(childData)) {
          nestedPayloads.push(childData);
          break;
        }

        const nestedChildPayload = await fetchNestedSpecialTabPayload(
          apiClient,
          league,
          realm,
          childData,
          childTab,
          logger,
          visited,
          depth + 1
        );
        if (nestedChildPayload) {
          nestedPayloads.push(nestedChildPayload);
          break;
        }
      } catch (error) {
        if (isRateLimitError(error) || isUnauthorizedError(error)) {
          throw error;
        }
        logger.warn('networth:stash-items-fetch:nested-child-failed', {
          league,
          realm,
          parentTabIndex: Number.parseInt(String(tabMeta?.index), 10),
          childTabIndex: Number.parseInt(String(childTab?.index), 10),
          childTabName: safeString(childTab?.name || ''),
          childTabType: safeString(childTab?.type || ''),
          endpoint,
          error: buildErrorMessage(error),
        });
      }
    }
  }

  if (nestedPayloads.length === 0) {
    return null;
  }

  return {
    stash: asObject(payload?.stash) || asObject(payload) || {},
    specialChildPayloads: nestedPayloads,
  };
}

function hasStashOverviewPayload(payload) {
  const root = asObject(payload) || {};
  const nested = asObject(root.stash) || {};
  if (asArray(root.stashes).length > 0) return true;
  if (asArray(root.tabs).length > 0) return true;
  if (asArray(nested.stashes).length > 0) return true;
  if (asArray(nested.tabs).length > 0) return true;

  const numericCandidates = [
    root.numTabs,
    root.totalTabs,
    root.num_tabs,
    root.total_tabs,
    nested.numTabs,
    nested.totalTabs,
    nested.num_tabs,
    nested.total_tabs,
  ];
  return numericCandidates.some((value) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0;
  });
}

function buildOfficialStashEndpoint(league, realm, ...segments) {
  const encodedLeague = encodeURIComponent(league);
  const prefix = realm && realm !== DEFAULT_REALM ? `/${encodeURIComponent(realm)}` : '';
  const suffix = segments
    .filter((segment) => safeString(segment))
    .map((segment) => `/${encodeURIComponent(segment)}`)
    .join('');
  return `/stash${prefix}/${encodedLeague}${suffix}`;
}

function buildStashOverviewEndpointCandidates({ league, realm }) {
  return [buildOfficialStashEndpoint(league, realm)];
}

function buildStashItemEndpointCandidates({ league, realm, stashId, parentId }) {
  const id = safeString(stashId);
  const parent = safeString(parentId);
  const candidates = [];

  if (id) {
    if (parent) {
      candidates.push(buildOfficialStashEndpoint(league, realm, parent, id));
    }
    candidates.push(buildOfficialStashEndpoint(league, realm, id));
  }

  return Array.from(new Set(candidates));
}

function buildLegacyTabIndexStashEndpointCandidates({ league, tabIndex }) {
  const parsedTabIndex = Number.parseInt(String(tabIndex), 10);
  const safeTabIndex = Number.isFinite(parsedTabIndex) && parsedTabIndex >= 0 ? parsedTabIndex : 0;
  const encodedLeague = encodeURIComponent(league);
  return [
    `/stash/${encodedLeague}?tabs=0&tabIndex=${safeTabIndex}`,
    `/stash/${encodedLeague}?tabs=1&tabIndex=${safeTabIndex}`,
  ];
}

function buildStashEndpointTemplates({ league, realm, mode = 'items' }) {
  if (mode === 'tabs') {
    return [() => buildOfficialStashEndpoint(league, realm)];
  }
  return [];
}

async function callPoeEndpoint(apiClient, endpoint, options = {}) {
  const response = await apiClient.callPoeApi(endpoint, {
    method: 'GET',
    suppressErrorLog: options.suppressErrorLog === true,
  });
  if (asObject(response) && Object.prototype.hasOwnProperty.call(response, 'data')) {
    return response.data;
  }
  return response;
}

async function probeStashEndpointTemplate(apiClient, logger, league, realm, tabIndex, mode = 'items') {
  const templates = buildStashEndpointTemplates({ league, realm, mode });
  const failures = [];
  if (templates.length === 0) {
    throw new Error(`No stash endpoint templates available for ${mode}`);
  }
  for (const template of templates) {
    const endpoint = template(tabIndex);
    try {
      const data = await callPoeEndpoint(apiClient, endpoint, { suppressErrorLog: true });
      if (mode === 'items' && !hasStashItemPayload(data)) {
        continue;
      }
      return { template, data, endpoint };
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      if (isUnauthorizedError(error)) {
        throw error;
      }
      failures.push({ endpoint, error: buildErrorMessage(error) });
      if (!isNotFoundError(error)) {
        logger.warn('networth:stash-template-probe:error', {
          league,
          realm,
          endpoint,
          error: buildErrorMessage(error),
        });
      }
    }
  }

  const details = failures.length > 0
    ? failures.map((entry) => `${entry.endpoint} -> ${entry.error}`).join(' | ')
    : 'No candidate endpoint returned an item payload';
  throw new Error(`Unable to resolve stash endpoint for ${league}/${realm}: ${details}`);
}

async function fetchStashOverview(apiClient, league, realm, logger, state) {
  const cacheKey = `${realm}:${league.toLowerCase()}`;
  const cachedEndpoint = state.stashOverviewEndpointByKey.get(cacheKey) || null;
  const candidates = buildStashOverviewEndpointCandidates({ league, realm });
  const failures = [];
  let fallbackWithoutOverview = null;

  if (cachedEndpoint) {
    try {
      const data = await callPoeEndpoint(apiClient, cachedEndpoint, { suppressErrorLog: true });
      if (hasStashOverviewPayload(data)) {
        return data;
      }
      fallbackWithoutOverview = { endpoint: cachedEndpoint, data };
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      if (isUnauthorizedError(error)) {
        throw error;
      }
      failures.push({ endpoint: cachedEndpoint, error: buildErrorMessage(error) });
      state.stashOverviewEndpointByKey.delete(cacheKey);
    }
  }

  for (const endpoint of candidates) {
    if (endpoint === cachedEndpoint) continue;
    try {
      const data = await callPoeEndpoint(apiClient, endpoint, { suppressErrorLog: true });
      if (hasStashOverviewPayload(data)) {
        state.stashOverviewEndpointByKey.set(cacheKey, endpoint);
        return data;
      }
      if (!fallbackWithoutOverview) {
        fallbackWithoutOverview = { endpoint, data };
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      if (isUnauthorizedError(error)) {
        throw error;
      }
      failures.push({ endpoint, error: buildErrorMessage(error) });
    }
  }

  if (fallbackWithoutOverview) {
    logger.warn('networth:stash-overview:metadata-fallback', {
      league,
      realm,
      endpoint: fallbackWithoutOverview.endpoint,
    });
    state.stashOverviewEndpointByKey.set(cacheKey, fallbackWithoutOverview.endpoint);
    return fallbackWithoutOverview.data;
  }

  logger.warn('networth:stash-overview:failed', {
    league,
    realm,
    failures,
  });
  const details = failures.map((entry) => `${entry.endpoint} -> ${entry.error}`).join(' | ');
  throw new Error(`Unable to fetch stash overview for ${league}/${realm}: ${details}`);
}

async function fetchStashItemsForTab(apiClient, league, realm, tabMeta, tabIndex, logger, state) {
  const stashId = safeString(tabMeta?.stashId || tabMeta?.id || '');
  const parentId = safeString(tabMeta?.parentId || '');
  const label = `stash tab ${Number.parseInt(String(tabIndex), 10)}`;
  const failures = [];
  const logNoPayloadResponse = (endpoint, data) => {
    logger.warn('networth:stash-items-fetch:no-payload-shape', {
      league,
      realm,
      tabIndex,
      tabName: safeString(tabMeta?.name || ''),
      tabType: safeString(tabMeta?.type || ''),
      stashId: stashId || null,
      parentId: parentId || null,
      endpoint,
      responseShape: summarizePayloadShape(data),
    });
  };

  if (stashId) {
    const primaryCandidates = buildStashItemEndpointCandidates({
      league,
      realm,
      stashId,
      parentId,
    });

    for (const endpoint of primaryCandidates) {
      try {
        const data = await callPoeEndpoint(apiClient, endpoint, { suppressErrorLog: true });
        if (hasStashItemPayload(data)) {
          return data;
        }
        if (isMetadataOnlyEmptyMapStashPayload(data, tabMeta)) {
          logger.info('networth:stash-items-fetch:empty-special-tab', {
            league,
            realm,
            tabIndex,
            tabName: safeString(tabMeta?.name || ''),
            tabType: safeString(tabMeta?.type || ''),
            endpoint,
          });
          return {
            stash: asObject(data?.stash) || {},
            items: [],
          };
        }
        const nestedPayload = await fetchNestedSpecialTabPayload(
          apiClient,
          league,
          realm,
          data,
          { ...tabMeta, stashId, parentId, index: tabIndex },
          logger
        );
        if (nestedPayload) {
          logger.info('networth:stash-items-fetch:special-tab-resolved', {
            league,
            realm,
            tabIndex,
            tabName: safeString(tabMeta?.name || ''),
            tabType: safeString(tabMeta?.type || ''),
            endpoint,
            childPayloads: asArray(nestedPayload.specialChildPayloads).length,
          });
          return nestedPayload;
        }
        logNoPayloadResponse(endpoint, data);
        failures.push({ endpoint, error: 'No item payload in response' });
      } catch (error) {
        if (isRateLimitError(error)) {
          throw error;
        }
        if (isUnauthorizedError(error)) {
          throw error;
        }
        failures.push({ endpoint, error: buildErrorMessage(error) });
      }
    }
  }

  const fallbackCandidates = buildLegacyTabIndexStashEndpointCandidates({
    league,
    tabIndex,
  });

  for (const endpoint of fallbackCandidates) {
    try {
      const data = await callPoeEndpoint(apiClient, endpoint, { suppressErrorLog: true });
      if (hasStashItemPayload(data)) {
        return data;
      }
      logNoPayloadResponse(endpoint, data);
      failures.push({ endpoint, error: 'No item payload in response' });
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      if (isUnauthorizedError(error)) {
        throw error;
      }
      failures.push({ endpoint, error: buildErrorMessage(error) });
    }
  }

  logger.warn('networth:stash-items-fetch:failed', { label, league, realm, failures });
  const details = failures.map((entry) => `${entry.endpoint} -> ${entry.error}`).join(' | ');
  throw new Error(`Unable to fetch stash items for tab ${tabIndex}: ${details}`);
}

async function fetchStashTab(apiClient, league, realm, tabIndex, logger, state, mode = 'items') {
  const cacheKey = `${mode}:${realm}:${league.toLowerCase()}`;
  let template = state.stashEndpointTemplateByKey.get(cacheKey) || null;

  if (template) {
    try {
      const endpoint = template(tabIndex);
      const data = await callPoeEndpoint(apiClient, endpoint, { suppressErrorLog: true });
      if (mode === 'items' && !hasStashItemPayload(data)) {
        throw new Error('Stash endpoint returned metadata without item payload');
      }
      return data;
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }
      state.stashEndpointTemplateByKey.delete(cacheKey);
      logger.warn('networth:stash-template-invalidated', {
        league,
        realm,
        tabIndex,
        error: buildErrorMessage(error),
      });
      template = null;
    }
  }

  const resolved = await probeStashEndpointTemplate(apiClient, logger, league, realm, tabIndex, mode);
  state.stashEndpointTemplateByKey.set(cacheKey, resolved.template);
  return resolved.data;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildRateLimitedScanMessage(completedTabs, totalTabs, pendingTabs) {
  return `Scan paused by Path of Exile rate limits after ${completedTabs}/${totalTabs} tabs (${pendingTabs} remaining). Try again in about a minute.`;
}

function buildBatchScanMessage(completedTabs, totalTabs, pendingTabs) {
  return `Scan split into batches (${completedTabs}/${totalTabs} tabs done, ${pendingTabs} remaining).`;
}

function toRetryTimestamp(delayMs) {
  return Date.now() + Math.max(0, Number(delayMs) || 0);
}

function parseMaxTabsPerScan(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_TABS_PER_SCAN;
  return Math.max(1, Math.min(parsed, MAX_TABS_PER_SCAN));
}

function parseRetryAt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildPendingTabIndices(scanTabIndices, currentIndex, deferredTabIndices) {
  const pending = [
    ...scanTabIndices.slice(Math.max(0, currentIndex)),
    ...asArray(deferredTabIndices),
  ];
  return parseTabIndices(pending);
}

function ensureScanTabIndices(requestedTabIndices, tabSummary) {
  const fallbackTabIndices =
    tabSummary.tabs.length > 0
      ? tabSummary.tabs.map((tab) => tab.index)
      : Array.from({ length: Math.max(0, tabSummary.numTabs) }, (_value, index) => index);

  return (requestedTabIndices.length > 0 ? requestedTabIndices : fallbackTabIndices)
    .filter((index) => index >= 0 && index < Math.max(tabSummary.numTabs, tabSummary.tabs.length));
}

function buildScanFromCollections({
  now,
  realm,
  league,
  characterName,
  tabSummary,
  requestedTabIndices,
  scannedTabIndices,
  pendingTabIndices,
  failedTabIndices,
  stashItems,
  inventoryItems,
  partialReason,
  retryAt,
  partialMessage,
}) {
  const combinedItems = [...stashItems, ...inventoryItems];
  const normalizedRequestedTabIndices = parseTabIndices(requestedTabIndices);
  const normalizedScannedTabIndices = parseTabIndices(scannedTabIndices);
  const normalizedPendingTabIndices = parseTabIndices(pendingTabIndices);
  const normalizedFailedTabIndices = parseTabIndices(failedTabIndices);
  const normalizedRetryAt = parseRetryAt(retryAt);
  const isPartial = Boolean(partialMessage) || normalizedPendingTabIndices.length > 0;
  return {
    id: `scan-${now}`,
    timestamp: toDateIso(now),
    scannedAt: now,
    source: 'server-oauth',
    realm,
    league,
    characterName: characterName || null,
    stash: {
      numTabs: tabSummary.numTabs,
      requestedTabIndices: normalizedRequestedTabIndices,
      scannedTabIndices: normalizedScannedTabIndices,
      scannedTabCount: normalizedScannedTabIndices.length,
      pendingTabIndices: normalizedPendingTabIndices,
      failedTabIndices: normalizedFailedTabIndices,
      tabs: tabSummary.tabs,
      itemCount: stashItems.length,
      items: stashItems,
    },
    inventory: {
      itemCount: inventoryItems.length,
      items: inventoryItems,
    },
    items: combinedItems,
    summary: {
      stashItems: stashItems.length,
      inventoryItems: inventoryItems.length,
      totalItems: combinedItems.length,
      tabsRequested: normalizedRequestedTabIndices.length,
      tabsScanned: normalizedScannedTabIndices.length,
      tabsPending: normalizedPendingTabIndices.length,
    },
    netWorth: null,
    converted: null,
    pricing: {
      status: 'pending-server',
      message: WEBSITE_FEATURE_MESSAGE,
    },
    partial: isPartial,
    partialMessage: partialMessage || null,
    partialReason: isPartial ? (safeString(partialReason) || (normalizedPendingTabIndices.length > 0 ? 'partial' : 'warning')) : null,
    pendingTabIndices: normalizedPendingTabIndices,
    failedTabIndices: normalizedFailedTabIndices,
    retryAt: normalizedRetryAt,
  };
}

function collectTabItems(stashPayload, tabSummary, tabIndex, realm, league) {
  const tabMeta = tabSummary.tabs.find((tab) => tab.index === tabIndex) || normalizeTab({ i: tabIndex }, tabIndex);
  return summarizeStashItems(stashPayload, {
    scope: 'stash',
    realm,
    league,
    characterName: null,
    tabIndex,
    tabName: tabMeta.name,
    inventoryId: null,
  });
}

function buildInventoryItems(rawInventoryItems, realm, league, characterName) {
  return rawInventoryItems.map((item, index) =>
    normalizeItem(item, {
      scope: 'inventory',
      realm,
      league,
      characterName,
      tabIndex: null,
      tabName: null,
      inventoryId: item?.inventoryId || item?.inventory_id || null,
    }, index)
  );
}

function updateCachedTabsState(state, league, realm, tabSummary, timestamp, rateLimited = false, retryAt = null) {
  const normalizedRetryAt = parseRetryAt(retryAt);
  state.cachedStashTabs = {
    league,
    realm,
    numTabs: tabSummary.numTabs,
    tabs: tabSummary.tabs,
    rateLimited,
    retryAt: rateLimited ? (normalizedRetryAt || toRetryTimestamp(STASH_SCAN_RETRY_MS)) : null,
    timestamp,
  };
}

function pushScanToState(state, scan) {
  state.lastScan = scan;
  state.scanHistory = [scan, ...state.scanHistory].slice(0, NETWORTH_SCAN_HISTORY_LIMIT);
}

function hydrateScanIntoState(state, scan) {
  const source = asObject(scan);
  if (!source) return;
  const scanId = safeString(source.id || '');
  const scannedAt = Number.parseInt(String(source.scannedAt ?? source.timestamp ?? 0), 10);
  state.lastScan = source;
  state.scanHistory = [
    source,
    ...state.scanHistory.filter((entry) => {
      const existing = asObject(entry) || {};
      const existingId = safeString(existing.id || '');
      if (scanId && existingId && existingId === scanId) return false;
      const existingTs = Number.parseInt(String(existing.scannedAt ?? existing.timestamp ?? 0), 10);
      if (Number.isFinite(scannedAt) && scannedAt > 0 && existingTs === scannedAt) return false;
      return true;
    }),
  ].slice(0, NETWORTH_SCAN_HISTORY_LIMIT);

  const league = sanitizeLeague(source.league);
  if (!league) return;
  const realm = sanitizeRealm(source.realm);
  const stash = asObject(source.stash) || {};
  const tabs = asArray(stash.tabs).map((tab, index) => normalizeTab(tab, index));
  const numTabs = Number.isFinite(Number(stash.numTabs))
    ? Number(stash.numTabs)
    : tabs.length;
  const sourceRetryAt = parseRetryAt(source.retryAt);
  const sourcePartialReason = safeString(source.partialReason);
  state.cachedStashTabs = {
    league,
    realm,
    numTabs,
    tabs,
    rateLimited: source.partial === true && sourcePartialReason === 'rate_limit',
    retryAt: source.partial === true
      ? (sourceRetryAt || (sourcePartialReason === 'rate_limit' ? toRetryTimestamp(STASH_SCAN_RETRY_MS) : null))
      : null,
    timestamp: Number(source.scannedAt || source.timestamp || Date.now()),
  };
}

function isScanMatchForScope(scan, league, realm) {
  const source = asObject(scan);
  if (!source) return false;
  const sourceLeague = sanitizeLeague(source.league);
  const sourceRealm = sanitizeRealm(source.realm);
  if (!sourceLeague || !league) return false;
  return sourceLeague === league && sourceRealm === realm;
}

function findLatestScanForScope(state, league, realm) {
  const safeLeague = sanitizeLeague(league);
  const safeRealm = sanitizeRealm(realm);
  if (!safeLeague) return null;

  if (isScanMatchForScope(state.lastScan, safeLeague, safeRealm)) {
    return state.lastScan;
  }

  for (const entry of asArray(state.scanHistory)) {
    if (isScanMatchForScope(entry, safeLeague, safeRealm)) {
      return entry;
    }
  }

  return null;
}

function toStashScanFailure(error) {
  return {
    success: false,
    error: buildErrorMessage(error),
    scan: null,
    comparison: null,
  };
}

function toPartialStashScanSuccess(scan, errorMessage) {
  return {
    success: true,
    error: errorMessage || null,
    scan,
    comparison: null,
  };
}

function toFullStashScanSuccess(scan) {
  return {
    success: true,
    error: null,
    scan,
    comparison: null,
  };
}

function resolveTabSummaryFromPayload(tabPayload) {
  const summary = summarizeStashTabs(tabPayload);
  if (summary.tabs.length === 0 && summary.numTabs > 0) {
    summary.tabs = Array.from({ length: summary.numTabs }, (_value, index) => normalizeTab({ i: index }, index));
  }
  return summary;
}

function mapInventoryFromDetail(detail, realm, league, characterName) {
  const rawInventoryItems = extractInventoryItems(detail);
  return buildInventoryItems(rawInventoryItems, realm, league, characterName);
}

function ensureLeagueSelected(league) {
  if (!league) {
    throw new Error('league is required');
  }
}

function toScanCharacterName(payloadCharacterName, settings, characters, league) {
  return resolveCharacterName(payloadCharacterName, settings, characters, league);
}

function toScanTabIndices(payloadTabIndices, tabSummary) {
  const requestedTabIndices = parseTabIndices(payloadTabIndices);
  return ensureScanTabIndices(requestedTabIndices, tabSummary);
}

function shouldIncludeInventory(payload) {
  return payload?.includeInventory !== false;
}

function updateRateLimitCacheState(state, delayMs = STASH_SCAN_RETRY_MS) {
  const retryDelayMs = clampRateLimitDelayMs(delayMs, STASH_SCAN_RETRY_MS);
  state.cachedStashTabs = {
    ...state.cachedStashTabs,
    rateLimited: true,
    retryAt: toRetryTimestamp(retryDelayMs),
  };
  markRateLimited(state, 'scan', retryDelayMs);
}

function toChannelsCount() {
  return [
    'networth:getPreferences',
    'networth:getPricingConfig',
    'networth:setPreferences',
    'networth:enqueueUnpricedItems',
    'networth:getLeagues',
    'networth:getCharacters',
    'networth:getStashTabs',
    'networth:scanStashesSnapshot',
    'networth:scanStashes',
    'networth:getLastScan',
    'networth:getScanHistory',
    'networth:getCachedStashTabs',
    'networth:getLastLeague',
    'networth:setLastLeague',
  ];
}

function summarizeStashTabs(payload) {
  const tabs = extractTabsFromPayload(payload);
  const numTabs = extractNumTabs(payload, tabs);

  if (tabs.length === 0 && numTabs > 0) {
    for (let index = 0; index < numTabs; index += 1) {
      tabs.push(normalizeTab({ i: index, n: `Tab ${index + 1}` }, index));
    }
  }

  return {
    numTabs,
    tabs,
  };
}

function summarizeStashItems(payload, sourceBase) {
  const rawItems = [];
  const hasExplicitItemsArray = hasExplicitStashItemsArray(payload);

  collectItemCandidates(payload?.items, rawItems);
  collectItemCandidates(payload?.stash?.items, rawItems);
  collectItemCandidates(payload?.data?.items, rawItems);
  collectItemCandidates(payload?.result?.items, rawItems);

  for (const tab of asArray(payload?.tabs)) {
    collectItemCandidates(tab?.items, rawItems);
  }

  for (const stash of asArray(payload?.stashes)) {
    collectItemCandidates(stash?.items, rawItems);
  }

  if (rawItems.length === 0 && !hasExplicitItemsArray) {
    // Last-resort recursive walk for undocumented payload wrappers.
    collectItemCandidates(payload, rawItems);
  }

  const deduped = dedupeItems(rawItems);
  return deduped.map((item, index) => normalizeItem(item, sourceBase, index));
}

function normalizeTabIndex(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function dedupeNormalizedItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const source = asObject(item) || {};
    const id = safeString(source.id || source.itemId || '');
    const tabIndex = normalizeTabIndex(source.tabIndex);
    const key = id || [
      safeString(source.name || ''),
      safeString(source.typeLine || ''),
      Number.isFinite(tabIndex) ? tabIndex : '',
      Number.isFinite(source?.position?.x) ? source.position.x : '',
      Number.isFinite(source?.position?.y) ? source.position.y : '',
      safeString(source.inventoryId || ''),
    ].join('|');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(source);
  }
  return output;
}

function mergeStashItemsWithPreviousScan(previousScan, stashItems, scannedTabIndices, league, realm) {
  if (!previousScan) {
    return stashItems;
  }

  const scannedSet = new Set(asArray(scannedTabIndices).map((index) => normalizeTabIndex(index)).filter((index) => index !== null));
  const previousItems = asArray(previousScan?.stash?.items).filter((item) => {
    const source = asObject(item) || {};
    const sourceLeague = safeString(source.league || previousScan?.league || '');
    const sourceRealm = safeString(source.realm || previousScan?.realm || '');
    if (sourceLeague && league && sourceLeague !== league) return false;
    if (sourceRealm && realm && sourceRealm !== realm) return false;
    const tabIndex = normalizeTabIndex(source.tabIndex);
    return tabIndex !== null && !scannedSet.has(tabIndex);
  });

  return dedupeNormalizedItems([...stashItems, ...previousItems]);
}

function mergeInventoryItemsWithPreviousScan(previousScan, inventoryItems, characterName) {
  if (inventoryItems.length > 0 || !previousScan) {
    return inventoryItems;
  }

  const fallback = asArray(previousScan?.inventory?.items);
  if (!characterName) {
    return fallback;
  }

  const normalizedCharacterName = characterName.toLowerCase();
  return fallback.filter((item) => safeString(item?.characterName || '').toLowerCase() === normalizedCharacterName);
}

function toPricingItemKey(item) {
  const source = asObject(item) || {};
  const id = safeString(source.id || source.itemId || source.item_id || '');
  if (id) return id;

  const tabIndex = normalizeTabIndex(source.tabIndex ?? source._tabIndex);
  const stackSize = Number.parseInt(String(source.stackSize ?? source.stack_size ?? 1), 10);
  const x = Number.isFinite(source?.position?.x) ? source.position.x : source.x;
  const y = Number.isFinite(source?.position?.y) ? source.position.y : source.y;

  return [
    safeString(source.league || ''),
    safeString(source.characterName || source.character || ''),
    safeString(source.baseType || source.typeLine || source.type_line || source.name || 'unknown'),
    Number.isFinite(tabIndex) ? tabIndex : safeString(source.inventoryId || source.inventory_id || ''),
    Number.isFinite(x) ? x : '',
    Number.isFinite(y) ? y : '',
    Number.isFinite(stackSize) ? stackSize : '',
  ].join('|');
}

function buildPricingQueueEntry(item, league) {
  const source = asObject(item) || {};
  const itemKey = toPricingItemKey(source);
  const now = Date.now();
  return {
    itemKey,
    league: sanitizeLeague(league),
    name: safeString(source.name || source.typeLine || source.baseType || '') || 'Unknown Item',
    item: source,
    status: 'queued',
    hasPrice: false,
    pricing: null,
    pricingChaos: null,
    pricingDivine: null,
    lastError: null,
    retryAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizePricingFailureStateMap(source) {
  const input = asObject(source) || {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const itemKey = safeString(rawKey);
    const entry = asObject(rawValue) || {};
    if (!itemKey) continue;
    const consecutiveFailures = Number.parseInt(String(entry.consecutiveFailures ?? 0), 10);
    const lastFailedAt = Number(entry.lastFailedAt);
    const nextEntry = {
      consecutiveFailures: Number.isFinite(consecutiveFailures) && consecutiveFailures > 0 ? consecutiveFailures : 0,
      lastFailedAt: Number.isFinite(lastFailedAt) && lastFailedAt > 0 ? lastFailedAt : 0,
      lastError: safeString(entry.lastError || ''),
    };
    if (nextEntry.consecutiveFailures <= 0) continue;
    output[itemKey] = nextEntry;
  }
  return output;
}

function hasPositiveNetworthValue(item) {
  const source = asObject(item) || {};
  const networth = asObject(source._networth) || {};
  const value = Number(networth.value);
  return Number.isFinite(value) && value > 0;
}

function buildScanQueueEntry(payload = {}) {
  const source = asObject(payload) || {};
  const now = Date.now();
  const id = safeString(source.id) || `scanq-${now}-${Math.random().toString(36).slice(2, 10)}`;
  const tabIndices = parseTabIndices(source.tabIndices);
  const tabNames = asArray(source.tabNames)
    .map((name) => safeString(name))
    .filter(Boolean);
  const status = safeString(source.status || 'queued') || 'queued';
  const queuedItems = Number.parseInt(String(source.queuedItems ?? source.itemCount ?? 0), 10);

  return {
    id,
    type: safeString(source.type || 'tabs'),
    name: safeString(source.name || ''),
    league: sanitizeLeague(source.league),
    status,
    tabIndices,
    tabNames,
    queuedItems: Number.isFinite(queuedItems) && queuedItems >= 0 ? queuedItems : 0,
    hasPrice: false,
    lastError: safeString(source.lastError || ''),
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : now,
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : now,
  };
}

function parsePricingResult(response) {
  const root = asObject(response) || {};
  const candidate =
    asObject(root.pricing) && !Object.prototype.hasOwnProperty.call(root, 'estimated')
      ? asObject(root.pricing)
      : root;
  const pricing = asObject(candidate) || {};
  const chaos = parseOptionalFloat(pricing.chaos);
  const divine = parseOptionalFloat(pricing.divine);
  return {
    ...pricing,
    chaos: chaos !== null ? chaos : 0,
    divine: divine !== null ? divine : 0,
    serverPricingAvailable: true,
  };
}

function applyPricingToScanItem(item, itemKey, pricing) {
  const source = asObject(item);
  if (!source) return false;
  if (toPricingItemKey(source) !== itemKey) return false;
  const chaos = parseOptionalFloat(pricing?.chaos);
  source._pricing = pricing;
  if (chaos !== null && chaos >= 0) {
    source._networth = {
      value: chaos,
      currency: 'chaos',
      source: safeString(pricing?.source || 'server_trade') || 'server_trade',
    };
  }
  return true;
}

function applyPricingToScan(scan, itemKey, pricing) {
  const source = asObject(scan);
  if (!source) return false;
  let updated = false;
  const collections = [
    asArray(source.items),
    asArray(source?.stash?.items),
    asArray(source?.inventory?.items),
  ];
  for (const collection of collections) {
    for (const item of collection) {
      if (applyPricingToScanItem(item, itemKey, pricing)) {
        updated = true;
      }
    }
  }
  return updated;
}

function applyPricingToState(state, itemKey, pricing) {
  let updated = false;
  if (applyPricingToScan(state.lastScan, itemKey, pricing)) {
    updated = true;
  }
  for (const scan of asArray(state.scanHistory)) {
    if (scan === state.lastScan) continue;
    if (applyPricingToScan(scan, itemKey, pricing)) {
      updated = true;
    }
  }
  return updated;
}

async function fetchCharacters(apiClient, realm) {
  const response = await apiClient.getPoeCharacters({ realm });
  const rows = Array.isArray(response)
    ? response
    : (Array.isArray(response?.characters) ? response.characters : []);

  return rows
    .map((row) => ({
      name: safeString(row?.name || ''),
      className: safeString(row?.class || row?.className || row?.class_name || ''),
      league: safeString(row?.league || ''),
      level: Number.isFinite(row?.level) ? Number(row.level) : null,
      realm: safeString(row?.realm || row?.realmName || realm || DEFAULT_REALM) || realm || DEFAULT_REALM,
    }))
    .filter((row) => row.name);
}

function normalizeCharacterCacheEntry(entry, realm) {
  const source = asObject(entry) || {};
  return {
    realm,
    characters: Array.isArray(source.characters) ? source.characters : [],
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : 0,
    rateLimitedUntil: Number.isFinite(source.rateLimitedUntil) ? Number(source.rateLimitedUntil) : 0,
  };
}

function getCharacterCacheEntry(state, realm) {
  return normalizeCharacterCacheEntry(state.characterCacheByRealm.get(realm), realm);
}

function setCharacterCacheEntry(state, realm, entry) {
  state.characterCacheByRealm.set(realm, normalizeCharacterCacheEntry(entry, realm));
}

async function fetchCharactersWithCache(apiClient, realm, logger, state, options = {}) {
  const {
    allowEmptyOnRateLimit = false,
    preferCache = false,
    maxCacheAgeMs = 30000,
  } = options;

  const now = Date.now();
  const cached = getCharacterCacheEntry(state, realm);
  const hasCached = cached.characters.length > 0;
  const cacheIsFresh = hasCached && (now - cached.updatedAt) < Math.max(0, maxCacheAgeMs);
  const rateLimited = cached.rateLimitedUntil > now;

  if (preferCache && hasCached) {
    return cached.characters;
  }

  if (cacheIsFresh) {
    return cached.characters;
  }

  if (rateLimited) {
    if (hasCached) {
      return cached.characters;
    }
    if (allowEmptyOnRateLimit) {
      return [];
    }
  }

  try {
    const characters = await fetchCharacters(apiClient, realm);
    setCharacterCacheEntry(state, realm, {
      realm,
      characters,
      updatedAt: Date.now(),
      rateLimitedUntil: 0,
    });
    return characters;
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
    const retryAt = markRateLimited(state, 'scan', retryDelayMs);
    logger.warn('networth:characters:rate-limited', {
      realm,
      retryAt,
      retryDelayMs,
      hasCached,
    });

    setCharacterCacheEntry(state, realm, {
      realm,
      characters: cached.characters,
      updatedAt: cached.updatedAt || Date.now(),
      rateLimitedUntil: retryAt,
    });

    if (hasCached) {
      return cached.characters;
    }
    if (allowEmptyOnRateLimit) {
      return [];
    }
    throw error;
  }
}

function resolveCharacterName(payloadCharacterName, settings, characters, league) {
  const explicit = sanitizeCharacterName(payloadCharacterName);
  if (explicit) return explicit;

  const preferred = sanitizeCharacterName(settings?.activeCharacterName);
  if (preferred) {
    const matched = characters.find((row) => row.name.toLowerCase() === preferred.toLowerCase());
    if (matched && (!league || !matched.league || matched.league === league)) {
      return matched.name;
    }
  }

  const filtered = league
    ? characters.filter((row) => row.league === league)
    : characters;
  if (filtered.length === 0) return null;

  const sorted = [...filtered].sort((a, b) => {
    const aLevel = Number.isFinite(a.level) ? a.level : -1;
    const bLevel = Number.isFinite(b.level) ? b.level : -1;
    return bLevel - aLevel;
  });

  return sorted[0]?.name || null;
}

async function fetchCharacterDetail(apiClient, characterName, realm, logger) {
  const prefix = realmPrefix(realm);
  const encodedName = encodeURIComponent(characterName);
  const candidates = [`/character${prefix}/${encodedName}`];

  try {
    const direct = await callPoeCandidates(apiClient, candidates, `character detail for ${characterName}`, logger);
    return direct.data;
  } catch (directError) {
    if (typeof apiClient.getLiveBuildSnapshot === 'function') {
      const fallback = await apiClient.getLiveBuildSnapshot({ characterName, realm });
      return asObject(fallback) && fallback.detail ? fallback.detail : fallback;
    }
    throw directError;
  }
}

function extractInventoryItems(detail) {
  const inventoryCandidates = [];
  collectItemCandidates(detail?.inventory, inventoryCandidates);
  collectItemCandidates(detail?.character?.inventory, inventoryCandidates);

  if (inventoryCandidates.length === 0) {
    collectItemCandidates(detail?.items, inventoryCandidates);
    collectItemCandidates(detail?.character?.items, inventoryCandidates);
  }

  return dedupeItems(inventoryCandidates);
}

function toDateIso(ts) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function saveScanSnapshotRemote(apiClient, logger, scan) {
  if (!apiClient || typeof apiClient.saveNetworthStateSnapshot !== 'function') return false;
  const snapshot = asObject(scan);
  if (!snapshot) return false;
  const league = sanitizeLeague(snapshot.league);
  if (!league) return false;
  const realm = sanitizeRealm(snapshot.realm);
  try {
    await apiClient.saveNetworthStateSnapshot({
      league,
      realm,
      scan: snapshot,
    });
    return true;
  } catch (error) {
    logger.warn('networth:state:save-remote-failed', {
      league,
      realm,
      error: buildErrorMessage(error),
    });
    return false;
  }
}

async function loadLatestScanRemote(apiClient, logger, league, realm) {
  if (!apiClient || typeof apiClient.getNetworthStateLatest !== 'function') return null;
  const safeLeague = sanitizeLeague(league);
  if (!safeLeague) return null;
  const safeRealm = sanitizeRealm(realm);
  try {
    const response = await apiClient.getNetworthStateLatest({
      league: safeLeague,
      realm: safeRealm,
    });
    return asObject(response?.scan) || null;
  } catch (error) {
    logger.warn('networth:state:latest-remote-failed', {
      league: safeLeague,
      realm: safeRealm,
      error: buildErrorMessage(error),
    });
    return null;
  }
}

async function loadScanHistoryRemote(apiClient, logger, league, realm, limit = NETWORTH_SCAN_HISTORY_LIMIT) {
  if (!apiClient || typeof apiClient.getNetworthStateHistory !== 'function') return [];
  const safeLeague = sanitizeLeague(league);
  if (!safeLeague) return [];
  const safeRealm = sanitizeRealm(realm);
  try {
    const response = await apiClient.getNetworthStateHistory({
      league: safeLeague,
      realm: safeRealm,
      limit,
    });
    const scans = asArray(response?.scans).map((entry) => asObject(entry)).filter(Boolean);
    return scans;
  } catch (error) {
    logger.warn('networth:state:history-remote-failed', {
      league: safeLeague,
      realm: safeRealm,
      error: buildErrorMessage(error),
    });
    return [];
  }
}

function registerUnavailableHandlers(ipcMain) {
  const defaults = {
    'networth:startRun': { success: false, error: WEBSITE_FEATURE_MESSAGE },
    'networth:stopRun': { success: false, error: WEBSITE_FEATURE_MESSAGE },
    'networth:getRuns': [],
    'networth:getActiveRun': null,
    'networth:priceItem': { success: false, error: WEBSITE_FEATURE_MESSAGE },
    'networth:getPricingQueue': [],
    'networth:pausePricingQueue': false,
    'networth:resumePricingQueue': false,
    'networth:getTaskQueue': { pricing: [], scan: [], pricingPaused: false },
    'networth:removePricingQueueItem': false,
    'networth:clearPricingQueue': false,
    'networth:enqueuePricingItems': { queued: 0, error: WEBSITE_FEATURE_MESSAGE },
    'networth:saveManualPricing': { success: false, error: WEBSITE_FEATURE_MESSAGE },
    'networth:enqueueUnpricedItems': { queued: 0, error: WEBSITE_FEATURE_MESSAGE },
    'networth:enqueueScanTask': null,
    'networth:getScanQueue': [],
    'networth:removeScanQueueItem': false,
    'networth:clearScanQueue': false,
    'networth:savePricingOverride': false,
    'networth:getPricingOverride': null,
    'networth:getPricingConfig': null,
    'networth:setPreferences': {
      autoSyncOnOpen: false,
      serverPricingEnabled: false,
      pricingListingMode: DEFAULT_PRICING_LISTING_MODE,
      autoQueueUnpriced: AUTO_QUEUE_UNPRICED_DEFAULT,
    },
  };

  for (const [channel, value] of Object.entries(defaults)) {
    try {
      ipcMain.removeHandler(channel);
    } catch {}
    ipcMain.handle(channel, async () => value);
  }
}

function registerNetworthIpcHandlers({
  ipcMain,
  logger,
  getApiClient,
  getSettings,
  saveSettings,
  enableDevWebsiteFeatures = false,
}) {
  const state = {
    lastScan: null,
    scanHistory: [],
    scanHistoryClearedAt: 0,
    currencyRatesByScope: {},
    pricingQueue: [],
    scanQueue: [],
    pricingQueueRunning: false,
    pricingQueuePaused: false,
    stashEndpointTemplateByKey: new Map(),
    stashOverviewEndpointByKey: new Map(),
    characterCacheByRealm: new Map(),
    cachedStashTabs: {
      league: null,
      realm: DEFAULT_REALM,
      numTabs: 0,
      tabs: [],
      rateLimited: false,
      retryAt: null,
      timestamp: null,
    },
    pricingConfig: null,
    pricingConfigFetchedAt: 0,
    rateLimits: normalizeRateLimitState(),
    pricingFailureStateByItemKey: {},
    latestScanDirty: false,
    latestScanPersistedAt: 0,
  };

  const getApiClientOrThrow = () => {
    const client = getApiClient();
    if (!client) {
      throw new Error('API client not initialized');
    }
    return client;
  };

  const saveLastLeague = (league) => {
    const safeLeague = resolveNetworthLeague(league);
    const settings = getSettings();
    if (!settings || typeof settings !== 'object') return;
    settings.netWorthLastLeague = safeLeague;
    saveSettings(settings);
  };

  const loadPersistedState = () => {
    const settings = getSettings();
    if (!settings || typeof settings !== 'object') return;

    if (asObject(settings.netWorthLastScan)) {
      state.lastScan = settings.netWorthLastScan;
    }

    if (Array.isArray(settings.netWorthScanHistory)) {
      state.scanHistory = settings.netWorthScanHistory.slice(0, NETWORTH_SCAN_HISTORY_LIMIT);
    }

    const clearedAt = Number(settings.netWorthScanHistoryClearedAt || 0);
    state.scanHistoryClearedAt = Number.isFinite(clearedAt) && clearedAt > 0 ? clearedAt : 0;

    if (asObject(settings.netWorthCurrencyRatesByScope)) {
      state.currencyRatesByScope = { ...settings.netWorthCurrencyRatesByScope };
    }

    if (asObject(settings.netWorthCachedStashTabs)) {
      state.cachedStashTabs = {
        ...state.cachedStashTabs,
        ...settings.netWorthCachedStashTabs,
      };
    }

    state.rateLimits = normalizeRateLimitState(settings.netWorthRateLimits);
    const cachedScanRetryAt = parseRetryAt(state.cachedStashTabs?.retryAt);
    if (state.cachedStashTabs?.rateLimited === true && cachedScanRetryAt && cachedScanRetryAt > Date.now()) {
      const nextRateLimits = normalizeRateLimitState(state.rateLimits);
      nextRateLimits.globalUntil = Math.max(nextRateLimits.globalUntil, cachedScanRetryAt);
      nextRateLimits.scanUntil = Math.max(nextRateLimits.scanUntil, cachedScanRetryAt);
      state.rateLimits = nextRateLimits;
    }

    const persistedPricingConfig = normalizePricingConfigPayload(settings.netWorthPricingConfig);
    if (persistedPricingConfig) {
      state.pricingConfig = persistedPricingConfig;
      const fetchedAt = Number(settings.netWorthPricingConfigFetchedAt);
      state.pricingConfigFetchedAt = Number.isFinite(fetchedAt) && fetchedAt > 0 ? fetchedAt : Date.now();
    }

    if (Array.isArray(settings.netWorthPricingQueue)) {
      state.pricingQueue = settings.netWorthPricingQueue
        .map((entry) => {
          const source = asObject(entry);
          if (!source) return null;
          const status = safeString(source.status);
          return {
            ...source,
            status: status === 'processing' ? 'queued' : (status || 'queued'),
          };
        })
        .filter(Boolean)
        .slice(0, PRICING_QUEUE_LIMIT);
    }

    state.pricingQueuePaused = settings.netWorthPricingQueuePaused === true;

    if (Array.isArray(settings.netWorthScanQueue)) {
      state.scanQueue = settings.netWorthScanQueue
        .map((entry) => {
          const source = asObject(entry);
          if (!source) return null;
          const normalized = buildScanQueueEntry(source);
          if (normalized.status === 'processing') {
            normalized.status = 'queued';
          }
          return normalized;
        })
        .filter(Boolean);
    }

    state.pricingFailureStateByItemKey = normalizePricingFailureStateMap(settings.netWorthPricingFailureStateByItemKey);

    hydrateScanCurrencyRatesFromCache(state, state.lastScan);
    for (const scan of asArray(state.scanHistory)) {
      if (scan === state.lastScan) continue;
      hydrateScanCurrencyRatesFromCache(state, scan);
    }
  };

  const persistState = () => {
    const settings = getSettings();
    if (!settings || typeof settings !== 'object') return;

    settings.netWorthLastScan = state.lastScan;
    settings.netWorthScanHistory = state.scanHistory.slice(0, NETWORTH_SCAN_HISTORY_LIMIT);
    settings.netWorthScanHistoryClearedAt = state.scanHistoryClearedAt;
    settings.netWorthCurrencyRatesByScope = state.currencyRatesByScope;
    settings.netWorthCachedStashTabs = state.cachedStashTabs;
    settings.netWorthPricingConfig = state.pricingConfig;
    settings.netWorthPricingConfigFetchedAt = state.pricingConfigFetchedAt;
    settings.netWorthPricingQueue = state.pricingQueue.slice(0, PRICING_QUEUE_LIMIT);
    settings.netWorthPricingQueuePaused = state.pricingQueuePaused === true;
    settings.netWorthScanQueue = state.scanQueue;
    settings.netWorthRateLimits = normalizeRateLimitState(state.rateLimits);
    settings.netWorthPricingFailureStateByItemKey = normalizePricingFailureStateMap(state.pricingFailureStateByItemKey);
    saveSettings(settings);
  };

  const isScanVisibleInHistory = (scan) => {
    const timestamp = Number(asObject(scan)?.scannedAt || asObject(scan)?.timestamp || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
    return !(state.scanHistoryClearedAt > 0 && timestamp <= state.scanHistoryClearedAt);
  };

  const getLastLeague = () => {
    return NETWORTH_ACTIVE_LEAGUE;
  };

  const getPreferences = () => {
    const settings = getSettings();
    return {
      autoSyncOnOpen: settings?.netWorthAutoSyncOnOpen === true,
      serverPricingEnabled: enableDevWebsiteFeatures === true,
      pricingListingMode: normalizePricingListingMode(settings?.netWorthPricingListingMode),
      autoQueueUnpriced: settings?.netWorthAutoQueueUnpriced === true,
      hideLargeTabScanWarning: settings?.netWorthHideLargeTabScanWarning === true,
    };
  };

  const setPreferences = (payload = {}) => {
    const settings = getSettings();
    if (!settings || typeof settings !== 'object') {
      return getPreferences();
    }

    const source = asObject(payload) || {};
    if (typeof source.autoQueueUnpriced === 'boolean') {
      settings.netWorthAutoQueueUnpriced = source.autoQueueUnpriced;
    }
    if (typeof source.hideLargeTabScanWarning === 'boolean') {
      settings.netWorthHideLargeTabScanWarning = source.hideLargeTabScanWarning;
    }
    saveSettings(settings);
    return getPreferences();
  };

  const getPricingConfig = async () => {
    const cached = normalizePricingConfigPayload(state.pricingConfig);
    const now = Date.now();
    if (cached && now - Number(state.pricingConfigFetchedAt || 0) < PRICING_CONFIG_CACHE_MS) {
      return cached;
    }

    if (!enableDevWebsiteFeatures) {
      return cached;
    }

    const apiClient = getApiClient();
    if (!apiClient || typeof apiClient.getNetworthPricingConfig !== 'function') {
      return cached;
    }

    try {
      const payload = await apiClient.getNetworthPricingConfig();
      const normalized = normalizePricingConfigPayload(payload);
      if (normalized) {
        state.pricingConfig = normalized;
        state.pricingConfigFetchedAt = now;
        persistState();
        return normalized;
      }
    } catch (error) {
      logger.warn('networth:pricing-config:fetch-failed', {
        error: buildErrorMessage(error),
      });
    }

    return cached;
  };

  const persistLatestScanRemote = async () => {
    if (!asObject(state.lastScan)) return false;
    const apiClient = getApiClient();
    const saved = await saveScanSnapshotRemote(apiClient, logger, state.lastScan);
    if (saved) {
      state.latestScanDirty = false;
      state.latestScanPersistedAt = Date.now();
    }
    return saved;
  };

  const markLatestScanDirty = () => {
    state.latestScanDirty = true;
    if (!Number.isFinite(Number(state.latestScanPersistedAt)) || Number(state.latestScanPersistedAt) <= 0) {
      state.latestScanPersistedAt = Date.now();
    }
  };

  const flushLatestScanRemoteIfDue = async ({ force = false } = {}) => {
    if (state.latestScanDirty !== true) return false;
    if (!force) {
      const elapsedMs = Date.now() - Number(state.latestScanPersistedAt || 0);
      if (elapsedMs < PRICING_QUEUE_REMOTE_PERSIST_INTERVAL_MS) {
        return false;
      }
    }
    return persistLatestScanRemote();
  };

  const waitForPricingQueue = async (delayMs) => {
    const remainingTotalMs = Math.max(0, Number(delayMs) || 0);
    if (remainingTotalMs <= 0) return true;
    const stepMs = 250;
    let remainingMs = remainingTotalMs;
    while (remainingMs > 0) {
      if (state.pricingQueuePaused === true) {
        return false;
      }
      const nextStepMs = Math.min(stepMs, remainingMs);
      await wait(nextStepMs);
      remainingMs -= nextStepMs;
    }
    return state.pricingQueuePaused !== true;
  };

  const prunePricingQueue = () => {
    if (state.pricingQueue.length <= PRICING_QUEUE_LIMIT) return;
    state.pricingQueue = state.pricingQueue
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, PRICING_QUEUE_LIMIT);
  };

  const pruneScanQueue = () => {
    if (state.scanQueue.length <= SCAN_QUEUE_LIMIT) return;
    state.scanQueue = state.scanQueue
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, SCAN_QUEUE_LIMIT);
  };

  const upsertScanQueueEntry = (payload = {}, { persist = true } = {}) => {
    const source = asObject(payload) || {};
    const id = safeString(source.id);
    const type = safeString(source.type || '');
    const league = sanitizeLeague(source.league);
    const firstTabIndex = parseTabIndices(source.tabIndices)[0] ?? null;
    const now = Date.now();

    if (type === 'tab_scan' && league && firstTabIndex !== null) {
      state.scanQueue = state.scanQueue.filter((entry) => {
        if (safeString(entry?.type || '') !== 'tab_scan') return true;
        if (sanitizeLeague(entry?.league) !== league) return true;
        const entryTabIndex = parseTabIndices(entry?.tabIndices)[0] ?? null;
        if (entryTabIndex !== firstTabIndex) return true;
        return safeString(entry?.id) === id;
      });
    }

    const existingIndex = id
      ? state.scanQueue.findIndex((entry) => safeString(entry.id) === id)
      : -1;

    if (existingIndex >= 0) {
      const existing = buildScanQueueEntry(state.scanQueue[existingIndex]);
      const merged = buildScanQueueEntry({
        ...existing,
        ...source,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
      state.scanQueue.splice(existingIndex, 1, merged);
      pruneScanQueue();
      if (persist) persistState();
      return merged;
    }

    const entry = buildScanQueueEntry({
      ...source,
      createdAt: now,
      updatedAt: now,
    });
    state.scanQueue.unshift(entry);
    pruneScanQueue();
    if (persist) persistState();
    return entry;
  };

  const clearPricingFailureState = (itemKey) => {
    const safeItemKey = safeString(itemKey);
    if (!safeItemKey) return;
    if (Object.prototype.hasOwnProperty.call(state.pricingFailureStateByItemKey, safeItemKey)) {
      delete state.pricingFailureStateByItemKey[safeItemKey];
    }
  };

  const recordPricingFailureState = (itemKey, errorMessage) => {
    const safeItemKey = safeString(itemKey);
    if (!safeItemKey) return;
    const existing = asObject(state.pricingFailureStateByItemKey[safeItemKey]) || {};
    const previousCount = Number.parseInt(String(existing.consecutiveFailures ?? 0), 10);
    const nextCount = Number.isFinite(previousCount) && previousCount > 0 ? previousCount + 1 : 1;
    state.pricingFailureStateByItemKey[safeItemKey] = {
      consecutiveFailures: nextCount,
      lastFailedAt: Date.now(),
      lastError: safeString(errorMessage || ''),
    };
  };

  const canQueueByFailureBudget = (
    itemKey,
    maxFailures = AUTO_QUEUE_UNPRICED_MAX_FAILURES,
    cooldownMs = AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS
  ) => {
    const safeItemKey = safeString(itemKey);
    if (!safeItemKey) return false;
    const entry = asObject(state.pricingFailureStateByItemKey[safeItemKey]);
    if (!entry) return true;

    const failures = Number.parseInt(String(entry.consecutiveFailures ?? 0), 10);
    if (!Number.isFinite(failures) || failures < Math.max(1, Number(maxFailures) || AUTO_QUEUE_UNPRICED_MAX_FAILURES)) {
      return true;
    }

    const lastFailedAt = Number(entry.lastFailedAt);
    const retryWindowMs = Math.max(60 * 1000, Number(cooldownMs) || AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS);
    if (Number.isFinite(lastFailedAt) && lastFailedAt > 0 && (Date.now() - lastFailedAt) >= retryWindowMs) {
      delete state.pricingFailureStateByItemKey[safeItemKey];
      return true;
    }
    return false;
  };

  const enqueuePricingItemsInternal = (
    items,
    league,
    options = {}
  ) => {
    const safeLeague = resolveNetworthLeague(league);
    if (!safeLeague) {
      return { queued: 0, error: 'league is required' };
    }

    const source = asObject(options) || {};
    const onlyUnpriced = source.onlyUnpriced === true;
    const respectFailureBudget = source.respectFailureBudget === true;
    const maxFailures = Number.parseInt(String(source.maxFailures ?? AUTO_QUEUE_UNPRICED_MAX_FAILURES), 10);
    const retryCooldownMs = Number(source.retryCooldownMs ?? AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS);

    let queued = 0;
    let skippedAlreadyQueued = 0;
    let skippedAlreadyPriced = 0;
    let skippedRetryBudget = 0;

    for (const rawItem of asArray(items)) {
      const item = normalizeItemForPricing(asObject(rawItem) || {});
      if (isExchangePricedCandidate(item)) {
        skippedAlreadyPriced += 1;
        continue;
      }
      if (!hasValidPricingItemType(item)) {
        continue;
      }
      if (onlyUnpriced && hasPositiveNetworthValue(item)) {
        skippedAlreadyPriced += 1;
        continue;
      }

      const itemKey = toPricingItemKey(item);
      if (!itemKey) continue;

      if (respectFailureBudget && !canQueueByFailureBudget(itemKey, maxFailures, retryCooldownMs)) {
        skippedRetryBudget += 1;
        continue;
      }

      const existing = state.pricingQueue.find((entry) => entry.itemKey === itemKey);
      if (existing && (existing.status === 'queued' || existing.status === 'processing')) {
        skippedAlreadyQueued += 1;
        continue;
      }
      if (onlyUnpriced && existing?.status === 'done' && existing?.hasPrice === true) {
        skippedAlreadyPriced += 1;
        continue;
      }

      if (existing) {
        existing.status = 'queued';
        existing.updatedAt = Date.now();
        existing.lastError = null;
        existing.item = item;
        existing.league = safeLeague;
      } else {
        state.pricingQueue.unshift(buildPricingQueueEntry(item, safeLeague));
      }
      queued += 1;
    }

    prunePricingQueue();
    persistState();
    if (queued > 0) {
      processPricingQueue().catch((error) => {
        logger.warn('networth:pricing-queue:process-failed', { error: buildErrorMessage(error) });
      });
    }

    return {
      queued,
      skippedAlreadyQueued,
      skippedAlreadyPriced,
      skippedRetryBudget,
    };
  };

  const upsertQueueEntryFromPricing = (item, league, pricing, errorMessage = null) => {
    const itemKey = toPricingItemKey(item);
    const now = Date.now();
    const existingIndex = state.pricingQueue.findIndex((entry) => entry.itemKey === itemKey);
    const chaos = parseOptionalFloat(pricing?.chaos);
    const divine = parseOptionalFloat(pricing?.divine);
    const nextEntry = {
      ...(existingIndex >= 0 ? state.pricingQueue[existingIndex] : buildPricingQueueEntry(item, league)),
      item,
      league: sanitizeLeague(league),
      status: errorMessage ? 'failed' : 'done',
      hasPrice: !errorMessage && pricing?.estimated === true,
      pricing: errorMessage ? null : pricing,
      pricingChaos: !errorMessage && chaos !== null ? chaos : null,
      pricingDivine: !errorMessage && divine !== null ? divine : null,
      lastError: errorMessage,
      retryAt: null,
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      state.pricingQueue.splice(existingIndex, 1, nextEntry);
    } else {
      state.pricingQueue.unshift(nextEntry);
    }
    prunePricingQueue();
  };

  const processPricingQueue = async () => {
    if (state.pricingQueueRunning) return;
    state.pricingQueueRunning = true;
    try {
      while (true) {
        if (state.pricingQueuePaused === true) {
          break;
        }
        const nextEntry = state.pricingQueue.find((entry) => entry.status === 'queued');
        if (!nextEntry) break;

        const activeCooldownMs = getRateLimitDelayMs(state, 'pricing');
        if (activeCooldownMs > 0) {
          const shouldContinue = await waitForPricingQueue(activeCooldownMs);
          if (!shouldContinue) {
            break;
          }
          continue;
        }
        nextEntry.status = 'processing';
        nextEntry.updatedAt = Date.now();
        nextEntry.retryAt = null;
        persistState();

        if (enableDevWebsiteFeatures !== true) {
          nextEntry.status = 'failed';
          nextEntry.lastError = WEBSITE_FEATURE_MESSAGE;
          nextEntry.updatedAt = Date.now();
          persistState();
          continue;
        }

        try {
          const apiClient = getApiClientOrThrow();
          const pricingItem = normalizeItemForPricing(nextEntry.item);
          if (isExchangePricedCandidate(pricingItem)) {
            upsertQueueEntryFromPricing(
              nextEntry.item,
              nextEntry.league,
              null,
              'This item is valued via Currency Exchange and is excluded from trade smart pricing.'
            );
            persistState();
            continue;
          }
          if (!hasValidPricingItemType(pricingItem)) {
            throw new Error('Item has no valid base type for trade pricing. Re-sync this stash tab and try again.');
          }
          const pricingOptions = normalizePricingOptions({
            useCache: true,
            listingMode: getSettings()?.netWorthPricingListingMode,
            queueMode: true,
          });
          logger.info('networth:pricing:request', {
            mode: 'queue',
            endpoint: '/networth/price-item',
            league: nextEntry.league,
            item: {
              id: safeString(pricingItem.id || ''),
              name: safeString(pricingItem.name || ''),
              typeLine: safeString(pricingItem.typeLine || pricingItem.type_line || ''),
              baseType: safeString(pricingItem.baseType || pricingItem.base_type || ''),
              frameType: parseOptionalInteger(pricingItem.frameType ?? pricingItem.frame_type),
              ilvl: parseOptionalInteger(pricingItem.ilvl ?? pricingItem.itemLevel ?? pricingItem.item_level),
            },
            options: pricingOptions,
          });
          const response = await apiClient.priceNetworthItem({
            item: pricingItem,
            league: nextEntry.league,
            options: pricingOptions,
          });
          const parsedPricing = parsePricingResult(response);
          logger.info('networth:pricing:response', {
            mode: 'queue',
            league: nextEntry.league,
            itemKey: nextEntry.itemKey,
            estimated: parsedPricing.estimated === true,
            chaos: parseOptionalFloat(parsedPricing.chaos),
            divine: parseOptionalFloat(parsedPricing.divine),
            sampleSize: parseOptionalInteger(parsedPricing.sampleSize),
            error: safeString(parsedPricing.error || ''),
          });
          if (parsedPricing.estimated !== true) {
            throw new Error(safeString(parsedPricing.error) || 'No estimated price returned by server pricing');
          }
          upsertQueueEntryFromPricing(nextEntry.item, nextEntry.league, parsedPricing, null);
          clearPricingFailureState(nextEntry.itemKey);
          applyPricingToState(state, nextEntry.itemKey, parsedPricing);
          markLatestScanDirty();
          await flushLatestScanRemoteIfDue();
        } catch (error) {
          const message = buildErrorMessage(error);
          if (isRateLimitError(error)) {
            const delayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
            const retryAt = markRateLimited(state, 'pricing', delayMs);
            const queuedEntry = state.pricingQueue.find((entry) => entry.itemKey === nextEntry.itemKey) || nextEntry;
            queuedEntry.status = 'queued';
            queuedEntry.lastError = `Rate limited. Retry scheduled at ${new Date(retryAt).toLocaleTimeString()}.`;
            queuedEntry.retryAt = retryAt;
            queuedEntry.updatedAt = Date.now();
            logger.warn('networth:pricing:rate-limited', {
              itemKey: nextEntry.itemKey,
              league: nextEntry.league,
              retryAt,
              delayMs,
              error: message,
            });
          } else {
            recordPricingFailureState(nextEntry.itemKey, message);
            upsertQueueEntryFromPricing(nextEntry.item, nextEntry.league, null, message);
          }
        }

        persistState();
        if (state.pricingQueuePaused === true) {
          break;
        }
        const cooldownMs = getRateLimitDelayMs(state, 'pricing');
        if (cooldownMs > 0) {
          const shouldContinue = await waitForPricingQueue(cooldownMs);
          if (!shouldContinue) {
            break;
          }
          continue;
        }
        const shouldContinue = await waitForPricingQueue(PRICING_QUEUE_REQUEST_INTERVAL_MS);
        if (!shouldContinue) {
          break;
        }
      }
    } finally {
      await flushLatestScanRemoteIfDue({ force: true });
      state.pricingQueueRunning = false;
    }
  };

  loadPersistedState();

  registerUnavailableHandlers(ipcMain);

  try {
    ipcMain.removeHandler('networth:getPreferences');
  } catch {}
  ipcMain.handle('networth:getPreferences', async () => getPreferences());

  try {
    ipcMain.removeHandler('networth:setPreferences');
  } catch {}
  ipcMain.handle('networth:setPreferences', async (_event, payload = {}) => setPreferences(payload));

  try {
    ipcMain.removeHandler('networth:getPricingConfig');
  } catch {}
  ipcMain.handle('networth:getPricingConfig', async () => getPricingConfig());

  try {
    ipcMain.removeHandler('networth:getLeagues');
  } catch {}
  ipcMain.handle('networth:getLeagues', async (_event, payload = {}) => {
    const realm = sanitizeRealm(payload?.realm);
    return [{ id: NETWORTH_ACTIVE_LEAGUE, realm }];
  });

  try {
    ipcMain.removeHandler('networth:getCharacters');
  } catch {}
  ipcMain.handle('networth:getCharacters', async (_event, payload = {}) => {
    const apiClient = getApiClientOrThrow();
    const realm = sanitizeRealm(payload?.realm);
    return fetchCharactersWithCache(apiClient, realm, logger, state, {
      allowEmptyOnRateLimit: true,
    });
  });

  try {
    ipcMain.removeHandler('networth:getStashTabs');
  } catch {}
  ipcMain.handle('networth:getStashTabs', async (_event, payload) => {
    const apiClient = getApiClientOrThrow();
    const normalizedPayload = typeof payload === 'string' ? { league: payload } : (payload || {});
    const realm = sanitizeRealm(normalizedPayload.realm);
    const league = resolveNetworthLeague(normalizedPayload.league);

    ensureLeagueSelected(league);

    const tabPayload = await fetchStashOverview(apiClient, league, realm, logger, state);
    const summary = resolveTabSummaryFromPayload(tabPayload);
    const timestamp = Date.now();
    updateCachedTabsState(state, league, realm, summary, timestamp, false);

    saveLastLeague(league);
    persistState();

    return {
      league,
      realm,
      numTabs: summary.numTabs,
      tabs: summary.tabs,
      timestamp,
    };
  });

  try {
    ipcMain.removeHandler('networth:getCachedStashTabs');
  } catch {}
  ipcMain.handle('networth:getCachedStashTabs', async () => ({ ...state.cachedStashTabs }));

  try {
    ipcMain.removeHandler('networth:getLastLeague');
  } catch {}
  ipcMain.handle('networth:getLastLeague', async () => getLastLeague());

  try {
    ipcMain.removeHandler('networth:setLastLeague');
  } catch {}
  ipcMain.handle('networth:setLastLeague', async (_event, payload) => {
    const leagueValue = typeof payload === 'string' ? payload : payload?.league;
    const league = resolveNetworthLeague(leagueValue);
    saveLastLeague(league);
    persistState();
    return true;
  });

  try {
    ipcMain.removeHandler('networth:scanStashesSnapshot');
  } catch {}
  ipcMain.handle('networth:scanStashesSnapshot', async (event, payload = {}) => {
    const apiClient = getApiClientOrThrow();
    const realm = sanitizeRealm(payload?.realm);
    const league = resolveNetworthLeague(payload?.league);
    if (!league) return toStashScanFailure(new Error('league is required'));
    const scanCooldownMs = getRateLimitDelayMs(state, 'scan');
    if (scanCooldownMs > 0) {
      const retryAt = toRetryTimestamp(scanCooldownMs);
      return toStashScanFailure(
        new Error(`Scan paused by rate limits. Retry at ${new Date(retryAt).toLocaleTimeString()}.`)
      );
    }

    try {
      const includeInventory = shouldIncludeInventory(payload);
      const maxTabsPerScan = parseMaxTabsPerScan(payload?.maxTabsPerScan);
      const settings = includeInventory ? getSettings() : {};
      const shouldResolveCharacters = includeInventory;
      const characters = shouldResolveCharacters
        ? await fetchCharactersWithCache(apiClient, realm, logger, state, { allowEmptyOnRateLimit: true })
        : [];
      const characterName = includeInventory
        ? toScanCharacterName(payload?.characterName, settings, characters, league)
        : null;

      const tabPayload = await fetchStashOverview(apiClient, league, realm, logger, state);
      const tabSummary = resolveTabSummaryFromPayload(tabPayload);
      const requestedTabIndices = toScanTabIndices(payload?.tabIndices, tabSummary);
      if (requestedTabIndices.length === 0) {
        return toStashScanFailure(new Error('No stash tabs selected to scan'));
      }

      const scanTabIndices = requestedTabIndices.slice(0, maxTabsPerScan);
      const deferredTabIndices = requestedTabIndices.slice(scanTabIndices.length);
      const stashItems = [];
      const scannedTabIndices = [];
      const tabErrors = [];

      const sendSnapshotProgress = (progressPayload) => {
        try {
          event?.sender?.send('networth:scanSnapshotProgress', {
            league,
            realm,
            ...(progressPayload || {}),
          });
        } catch {}
      };

      sendSnapshotProgress({
        phase: 'started',
        totalTabs: scanTabIndices.length,
        completedTabs: 0,
      });

      for (let idx = 0; idx < scanTabIndices.length; idx += 1) {
        const tabIndex = scanTabIndices[idx];
        const tabMeta = tabSummary.tabs.find((tab) => tab.index === tabIndex) || normalizeTab({ i: tabIndex }, tabIndex);
        const tabName = safeString(tabMeta?.name || `Tab ${tabIndex + 1}`);
        try {
          sendSnapshotProgress({
            phase: 'tab_scanning',
            tabIndex,
            tabName,
            totalTabs: scanTabIndices.length,
            completedTabs: scannedTabIndices.length,
          });
          if (idx > 0) {
            await wait(300);
          }
          const stashPayload = await fetchStashItemsForTab(apiClient, league, realm, tabMeta, tabIndex, logger, state);
          const itemsForTab = collectTabItems(stashPayload, tabSummary, tabIndex, realm, league);
          stashItems.push(...itemsForTab);
          scannedTabIndices.push(tabIndex);
          sendSnapshotProgress({
            phase: 'tab_scanned',
            tabIndex,
            tabName,
            itemCount: itemsForTab.length,
            totalTabs: scanTabIndices.length,
            completedTabs: scannedTabIndices.length,
          });
        } catch (error) {
          const message = buildErrorMessage(error);
          if (isRateLimitError(error)) {
            const now = Date.now();
            const pendingTabIndices = buildPendingTabIndices(scanTabIndices, idx, deferredTabIndices);
            const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
            const retryAt = markRateLimited(state, 'scan', retryDelayMs);
            updateCachedTabsState(state, league, realm, tabSummary, now, true, retryAt);
            saveLastLeague(league);
            persistState();
            const partialMessage = buildRateLimitedScanMessage(
              scannedTabIndices.length,
              requestedTabIndices.length,
              pendingTabIndices.length
            );
            const inventoryItems = includeInventory ? [] : [];
            const scan = buildScanFromCollections({
              now,
              realm,
              league,
              characterName,
              tabSummary,
              requestedTabIndices,
              scannedTabIndices,
              pendingTabIndices,
              failedTabIndices: tabErrors.map((entry) => entry.tabIndex),
              stashItems,
              inventoryItems,
              partialReason: 'rate_limit',
              retryAt,
              partialMessage,
            });
            await enrichScanWithCurrencyRates(apiClient, logger, state, scan, league, realm);
            sendSnapshotProgress({
              phase: 'rate_limited',
              tabIndex,
              tabName,
              error: message,
              totalTabs: scanTabIndices.length,
              completedTabs: scannedTabIndices.length,
            });
            return toPartialStashScanSuccess(scan, partialMessage);
          }
          tabErrors.push({ tabIndex, error: message });
          sendSnapshotProgress({
            phase: 'tab_failed',
            tabIndex,
            tabName,
            error: message,
            totalTabs: scanTabIndices.length,
            completedTabs: scannedTabIndices.length,
          });
          logger.warn('networth:scan-snapshot:tab-error', { league, realm, tabIndex, error: message });
        }
      }

      let inventoryItems = [];
      let inventoryWarningMessage = null;
      if (includeInventory && characterName) {
        try {
          const detail = await fetchCharacterDetail(apiClient, characterName, realm, logger);
          inventoryItems = mapInventoryFromDetail(detail, realm, league, characterName);
        } catch (error) {
          if (isRateLimitError(error)) {
            inventoryWarningMessage = 'Inventory skipped due to Path of Exile rate limits.';
            const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
            const retryAt = markRateLimited(state, 'scan', retryDelayMs);
            persistState();
            logger.warn('networth:scan-snapshot:inventory-rate-limited', {
              league,
              realm,
              characterName,
              retryAt,
              error: buildErrorMessage(error),
            });
          } else {
            throw error;
          }
        }
      } else if (includeInventory && !characterName) {
        inventoryWarningMessage = 'Inventory skipped because no character could be resolved.';
      }

      const now = Date.now();
      let partialReason = null;
      let retryAt = null;
      const pendingTabIndices = parseTabIndices(deferredTabIndices);
      const partialReasons = [];
      if (pendingTabIndices.length > 0) {
        partialReasons.push(buildBatchScanMessage(scannedTabIndices.length, requestedTabIndices.length, pendingTabIndices.length));
        partialReason = 'batch';
        retryAt = toRetryTimestamp(STASH_SCAN_BATCH_RETRY_MS);
      }
      if (tabErrors.length > 0) {
        partialReasons.push(`Scanned with ${tabErrors.length} tab errors.`);
      }
      if (inventoryWarningMessage) {
        partialReasons.push(inventoryWarningMessage);
      }

      const partialMessage = partialReasons.length > 0 ? partialReasons.join(' ') : null;
      const scan = buildScanFromCollections({
        now,
        realm,
        league,
        characterName,
        tabSummary,
        requestedTabIndices,
        scannedTabIndices: scannedTabIndices.length > 0 ? scannedTabIndices : requestedTabIndices,
        pendingTabIndices,
        failedTabIndices: tabErrors.map((entry) => entry.tabIndex),
        stashItems,
        inventoryItems,
        partialReason,
        retryAt,
        partialMessage,
      });
      await enrichScanWithCurrencyRates(apiClient, logger, state, scan, league, realm);
      updateCachedTabsState(state, league, realm, tabSummary, now, false);
      saveLastLeague(league);
      persistState();

      sendSnapshotProgress({
        phase: 'completed',
        totalTabs: scanTabIndices.length,
        completedTabs: scannedTabIndices.length,
        failedTabs: tabErrors.map((entry) => entry.tabIndex),
      });

      if (scan.partial === true) {
        return toPartialStashScanSuccess(scan, partialMessage);
      }
      return toFullStashScanSuccess(scan);
    } catch (error) {
      if (isRateLimitError(error)) {
        const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
        updateRateLimitCacheState(state, retryDelayMs);
        persistState();
      }
      logger.error('networth:scan-snapshot:error', {
        league,
        realm,
        error: buildErrorMessage(error),
      });
      try {
        event?.sender?.send('networth:scanSnapshotProgress', {
          league,
          realm,
          phase: 'error',
          error: buildErrorMessage(error),
        });
      } catch {}
      return toStashScanFailure(error);
    }
  });

  try {
    ipcMain.removeHandler('networth:scanStashes');
  } catch {}
  ipcMain.handle('networth:scanStashes', async (_event, payload = {}) => {
    const apiClient = getApiClientOrThrow();
    const realm = sanitizeRealm(payload?.realm);
    const league = resolveNetworthLeague(payload?.league);
    if (!league) return toStashScanFailure(new Error('league is required'));
    const previousScan = findLatestScanForScope(state, league, realm);
    const scanCooldownMs = getRateLimitDelayMs(state, 'scan');
    if (scanCooldownMs > 0) {
      const retryAt = toRetryTimestamp(scanCooldownMs);
      return toStashScanFailure(
        new Error(`Scan paused by rate limits. Retry at ${new Date(retryAt).toLocaleTimeString()}.`)
      );
    }

    try {
      const includeInventory = shouldIncludeInventory(payload);
      const maxTabsPerScan = parseMaxTabsPerScan(payload?.maxTabsPerScan);
      const settings = includeInventory ? getSettings() : {};
      const shouldResolveCharacters = includeInventory;
      const characters = shouldResolveCharacters
        ? await fetchCharactersWithCache(apiClient, realm, logger, state, { allowEmptyOnRateLimit: true })
        : [];
      const characterName = includeInventory
        ? toScanCharacterName(payload?.characterName, settings, characters, league)
        : null;

      const tabPayload = await fetchStashOverview(apiClient, league, realm, logger, state);
      const tabSummary = resolveTabSummaryFromPayload(tabPayload);
      const requestedTabIndices = toScanTabIndices(payload?.tabIndices, tabSummary);
      if (requestedTabIndices.length === 0) {
        return toStashScanFailure(new Error('No stash tabs selected to scan'));
      }
      const scanTabIndices = requestedTabIndices.slice(0, maxTabsPerScan);
      const deferredTabIndices = requestedTabIndices.slice(scanTabIndices.length);
      const scanQueueEntryIdsByTab = new Map();
      requestedTabIndices.forEach((tabIndex) => {
        const tabMeta = tabSummary.tabs.find((tab) => tab.index === tabIndex) || normalizeTab({ i: tabIndex }, tabIndex);
        const entryId = `scan-tab-${league}-${tabIndex}`;
        scanQueueEntryIdsByTab.set(tabIndex, entryId);
        upsertScanQueueEntry({
          id: entryId,
          type: 'tab_scan',
          name: safeString(tabMeta?.name || `Tab ${tabIndex + 1}`),
          league,
          status: scanTabIndices.includes(tabIndex) ? 'queued' : 'pending',
          tabIndices: [tabIndex],
          tabNames: [safeString(tabMeta?.name || `Tab ${tabIndex + 1}`)],
          queuedItems: 0,
          lastError: '',
        });
      });

      const stashItems = [];
      const scannedTabIndices = [];
      const tabErrors = [];

      for (let idx = 0; idx < scanTabIndices.length; idx += 1) {
        const tabIndex = scanTabIndices[idx];
        const tabMeta = tabSummary.tabs.find((tab) => tab.index === tabIndex) || normalizeTab({ i: tabIndex }, tabIndex);
        const queueEntryId = scanQueueEntryIdsByTab.get(tabIndex);
        try {
          if (queueEntryId) {
            upsertScanQueueEntry({
              id: queueEntryId,
              type: 'tab_scan',
              name: safeString(tabMeta?.name || `Tab ${tabIndex + 1}`),
              league,
              status: 'in_progress',
              tabIndices: [tabIndex],
              tabNames: [safeString(tabMeta?.name || `Tab ${tabIndex + 1}`)],
              queuedItems: 0,
              lastError: '',
            });
          }
          if (idx > 0) {
            await wait(300);
          }
          const stashPayload = await fetchStashItemsForTab(apiClient, league, realm, tabMeta, tabIndex, logger, state);
          const itemsForTab = collectTabItems(stashPayload, tabSummary, tabIndex, realm, league);
          stashItems.push(...itemsForTab);
          scannedTabIndices.push(tabIndex);
          if (queueEntryId) {
            upsertScanQueueEntry({
              id: queueEntryId,
              type: 'tab_scan',
              name: safeString(tabMeta?.name || `Tab ${tabIndex + 1}`),
              league,
              status: 'done',
              tabIndices: [tabIndex],
              tabNames: [safeString(tabMeta?.name || `Tab ${tabIndex + 1}`)],
              queuedItems: itemsForTab.length,
              lastError: '',
            });
          }
        } catch (error) {
          const message = buildErrorMessage(error);
          if (isRateLimitError(error)) {
            const now = Date.now();
            const pendingTabIndices = buildPendingTabIndices(scanTabIndices, idx, deferredTabIndices);
            pendingTabIndices.forEach((pendingTabIndex) => {
              const pendingMeta = tabSummary.tabs.find((tab) => tab.index === pendingTabIndex) || normalizeTab({ i: pendingTabIndex }, pendingTabIndex);
              const pendingEntryId = scanQueueEntryIdsByTab.get(pendingTabIndex) || `scan-tab-${league}-${pendingTabIndex}`;
              scanQueueEntryIdsByTab.set(pendingTabIndex, pendingEntryId);
              upsertScanQueueEntry({
                id: pendingEntryId,
                type: 'tab_scan',
                name: safeString(pendingMeta?.name || `Tab ${pendingTabIndex + 1}`),
                league,
                status: 'pending',
                tabIndices: [pendingTabIndex],
                tabNames: [safeString(pendingMeta?.name || `Tab ${pendingTabIndex + 1}`)],
                queuedItems: 0,
                lastError: message,
              });
            });
            const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
            const retryAt = markRateLimited(state, 'scan', retryDelayMs);
            updateCachedTabsState(state, league, realm, tabSummary, now, true, retryAt);
            saveLastLeague(league);
            const partialMessage = buildRateLimitedScanMessage(
              scannedTabIndices.length,
              requestedTabIndices.length,
              pendingTabIndices.length
            );
            const mergedStashItems = mergeStashItemsWithPreviousScan(
              previousScan,
              stashItems,
              scannedTabIndices,
              league,
              realm
            );
            const inventoryItems = includeInventory
              ? mergeInventoryItemsWithPreviousScan(previousScan, [], characterName)
              : [];
            const scan = buildScanFromCollections({
              now,
              realm,
              league,
              characterName,
              tabSummary,
              requestedTabIndices,
              scannedTabIndices,
              pendingTabIndices,
              failedTabIndices: tabErrors.map((entry) => entry.tabIndex),
              stashItems: mergedStashItems,
              inventoryItems,
              partialReason: 'rate_limit',
              retryAt,
              partialMessage,
            });
            await enrichScanWithCurrencyRates(apiClient, logger, state, scan, league, realm);
            pushScanToState(state, scan);
            persistState();
            await saveScanSnapshotRemote(apiClient, logger, scan);
            if (getSettings()?.netWorthAutoQueueUnpriced === true) {
              const autoQueueResult = enqueuePricingItemsInternal(scan.items, league, {
                onlyUnpriced: true,
                respectFailureBudget: true,
                maxFailures: AUTO_QUEUE_UNPRICED_MAX_FAILURES,
                retryCooldownMs: AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS,
              });
              logger.info('networth:scan:auto-queue-unpriced', {
                league,
                realm,
                queued: Number(autoQueueResult?.queued || 0),
                skippedAlreadyQueued: Number(autoQueueResult?.skippedAlreadyQueued || 0),
                skippedAlreadyPriced: Number(autoQueueResult?.skippedAlreadyPriced || 0),
                skippedRetryBudget: Number(autoQueueResult?.skippedRetryBudget || 0),
              });
            }
            return toPartialStashScanSuccess(scan, partialMessage);
          }
          tabErrors.push({ tabIndex, error: message });
          if (queueEntryId) {
            upsertScanQueueEntry({
              id: queueEntryId,
              type: 'tab_scan',
              name: safeString(tabMeta?.name || `Tab ${tabIndex + 1}`),
              league,
              status: 'failed',
              tabIndices: [tabIndex],
              tabNames: [safeString(tabMeta?.name || `Tab ${tabIndex + 1}`)],
              queuedItems: 0,
              lastError: message,
            });
          }
          logger.warn('networth:scan:tab-error', { league, realm, tabIndex, error: message });
        }
      }

      let inventoryItems = [];
      let inventoryWarningMessage = null;
        if (includeInventory && characterName) {
          try {
            const detail = await fetchCharacterDetail(apiClient, characterName, realm, logger);
            inventoryItems = mapInventoryFromDetail(detail, realm, league, characterName);
          } catch (error) {
            if (isRateLimitError(error)) {
              inventoryWarningMessage = 'Inventory skipped due to Path of Exile rate limits.';
              const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
              const retryAt = markRateLimited(state, 'scan', retryDelayMs);
              logger.warn('networth:scan:inventory-rate-limited', {
                league,
                realm,
                characterName,
                retryAt,
                error: buildErrorMessage(error),
              });
            } else {
              throw error;
            }
        }
      } else if (includeInventory && !characterName) {
        inventoryWarningMessage = 'Inventory skipped because no character could be resolved.';
      }

      const mergedStashItems = mergeStashItemsWithPreviousScan(
        previousScan,
        stashItems,
        scannedTabIndices.length > 0 ? scannedTabIndices : requestedTabIndices,
        league,
        realm
      );
      inventoryItems = mergeInventoryItemsWithPreviousScan(previousScan, inventoryItems, characterName);

      const now = Date.now();
      let partialReason = null;
      let retryAt = null;
      const pendingTabIndices = parseTabIndices(deferredTabIndices);
      const partialReasons = [];
      if (pendingTabIndices.length > 0) {
        partialReasons.push(buildBatchScanMessage(scannedTabIndices.length, requestedTabIndices.length, pendingTabIndices.length));
        partialReason = 'batch';
        retryAt = toRetryTimestamp(STASH_SCAN_BATCH_RETRY_MS);
      }
      if (tabErrors.length > 0) {
        partialReasons.push(`Scanned with ${tabErrors.length} tab errors.`);
      }
      if (inventoryWarningMessage) {
        partialReasons.push(inventoryWarningMessage);
      }
      const partialMessage = partialReasons.length > 0 ? partialReasons.join(' ') : null;
      const scan = buildScanFromCollections({
        now,
        realm,
        league,
        characterName,
        tabSummary,
        requestedTabIndices,
        scannedTabIndices: scannedTabIndices.length > 0 ? scannedTabIndices : requestedTabIndices,
        pendingTabIndices,
        failedTabIndices: tabErrors.map((entry) => entry.tabIndex),
        stashItems: mergedStashItems,
        inventoryItems,
        partialReason,
        retryAt,
        partialMessage,
      });
      await enrichScanWithCurrencyRates(apiClient, logger, state, scan, league, realm);

      pushScanToState(state, scan);
      updateCachedTabsState(state, league, realm, tabSummary, now, false);
      saveLastLeague(league);
      persistState();
      await saveScanSnapshotRemote(apiClient, logger, scan);

      if (getSettings()?.netWorthAutoQueueUnpriced === true) {
        const autoQueueResult = enqueuePricingItemsInternal(scan.items, league, {
          onlyUnpriced: true,
          respectFailureBudget: true,
          maxFailures: AUTO_QUEUE_UNPRICED_MAX_FAILURES,
          retryCooldownMs: AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS,
        });
        logger.info('networth:scan:auto-queue-unpriced', {
          league,
          realm,
          queued: Number(autoQueueResult?.queued || 0),
          skippedAlreadyQueued: Number(autoQueueResult?.skippedAlreadyQueued || 0),
          skippedAlreadyPriced: Number(autoQueueResult?.skippedAlreadyPriced || 0),
          skippedRetryBudget: Number(autoQueueResult?.skippedRetryBudget || 0),
        });
      }

      if (scan.partial === true) {
        return toPartialStashScanSuccess(scan, partialMessage);
      }
      return toFullStashScanSuccess(scan);
    } catch (error) {
      if (isRateLimitError(error)) {
        const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
        updateRateLimitCacheState(state, retryDelayMs);
        persistState();
      }
      logger.error('networth:scan:error', {
        league,
        realm,
        error: buildErrorMessage(error),
      });
      return toStashScanFailure(error);
    }
  });

  try {
    ipcMain.removeHandler('networth:getLastScan');
  } catch {}
  ipcMain.handle('networth:getLastScan', async (_event, payload = {}) => {
    const apiClient = getApiClient();
    const activeLeague = NETWORTH_ACTIVE_LEAGUE;
    if (typeof payload === 'string') {
      const league = activeLeague;
      const remote = await loadLatestScanRemote(apiClient, logger, league, DEFAULT_REALM);
      if (remote) {
        await enrichScanWithCurrencyRates(apiClient, logger, state, remote, league, DEFAULT_REALM);
        hydrateScanIntoState(state, remote);
        persistState();
        return remote;
      }
      const local = findLatestScanForScope(state, league, DEFAULT_REALM);
      if (local) {
        await enrichScanWithCurrencyRates(apiClient, logger, state, local, league, DEFAULT_REALM);
        persistState();
        return local;
      }
      return null;
    }

    const safePayload = asObject(payload) || {};
    const league = activeLeague;
    const realm = sanitizeRealm(safePayload.realm);
    const remote = await loadLatestScanRemote(apiClient, logger, league, realm);
    if (remote) {
      await enrichScanWithCurrencyRates(apiClient, logger, state, remote, league, realm);
      hydrateScanIntoState(state, remote);
      persistState();
      return remote;
    }
    const local = findLatestScanForScope(state, league, realm);
    if (local) {
      await enrichScanWithCurrencyRates(apiClient, logger, state, local, league, realm);
      persistState();
      return local;
    }
    return null;
  });

  try {
    ipcMain.removeHandler('networth:getScanHistory');
  } catch {}
  ipcMain.handle('networth:getScanHistory', async (_event, payload = {}) => {
    const safePayload = asObject(payload) || {};
    const league = NETWORTH_ACTIVE_LEAGUE;
    const realm = sanitizeRealm(safePayload.realm);
    const limit = Number.parseInt(String(safePayload.limit ?? NETWORTH_SCAN_HISTORY_LIMIT), 10);
    const safeLimit = Number.isFinite(limit) && limit > 0
      ? Math.min(limit, NETWORTH_SCAN_HISTORY_LIMIT)
      : NETWORTH_SCAN_HISTORY_LIMIT;

    const apiClient = getApiClient();
    const remoteHistory = await loadScanHistoryRemote(apiClient, logger, league, realm, safeLimit);
    if (remoteHistory.length > 0) {
      for (let index = remoteHistory.length - 1; index >= 0; index -= 1) {
        await enrichScanWithCurrencyRates(apiClient, logger, state, remoteHistory[index], league, realm);
        hydrateScanIntoState(state, remoteHistory[index]);
      }
      persistState();
      return remoteHistory.filter((entry) => isScanVisibleInHistory(entry)).slice(0, safeLimit);
    }

    const localHistory = state.scanHistory
      .filter((entry) => isScanMatchForScope(entry, league, realm))
      .filter((entry) => isScanVisibleInHistory(entry))
      .slice(0, safeLimit);
    for (const entry of localHistory) {
      await enrichScanWithCurrencyRates(apiClient, logger, state, entry, league, realm);
    }
    persistState();
    return localHistory;
  });

  if (enableDevWebsiteFeatures === true) {
    try {
      ipcMain.removeHandler('networth:priceItem');
    } catch {}
    ipcMain.handle('networth:priceItem', async (_event, item, league, options = {}) => {
      try {
        const activeCooldownMs = getRateLimitDelayMs(state, 'pricing');
        if (activeCooldownMs > 0) {
          const retryAt = toRetryTimestamp(activeCooldownMs);
          return {
            success: false,
            error: `Pricing paused by rate limits. Retry at ${new Date(retryAt).toLocaleTimeString()}.`,
          };
        }

        const apiClient = getApiClientOrThrow();
        const safeLeague = resolveNetworthLeague(league);
        if (!safeLeague) {
          return { success: false, error: 'league is required' };
        }
        const safeItem = normalizeItemForPricing(asObject(item) || {});
        if (isExchangePricedCandidate(safeItem)) {
          return {
            success: false,
            error: 'This item is valued via Currency Exchange and is excluded from trade repricing.',
          };
        }
        if (!hasValidPricingItemType(safeItem)) {
          return {
            success: false,
            error: 'Item has no valid base type for trade pricing. Re-sync this stash tab and try again.',
          };
        }
        const rawOptions = asObject(options) || {};
        const safeOptions = normalizePricingOptions({
          ...rawOptions,
          listingMode: rawOptions.listingMode ?? getSettings()?.netWorthPricingListingMode,
        });
        logger.info('networth:pricing:request', {
          mode: 'manual-reprice',
          endpoint: '/networth/price-item',
          league: safeLeague,
          item: {
            id: safeString(safeItem.id || ''),
            name: safeString(safeItem.name || ''),
            typeLine: safeString(safeItem.typeLine || safeItem.type_line || ''),
            baseType: safeString(safeItem.baseType || safeItem.base_type || ''),
            frameType: parseOptionalInteger(safeItem.frameType ?? safeItem.frame_type),
            ilvl: parseOptionalInteger(safeItem.ilvl ?? safeItem.itemLevel ?? safeItem.item_level),
          },
          options: safeOptions,
        });
        const response = await apiClient.priceNetworthItem({
          item: safeItem,
          league: safeLeague,
          options: safeOptions,
        });
        const pricing = parsePricingResult(response);
        logger.info('networth:pricing:response', {
          mode: 'manual-reprice',
          league: safeLeague,
          itemKey: toPricingItemKey(safeItem),
          estimated: pricing.estimated === true,
          chaos: parseOptionalFloat(pricing.chaos),
          divine: parseOptionalFloat(pricing.divine),
          sampleSize: parseOptionalInteger(pricing.sampleSize),
          error: safeString(pricing.error || ''),
        });
        return {
          success: true,
          ...pricing,
        };
      } catch (error) {
        if (isRateLimitError(error)) {
          const retryDelayMs = resolveRateLimitDelayMs(error, STASH_SCAN_RETRY_MS);
          const retryAt = markRateLimited(state, 'pricing', retryDelayMs);
          persistState();
          return {
            success: false,
            error: `Pricing paused by rate limits. Retry at ${new Date(retryAt).toLocaleTimeString()}.`,
          };
        }
        return {
          success: false,
          error: buildErrorMessage(error),
        };
      }
    });

    try {
      ipcMain.removeHandler('networth:saveManualPricing');
    } catch {}
    ipcMain.handle('networth:saveManualPricing', async (_event, item, pricing, league) => {
      try {
        const apiClient = getApiClientOrThrow();
        const safeLeague = resolveNetworthLeague(league);
        if (!safeLeague) {
          return { success: false, error: 'league is required' };
        }
        const safeItem = asObject(item) || {};
        if (isExchangePricedCandidate(safeItem)) {
          return {
            success: false,
            error: 'This item is valued via Currency Exchange and cannot be manually trade-priced.',
          };
        }
        const parsedPricing = parsePricingResult(pricing);
        await apiClient.saveNetworthManualPricing({
          item: safeItem,
          pricing: parsedPricing,
          league: safeLeague,
        });
        upsertQueueEntryFromPricing(safeItem, safeLeague, parsedPricing, null);
        applyPricingToState(state, toPricingItemKey(safeItem), {
          ...parsedPricing,
          source: safeString(parsedPricing.source || 'manual_override') || 'manual_override',
        });
        persistState();
        await persistLatestScanRemote();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: buildErrorMessage(error),
        };
      }
    });

  try {
    ipcMain.removeHandler('networth:getTaskQueue');
  } catch {}
  ipcMain.handle('networth:getTaskQueue', async () => ({
      pricing: state.pricingQueue,
      scans: state.scanQueue,
      pricingPaused: state.pricingQueuePaused,
      rateLimits: state.rateLimits,
      cachedStashTabs: state.cachedStashTabs,
      scanHistoryClearedAt: state.scanHistoryClearedAt,
    }));

    try {
      ipcMain.removeHandler('networth:getPricingQueue');
    } catch {}
    ipcMain.handle('networth:getPricingQueue', async () => state.pricingQueue);

    try {
      ipcMain.removeHandler('networth:pausePricingQueue');
    } catch {}
    ipcMain.handle('networth:pausePricingQueue', async () => {
      state.pricingQueuePaused = true;
      persistState();
      return true;
    });

    try {
      ipcMain.removeHandler('networth:resumePricingQueue');
    } catch {}
    ipcMain.handle('networth:resumePricingQueue', async () => {
      state.pricingQueuePaused = false;
      persistState();
      processPricingQueue().catch((error) => {
        logger.warn('networth:pricing-queue:resume-failed', { error: buildErrorMessage(error) });
      });
      return true;
    });

    try {
      ipcMain.removeHandler('networth:removePricingQueueItem');
    } catch {}
    ipcMain.handle('networth:removePricingQueueItem', async (_event, itemKey) => {
      const safeItemKey = safeString(itemKey);
      if (!safeItemKey) return false;
      const before = state.pricingQueue.length;
      state.pricingQueue = state.pricingQueue.filter((entry) => safeString(entry.itemKey) !== safeItemKey);
      const changed = state.pricingQueue.length !== before;
      if (changed) persistState();
      return changed;
    });

    try {
      ipcMain.removeHandler('networth:clearPricingQueue');
    } catch {}
    ipcMain.handle('networth:clearPricingQueue', async () => {
      state.pricingQueue = [];
      state.pricingQueuePaused = false;
      persistState();
      return true;
    });

    try {
      ipcMain.removeHandler('networth:enqueueUnpricedItems');
    } catch {}
    ipcMain.handle('networth:enqueueUnpricedItems', async (_event, payload = {}) => {
      const source = asObject(payload) || {};
      const safeLeague = resolveNetworthLeague(source.league);
      if (!safeLeague) {
        return { queued: 0, error: 'league is required' };
      }
      const safeRealm = sanitizeRealm(source.realm);
      const latestScan = findLatestScanForScope(state, safeLeague, safeRealm);
      if (!latestScan || !Array.isArray(latestScan.items) || latestScan.items.length === 0) {
        return { queued: 0, error: 'No scan data available for this league.' };
      }

      return enqueuePricingItemsInternal(latestScan.items, safeLeague, {
        onlyUnpriced: true,
        respectFailureBudget: true,
        maxFailures: AUTO_QUEUE_UNPRICED_MAX_FAILURES,
        retryCooldownMs: AUTO_QUEUE_UNPRICED_RETRY_COOLDOWN_MS,
      });
    });

    try {
      ipcMain.removeHandler('networth:enqueueScanTask');
    } catch {}
    ipcMain.handle('networth:enqueueScanTask', async (_event, payload = {}) => {
      return upsertScanQueueEntry(payload, { persist: true });
    });

    try {
      ipcMain.removeHandler('networth:getScanQueue');
    } catch {}
    ipcMain.handle('networth:getScanQueue', async () => state.scanQueue);

    try {
      ipcMain.removeHandler('networth:removeScanQueueItem');
    } catch {}
    ipcMain.handle('networth:removeScanQueueItem', async (_event, id) => {
      const safeId = safeString(id);
      if (!safeId) return false;
      const before = state.scanQueue.length;
      state.scanQueue = state.scanQueue.filter((entry) => safeString(entry.id) !== safeId);
      const changed = state.scanQueue.length !== before;
      if (changed) persistState();
      return changed;
    });

    try {
      ipcMain.removeHandler('networth:clearScanQueue');
    } catch {}
    ipcMain.handle('networth:clearScanQueue', async () => {
      state.scanQueue = [];
      persistState();
      return true;
    });

    try {
      ipcMain.removeHandler('networth:clearScanHistory');
    } catch {}
    ipcMain.handle('networth:clearScanHistory', async () => {
      state.scanHistoryClearedAt = Date.now();
      state.scanHistory = [];
      persistState();
      return true;
    });

    try {
      ipcMain.removeHandler('networth:enqueuePricingItems');
    } catch {}
    ipcMain.handle('networth:enqueuePricingItems', async (_event, items, league) => {
      return enqueuePricingItemsInternal(items, league, {
        onlyUnpriced: false,
        respectFailureBudget: false,
      });
    });

    if (state.pricingQueue.some((entry) => entry.status === 'queued')) {
      processPricingQueue().catch((error) => {
        logger.warn('networth:pricing-queue:startup-failed', { error: buildErrorMessage(error) });
      });
    }
  }

  logger.info('networth:ipc-registered', {
    channels: toChannelsCount().length,
  });
}

module.exports = {
  registerNetworthIpcHandlers,
};

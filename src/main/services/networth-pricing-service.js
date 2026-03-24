const fetch = require('node-fetch');

const TRADE_API_BASE_URL = process.env.SIMPLEX_TRADE_API_BASE_URL || 'https://www.pathofexile.com/api/trade';
const TRADE_SITE_BASE_URL = process.env.SIMPLEX_TRADE_SITE_BASE_URL || 'https://www.pathofexile.com/trade/search';
const TRADE_REQUEST_TIMEOUT_MS = Number(process.env.SIMPLEX_TRADE_TIMEOUT_MS || 15000);
const TRADE_FETCH_LIMIT = Number(process.env.SIMPLEX_TRADE_FETCH_LIMIT || 60);
const TRADE_FETCH_LIMIT_QUEUE = Number(process.env.SIMPLEX_TRADE_FETCH_LIMIT_QUEUE || 10);
const TRADE_FETCH_CHUNK_SIZE = 10;
const TRADE_MIN_INTERVAL_MS = Number(process.env.SIMPLEX_TRADE_MIN_INTERVAL_MS || 1250);
const TRADE_USER_AGENT = process.env.SIMPLEX_TRADE_USER_AGENT || 'Simplex/1.0 (+https://simplex.gg)';
const DIVINE_RATE = 200;
const RULES_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LISTING_MODE = 'instant_buyout';
const LISTING_MODE_TO_STATUS_OPTION = {
  instant_buyout_and_in_person: 'available',
  instant_buyout: 'securable',
  in_person_online_in_league: 'onlineleague',
  in_person_online: 'online',
  any: 'any',
};
const STATUS_OPTION_TO_LISTING_MODE = {
  available: 'instant_buyout_and_in_person',
  securable: 'instant_buyout',
  onlineleague: 'in_person_online_in_league',
  online: 'in_person_online',
  any: 'any',
};
const DEFAULT_CURRENCY_CHAOS_RATES = {
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
const DEFAULT_TRADE_CATEGORY_MAP = {
  'accessory.ring': 'ring',
  'accessory.amulet': 'amulet',
  'accessory.belt': 'belt',
  'armour.quiver': 'quiver',
  'weapon.claw': 'claw',
  'weapon.dagger': 'dagger',
  'weapon.wand': 'wand',
  'weapon.oneaxe': 'one_hand_axe',
  'weapon.onemace': 'one_hand_mace',
  'weapon.onesword': 'one_hand_sword',
  'weapon.sceptre': 'sceptre',
  'weapon.twoaxe': 'two_hand_axe',
  'weapon.twomace': 'two_hand_mace',
  'weapon.twosword': 'two_hand_sword',
  'weapon.bow': 'bow',
  'weapon.staff': 'staff',
  'weapon.warstaff': 'warstaff',
  'armour.chest': 'body_armour',
  'armour.boots': 'boots',
  'armour.gloves': 'gloves',
  'armour.helmet': 'helmet',
  'armour.shield': 'shield',
  jewel: 'jewel',
  'jewel.abyss': 'abyss_jewel',
  'jewel.cluster': 'cluster_jewel',
  map: 'map',
  flask: 'flask',
};
const LOCAL_FALLBACK_SELECTION_RULES = [
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?) to maximum Life/i, minValue: 40, score: 10 },
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?)% to all Elemental Resistances/i, minValue: 8, score: 10 },
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?)% to (Fire|Cold|Lightning) Resistance/i, minValue: 28, score: 9 },
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?)% to (?:Global )?Critical Strike Multiplier/i, minValue: 15, score: 9 },
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?)% to Damage over Time Multiplier/i, minValue: 10, score: 9 },
  { type: 'explicit', regex: /(\d+(?:\.\d+)?)% increased (?:[\w ]+ )?Damage/i, minValue: 20, score: 8 },
  { type: 'explicit', regex: /Adds (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?) [\w ]*Damage/i, minValue: 20, score: 8 },
  { type: 'explicit', regex: /(\d+(?:\.\d+)?)% increased Attack Speed/i, minValue: 5, score: 7 },
  { type: 'explicit', regex: /(\d+(?:\.\d+)?)% increased Cast Speed/i, minValue: 5, score: 7 },
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?) to maximum Energy Shield/i, minValue: 40, score: 6 },
  { type: 'explicit', regex: /\+(\d+(?:\.\d+)?) to (Strength|Dexterity|Intelligence)/i, minValue: 40, score: 5 },
];

let nextTradeRequestAt = 0;
let tradeRequestChain = Promise.resolve();
let cachedTradeStats = null;
let cachedTradeStatsAt = 0;

function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { return typeof value === 'string' ? value.trim() : ''; }
function toNumber(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}
function toStringArray(value) { return asArray(value).map((entry) => safeString(entry)).filter(Boolean); }
function normalizeListingMode(value) {
  const normalized = safeString(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (LISTING_MODE_TO_STATUS_OPTION[normalized]) return normalized;
  return STATUS_OPTION_TO_LISTING_MODE[normalized] || DEFAULT_LISTING_MODE;
}
function toStatusOptionFromListingMode(value) { return LISTING_MODE_TO_STATUS_OPTION[normalizeListingMode(value)] || LISTING_MODE_TO_STATUS_OPTION[DEFAULT_LISTING_MODE]; }
function normalizeModPattern(value) { return safeString(value).toLowerCase().replace(/-?\d+(?:\.\d+)?/g, '#').replace(/\s+/g, ' ').trim(); }
function normalizeTradeStatPattern(value) { return normalizeModPattern(safeString(value).replace(/\((?:crafted|fractured|implicit|enchant|veiled|pseudo|local|global)\)/gi, '').replace(/\s+/g, ' ').trim()); }
function extractNumbers(text) { return (safeString(text).match(/-?\d+(?:\.\d+)?/g) || []).map((entry) => Number.parseFloat(entry)).filter((entry) => Number.isFinite(entry)); }
function parseModRangeFromText(text) { const numbers = extractNumbers(text); if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] }; if (numbers.length === 1) return { min: numbers[0] }; return null; }
function buildTradeStatValue(range) {
  const hasMin = typeof range?.min === 'number' && Number.isFinite(range.min);
  const hasMax = typeof range?.max === 'number' && Number.isFinite(range.max);
  if (!hasMin && !hasMax) return null;
  const min = hasMin ? Number(range.min) : undefined;
  const max = hasMax ? Number(range.max) : undefined;
  if (typeof min === 'number' && typeof max === 'number' && max < min) return { min: max, max: min };
  const value = {};
  if (typeof min === 'number') value.min = min;
  if (typeof max === 'number') value.max = max;
  return value;
}
function inferTradeCategory(item) {
  const explicitCategory = safeString(item.tradeCategory || item.category);
  if (explicitCategory.includes('.')) return explicitCategory;
  const categoryObj = asObject(item.category);
  if (categoryObj) {
    for (const [rawRoot, rawValue] of Object.entries(categoryObj)) {
      const root = safeString(rawRoot).toLowerCase();
      const values = asArray(rawValue).map((entry) => safeString(entry).toLowerCase()).filter(Boolean);
      if (root === 'accessory') {
        if (values.includes('ring')) return 'accessory.ring';
        if (values.includes('amulet')) return 'accessory.amulet';
        if (values.includes('belt')) return 'accessory.belt';
        if (values.includes('quiver')) return 'armour.quiver';
      }
      if (root === 'weapon') {
        if (values.includes('claw')) return 'weapon.claw';
        if (values.includes('dagger')) return 'weapon.dagger';
        if (values.includes('wand')) return 'weapon.wand';
        if (values.includes('oneaxe')) return 'weapon.oneaxe';
        if (values.includes('onemace')) return 'weapon.onemace';
        if (values.includes('onesword')) return 'weapon.onesword';
        if (values.includes('sceptre')) return 'weapon.sceptre';
        if (values.includes('twoaxe')) return 'weapon.twoaxe';
        if (values.includes('twomace')) return 'weapon.twomace';
        if (values.includes('twosword')) return 'weapon.twosword';
        if (values.includes('bow')) return 'weapon.bow';
        if (values.includes('staff')) return 'weapon.staff';
        if (values.includes('warstaff')) return 'weapon.warstaff';
      }
      if (root === 'armour') {
        if (values.includes('chest')) return 'armour.chest';
        if (values.includes('boots')) return 'armour.boots';
        if (values.includes('gloves')) return 'armour.gloves';
        if (values.includes('helmet')) return 'armour.helmet';
        if (values.includes('shield')) return 'armour.shield';
      }
      if (root === 'jewel') {
        if (values.includes('abyss')) return 'jewel.abyss';
        if (values.includes('cluster')) return 'jewel.cluster';
        return 'jewel';
      }
      if (root === 'map') return 'map';
      if (root === 'flask') return 'flask';
    }
  }
  const label = safeString(item.baseType || item.typeLine || item.name).toLowerCase();
  if (!label) return '';
  if (label.includes('amulet')) return 'accessory.amulet';
  if (label.includes('ring')) return 'accessory.ring';
  if (label.includes('belt')) return 'accessory.belt';
  if (label.includes('quiver')) return 'armour.quiver';
  if (label.includes('jewel')) return 'jewel';
  if (label.includes('flask')) return 'flask';
  if (label.includes('claw')) return 'weapon.claw';
  if (label.includes('dagger')) return 'weapon.dagger';
  if (label.includes('wand')) return 'weapon.wand';
  if (label.includes('sceptre')) return 'weapon.sceptre';
  if (label.includes('warstaff')) return 'weapon.warstaff';
  if (label.includes('staff')) return 'weapon.staff';
  if (label.includes('bow')) return 'weapon.bow';
  if (label.includes('axe')) return 'weapon.oneaxe';
  if (label.includes('mace')) return 'weapon.onemace';
  if (label.includes('sword')) return 'weapon.onesword';
  if (label.includes('helmet')) return 'armour.helmet';
  if (label.includes('gloves')) return 'armour.gloves';
  if (label.includes('boots')) return 'armour.boots';
  if (label.includes('shield')) return 'armour.shield';
  if (label.includes('robe') || label.includes('armour') || label.includes('vest') || label.includes('brigandine')) return 'armour.chest';
  if (label.includes('map')) return 'map';
  return '';
}
function inferRarityFilter(frameType) { if (frameType === 3) return 'unique'; if (frameType === 2) return 'rare'; if (frameType === 1) return 'magic'; return null; }
function slugifyCategory(value) { return safeString(value).toLowerCase().replace(/&/g, 'and').replace(/[^\w]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); }
function mapTradeCategoryToRulesCategory(category, tradeCategoryMap) { const safeMap = asObject(tradeCategoryMap) || {}; return safeMap[category] || DEFAULT_TRADE_CATEGORY_MAP[category] || category; }
function buildUniqueRulesCategoryCandidates(item, tradeCategoryMap) {
  const frameType = toNumber(item.frameType);
  if (frameType !== 3) return [];
  const tradeCategory = inferTradeCategory(item);
  const baseSlug = slugifyCategory(tradeCategory ? mapTradeCategoryToRulesCategory(tradeCategory, tradeCategoryMap) : '');
  if (!baseSlug) return [];
  const uniqueSlug = slugifyCategory(safeString(item.name) || safeString(item.typeLine) || safeString(item.baseType));
  return uniqueSlug ? [`unique_${baseSlug}__${uniqueSlug}`, `unique_${baseSlug}`] : [`unique_${baseSlug}`];
}
function extractItemMods(item) {
  const buckets = [
    { key: 'implicitMods', type: 'implicit' },
    { key: 'explicitMods', type: 'explicit' },
    { key: 'craftedMods', type: 'crafted' },
    { key: 'fracturedMods', type: 'fractured' },
    { key: 'enchantMods', type: 'enchant' },
    { key: 'veiledMods', type: 'veiled' },
    { key: 'utilityMods', type: 'utility' },
  ];
  const mods = [];
  const dedup = new Set();
  for (const bucket of buckets) {
    for (const text of toStringArray(item[bucket.key])) {
      const key = `${bucket.type}:${normalizeModPattern(text)}`;
      if (dedup.has(key)) continue;
      dedup.add(key);
      mods.push({ text, type: bucket.type, selected: false, range: parseModRangeFromText(text) });
    }
  }
  return mods;
}
function normalizeForcedMods(input) {
  return asArray(input).map((entry) => {
    const source = asObject(entry);
    if (!source) return null;
    const text = safeString(source.text);
    if (!text) return null;
    const rangeObject = asObject(source.range);
    return {
      text,
      type: safeString(source.type) || 'explicit',
      statId: safeString(source.statId) || undefined,
      range: rangeObject ? { min: toNumber(rangeObject.min) ?? undefined, max: toNumber(rangeObject.max) ?? undefined } : parseModRangeFromText(text),
      selected: true,
      enabled: true,
    };
  }).filter(Boolean);
}
function getFallbackSelectionRules(pricingConfig) {
  const rules = asArray(pricingConfig?.fallbackRules);
  if (rules.length === 0) return LOCAL_FALLBACK_SELECTION_RULES;
  const compiled = rules.map((entry) => {
    const pattern = safeString(entry?.pattern);
    const type = safeString(entry?.type).toLowerCase();
    if (!pattern || !type) return null;
    try {
      return { type, regex: new RegExp(pattern, safeString(entry?.flags) || 'i'), minValue: Number(entry?.minValue) || 0, score: Number(entry?.score) || 0 };
    } catch {
      return null;
    }
  }).filter(Boolean);
  return compiled.length > 0 ? compiled : LOCAL_FALLBACK_SELECTION_RULES;
}
function chooseRulesCategory(item, pricingConfig) {
  const rules = asObject(pricingConfig?.rules) || {};
  const tradeCategoryMap = asObject(pricingConfig?.tradeCategoryMap) || {};
  const frameType = toNumber(item.frameType);
  const uniqueCandidates = buildUniqueRulesCategoryCandidates(item, tradeCategoryMap);
  const namedUniqueCandidates = uniqueCandidates.filter((candidate) => candidate.includes('__'));
  const genericUniqueCandidates = uniqueCandidates.filter((candidate) => !candidate.includes('__'));
  const regularCandidates = [safeString(item.category), safeString(item.tradeCategory), safeString(item.itemClass), safeString(item.item_class), inferTradeCategory(item)]
    .filter(Boolean)
    .map((entry) => slugifyCategory(entry.includes('.') ? mapTradeCategoryToRulesCategory(entry, tradeCategoryMap) : entry))
    .filter(Boolean);
  if (frameType === 3) {
    for (const candidate of namedUniqueCandidates) if (rules[candidate]) return candidate;
    for (const candidate of genericUniqueCandidates) if (rules[candidate]) return candidate;
  }
  for (const candidate of regularCandidates) if (rules[candidate]) return candidate;
  if (frameType !== 3) {
    for (const candidate of uniqueCandidates) if (rules[candidate]) return candidate;
  }
  return null;
}
function findModsByPatterns(allMods, patterns) {
  const byPattern = new Map();
  for (const mod of allMods) {
    const key = normalizeModPattern(mod.text);
    const list = byPattern.get(key) || [];
    list.push(mod);
    byPattern.set(key, list);
  }
  const output = [];
  const dedup = new Set();
  for (const pattern of patterns) {
    const normalized = normalizeModPattern(pattern);
    const matches = byPattern.get(normalized) || [];
    if (!matches.length) return [];
    const picked = matches[0];
    const key = normalizeModPattern(picked.text);
    if (dedup.has(key)) continue;
    dedup.add(key);
    output.push({ ...picked, selected: true, enabled: true, range: picked.range || parseModRangeFromText(picked.text) });
  }
  return output;
}
function selectFallbackMods(allMods, pricingConfig) {
  const maxSelected = Math.max(1, Number(pricingConfig?.maxSelectedMods) || 4);
  const scored = [];
  for (const mod of allMods) {
    for (const rule of getFallbackSelectionRules(pricingConfig)) {
      if (rule.type !== mod.type) continue;
      if (!rule.regex.test(mod.text)) continue;
      const values = extractNumbers(mod.text);
      const valueScore = values.length > 0 ? Math.max(...values) : 0;
      if (valueScore < rule.minValue) continue;
      scored.push({ mod, score: rule.score + valueScore / Math.max(rule.minValue, 1) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  const seen = new Set();
  for (const entry of scored) {
    const key = normalizeModPattern(entry.mod.text);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ ...entry.mod, selected: true, enabled: true, range: entry.mod.range || parseModRangeFromText(entry.mod.text) });
    if (selected.length >= maxSelected) break;
  }
  return selected;
}
function selectModsFromRules(allMods, pricingConfig, category) {
  const rulesByCategory = asObject(pricingConfig?.rules) || {};
  const maxSelected = Math.max(1, Number(pricingConfig?.maxSelectedMods) || 4);
  if (!category || !rulesByCategory[category]) return selectFallbackMods(allMods, pricingConfig).slice(0, maxSelected);
  const rules = rulesByCategory[category];
  const combos = [];
  for (const size of [5, 4, 3, 2]) combos.push(...asArray(rules?.combos?.[`${size}mod`]));
  combos.sort((a, b) => Number(b?.avgChaos || 0) - Number(a?.avgChaos || 0));
  for (const combo of combos) {
    const comboMods = findModsByPatterns(allMods, asArray(combo?.mods));
    if (comboMods.length >= 2 && comboMods.length === asArray(combo?.mods).length) return comboMods.slice(0, maxSelected);
  }
  const patternRules = [...asArray(rules?.highImpactUnique), ...asArray(rules?.highImpact), ...asArray(rules?.commonExpensive)]
    .sort((a, b) => Number(b?.avgChaos || 0) - Number(a?.avgChaos || 0));
  const selected = [];
  const seen = new Set();
  for (const rule of patternRules) {
    const matches = findModsByPatterns(allMods, [rule?.pattern]);
    if (!matches.length) continue;
    const mod = matches[0];
    const key = normalizeModPattern(mod.text);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(mod);
    if (selected.length >= maxSelected) break;
  }
  if (selected.length >= 2) return selected;
  const fallback = selectFallbackMods(allMods, pricingConfig);
  if (fallback.length > 0) return fallback.slice(0, maxSelected);
  return allMods.slice(0, maxSelected).map((mod) => ({ ...mod, selected: true, enabled: true }));
}
function normalizeCurrency(value) {
  const map = { chaos: 'chaos', 'chaos orb': 'chaos', divine: 'divine', 'divine orb': 'divine', exalted: 'exalted', 'exalted orb': 'exalted', alchemy: 'alchemy', 'orb of alchemy': 'alchemy', alteration: 'alteration', fusing: 'fusing', jeweller: 'jewellers', jewellers: 'jewellers', chromatic: 'chromatic', vaal: 'vaal', regal: 'regal', regret: 'regret', scour: 'scour', scouring: 'scour', blessed: 'blessed', gcp: 'gcp' };
  return map[safeString(value).toLowerCase()] || safeString(value).toLowerCase();
}
function toChaosValue(amount, currency, chaosRates) {
  const rate = chaosRates[normalizeCurrency(currency)];
  return Number.isFinite(rate) ? amount * rate : null;
}
function computePrice(rows, chaosPerDivine) {
  if (!rows.length) return null;
  const sorted = rows.slice().sort((a, b) => a.chaos - b.chaos);
  const used = sorted.slice(0, Math.min(8, sorted.length));
  const avgChaos = Number((used.reduce((acc, row) => acc + row.chaos, 0) / Math.max(used.length, 1)).toFixed(4));
  let confidence = 'low';
  if (used.length >= 10) confidence = 'high'; else if (used.length >= 5) confidence = 'medium';
  return {
    chaos: avgChaos,
    divine: Number((avgChaos / chaosPerDivine).toFixed(3)),
    confidence,
    sampleSize: sorted.length,
    range: { min: Number(used[0].chaos.toFixed(4)), max: Number(used[used.length - 1].chaos.toFixed(4)) },
    usedForAverage: used,
  };
}
function calculateMaxLink(sockets) {
  if (!sockets.length) return 0;
  let maxLink = 1; let current = 1; let lastGroup = toNumber(sockets[0]?.group) ?? 0;
  for (let i = 1; i < sockets.length; i += 1) {
    const group = toNumber(sockets[i]?.group) ?? 0;
    if (group === lastGroup) { current += 1; maxLink = Math.max(maxLink, current); } else { current = 1; lastGroup = group; }
  }
  return maxLink;
}
function getPropertyText(item, propertyName) {
  for (const property of asArray(item.properties)) {
    if (safeString(property?.name) !== propertyName) continue;
    const first = asArray(asArray(property?.values)[0]);
    return safeString(first[0]);
  }
  return '';
}
function parseNumericValue(value) { const match = safeString(value).match(/-?\d+(?:\.\d+)?/); return match ? Number.parseFloat(match[0]) : null; }
function parseDamageAverage(value) {
  const matches = Array.from(safeString(value).matchAll(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/g));
  if (!matches.length) return null;
  let total = 0;
  for (const match of matches) total += (Number.parseFloat(match[1]) + Number.parseFloat(match[2])) / 2;
  return total > 0 ? total : null;
}
function extractWeaponTradeMetrics(item) {
  const aps = parseNumericValue(getPropertyText(item, 'Attacks per Second'));
  if (!aps || aps <= 0) return { aps: null, physDps: null, elemDps: null, chaosDps: null, totalDps: null };
  const physDps = (() => { const avg = parseDamageAverage(getPropertyText(item, 'Physical Damage')); return avg ? Number((avg * aps).toFixed(1)) : null; })();
  const elemDps = (() => { const avg = parseDamageAverage(getPropertyText(item, 'Elemental Damage')); return avg ? Number((avg * aps).toFixed(1)) : null; })();
  const chaosDps = (() => { const avg = parseDamageAverage(getPropertyText(item, 'Chaos Damage')); return avg ? Number((avg * aps).toFixed(1)) : null; })();
  const totalDps = [physDps, elemDps, chaosDps].filter((value) => typeof value === 'number' && value > 0).reduce((sum, value) => sum + value, 0);
  return { aps, physDps, elemDps, chaosDps, totalDps: totalDps > 0 ? Number(totalDps.toFixed(1)) : null };
}
function isWeaponDpsRelevantMod(text) {
  const normalized = normalizeModPattern(text);
  return normalized.includes('adds # to #') && normalized.includes('damage') || normalized.includes('% increased attack speed') || normalized.includes('% increased physical damage') || normalized.includes('% increased elemental damage with attack skills') || normalized.includes('% to critical strike chance') || normalized.includes('% increased critical strike chance');
}
function shouldPreferWeaponDpsSearch(item, tradeCategory, selectedMods) {
  if (toNumber(item.frameType) === 3) return false;
  if (!safeString(tradeCategory).startsWith('weapon.')) return false;
  const metrics = extractWeaponTradeMetrics(item);
  if (!metrics.totalDps || metrics.totalDps <= 0) return false;
  if (!selectedMods.length) return true;
  const dpsRelevantMods = selectedMods.filter((mod) => isWeaponDpsRelevantMod(mod.text)).length;
  return dpsRelevantMods > 0 && dpsRelevantMods >= Math.ceil(selectedMods.length / 2);
}
function buildWeaponTradeFilters(item) {
  const metrics = extractWeaponTradeMetrics(item);
  if (!metrics.totalDps || metrics.totalDps <= 0) return null;
  const weaponFilters = { dps: { min: Math.max(1, Number((metrics.totalDps * 0.95).toFixed(1))) } };
  if (metrics.aps && metrics.aps > 0) weaponFilters.aps = { min: Math.max(0.1, Number((metrics.aps * 0.92).toFixed(2))) };
  if (metrics.physDps && !metrics.elemDps && !metrics.chaosDps) weaponFilters.pdps = { min: Math.max(1, Number((metrics.physDps * 0.95).toFixed(1))) };
  return weaponFilters;
}

function normalizeLeague(value) {
  return safeString(value) || 'Standard';
}

function hasPseudoSelected(selectedMods, pseudoId) {
  return selectedMods.some((mod) => safeString(mod?.statId).toLowerCase() === safeString(pseudoId).toLowerCase());
}

function prioritizePseudoSelections(selectedMods) {
  if (selectedMods.length <= 1) return selectedMods;
  const hasTotalLife = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_life');
  const hasTotalMana = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_mana');
  const hasTotalEs = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_energy_shield');
  const hasTotalElemRes = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_elemental_resistance');
  const hasTotalChaosRes = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_chaos_resistance');
  const hasTotalStr = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_strength');
  const hasTotalDex = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_dexterity');
  const hasTotalInt = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_intelligence');
  const hasTotalAttrs = hasPseudoSelected(selectedMods, 'pseudo.pseudo_total_all_attributes');
  return selectedMods.filter((mod) => {
    const statId = safeString(mod?.statId).toLowerCase();
    if (statId.startsWith('pseudo.')) return true;
    const text = safeString(mod?.text).toLowerCase();
    if (!text) return true;
    if (hasTotalLife && text.includes('maximum life') && !text.includes('minion')) return false;
    if (hasTotalMana && text.includes('maximum mana')) return false;
    if (hasTotalEs && text.includes('maximum energy shield')) return false;
    if (hasTotalElemRes && /resistances?/.test(text) && !text.includes('chaos')) {
      if (text.includes('fire') || text.includes('cold') || text.includes('lightning') || text.includes('all elemental') || text.includes('elemental resistance')) return false;
    }
    if (hasTotalChaosRes && text.includes('chaos resistance')) return false;
    if (hasTotalAttrs && /\bto\b.+\ball attributes\b/.test(text)) return false;
    if (hasTotalStr && /\bto\b.+\bstrength\b/.test(text) && !text.includes('all attributes')) return false;
    if (hasTotalDex && /\bto\b.+\bdexterity\b/.test(text) && !text.includes('all attributes')) return false;
    if (hasTotalInt && /\bto\b.+\bintelligence\b/.test(text) && !text.includes('all attributes')) return false;
    return true;
  });
}

function rangeMatches(values, range) {
  if (!range) return true;
  if (!values.length) return false;
  const hasMin = typeof range.min === 'number' && Number.isFinite(range.min);
  const hasMax = typeof range.max === 'number' && Number.isFinite(range.max);
  if (!hasMin && !hasMax) return true;
  if (hasMin && hasMax && values.length >= 2) return values[0] >= Number(range.min) && values[1] >= Number(range.max);
  const upper = Math.max(...values);
  if (hasMin && upper < Number(range.min)) return false;
  if (hasMax && upper > Number(range.max)) return false;
  return true;
}

function buildTradeQuery(item, options, statFilters) {
  const listingMode = normalizeListingMode(options?.listingMode);
  const query = { status: { option: toStatusOptionFromListingMode(listingMode) } };
  const frameType = toNumber(item?.frameType);
  const itemName = safeString(item?.name);
  const itemType = safeString(item?.typeLine || item?.baseType || itemName);
  const useBaseType = toBoolean(options?.useBaseType);
  const tradeCategory = inferTradeCategory(item);
  const rarityOption = inferRarityFilter(frameType);
  if (frameType === 3) {
    const uniqueName = itemName || safeString(item?.baseType) || safeString(item?.typeLine);
    if (uniqueName) query.name = uniqueName;
    if (itemType) query.type = itemType;
  } else if (useBaseType && itemType) {
    query.type = itemType;
  }
  const filters = {};
  const miscFilters = {};
  const socketFilters = {};
  if (toBoolean(options?.useItemLevel)) {
    const ilvl = toNumber(item?.ilvl);
    if (ilvl && ilvl > 0) miscFilters.ilvl = { min: Math.max(1, ilvl - 5), max: ilvl + 5 };
  }
  if (toBoolean(options?.useQuality)) {
    const quality = toNumber(item?.quality);
    if (quality && quality > 0) miscFilters.quality = { min: Math.max(1, Math.floor(quality) - 2) };
  }
  const sockets = asArray(item?.sockets);
  if (toBoolean(options?.useSockets) && sockets.length > 0) socketFilters.sockets = { min: sockets.length };
  if (toBoolean(options?.useLinks) && sockets.length > 0) {
    const maxLink = calculateMaxLink(sockets);
    if (maxLink > 0) socketFilters.links = { min: maxLink };
  }
  const typeFilters = {};
  if (tradeCategory) typeFilters.category = { option: tradeCategory };
  if (rarityOption) typeFilters.rarity = { option: rarityOption };
  if (Object.keys(typeFilters).length > 0) filters.type_filters = { filters: typeFilters };
  if (Object.keys(miscFilters).length > 0) filters.misc_filters = { filters: miscFilters };
  if (Object.keys(socketFilters).length > 0) filters.socket_filters = { filters: socketFilters };
  if (Object.keys(filters).length > 0) query.filters = filters;
  if (asArray(statFilters).length > 0) query.stats = [{ type: 'and', filters: statFilters }];
  return query;
}

function buildWeaponTradeQuery(item, options) {
  const weaponFilters = buildWeaponTradeFilters(item);
  if (!weaponFilters) return null;
  const query = buildTradeQuery(item, options, []);
  const queryFilters = asObject(query.filters) || {};
  queryFilters.weapon_filters = { filters: weaponFilters };
  query.filters = queryFilters;
  return query;
}

function invertRangeForOppositeStat(range) {
  const hasMin = typeof range?.min === 'number' && Number.isFinite(range.min);
  const hasMax = typeof range?.max === 'number' && Number.isFinite(range.max);
  if (!hasMin && !hasMax) return null;
  if (hasMin && hasMax) {
    const min = -Number(range.max);
    const max = -Number(range.min);
    return min <= max ? { min, max } : { min: max, max: min };
  }
  if (hasMin) return { max: -Number(range.min) };
  return { min: -Number(range.max) };
}

function getStatPrefixPreference(type) {
  switch (safeString(type).toLowerCase()) {
    case 'pseudo': return ['pseudo', 'explicit', 'implicit', 'crafted', 'fractured', 'veiled', 'enchant'];
    case 'implicit': return ['implicit', 'explicit', 'pseudo'];
    case 'crafted': return ['crafted', 'explicit', 'pseudo'];
    case 'fractured': return ['fractured', 'explicit', 'pseudo'];
    case 'enchant': return ['enchant', 'explicit', 'pseudo'];
    case 'veiled': return ['veiled', 'explicit', 'pseudo'];
    case 'utility': return ['explicit', 'pseudo', 'implicit'];
    case 'explicit':
    default:
      return ['explicit', 'pseudo', 'implicit', 'crafted', 'fractured', 'veiled', 'enchant'];
  }
}

function textMentionsLocal(value) { return /\blocal\b/i.test(value); }
function textMentionsGlobal(value) { return /\bglobal\b/i.test(value); }

function getLocalityPreferenceRank(modText, candidate) {
  const modValue = safeString(modText);
  const candidateValue = `${safeString(candidate?.text)} ${safeString(candidate?.id)}`;
  const modWantsLocal = textMentionsLocal(modValue);
  const modWantsGlobal = textMentionsGlobal(modValue);
  const candidateIsLocal = textMentionsLocal(candidateValue);
  const candidateIsGlobal = textMentionsGlobal(candidateValue);
  if (modWantsLocal) return candidateIsLocal ? 0 : 5;
  if (modWantsGlobal) {
    if (candidateIsGlobal) return 0;
    if (candidateIsLocal) return 5;
    return 1;
  }
  if (candidateIsLocal) return 4;
  return 0;
}

function buildTradeStatPatternCandidates(mod) {
  const basePattern = normalizeTradeStatPattern(mod?.text);
  const candidates = [];
  if (basePattern) candidates.push({ pattern: basePattern, range: mod?.range });
  const sourceText = safeString(mod?.text);
  if (!sourceText) return candidates;
  const inverseText = sourceText.replace(/\breduced\b/gi, 'increased').replace(/\bdecreased\b/gi, 'increased').replace(/\bless\b/gi, 'more').replace(/\bslower\b/gi, 'faster');
  if (inverseText === sourceText) return candidates;
  const inversePattern = normalizeTradeStatPattern(inverseText);
  if (!inversePattern || inversePattern === basePattern) return candidates;
  candidates.push({ pattern: inversePattern, range: invertRangeForOppositeStat(mod?.range) });
  return candidates;
}

function buildRequestError(status, text) {
  const error = new Error(`Trade API request failed (${status}): ${text || 'no body'}`);
  error.status = status;
  error.body = text;
  return error;
}

async function wait(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleTradeRequest() {
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const previous = tradeRequestChain;
  tradeRequestChain = ready;
  await previous;
  const delayMs = Math.max(0, nextTradeRequestAt - Date.now());
  if (delayMs > 0) await wait(delayMs);
  nextTradeRequestAt = Date.now() + Math.max(0, Math.floor(TRADE_MIN_INTERVAL_MS));
  resolveReady();
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRADE_REQUEST_TIMEOUT_MS);
  try {
    await scheduleTradeRequest();
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': TRADE_USER_AGENT,
        ...(init?.headers || {}),
      },
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw buildRequestError(response.status, text);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadTradeStatsCatalog() {
  const now = Date.now();
  if (cachedTradeStats && now - cachedTradeStatsAt < RULES_CACHE_TTL_MS) return cachedTradeStats;
  const payload = await fetchJson(`${TRADE_API_BASE_URL}/data/stats`, { method: 'GET' });
  const root = asObject(payload) || {};
  const groups = asArray(root.result);
  const byPattern = new Map();
  const pseudoStats = [];
  const seenPseudo = new Set();
  for (const group of groups) {
    for (const entry of asArray(group?.entries)) {
      const id = safeString(entry?.id);
      const text = safeString(entry?.text);
      if (!id || !text) continue;
      const pattern = normalizeTradeStatPattern(text);
      if (!pattern) continue;
      const prefix = safeString(id.split('.')[0] || 'explicit') || 'explicit';
      const descriptor = { id, text, prefix, type: safeString(entry?.type) || prefix };
      const existing = byPattern.get(pattern) || [];
      existing.push(descriptor);
      byPattern.set(pattern, existing);
      if (id.startsWith('pseudo.') && !seenPseudo.has(id)) {
        seenPseudo.add(id);
        pseudoStats.push({ id, text, prefix, type: safeString(entry?.type) || prefix });
      }
    }
  }
  pseudoStats.sort((a, b) => a.text.localeCompare(b.text, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  cachedTradeStats = { byPattern, pseudoStats };
  cachedTradeStatsAt = now;
  return cachedTradeStats;
}

async function buildTradeStatFilters(selectedMods) {
  if (!selectedMods.length) return [];
  const catalog = await loadTradeStatsCatalog();
  const output = [];
  const dedup = new Set();
  for (const mod of selectedMods) {
    const explicitStatId = safeString(mod?.statId);
    if (explicitStatId && !dedup.has(explicitStatId)) {
      const explicitFilter = { id: explicitStatId, disabled: false };
      const explicitValue = buildTradeStatValue(mod?.range);
      if (explicitValue) explicitFilter.value = explicitValue;
      output.push(explicitFilter);
      dedup.add(explicitStatId);
      continue;
    }
    const patternCandidates = buildTradeStatPatternCandidates(mod);
    if (!patternCandidates.length) continue;
    const preference = getStatPrefixPreference(mod?.type);
    let picked = null;
    let pickedRange = mod?.range;
    for (const patternCandidate of patternCandidates) {
      const statsCandidates = catalog.byPattern.get(patternCandidate.pattern) || [];
      if (!statsCandidates.length) continue;
      const ranked = statsCandidates.map((candidate) => ({
        candidate,
        prefixRank: (() => {
          const index = preference.indexOf(candidate.prefix);
          return index === -1 ? 999 : index;
        })(),
        localityRank: getLocalityPreferenceRank(mod?.text, candidate),
      })).sort((a, b) => a.prefixRank - b.prefixRank || a.localityRank - b.localityRank);
      const available = ranked.find((entry) => !dedup.has(entry.candidate.id))?.candidate;
      if (!available) continue;
      picked = available;
      pickedRange = patternCandidate.range;
      break;
    }
    if (!picked || dedup.has(picked.id)) continue;
    const filter = { id: picked.id, disabled: false };
    const value = buildTradeStatValue(pickedRange);
    if (value) filter.value = value;
    output.push(filter);
    dedup.add(picked.id);
  }
  return output;
}

function inferPseudoFallbackStatId(modText) {
  const text = safeString(modText).toLowerCase();
  if (!text) return null;
  if (text.includes('maximum energy shield')) return 'pseudo.pseudo_total_energy_shield';
  if (text.includes('maximum life')) return 'pseudo.pseudo_total_life';
  if (text.includes('maximum mana')) return 'pseudo.pseudo_total_mana';
  return null;
}

function buildPseudoFallbackStatFilters(selectedMods, existingFilterIds) {
  if (!selectedMods.length) return [];
  const output = [];
  const dedup = new Set(asArray(existingFilterIds).map((id) => safeString(id)));
  for (const mod of selectedMods) {
    const pseudoId = inferPseudoFallbackStatId(mod?.text);
    if (!pseudoId || dedup.has(pseudoId)) continue;
    const filter = { id: pseudoId, disabled: false };
    const value = buildTradeStatValue(mod?.range);
    if (value) filter.value = value;
    output.push(filter);
    dedup.add(pseudoId);
  }
  return output;
}

async function tradeSearch(league, query) {
  const payload = await fetchJson(`${TRADE_API_BASE_URL}/search/${encodeURIComponent(league)}`, {
    method: 'POST',
    body: JSON.stringify({ query, sort: { price: 'asc' } }),
  });
  const obj = asObject(payload) || {};
  const id = safeString(obj.id);
  const result = asArray(obj.result).map((entry) => safeString(entry)).filter(Boolean);
  if (!id) throw new Error('Trade search did not return a query id');
  return { id, result };
}

async function tradeFetch(queryId, ids) {
  const output = [];
  for (let index = 0; index < ids.length; index += TRADE_FETCH_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + TRADE_FETCH_CHUNK_SIZE);
    const payload = await fetchJson(`${TRADE_API_BASE_URL}/fetch/${chunk.join(',')}?query=${encodeURIComponent(queryId)}`, { method: 'GET' });
    const obj = asObject(payload) || {};
    output.push(...asArray(obj.result));
  }
  return output;
}

function listingModTexts(entry) {
  const source = asObject(entry?.item) || {};
  return [
    ...toStringArray(source.implicitMods),
    ...toStringArray(source.explicitMods),
    ...toStringArray(source.craftedMods),
    ...toStringArray(source.fracturedMods),
    ...toStringArray(source.enchantMods),
    ...toStringArray(source.veiledMods),
  ];
}

function listingMatchesSelection(entry, selectedMods) {
  if (!selectedMods.length) return true;
  const mods = listingModTexts(entry);
  if (!mods.length) return false;
  for (const selected of selectedMods) {
    const targetPattern = normalizeModPattern(selected?.text);
    const matched = mods.find((modText) => normalizeModPattern(modText) === targetPattern && rangeMatches(extractNumbers(modText), selected?.range));
    if (!matched) return false;
  }
  return true;
}

function toTradePriceRows(entries, chaosRates) {
  const rows = [];
  for (const entry of entries) {
    const price = asObject(entry?.listing?.price);
    const amount = toNumber(price?.amount);
    const currency = safeString(price?.currency);
    if (!amount || !currency) continue;
    const chaos = toChaosValue(amount, currency, chaosRates);
    if (chaos === null || chaos <= 0) continue;
    rows.push({ amount, currency, chaos: Number(chaos.toFixed(4)) });
  }
  return rows.sort((a, b) => a.chaos - b.chaos);
}

function buildTradeUrl(league, queryId) {
  if (!queryId) return null;
  return `${TRADE_SITE_BASE_URL}/${encodeURIComponent(league)}/${queryId}`;
}

async function priceNetworthItemFromClientTrade({ itemInput, leagueInput, optionsInput, pricingConfig, chaosRates, logger }) {
  const item = asObject(itemInput) || {};
  const league = normalizeLeague(leagueInput);
  const options = asObject(optionsInput) || {};
  const listingMode = normalizeListingMode(options.listingMode);
  const statusOption = toStatusOptionFromListingMode(listingMode);
  const queueMode = toBoolean(options.queueMode);
  const allItemMods = extractItemMods(item);
  const forcedMods = normalizeForcedMods(options.forcedMods);
  const rulesByCategory = asObject(pricingConfig?.rules) || {};
  const rulesCategory = chooseRulesCategory(item, pricingConfig);
  const selectedMods = forcedMods.length > 0 ? prioritizePseudoSelections(forcedMods) : selectModsFromRules(allItemMods, pricingConfig, rulesCategory);
  const mergedChaosRates = {
    ...DEFAULT_CURRENCY_CHAOS_RATES,
    ...(asObject(chaosRates) || {}),
  };
  const chaosPerDivine = Number.isFinite(mergedChaosRates.divine) && mergedChaosRates.divine > 0 ? mergedChaosRates.divine : DIVINE_RATE;
  const tradeStatFilters = await buildTradeStatFilters(selectedMods);
  const tradeCategory = inferTradeCategory(item);
  const preferWeaponDpsSearch = shouldPreferWeaponDpsSearch(item, tradeCategory, selectedMods);
  const weaponQuery = preferWeaponDpsSearch ? buildWeaponTradeQuery(item, options) : null;
  const query = weaponQuery || buildTradeQuery(item, options, tradeStatFilters);
  logger?.info?.('networth:pricing:direct-trade-search', {
    league,
    preferWeaponDpsSearch,
    item: {
      name: safeString(item.name),
      typeLine: safeString(item.typeLine),
      baseType: safeString(item.baseType),
      frameType: toNumber(item.frameType),
      ilvl: toNumber(item.ilvl),
    },
  });
  const fetchLimit = queueMode ? Math.max(1, Math.min(TRADE_FETCH_CHUNK_SIZE, TRADE_FETCH_LIMIT_QUEUE)) : Math.max(0, TRADE_FETCH_LIMIT);
  const search = await tradeSearch(league, query);
  let activeQueryId = search.id;
  const targetIds = search.result.slice(0, fetchLimit);
  let fetchedEntries = targetIds.length > 0 ? await tradeFetch(search.id, targetIds) : [];
  let usedWeaponDpsSearch = Boolean(weaponQuery);
  if (usedWeaponDpsSearch && fetchedEntries.length === 0) {
    const modQuery = buildTradeQuery(item, options, tradeStatFilters);
    const modSearch = await tradeSearch(league, modQuery);
    const modTargetIds = modSearch.result.slice(0, fetchLimit);
    fetchedEntries = modTargetIds.length > 0 ? await tradeFetch(modSearch.id, modTargetIds) : [];
    activeQueryId = modSearch.id;
    usedWeaponDpsSearch = false;
  }
  let usedPseudoFallbackSearch = false;
  if (!queueMode && !usedWeaponDpsSearch && fetchedEntries.length === 0 && selectedMods.length > 0) {
    const existingStatIds = tradeStatFilters.map((entry) => safeString(entry?.id)).filter(Boolean);
    const pseudoFallbackFilters = buildPseudoFallbackStatFilters(selectedMods, existingStatIds);
    if (pseudoFallbackFilters.length > 0) {
      const pseudoQuery = buildTradeQuery(item, options, pseudoFallbackFilters);
      const pseudoSearch = await tradeSearch(league, pseudoQuery);
      const pseudoTargetIds = pseudoSearch.result.slice(0, fetchLimit);
      const pseudoEntries = pseudoTargetIds.length > 0 ? await tradeFetch(pseudoSearch.id, pseudoTargetIds) : [];
      if (pseudoEntries.length > 0) {
        fetchedEntries = pseudoEntries;
        activeQueryId = pseudoSearch.id;
        usedPseudoFallbackSearch = true;
      }
    }
  }
  const strictEntries = usedWeaponDpsSearch ? fetchedEntries : fetchedEntries.filter((entry) => listingMatchesSelection(entry, selectedMods));
  const strictRows = toTradePriceRows(strictEntries, mergedChaosRates);
  const allowBroadFallback = !usedWeaponDpsSearch;
  const fallbackEntries = strictRows.length === 0 && selectedMods.length > 0 && allowBroadFallback ? fetchedEntries : strictEntries;
  const allRows = toTradePriceRows(fallbackEntries, mergedChaosRates);
  const computation = computePrice(allRows, chaosPerDivine);
  const allMods = allItemMods.map((mod) => ({
    ...mod,
    selected: selectedMods.some((entry) => normalizeModPattern(entry.text) === normalizeModPattern(mod.text)),
    enabled: selectedMods.some((entry) => normalizeModPattern(entry.text) === normalizeModPattern(mod.text)),
  }));
  const resultSelectedMods = usedWeaponDpsSearch ? [] : selectedMods;
  const usedFallback = strictRows.length === 0 && selectedMods.length > 0 && allRows.length > 0 && allowBroadFallback;
  const usedAnyFallback = usedFallback || usedPseudoFallbackSearch;
  if (!computation) {
    return {
      estimated: false,
      chaos: 0,
      divine: 0,
      confidence: 'none',
      sampleSize: allRows.length,
      range: null,
      selectedMods: resultSelectedMods,
      allMods,
      priceDetails: { all: allRows, usedForAverage: [] },
      tradeUrl: buildTradeUrl(league, activeQueryId),
      source: usedWeaponDpsSearch ? 'direct_trade_weapon_dps' : usedAnyFallback ? 'direct_trade_fallback' : 'direct_trade',
      serverPricingAvailable: true,
      listingMode,
      statusOption,
      error: allRows.length === 0 ? 'No comparable listings found (including fallback search)' : 'Unable to compute price',
    };
  }
  return {
    estimated: true,
    chaos: computation.chaos,
    divine: computation.divine,
    confidence: usedAnyFallback ? 'low' : computation.confidence,
    sampleSize: computation.sampleSize,
    range: computation.range,
    selectedMods: resultSelectedMods,
    allMods,
    priceDetails: { all: allRows, usedForAverage: computation.usedForAverage },
    tradeUrl: buildTradeUrl(league, activeQueryId),
    source: usedWeaponDpsSearch ? 'direct_trade_weapon_dps' : usedAnyFallback ? 'direct_trade_fallback' : 'direct_trade',
    serverPricingAvailable: true,
    listingMode,
    statusOption,
  };
}

module.exports = {
  priceNetworthItemFromClientTrade,
};

(() => {
if (window.__simplexBuildOverlayInitialized) {
  console.warn('[BUILD_OVERLAY] already initialized, skipping duplicate load')
  return
}
window.__simplexBuildOverlayInitialized = true

const ipcRenderer = window.buildOverlayAPI?.ipcRenderer
const appConfig = window.buildOverlayAPI?.getPublicConfig?.() || {}
const { TreePreviewRenderer } = window
console.log('[BUILD_OVERLAY] script loaded', {
  hasBridge: !!ipcRenderer,
  hasInvoke: !!ipcRenderer?.invoke,
  hasTreePreviewRenderer: typeof TreePreviewRenderer === 'function',
})

function invokeWithTimeout(channel, ...args) {
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    return Promise.reject(new Error('Build overlay IPC bridge is unavailable.'))
  }
  const timeoutMs = 12000
  return Promise.race([
    ipcRenderer.invoke(channel, ...args),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timed out (${timeoutMs}ms): ${channel}`)), timeoutMs)
    }),
  ])
}

let currentUser = null
let builds = []
let followedBuilds = []
let publicGuideBuilds = []
let publicLiveBuilds = []
let followedBuildIds = new Set()
let currentBuildData = null
let activeRunBuildId = null
let guideTopTab = 'general'
let activeGuideSectionId = null
let activeGuideLiveBlockId = null
let activeGuideBuildType = 'guide'
let cachedGuideBlocks = []
let cachedGuideGearByBlock = {}
let cachedGuideNotesByScope = {}
let cachedGuideExtraBlocksByBlockId = {}
let cachedGuideTreeBySection = {}
let cachedGuideTreeLabels = {}
let cachedGuideGeneral = null
let guideTreeStepBySection = {}
let guideTreeViewModeBySection = {}
let activeGuideTree = null

let gearItemsBySlug = {}
let gearItemsLoading = false
let gearItemsError = null
let gearLoadSeq = 0
const gearItemCache = new Map()

function seedGearItemCache(rows) {
  normalizeArray(rows).forEach((item) => {
    if (item && item.slug) {
      gearItemCache.set(String(item.slug), item)
    }
  })
}


const SOCKET_IMG = {
  blue: '../assets/assets/skills/socket-blue.png',
  green: '../assets/assets/skills/socket-green.png',
  red: '../assets/assets/skills/socket-red.png',
  white: '../assets/assets/skills/socket-white.png',
}
const LINK_IMG = '../assets/assets/skills/link-gold.png'
const GEM_ICON_OFFSET = { x: 0, y: -2 }
const LINK_OVERLAP_LEFT_PX_DEFAULT = 5
const LINK_OVERLAP_RIGHT_PX_DEFAULT = 5

const EMPTY_SOCKET = {
  id: 'empty',
  color: 'white',
  name: 'Empty',
  type: 'empty',
  icon: null,
  itemSlot: 'any',
  socketColorOverride: null,
  level: null,
  quality: null,
}

const SLOT_LABELS = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  helm: 'Helm',
  body: 'Body Armour',
  amulet: 'Amulet',
  ring1: 'Ring',
  ring2: 'Ring',
  belt: 'Belt',
  gloves: 'Gloves',
  boots: 'Boots',
  flask1: 'Flask',
  flask2: 'Flask',
  flask3: 'Flask',
  flask4: 'Flask',
  flask5: 'Flask',
}

const SLOT_ORDER = [
  'weapon',
  'offhand',
  'helm',
  'body',
  'amulet',
  'ring1',
  'ring2',
  'belt',
  'gloves',
  'boots',
  'flask1',
  'flask2',
  'flask3',
  'flask4',
  'flask5',
]

for (let i = 1; i <= 8; i += 1) {
  const jewelId = `jewel-${i}`
  SLOT_LABELS[jewelId] = 'Jewel'
  SLOT_ORDER.push(jewelId)
}

const DEFAULT_PAPERDOLL_SLOTS = [
  {
    id: 'weapon',
    label: 'Weapon',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 4 },
    position: { col: 1, row: 2 },
  },
  {
    id: 'offhand',
    label: 'Offhand',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 4 },
    position: { col: 11, row: 2 },
  },
  {
    id: 'helm',
    label: 'Helm',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 2 },
    position: { col: 6, row: 2 },
  },
  {
    id: 'body',
    label: 'Body Armour',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 3 },
    position: { col: 6, row: 4 },
  },
  {
    id: 'amulet',
    label: 'Amulet',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 1 },
    position: { col: 9, row: 3 },
  },
  {
    id: 'ring1',
    label: 'Ring',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 1 },
    position: { col: 4, row: 4 },
  },
  {
    id: 'ring2',
    label: 'Ring',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 1 },
    position: { col: 9, row: 4 },
  },
  {
    id: 'belt',
    label: 'Belt',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 1 },
    position: { col: 6, row: 7 },
  },
  {
    id: 'gloves',
    label: 'Gloves',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 2 },
    position: { col: 3, row: 6 },
  },
  {
    id: 'boots',
    label: 'Boots',
    icon: null,
    rarity: 'normal',
    size: { w: 2, h: 2 },
    position: { col: 8, row: 6 },
  },
  {
    id: 'flask1',
    label: 'Flask',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 2 },
    position: { col: 4, row: 9 },
  },
  {
    id: 'flask2',
    label: 'Flask',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 2 },
    position: { col: 5, row: 9 },
  },
  {
    id: 'flask3',
    label: 'Flask',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 2 },
    position: { col: 6, row: 9 },
  },
  {
    id: 'flask4',
    label: 'Flask',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 2 },
    position: { col: 7, row: 9 },
  },
  {
    id: 'flask5',
    label: 'Flask',
    icon: null,
    rarity: 'normal',
    size: { w: 1, h: 2 },
    position: { col: 8, row: 9 },
  },
  ...Array.from({ length: 8 }).map((_, idx) => ({
    id: `jewel-${idx + 1}`,
    label: 'Jewel',
    rarity: 'normal',
    size: { w: 1, h: 1 },
    position: { col: idx + 3, row: 12 },
  })),
]

const BANDIT_LABELS = {
  kill_all: 'Kill all',
  alira: 'Help Alira',
  oak: 'Help Oak',
  kraityn: 'Help Kraityn',
}

const BANDIT_POINTS = {
  kill_all: 2,
  alira: 0,
  oak: 0,
  kraityn: 0,
}

const PASSIVE_POINT_BONUS_MILESTONES = [
  { level: 6, bonusPoints: 1 },
  { level: 12, bonusPoints: 1 },
  { level: 18, bonusPoints: 2 },
  { level: 26, bonusPoints: 1 },
  { level: 30, bonusPoints: 1 },
  { level: 35, bonusPoints: 1 },
  { level: 41, bonusPoints: 1 },
  { level: 44, bonusPoints: 1 },
  { level: 46, bonusPoints: 1 },
  { level: 47, bonusPoints: 1 },
  { level: 48, bonusPoints: 1 },
  { level: 53, bonusPoints: 2 },
  { level: 54, bonusPoints: 1 },
  { level: 57, bonusPoints: 2 },
  { level: 58, bonusPoints: 1 },
  { level: 61, bonusPoints: 1 },
  { level: 63, bonusPoints: 1 },
  { level: 66, bonusPoints: 1 },
  { level: 67, bonusPoints: 1 },
]

const userStatus = document.getElementById('userStatus')
const buildsList = document.getElementById('buildsList')
const buildSelector = document.getElementById('buildSelector')
const buildDetails = document.getElementById('buildDetails')
const activeRunGuideName = document.getElementById('activeRunGuideName')
const backBtn = document.getElementById('backBtn')
const buildTabDiscover = document.getElementById('buildTabDiscover')
const buildTabMine = document.getElementById('buildTabMine')
const buildTabFollowing = document.getElementById('buildTabFollowing')
const discoverFilters = document.getElementById('discoverFilters')
const discoverSearchInput = document.getElementById('discoverSearchInput')
const discoverTypeFilter = document.getElementById('discoverTypeFilter')
const discoverClassFilter = document.getElementById('discoverClassFilter')
const discoverSkillFilter = document.getElementById('discoverSkillFilter')
let activeBuildTab = 'mine'

const buildName = document.getElementById('buildName')
const buildStatus = document.getElementById('buildStatus')
const buildDate = document.getElementById('buildDate')
const guideTopTabs = document.getElementById('guideTopTabs')
const guideTopHint = document.getElementById('guideTopHint')
const guideOverview = document.getElementById('guideOverview')
const guideSections = document.getElementById('guideSections')
const guideLiveView = document.getElementById('guideLiveView')
const guideSidebarImage = document.getElementById('guideSidebarImage')
const guideSidebarTitle = document.getElementById('guideSidebarTitle')
const guideSidebarCreator = document.getElementById('guideSidebarCreator')

function clearEl(el) {
  if (el) el.innerHTML = ''
}

function createEl(tag, className, text) {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

function syncBuildTabs() {
  if (buildTabDiscover) buildTabDiscover.classList.toggle('active', activeBuildTab === 'discover')
  if (buildTabMine) buildTabMine.classList.toggle('active', activeBuildTab === 'mine')
  if (buildTabFollowing) buildTabFollowing.classList.toggle('active', activeBuildTab === 'following')
}

function setActiveBuildTab(tab) {
  activeBuildTab = tab
  syncBuildTabs()
  syncDiscoverFiltersVisibility()
  renderBuildsList()
}

function toString(value) {
  return typeof value === 'string' ? value : ''
}

function renderBuildsListError(message) {
  buildsList.textContent = ''
  buildsList.appendChild(createEl('div', 'error-state', `Error: ${toString(message) || 'Unknown error'}`))
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

const DISCOVER_RATING_FIELDS = [
  ['Difficulty', 'Diff'],
  ['Budget', 'Budget'],
  ['Mapping', 'Map'],
  ['Bossing', 'Boss'],
  ['Defence', 'Def'],
  ['# Buttons', 'Btns'],
]
const DISCOVER_IMAGE_FALLBACK = 'https://simplex.gg/tree-assets/poe-background.png'

function resolveDiscoverImageUrl(build) {
  const candidates = [
    build?.imageUrl,
    build?.image_url,
    build?.image,
    build?.thumbnailUrl,
    build?.thumbnail_url,
  ]
  const preferredBase = toString(appConfig?.publicBaseUrl).trim() || 'https://simplex.gg'

  for (const raw of candidates) {
    const value = toString(raw).trim()
    if (!value) continue
    if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return value
    if (value.startsWith('//')) return `https:${value}`
    if (value.startsWith('/')) {
      try {
        return new URL(value, preferredBase).toString()
      } catch {
        continue
      }
    }
    if (value.startsWith('./') || value.startsWith('../')) continue
    try {
      return new URL(`/${value.replace(/^\/+/, '')}`, preferredBase).toString()
    } catch {
      continue
    }
  }

  return DISCOVER_IMAGE_FALLBACK
}

function discoverBuildType(build) {
  const type = normalizeLookup(build?._discoverType || build?.buildType || build?.build_type)
  return type === 'live' ? 'live' : 'guide'
}

function parseLevelValue(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseLiveLevelFromBlockId(value) {
  const raw = toString(value).trim().toLowerCase()
  if (!raw) return null
  const match = raw.match(/live-level-(\d+)/)
  if (!match) return null
  return parseLevelValue(match[1])
}

function getMaxLevelFromBlocks(blocks) {
  let maxLevel = null
  normalizeArray(blocks).forEach((block) => {
    if (!block || typeof block !== 'object') return
    const candidates = [
      block?.levelRange?.max,
      block?.levelRange?.min,
      block?.level_range?.max,
      block?.level_range?.min,
      block?.metadata?.level,
      parseLiveLevelFromBlockId(block?.id),
      parseLiveLevelFromBlockId(block?.client_id),
      parseLiveLevelFromBlockId(block?.metadata?.sectionId),
      parseLiveLevelFromBlockId(block?.metadata?.section_id),
    ]
    candidates.forEach((candidate) => {
      const level = parseLevelValue(candidate)
      if (!Number.isFinite(level)) return
      if (!Number.isFinite(maxLevel) || level > maxLevel) maxLevel = level
    })
  })
  return maxLevel
}

function getBlockLiveLevel(block, fallbackIndex = 0) {
  const candidates = [
    block?.levelRange?.max,
    block?.levelRange?.min,
    block?.level_range?.max,
    block?.level_range?.min,
    block?.metadata?.level,
    parseLiveLevelFromBlockId(block?.id),
    parseLiveLevelFromBlockId(block?.client_id),
    parseLiveLevelFromBlockId(block?.metadata?.sectionId),
    parseLiveLevelFromBlockId(block?.metadata?.section_id),
  ]
  for (const candidate of candidates) {
    const parsed = parseLevelValue(candidate)
    if (parsed != null) return parsed
  }
  return fallbackIndex + 1
}

function getLiveSectionsFromBlocks(blocks) {
  return normalizeArray(blocks)
    .map((block, index) => ({
      block,
      level: getBlockLiveLevel(block, index),
      index,
      id: toString(block?.id),
    }))
    .sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level
      return a.index - b.index
    })
}

function hasRenderableSockets(chain) {
  return normalizeArray(chain?.sockets).some((gem) => gem && gem.type !== 'empty' && toString(gem.name).trim())
}

function findBuildById(buildId) {
  if (!buildId) return null
  const id = toString(buildId)
  const fromCurrent = currentBuildData?.build && toString(currentBuildData.build.id) === id
    ? currentBuildData.build
    : null
  if (fromCurrent) return fromCurrent
  const all = [...normalizeArray(builds), ...normalizeArray(followedBuilds), ...normalizeArray(publicGuideBuilds), ...normalizeArray(publicLiveBuilds)]
  return all.find((entry) => toString(entry?.id) === id) || null
}

function resolveBuildTypeFromData(buildData, fallbackBuild = null) {
  const rawType = normalizeLookup(buildData?.build?.build_type || buildData?.build?.buildType)
  if (rawType === 'live') return 'live'
  if (rawType === 'guide') return 'guide'
  return discoverBuildType(fallbackBuild || buildData?.build || null)
}

let liveRunRefreshInFlight = false
let liveRunRefreshStartedAt = 0

async function refreshActiveRunBuildIfNeeded(options = {}) {
  const buildId = toString(activeRunBuildId)
  if (!buildId) return

  const reason = toString(options.reason) || 'unknown'
  const playerLevel = Number.isFinite(options.playerLevel) ? Number(options.playerLevel) : null
  const force = options.force === true

  const buildEntry = findBuildById(buildId)
  const currentType = resolveBuildTypeFromData(currentBuildData, buildEntry)
  if (currentType !== 'live' && !force) return

  const currentMaxLevel = getMaxLevelFromBlocks(cachedGuideBlocks)
  if (!force && Number.isFinite(playerLevel) && Number.isFinite(currentMaxLevel) && currentMaxLevel > playerLevel + 4) {
    console.debug('[Build Overlay] Skip live refresh (build too far ahead)', {
      reason,
      buildId,
      playerLevel,
      currentMaxLevel,
    })
    return
  }

  const now = Date.now()
  if (liveRunRefreshInFlight) return
  if (!force && now - liveRunRefreshStartedAt < 800) return

  liveRunRefreshInFlight = true
  liveRunRefreshStartedAt = now

  try {
    const result = await invokeWithTimeout('api:get-build', buildId)
    if (!result?.success || !result?.data) {
      throw new Error(result?.error || 'Failed to refresh live build')
    }

    const nextData = result.data
    const nextType = resolveBuildTypeFromData(nextData, buildEntry)
    if (nextType !== 'live') return

    const snapshot = nextData?.publishedVersion?.snapshot
    const skillBlocksSource = Array.isArray(snapshot?.skillBlocks) ? snapshot.skillBlocks : nextData?.skillBlocks
    const nextBlocks = normalizeSkillBlocks(skillBlocksSource)
    const nextMaxLevel = getMaxLevelFromBlocks(nextBlocks)
    if (!force && Number.isFinite(playerLevel) && Number.isFinite(nextMaxLevel) && nextMaxLevel > playerLevel + 4) {
      console.debug('[Build Overlay] Skip live refresh after fetch (build too far ahead)', {
        reason,
        buildId,
        playerLevel,
        nextMaxLevel,
      })
      return
    }

    currentBuildData = nextData
    await setActiveRunBuild({ id: buildId, name: nextData?.build?.name || buildEntry?.name || '' })
    console.debug('[Build Overlay] Live run refreshed', {
      reason,
      buildId,
      playerLevel,
      previousMaxLevel: currentMaxLevel,
      nextMaxLevel,
    })
  } catch (error) {
    console.warn('[Build Overlay] Failed to refresh live run build:', error)
  } finally {
    liveRunRefreshInFlight = false
  }
}

function stripHtml(value) {
  return toString(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildDiscoverSnippet(html, fallback) {
  const text = stripHtml(html)
  if (!text) return fallback
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []
  const base = sentences
    .map((sentence) => toString(sentence).trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .trim()
  if (!base) return fallback
  if (base.length <= 220) {
    return sentences.length > 2 || base.length < text.length ? `${base}...` : base
  }
  return `${base.slice(0, 217).trim()}...`
}

function formatDiscoverDate(build) {
  const raw = build?.versionUpdatedAt || build?.publishedAt || build?.createdAt || build?.updated_at || build?.created_at
  const stamp = Date.parse(toString(raw))
  if (Number.isNaN(stamp)) return 'Recently'
  return new Date(stamp).toLocaleDateString()
}

function makeDiscoverTag(text) {
  const tag = createEl('span', 'discover-tag', text)
  return tag
}

function makeDiscoverMetric(label, value) {
  const metric = createEl('span', 'discover-metric')
  metric.appendChild(createEl('span', 'discover-metric-label', label))
  metric.appendChild(createEl('span', 'discover-metric-value', value))
  return metric
}

function isDiscoverTab(tab = activeBuildTab) {
  return tab === 'discover'
}

function syncDiscoverFiltersVisibility() {
  if (!discoverFilters) return
  discoverFilters.classList.toggle('hidden', !isDiscoverTab())
}

function normalizeLookup(value) {
  return toString(value).trim().toLowerCase()
}

function toUniqueSorted(values = []) {
  return Array.from(new Set(values.map((value) => toString(value).trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )
}

function syncSelectOptions(selectEl, values, allLabel) {
  if (!selectEl) return
  const previous = selectEl.value || 'all'
  selectEl.innerHTML = ''
  const allOpt = document.createElement('option')
  allOpt.value = 'all'
  allOpt.textContent = allLabel
  selectEl.appendChild(allOpt)
  values.forEach((value) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    selectEl.appendChild(option)
  })
  selectEl.value = values.includes(previous) ? previous : 'all'
}

function getDiscoverSourceList() {
  const taggedGuides = publicGuideBuilds.map((build) => ({ ...build, _discoverType: 'guide' }))
  const taggedLive = publicLiveBuilds.map((build) => ({ ...build, _discoverType: 'live' }))
  return [...taggedGuides, ...taggedLive].sort((a, b) => {
    const aTime = Date.parse(toString(a?.updated_at || a?.created_at || '')) || 0
    const bTime = Date.parse(toString(b?.updated_at || b?.created_at || '')) || 0
    return bTime - aTime
  })
}

function syncDiscoverFilterOptions(sourceList) {
  if (!isDiscoverTab()) return
  const typeFilter = discoverTypeFilter?.value || 'all'
  const typedList = typeFilter === 'all'
    ? sourceList
    : sourceList.filter((build) => discoverBuildType(build) === typeFilter)
  const classes = toUniqueSorted(typedList.map((build) => build?.className))
  const skills = toUniqueSorted(typedList.map((build) => build?.mainSkill))
  syncSelectOptions(discoverClassFilter, classes, 'All classes')
  syncSelectOptions(discoverSkillFilter, skills, 'All skills')
}

function applyDiscoverFilters(sourceList) {
  if (!isDiscoverTab()) return sourceList

  const query = normalizeLookup(discoverSearchInput?.value)
  const typeFilter = discoverTypeFilter?.value || 'all'
  const classFilter = discoverClassFilter?.value || 'all'
  const skillFilter = discoverSkillFilter?.value || 'all'
  const classFilterNorm = normalizeLookup(classFilter)
  const skillFilterNorm = normalizeLookup(skillFilter)

  return sourceList.filter((build) => {
    const buildType = discoverBuildType(build)
    const className = toString(build?.className).trim()
    const mainSkill = toString(build?.mainSkill).trim()
    const typeMatches = typeFilter === 'all' || buildType === typeFilter
    const classMatches = classFilter === 'all' || normalizeLookup(className) === classFilterNorm
    const skillMatches = skillFilter === 'all' || normalizeLookup(mainSkill) === skillFilterNorm
    if (!typeMatches || !classMatches || !skillMatches) return false
    if (!query) return true

    const haystack = [
      buildType,
      build?.name,
      build?.creatorName,
      className,
      build?.ascendancy,
      mainSkill,
      ...(Array.isArray(build?.playstyles) ? build.playstyles : []),
    ]
      .map(normalizeLookup)
      .filter(Boolean)
      .join(' ')

    return haystack.includes(query)
  })
}

const GUIDE_SIDEBAR_FALLBACK = '../assets/tree-assets/poe-background.png'

function toPascalCase(value) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function normalizeClassAssetName(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\\/]+/g, '').replace(/\s+/g, ' ').trim()
}

function resolveGuideSidebarImageCandidates(general) {
  const ascendancy = toString(general?.ascendancy)
  const className = toString(general?.class)
  const pick = ascendancy || className
  const raw = normalizeClassAssetName(pick)
  if (!raw) return []
  const candidates = [raw]
  const pascal = toPascalCase(raw)
  if (pascal && pascal !== raw) candidates.push(pascal)
  return candidates.map((name) => `../assets/tree-assets/Classes${name}.png`)
}

function renderGuideSidebarHeader(summary, general) {
  if (guideSidebarTitle) {
    guideSidebarTitle.textContent = summary?.buildName?.trim() || 'Untitled build'
  }

  if (guideSidebarCreator) {
    guideSidebarCreator.textContent = summary?.creatorName ? `by ${summary.creatorName}` : 'by unknown creator'
  }

  if (guideSidebarImage) {
    const candidates = resolveGuideSidebarImageCandidates(general)
    let candidateIndex = 0
    const tryNext = () => {
      if (candidateIndex >= candidates.length) {
        guideSidebarImage.src = GUIDE_SIDEBAR_FALLBACK
        guideSidebarImage.onerror = null
        return
      }
      guideSidebarImage.src = candidates[candidateIndex]
      candidateIndex += 1
    }
    guideSidebarImage.onerror = () => {
      tryNext()
    }
    tryNext()
  }
}

let treeNodeMetaCacheByLeague = {}
let treeNodeMetaLoadingByLeague = {}

function normalizeLeagueId(value) {
  if (typeof value !== 'string') return 'keepers'
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'keepers'
  if (normalized.includes('phrecia') || normalized.includes('phyrecia')) return 'phrecia'
  return 'keepers'
}

function resolveTreeDataPath(leagueId) {
  return leagueId === 'phrecia' ? '../assets/tree-data-phrecia.json' : '../assets/tree-data.json'
}

function resolveAssetUrl(relativePath) {
  return new URL(relativePath, window.location.href).toString()
}

async function loadJson(relativePath) {
  const url = resolveAssetUrl(relativePath)
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Failed to load ${relativePath}`)
  return await response.json()
}

async function loadTreeNodeMetaById(leagueValue) {
  const leagueId = normalizeLeagueId(leagueValue)
  if (treeNodeMetaCacheByLeague[leagueId]) return treeNodeMetaCacheByLeague[leagueId]
  if (treeNodeMetaLoadingByLeague[leagueId]) return treeNodeMetaLoadingByLeague[leagueId]
  treeNodeMetaLoadingByLeague[leagueId] = (async () => {
    try {
      const data = await loadJson(resolveTreeDataPath(leagueId))
      const nodes = data && typeof data.nodes === 'object' ? data.nodes : {}
      const map = {}
      Object.entries(nodes).forEach(([id, node]) => {
        if (!node || typeof node !== 'object') return
        const ascendancyName = typeof node.ascendancyName === 'string' ? node.ascendancyName : null
        map[String(id)] = { ascendancyName }
      })
      treeNodeMetaCacheByLeague[leagueId] = map
      return map
    } catch (error) {
      console.warn('Failed to load tree metadata:', error)
      treeNodeMetaCacheByLeague[leagueId] = {}
      return treeNodeMetaCacheByLeague[leagueId]
    } finally {
      treeNodeMetaLoadingByLeague[leagueId] = null
    }
  })()
  return treeNodeMetaLoadingByLeague[leagueId]
}

function cleanGuideText(value) {
  if (typeof value !== 'string') return ''
  let text = value.replace(/\^[0-9a-z]/gi, '')
  text = text.replace(/[<>]/g, '')
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const normalized = text.replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase()
  if (normalized.startsWith('click here to see gems')) return ''
  return text
}

function formatLabelText(value) {
  const cleaned = cleanGuideText(value)
  if (!cleaned) return ''
  return cleaned
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeTrustedHtml(value) {
  const template = document.createElement('template')
  template.innerHTML = String(value || '')

  const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'])
  const allowedUrlProtocols = new Set(['http:', 'https:'])

  const walk = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node
    const tag = el.tagName.toLowerCase()

    if (blockedTags.has(tag)) {
      el.remove()
      return
    }

    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const valueRaw = attr.value || ''
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        return
      }
      if (name === 'srcdoc') {
        el.removeAttribute(attr.name)
        return
      }
      if (name === 'href' || name === 'src') {
        try {
          const parsed = new URL(valueRaw, window.location.href)
          if (!allowedUrlProtocols.has(parsed.protocol)) {
            el.removeAttribute(attr.name)
          }
        } catch {
          el.removeAttribute(attr.name)
        }
      }
    })

    if (tag === 'a') {
      const target = (el.getAttribute('target') || '').trim().toLowerCase()
      if (target === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer')
      }
    }

    Array.from(el.childNodes).forEach(walk)
  }

  Array.from(template.content.childNodes).forEach(walk)
  return template.innerHTML
}

let hoverTooltipEl = null

function getHoverTooltipEl() {
  if (hoverTooltipEl) return hoverTooltipEl
  hoverTooltipEl = document.createElement('div')
  hoverTooltipEl.className = 'item-tooltip'
  hoverTooltipEl.style.display = 'none'
  document.body.appendChild(hoverTooltipEl)
  return hoverTooltipEl
}

function showHoverTooltip(html, event) {
  if (!html) return
  const el = getHoverTooltipEl()
  el.innerHTML = html
  el.style.display = 'block'
  if (event) positionHoverTooltip(event)
}

function hideHoverTooltip() {
  if (!hoverTooltipEl) return
  hoverTooltipEl.style.display = 'none'
}

function positionHoverTooltip(event) {
  if (!hoverTooltipEl || hoverTooltipEl.style.display === 'none') return
  const offsetX = 16
  const offsetY = 12
  let x = event.clientX + offsetX
  let y = event.clientY - offsetY
  const rect = hoverTooltipEl.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (x + rect.width > vw - 8) {
    x = vw - rect.width - 8
  }
  if (y + rect.height > vh - 8) {
    y = vh - rect.height - 8
  }
  if (y < 0) y = 0
  hoverTooltipEl.style.left = `${x}px`
  hoverTooltipEl.style.top = `${y}px`
}

function attachHoverTooltip(el, getHtml) {
  if (!el) return
  el.addEventListener('mouseenter', (event) => {
    const html = typeof getHtml === 'function' ? getHtml() : getHtml
    if (html) showHoverTooltip(html, event)
  })
  el.addEventListener('mousemove', (event) => {
    positionHoverTooltip(event)
  })
  el.addEventListener('mouseleave', () => {
    hideHoverTooltip()
  })
}

function resolveAssetPath(path) {
  if (typeof path !== 'string' || !path.trim()) return null
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/assets/')) return `../assets/assets/${path.replace('/assets/', '')}`
  if (path.startsWith('assets/')) return `../assets/assets/${path.replace('assets/', '')}`
  if (path.startsWith('/tree-assets/')) return `../assets/tree-assets/${path.replace('/tree-assets/', '')}`
  if (path.startsWith('tree-assets/')) return `../assets/tree-assets/${path.replace('tree-assets/', '')}`
  if (path.startsWith('/')) return `..${path}`
  return path
}

function getMetaFromItems(items) {
  const metaItem = normalizeArray(items).find((item) => item && item.slot === 'meta:general')
  const meta = metaItem && typeof metaItem.metadata === 'object' && metaItem.metadata ? metaItem.metadata : {}
  return meta
}

function mergeGeneralWithFallback(snapshotGeneral, itemGeneral) {
  const base = itemGeneral && typeof itemGeneral === 'object' ? itemGeneral : {}
  const override = snapshotGeneral && typeof snapshotGeneral === 'object' ? snapshotGeneral : {}
  const merged = { ...base, ...override }
  Object.keys(base).forEach((key) => {
    const snapVal = override[key]
    if (snapVal === undefined || snapVal === null || snapVal === '') {
      merged[key] = base[key]
    }
  })
  return merged
}

function mergeMetaWithFallback(snapshotMeta, itemMeta) {
  if (!snapshotMeta || typeof snapshotMeta !== 'object') return itemMeta
  if (!itemMeta || typeof itemMeta !== 'object') return snapshotMeta
  return {
    ...snapshotMeta,
    general: mergeGeneralWithFallback(snapshotMeta.general, itemMeta.general),
  }
}

function normalizeNotesByScope(meta) {
  const notesByBlockId = meta && typeof meta.notesByBlockId === 'object' ? meta.notesByBlockId : {}
  const notesByScope = meta && typeof meta.notesByScope === 'object' ? meta.notesByScope : {}
  const getScope = (key, fallback) => (notesByScope[key] && typeof notesByScope[key] === 'object' ? notesByScope[key] : fallback)

  return {
    skills: getScope('skills', notesByBlockId),
    tree: getScope('tree', {}),
    gear: getScope('gear', {}),
    ascendancy: getScope('ascendancy', {}),
    bloodline: getScope('bloodline', {}),
  }
}

function normalizeGuideExtraBlocks(meta) {
  const rawGuide = meta && typeof meta.guide === 'object' ? meta.guide : null
  const rawExtra = rawGuide && typeof rawGuide.extraBlocksByBlockId === 'object' ? rawGuide.extraBlocksByBlockId : null
  const result = {}

  if (rawExtra) {
    Object.entries(rawExtra).forEach(([blockId, blocksVal]) => {
      if (!blockId || !Array.isArray(blocksVal)) return
      const parsed = blocksVal
        .map((value, idx) => {
          if (!value || typeof value !== 'object') return null
          const id = typeof value.id === 'string' ? value.id : `extra-${blockId}-${idx}`
          const title = typeof value.title === 'string' ? value.title : ''
          const text = typeof value.text === 'string' ? value.text : ''
          return { id, title, text }
        })
        .filter(Boolean)
      if (parsed.length > 0) result[blockId] = parsed
    })
  }

  return result
}

function parseLevelRange(block, meta) {
  const min = toString(meta.levelRangeMin)
  const max = toString(meta.levelRangeMax)
  if (min || max) return { min, max }
  const range = toString(block.level_range)
  if (!range) return { min: '', max: '' }
  const parts = range.split('-')
  if (parts.length === 2) {
    return { min: parts[0].trim(), max: parts[1].trim() }
  }
  return { min: range.trim(), max: '' }
}

function parseLevelValue(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function getOverallLevelRange(blocks) {
  let min = null
  let max = null
  normalizeArray(blocks).forEach((block) => {
    const minVal = parseLevelValue(block?.levelRange?.min)
    const maxVal = parseLevelValue(block?.levelRange?.max)
    if (minVal != null) min = min == null ? minVal : Math.min(min, minVal)
    if (maxVal != null) max = max == null ? maxVal : Math.max(max, maxVal)
  })
  if (min == null || max == null) return null
  return `${min}-${max}`
}

function totalPassivePointsAtLevel(level, banditChoice) {
  const lvl = Number.isFinite(level) ? Math.floor(level) : 1
  const clamped = Math.max(1, Math.min(100, lvl))
  const levelPoints = Math.max(0, clamped - 1)
  const questPoints = PASSIVE_POINT_BONUS_MILESTONES.reduce(
    (sum, milestone) => (clamped >= milestone.level ? sum + milestone.bonusPoints : sum),
    0
  )
  const banditPoints = BANDIT_POINTS[banditChoice] ?? BANDIT_POINTS.kill_all
  return levelPoints + questPoints + banditPoints
}

function normalizeManualTreeBySection(raw) {
  const result = {}
  if (!raw || typeof raw !== 'object') return result

  Object.entries(raw).forEach(([blockId, value]) => {
    if (!blockId || !value || typeof value !== 'object') return
    const order = normalizeArray(value.order)
      .map((id) => (typeof id === 'string' || typeof id === 'number' ? String(id) : null))
      .filter(Boolean)
    const actions = normalizeArray(value.actions)
      .map((action, index) => {
        if (!action || typeof action !== 'object') return null
        const nodeIdRaw = action.nodeId ?? action.node_id
        const nodeId = typeof nodeIdRaw === 'string' || typeof nodeIdRaw === 'number' ? String(nodeIdRaw) : null
        const type = action.type === 'deallocate' ? 'deallocate' : action.type === 'allocate' ? 'allocate' : null
        if (!nodeId || !type) return null
        return { id: typeof action.id === 'string' ? action.id : `action-${blockId}-${index}`, type, nodeId }
      })
      .filter(Boolean)
    result[blockId] = { order, actions }
  })

  return result
}

const BLOODLINE_ASC_NAMES = new Set([
  'aul',
  'breachlord',
  'catarina',
  'delirious',
  'farrul',
  'kinginthemists',
  'lycia',
  'olroth',
  'oshabi',
  'trialmaster',
  'warlock',
  'warden',
  'primalist',
])

function isBloodlineAscendancyName(ascendancyName, bloodline) {
  const asc = (ascendancyName || '').trim().toLowerCase()
  if (!asc) return false
  if (asc.includes('bloodline')) return true
  if (BLOODLINE_ASC_NAMES.has(asc)) return true
  const pickedRaw = (bloodline || '').trim()
  const picked = pickedRaw.replace(/\s*Bloodline$/i, '').trim().toLowerCase()
  if (!picked) return false

  const alias = {
    nameless: 'kinginthemists',
    chaos: 'trialmaster',
  }
  const alt = alias[picked] || null
  return asc === picked || asc.includes(picked) || (alt ? asc === alt || asc.includes(alt) : false)
}

function getNodeBucket(nodeId, treeNodeMetaById, bloodline) {
  const meta = treeNodeMetaById ? treeNodeMetaById[String(nodeId)] : null
  const ascendancyName = meta && typeof meta.ascendancyName === 'string' ? meta.ascendancyName : null
  if (!ascendancyName) return 'tree'
  return isBloodlineAscendancyName(ascendancyName, bloodline) ? 'bloodline' : 'ascendancy'
}

function computeSectionNodeRanges(blocks, allocatedPassiveCount, totalPointsAtLevel, sectionMode) {
  const ranges = {}
  const parse = (value) => {
    const parsed = Number.parseInt(String(value || '').trim(), 10)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (sectionMode === 'manual') {
    let prevEnd = 0
    blocks.forEach((block) => {
      const endLevel = parse(block.levelRange?.max) ?? parse(block.levelRange?.min)
      const rawTarget = endLevel != null ? totalPointsAtLevel(endLevel) : prevEnd
      const end = Math.max(prevEnd, Math.max(0, rawTarget))
      ranges[block.id] = { start: prevEnd, end, endLevel }
      prevEnd = end
    })
    return ranges
  }

  const totalNodes = allocatedPassiveCount
  const rawTargets = blocks.map((block) => {
    const endLevel = parse(block.levelRange?.max) ?? parse(block.levelRange?.min)
    return endLevel != null ? totalPointsAtLevel(endLevel) : null
  })
  const targets = Array(blocks.length).fill(null)

  let lastKnownIndex = -1
  let lastKnownEnd = 0

  rawTargets.forEach((raw, idx) => {
    if (raw == null) return
    const target = Math.max(lastKnownEnd, Math.max(0, Math.min(totalNodes, raw)))
    const missingCount = idx - lastKnownIndex - 1
    if (missingCount > 0) {
      const span = Math.max(0, target - lastKnownEnd)
      for (let j = 1; j <= missingCount; j += 1) {
        targets[lastKnownIndex + j] = lastKnownEnd + Math.round((span * j) / (missingCount + 1))
      }
    }
    targets[idx] = target
    lastKnownIndex = idx
    lastKnownEnd = target
  })

  if (lastKnownIndex < blocks.length - 1) {
    const missingCount = blocks.length - lastKnownIndex - 1
    const span = Math.max(0, totalNodes - lastKnownEnd)
    for (let j = 1; j <= missingCount; j += 1) {
      targets[lastKnownIndex + j] = lastKnownEnd + Math.round((span * j) / missingCount)
    }
  }

  let prevEnd = 0
  blocks.forEach((block, idx) => {
    const endLevel = parse(block.levelRange?.max) ?? parse(block.levelRange?.min)
    const target = targets[idx] ?? prevEnd
    const end = Math.max(prevEnd, Math.max(0, Math.min(totalNodes, target)))
    ranges[block.id] = { start: prevEnd, end, endLevel }
    prevEnd = end
  })
  return ranges
}

function computeSectionScopedAllocations(blocks, selectionOrder, sectionNodeRanges, treeNodeMetaById, bloodline) {
  if (blocks.length === 0) return {}
  const sections = blocks
    .map((block) => {
      const range = sectionNodeRanges[block.id]
      return range ? { id: block.id, start: range.start, end: range.end } : null
    })
    .filter(Boolean)
  if (sections.length === 0) return {}

  const alloc = {}
  sections.forEach((section) => {
    alloc[section.id] = { tree: [], ascendancy: [], bloodline: [] }
  })

  let passiveCount = 0
  let sectionIdx = 0
  const lastIdx = sections.length - 1

  const currentSectionId = () => {
    while (sectionIdx < lastIdx && passiveCount >= sections[sectionIdx].end) sectionIdx += 1
    return sections[sectionIdx]?.id ?? sections[lastIdx].id
  }

  selectionOrder.forEach((nodeId) => {
    const sid = currentSectionId()
    const bucket = getNodeBucket(nodeId, treeNodeMetaById, bloodline)
    if (bucket === 'tree') {
      alloc[sid]?.tree.push(nodeId)
      passiveCount += 1
    } else if (bucket === 'bloodline') {
      alloc[sid]?.bloodline.push(nodeId)
    } else {
      alloc[sid]?.ascendancy.push(nodeId)
    }
  })

  return alloc
}

function computeTreeSectionHighlight(sectionId, viewMode, blocks, selectionOrder, sectionScopedAllocations, treeNodeMetaById, bloodline, sectionMode, manualBySectionId) {
  if (!sectionId) return null

  const filterByView = (nodeIds) => {
    const want = viewMode === 'tree' ? 'tree' : viewMode === 'ascendancy' ? 'ascendancy' : 'bloodline'
    return nodeIds.filter((id) => getNodeBucket(id, treeNodeMetaById, bloodline) === want)
  }

  if (sectionMode === 'manual') {
    const idx = blocks.findIndex((block) => block.id === sectionId)
    const prevId = idx > 0 ? blocks[idx - 1]?.id ?? null : null
    const prevOrder = prevId ? manualBySectionId[prevId]?.order ?? [] : []
    const curOrder = manualBySectionId[sectionId]?.order ?? selectionOrder

    const prev = filterByView(prevOrder)
    const cur = filterByView(curOrder)
    const prevSet = new Set(prev)
    const curSet = new Set(cur)
    const removed = prev.filter((id) => !curSet.has(id))
    return { previous: prev, current: cur, removed }
  }

  const idx = blocks.findIndex((block) => block.id === sectionId)
  if (idx < 0) return null

  const want = viewMode === 'tree' ? 'tree' : viewMode === 'ascendancy' ? 'ascendancy' : 'bloodline'
  const prev = []
  for (let i = 0; i < idx; i += 1) {
    const sid = blocks[i]?.id
    if (!sid) continue
    const alloc = sectionScopedAllocations[sid]
    if (!alloc) continue
    prev.push(...(alloc[want] ?? []))
  }
  const curAlloc = sectionScopedAllocations[sectionId]
  if (!curAlloc) return { previous: prev, current: [], removed: [] }
  const cur = curAlloc[want] ?? []
  return { previous: prev, current: cur, removed: [] }
}

function ensureSocketList(sockets) {
  const keep = normalizeArray(sockets).filter(Boolean).slice(0, 6)
  if (keep.length === 0) return [EMPTY_SOCKET]
  return keep
}

function normalizeLoadedSocket(raw) {
  const colorRaw = typeof raw?.color === 'string' ? raw.color : 'white'
  const color = ['red', 'green', 'blue', 'white'].includes(colorRaw) ? colorRaw : 'white'
  const name = typeof raw?.name === 'string' ? raw.name : 'Empty'
  const icon = typeof raw?.icon === 'string' && raw.icon.trim().length > 0 ? raw.icon : null
  const type = icon ? (typeof raw?.type === 'string' ? raw.type : 'gem') : 'empty'
  const id =
    typeof raw?.id === 'string'
      ? raw.id
      : type === 'empty'
        ? 'empty'
        : `${name}:${color}`.toLowerCase().replace(/\s+/g, '-')
  const tags = Array.isArray(raw?.tags) ? raw.tags.filter((t) => typeof t === 'string') : undefined
  const summary = typeof raw?.summary === 'string' ? raw.summary : undefined
  const isSupport = typeof raw?.isSupport === 'boolean' ? raw.isSupport : undefined
  const itemSlotRaw = typeof raw?.itemSlot === 'string' ? raw.itemSlot : 'any'
  const itemSlot = ['any', 'helmet', 'body', 'gloves', 'boots', 'weapon1', 'weapon2'].includes(itemSlotRaw)
    ? itemSlotRaw
    : 'any'
  const socketColorOverrideRaw = typeof raw?.socketColorOverride === 'string' ? raw.socketColorOverride : null
  const socketColorOverride = socketColorOverrideRaw === 'white' ? 'white' : null
  const levelRaw = raw?.level
  const qualityRaw = raw?.quality
  const parsedLevel = Number.isFinite(Number(levelRaw)) ? Math.max(1, Math.min(40, Number(levelRaw))) : null
  const parsedQuality = Number.isFinite(Number(qualityRaw)) ? Math.max(0, Math.min(30, Number(qualityRaw))) : null
  const level = type === 'empty' ? null : parsedLevel
  const quality = type === 'empty' ? null : parsedQuality ?? 0

  return {
    id,
    color,
    name,
    type,
    icon,
    itemSlot,
    socketColorOverride,
    level,
    quality,
    ...(tags ? { tags } : {}),
    ...(summary ? { summary } : {}),
    ...(isSupport != null ? { isSupport } : {}),
  }
}

function normalizeLoadedChains(rawChains) {
  const chains = normalizeArray(rawChains)
  if (chains.length === 0) {
    return [{ id: 'chain-1', label: 'Skill 1:', description: '', role: '', itemSlot: 'any', sockets: [EMPTY_SOCKET] }]
  }
  return chains.map((chain, idx) => {
    const id = typeof chain?.id === 'string' ? chain.id : `chain-${idx + 1}`
    const label = typeof chain?.label === 'string' ? chain.label : `Skill ${idx + 1}:`
    const description = typeof chain?.description === 'string' ? chain.description : ''
    const role = typeof chain?.role === 'string' ? chain.role : ''
    const itemSlotRaw = typeof chain?.itemSlot === 'string' ? chain.itemSlot : ''
    const itemSlot = ['any', 'helmet', 'body', 'gloves', 'boots', 'weapon1', 'weapon2'].includes(itemSlotRaw)
      ? itemSlotRaw
      : 'any'
    const socketsRaw = normalizeArray(chain?.sockets)
    const sockets = ensureSocketList(socketsRaw.map(normalizeLoadedSocket))
    const derivedSlot =
      itemSlot !== 'any'
        ? itemSlot
        : (sockets.find((s) => s.itemSlot && s.itemSlot !== 'any')?.itemSlot ?? 'any')
    return { id, label, description, role, itemSlot: derivedSlot, sockets }
  })
}

function normalizeSkillBlocks(rows) {
  const blocks = normalizeArray(rows)
  return blocks.map((block, index) => {
    const meta = block && typeof block.metadata === 'object' && block.metadata ? block.metadata : {}
    const titleTags = Array.isArray(meta.titleTags) ? meta.titleTags.filter((t) => typeof t === 'string') : []
    const customTitle = toString(meta.customTitle)
    const rawBlockTitle = toString(meta.blockTitle)
    const blockTitle = rawBlockTitle || toString(block.title) || `Section ${index + 1}`
    const levelRange = parseLevelRange(block, meta)
    const chains = normalizeLoadedChains(meta.chains)

    return {
      id: block.client_id || block.id || `block-${index + 1}`,
      titleTags,
      customTitle,
      blockTitle,
      levelRange,
      chains,
    }
  })
}
function groupGearItems(items) {
  const grouped = {}
  normalizeArray(items).forEach((item) => {
    if (!item || typeof item.slot !== 'string') return
    const slot = item.slot
    if (slot.startsWith('meta:')) return

    let blockId = 'global'
    let slotId = slot

    if (slot.startsWith('gear:')) {
      const parts = slot.split(':')
      if (parts.length >= 3) {
        blockId = parts[1] || 'global'
        slotId = parts.slice(2).join(':')
      }
    }

    grouped[blockId] = grouped[blockId] || {}
    grouped[blockId][slotId] = item
  })

  return grouped
}

function getGearSlug(item) {
  const meta = item && typeof item.metadata === 'object' ? item.metadata : null
  const snapshot =
    meta && typeof meta.gear_item_snapshot === 'object' ? meta.gear_item_snapshot : null
  const slug =
    (meta && typeof meta.gear_item_slug === 'string' ? meta.gear_item_slug : '') ||
    (snapshot && typeof snapshot.slug === 'string' ? snapshot.slug : '')
  return slug || ''
}

function resolveGearImageUrl(gearItem, itemMeta) {
  const snapshot =
    itemMeta && typeof itemMeta.gear_item_snapshot === 'object' ? itemMeta.gear_item_snapshot : null
  const direct = toString(gearItem?.image_url || snapshot?.image_url || itemMeta?.image_url).trim()
  if (direct) return direct

  const path = toString(gearItem?.image_path || snapshot?.image_path || itemMeta?.image_path).trim()
  if (!path) return null

  const baseRaw = toString(appConfig.gearImagesBaseUrl)
  const base = baseRaw.replace(/\/+$/g, '')
  if (!base) return null

  const bucketRaw = toString(appConfig.gearImagesBucket)
  const bucket = (bucketRaw || 'gear-images').replace(/^\/+|\/+$/g, '')
  if (!bucket) return null

  const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${bucket}/${normalizedPath}`
}

function buildResolvedGearByBlock(gearByBlock) {
  const resolved = {}
  Object.entries(gearByBlock || {}).forEach(([blockId, slots]) => {
    const nextSlots = {}
    Object.entries(slots || {}).forEach(([slotId, item]) => {
      const meta = item && typeof item.metadata === 'object' ? item.metadata : null
      const slug = getGearSlug(item)
      const gearItem = slug ? gearItemsBySlug[slug] : null
      const imageUrl = resolveGearImageUrl(gearItem, meta)
      nextSlots[slotId] = { ...item, resolvedImageUrl: imageUrl }
    })
    resolved[blockId] = nextSlots
  })
  return resolved
}

function resolveGearRarity(gearItem, itemMeta) {
  const typeRaw = toString(gearItem?.item_type || gearItem?.itemType || itemMeta?.item_type || itemMeta?.rarity).toLowerCase()
  if (typeRaw.includes('unique')) return 'unique'
  if (typeRaw.includes('magic')) return 'magic'
  if (typeRaw.includes('rare')) return 'rare'
  return 'normal'
}

function formatGearMods(meta) {
  if (!meta || typeof meta !== 'object') return []

  if (Array.isArray(meta.mods)) {
    return meta.mods.filter((m) => typeof m === 'string' && m.trim())
  }

  if (Array.isArray(meta.mod_entries)) {
    return meta.mod_entries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const tierText = toString(entry.tierText)
        if (tierText.trim()) return tierText.trim()
        const text = toString(entry.text)
        if (!text.trim()) return null
        if (typeof entry.value === 'number' && (text.match(/#/g) || []).length === 1) {
          return text.replace('#', String(entry.value))
        }
        return text
      })
      .filter(Boolean)
  }

  return []
}

function buildGearTooltip(gearItem, itemMeta, fallbackName) {
  const meta = itemMeta && typeof itemMeta === 'object' ? itemMeta : {}
  const snapshot =
    meta && typeof meta.gear_item_snapshot === 'object' ? meta.gear_item_snapshot : null
  const name =
    toString(gearItem?.name) ||
    toString(snapshot?.name) ||
    toString(meta.name) ||
    toString(fallbackName) ||
    'Item'
  const baseType =
    toString(gearItem?.base_type) ||
    toString(snapshot?.base_type) ||
    toString(meta.base_type) ||
    ''
  const itemType =
    toString(gearItem?.item_type) ||
    toString(snapshot?.item_type) ||
    toString(meta.item_type) ||
    ''
  const rarity = resolveGearRarity(gearItem, meta)
  const rarityLabel = rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : ''
  const mods = formatGearMods(meta)

  const typeLine = baseType || itemType
  const modsBlock = mods.length
    ? `<div class="tt-section-title">Modifiers</div><div class="tt-mods">${mods
      .map((mod) => `<div class="tt-row">${escapeHtml(mod)}</div>`)
      .join('')}</div>`
    : ''

  return `
    <div class="tt-header ${rarity}">
      <div class="tt-name">${escapeHtml(name)}</div>
      ${typeLine ? `<div class="tt-type">${escapeHtml(typeLine)}</div>` : ''}
      ${rarityLabel ? `<div class="tt-rarity">${escapeHtml(rarityLabel)}</div>` : ''}
    </div>
    <div class="tt-body">
      ${modsBlock || '<div class="tt-muted">No modifiers listed</div>'}
    </div>
  `
}

function buildGemTooltip(gem) {
  if (!gem) return ''
  const name = toString(gem.name) || 'Gem'
  const levelText = gem.level ? `Level ${gem.level}` : ''

  return `
    <div class="tt-header gem">
      <div class="tt-name">${escapeHtml(name)}</div>
      ${levelText ? `<div class="tt-rarity">${escapeHtml(levelText)}</div>` : ''}
    </div>
  `
}

function buildTreeData(data, selectionOrderOverride) {
  const sequences = normalizeArray(data.sequences)
  const steps = normalizeArray(data.steps)
  const nodes = normalizeArray(data.nodes)
  const nodeById = new Map()

  nodes.forEach((node) => {
    if (!node || !node.id || !node.node_key) return
    nodeById.set(node.id, {
      key: String(node.node_key),
      label: toString(node.label) || String(node.node_key),
    })
  })

  const stepsBySequence = new Map()
  steps.forEach((step) => {
    if (!step) return
    const sequenceId = step.sequence_id || step.sequenceId
    if (!sequenceId) return
    if (!stepsBySequence.has(sequenceId)) stepsBySequence.set(sequenceId, [])
    stepsBySequence.get(sequenceId).push(step)
  })

  const orderedSequences = sequences.slice().sort((a, b) => {
    const aOrder = a.order_index ?? a.position ?? 0
    const bOrder = b.order_index ?? b.position ?? 0
    return aOrder - bOrder
  })

  const sequenceNodes = orderedSequences.map((sequence, index) => {
    const stepsForSequence = (stepsBySequence.get(sequence.id) || []).slice().sort((a, b) => {
      const aPos = a.position ?? a.order_index ?? 0
      const bPos = b.position ?? b.order_index ?? 0
      return aPos - bPos
    })

    const nodesForSequence = stepsForSequence
      .map((step) => nodeById.get(step.node_id || step.nodeId))
      .filter(Boolean)

    return {
      id: sequence.id || `sequence-${index + 1}`,
      name: toString(sequence.name) || `Sequence ${index + 1}`,
      nodes: nodesForSequence,
    }
  })

  const orderedKeys = []
  const seen = new Set()
  const labelByKey = {}
  sequenceNodes.forEach((sequence) => {
    sequence.nodes.forEach((node) => {
      if (node && node.key && !seen.has(node.key)) {
        orderedKeys.push(node.key)
        seen.add(node.key)
        labelByKey[node.key] = node.label || node.key
      }
    })
  })

  const selectionOrder =
    Array.isArray(selectionOrderOverride) && selectionOrderOverride.length > 0
      ? selectionOrderOverride
      : orderedKeys

  return { sequences: sequenceNodes, orderedKeys: selectionOrder, labelByKey }
}

function resolveAscendancyNameFromOrder(nodeIds, treeNodeMetaById, bloodline) {
  const ids = normalizeArray(nodeIds)
  for (const id of ids) {
    if (getNodeBucket(id, treeNodeMetaById, bloodline) !== 'ascendancy') continue
    const meta = treeNodeMetaById ? treeNodeMetaById[String(id)] : null
    if (meta && typeof meta.ascendancyName === 'string' && meta.ascendancyName.trim()) {
      return meta.ascendancyName
    }
  }
  return null
}

function resolveBloodlineNameFromOrder(nodeIds, treeNodeMetaById, bloodline) {
  const ids = normalizeArray(nodeIds)
  for (const id of ids) {
    if (getNodeBucket(id, treeNodeMetaById, bloodline) !== 'bloodline') continue
    const meta = treeNodeMetaById ? treeNodeMetaById[String(id)] : null
    if (meta && typeof meta.ascendancyName === 'string' && meta.ascendancyName.trim()) {
      return meta.ascendancyName
    }
  }
  return bloodline || null
}

function buildGuideTreeBySection(blocks, tree, meta, treeNodeMetaById, general) {
  const sections = normalizeArray(blocks)
  const labelByKey = tree.labelByKey || {}
  const selectionOrder = normalizeArray(tree.orderedKeys).map((id) => String(id))
  const treeMeta = meta && typeof meta.tree === 'object' ? meta.tree : {}
  const sectionMode = treeMeta.sectionMode === 'manual' ? 'manual' : 'automatic'
  const manualBySectionId = normalizeManualTreeBySection(treeMeta.manualTreeBySectionId)
  const banditChoice = toString(treeMeta.banditChoice) || 'kill_all'
  const bloodline = toString(general?.bloodline)

  const allocatedPassiveNodeIds = selectionOrder.filter(
    (id) => getNodeBucket(id, treeNodeMetaById, bloodline) === 'tree'
  )
  const sectionNodeRanges = computeSectionNodeRanges(
    sections,
    allocatedPassiveNodeIds.length,
    (level) => totalPassivePointsAtLevel(level, banditChoice),
    sectionMode
  )
  const sectionScopedAllocations = computeSectionScopedAllocations(
    sections,
    selectionOrder,
    sectionNodeRanges,
    treeNodeMetaById,
    bloodline
  )

  const bySection = {}
  const fallbackAscendancyName = resolveAscendancyNameFromOrder(selectionOrder, treeNodeMetaById, bloodline)
  const filterByView = (nodeIds, viewMode) => {
    const want = viewMode === 'tree' ? 'tree' : viewMode === 'ascendancy' ? 'ascendancy' : 'bloodline'
    return normalizeArray(nodeIds).filter((id) => getNodeBucket(id, treeNodeMetaById, bloodline) === want)
  }

  sections.forEach((block) => {
    const sectionId = block.id
    if (!sectionId) return

    const computeForMode = (viewMode) => {
      const highlight = computeTreeSectionHighlight(
        sectionId,
        viewMode,
        sections,
        selectionOrder,
        sectionScopedAllocations,
        treeNodeMetaById,
        bloodline,
        sectionMode,
        manualBySectionId
      )

      let allocationOrder = []
      if (sectionMode === 'manual') {
        allocationOrder = filterByView(manualBySectionId[sectionId]?.order ?? selectionOrder, viewMode)
      } else if (highlight) {
        const include = new Set([...(highlight.previous || []), ...(highlight.current || []), ...(highlight.removed || [])])
        allocationOrder = selectionOrder.filter((id) => include.has(id))
      } else {
        allocationOrder = filterByView(selectionOrder, viewMode)
      }

      let stepNodeIds = []
      if (highlight) {
        const prevSet = new Set(highlight.previous || [])
        const addedInSection = (highlight.current || []).filter((id) => !prevSet.has(id))
        if (sectionMode !== 'manual') {
          stepNodeIds = addedInSection
        } else {
          const state = manualBySectionId[sectionId]
          const actions = Array.isArray(state?.actions) ? state.actions : []
          const addedSet = new Set(addedInSection)
          const fromActions = []
          const seen = new Set()
          actions.forEach((action) => {
            if (!action || action.type !== 'allocate') return
            const nodeId = action.nodeId
            if (!nodeId || !addedSet.has(nodeId)) return
            if (getNodeBucket(nodeId, treeNodeMetaById, bloodline) !== viewMode) return
            if (seen.has(nodeId)) return
            seen.add(nodeId)
            fromActions.push(nodeId)
          })
          stepNodeIds = fromActions.length > 0 ? fromActions : addedInSection
        }
      }

      return { allocationOrder, stepNodeIds, highlight }
    }

    const treeState = computeForMode('tree')
    const ascState = computeForMode('ascendancy')
    const bloodState = computeForMode('bloodline')

    bySection[sectionId] = {
      orderedKeysByMode: {
        tree: treeState.allocationOrder,
        ascendancy: ascState.allocationOrder,
        bloodline: bloodState.allocationOrder,
      },
      stepNodeIdsByMode: {
        tree: treeState.stepNodeIds,
        ascendancy: ascState.stepNodeIds,
        bloodline: bloodState.stepNodeIds,
      },
      highlightByMode: {
        tree: treeState.highlight,
        ascendancy: ascState.highlight,
        bloodline: bloodState.highlight,
      },
      hasTree: treeState.allocationOrder.length > 0,
      hasAscendancy: ascState.allocationOrder.length > 0,
      hasBloodline: bloodState.allocationOrder.length > 0,
      ascendancyName: resolveAscendancyNameFromOrder(ascState.allocationOrder, treeNodeMetaById, bloodline) || fallbackAscendancyName,
      bloodlineName: resolveBloodlineNameFromOrder(bloodState.allocationOrder, treeNodeMetaById, bloodline),
    }
  })

  return { bySection, labelByKey, ascendancyName: fallbackAscendancyName }
}

function renderGuideOverview(meta, general, summary) {
  clearEl(guideOverview)
  if (!guideOverview) return

  renderGuideSidebarHeader(summary, general)

  const grid = createEl('div', 'grid gap-4 lg:grid-cols-3')
  let hasContent = false

  const addCard = (title, bodyEl, options = {}) => {
    const card = createEl(
      'div',
      `rounded-lg border border-border/60 bg-card/40 p-4 shadow-[0_0_20px_rgba(0,0,0,0.35)]${options.full ? ' lg:col-span-3' : ''}`
    )
    card.appendChild(createEl('div', 'text-sm font-semibold tracking-wide text-foreground', title))
    const body = createEl('div', 'mt-2 space-y-2')
    body.appendChild(bodyEl)
    card.appendChild(body)
    grid.appendChild(card)
    hasContent = true
  }

  const infoItems = []
  const rawLeague = toString(general?.league)
  const leagueId = normalizeLeagueId(rawLeague)
  const leagueLabel = leagueId === 'phrecia' ? 'Phrecia Event' : 'Keepers League'
  infoItems.push({
    label: 'League',
    value: rawLeague ? leagueLabel : `${leagueLabel} (missing)`,
  })
  if (general.class) infoItems.push({ label: 'Class', value: general.class })
  if (general.ascendancy) infoItems.push({ label: 'Ascendancy', value: general.ascendancy })
  if (general.bloodline) infoItems.push({ label: 'Bloodline', value: general.bloodline })
  if (summary.creatorName) infoItems.push({ label: 'Creator', value: summary.creatorName })
  if (summary.mainSkill) infoItems.push({ label: 'Main Skill', value: summary.mainSkill })
  if (summary.playstyles && summary.playstyles.length > 0) {
    infoItems.push({ label: 'Playstyles', value: summary.playstyles.join(', ') })
  }

  const treeMeta = meta && typeof meta.tree === 'object' ? meta.tree : {}
  const banditChoice = toString(treeMeta.banditChoice)
  if (banditChoice && BANDIT_LABELS[banditChoice]) infoItems.push({ label: 'Bandit', value: BANDIT_LABELS[banditChoice] })
  if (summary.levelRange) infoItems.push({ label: 'Levels', value: summary.levelRange })
  if (summary.versionNumber) infoItems.push({ label: 'Version', value: `v${summary.versionNumber}` })
  if (summary.publishedAt) {
    infoItems.push({ label: 'Published', value: new Date(summary.publishedAt).toLocaleDateString() })
  }

  infoItems.push({ label: 'Items', value: String(summary.itemCount) })
  infoItems.push({ label: 'Skill Blocks', value: String(summary.skillBlockCount) })
  infoItems.push({ label: 'Tree Nodes', value: String(summary.nodeCount) })

  if (infoItems.length > 0) {
    const list = createEl('div', 'guide-info-grid')
    infoItems.forEach((item) => {
      const row = createEl('div', 'guide-info-row')
      row.appendChild(createEl('div', 'guide-info-label', item.label))
      row.appendChild(createEl('div', 'guide-info-value', item.value))
      list.appendChild(row)
    })
    addCard('Build Info', list)
  }

  const ratings = general && typeof general.ratings === 'object' ? general.ratings : null
  const viability = general && typeof general.viability === 'object' ? general.viability : null
  const ratingKeys = ratings ? Object.keys(ratings).filter((key) => toNumber(ratings[key]) !== null) : []
  const hasViability = viability && (viability.ssfViable || viability.hardcoreViable || viability.controllerFriendly)
  if (ratingKeys.length > 0 || hasViability) {
    const body = createEl('div', 'space-y-3')
    const tags = createEl('div', 'flex flex-wrap gap-2')

    if (viability) {
      if (viability.ssfViable) tags.appendChild(createEl('span', 'px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-semibold', 'SSF viable'))
      if (viability.hardcoreViable) tags.appendChild(createEl('span', 'px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-semibold', 'Hardcore viable'))
      if (viability.controllerFriendly) tags.appendChild(createEl('span', 'px-2 py-1 rounded-full accent-chip text-xs font-semibold', 'Controller friendly'))
    }

    if (tags.childNodes.length > 0) body.appendChild(tags)

    if (ratings) {
      const ratingGrid = createEl('div', 'guide-info-grid rating-grid')
      ratingKeys.forEach((key) => {
        const valueRaw = toNumber(ratings[key])
        if (valueRaw === null) return
        const value = Math.max(0, Math.min(5, valueRaw))
        const card = createEl('div', 'guide-info-row rating-card')
        card.appendChild(createEl('div', 'guide-info-label', formatLabelText(String(key)) || String(key)))
        const bar = createEl('div', 'rating-blocks')
        for (let i = 1; i <= 5; i += 1) {
          bar.appendChild(createEl('span', `rating-block${value >= i ? ' active' : ''}`))
        }
        card.appendChild(bar)
        ratingGrid.appendChild(card)
      })
      body.appendChild(ratingGrid)
    }

    addCard('Ratings & Viability', body)
  }

  const strengths = normalizeArray(general.strengths)
  const weaknesses = normalizeArray(general.weaknesses)
  if (strengths.length > 0 || weaknesses.length > 0) {
    const body = createEl('div', 'grid gap-3')

    if (strengths.length > 0) {
      const block = createEl('div', 'space-y-2')
      block.appendChild(createEl('div', 'text-xs font-semibold uppercase text-emerald-200', 'Strengths'))
      const list = createEl('ul', 'list-disc pl-5 text-sm text-muted-foreground space-y-1')
      strengths.forEach((item) => list.appendChild(createEl('li', null, item)))
      block.appendChild(list)
      body.appendChild(block)
    }

    if (weaknesses.length > 0) {
      const block = createEl('div', 'space-y-2')
      block.appendChild(createEl('div', 'text-xs font-semibold uppercase text-rose-200', 'Weaknesses'))
      const list = createEl('ul', 'list-disc pl-5 text-sm text-muted-foreground space-y-1')
      weaknesses.forEach((item) => list.appendChild(createEl('li', null, item)))
      block.appendChild(list)
      body.appendChild(block)
    }

    addCard('Strengths & Weaknesses', body)
  }

  const introHtml = toString(general.introHtml)
  if (introHtml.trim()) {
    const body = createEl('div', 'prose prose-invert max-w-none')
    body.innerHTML = sanitizeTrustedHtml(introHtml)
    addCard('Build Introduction', body, { full: true })
  }

  const extraNotes = normalizeArray(meta.additionalNotesBlocks)
  if (extraNotes.length > 0 || toString(meta.notes).trim()) {
    const body = createEl('div', 'space-y-3')
    if (extraNotes.length > 0) {
      extraNotes.forEach((block) => {
        const note = createEl('div', 'rounded-md border border-border/60 bg-muted/20 p-3 space-y-1')
        note.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', toString(block.title) || 'Notes'))
        note.appendChild(createEl('div', 'text-sm text-muted-foreground whitespace-pre-wrap', toString(block.text)))
        body.appendChild(note)
      })
    } else if (toString(meta.notes).trim()) {
      const note = createEl('div', 'text-sm text-muted-foreground whitespace-pre-wrap')
      note.textContent = toString(meta.notes)
      body.appendChild(note)
    }

    addCard('Notes', body, { full: true })
  }

  if (!hasContent) {
    guideOverview.appendChild(createEl('div', 'empty-state', 'No guide details available'))
  } else {
    guideOverview.appendChild(grid)
  }
}

function syncGuidePanels() {
  if (!guideOverview || !guideSections || !guideLiveView) return
  if (guideTopTab === 'general') {
    guideOverview.classList.remove('hidden')
    guideSections.classList.add('hidden')
    guideLiveView.classList.add('hidden')
    activeGuideTree = null
    return
  }
  if (guideTopTab === 'live') {
    guideOverview.classList.add('hidden')
    guideSections.classList.add('hidden')
    guideLiveView.classList.remove('hidden')
    return
  }
  guideOverview.classList.add('hidden')
  guideSections.classList.remove('hidden')
  guideLiveView.classList.add('hidden')
}

function renderGuideTopTabs(blocks, options = {}) {
  if (!guideTopTabs) return
  clearEl(guideTopTabs)

  const sections = normalizeArray(blocks)
  const hasSections = sections.length > 0
  const isLiveBuild = options.isLiveBuild === true

  if (!hasSections) {
    activeGuideSectionId = null
    activeGuideLiveBlockId = null
    if (guideTopTab !== 'general') guideTopTab = 'general'
  } else if (!activeGuideSectionId || !sections.some((b) => b.id === activeGuideSectionId)) {
    activeGuideSectionId = sections[0].id
  }

  const generalBtn = createEl('button', `guide-top-tab${guideTopTab === 'general' ? ' active' : ''}`, 'General')
  generalBtn.type = 'button'
  generalBtn.addEventListener('click', () => {
    guideTopTab = 'general'
    syncGuidePanels()
    renderGuideTopTabs(sections, { isLiveBuild })
  })
  guideTopTabs.appendChild(generalBtn)

  if (isLiveBuild) {
    const liveBtn = createEl('button', `guide-top-tab${guideTopTab === 'live' ? ' active' : ''}`, 'Live')
    liveBtn.type = 'button'
    liveBtn.addEventListener('click', () => {
      guideTopTab = 'live'
      syncGuidePanels()
      renderGuideTopTabs(sections, { isLiveBuild })
      renderLiveGuideView(
        cachedGuideBlocks,
        cachedGuideGearByBlock,
        cachedGuideTreeBySection,
        cachedGuideGeneral,
        activeGuideLiveBlockId
      )
    })
    guideTopTabs.appendChild(liveBtn)
  } else {
    sections.forEach((block, idx) => {
      const labelBase = toString(block.blockTitle).trim()
      const label = labelBase ? `Section ${idx + 1}: ${labelBase}` : `Section ${idx + 1}`
      const isActive = guideTopTab === 'sections' && activeGuideSectionId === block.id
      const btn = createEl('button', `guide-top-tab${isActive ? ' active' : ''}`, label)
      btn.type = 'button'
      btn.title = label
      btn.addEventListener('click', () => {
        guideTopTab = 'sections'
        activeGuideSectionId = block.id
        syncGuidePanels()
        renderGuideTopTabs(sections, { isLiveBuild })
        renderGuideSections(
          cachedGuideBlocks,
          cachedGuideGearByBlock,
          cachedGuideNotesByScope,
          cachedGuideExtraBlocksByBlockId,
          cachedGuideTreeBySection,
          cachedGuideGeneral,
          activeGuideSectionId
        )
      })
      guideTopTabs.appendChild(btn)
    })
  }

  if (guideTopHint) {
    if (!hasSections) {
      guideTopHint.textContent = 'Create sections on the website to generate a per-section guide.'
      guideTopHint.classList.remove('hidden')
    } else if (isLiveBuild && guideTopTab === 'live') {
      guideTopHint.textContent = 'Slide through captured levels to inspect live progression.'
      guideTopHint.classList.remove('hidden')
    } else {
      guideTopHint.classList.add('hidden')
    }
  }

  syncGuidePanels()
}
function getRenderedSocketColor(gem) {
  if (!gem) return 'white'
  return gem.socketColorOverride === 'white' ? 'white' : (gem.color || 'white')
}

function renderSocketPreview(chain, container, options = {}) {
  const compact = options.compact === true
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  let scale = 1
  if (viewportWidth && viewportWidth < 1100) scale = 0.85
  if (viewportWidth && viewportWidth < 900) scale = 0.7
  if (viewportWidth && viewportWidth < 760) scale = 0.6
  const baseSocketSize = compact ? 40 : 52
  const baseLinkSize = compact ? 24 : 32
  const baseGemSize = compact ? 28 : 36
  const socketSize = Math.max(24, Math.round(baseSocketSize * scale))
  const linkSize = Math.max(16, Math.round(baseLinkSize * scale))
  const gemSize = Math.max(18, Math.round(baseGemSize * scale))
  const overlapScale = compact ? 0.75 : 1
  const linkOverlapLeft = Math.max(2, Math.round(LINK_OVERLAP_LEFT_PX_DEFAULT * overlapScale * scale))
  const linkOverlapRight = Math.max(2, Math.round(LINK_OVERLAP_RIGHT_PX_DEFAULT * overlapScale * scale))
  const sockets = normalizeArray(chain.sockets)
  const preview = createEl('div', 'socket-preview no-scrollbar')
  const previewWrap = createEl('div', 'socket-preview-wrap')

  sockets.forEach((gem, idx) => {
    if (idx > 0) {
      const linkWrap = createEl('div', 'relative z-0 flex items-center')
      linkWrap.style.height = `${socketSize}px`
      linkWrap.style.marginRight = `-${linkOverlapRight}px`
      const link = document.createElement('img')
      link.src = LINK_IMG
      link.alt = ''
      link.className = 'object-contain accent-glow'
      link.style.width = `${linkSize}px`
      link.style.height = `${linkSize}px`
      linkWrap.appendChild(link)
      preview.appendChild(linkWrap)
    }

    const socketWrap = createEl('div', 'relative z-10 flex flex-none items-center justify-center')
    socketWrap.style.width = `${socketSize}px`
    socketWrap.style.height = `${socketSize}px`
    socketWrap.style.marginRight = idx < sockets.length - 1 ? `-${linkOverlapLeft}px` : '0'

    const socket = createEl('div', 'relative rounded-full overflow-hidden')
    socket.style.width = `${socketSize}px`
    socket.style.height = `${socketSize}px`
    const socketImg = document.createElement('img')
    const renderedColor = getRenderedSocketColor(gem)
    socketImg.src = SOCKET_IMG[renderedColor] || SOCKET_IMG.white
    socketImg.alt = `${renderedColor} socket`
    socketImg.className = 'w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]'
    socket.appendChild(socketImg)

    const iconPath = resolveAssetPath(gem?.icon)
    if (iconPath) {
      const gemImg = document.createElement('img')
      gemImg.src = iconPath
      gemImg.alt = gem?.name || ''
      gemImg.className = 'absolute inset-0 m-auto object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]'
      gemImg.style.width = `${gemSize}px`
      gemImg.style.height = `${gemSize}px`
      gemImg.style.transform = `translate(${GEM_ICON_OFFSET.x}px, ${GEM_ICON_OFFSET.y}px)`
      socket.appendChild(gemImg)
    }

    const ring = createEl('div', 'absolute inset-0 rounded-full accent-ring pointer-events-none')
    socket.appendChild(ring)

    socketWrap.appendChild(socket)
    if (gem && gem.type !== 'empty') {
      attachHoverTooltip(socketWrap, () => buildGemTooltip(gem))
    }
    preview.appendChild(socketWrap)
  })

  previewWrap.appendChild(preview)
  container.appendChild(previewWrap)
}

function renderGemList(chain, container) {
  const gems = normalizeArray(chain.sockets).filter((gem) => gem && gem.type !== 'empty')
  if (gems.length === 0) {
    container.appendChild(createEl('div', 'text-xs text-muted-foreground', 'No gems assigned'))
    return
  }

  const list = createEl('div', 'grid gap-2')
  gems.forEach((gem) => {
    const row = createEl('div', 'flex items-center gap-3 rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs')
    const iconPath = resolveAssetPath(gem.icon)
    if (iconPath) {
      const img = document.createElement('img')
      img.src = iconPath
      img.alt = gem.name || ''
      img.className = 'h-5 w-5 object-contain'
      row.appendChild(img)
    }
    const name = createEl('div', 'font-semibold text-foreground', gem.name || 'Gem')
    row.appendChild(name)
    const detail = []
    if (gem.level) detail.push(`Lv ${gem.level}`)
    if (gem.quality !== null && gem.quality !== undefined) detail.push(`Q ${gem.quality}%`)
    if (detail.length > 0) row.appendChild(createEl('div', 'text-muted-foreground', detail.join(' ')))
    if (gem.isSupport) row.appendChild(createEl('span', 'accent-text', 'Support'))
    attachHoverTooltip(row, () => buildGemTooltip(gem))
    list.appendChild(row)
  })

  container.appendChild(list)
}

function renderSkillChains(chains, container, options = {}) {
  const chainList = normalizeArray(chains)
  if (chainList.length === 0) {
    container.appendChild(createEl('div', 'empty-state', 'No skill gems listed'))
    return
  }

  chainList.forEach((chain, index) => {
    const sockets = normalizeArray(chain.sockets)
    const gemNames = []
    const gemNameSet = new Set()
    sockets.forEach((gem) => {
      if (!gem || gem.type === 'empty') return
      const name = cleanGuideText(toString(gem.name))
      if (!name || gemNameSet.has(name)) return
      gemNameSet.add(name)
      gemNames.push(name)
    })
    const card = createEl('div', `skill-chain-card${options.compact ? ' compact' : ''}`)
    const header = createEl('div', 'flex flex-wrap items-center justify-between gap-2')
    const labelRaw = toString(chain.label) || `Skill ${index + 1}`
    const label = cleanGuideText(labelRaw) || `Skill ${index + 1}`
    header.appendChild(createEl('div', options.compact ? 'text-xs font-semibold' : 'text-sm font-semibold', label))

    const metaParts = []
    if (chain.role) metaParts.push(chain.role)
    if (chain.itemSlot && chain.itemSlot !== 'any') metaParts.push(`Slot: ${chain.itemSlot}`)
    if (metaParts.length > 0) {
      header.appendChild(createEl('div', 'text-xs text-muted-foreground', metaParts.join(' | ')))
    }
    card.appendChild(header)

    const description = cleanGuideText(toString(chain.description))
    if (description && !options.compact) {
      card.appendChild(createEl('div', 'text-xs text-muted-foreground', description))
    }

    if (options.compact && gemNames.length > 0) {
      card.appendChild(createEl('div', 'text-xs text-muted-foreground gem-name-row', gemNames.join(' • ')))
    }

    renderSocketPreview(chain, card, { compact: options.compact })
    if (!options.compact) {
      renderGemList(chain, card)
    }

    container.appendChild(card)
  })
}

function renderGearSummary(itemsBySlot, container) {
  const entries = itemsBySlot ? Object.entries(itemsBySlot) : []
  if (entries.length === 0) {
    container.appendChild(createEl('div', 'empty-state', 'No gear assigned'))
    return
  }

  const order = new Map(SLOT_ORDER.map((slot, index) => [slot, index]))
  const list = createEl('div', 'grid gap-3')
  entries
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
    .forEach(([slotId, item]) => {
      const meta = item && typeof item.metadata === 'object' ? item.metadata : {}
      const snapshot =
        meta && typeof meta.gear_item_snapshot === 'object' ? meta.gear_item_snapshot : {}
      const slug = getGearSlug(item)
      const gearItem = slug ? gearItemsBySlug[slug] : null
      const icon = resolveGearImageUrl(gearItem, meta)
      const name =
        toString(item.item_name) ||
        toString(meta.name) ||
        toString(snapshot.name) ||
        gearItem?.name ||
        toString(meta.gear_item_slug) ||
        'Unknown item'

      const row = createEl('div', 'flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2')
      if (icon) {
        const img = document.createElement('img')
        img.src = icon
        img.alt = name
        img.className = 'h-10 w-10 object-contain'
        row.appendChild(img)
      }

      const text = createEl('div', 'space-y-1')
      text.appendChild(createEl('div', 'text-sm font-semibold', name))
      text.appendChild(createEl('div', 'text-xs text-muted-foreground', SLOT_LABELS[slotId] || slotId))
      row.appendChild(text)
      attachHoverTooltip(row, () => buildGearTooltip(gearItem, meta, name))
      list.appendChild(row)
    })

  container.appendChild(list)
}

function renderActiveGuideTree() {
  if (!activeGuideTree) return
  const { renderer, nodeKeys, className, ascendancyName, bloodlineName, getStepIndex, getHighlightNodeId, getViewMode, getSectionHighlight } = activeGuideTree
  const stepIndex = getStepIndex()
  const highlightNodeId = typeof getHighlightNodeId === 'function' ? getHighlightNodeId() : nodeKeys[stepIndex] || null
  const viewMode = typeof getViewMode === 'function' ? getViewMode() : 'tree'
  const sectionHighlight = typeof getSectionHighlight === 'function' ? getSectionHighlight() : null
  renderer.render(nodeKeys, { highlightNodeId, className, ascendancyName, bloodlineName, showAllNodes: true, centerOnHighlight: true, viewMode, sectionHighlight })
}

function setupGuideTreePreview(sectionId, nodeKeysByMode, stepNodesByMode, highlightByMode, nodeLabels, className, ascendancyName, bloodlineName, leagueValue, defaultViewMode, elements) {
  const {
    ribbonDots,
    ribbonBar,
    prevBtn,
    nextBtn,
    canvas,
    zoomOutBtn,
    zoomInBtn,
    zoomResetBtn,
    zoomLabel,
    viewTreeBtn,
    viewAscBtn,
    viewBloodBtn,
  } = elements
  const leagueId = normalizeLeagueId(leagueValue)
  const renderer = new TreePreviewRenderer(canvas, { treeDataPath: resolveTreeDataPath(leagueId) })
  let lastViewMode = null
  let stepIndex = guideTreeStepBySection[sectionId] ?? 0
  const resolveViewMode = () => {
    const current = guideTreeViewModeBySection[sectionId]
    if (current === 'tree' || current === 'ascendancy' || current === 'bloodline') return current
    guideTreeViewModeBySection[sectionId] = defaultViewMode
    return defaultViewMode
  }
  const resolveModeState = () => {
    const mode = resolveViewMode()
    const nodeKeys = normalizeArray(
      mode === 'ascendancy'
        ? nodeKeysByMode.ascendancy
        : mode === 'bloodline'
          ? nodeKeysByMode.bloodline
          : nodeKeysByMode.tree
    )
    const stepNodes = normalizeArray(
      mode === 'ascendancy'
        ? stepNodesByMode.ascendancy
        : mode === 'bloodline'
          ? stepNodesByMode.bloodline
          : stepNodesByMode.tree
    )
    const effectiveSteps = stepNodes.length > 0 ? stepNodes : (nodeKeys.length > 0 ? [nodeKeys[0]] : [])
    const highlight = highlightByMode ? highlightByMode[mode] : null
    return { mode, nodeKeys, effectiveSteps, highlight }
  }

  const clampStep = (next) => {
    const { effectiveSteps } = resolveModeState()
    if (effectiveSteps.length === 0) return 0
    return Math.max(0, Math.min(effectiveSteps.length - 1, next))
  }

  const renderRibbon = () => {
    if (!ribbonDots || !ribbonBar) return
    clearEl(ribbonDots)

    const { effectiveSteps } = resolveModeState()
    const total = effectiveSteps.length
    if (total === 0) {
      ribbonBar.style.width = '0%'
      const empty = createEl('div', 'text-[11px] text-muted-foreground', 'No steps for this section.')
      ribbonDots.appendChild(empty)
      if (prevBtn) prevBtn.disabled = true
      if (nextBtn) nextBtn.disabled = true
      return
    }

    stepIndex = clampStep(stepIndex)
    const percent = total <= 1 ? 100 : Math.round((stepIndex / (total - 1)) * 100)
    ribbonBar.style.width = `${percent}%`
    if (prevBtn) prevBtn.disabled = stepIndex <= 0
    if (nextBtn) nextBtn.disabled = stepIndex >= total - 1

    effectiveSteps.forEach((nodeId, idx) => {
      const dot = createEl('button', `tree-ribbon-dot${idx === stepIndex ? ' active' : ''}`)
      dot.type = 'button'
      dot.title = nodeLabels[nodeId] || nodeId
      dot.addEventListener('click', () => {
        setStepIndex(idx)
      })
      ribbonDots.appendChild(dot)
    })
  }

  const updateZoomLabel = () => {
    if (!zoomLabel) return
    zoomLabel.textContent = `${renderer.getZoomPercent()}%`
  }

  const updateViewToggle = () => {
    const mode = resolveViewMode()
    if (viewTreeBtn) viewTreeBtn.classList.toggle('active', mode === 'tree')
    if (viewAscBtn) viewAscBtn.classList.toggle('active', mode === 'ascendancy')
    if (viewBloodBtn) viewBloodBtn.classList.toggle('active', mode === 'bloodline')
  }

  const applyModeZoom = (mode) => {
    const nextMode = mode === 'ascendancy' || mode === 'bloodline' ? mode : 'tree'
    if (lastViewMode === nextMode) return
    lastViewMode = nextMode
    const baseZoom = nextMode === 'tree' ? 1.35 : 0.55
    const targetZoom = nextMode === 'bloodline' ? baseZoom * 1.44 : baseZoom
    renderer.setZoomFactor(targetZoom)
    renderer.defaultZoomFactor = targetZoom
  }

  const renderCanvas = () => {
    const { nodeKeys, effectiveSteps, highlight } = resolveModeState()
    applyModeZoom(resolveViewMode())
    activeGuideTree = {
      renderer,
      nodeKeys,
      className,
      ascendancyName,
      bloodlineName,
      getStepIndex: () => stepIndex,
      getHighlightNodeId: () => effectiveSteps[stepIndex] || null,
      getViewMode: () => resolveViewMode(),
      getSectionHighlight: () => highlight,
    }
    updateZoomLabel()
    updateViewToggle()
    renderActiveGuideTree()
  }

  const setViewMode = (next) => {
    applyModeZoom(next)
    guideTreeViewModeBySection[sectionId] = next
    stepIndex = clampStep(stepIndex)
    renderRibbon()
    requestAnimationFrame(renderCanvas)
  }

  const setStepIndex = (next) => {
    stepIndex = clampStep(next)
    guideTreeStepBySection[sectionId] = stepIndex
    renderRibbon()
    requestAnimationFrame(renderCanvas)
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      setStepIndex(stepIndex - 1)
    })
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      setStepIndex(stepIndex + 1)
    })
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      renderer.zoomBy(-0.1)
      requestAnimationFrame(renderCanvas)
    })
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      renderer.zoomBy(0.1)
      requestAnimationFrame(renderCanvas)
    })
  }

  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
      renderer.resetZoom()
      requestAnimationFrame(renderCanvas)
    })
  }

  if (viewTreeBtn) {
    viewTreeBtn.addEventListener('click', () => {
      setViewMode('tree')
    })
  }

  if (viewAscBtn) {
    viewAscBtn.addEventListener('click', () => {
      setViewMode('ascendancy')
    })
  }

  if (viewBloodBtn) {
    viewBloodBtn.addEventListener('click', () => {
      setViewMode('bloodline')
    })
  }

  if (canvas) {
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey) return
        event.preventDefault()
        renderer.zoomBy(event.deltaY < 0 ? 0.1 : -0.1)
        requestAnimationFrame(renderCanvas)
      },
      { passive: false }
    )
  }

  renderRibbon()
  requestAnimationFrame(renderCanvas)
}

function renderGuideTreeCard(sectionId, nodeKeysByMode, stepNodesByMode, highlightByMode, nodeLabels, className, ascendancyName, bloodlineName, leagueValue, defaultViewMode, hasAsc, hasBloodline) {
  const card = createEl('div', 'rounded-lg border border-border/60 bg-card/40 p-4 shadow-[0_0_25px_rgba(0,0,0,0.45)] space-y-3')

  const header = createEl('div', 'flex items-center justify-between gap-3 flex-wrap')
  const headerLeft = createEl('div', 'space-y-1')
  const totalNodes =
    normalizeArray(nodeKeysByMode.tree).length +
    normalizeArray(nodeKeysByMode.ascendancy).length +
    normalizeArray(nodeKeysByMode.bloodline).length
  headerLeft.appendChild(createEl('div', 'text-base font-semibold', 'Passive Tree Preview'))
  headerLeft.appendChild(createEl('div', 'text-xs text-muted-foreground', `${totalNodes} nodes`))
  header.appendChild(headerLeft)
  const headerRight = createEl('div', 'flex items-center gap-2')
  headerRight.appendChild(createEl('div', 'text-xs text-muted-foreground', 'Allocated nodes highlighted'))

  let viewTreeBtn = null
  let viewAscBtn = null
  let viewBloodBtn = null
  if (hasAsc || hasBloodline) {
    const viewToggle = createEl('div', 'tree-view-toggle')
    viewTreeBtn = createEl('button', 'tree-zoom-btn', 'Tree')
    viewTreeBtn.type = 'button'
    viewTreeBtn.setAttribute('aria-label', 'Show tree nodes')
    viewToggle.appendChild(viewTreeBtn)
    if (hasAsc) {
      viewAscBtn = createEl('button', 'tree-zoom-btn', 'Ascendancy')
      viewAscBtn.type = 'button'
      viewAscBtn.setAttribute('aria-label', 'Show ascendancy nodes')
      viewToggle.appendChild(viewAscBtn)
    }
    if (hasBloodline) {
      viewBloodBtn = createEl('button', 'tree-zoom-btn', 'Bloodline')
      viewBloodBtn.type = 'button'
      viewBloodBtn.setAttribute('aria-label', 'Show bloodline nodes')
      viewToggle.appendChild(viewBloodBtn)
    }
    headerRight.appendChild(viewToggle)
  }

  const zoomControls = createEl('div', 'tree-zoom-controls')
  const zoomOutBtn = createEl('button', 'tree-zoom-btn', '-')
  zoomOutBtn.type = 'button'
  zoomOutBtn.setAttribute('aria-label', 'Zoom out')
  const zoomLabel = createEl('div', 'tree-zoom-label', '100%')
  const zoomInBtn = createEl('button', 'tree-zoom-btn', '+')
  zoomInBtn.type = 'button'
  zoomInBtn.setAttribute('aria-label', 'Zoom in')
  const zoomResetBtn = createEl('button', 'tree-zoom-btn', 'Reset')
  zoomResetBtn.type = 'button'
  zoomResetBtn.setAttribute('aria-label', 'Reset zoom')

  zoomControls.appendChild(zoomOutBtn)
  zoomControls.appendChild(zoomLabel)
  zoomControls.appendChild(zoomInBtn)
  zoomControls.appendChild(zoomResetBtn)
  headerRight.appendChild(zoomControls)
  header.appendChild(headerRight)
  card.appendChild(header)

  const ribbon = createEl('div', 'tree-ribbon')
  const prevBtn = createEl('button', 'tree-step-btn', '<')
  prevBtn.type = 'button'
  prevBtn.setAttribute('aria-label', 'Previous step')
  ribbon.appendChild(prevBtn)

  const center = createEl('div', 'tree-ribbon-center')
  const track = createEl('div', 'tree-ribbon-track')
  const bar = createEl('div', 'tree-ribbon-bar')
  track.appendChild(bar)
  center.appendChild(track)
  const dots = createEl('div', 'tree-ribbon-dots')
  center.appendChild(dots)
  ribbon.appendChild(center)

  const nextBtn = createEl('button', 'tree-step-btn', '>')
  nextBtn.type = 'button'
  nextBtn.setAttribute('aria-label', 'Next step')
  ribbon.appendChild(nextBtn)

  card.appendChild(ribbon)

  const canvasWrap = createEl('div', 'mt-3 tree-canvas')
  const canvas = document.createElement('canvas')
  canvasWrap.appendChild(canvas)
  card.appendChild(canvasWrap)

  setupGuideTreePreview(sectionId, nodeKeysByMode, stepNodesByMode, highlightByMode, nodeLabels, className, ascendancyName, bloodlineName, leagueValue, defaultViewMode, {
    ribbonDots: dots,
    ribbonBar: bar,
    prevBtn,
    nextBtn,
    canvas,
    zoomOutBtn,
    zoomInBtn,
    zoomResetBtn,
    zoomLabel,
    viewTreeBtn,
    viewAscBtn,
    viewBloodBtn,
  })

  return card
}

function renderLiveGuideView(blocks, gearByBlock, treeBySection, general, selectedBlockId = null) {
  clearEl(guideLiveView)
  if (!guideLiveView) return

  const entries = getLiveSectionsFromBlocks(blocks)
  if (entries.length === 0) {
    guideLiveView.appendChild(createEl('div', 'empty-state', 'No captured levels yet.'))
    return
  }

  let activeId = toString(selectedBlockId || activeGuideLiveBlockId)
  if (!activeId || !entries.some((entry) => entry.id === activeId)) {
    activeId = entries[entries.length - 1].id
  }
  activeGuideLiveBlockId = activeId

  let activeIndex = entries.findIndex((entry) => entry.id === activeId)
  if (activeIndex < 0) activeIndex = entries.length - 1
  const activeEntry = entries[activeIndex]
  if (!activeEntry) {
    guideLiveView.appendChild(createEl('div', 'empty-state', 'No captured levels yet.'))
    return
  }

  const controls = createEl('div', 'live-view-controls')
  const controlsHeader = createEl('div', 'live-view-controls-header')
  controlsHeader.appendChild(createEl('div', 'live-view-controls-title', 'Live progression'))
  controlsHeader.appendChild(
    createEl(
      'div',
      'live-view-controls-meta',
      `Level ${activeEntry.level} (${activeIndex + 1}/${entries.length})`
    )
  )
  controls.appendChild(controlsHeader)

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = String(Math.max(0, entries.length - 1))
  slider.step = '1'
  slider.value = String(activeIndex)
  slider.className = 'live-level-slider'
  slider.addEventListener('input', (event) => {
    const rawIndex = Number.parseInt(toString(event?.target?.value), 10)
    const nextIndex = Number.isFinite(rawIndex) ? Math.max(0, Math.min(entries.length - 1, rawIndex)) : 0
    activeGuideLiveBlockId = entries[nextIndex].id
    renderLiveGuideView(
      cachedGuideBlocks,
      cachedGuideGearByBlock,
      cachedGuideTreeBySection,
      cachedGuideGeneral,
      activeGuideLiveBlockId
    )
    renderGuideTopTabs(cachedGuideBlocks, { isLiveBuild: true })
  })
  controls.appendChild(slider)
  guideLiveView.appendChild(controls)

  const section = activeEntry.block
  const treeState = treeBySection?.[section.id] || {}
  const nodeKeysByMode = treeState.orderedKeysByMode || { tree: [], ascendancy: [], bloodline: [] }
  const stepNodesByMode = treeState.stepNodeIdsByMode || { tree: [], ascendancy: [], bloodline: [] }
  const highlightByMode = treeState.highlightByMode || { tree: null, ascendancy: null, bloodline: null }
  const hasAsc = !!treeState.hasAscendancy || nodeKeysByMode.ascendancy.length > 0
  const hasBloodline = !!treeState.hasBloodline || nodeKeysByMode.bloodline.length > 0
  const className = toString(general?.class) || null
  const ascendancyName = toString(general?.ascendancy || general?.ascendancyName) || treeState.ascendancyName || null
  const bloodlineName = toString(general?.bloodline) || treeState.bloodlineName || null

  guideLiveView.appendChild(
    renderGuideTreeCard(
      section.id,
      nodeKeysByMode,
      stepNodesByMode,
      highlightByMode,
      cachedGuideTreeLabels || {},
      className,
      ascendancyName,
      bloodlineName,
      general?.league,
      'tree',
      hasAsc,
      hasBloodline
    )
  )

  const contentGrid = createEl('div', 'live-view-grid')

  const skillsPanel = createEl('div', 'guide-section-panel skills-panel space-y-3')
  skillsPanel.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', 'Skill Gems'))
  const filteredChains = normalizeArray(section?.chains).filter((chain) => hasRenderableSockets(chain))
  renderSkillChains(filteredChains, skillsPanel, { compact: true })
  contentGrid.appendChild(skillsPanel)

  const gearPanel = createEl('div', 'guide-section-panel gear-panel space-y-3')
  gearPanel.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', 'Gear'))
  if (gearByBlock[section.id] && Object.keys(gearByBlock[section.id]).length > 0) {
    const paperdollSlots = buildPaperdollSlots(section.id, gearByBlock)
    gearPanel.appendChild(renderPaperdoll(paperdollSlots))
  } else {
    gearPanel.appendChild(createEl('div', 'empty-state', 'No gear assigned'))
  }
  contentGrid.appendChild(gearPanel)

  guideLiveView.appendChild(contentGrid)
}

function renderGuideSections(blocks, gearByBlock, notesByScope, guideExtraBlocksByBlockId, treeBySection, general, activeSectionId) {
  clearEl(guideSections)
  if (!guideSections) return

  let sections = blocks.length > 0 ? blocks : []
  const gearBlockIds = Object.keys(gearByBlock || {})

  if (sections.length === 0 && gearBlockIds.length === 0) {
    guideSections.appendChild(createEl('div', 'empty-state', 'No guide sections available'))
    return
  }

  if (sections.length === 0) {
    sections.push({
      id: 'global',
      blockTitle: 'General',
      levelRange: { min: '', max: '' },
      chains: [],
    })
  }

  if (activeSectionId) {
    sections = sections.filter((block) => block.id === activeSectionId)
  }

  sections.forEach((block, index) => {
    const section = createEl('div', 'rounded-lg border border-border/60 bg-card/40 p-4 shadow-[0_0_20px_rgba(0,0,0,0.35)] space-y-4')
    const sectionIndex = Math.max(0, blocks.findIndex((entry) => entry.id === block.id))

    const header = createEl('div', 'flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3')
    const title = toString(block.blockTitle) || `Section ${sectionIndex + 1}`
    header.appendChild(createEl('div', 'text-base font-semibold', `Section ${sectionIndex + 1}: ${title}`))

    const rangeText = []
    if (block.levelRange.min || block.levelRange.max) {
      rangeText.push(`Level ${block.levelRange.min || '?'}-${block.levelRange.max || '?'}`)
    }
    if (block.customTitle) rangeText.push(block.customTitle)
    if (block.titleTags && block.titleTags.length > 0) rangeText.push(block.titleTags.join(', '))

    if (rangeText.length > 0) {
      header.appendChild(createEl('div', 'text-xs text-muted-foreground', rangeText.join(' | ')))
    }

    section.appendChild(header)

    const treeState = treeBySection?.[block.id] || {}
    const nodeKeysByMode = treeState.orderedKeysByMode || { tree: [], ascendancy: [], bloodline: [] }
    const stepNodesByMode = treeState.stepNodeIdsByMode || { tree: [], ascendancy: [], bloodline: [] }
    const highlightByMode = treeState.highlightByMode || { tree: null, ascendancy: null, bloodline: null }
    const hasAsc = !!treeState.hasAscendancy || nodeKeysByMode.ascendancy.length > 0
    const hasBloodline = !!treeState.hasBloodline || nodeKeysByMode.bloodline.length > 0
    const defaultViewMode = 'tree'
    const nodeLabels = cachedGuideTreeLabels || {}
    const className = toString(general?.class) || null
    const ascendancyName = toString(general?.ascendancy || general?.ascendancyName) || treeState.ascendancyName || null
    const bloodlineName = toString(general?.bloodline) || treeState.bloodlineName || null
    section.appendChild(
      renderGuideTreeCard(
        block.id,
        nodeKeysByMode,
        stepNodesByMode,
        highlightByMode,
        nodeLabels,
        className,
        ascendancyName,
        bloodlineName,
        general?.league,
        defaultViewMode,
        hasAsc,
        hasBloodline
      )
    )

    const body = createEl('div', 'guide-section-body')

    const skillsPanel = createEl('div', 'guide-section-panel skills-panel space-y-3')
    skillsPanel.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', 'Skill Gems'))
    renderSkillChains(block.chains, skillsPanel, { compact: true })
    body.appendChild(skillsPanel)

    const gearPanel = createEl('div', 'guide-section-panel gear-panel space-y-3')
    gearPanel.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', 'Gear'))
    if (gearByBlock[block.id] && Object.keys(gearByBlock[block.id]).length > 0) {
      const paperdollSlots = buildPaperdollSlots(block.id, gearByBlock)
      gearPanel.appendChild(renderPaperdoll(paperdollSlots))
    } else {
      gearPanel.appendChild(createEl('div', 'empty-state', 'No gear assigned'))
    }
    body.appendChild(gearPanel)

    const notesPanel = createEl('div', 'guide-section-panel notes-panel space-y-3')
    notesPanel.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', 'Notes'))
    const notes = []
    const extraBlocks = normalizeArray(guideExtraBlocksByBlockId?.[block.id])

    if (notesByScope.skills && notesByScope.skills[block.id]) {
      notes.push({ label: 'Skills', text: notesByScope.skills[block.id] })
    }
    if (notesByScope.gear && notesByScope.gear[block.id]) {
      notes.push({ label: 'Gear', text: notesByScope.gear[block.id] })
    }
    if (notesByScope.tree && notesByScope.tree[block.id]) {
      notes.push({ label: 'Tree', text: notesByScope.tree[block.id] })
    }
    if (notesByScope.ascendancy && notesByScope.ascendancy[block.id]) {
      notes.push({ label: 'Ascendancy', text: notesByScope.ascendancy[block.id] })
    }
    if (notesByScope.bloodline && notesByScope.bloodline[block.id]) {
      notes.push({ label: 'Bloodline', text: notesByScope.bloodline[block.id] })
    }

    if (notes.length === 0 && extraBlocks.length === 0) {
      notesPanel.appendChild(createEl('div', 'empty-state', 'No notes for this section'))
    } else {
      notes.forEach((note) => {
        const blockEl = createEl('div', 'rounded-md border border-border/60 bg-muted/20 p-3 space-y-1')
        blockEl.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', note.label))
        blockEl.appendChild(createEl('div', 'text-sm text-muted-foreground whitespace-pre-wrap', toString(note.text)))
        notesPanel.appendChild(blockEl)
      })
      extraBlocks.forEach((block) => {
        const blockEl = createEl('div', 'rounded-md border border-border/60 bg-muted/10 p-3 space-y-1')
        blockEl.appendChild(createEl('div', 'text-xs font-semibold uppercase text-muted-foreground', block.title || 'Additional'))
        blockEl.appendChild(createEl('div', 'text-sm text-muted-foreground whitespace-pre-wrap', toString(block.text)))
        notesPanel.appendChild(blockEl)
      })
    }

    body.appendChild(notesPanel)
    section.appendChild(body)
    guideSections.appendChild(section)
  })
}

function buildPaperdollSlots(blockId, gearByBlock) {
  const selections = gearByBlock[blockId] ?? {}
  return DEFAULT_PAPERDOLL_SLOTS.map((slot) => {
    const selection = selections[slot.id]
    const slug = selection ? getGearSlug(selection) : ''
    const gearItem = slug ? gearItemsBySlug[slug] : null
    const meta = selection && typeof selection.metadata === 'object' ? selection.metadata : {}
    const snapshot =
      meta && typeof meta.gear_item_snapshot === 'object' ? meta.gear_item_snapshot : {}
    const icon = resolveGearImageUrl(gearItem, meta)
    const rarity = resolveGearRarity(gearItem, meta)
    const name =
      toString(selection?.item_name) ||
      toString(meta.name) ||
      toString(snapshot.name) ||
      gearItem?.name ||
      toString(meta.gear_item_slug)
    return { ...slot, icon, rarity, name, meta, gearItem }
  })
}

function renderPaperdoll(slots) {
  const wrapper = createEl('div', 'paperdoll-wrap')
  const grid = createEl('div', 'paperdoll-grid')

  slots.forEach((slot) => {
    const slotEl = createEl('div', `paperdoll-slot${slot.rarity && slot.rarity !== 'normal' ? ` ${slot.rarity}` : ''}`)
    slotEl.style.gridColumn = `${slot.position.col} / span ${slot.size.w}`
    slotEl.style.gridRow = `${slot.position.row} / span ${slot.size.h}`
    if (slot.name) slotEl.title = slot.name

    const label = createEl('div', 'paperdoll-slot-label', slot.label)
    slotEl.appendChild(label)

    if (slot.icon) {
      const img = document.createElement('img')
      img.src = slot.icon
      img.alt = slot.label
      img.className = 'paperdoll-icon'
      slotEl.appendChild(img)
    } else if (slot.name) {
      const name = createEl('div', 'paperdoll-slot-name', slot.name)
      slotEl.appendChild(name)
    } else {
      const empty = createEl('div', 'text-xs text-muted-foreground', 'Empty')
      slotEl.appendChild(empty)
    }

    if (slot.name) {
      attachHoverTooltip(slotEl, () => buildGearTooltip(slot.gearItem, slot.meta, slot.name))
    }

    grid.appendChild(slotEl)
  })

  wrapper.appendChild(grid)
  return wrapper
}

function renderBuildsList() {
  buildsList.innerHTML = ''

  const isFollowingTab = activeBuildTab === 'following'
  const isDiscover = activeBuildTab === 'discover'
  const sourceList = isFollowingTab
    ? followedBuilds
    : isDiscover
      ? getDiscoverSourceList()
      : builds

  if (isDiscover) {
    syncDiscoverFilterOptions(sourceList)
  }

  const list = isDiscover ? applyDiscoverFilters(sourceList) : sourceList

  if (sourceList.length === 0 || list.length === 0) {
    let emptyMessage = 'No builds found. Create a build on the website first!'
    if (isFollowingTab) {
      emptyMessage = 'No followed guides yet. Follow a guide on the website to see it here.'
    } else if (isDiscover) {
      emptyMessage =
        sourceList.length === 0
          ? 'No public guides or live builds available right now.'
          : 'No public guides or live builds match your current filters.'
    }
    buildsList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`
    return
  }

  list.forEach((build) => {
    const buildId = toString(build?.id)
    if (!buildId) return
    const card = createEl('div', 'build-card')
    card.onclick = () => loadBuild(buildId)

    const isRunSelected = activeRunBuildId && buildId === activeRunBuildId
    if (isRunSelected) {
      card.classList.add('run-selected')
    }

    if (currentBuildData && currentBuildData.build && currentBuildData.build.id === buildId) {
      card.classList.add('active')
    }

    const header = createEl('div', 'flex items-center justify-between gap-3')
    const titleWrap = createEl('div', 'flex items-center gap-2')
    titleWrap.appendChild(createEl('div', 'build-title', toString(build?.name) || 'Untitled build'))
    const statusText = isDiscover ? discoverBuildType(build) : (toString(build?.status) || 'draft')
    const status = createEl('span', `build-status-pill${statusText === 'published' ? ' published' : ''}`, statusText)
    titleWrap.appendChild(status)
    header.appendChild(titleWrap)

    if (!isDiscover) {
      const runToggle = createEl('label', 'build-run-toggle')
      const runInput = document.createElement('input')
      runInput.type = 'checkbox'
      runInput.className = 'build-run-toggle-input'
      runInput.checked = isRunSelected
      const runTrack = createEl('span', 'build-run-toggle-track')
      const runThumb = createEl('span', 'build-run-toggle-thumb')
      runTrack.appendChild(runThumb)
      runToggle.appendChild(runInput)
      runToggle.appendChild(runTrack)
      runInput.addEventListener('change', (event) => {
        event.stopPropagation()
        if (runInput.checked) {
          void setActiveRunBuild(build)
        } else if (activeRunBuildId === buildId) {
          void clearActiveRunBuild()
        }
      })
      runToggle.addEventListener('click', (event) => {
        event.stopPropagation()
      })
      runToggle.addEventListener('mousedown', (event) => {
        event.stopPropagation()
      })
      runInput.addEventListener('click', (event) => {
        event.stopPropagation()
      })
      header.appendChild(runToggle)
    }

    card.appendChild(header)

    if (isDiscover) {
      const layout = createEl('div', 'discover-card-layout')
      const imageWrap = createEl('div', 'discover-card-image-wrap')
      const image = document.createElement('img')
      image.className = 'discover-card-image'
      image.alt = toString(build?.ascendancy || build?.className || 'Build')
      image.src = resolveDiscoverImageUrl(build)
      image.onerror = () => {
        if (image.src !== DISCOVER_IMAGE_FALLBACK) {
          image.src = DISCOVER_IMAGE_FALLBACK
        }
      }
      imageWrap.appendChild(image)
      layout.appendChild(imageWrap)

      const content = createEl('div', 'discover-card-content')
      const creator = toString(build?.creatorName) || 'Unknown creator'
      const updatedAt = formatDiscoverDate(build)
      content.appendChild(createEl('div', 'discover-card-meta', `by ${creator} - Updated ${updatedAt}`))

      const tags = createEl('div', 'discover-tag-list')
      if (build?.className) tags.appendChild(makeDiscoverTag(`Class: ${build.className}`))
      if (build?.ascendancy) tags.appendChild(makeDiscoverTag(`Asc: ${build.ascendancy}`))
      if (build?.mainSkill) tags.appendChild(makeDiscoverTag(`Skill: ${build.mainSkill}`))
      content.appendChild(tags)

      const isLiveDiscover = discoverBuildType(build) === 'live'
      const fallbackDescription =
        isLiveDiscover
          ? 'Live build in progress. Follow to track changes level by level.'
          : 'No description yet.'
      content.appendChild(createEl('div', 'discover-card-description', buildDiscoverSnippet(build?.descriptionHtml, fallbackDescription)))

      if (!isLiveDiscover) {
        const metrics = createEl('div', 'discover-metrics')
        DISCOVER_RATING_FIELDS.forEach(([ratingKey, label]) => {
          const ratingValue = toNumber(build?.ratings?.[ratingKey])
          metrics.appendChild(makeDiscoverMetric(label, ratingValue == null ? '-' : String(Math.round(ratingValue))))
        })
        content.appendChild(metrics)

        const viability = createEl('div', 'discover-viability')
        if (build?.viability?.ssfViable) viability.appendChild(makeDiscoverTag('SSF'))
        if (build?.viability?.hardcoreViable) viability.appendChild(makeDiscoverTag('Hardcore'))
        if (build?.viability?.controllerFriendly) viability.appendChild(makeDiscoverTag('Controller'))
        if (viability.childElementCount > 0) {
          content.appendChild(viability)
        }
      }

      layout.appendChild(content)
      card.appendChild(layout)
    } else {
      const hasPublished = Boolean(build?.published_version_at)
      const dateLabel = hasPublished ? 'Published' : 'Created'
      const dateValue = hasPublished ? build?.published_version_at : build?.created_at
      const dateText = dateValue ? new Date(dateValue).toLocaleDateString() : '-'
      const date = createEl('div', 'mt-2 build-meta text-muted-foreground', `${dateLabel}: ${dateText}`)
      card.appendChild(date)
    }

    if (isDiscover) {
      const actions = createEl('div', 'build-card-actions')
      const isFollowed = followedBuildIds.has(buildId)
      const followBtn = createEl('button', `build-follow-btn${isFollowed ? ' followed' : ''}`, isFollowed ? 'Following' : 'Follow')
      followBtn.type = 'button'
      followBtn.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        followBtn.disabled = true
        try {
          const result = await invokeWithTimeout('api:set-guide-follow', {
            buildId,
            follow: !isFollowed,
          })
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to update follow state')
          }
          await loadFollowedGuides()
          await loadPublicGuides()
          await loadPublicLiveBuilds()
          renderBuildsList()
        } catch (error) {
          console.error('Failed to update follow state:', error)
          alert(`Error updating follow state: ${error.message}`)
        } finally {
          followBtn.disabled = false
        }
      })
      actions.appendChild(followBtn)
      card.appendChild(actions)
    }

    buildsList.appendChild(card)
  })
}

async function loadGearItemMetadata(gearByBlock) {
  gearItemsLoading = true
  gearItemsError = null
  const loadSeq = ++gearLoadSeq

  const slugs = new Set()
  Object.values(gearByBlock || {}).forEach((slots) => {
    Object.values(slots || {}).forEach((item) => {
      const slug = getGearSlug(item)
      if (slug) slugs.add(slug)
    })
  })

  const slugList = Array.from(slugs)
  if (slugList.length === 0) {
    gearItemsLoading = false
    return
  }

  const missing = slugList.filter((slug) => !gearItemCache.has(slug))

  if (missing.length > 0) {
    try {
      const result = await invokeWithTimeout('api:get-gear-items', missing)
      if (result?.success) {
        const items = result?.data?.items || []
        normalizeArray(items).forEach((item) => {
          if (item && item.slug) gearItemCache.set(String(item.slug), item)
        })
      } else if (loadSeq === gearLoadSeq) {
        gearItemsError = result?.error || 'Failed to load gear items.'
      }
    } catch (error) {
      if (loadSeq === gearLoadSeq) {
        gearItemsError = error.message || 'Failed to load gear items.'
      }
    }
  }

  if (loadSeq === gearLoadSeq) {
    const next = {}
    slugList.forEach((slug) => {
      if (gearItemCache.has(slug)) next[slug] = gearItemCache.get(slug)
    })
    gearItemsBySlug = next
    gearItemsLoading = false
  }
}

async function buildGuideContext(data) {
  const snapshot =
    data.publishedVersion && typeof data.publishedVersion.snapshot === 'object'
      ? data.publishedVersion.snapshot
      : null
  const snapshotMeta = snapshot && typeof snapshot.meta === 'object' ? snapshot.meta : null
  const itemMeta = getMetaFromItems(data.items)
  const meta = snapshotMeta ? mergeMetaWithFallback(snapshotMeta, itemMeta) : itemMeta
  const general = meta && typeof meta.general === 'object' ? meta.general : {}
  const notesByScope = normalizeNotesByScope(meta)
  const guideExtraBlocksByBlockId = normalizeGuideExtraBlocks(meta)
  const skillBlocksSource = Array.isArray(snapshot?.skillBlocks) ? snapshot.skillBlocks : data.skillBlocks
  const itemsSource = Array.isArray(snapshot?.items) ? snapshot.items : data.items
  const blocks = normalizeSkillBlocks(skillBlocksSource)
  const gearByBlock = groupGearItems(itemsSource)
  const selectionOrder = Array.isArray(snapshot?.treeSelectionOrder)
    ? snapshot.treeSelectionOrder.filter((id) => typeof id === 'string' || typeof id === 'number').map(String)
    : null
  const tree = buildTreeData(data, selectionOrder)
  const treeNodeMetaById = await loadTreeNodeMetaById(general?.league)
  const guideTree = buildGuideTreeBySection(blocks, tree, meta, treeNodeMetaById, general)
  const banditChoice = toString(snapshotMeta?.tree?.banditChoice || meta?.tree?.banditChoice || 'kill_all')

  return {
    snapshotMeta,
    meta,
    general,
    notesByScope,
    guideExtraBlocksByBlockId,
    itemsSource,
    blocks,
    gearByBlock,
    guideTree,
    banditChoice,
  }
}

async function renderBuildDetails() {
  const data = currentBuildData
  if (!data) return

  activeGuideBuildType = resolveBuildTypeFromData(data)
  guideTopTab = activeGuideBuildType === 'live' ? 'live' : 'general'
  activeGuideSectionId = null
  activeGuideLiveBlockId = null
  buildName.textContent = data.build.name || 'Untitled Build'
  buildStatus.textContent = data.build.status || 'draft'
  buildStatus.classList.toggle('published', data.build.status === 'published')
  buildDate.textContent = `Created: ${new Date(data.build.created_at).toLocaleDateString()}`

  const context = await buildGuideContext(data)
  const {
    meta,
    general,
    notesByScope,
    guideExtraBlocksByBlockId,
    itemsSource,
    blocks,
    gearByBlock,
    guideTree,
    banditChoice,
  } = context

  cachedGuideBlocks = blocks
  cachedGuideGearByBlock = gearByBlock
  cachedGuideNotesByScope = notesByScope
  cachedGuideExtraBlocksByBlockId = guideExtraBlocksByBlockId
  cachedGuideTreeBySection = guideTree.bySection
  cachedGuideTreeLabels = guideTree.labelByKey || {}
  cachedGuideGeneral = general
  guideTreeStepBySection = {}
  guideTreeViewModeBySection = {}

  renderGuideTopTabs(blocks, { isLiveBuild: activeGuideBuildType === 'live' })
  const overallLevelRange = getOverallLevelRange(blocks)
  renderGuideOverview(meta, general, {
    buildName: toString(data.build?.name),
    itemCount: normalizeArray(itemsSource).filter((item) => item && item.slot && !String(item.slot).startsWith('meta:')).length,
    skillBlockCount: blocks.length,
    nodeCount: normalizeArray(data.nodes).length,
    stepCount: normalizeArray(data.steps).length,
    publishedAt: data.publishedVersion?.published_at || null,
    versionNumber: data.publishedVersion?.version_number ?? null,
    creatorName: toString(general.creatorName),
    mainSkill: toString(general.mainSkill),
    playstyles: Array.isArray(general.playstyles) ? general.playstyles.filter((v) => typeof v === 'string') : [],
    levelRange: overallLevelRange,
  })

  renderGuideSections(blocks, gearByBlock, notesByScope, guideExtraBlocksByBlockId, guideTree.bySection, general, activeGuideSectionId)
  renderLiveGuideView(blocks, gearByBlock, guideTree.bySection, general, activeGuideLiveBlockId)

  seedGearItemCache(data.gearItems)
  await loadGearItemMetadata(gearByBlock)
  try {
    const resolvedGearByBlock = buildResolvedGearByBlock(gearByBlock)
    await invokeWithTimeout('build:setActiveGuideState', {
      buildId: data.build.id,
      buildName: data.build.name,
      buildType: resolveBuildTypeFromData(data),
      blocks,
      gearByBlock: resolvedGearByBlock,
      guideTreeBySection: guideTree.bySection,
      guideTreeLabels: guideTree.labelByKey || {},
      general,
      banditChoice,
    })
  } catch (err) {
    console.warn('[Build Overlay] Failed to share guide state:', err)
  }
  renderGuideSections(blocks, gearByBlock, notesByScope, guideExtraBlocksByBlockId, guideTree.bySection, general, activeGuideSectionId)
  renderLiveGuideView(blocks, gearByBlock, guideTree.bySection, general, activeGuideLiveBlockId)
}

function updateActiveRunGuideLabel(name) {
  if (!activeRunGuideName) return
  activeRunGuideName.textContent = name || 'None selected'
}

async function clearActiveRunBuild() {
  try {
    await invokeWithTimeout('build:setActiveGuideState', null)
  } catch (err) {
    console.warn('Failed to clear guide state:', err)
  }
  try {
    await invokeWithTimeout('build:saveBuild', null)
  } catch (err) {
    console.warn('Failed to clear run build:', err)
  }
  activeRunBuildId = null
  updateActiveRunGuideLabel('None selected')
  renderBuildsList()
}

async function setActiveRunBuild(build) {
  const buildId = build?.id
  if (!buildId) return

  try {
    const data =
      currentBuildData && currentBuildData.build && currentBuildData.build.id === buildId
        ? currentBuildData
        : null

    let buildData = data
    if (!buildData) {
      const result = await invokeWithTimeout('api:get-build', buildId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to load build')
      }
      buildData = result.data
    }

    const context = await buildGuideContext(buildData)
    const { blocks, gearByBlock, guideTree, general, banditChoice } = context

    seedGearItemCache(buildData.gearItems)
    await loadGearItemMetadata(gearByBlock)

    const resolvedGearByBlock = buildResolvedGearByBlock(gearByBlock)
    await invokeWithTimeout('build:setActiveGuideState', {
      buildId: buildData.build.id,
      buildName: buildData.build.name,
      buildType: resolveBuildTypeFromData(buildData, build),
      blocks,
      gearByBlock: resolvedGearByBlock,
      guideTreeBySection: guideTree.bySection,
      guideTreeLabels: guideTree.labelByKey || {},
      general,
      banditChoice,
    })

    await invokeWithTimeout('build:saveBuild', {
      id: buildData.build.id,
      name: buildData.build.name,
    })

    activeRunBuildId = buildData.build.id
    updateActiveRunGuideLabel(buildData.build.name || 'Selected build')
    renderBuildsList()
  } catch (error) {
    console.error('Failed to set run build:', error)
    alert(`Error setting run build: ${error.message}`)
  }
}

async function loadBuilds() {
  try {
    buildsList.innerHTML = '<div class="loading">Loading your builds...</div>'

    const result = await invokeWithTimeout('api:get-builds')

    if (!result.success) {
      throw new Error(result.error || 'Failed to load builds')
    }

    builds = result.data.builds || []
    renderBuildsList()
  } catch (error) {
    console.error('Failed to load builds:', error)
    renderBuildsListError(error?.message)
  }
}

async function loadFollowedGuides() {
  try {
    const result = await invokeWithTimeout('api:get-followed-guides')

    if (!result.success) {
      throw new Error(result.error || 'Failed to load followed guides')
    }

    followedBuilds = result.data.builds || []
    followedBuildIds = new Set(followedBuilds.map((build) => toString(build?.id)).filter(Boolean))
    renderBuildsList()
  } catch (error) {
    console.error('Failed to load followed guides:', error)
    if (activeBuildTab === 'following') {
      renderBuildsListError(error?.message)
    }
  }
}

async function loadPublicLiveBuilds() {
  try {
    const result = await invokeWithTimeout('api:get-public-live-builds')
    if (!result.success) {
      throw new Error(result.error || 'Failed to load public live builds')
    }
    publicLiveBuilds = result?.data?.builds || []
    renderBuildsList()
  } catch (error) {
    console.error('Failed to load public live builds:', error)
    if (activeBuildTab === 'discover') {
      renderBuildsListError(error?.message)
    }
  }
}

async function loadPublicGuides() {
  try {
    const result = await invokeWithTimeout('api:get-public-guides')
    if (!result.success) {
      throw new Error(result.error || 'Failed to load public guides')
    }
    publicGuideBuilds = result?.data?.builds || []
    renderBuildsList()
  } catch (error) {
    console.error('Failed to load public guides:', error)
    if (activeBuildTab === 'discover') {
      renderBuildsListError(error?.message)
    }
  }
}

async function loadBuild(buildId) {
  try {
    const result = await invokeWithTimeout('api:get-build', buildId)

    if (!result.success) {
      throw new Error(result.error || 'Failed to load build')
    }

    currentBuildData = result.data

    buildSelector.classList.add('hidden')
    buildDetails.classList.remove('hidden')

    await renderBuildDetails()
    renderBuildsList()
  } catch (error) {
    console.error('Failed to load build:', error)
    alert(`Error loading build: ${error.message}`)
  }
}

async function initialize() {
  const auth = await invokeWithTimeout('auth:check')
  if (!auth.authenticated) {
    if (userStatus) {
      userStatus.textContent = 'Not logged in'
    }
    buildsList.innerHTML = '<div class="error-state">Please login to view your builds</div>'
    return
  }

  currentUser = auth.user
  if (userStatus) {
    userStatus.textContent = `Logged in as ${auth.email}`
  }

  try {
    const savedRun = await invokeWithTimeout('build:getActiveBuild')
    if (savedRun && savedRun.id) {
      activeRunBuildId = savedRun.id
      updateActiveRunGuideLabel(savedRun.name || 'Selected build')
    } else {
      updateActiveRunGuideLabel('None selected')
    }
  } catch (err) {
    updateActiveRunGuideLabel('None selected')
  }

  syncBuildTabs()
  syncDiscoverFiltersVisibility()
  await loadBuilds()
  await loadFollowedGuides()
  await loadPublicGuides()
  await loadPublicLiveBuilds()
}

if (backBtn) {
  backBtn.addEventListener('click', () => {
  if (!buildDetails.classList.contains('hidden')) {
    buildDetails.classList.add('hidden')
    buildSelector.classList.remove('hidden')
  }
  })
}

window.addEventListener('resize', () => {
  renderActiveGuideTree()
})

if (buildTabMine) {
  buildTabMine.addEventListener('click', () => {
    console.log('[BUILD_OVERLAY] tab click: mine')
    setActiveBuildTab('mine')
  })
}
if (buildTabFollowing) {
  buildTabFollowing.addEventListener('click', () => {
    console.log('[BUILD_OVERLAY] tab click: following')
    setActiveBuildTab('following')
  })
}
if (buildTabDiscover) {
  buildTabDiscover.addEventListener('click', () => {
    console.log('[BUILD_OVERLAY] tab click: discover')
    setActiveBuildTab('discover')
  })
}
if (discoverSearchInput) {
  discoverSearchInput.addEventListener('input', () => renderBuildsList())
}
if (discoverTypeFilter) {
  discoverTypeFilter.addEventListener('change', () => renderBuildsList())
}
if (discoverClassFilter) {
  discoverClassFilter.addEventListener('change', () => renderBuildsList())
}
if (discoverSkillFilter) {
  discoverSkillFilter.addEventListener('change', () => renderBuildsList())
}

ipcRenderer.on('build:localLevelUp', (_event, payload) => {
  const level = Number(payload?.level)
  void refreshActiveRunBuildIfNeeded({
    reason: 'local-level-up',
    playerLevel: Number.isFinite(level) ? level : null,
    force: false,
  })
})

initialize()
  .then(() =>
    refreshActiveRunBuildIfNeeded({
      reason: 'startup',
      force: true,
    })
  )
  .catch((error) => {
    console.warn('[Build Overlay] Startup live refresh failed:', error)
  })

})()


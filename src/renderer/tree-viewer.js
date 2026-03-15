let fs = null
let fileURLToPath = null
let path = null
if (typeof require !== 'undefined') {
  try {
    fs = require('fs')
    ;({ fileURLToPath } = require('url'))
    path = require('path')
  } catch {}
}

const ORBIT_RADII = [0, 82, 162, 335, 493, 662, 846]
const SKILLS_PER_ORBIT = [1, 6, 16, 16, 40, 72, 72]
const BLOODLINE_MIN_RADIUS = 624
const BLOODLINE_SCALE = 1.44
const BLOODLINE_VIEW_ZOOM_BOOST = BLOODLINE_SCALE
const RELIQUARIAN_VIEW_ZOOM_BOOST = 1.2

const CLASSES = [
  { id: 0, name: 'Scion', groupId: '399', background: null },
  { id: 1, name: 'Marauder', groupId: '500', background: 'BackgroundStr.png' },
  { id: 2, name: 'Ranger', groupId: '393', background: 'BackgroundDex.png' },
  { id: 3, name: 'Witch', groupId: '285', background: 'BackgroundInt.png' },
  { id: 4, name: 'Duelist', groupId: '501', background: 'BackgroundStrDex.png' },
  { id: 5, name: 'Templar', groupId: '388', background: 'BackgroundStrInt.png' },
  { id: 6, name: 'Shadow', groupId: '284', background: 'BackgroundDexInt.png' },
]

const CLASS_NAME_TO_ID = new Map(CLASSES.map((entry) => [entry.name.toLowerCase(), entry.id]))
const BLOODLINE_CLASS_KEYS = new Set([
  'ClassesLycia',
  'ClassesAul',
  'ClassesFarrul',
  'ClassesCatarina',
  'ClassesNecromantic',
  'ClassesOshabi',
  'ClassesKingInTheMists',
  'ClassesOlroth',
  'ClassesTrialmaster',
  'ClassesBreachlord',
  'ClassesDelirious',
  'ClassesWarlock',
  'ClassesWarden',
  'ClassesPrimalist',
])
const BLOODLINE_NAMES = new Set(Array.from(BLOODLINE_CLASS_KEYS).map((key) => key.replace(/^Classes/, '').toLowerCase()))

const HIDDEN_NODE_IDS = new Set([
  '58833',
  '44683',
  '54447',
  '61525',
  '47175',
  '50986',
  '50459',
])

const NODE_FRAMES = {
  allocated: {
    small: 'PSSkillFrameActive.png',
    notable: 'NotableFrameAllocated.png',
    keystone: 'KeystoneFrameAllocated.png',
    jewel: 'JewelFrameAllocated.png',
    mastery: 'PSSkillFrameActive.png',
  },
  unallocated: {
    small: 'PSSkillFrame.png',
    notable: 'NotableFrameUnallocated.png',
    keystone: 'KeystoneFrameUnallocated.png',
    jewel: 'JewelFrameUnallocated.png',
    mastery: 'PSSkillFrame.png',
  },
}

const LINE_CONNECTOR_ACTIVE = 'LineConnectorActive.png'
const BACKGROUND_TILE = 'poe-background.png'

function getNodeTint(iconPath) {
  if (!iconPath) return '#7e8696'
  const lower = iconPath.toLowerCase()
  if (lower.includes('dex')) return '#56b64f'
  if (lower.includes('str')) return '#c44732'
  if (lower.includes('int')) return '#5aa0ff'
  if (lower.includes('chaos') || lower.includes('poison')) return '#94c87d'
  if (lower.includes('fire')) return '#f7963b'
  if (lower.includes('cold')) return '#7bc5ff'
  if (lower.includes('lightning')) return 'var(--accent-yellow)'
  return '#7e8696'
}

function resolveClassData(className) {
  if (!className) return null
  const id = CLASS_NAME_TO_ID.get(String(className).toLowerCase())
  if (id == null) return null
  return CLASSES.find((entry) => entry.id === id) || null
}

function joinUrl(base, path) {
  const safeBase = base.endsWith('/') ? base : `${base}/`
  return `${safeBase}${String(path || '').replace(/^\/+/, '')}`
}

function resolveUrl(relativePath) {
  return new URL(relativePath, window.location.href).toString()
}

async function loadJson(relativePath) {
  const url = resolveUrl(relativePath)
  try {
    const response = await fetch(url, { cache: 'force-cache' })
    if (!response.ok) throw new Error(`Failed to load ${relativePath}`)
    return await response.json()
  } catch (err) {
    if (fs) {
      try {
        if (fileURLToPath) {
          const filePath = fileURLToPath(url)
          const raw = fs.readFileSync(filePath, 'utf8')
          return JSON.parse(raw)
        }
      } catch {}
      try {
        if (path && typeof __dirname === 'string') {
          const filePath = path.resolve(__dirname, relativePath)
          const raw = fs.readFileSync(filePath, 'utf8')
          return JSON.parse(raw)
        }
      } catch {}
    }
    throw err
  }
}

function normalizeTreeData(raw) {
  const groups = { ...(raw?.groups || {}) }
  const groupOverrides = raw?.positionOverrides?.groups || {}

  Object.entries(groupOverrides).forEach(([groupId, override]) => {
    if (!groups[groupId]) return
    if (typeof override?.x === 'number') groups[groupId].x = override.x
    if (typeof override?.y === 'number') groups[groupId].y = override.y
  })

  const nodes = {}
  const nodeOverrides = raw?.positionOverrides?.nodes || {}

  const computePosition = (node) => {
    if (!node || node.group == null) return null
    const group = groups[String(node.group)]
    if (!group || typeof group.x !== 'number' || typeof group.y !== 'number') return null

    const orbit = Math.max(0, Math.min(ORBIT_RADII.length - 1, node.orbit ?? 0))
    const orbitIndex = node.orbitIndex ?? 0
    const radius = ORBIT_RADII[orbit] ?? ORBIT_RADII[0]
    const perOrbit = SKILLS_PER_ORBIT[orbit] ?? SKILLS_PER_ORBIT[SKILLS_PER_ORBIT.length - 1]
    const angle = (orbitIndex * (2 * Math.PI / perOrbit)) - Math.PI / 2
    return {
      x: group.x + radius * Math.cos(angle),
      y: group.y + radius * Math.sin(angle),
    }
  }

  Object.entries(raw?.nodes || {}).forEach(([nodeId, node]) => {
    if (HIDDEN_NODE_IDS.has(nodeId)) return
    const next = { ...(node || {}) }

    if (next.group === 399 && next.orbit === 3) {
      next.orbit = 2
    }

    const pos = computePosition(next)
    if (pos) {
      next.x = pos.x
      next.y = pos.y
    }

    const override = nodeOverrides[nodeId]
    if (override) {
      if (typeof override.x === 'number') next.x = override.x
      if (typeof override.y === 'number') next.y = override.y
    }

    nodes[nodeId] = next
  })

  return { ...raw, groups, nodes }
}

function buildSpriteCoordsByFilename(coords) {
  const result = {}
  if (!coords) return result
  Object.entries(coords).forEach(([key, value]) => {
    const filename = key.split('/').pop()
    if (!filename) return
    if (!result[filename]) result[filename] = value
  })
  return result
}

function normalizeTreeAssetFile(filename) {
  const raw = String(filename || '').trim()
  if (!raw) return null
  return raw.split('/').pop()?.split('?')[0] || null
}

function buildBloodlineCoordsFromTreeData(raw) {
  const sprites = raw?.sprites
  if (!sprites || typeof sprites !== 'object') return {}
  const result = {}

  Object.entries(sprites).forEach(([groupKey, variant]) => {
    if (!String(groupKey || '').toLowerCase().includes('bloodline')) return
    if (!variant || typeof variant !== 'object') return
    const sheetKeys = Object.keys(variant)
    if (!sheetKeys.length) return
    const bestKey = sheetKeys
      .map((key) => ({ key, value: Number(key) }))
      .sort((a, b) => (b.value || 0) - (a.value || 0))[0]?.key || sheetKeys[0]
    const sheetData = variant[bestKey]
    if (!sheetData || typeof sheetData !== 'object' || !sheetData.coords) return
    const sheetName = normalizeTreeAssetFile(sheetData.filename) || 'bloodline-4.webp'
    Object.entries(sheetData.coords).forEach(([iconPath, coords]) => {
      if (!String(iconPath || '').startsWith('Classes')) return
      result[iconPath] = { ...coords, sheet: sheetName }
    })
  })

  return result
}

function getSheetVariant(fileName) {
  const normalized = String(fileName || '').split('/').pop().split('?')[0]
  const match = normalized.match(/-(\d+)\.[^.]+$/)
  return {
    name: normalized,
    variant: match ? Number(match[1]) : -1,
  }
}

function buildSheetVariantIndex(coords) {
  const result = {
    bloodline: 'bloodline-4.webp',
    ascendancy: 'ascendancy-4.webp',
  }

  Object.values(coords || {}).forEach((value) => {
    const sheet = value?.sheet
    if (!sheet) return
    const parsed = getSheetVariant(sheet)
    if (!parsed.name) return
    if (/^bloodline-\d+\.webp$/i.test(parsed.name)) {
      const current = getSheetVariant(result.bloodline)
      if (parsed.variant >= current.variant) {
        result.bloodline = parsed.name
      }
    }
    if (/^ascendancy-\d+\.webp$/i.test(parsed.name)) {
      const current = getSheetVariant(result.ascendancy)
      if (parsed.variant >= current.variant) {
        result.ascendancy = parsed.name
      }
    }
  })

  return result
}

function normalizeAscName(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeBloodlineName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const stripped = raw.replace(/\s*Bloodline\s*$/i, '').trim()
  const compact = stripped.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const alias = {
    nameless: 'kinginthemists',
    kinginthemists: 'kinginthemists',
    chaos: 'trialmaster',
    saresh: 'necromantic',
  }
  const resolved = alias[compact] || compact
  for (const key of BLOODLINE_CLASS_KEYS) {
    const name = key.replace(/^Classes/, '')
    const candidate = name.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (candidate === resolved) return name
  }
  return stripped
}

function resolveBloodlineKey(value) {
  const normalized = normalizeBloodlineName(value)
  if (!normalized) return null
  const compact = normalized.replace(/[^a-z0-9]/gi, '').toLowerCase()
  for (const key of BLOODLINE_CLASS_KEYS) {
    const name = key.replace(/^Classes/, '')
    const candidate = name.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (candidate === compact) return name
  }
  return normalized
}

function stripBloodlineSuffix(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.replace(/\s*Bloodline\s*$/i, '').trim()
}

function compactAscName(value) {
  return String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function isBloodlineAsc(ascName, selectedBloodline) {
  const asc = normalizeAscName(ascName)
  if (!asc) return false
  return asc.includes('bloodline')
    || BLOODLINE_NAMES.has(asc)
    || (() => {
      const key = resolveBloodlineKey(selectedBloodline)
      if (!key) return false
      const target = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
      const ascCompact = asc.replace(/[^a-z0-9]/gi, '').toLowerCase()
      return ascCompact === target || ascCompact.includes(target) || target.includes(ascCompact)
    })()
}

class TreePreviewRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas?.getContext('2d') || null
    this.assetsBase = options.assetsBase || '../assets'
    this.treeAssetsBase = options.treeAssetsBase || '../assets/tree-assets'
    this.treeDataPath = options.treeDataPath || '../assets/tree-data.json'
    this.spriteCoordsPath = options.spriteCoordsPath || '../assets/tree-assets/sprite-coords.json'
    this.loadedImages = new Map()
    this.spriteCoords = null
    this.spriteCoordsByFilename = null
    this.sheetVariants = { bloodline: 'bloodline-4.webp' }
    this.treeData = null
    this.ready = false
    this.loading = false
    this.pendingNodes = []
    this.viewWidth = 0
    this.viewHeight = 0
    this.lastZoom = 0.08
    this.zoomFactor = typeof options.zoomFactor === 'number' ? options.zoomFactor : 1.35
    this.minZoom = typeof options.minZoom === 'number' ? options.minZoom : 0.05
    this.maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : 0.5
    this.defaultZoomFactor = this.zoomFactor
    this.transparentBackground = options.transparentBackground === true
    this.panOffset = { x: 0, y: 0 }
    this.isPanning = false
    this.panStart = null
    this.panOrigin = null
    this.lastCenteredNodeId = null
    this.highlightNodeId = null
    this.highlightNodeIds = null
    this.visibleNodeIds = null
    this.inactiveNodeIds = null
    this.sectionHighlight = null
    this.masterySelections = {}
    this.highlightStyle = {
      ringScale: typeof options.highlightRingScale === 'number' ? options.highlightRingScale : 0.6,
      ringWidth: typeof options.highlightRingWidth === 'number' ? options.highlightRingWidth : 3,
      ringColor: typeof options.highlightRingColor === 'string' ? options.highlightRingColor : 'rgba(125, 211, 252, 0.9)',
      glowColor: typeof options.highlightGlowColor === 'string' ? options.highlightGlowColor : 'rgba(125, 211, 252, 0.9)',
      glowBlur: typeof options.highlightGlowBlur === 'number' ? options.highlightGlowBlur : 30,
      fillColor: typeof options.highlightFillColor === 'string' ? options.highlightFillColor : null,
      outerScale: typeof options.highlightOuterScale === 'number' ? options.highlightOuterScale : null,
    }
    this.selectedClassName = null
    this.selectedAscendancyName = null
    this.selectedBloodlineName = null
    this.activeAscendancyName = null
    this.showAllNodes = false
    this.backgroundPattern = null
    this.screenNodes = []
    this.hoveredNodeId = null
    this.tooltipEl = null
    this.renderOnLoadUrls = new Set()
    this.lastRenderOptions = null
    this.renderRetryCount = 0
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handleMouseLeave = this.handleMouseLeave.bind(this)
    this.installHoverHandlers()
  }

  getZoomPercent() {
    return Math.round(this.zoomFactor * 100)
  }

  setZoomFactor(next) {
    if (!Number.isFinite(next)) return
    const clamped = Math.max(0.4, Math.min(3, next))
    this.zoomFactor = clamped
  }

  zoomBy(delta) {
    if (!Number.isFinite(delta)) return
    this.setZoomFactor(this.zoomFactor + delta)
  }

  resetZoom() {
    this.zoomFactor = this.defaultZoomFactor
  }

  assetUrl(fileName) {
    return resolveUrl(joinUrl(this.treeAssetsBase, fileName))
  }

  async loadImage(url) {
    if (this.loadedImages.has(url)) return this.loadedImages.get(url)
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.loadedImages.set(url, img)
        resolve(img)
      }
      img.onerror = () => reject(new Error(`Failed to load ${url}`))
      img.src = url
    })
  }

  queueRenderOnLoad(url) {
    if (!url || this.loadedImages.has(url)) return
    if (this.renderOnLoadUrls.has(url)) return
    this.renderOnLoadUrls.add(url)
    this.loadImage(url)
      .then(() => {
        this.renderOnLoadUrls.delete(url)
        this.render(this.pendingNodes, this.lastRenderOptions || {})
      })
      .catch(() => {
        this.renderOnLoadUrls.delete(url)
      })
  }

  async preloadImages() {
    const files = [
      BACKGROUND_TILE,
      'ascendancy-background-3.png',
      this.sheetVariants?.ascendancy || 'ascendancy-4.webp',
      this.sheetVariants?.bloodline || 'bloodline-4.webp',
      'PSSkillFrameActive.png',
      'PSSkillFrame.png',
      'NotableFrameAllocated.png',
      'NotableFrameUnallocated.png',
      'KeystoneFrameAllocated.png',
      'KeystoneFrameUnallocated.png',
      'JewelFrameAllocated.png',
      'JewelFrameUnallocated.png',
      'LineConnectorActive.png',
      'LineConnectorNormal.png',
      'LineConnectorIntermediate.png',
      'Orbit1Normal.png',
      'Orbit1Active.png',
      'Orbit2Normal.png',
      'Orbit2Active.png',
      'Orbit3Normal.png',
      'Orbit3Active.png',
      'Orbit4Normal.png',
      'Orbit4Active.png',
      'Orbit5Normal.png',
      'Orbit5Active.png',
      'Orbit6Normal.png',
      'Orbit6Active.png',
      'BackgroundStr.png',
      'BackgroundDex.png',
      'BackgroundInt.png',
      'BackgroundStrDex.png',
      'BackgroundStrInt.png',
      'BackgroundDexInt.png',
      'skilltree-sprite.png',
    ]
    await Promise.all(files.map((file) => this.loadImage(this.assetUrl(file)).catch(() => null)))
  }

  async ensureLoaded() {
    if (this.ready || this.loading) return
    this.loading = true
    try {
      const [treeDataRaw, spriteCoords] = await Promise.all([
        loadJson(this.treeDataPath),
        loadJson(this.spriteCoordsPath),
      ])
      this.treeData = normalizeTreeData(treeDataRaw || {})
      const bloodlineCoords = buildBloodlineCoordsFromTreeData(treeDataRaw || {})
      this.spriteCoords = { ...(spriteCoords || {}), ...bloodlineCoords }
      this.spriteCoordsByFilename = buildSpriteCoordsByFilename(this.spriteCoords)
      this.sheetVariants = buildSheetVariantIndex(this.spriteCoords)
      await this.preloadImages()
      this.ready = true
    } finally {
      this.loading = false
    }
  }

  resizeCanvas() {
    if (!this.canvas || !this.ctx) return
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))

    const targetWidth = Math.max(1, Math.floor(width * dpr))
    const targetHeight = Math.max(1, Math.floor(height * dpr))
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth
      this.canvas.height = targetHeight
    }

    this.viewWidth = width
    this.viewHeight = height

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  getNodeSize(node) {
    if (!node) return 110
    if (node.isKeystone) return 140 * 1.4
    if (node.isNotable) return 105 * 1.4
    if (node.isJewelSocket) return 95 * 1.4
    if (node.isMastery) return 85 * 2
    return 55 * 2
  }

  getNodeScreenSize(node, zoom) {
    const base = this.getNodeSize(node)
    return base * zoom
  }

  getNodeFrame(node, isAllocated) {
    const set = isAllocated ? NODE_FRAMES.allocated : NODE_FRAMES.unallocated
    if (node.isKeystone) return set.keystone
    if (node.isNotable) return set.notable
    if (node.isJewelSocket) return set.jewel
    if (node.isMastery) return set.mastery
    return set.small
  }

  isReliquarianStructuralNode(node) {
    if (!node) return false
    if (compactAscName(node.ascendancyName) !== 'reliquarian') return false
    return node.isAscendancyStart === true || node.isMultipleChoice === true
  }

  getNodeVisualState(node, isAllocated) {
    if (!isAllocated) {
      return {
        frameAllocated: false,
        backdropAlpha: 0.35,
        fillAlpha: 0.25,
        frameAlpha: 0.55,
        connectorAlpha: 0.25,
        iconAlpha: 0.4,
      }
    }

    if (this.isReliquarianStructuralNode(node)) {
      return {
        frameAllocated: false,
        backdropAlpha: 0.28,
        fillAlpha: 0.38,
        frameAlpha: 0.82,
        connectorAlpha: 0.35,
        iconAlpha: 0.72,
      }
    }

    return {
      frameAllocated: true,
      backdropAlpha: 0.7,
      fillAlpha: 0.9,
      frameAlpha: 1,
      connectorAlpha: 0.85,
      iconAlpha: 1,
    }
  }

  installHoverHandlers() {
    if (!this.canvas || !this.canvas.addEventListener) return
    this.canvas.addEventListener('mousedown', this.handleMouseDown)
    this.canvas.addEventListener('mousemove', this.handleMouseMove)
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave)
    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', this.handleMouseUp)
    }
  }

  ensureTooltip() {
    if (this.tooltipEl || !this.canvas || typeof document === 'undefined') return
    const parent = this.canvas.parentElement
    if (!parent) return
    const tooltip = document.createElement('div')
    tooltip.className = 'tree-tooltip hidden'
    parent.appendChild(tooltip)
    this.tooltipEl = tooltip
  }

  hideTooltip() {
    if (!this.tooltipEl) return
    this.tooltipEl.classList.add('hidden')
    this.hoveredNodeId = null
  }

  getSelectedMasteryEffect(nodeId) {
    if (!nodeId || !this.treeData?.nodes) return null
    const effectId = this.masterySelections?.[String(nodeId)]
    if (!Number.isFinite(effectId)) return null
    const node = this.treeData.nodes[String(nodeId)]
    const effects = Array.isArray(node?.masteryEffects) ? node.masteryEffects : []
    return effects.find((entry) => Number(entry?.effect) === Number(effectId)) || null
  }

  updateTooltip(node, nodeId, x, y) {
    if (!node) return
    const resolvedId = nodeId != null ? String(nodeId) : String(node.id || '')
    this.ensureTooltip()
    if (!this.tooltipEl) return

    if (this.hoveredNodeId !== resolvedId) {
      this.tooltipEl.innerHTML = ''
      const title = document.createElement('div')
      title.className = 'tree-tooltip-title'
      title.textContent = node.name || 'Passive'
      this.tooltipEl.appendChild(title)

      const selectedMastery = node?.isMastery ? this.getSelectedMasteryEffect(resolvedId) : null
      const selectedStats = Array.isArray(selectedMastery?.stats)
        ? selectedMastery.stats.filter((stat) => typeof stat === 'string' && stat.trim())
        : []
      if (selectedStats.length > 0) {
        const selectedTitle = document.createElement('div')
        selectedTitle.className = 'tree-tooltip-title'
        selectedTitle.textContent = 'Selected Mastery'
        this.tooltipEl.appendChild(selectedTitle)

        selectedStats.forEach((stat) => {
          const line = document.createElement('div')
          line.className = 'tree-tooltip-stat'
          line.textContent = stat
          this.tooltipEl.appendChild(line)
        })
      }

      const stats = Array.isArray(node.stats) ? node.stats : []
      stats.forEach((stat) => {
        const line = document.createElement('div')
        line.className = 'tree-tooltip-stat'
        line.textContent = stat
        this.tooltipEl.appendChild(line)
      })
      this.hoveredNodeId = resolvedId
    }

    this.tooltipEl.classList.remove('hidden')
    const parent = this.canvas.parentElement
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect()
    const tooltipRect = this.tooltipEl.getBoundingClientRect()
    let left = x + 16
    let top = y + 16
    if (left + tooltipRect.width > rect.width - 8) {
      left = x - tooltipRect.width - 16
    }
    if (top + tooltipRect.height > rect.height - 8) {
      top = y - tooltipRect.height - 16
    }
    this.tooltipEl.style.left = `${Math.max(8, left)}px`
    this.tooltipEl.style.top = `${Math.max(8, top)}px`
  }

  handleMouseMove(event) {
    if (!this.canvas) return
    if (this.isPanning && this.panStart && this.panOrigin) {
      const dx = event.clientX - this.panStart.x
      const dy = event.clientY - this.panStart.y
      this.panOffset = {
        x: this.panOrigin.x + dx,
        y: this.panOrigin.y + dy,
      }
      this.render(this.pendingNodes, this.lastRenderOptions || {})
      return
    }
    if (this.screenNodes.length === 0) return
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let closest = null
    let closestDist = Infinity

    this.screenNodes.forEach((entry) => {
      const dx = x - entry.x
      const dy = y - entry.y
      const radius = entry.size * 0.55
      const dist = (dx * dx) + (dy * dy)
      if (dist <= radius * radius && dist < closestDist) {
        closest = entry
        closestDist = dist
      }
    })

    if (!closest) {
      this.hideTooltip()
      return
    }

    this.updateTooltip(closest.node, closest.id, x, y)
  }

  handleMouseDown(event) {
    if (!this.canvas || event.button !== 0) return
    this.isPanning = true
    this.panStart = { x: event.clientX, y: event.clientY }
    this.panOrigin = { x: this.panOffset.x, y: this.panOffset.y }
    this.hideTooltip()
    this.canvas.classList.add('is-panning')
    event.preventDefault()
  }

  handleMouseUp() {
    if (!this.isPanning) return
    this.isPanning = false
    this.panStart = null
    this.panOrigin = null
    if (this.canvas) this.canvas.classList.remove('is-panning')
  }

  handleMouseLeave() {
    this.hideTooltip()
  }

  resolveSpriteCoords(iconPath) {
    if (!iconPath || !this.spriteCoords) return null
    return this.spriteCoords[iconPath] || this.spriteCoordsByFilename?.[iconPath.split('/').pop()]
  }

  drawBackground(ctx, width, height) {
    const tileUrl = this.assetUrl(BACKGROUND_TILE)
    const tile = this.loadedImages.get(tileUrl)
    if (tile) {
      const pattern = ctx.createPattern(tile, 'repeat')
      if (pattern) {
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, width, height)
      }
    } else {
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width)
      gradient.addColorStop(0, '#111620')
      gradient.addColorStop(1, '#05080a')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    }

    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.15, width / 2, height / 2, width)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, width, height)
  }

  drawClassBackground(ctx, centerX, centerY, zoom, offsetX, offsetY) {
    const classData = resolveClassData(this.selectedClassName)
    if (!classData || !classData.background || !this.treeData) return

    const overrides = this.treeData.positionOverrides?.classBackgrounds || {}
    const override = overrides[`classbg_${classData.id}`] || {}
    const bgX = typeof override.x === 'number' ? override.x : 0
    const bgY = typeof override.y === 'number' ? override.y : 0
    const bgScale = typeof override.scale === 'number' ? override.scale : 2

    const bgUrl = this.assetUrl(classData.background)
    const bgImage = this.loadedImages.get(bgUrl)
    if (!bgImage) return

    const screenX = (bgX - centerX) * zoom + offsetX
    const screenY = (bgY - centerY) * zoom + offsetY
    const bgWidth = bgImage.width * bgScale * zoom
    const bgHeight = bgImage.height * bgScale * zoom

    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.drawImage(bgImage, screenX - bgWidth / 2, screenY - bgHeight / 2, bgWidth, bgHeight)
    ctx.restore()
  }

  getAscendancyCluster(ascName) {
    if (!this.treeData || !ascName) return null
    const target = normalizeAscName(ascName)
    if (!target) return null

    const hasCoords = (node) =>
      node && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y)

    let startNode = null
    Object.values(this.treeData.nodes || {}).some((node) => {
      if (!node || !node.ascendancyName) return false
      if (normalizeAscName(node.ascendancyName) !== target) return false
      if (!node.isAscendancyStart || !hasCoords(node)) return false
      startNode = node
      return true
    })

    const nodes = Object.values(this.treeData.nodes || {}).filter((node) => {
      if (!node || !node.ascendancyName) return false
      if (normalizeAscName(node.ascendancyName) !== target) return false
      return hasCoords(node)
    })
    if (!nodes.length) return null

    const PADDING = 150
    const BASE_MIN_RADIUS = 700
    const MIN_OVERRIDES = {
      necromancer: 1100,
      guardian: 1100,
      berserker: 1100,
      saboteur: 1100,
      champion: 1100,
      warden: 1100,
    }
    const SCALE_OVERRIDES = {
      necromancer: 1.2,
      guardian: 1.2,
      berserker: 1.2,
      saboteur: 1.2,
      champion: 1.2,
      warden: 1.2,
    }

    const minRadius = MIN_OVERRIDES[target] ?? BASE_MIN_RADIUS
    const scale = SCALE_OVERRIDES[target] ?? 1

    if (startNode) {
      let maxDist = 0
      nodes.forEach((node) => {
        const dist = Math.hypot(node.x - startNode.x, node.y - startNode.y)
        maxDist = Math.max(maxDist, dist)
      })
      const radius = Math.max(maxDist + PADDING, minRadius) * scale
      return { name: ascName, x: startNode.x, y: startNode.y, radius }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    nodes.forEach(({ x, y }) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const radius = Math.max(PADDING, minRadius) * scale
    return { name: ascName, x: cx, y: cy, radius }
  }

  getBloodlineCluster(bloodlineName) {
    if (!this.treeData || !bloodlineName) return null
    const key = resolveBloodlineKey(bloodlineName)
    if (!key) return null
    const targetCompact = key.replace(/[^a-z0-9]/gi, '').toLowerCase()

    const hasCoords = (node) =>
      node && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y)

    const nodes = Object.values(this.treeData.nodes || {}).filter((node) => {
      if (!node || !node.ascendancyName) return false
      const ascKey = resolveBloodlineKey(node.ascendancyName)
      if (!ascKey) return false
      const ascCompact = ascKey.replace(/[^a-z0-9]/gi, '').toLowerCase()
      return ascCompact === targetCompact && hasCoords(node)
    })

    if (!nodes.length) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    nodes.forEach(({ x, y }) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const padding = 120
    const rawRadius = Math.max(maxX - minX, maxY - minY) / 2 + padding
    const radius = Math.min(rawRadius, 1200)
    return { name: key, x: centerX, y: centerY, radius }
  }

  drawAscendancyBackground(ctx, centerX, centerY, zoom, offsetX, offsetY) {
    if (!this.treeData) return
    const sourceName = typeof this.activeAscendancyName === 'string' && this.activeAscendancyName.trim()
      ? this.activeAscendancyName
      : this.selectedAscendancyName
    const rawName = typeof sourceName === 'string' ? stripBloodlineSuffix(sourceName) : ''
    const safeName = rawName.replace(/[^a-z0-9 ]/gi, '').trim()
    if (!safeName) return
    const cluster = this.getAscendancyCluster(safeName)
    if (!cluster) return

    const candidates = []
    const classKey = safeName ? `Classes${safeName}` : null
    const spriteCoords = classKey
      ? this.spriteCoords?.[classKey] || this.spriteCoordsByFilename?.[classKey] || null
      : null
    if (spriteCoords?.sheet) {
      candidates.push({
        type: 'sprite',
        sheet: spriteCoords.sheet,
        coords: spriteCoords,
        scale: 1,
        alpha: 0.22,
      })
    }
    if (safeName) {
      const scaleOverrides = {
        necromancer: 0.8,
        guardian: 0.8,
        berserker: 0.8,
        champion: 0.8,
        warden: 0.55,
        saboteur: 0.8,
      }
      const normalized = normalizeAscName(safeName)
      const scaleOverride = scaleOverrides[normalized] ?? 1
      candidates.push({ type: 'image', name: `Classes${safeName}.png`, scale: scaleOverride, alpha: 0.22 })
    }

    let picked = null
    for (const candidate of candidates) {
      if (candidate.type === 'sprite') {
        const url = this.assetUrl(candidate.sheet)
        const img = this.loadedImages.get(url)
        if (img) {
          picked = { img, ...candidate }
          break
        }
        this.queueRenderOnLoad(url)
        continue
      }
      const url = this.assetUrl(candidate.name)
      const img = this.loadedImages.get(url)
      if (img) {
        picked = { img, ...candidate }
        break
      }
      this.queueRenderOnLoad(url)
    }
    if (!picked) return

    const { img, scale, alpha } = picked
    const screenX = (cluster.x - centerX) * zoom + offsetX
    const screenY = (cluster.y - centerY) * zoom + offsetY

    ctx.save()
    ctx.globalAlpha = alpha
    if (picked.type === 'sprite' && picked.coords) {
      const referenceSize = Math.max(picked.coords.w, picked.coords.h)
      const targetDiameter = cluster.radius * 2 + 140
      const finalScale = (targetDiameter / referenceSize) * scale
      const bgWidth = picked.coords.w * finalScale * zoom
      const bgHeight = picked.coords.h * finalScale * zoom
      ctx.drawImage(
        img,
        picked.coords.x,
        picked.coords.y,
        picked.coords.w,
        picked.coords.h,
        screenX - bgWidth / 2,
        screenY - bgHeight / 2,
        bgWidth,
        bgHeight
      )
    } else {
      const referenceSize = Math.max(img.width, img.height)
      const targetDiameter = cluster.radius * 2 + 140
      const baseScale = targetDiameter / referenceSize
      const finalScale = baseScale * scale
      const bgWidth = img.width * finalScale * zoom
      const bgHeight = img.height * finalScale * zoom
      ctx.drawImage(img, screenX - bgWidth / 2, screenY - bgHeight / 2, bgWidth, bgHeight)
    }
    ctx.restore()
  }

  drawBloodlineBackground(ctx, centerX, centerY, zoom, offsetX, offsetY) {
    const sourceName = this.selectedBloodlineName || this.selectedAscendancyName
    const key = resolveBloodlineKey(sourceName)
    const cluster = key ? this.getBloodlineCluster(key) : null
    const classKey = key ? `Classes${key}` : null
    const coords = classKey
      ? this.spriteCoords?.[classKey] || this.spriteCoordsByFilename?.[classKey] || null
      : null

    const sheetName = coords?.sheet || this.sheetVariants.bloodline || 'bloodline-4.webp'
    const sheetUrl = this.assetUrl(sheetName)
    const sheet = this.loadedImages.get(sheetUrl)
    if (!sheet) {
      this.queueRenderOnLoad(sheetUrl)
      return
    }

    if (!cluster || !key) {
      const scale = 1.05 * BLOODLINE_SCALE
      const bgWidth = sheet.width * scale * zoom
      const bgHeight = sheet.height * scale * zoom
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.drawImage(sheet, offsetX - bgWidth / 2, offsetY - bgHeight / 2, bgWidth, bgHeight)
      ctx.restore()
      return
    }

    if (!coords) {
      const scale = 1.05 * BLOODLINE_SCALE
      const bgWidth = sheet.width * scale * zoom
      const bgHeight = sheet.height * scale * zoom
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.drawImage(sheet, offsetX - bgWidth / 2, offsetY - bgHeight / 2, bgWidth, bgHeight)
      ctx.restore()
      return
    }

    const effectiveRadius = Math.max(cluster.radius, BLOODLINE_MIN_RADIUS) * BLOODLINE_SCALE
    const targetDiameter = (effectiveRadius * 2) + 140
    const referenceSize = Math.max(coords.w, coords.h)
    const scale = targetDiameter / referenceSize
    const bgWidth = coords.w * scale * zoom
    const bgHeight = coords.h * scale * zoom
    const screenX = (cluster.x - centerX) * zoom + offsetX
    const screenY = (cluster.y - centerY) * zoom + offsetY

    ctx.save()
    ctx.globalAlpha = 0.92
    ctx.drawImage(
      sheet,
      coords.x,
      coords.y,
      coords.w,
      coords.h,
      screenX - bgWidth / 2,
      screenY - bgHeight / 2,
      bgWidth,
      bgHeight
    )
    ctx.restore()
  }

  drawOrbitRings(ctx, centerX, centerY, zoom, offsetX, offsetY, ids) {
    if (!this.treeData) return
    const groups = this.treeData.groups || {}
    const orbitMap = new Map()

    ids.forEach((id) => {
      const node = this.treeData.nodes?.[id]
      if (!node) return
      const groupId = String(node.group ?? '')
      if (!groupId || !groups[groupId]) return
      const orbit = typeof node.orbit === 'number' ? node.orbit : 0
      if (!orbitMap.has(groupId)) orbitMap.set(groupId, new Set())
      orbitMap.get(groupId).add(orbit)
    })

    orbitMap.forEach((orbits, groupId) => {
      const group = groups[groupId]
      if (!group || typeof group.x !== 'number' || typeof group.y !== 'number') return
      const gx = (group.x - centerX) * zoom + offsetX
      const gy = (group.y - centerY) * zoom + offsetY

      orbits.forEach((orbit) => {
        if (!orbit || orbit >= ORBIT_RADII.length) return
        const radius = ORBIT_RADII[orbit]
        const size = radius * 2 * zoom
        if (!size) return
        const assetName = `Orbit${orbit}Active.png`
        const assetUrl = this.assetUrl(assetName)
        const img = this.loadedImages.get(assetUrl)
        if (!img) return
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.drawImage(img, gx - size / 2, gy - size / 2, size, size)
        ctx.restore()
      })
    })
  }

  render(selectedNodes, options = {}) {
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
      this.lastRenderOptions = { ...(this.lastRenderOptions || {}), ...options }
    }
    if (Array.isArray(selectedNodes)) {
      this.pendingNodes = selectedNodes.map((id) => String(id))
    }
    if (options.highlightNodeId !== undefined) {
      this.highlightNodeId = options.highlightNodeId
    }
    if (options.highlightNodeIds !== undefined) {
      if (Array.isArray(options.highlightNodeIds)) {
        this.highlightNodeIds = options.highlightNodeIds
          .map((id) => (id != null ? String(id) : null))
          .filter(Boolean)
      } else {
        this.highlightNodeIds = null
      }
    }
    if (options.visibleNodeIds !== undefined) {
      if (Array.isArray(options.visibleNodeIds)) {
        this.visibleNodeIds = options.visibleNodeIds
          .map((id) => (id != null ? String(id) : null))
          .filter(Boolean)
      } else {
        this.visibleNodeIds = null
      }
    }
    if (options.inactiveNodeIds !== undefined) {
      if (Array.isArray(options.inactiveNodeIds)) {
        this.inactiveNodeIds = options.inactiveNodeIds
          .map((id) => (id != null ? String(id) : null))
          .filter(Boolean)
      } else {
        this.inactiveNodeIds = null
      }
    }
    if (options.className !== undefined) {
      this.selectedClassName = options.className
    }
    if (options.ascendancyName !== undefined) {
      this.selectedAscendancyName = options.ascendancyName
    }
    if (options.bloodlineName !== undefined) {
      this.selectedBloodlineName = options.bloodlineName
    }
    if (options.showAllNodes !== undefined) {
      this.showAllNodes = options.showAllNodes
    }
    if (options.sectionHighlight !== undefined) {
      const raw = options.sectionHighlight
      if (raw && typeof raw === 'object') {
        const toList = (value) => (Array.isArray(value) ? value.map((id) => (id != null ? String(id) : null)).filter(Boolean) : [])
        this.sectionHighlight = {
          previous: toList(raw.previous),
          current: toList(raw.current),
          removed: toList(raw.removed),
        }
      } else {
        this.sectionHighlight = null
      }
    }
    if (options.masterySelections !== undefined) {
      const next = {}
      if (options.masterySelections && typeof options.masterySelections === 'object') {
        Object.entries(options.masterySelections).forEach(([nodeId, effectId]) => {
          const parsed = Number(effectId)
          if (!nodeId || !Number.isFinite(parsed)) return
          next[String(nodeId)] = parsed
        })
      }
      this.masterySelections = next
    }
    if (options.transparentBackground !== undefined) {
      this.transparentBackground = options.transparentBackground === true
    }
    const centerOnHighlight = options.centerOnHighlight === true
    const viewMode = options.viewMode === 'ascendancy' || options.viewMode === 'bloodline' ? options.viewMode : 'tree'

    if (!this.canvas || !this.ctx) return
    if (!this.ready) {
      const pendingOptions = this.lastRenderOptions || {}
      void this.ensureLoaded().then(() => this.render(this.pendingNodes, pendingOptions))
      return
    }

    const allocatedIds = this.pendingNodes.filter((id) => this.treeData?.nodes?.[id])
    this.resizeCanvas()
    if (this.viewWidth < 2 || this.viewHeight < 2) {
      if (this.renderRetryCount < 5) {
        this.renderRetryCount += 1
        setTimeout(() => this.render(this.pendingNodes, this.lastRenderOptions || {}), 50)
      }
      return
    }
    this.renderRetryCount = 0

    const ctx = this.ctx
    const width = this.viewWidth
    const height = this.viewHeight

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)

    if (!this.treeData) return

    const allIds = Object.keys(this.treeData.nodes || {})
    const selectedAscKey = normalizeAscName(this.selectedAscendancyName)
    const selectedBloodlineKey = resolveBloodlineKey(this.selectedBloodlineName)
    const isNodeInView = (node) => {
      if (!node) return false
      const asc = typeof node.ascendancyName === 'string' ? node.ascendancyName.trim().toLowerCase() : ''
      if (!asc) return viewMode === 'tree'
      const isBloodline = isBloodlineAsc(asc, this.selectedBloodlineName)
      if (viewMode === 'bloodline') {
        if (!isBloodline) return false
        if (!selectedBloodlineKey) return true
        const ascKey = resolveBloodlineKey(asc)
        if (!ascKey) return false
        const ascCompact = ascKey.replace(/[^a-z0-9]/gi, '').toLowerCase()
        const target = selectedBloodlineKey.replace(/[^a-z0-9]/gi, '').toLowerCase()
        return ascCompact === target
      }
      if (viewMode === 'ascendancy') {
        if (isBloodline) return false
        if (selectedAscKey) {
          const normalized = normalizeAscName(asc)
          return (
            normalized === selectedAscKey ||
            normalized.includes(selectedAscKey) ||
            selectedAscKey.includes(normalized)
          )
        }
        return true
      }
      return false
    }
    const viewIds = allIds.filter((id) => isNodeInView(this.treeData.nodes[id]))
    const viewAllocatedIds = allocatedIds.filter((id) => isNodeInView(this.treeData.nodes[id]))
    if (viewMode === 'ascendancy' && viewIds.length === 0) {
      const fallbackIds = allIds.filter((id) => {
        const node = this.treeData.nodes[id]
        if (!node || !node.ascendancyName) return false
        const asc = String(node.ascendancyName).trim().toLowerCase()
        if (!asc) return false
        return !isBloodlineAsc(asc, this.selectedBloodlineName)
      })
      if (fallbackIds.length > 0) {
        viewIds.splice(0, viewIds.length, ...fallbackIds)
        viewAllocatedIds.splice(
          0,
          viewAllocatedIds.length,
          ...allocatedIds.filter((id) => fallbackIds.includes(id))
        )
      }
    }
    const resolveActiveAscendancyName = () => {
      if (viewMode !== 'ascendancy') return null
      if (typeof this.selectedAscendancyName === 'string' && this.selectedAscendancyName.trim()) {
        return this.selectedAscendancyName
      }
      for (const id of viewIds) {
        const node = this.treeData.nodes[id]
        if (!node || !node.ascendancyName) continue
        const ascName = String(node.ascendancyName).trim()
        if (!ascName || isBloodlineAsc(ascName, this.selectedBloodlineName)) continue
        return ascName
      }
      return null
    }
    this.activeAscendancyName = resolveActiveAscendancyName()
    const highlightIds = Array.isArray(this.highlightNodeIds)
      ? this.highlightNodeIds.map((key) => String(key))
      : (this.highlightNodeId != null ? [String(this.highlightNodeId)] : [])
    const explicitVisibleIds = Array.isArray(this.visibleNodeIds)
      ? this.visibleNodeIds.filter((id) => isNodeInView(this.treeData.nodes[id]))
      : []
    const inactiveIdSet = Array.isArray(this.inactiveNodeIds)
      ? new Set(this.inactiveNodeIds.map((id) => String(id)))
      : new Set()
    const sectionPrevSet = new Set(this.sectionHighlight?.previous || [])
    const sectionCurSet = new Set(this.sectionHighlight?.current || [])
    const sectionRemovedSet = new Set(this.sectionHighlight?.removed || [])
    const highlightSetForBounds = new Set(highlightIds.filter((id) => isNodeInView(this.treeData.nodes[id])))
    sectionCurSet.forEach((id) => {
      if (isNodeInView(this.treeData.nodes[id])) highlightSetForBounds.add(id)
    })
    sectionRemovedSet.forEach((id) => {
      if (isNodeInView(this.treeData.nodes[id])) highlightSetForBounds.add(id)
    })
    const baseSet = new Set(viewAllocatedIds.filter((id) => !inactiveIdSet.has(String(id))))
    highlightSetForBounds.forEach((id) => baseSet.add(id))
    explicitVisibleIds.forEach((id) => baseSet.add(id))
    sectionCurSet.forEach((id) => {
      if (isNodeInView(this.treeData.nodes[id])) baseSet.add(id)
    })
    sectionRemovedSet.forEach((id) => {
      if (isNodeInView(this.treeData.nodes[id])) baseSet.add(id)
    })
    const baseIds = baseSet.size > 0 ? Array.from(baseSet) : viewIds
    if (baseIds.length === 0) return

    const positions = []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    baseIds.forEach((id) => {
      const node = this.treeData.nodes[id]
      if (!node || typeof node.x !== 'number' || typeof node.y !== 'number') return
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x)
      maxY = Math.max(maxY, node.y)
      positions.push({ id, node })
    })

    if (!positions.length) return

    let centerX = (minX + maxX) / 2
    let centerY = (minY + maxY) / 2
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    let padding = Math.round(Math.max(spanX, spanY) * 0.25)
    if (baseIds.length < 6) padding = Math.max(padding, 420)
    else if (baseIds.length < 16) padding = Math.max(padding, 340)
    else if (baseIds.length > 80) padding = Math.min(padding, 220)
    padding = Math.max(180, Math.min(420, padding))
    const scaleX = width / (spanX + padding * 2)
    const scaleY = height / (spanY + padding * 2)
    const baseZoom = Math.min(scaleX, scaleY)
    const BLOODLINE_ZOOM_CAP_OVERRIDES = {
      aul: 0.8,
      breachlord: 0.9,
      catarina: 0.95,
      chaos: 0.9,
      trialmaster: 0.9,
      delirious: 0.9,
      farul: 0.95,
      lycia: 0.95,
      nameless: 0.8,
      kinginthemists: 0.8,
      orloth: 0.95,
      oshabi: 0.8,
      daughterofoshabi: 0.8,
    }
    const baseNonTreeCap = Math.min(this.maxZoom, 0.18)
    let maxZoomCap = viewMode === 'tree' ? this.maxZoom : baseNonTreeCap
    if (viewMode === 'bloodline') {
      maxZoomCap = Math.min(this.maxZoom, baseNonTreeCap * BLOODLINE_VIEW_ZOOM_BOOST)
    }
    if (viewMode === 'bloodline' && typeof this.selectedBloodlineName === 'string') {
      const key = compactAscName(this.selectedBloodlineName)
      const rawKey = compactAscName(stripBloodlineSuffix(this.selectedBloodlineName))
      const factor = BLOODLINE_ZOOM_CAP_OVERRIDES[key] ?? BLOODLINE_ZOOM_CAP_OVERRIDES[rawKey] ?? 1
      maxZoomCap = Math.min(this.maxZoom, maxZoomCap * factor)
    }
    const isReliquarianAscendancyView = viewMode === 'ascendancy'
      && compactAscName(this.activeAscendancyName) === 'reliquarian'
    if (isReliquarianAscendancyView) {
      maxZoomCap = Math.min(this.maxZoom, maxZoomCap * RELIQUARIAN_VIEW_ZOOM_BOOST)
    }
    const fitZoom = Math.max(
      this.minZoom,
      Math.min(
        maxZoomCap,
        baseZoom * (isReliquarianAscendancyView ? RELIQUARIAN_VIEW_ZOOM_BOOST : 1)
      )
    )
    const zoom = Math.max(this.minZoom, Math.min(maxZoomCap, fitZoom * this.zoomFactor))
    this.lastZoom = zoom
    const highlightCandidates = [
      this.highlightNodeId != null ? String(this.highlightNodeId) : null,
      ...(Array.isArray(this.highlightNodeIds) ? this.highlightNodeIds.map((key) => String(key)) : []),
    ].filter(Boolean)
    const highlightId = highlightCandidates.find((id) => {
      const node = this.treeData?.nodes?.[id]
      return node && isNodeInView(node)
    }) || null
    if (centerOnHighlight && highlightId && this.treeData?.nodes?.[highlightId]) {
      const node = this.treeData.nodes[highlightId]
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        if (this.lastCenteredNodeId !== highlightId) {
          this.panOffset = { x: 0, y: 0 }
          this.lastCenteredNodeId = highlightId
        }
        centerX = node.x
        centerY = node.y
      }
    }
    const panX = this.panOffset?.x || 0
    const panY = this.panOffset?.y || 0
    const offsetX = (width / 2) + panX
    const offsetY = (height / 2) + panY

    const showAll = this.showAllNodes === true
    const renderIds = explicitVisibleIds.length > 0
      ? explicitVisibleIds
      : (showAll ? viewIds : viewAllocatedIds)
    const allocatedSet = new Set(viewAllocatedIds.filter((id) => !inactiveIdSet.has(String(id))))
    const highlightSet = Array.isArray(this.highlightNodeIds)
      ? new Set(this.highlightNodeIds.map((key) => String(key)))
      : null
    const sectionNewSet = new Set(
      Array.from(sectionCurSet).filter((id) => !sectionPrevSet.has(id))
    )
    const resolveSectionColor = (id) => {
      if (sectionRemovedSet.has(id)) return 'rgba(239, 68, 68, 0.72)'
      if (sectionNewSet.has(id)) return 'rgba(59, 130, 246, 0.95)'
      if (sectionCurSet.has(id) || sectionPrevSet.has(id)) return 'rgba(0, 255, 160, 0.95)'
      return null
    }
    const screenPositions = new Map()
    const visible = []
    const margin = 220

    renderIds.forEach((id) => {
      const node = this.treeData.nodes[id]
      if (!node || typeof node.x !== 'number' || typeof node.y !== 'number') return
      const x = (node.x - centerX) * zoom + offsetX
      const y = (node.y - centerY) * zoom + offsetY
      const inView = x > -margin && x < width + margin && y > -margin && y < height + margin
      if (!inView && !allocatedSet.has(id) && !highlightSetForBounds.has(id)) return
      const entry = { id, x, y, node }
      screenPositions.set(id, entry)
      visible.push(entry)
    })

    const screenNodes = visible.map((entry) => ({
      ...entry,
      size: this.getNodeScreenSize(entry.node, zoom),
    }))
    this.screenNodes = screenNodes
    if (this.hoveredNodeId && !screenNodes.some((entry) => entry.id === this.hoveredNodeId)) {
      this.hideTooltip()
    }

    if (!this.transparentBackground) {
      this.drawBackground(ctx, width, height)
      if (viewMode === 'tree') {
        this.drawClassBackground(ctx, centerX, centerY, zoom, offsetX, offsetY)
      } else if (viewMode === 'ascendancy') {
        this.drawAscendancyBackground(ctx, centerX, centerY, zoom, offsetX, offsetY)
      } else if (viewMode === 'bloodline') {
        this.drawBloodlineBackground(ctx, centerX, centerY, zoom, offsetX, offsetY)
      }
    }
    const idSet = allocatedSet
    ctx.lineCap = 'round'

    const drawnEdges = new Set()
    screenNodes.forEach(({ id }) => {
      const node = this.treeData.nodes[id]
      if (!node || !Array.isArray(node.out)) return
      node.out.forEach((targetId) => {
        const targetKey = String(targetId)
        if (!screenPositions.has(targetKey)) return
        const edgeKey = id < targetKey ? `${id}:${targetKey}` : `${targetKey}:${id}`
        if (drawnEdges.has(edgeKey)) return
        drawnEdges.add(edgeKey)

        const from = screenPositions.get(id)
        const to = screenPositions.get(targetKey)
        if (!from || !to) return
        const isActive = idSet.has(id) && idSet.has(targetKey)
        const edgeColor = resolveSectionColor(id)
          && resolveSectionColor(targetKey)
          ? resolveSectionColor(id)
          : null
        const dx = to.x - from.x
        const dy = to.y - from.y
        const dist = Math.max(1, Math.hypot(dx, dy))
        const startOffset = (this.getNodeScreenSize(from.node, zoom) / 2) - 4
        const endOffset = (this.getNodeScreenSize(to.node, zoom) / 2) - 4
        const sx = from.x + (dx / dist) * startOffset
        const sy = from.y + (dy / dist) * startOffset
        const ex = to.x - (dx / dist) * endOffset
        const ey = to.y - (dy / dist) * endOffset
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = edgeColor || (isActive ? 'rgba(140, 200, 255, 0.55)' : 'rgba(180, 200, 230, 0.12)')
        ctx.lineWidth = edgeColor ? 2.2 : (isActive ? 1.6 : 1)
        ctx.stroke()
      })
    })

    const ordered = screenNodes.slice().sort(
      (a, b) => a.size - b.size
    )
    ordered.forEach(({ id, node, x, y }) => {
      const size = this.getNodeScreenSize(node, zoom)
      const isAllocated = idSet.has(id)
      const visualState = this.getNodeVisualState(node, isAllocated)
      const frame = this.getNodeFrame(node, visualState.frameAllocated)
      const frameUrl = this.assetUrl(frame)
      const frameImg = this.loadedImages.get(frameUrl)
      const isHighlight =
        (this.highlightNodeId && String(this.highlightNodeId) === String(id)) ||
        (highlightSet && highlightSet.has(String(id)))
      const sectionColor = resolveSectionColor(String(id))

      if (sectionColor) {
        ctx.save()
        ctx.shadowColor = sectionColor
        ctx.shadowBlur = sectionRemovedSet.has(String(id)) ? 12 : 18
        ctx.strokeStyle = sectionColor
        ctx.lineWidth = sectionRemovedSet.has(String(id)) ? 2 : 2.5
        ctx.globalAlpha = sectionRemovedSet.has(String(id)) ? 0.22 : 0.35
        ctx.beginPath()
        ctx.arc(x, y, size * 0.55, 0, Math.PI * 2)
        ctx.fillStyle = sectionColor
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(x, y, size * 0.7, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      if (isHighlight) {
        const style = this.highlightStyle || {}
        const ringScale = Number.isFinite(style.ringScale) ? style.ringScale : 0.6
        const ringWidth = Number.isFinite(style.ringWidth) ? style.ringWidth : 3
        const ringColor = style.ringColor || 'rgba(125, 211, 252, 0.9)'
        const glowColor = style.glowColor || ringColor
        const glowBlur = Number.isFinite(style.glowBlur) ? style.glowBlur : 30
        const fillColor = style.fillColor || null
        const outerScale = Number.isFinite(style.outerScale) ? style.outerScale : null

        ctx.save()
        ctx.shadowColor = glowColor
        ctx.shadowBlur = glowBlur
        ctx.strokeStyle = ringColor
        ctx.lineWidth = ringWidth
        ctx.beginPath()
        ctx.arc(x, y, size * ringScale, 0, Math.PI * 2)
        ctx.stroke()
        if (outerScale) {
          ctx.shadowBlur = 0
          ctx.globalAlpha = 0.55
          ctx.lineWidth = Math.max(1, ringWidth - 1)
          ctx.beginPath()
          ctx.arc(x, y, size * outerScale, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        if (fillColor) {
          ctx.shadowBlur = 0
          ctx.globalAlpha = 0.45
          ctx.fillStyle = fillColor
          ctx.beginPath()
          ctx.arc(x, y, size * (ringScale * 0.92), 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
        ctx.restore()
      }

      const innerRadius = size * (node.isKeystone ? 0.36 : node.isNotable ? 0.34 : node.isJewelSocket ? 0.33 : 0.32)
      const bgColor = node.isKeystone
        ? '#8B4513'
        : node.isNotable
          ? '#6b7280'
          : node.isJewelSocket
            ? '#059669'
            : getNodeTint(node.icon)

      if (!node.isMastery) {
        const backdrop = ctx.createRadialGradient(x, y, 0, x, y, size * 0.6)
        backdrop.addColorStop(0, 'rgba(10, 14, 20, 0.85)')
        backdrop.addColorStop(1, 'rgba(6, 8, 12, 0)')
        ctx.save()
        ctx.fillStyle = backdrop
        ctx.globalAlpha = visualState.backdropAlpha
        ctx.beginPath()
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, innerRadius, 0, Math.PI * 2)
        ctx.fillStyle = bgColor
        ctx.globalAlpha = visualState.fillAlpha
        ctx.fill()
        ctx.restore()
      }

      if (frameImg) {
        ctx.save()
        ctx.globalAlpha = visualState.frameAlpha
        ctx.drawImage(frameImg, x - size / 2, y - size / 2, size, size)
        ctx.restore()
      } else {
        ctx.fillStyle = '#1b202a'
        ctx.beginPath()
        ctx.arc(x, y, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }

      const connectorUrl = this.assetUrl(LINE_CONNECTOR_ACTIVE)
      const connectorImg = this.loadedImages.get(connectorUrl)
      const hasLinks = (node.out?.length ?? 0) + (node.in?.length ?? 0) > 0
      if (hasLinks && connectorImg) {
        const hubSize = Math.min(size * 0.65, size - 8)
        ctx.save()
        ctx.globalAlpha = visualState.connectorAlpha
        ctx.drawImage(connectorImg, x - hubSize / 2, y - hubSize / 2, hubSize, hubSize)
        ctx.restore()
      }

      const coords = this.resolveSpriteCoords(node.icon)
      if (!coords) return
      const sheetName = coords.sheet || 'skilltree-sprite.png'
      const sheetUrl = this.assetUrl(sheetName)
      let sheet = this.loadedImages.get(sheetUrl)
      if (!sheet) {
        this.loadImage(sheetUrl).catch(() => null)
        sheet = this.loadedImages.get(sheetUrl)
      }
      if (!sheet) return

      const iconScale = node.isKeystone ? 0.55 : node.isNotable ? 0.6 : node.isJewelSocket ? 0.6 : 0.65
      const iconSize = size * iconScale
      ctx.save()
      ctx.globalAlpha = visualState.iconAlpha
      ctx.drawImage(
        sheet,
        coords.x,
        coords.y,
        coords.w,
        coords.h,
        x - iconSize / 2,
        y - iconSize / 2,
        iconSize,
        iconSize
      )
      ctx.restore()

      if (sectionColor) {
        ctx.save()
        ctx.shadowColor = sectionColor
        ctx.shadowBlur = 26
        ctx.strokeStyle = sectionColor
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, size * 0.85, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    })
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TreePreviewRenderer }
}
if (typeof window !== 'undefined') {
  window.TreePreviewRenderer = TreePreviewRenderer
}

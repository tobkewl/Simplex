const dockingHandle = document.getElementById('dockingHandle');
const dockingHandleHoverZone = document.getElementById('dockingHandleHoverZone');
const feedBar = document.getElementById('feedBar');
const feedIconsEl = document.getElementById('feedIcons');
const addFeedIcon = document.getElementById('addFeedIcon');
const feedDropdown = document.getElementById('feedDropdown');
const contextMenu = document.getElementById('contextMenu');
const networthIndicator = document.getElementById('networthIndicator');
const networthHoverZone = document.getElementById('networthHoverZone');
const networthValue = document.getElementById('networthValue');
const networthIconImg = document.getElementById('networthIconImg');
const buildIndicator = document.getElementById('buildIndicator');
const buildHoverZone = document.getElementById('buildHoverZone');
const buildLevel = document.getElementById('buildLevel');
const buildLiveBadge = document.getElementById('buildLiveBadge');
const buildQuickPreview = document.getElementById('buildQuickPreview');
const quickPreviewSection = document.getElementById('quickPreviewSection');
const quickPreviewQuestHint = document.getElementById('quickPreviewQuestHint');
const quickPreviewNodeLabel = document.getElementById('quickPreviewNodeLabel');
const quickPreviewActionHint = document.getElementById('quickPreviewActionHint');
const quickPreviewTreeCanvas = document.getElementById('quickPreviewTreeCanvas');
const quickPreviewSkills = document.getElementById('quickPreviewSkills');
const quickPreviewGear = document.getElementById('quickPreviewGear');
const quickPreviewTreeWrap = document.getElementById('quickPreviewTreeWrap');
const quickPreviewSkillsWrap = document.getElementById('quickPreviewSkillsWrap');
const quickPreviewGearWrap = document.getElementById('quickPreviewGearWrap');
const quickPreviewClose = document.getElementById('quickPreviewClose');
const quickPreviewLevelMinus = document.getElementById('quickPreviewLevelMinus');
const quickPreviewLevelPlus = document.getElementById('quickPreviewLevelPlus');
const quickPreviewLevelValue = document.getElementById('quickPreviewLevelValue');
const quickPreviewHeader = buildQuickPreview
  ? buildQuickPreview.querySelector('.quick-preview-header')
  : null;
const levelUpPopup = document.getElementById('levelUpPopup');
const levelUpCanvas = document.getElementById('levelUpCanvas');
const levelUpLevel = document.getElementById('levelUpLevel');
const levelUpNodeLabel = document.getElementById('levelUpNodeLabel');
const levelUpActionHint = document.getElementById('levelUpActionHint');
const levelUpQuestHint = document.getElementById('levelUpQuestHint');
const dragOverlay = document.getElementById('dragOverlay');
const publicConfig = window.managementAPI?.getPublicConfig?.() || {};
const gearImagesBaseUrl =
  typeof publicConfig.gearImagesBaseUrl === 'string' ? publicConfig.gearImagesBaseUrl : '';
const gearImagesBucket =
  typeof publicConfig.gearImagesBucket === 'string' && publicConfig.gearImagesBucket.trim()
    ? publicConfig.gearImagesBucket.trim()
    : 'gear-images';

let feeds = [];
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let openDropdownFeedId = null;
let contextMenuFeedId = null;
let isOverUI = false;
let clickThroughEnabled = true;
let lastMouseMoveTime = 0;
let mouseMoveThrottleDelay = 100; // ms
let settingsWindowOpen = false; // Track if settings window is open
let activeGuideState = null;
let allFeedsMuted = false;
let levelPopupTimer = null;
let levelPopupRenderer = null;
let quickPreviewTreeRenderer = null;

const resolveTreeNodeLabel = (nodeId, state, renderer) => {
  if (!nodeId) return 'Section complete';
  const fromState = toString(state?.guideTreeLabels?.[nodeId]);
  if (fromState && fromState !== String(nodeId)) return fromState;
  const fromTree = renderer?.treeData?.nodes?.[nodeId]?.name;
  if (fromTree) return String(fromTree);
  return String(nodeId);
};

const formatAllocateLabel = (nodeIds, state, renderer) => {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return 'Section complete';
  const names = nodeIds
    .filter((id) => id != null)
    .map((id) => resolveTreeNodeLabel(id, state, renderer))
    .filter(Boolean);
  if (names.length === 0) return 'Section complete';
  if (names.length === 1) return `Allocate '${names[0]}'`;
  if (names.length === 2) return `Allocate '${names[0]}' & '${names[1]}'`;
  return `Allocate ${names.map((n) => `'${n}'`).join(', ')}`;
};

const partitionPreviewNodeIds = (nodeIds, renderer) => {
  const tree = [];
  const ascendancy = [];
  uniqueNodeIds(nodeIds).forEach((id) => {
    const node = renderer?.treeData?.nodes?.[id];
    if (node && typeof node.ascendancyName === 'string' && node.ascendancyName.trim()) {
      ascendancy.push(String(id));
      return;
    }
    tree.push(String(id));
  });
  return { tree, ascendancy };
};

const buildPreviewAllocateLabel = (nodeIds, state, renderer) => {
  const { tree, ascendancy } = partitionPreviewNodeIds(nodeIds, renderer);
  if (tree.length > 0) return formatAllocateLabel(tree, state, renderer);
  if (tree.length === 0 && ascendancy.length > 0) {
    return 'Ascendancy step available';
  }
  return formatAllocateLabel(nodeIds, state, renderer);
};

const buildAscendancyActionHint = (nodeIds, state, renderer) => {
  const { ascendancy } = partitionPreviewNodeIds(nodeIds, renderer);
  if (ascendancy.length === 0) return '';
  const summary = formatNodeSummary(ascendancy, state, renderer, { maxNames: 2 });
  return summary ? `Also allocate on ascendancy: ${summary}.` : 'Also allocate on ascendancy.';
};

const resolveSelectedMasteryEffect = (nodeId, sectionTree, renderer) => {
  if (!nodeId || !sectionTree || !renderer?.treeData?.nodes) return null;
  const effectId = Number(sectionTree?.masterySelections?.[String(nodeId)]);
  if (!Number.isFinite(effectId)) return null;
  const node = renderer.treeData.nodes[String(nodeId)];
  const effects = Array.isArray(node?.masteryEffects) ? node.masteryEffects : [];
  return effects.find((entry) => Number(entry?.effect) === effectId) || null;
};

const formatMasteryEffectSummary = (nodeId, sectionTree, renderer) => {
  const effect = resolveSelectedMasteryEffect(nodeId, sectionTree, renderer);
  const stats = Array.isArray(effect?.stats)
    ? effect.stats.filter((stat) => typeof stat === 'string' && stat.trim())
    : [];
  if (stats.length === 0) return '';
  return stats.join(' | ');
};

const buildMasteryActionHint = (nodeIds, sectionTree, renderer) => {
  const summaries = uniqueNodeIds(nodeIds)
    .map((nodeId) => formatMasteryEffectSummary(nodeId, sectionTree, renderer))
    .filter(Boolean);
  if (summaries.length === 0) return '';
  if (summaries.length === 1) return `Choose mastery option: ${summaries[0]}.`;
  return `Choose mastery options: ${summaries.slice(0, 2).join(' / ')}${summaries.length > 2 ? ` +${summaries.length - 2} more` : ''}.`;
};

const formatNodeSummary = (nodeIds, state, renderer, options = {}) => {
  const maxNames = Number.isFinite(options.maxNames) ? Math.max(1, options.maxNames) : 2;
  const names = uniqueNodeIds(nodeIds)
    .map((id) => resolveTreeNodeLabel(id, state, renderer))
    .filter(Boolean);
  if (names.length === 0) return '';
  const visible = names.slice(0, maxNames).map((name) => `'${name}'`);
  if (visible.length === 1) {
    return names.length > maxNames ? `${visible[0]} +${names.length - maxNames} more` : visible[0];
  }
  const joined = visible.length === 2
    ? `${visible[0]} & ${visible[1]}`
    : `${visible.slice(0, -1).join(', ')} & ${visible[visible.length - 1]}`;
  return names.length > maxNames ? `${joined} +${names.length - maxNames} more` : joined;
};

function setPreviewActionHint(el, text, { respec = false } = {}) {
  if (!el) return;
  if (!text) {
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('respec');
    return;
  }
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('respec', respec);
}

function buildPopupTreeInstruction(progress, sectionTree, state, renderer) {
  const addNodes = uniqueNodeIds(progress?.highlightNodes);
  const previousNodes = uniqueNodeIds(progress?.previousNodes || sectionTree?.highlight?.previous);
  const currentNodes = uniqueNodeIds(progress?.currentNodes || sectionTree?.highlight?.current);
  const removedNodes = uniqueNodeIds(progress?.removedNodes || sectionTree?.highlight?.removed);
  const visibleAddNodes = partitionPreviewNodeIds(addNodes, renderer).tree;
  const visibleRemovedNodes = partitionPreviewNodeIds(removedNodes, renderer).tree;
  const ascendancyActionHint = buildAscendancyActionHint(addNodes, state, renderer);
  const progressNodes = uniqueNodeIds(progress?.progressNodes);
  const allocatedBeforeCurrentCount = Math.max(0, Number(progress?.allocatedBeforeCurrentCount || 0));
  const allocatedAtCurrentCount = Math.max(0, Number(progress?.allocatedAtCurrentCount || 0));
  const labelNodeIds = addNodes.length > 0
    ? addNodes
    : (progress?.nextNodeId ? [String(progress.nextNodeId)] : []);
  const masteryActionHint = buildMasteryActionHint(labelNodeIds, sectionTree, renderer);

  if (progress?.actionDriven) {
    if (removedNodes.length === 0) {
      const actionHint = [masteryActionHint, ascendancyActionHint].filter(Boolean).join(' ');
      return {
        label: buildPreviewAllocateLabel(labelNodeIds, state, renderer),
        actionHint,
        renderNodes: uniqueNodeIds(progress?.activeNodeIds),
        visibleNodeIds: null,
        inactiveNodeIds: null,
        highlightNodeId: progress?.nextNodeId || null,
        highlightNodeIds: visibleAddNodes,
        sectionHighlight: {
          previous: [],
          current: visibleAddNodes,
          removed: [],
        },
        requiresRespec: false,
      };
    }

    const addCount = Math.max(1, visibleAddNodes.length || addNodes.length);
    const removeSummary = formatNodeSummary(visibleRemovedNodes, state, renderer, { maxNames: 2 });
    const addSummary = formatNodeSummary(visibleAddNodes, state, renderer, { maxNames: 2 });
    let actionHint = '';
    if (addSummary && removeSummary) {
      actionHint = `Allocate ${addSummary}. Red nodes can be removed.`;
    } else if (addSummary) {
      actionHint = `Allocate ${addSummary}.`;
    } else if (removeSummary) {
      actionHint = 'Red nodes can be removed.';
    } else {
      actionHint = `Allocate ${addCount}. Red nodes can be removed.`;
    }
    if (removedNodes.length + addNodes.length > 10) {
      actionHint = visibleAddNodes.length > 0 || addNodes.length > 0
        ? `Allocate ${addCount}. Red nodes can be removed.`
        : 'Red nodes can be removed. Open build for full tree.';
    }
    if (ascendancyActionHint) {
      actionHint = actionHint ? `${actionHint} ${ascendancyActionHint}` : ascendancyActionHint;
    }
    if (masteryActionHint) {
      actionHint = actionHint ? `${actionHint} ${masteryActionHint}` : masteryActionHint;
    }

    return {
      label: buildPreviewAllocateLabel(labelNodeIds, state, renderer),
      actionHint,
      renderNodes: uniqueNodeIds(progress?.activeNodeIds),
      visibleNodeIds: null,
      inactiveNodeIds: visibleRemovedNodes,
      highlightNodeId: visibleAddNodes[0] || progress?.nextNodeId || null,
      highlightNodeIds: visibleAddNodes,
      sectionHighlight: {
        previous: [],
        current: visibleAddNodes,
        removed: visibleRemovedNodes,
      },
      requiresRespec: true,
    };
  }

  const buildActiveNodesAtCount = (count, { dropRemoved = false } = {}) => {
    const active = uniqueNodeIds(previousNodes.concat(progressNodes.slice(0, Math.max(0, count))));
    if (!dropRemoved || removedNodes.length === 0) return active;
    const removedSet = new Set(removedNodes);
    return active.filter((id) => !removedSet.has(String(id)));
  };
  const activeNodeIdsBeforeRespec = buildActiveNodesAtCount(allocatedAtCurrentCount);
  const firstSafeRemovalCount = removedNodes.length > 0
    ? (() => {
        const removedSet = new Set(removedNodes);
        const progressSet = new Set(progressNodes);
        const actions = Array.isArray(sectionTree?.actions) ? sectionTree.actions : [];
        let allocateCount = 0;
        for (const action of actions) {
          if (!action || !action.type || !action.nodeId) continue;
          const nodeId = String(action.nodeId);
          if (action.type === 'allocate' && progressSet.has(nodeId)) {
            allocateCount += 1;
            continue;
          }
          if (action.type === 'deallocate' && removedSet.has(nodeId)) {
            return allocateCount;
          }
        }
        for (let count = 0; count <= progressNodes.length; count += 1) {
          if (canSafelyRespecNodes(buildActiveNodesAtCount(count), removedNodes, state, renderer)) {
            return count;
          }
        }
        return null;
      })()
    : null;
  const canDropRemovedNow =
      firstSafeRemovalCount != null && allocatedAtCurrentCount >= firstSafeRemovalCount;
  const showRespecHint =
      firstSafeRemovalCount != null && allocatedAtCurrentCount === firstSafeRemovalCount;
  const showRespecOverlay = (
      removedNodes.length > 0 &&
      firstSafeRemovalCount != null &&
      allocatedAtCurrentCount >= firstSafeRemovalCount
    );
  const activeNodeIdsAfterRespec = buildActiveNodesAtCount(allocatedAtCurrentCount, { dropRemoved: true });
  const displayNodeIds = showRespecOverlay
      ? activeNodeIdsAfterRespec
      : canDropRemovedNow
        ? activeNodeIdsAfterRespec
        : activeNodeIdsBeforeRespec;

  if (!showRespecOverlay) {
    const actionHint = [masteryActionHint, ascendancyActionHint].filter(Boolean).join(' ');
    return {
      label: buildPreviewAllocateLabel(labelNodeIds, state, renderer),
      actionHint,
      renderNodes: displayNodeIds.length > 0
        ? displayNodeIds
        : (progress?.nextNodeId ? [progress.nextNodeId] : []),
      visibleNodeIds: null,
      inactiveNodeIds: null,
      highlightNodeId: progress?.nextNodeId || null,
      highlightNodeIds: visibleAddNodes,
      sectionHighlight: {
        previous: [],
        current: visibleAddNodes,
        removed: [],
      },
      requiresRespec: false,
    };
  }

  const addCount = Math.max(1, visibleAddNodes.length || addNodes.length);
  const label = labelNodeIds.length > 0
      ? buildPreviewAllocateLabel(labelNodeIds, state, renderer)
      : `Remove ${visibleRemovedNodes.length || removedNodes.length} node${(visibleRemovedNodes.length || removedNodes.length) === 1 ? '' : 's'}`;
  const removeSummary = formatNodeSummary(visibleRemovedNodes, state, renderer, { maxNames: 2 });
  const addSummary = formatNodeSummary(visibleAddNodes, state, renderer, { maxNames: 2 });
  let actionHint = '';
  if (showRespecHint) {
    if (addSummary && removeSummary) {
      actionHint = `Allocate ${addSummary}. Red nodes can be removed.`;
    } else if (addSummary) {
      actionHint = `Allocate ${addSummary}.`;
    } else if (removeSummary) {
      actionHint = `Red nodes can be removed.`;
    } else if (removedNodes.length > 0 && addNodes.length > 0) {
      actionHint = `Allocate ${addCount}. Red nodes can be removed.`;
    } else if (removedNodes.length > 0) {
      actionHint = 'Red nodes can be removed.';
    }
    const totalActionNodes = removedNodes.length + addNodes.length;
    if (totalActionNodes > 6 && addNodes.length > 0) {
      actionHint = `Allocate ${addCount}. Red nodes can be removed.`;
    } else if (totalActionNodes > 10 && removedNodes.length > 0) {
      actionHint = 'Red nodes can be removed. Open build for full tree.';
    }
  }
  if (ascendancyActionHint) {
    actionHint = actionHint ? `${actionHint} ${ascendancyActionHint}` : ascendancyActionHint;
  }
  if (masteryActionHint) {
    actionHint = actionHint ? `${actionHint} ${masteryActionHint}` : masteryActionHint;
  }

  return {
    label,
    actionHint,
    renderNodes: displayNodeIds.length > 0 ? displayNodeIds : addNodes,
    visibleNodeIds: null,
    inactiveNodeIds: visibleRemovedNodes,
    highlightNodeId: visibleAddNodes[0] || progress?.nextNodeId || null,
    highlightNodeIds: visibleAddNodes,
    sectionHighlight: {
      previous: [],
      current: visibleAddNodes,
      removed: visibleRemovedNodes,
    },
    requiresRespec: true,
  };
}

function uniqueNodeIds(nodeIds) {
  return Array.from(
    new Set(
      (Array.isArray(nodeIds) ? nodeIds : [])
        .filter((id) => id != null)
        .map((id) => String(id))
    )
  );
}

function resolveClassStartIndex(className) {
  const normalized = String(className || '').trim().toLowerCase();
  const map = {
    scion: 0,
    marauder: 1,
    ranger: 2,
    witch: 3,
    duelist: 4,
    templar: 5,
    shadow: 6,
  };
  return map[normalized] ?? null;
}

function resolveClassStartNodeIds(state, renderer) {
  const startIndex = resolveClassStartIndex(state?.general?.class || state?.general?.className);
  const nodes = renderer?.treeData?.nodes;
  if (startIndex == null || !nodes || typeof nodes !== 'object') return [];
  return Object.entries(nodes)
    .filter(([, node]) => Number(node?.classStartIndex) === startIndex)
    .map(([id]) => String(id));
}

function canSafelyRespecNodes(activeNodeIds, removedNodeIds, state, renderer) {
  const active = uniqueNodeIds(activeNodeIds);
  const removed = new Set(uniqueNodeIds(removedNodeIds));
  if (active.length === 0 || removed.size === 0) return false;

  const nodes = renderer?.treeData?.nodes;
  if (!nodes || typeof nodes !== 'object') return false;

  const kept = new Set(active.filter((id) => !removed.has(String(id))));
  if (kept.size === 0) return false;

  const startIds = resolveClassStartNodeIds(state, renderer).filter((id) => kept.has(id));
  if (startIds.length === 0) return false;

  const visited = new Set();
  const queue = [...startIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id) || !kept.has(id)) continue;
    visited.add(id);
    const node = nodes[id];
    const neighbors = []
      .concat(Array.isArray(node?.out) ? node.out : [])
      .concat(Array.isArray(node?.in) ? node.in : []);
    neighbors.forEach((nextId) => {
      const key = String(nextId);
      if (kept.has(key) && !visited.has(key)) queue.push(key);
    });
  }

  return visited.size === kept.size;
}

const SOCKET_IMG = {
  blue: '../assets/assets/skills/socket-blue.png',
  green: '../assets/assets/skills/socket-green.png',
  red: '../assets/assets/skills/socket-red.png',
  white: '../assets/assets/skills/socket-white.png',
};
const LINK_IMG = '../assets/assets/skills/link-gold.png';

// Net Worth settings
let netWorthSettings = {
  currencyDisplay: 'divines',
  visibility: 'disabled',
  position: null
  // locked removed - now controlled by settingsWindowOpen
};
let isNetWorthDragging = false;
let netWorthDragOffset = { x: 0, y: 0 };
let netWorthDragStartPos = { x: 0, y: 0 };

// Docking Handle settings
let dockingHandleSettings = {
  visibility: 'always' // 'always' or 'hover'
};

// Build Guide settings
let buildSettings = {
  visibility: 'always', // 'always', 'hover', or 'disabled'
  position: null,
  characterLevel: 1,
  quickPreviewLevelOffset: 0,
  levelPopupPosition: null,
  quickPreviewShowTree: true,
  quickPreviewShowSkills: true,
  quickPreviewShowGear: true,
  quickPreviewPosition: null,
  buildQuickPreviewControllerCombo: null,
  buildQuickPreviewControllerEnabled: false,
  openSettingsControllerCombo: null,
  openSettingsControllerEnabled: false,
  controllerType: 'auto'
};
let quickPreviewZoomFactor = 1;
let quickPreviewZoomSaveTimer = null;
let isBuildDragging = false;
let buildDragOffset = { x: 0, y: 0 };
let buildDragStartPos = { x: 0, y: 0 };
let isQuickPreviewDragging = false;
let quickPreviewDragOffset = { x: 0, y: 0 };
let quickPreviewDragStartPos = { x: 0, y: 0 };
let isLevelPopupDragging = false;
let levelPopupDragOffset = { x: 0, y: 0 };
let levelPopupPinned = false;
let levelPopupPositionMode = false;
let levelPopupRequestVersion = 0;
let controllerPollHandle = null;
let controllerQuickPreviewPressed = false;
let controllerSettingsPressed = false;
let controllerShortcuts = {
  quickPreviewCombo: null,
  openSettingsCombo: null,
  type: 'auto'
};

const CONTROLLER_BUTTONS_BY_TYPE = {
  xbox: {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    SQUARE: 2,
    TRIANGLE: 3,
    LB: 4,
    RB: 5,
    L1: 4,
    R1: 5,
    LT: 6,
    RT: 7,
    L2: 6,
    R2: 7,
    BACK: 8,
    SELECT: 8,
    VIEW: 8,
    START: 9,
    MENU: 9,
    LS: 10,
    RS: 11,
    L3: 10,
    R3: 11,
    DPADUP: 12,
    DPADDOWN: 13,
    DPADLEFT: 14,
    DPADRIGHT: 15,
    UP: 12,
    DOWN: 13,
    LEFT: 14,
    RIGHT: 15,
    GUIDE: 16,
    HOME: 16,
    XBOX: 16
  },
  playstation: {
    CROSS: 0,
    X: 0,
    CIRCLE: 1,
    O: 1,
    SQUARE: 2,
    TRIANGLE: 3,
    Y: 3,
    XBOX_X: 2,
    L1: 4,
    R1: 5,
    L2: 6,
    R2: 7,
    SHARE: 8,
    OPTIONS: 9,
    START: 9,
    SELECT: 8,
    L3: 10,
    R3: 11,
    DPADUP: 12,
    DPADDOWN: 13,
    DPADLEFT: 14,
    DPADRIGHT: 15,
    UP: 12,
    DOWN: 13,
    LEFT: 14,
    RIGHT: 15,
    PS: 16
  },
  nintendo: {
    B: 0,
    A: 1,
    Y: 2,
    X: 3,
    SQUARE: 2,
    TRIANGLE: 3,
    L: 4,
    R: 5,
    ZL: 6,
    ZR: 7,
    MINUS: 8,
    PLUS: 9,
    START: 9,
    SELECT: 8,
    L3: 10,
    R3: 11,
    DPADUP: 12,
    DPADDOWN: 13,
    DPADLEFT: 14,
    DPADRIGHT: 15,
    UP: 12,
    DOWN: 13,
    LEFT: 14,
    RIGHT: 15,
    HOME: 16
  },
  generic: {}
};

function resolveControllerType(gamepad, forcedType) {
  if (forcedType && forcedType !== 'auto') return forcedType;
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

function getControllerButtonsMap(type) {
  if (type === 'generic') {
    return CONTROLLER_BUTTONS_BY_TYPE.generic;
  }
  return CONTROLLER_BUTTONS_BY_TYPE[type] || CONTROLLER_BUTTONS_BY_TYPE.xbox;
}

function parseControllerCombo(raw, type) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return null;
  const parts = cleaned.split('+').filter(Boolean);
  if (!parts.length) return null;
  const buttons = getControllerButtonsMap(type);
  const indices = [];
  for (const part of parts) {
    let idx = buttons[part];
    if (typeof idx !== 'number' && part.startsWith('BTN')) {
      const parsed = Number(part.slice(3));
      if (Number.isFinite(parsed)) idx = parsed;
    }
    if (typeof idx !== 'number') return null;
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices.length ? indices : null;
}

function updateControllerShortcuts(settings) {
  const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  const nextType = hasOwn(settings, 'controllerType')
    ? (settings?.controllerType || 'auto')
    : (buildSettings.controllerType || 'auto');
  buildSettings.controllerType = nextType;
  controllerShortcuts.type = nextType;

  const quickComboRaw = hasOwn(settings, 'buildQuickPreviewControllerCombo')
    ? settings?.buildQuickPreviewControllerCombo
    : buildSettings.buildQuickPreviewControllerCombo;
  buildSettings.buildQuickPreviewControllerCombo = quickComboRaw;
  const quickEnabled = hasOwn(settings, 'buildQuickPreviewControllerEnabled')
    ? settings?.buildQuickPreviewControllerEnabled === true
    : buildSettings.buildQuickPreviewControllerEnabled === true;
  buildSettings.buildQuickPreviewControllerEnabled = quickEnabled;

  const openComboRaw = hasOwn(settings, 'openSettingsControllerCombo')
    ? settings?.openSettingsControllerCombo
    : buildSettings.openSettingsControllerCombo;
  buildSettings.openSettingsControllerCombo = openComboRaw;

  const openEnabled = hasOwn(settings, 'openSettingsControllerEnabled')
    ? settings?.openSettingsControllerEnabled === true
    : buildSettings.openSettingsControllerEnabled === true;
  buildSettings.openSettingsControllerEnabled = openEnabled;

  controllerShortcuts.quickPreviewCombo = quickEnabled
    ? parseControllerCombo(quickComboRaw, controllerShortcuts.type)
    : null;
  controllerShortcuts.openSettingsCombo = openEnabled
    ? parseControllerCombo(openComboRaw, controllerShortcuts.type)
    : null;
  const shouldPoll = !!(controllerShortcuts.quickPreviewCombo || controllerShortcuts.openSettingsCombo);
  if (shouldPoll && !controllerPollHandle) {
    startControllerPolling();
  }
  if (!shouldPoll && controllerPollHandle) {
    cancelAnimationFrame(controllerPollHandle);
    controllerPollHandle = null;
    controllerQuickPreviewPressed = false;
    controllerSettingsPressed = false;
  }
}

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

function isComboPressed(gamepad, combo) {
  if (!gamepad || !combo || !combo.length) return false;
  return combo.every((idx) => {
    const button = gamepad.buttons[idx];
    return !!button && button.pressed;
  });
}

function startControllerPolling() {
  const poll = () => {
    const gamepad = getActiveGamepad();
    const resolvedType = resolveControllerType(gamepad, controllerShortcuts.type);
    if (resolvedType !== controllerShortcuts.type) {
      controllerShortcuts.type = resolvedType;
      controllerShortcuts.quickPreviewCombo = parseControllerCombo(
        buildSettings?.buildQuickPreviewControllerCombo,
        controllerShortcuts.type
      );
      controllerShortcuts.openSettingsCombo = parseControllerCombo(
        buildSettings?.openSettingsControllerCombo,
        controllerShortcuts.type
      );
    }
    if (controllerShortcuts.quickPreviewCombo) {
      const pressed = isComboPressed(gamepad, controllerShortcuts.quickPreviewCombo);
      if (pressed && !controllerQuickPreviewPressed) {
        toggleBuildQuickPreview();
      }
      controllerQuickPreviewPressed = pressed;
    } else {
      controllerQuickPreviewPressed = false;
    }

    if (controllerShortcuts.openSettingsCombo) {
      const pressed = isComboPressed(gamepad, controllerShortcuts.openSettingsCombo);
      if (pressed && !controllerSettingsPressed) {
        window.managementAPI.toggleSettings('general');
      }
      controllerSettingsPressed = pressed;
    } else {
      controllerSettingsPressed = false;
    }

    controllerPollHandle = requestAnimationFrame(poll);
  };
  controllerPollHandle = requestAnimationFrame(poll);
}

function clampPosition(pos, width, height) {
  if (!pos || typeof pos !== 'object') return null;
  const right = Number(pos.right);
  const top = Number(pos.top);
  if (!Number.isFinite(right) || !Number.isFinite(top)) return null;
  const maxRight = Math.max(0, width - 48);
  const maxTop = Math.max(0, height - 48);
  return {
    right: Math.max(0, Math.min(right, maxRight)),
    top: Math.max(0, Math.min(top, maxTop))
  };
}

function getAnchorRect(el) {
  if (!el || el.classList.contains('hidden')) return null;
  const rect = el.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function getVirtualRectFromPosition(position, width, height) {
  if (!position) return null;
  const right = Number(position.right);
  const top = Number(position.top);
  if (!Number.isFinite(right) || !Number.isFinite(top)) return null;
  return {
    top,
    left: window.innerWidth - right - width,
    right: window.innerWidth - right,
    bottom: top + height,
    width,
    height
  };
}

function getNetWorthAnchorRect() {
  const indicatorRect = getAnchorRect(networthIndicator);
  if (indicatorRect) return indicatorRect;

  const savedRect = getVirtualRectFromPosition(netWorthSettings.position, 48, 48);
  if (savedRect) return savedRect;

  const handleRect = getAnchorRect(dockingHandle);
  if (handleRect) {
    const indicatorHeight = 48;
    const spacing = 8;
    let top = handleRect.top - indicatorHeight - spacing;
    if (top < 0) top = handleRect.bottom + spacing;
    if (top + indicatorHeight > window.innerHeight) {
      top = Math.max(0, window.innerHeight - indicatorHeight - 8);
    }
    return {
      top,
      left: handleRect.left,
      right: handleRect.right,
      bottom: top + indicatorHeight,
      width: 48,
      height: indicatorHeight
    };
  }

  return {
    top: 16,
    left: window.innerWidth - 64,
    right: window.innerWidth - 16,
    bottom: 64,
    width: 48,
    height: 48
  };
}

// Position net worth indicator above docking handle
function positionNetWorthIndicator() {
  const handleRect = getAnchorRect(dockingHandle);
  const indicator = document.getElementById('networthIndicator');
  if (!indicator) return;
  
  // If there's a saved position, use it
  if (netWorthSettings.position && !isNetWorthDragging) {
    indicator.style.right = netWorthSettings.position.right + 'px';
    indicator.style.top = netWorthSettings.position.top + 'px';
    indicator.style.transform = 'none';
    
    // Position hover zone at the same position
    if (networthHoverZone) {
      const indicatorRect = indicator.getBoundingClientRect();
      // Position hover zone exactly at the same position as the indicator
      networthHoverZone.style.left = indicatorRect.left + 'px';
      networthHoverZone.style.top = indicatorRect.top + 'px';
      networthHoverZone.style.width = indicatorRect.width + 'px';
      networthHoverZone.style.height = indicatorRect.height + 'px';
      networthHoverZone.style.right = 'auto';
      networthHoverZone.style.transform = 'none';
    }
    positionRunTimer();
    return;
  }

  if (!handleRect) {
    const right = 16;
    const top = 16;
    indicator.style.right = right + 'px';
    indicator.style.top = top + 'px';
    indicator.style.transform = 'none';

    if (networthHoverZone) {
      const indicatorRect = indicator.getBoundingClientRect();
      networthHoverZone.style.left = indicatorRect.left + 'px';
      networthHoverZone.style.top = indicatorRect.top + 'px';
      networthHoverZone.style.width = indicatorRect.width + 'px';
      networthHoverZone.style.height = indicatorRect.height + 'px';
      networthHoverZone.style.right = 'auto';
      networthHoverZone.style.transform = 'none';
    }
    positionRunTimer();
    return;
  }
  
  // Otherwise position above the docking block
  const indicatorHeight = 48;
  const spacing = 8; // Space between indicator and handle
  
  let top = handleRect.top - indicatorHeight - spacing;
  
  // Ensure the indicator doesn't go outside the screen
  if (top < 0) {
    // If there's no space above, place below the docking block
    top = handleRect.bottom + spacing;
  }
  
  // Check if it still fits within the screen
  if (top + indicatorHeight > window.innerHeight) {
    top = Math.max(0, window.innerHeight - indicatorHeight - 8);
  }
  
  const right = window.innerWidth - handleRect.right;
  indicator.style.right = right + 'px';
  indicator.style.top = top + 'px';
  indicator.style.transform = 'none';
  
  // Position hover zone at the same position
  if (networthHoverZone) {
    const indicatorRect = indicator.getBoundingClientRect();
    // Position hover zone exactly at the same position as the indicator
    networthHoverZone.style.left = indicatorRect.left + 'px';
    networthHoverZone.style.top = indicatorRect.top + 'px';
    networthHoverZone.style.width = indicatorRect.width + 'px';
    networthHoverZone.style.height = indicatorRect.height + 'px';
    networthHoverZone.style.right = 'auto';
    networthHoverZone.style.transform = 'none';
  }
  positionRunTimer();
}

// Position build indicator above net worth indicator
function positionBuildIndicator() {
  const anchorRect = getAnchorRect(networthIndicator) || getAnchorRect(dockingHandle);
  const indicator = document.getElementById('buildIndicator');
  if (!indicator) return;

  // If there's a saved position, use it
  if (buildSettings.position && !isBuildDragging) {
    const clamped = clampPosition(buildSettings.position, window.innerWidth, window.innerHeight);
    const position = clamped || buildSettings.position;
    indicator.style.right = position.right + 'px';
    indicator.style.top = position.top + 'px';
    indicator.style.transform = 'none';

    // Position hover zone at the same position
    if (buildHoverZone) {
      const indicatorRect = indicator.getBoundingClientRect();
      buildHoverZone.style.left = indicatorRect.left + 'px';
      buildHoverZone.style.top = indicatorRect.top + 'px';
      buildHoverZone.style.width = indicatorRect.width + 'px';
      buildHoverZone.style.height = indicatorRect.height + 'px';
      buildHoverZone.style.right = 'auto';
      buildHoverZone.style.transform = 'none';
    }

    positionBuildQuickPreview();
    return;
  }

  if (!anchorRect) {
    const right = 16;
    const top = Math.max(16, Math.round(window.innerHeight / 2 - 24));
    indicator.style.right = right + 'px';
    indicator.style.top = top + 'px';
    indicator.style.transform = 'none';

    if (buildHoverZone) {
      const indicatorRect = indicator.getBoundingClientRect();
      buildHoverZone.style.left = indicatorRect.left + 'px';
      buildHoverZone.style.top = indicatorRect.top + 'px';
      buildHoverZone.style.width = indicatorRect.width + 'px';
      buildHoverZone.style.height = indicatorRect.height + 'px';
      buildHoverZone.style.right = 'auto';
      buildHoverZone.style.transform = 'none';
    }
    positionBuildQuickPreview();
    return;
  }

  // Otherwise position above the networth indicator
  const indicatorHeight = 48;
  const spacing = 8; // Space between indicators

  let top = anchorRect.top - indicatorHeight - spacing;

  // Ensure the indicator doesn't go outside the screen
  if (top < 0) {
    // If there's no space above, place below the networth indicator
    top = anchorRect.bottom + spacing;
  }

  // Check if it still fits within the screen
  if (top + indicatorHeight > window.innerHeight) {
    top = Math.max(0, window.innerHeight - indicatorHeight - 8);
  }

  const right = window.innerWidth - anchorRect.right;
  indicator.style.right = right + 'px';
  indicator.style.top = top + 'px';
  indicator.style.transform = 'none';

  // Position hover zone at the same position
  if (buildHoverZone) {
    const indicatorRect = indicator.getBoundingClientRect();
    buildHoverZone.style.left = indicatorRect.left + 'px';
    buildHoverZone.style.top = indicatorRect.top + 'px';
    buildHoverZone.style.width = indicatorRect.width + 'px';
    buildHoverZone.style.height = indicatorRect.height + 'px';
    buildHoverZone.style.right = 'auto';
    buildHoverZone.style.transform = 'none';
  }
  positionBuildQuickPreview();
}

function applyLevelPopupPosition() {
  if (!levelUpPopup || isLevelPopupDragging) return;
  const pos = buildSettings.levelPopupPosition;
  if (pos && Number.isFinite(pos.right) && Number.isFinite(pos.top)) {
    levelUpPopup.style.right = `${pos.right}px`;
    levelUpPopup.style.top = `${pos.top}px`;
    levelUpPopup.style.left = 'auto';
    levelUpPopup.style.transform = 'none';
    return;
  }

  const rect = levelUpPopup.getBoundingClientRect();
  const popupHeight = rect.height || 240;
  const right = 24;
  const desiredTop = Math.round(window.innerHeight * 0.55 - popupHeight / 2);
  const top = Math.max(16, Math.min(desiredTop, window.innerHeight - popupHeight - 16));
  levelUpPopup.style.right = `${right}px`;
  levelUpPopup.style.top = `${top}px`;
  levelUpPopup.style.left = 'auto';
  levelUpPopup.style.transform = 'none';
}

// Position docking handle hover zone
function positionDockingHandleHoverZone() {
  if (!dockingHandleHoverZone) return;
  const handleRect = dockingHandle.getBoundingClientRect();
  // Position hover zone exactly at the same position as the docking handle
  dockingHandleHoverZone.style.left = handleRect.left + 'px';
  dockingHandleHoverZone.style.top = handleRect.top + 'px';
  dockingHandleHoverZone.style.width = handleRect.width + 'px';
  dockingHandleHoverZone.style.height = handleRect.height + 'px';
  dockingHandleHoverZone.style.right = 'auto';
  dockingHandleHoverZone.style.transform = 'none';
}

// Load docking handle settings
async function loadDockingHandleSettings() {
  try {
    const settings = await window.managementAPI.getSettings();
    
    // Visibility
    if (settings.dockingHandleVisibility === 'hover' || settings.dockingHandleVisibility === 'always' || settings.dockingHandleVisibility === 'disabled') {
      dockingHandleSettings.visibility = settings.dockingHandleVisibility;
    } else {
      dockingHandleSettings.visibility = 'always'; // default
    }
    
    // Apply settings
    updateDockingHandleVisibility();
    updateLockState();
  } catch (err) {
    console.error('[MANAGEMENT] Failed to load docking handle settings:', err);
  }
}

// Load net worth settings
async function loadNetWorthSettings() {
  try {
    const settings = await window.managementAPI.getSettings();
    
    // Currency display
    if (settings.netWorthCurrencyDisplay === 'chaos' || settings.netWorthCurrencyDisplay === 'divines') {
      netWorthSettings.currencyDisplay = settings.netWorthCurrencyDisplay;
    }
    
    // Visibility
    if (settings.netWorthVisibility === 'hover' || settings.netWorthVisibility === 'always' || settings.netWorthVisibility === 'disabled') {
      netWorthSettings.visibility = settings.netWorthVisibility;
    }
    
    // netWorthLocked removed - now controlled by settingsWindowOpen
    
    // Position
    if (settings.netWorthPosition) {
      netWorthSettings.position = clampPosition(settings.netWorthPosition, window.innerWidth, window.innerHeight) || null;
    }
    
    applyNetWorthSettings();
    setupNetWorthHoverListeners();
  } catch (err) {
    console.error('[MANAGEMENT] Failed to load net worth settings:', err);
  }
}

async function loadBuildSettings() {
  try {
    const settings = await window.managementAPI.getSettings();

    // Visibility
    if (settings.buildDockVisibility === 'hover' || settings.buildDockVisibility === 'always' || settings.buildDockVisibility === 'disabled') {
      buildSettings.visibility = settings.buildDockVisibility;
    }

  // Position
  if ('buildPosition' in settings) {
    if (settings.buildPosition) {
      buildSettings.position = clampPosition(settings.buildPosition, window.innerWidth, window.innerHeight) || null;
    } else {
      buildSettings.position = null;
    }
  }

    // Character level
    if (typeof settings.characterLevel === 'number') {
      buildSettings.characterLevel = settings.characterLevel;
      if (buildLevel) {
        buildLevel.textContent = `Lv ${settings.characterLevel}`;
      }
    } else {
      // Default level
      if (buildLevel) {
        buildLevel.textContent = 'Lv 1';
      }
    }
    updateQuickPreviewLevelDisplay();
    if (Number.isFinite(settings.buildQuickPreviewLevelOffset)) {
      buildSettings.quickPreviewLevelOffset = settings.buildQuickPreviewLevelOffset;
      updateQuickPreviewLevelDisplay();
    }
    if (Number.isFinite(settings.buildQuickPreviewZoomFactor)) {
      quickPreviewZoomFactor = Math.max(0.2, Math.min(4, settings.buildQuickPreviewZoomFactor));
    } else {
      quickPreviewZoomFactor = 1;
    }
    if (settings.buildLevelPopupPosition) {
      buildSettings.levelPopupPosition = settings.buildLevelPopupPosition;
      applyLevelPopupPosition();
    }

    if (typeof settings.buildQuickPreviewShowTree === 'boolean') {
      buildSettings.quickPreviewShowTree = settings.buildQuickPreviewShowTree;
    }
    if (typeof settings.buildQuickPreviewShowSkills === 'boolean') {
      buildSettings.quickPreviewShowSkills = settings.buildQuickPreviewShowSkills;
    }
    if (typeof settings.buildQuickPreviewShowGear === 'boolean') {
      buildSettings.quickPreviewShowGear = settings.buildQuickPreviewShowGear;
    }
    if (typeof settings.buildQuickPreviewControllerCombo === 'string' || settings.buildQuickPreviewControllerCombo === null) {
      buildSettings.buildQuickPreviewControllerCombo = settings.buildQuickPreviewControllerCombo;
    }
    if (typeof settings.buildQuickPreviewControllerEnabled === 'boolean') {
      buildSettings.buildQuickPreviewControllerEnabled = settings.buildQuickPreviewControllerEnabled;
    } else {
      buildSettings.buildQuickPreviewControllerEnabled = false;
    }
    if (typeof settings.openSettingsControllerCombo === 'string' || settings.openSettingsControllerCombo === null) {
      buildSettings.openSettingsControllerCombo = settings.openSettingsControllerCombo;
    }
    if (typeof settings.openSettingsControllerEnabled === 'boolean') {
      buildSettings.openSettingsControllerEnabled = settings.openSettingsControllerEnabled;
    } else {
      buildSettings.openSettingsControllerEnabled = false;
    }
    if (typeof settings.controllerType === 'string') {
      buildSettings.controllerType = settings.controllerType;
    }
    if ('buildQuickPreviewPosition' in settings) {
      if (settings.buildQuickPreviewPosition) {
        buildSettings.quickPreviewPosition =
          clampPosition(settings.buildQuickPreviewPosition, window.innerWidth, window.innerHeight) || null;
    } else {
      buildSettings.quickPreviewPosition = null;
    }
  }

    applyBuildSettings();
    applyQuickPreviewSettings();
    updateControllerShortcuts(settings);
    updateBuildLiveTrackingIndicator(settings);
  } catch (err) {
    console.error('[MANAGEMENT] Failed to load build settings:', err);
  }
}

// Apply net worth settings
function applyNetWorthSettings() {
  if (!networthIndicator) return;
  
  // Update icon based on currency display
  if (networthIconImg) {
    if (netWorthSettings.currencyDisplay === 'chaos') {
      networthIconImg.src = '../assets/currency/chaos.png';
      networthIconImg.alt = 'Chaos Orb';
    } else {
      networthIconImg.src = '../assets/currency/divine.png';
      networthIconImg.alt = 'Divine Orb';
    }
  }
  
  // Visibility
  networthIndicator.classList.remove('hover-only', 'hidden', 'visible');
  if (netWorthSettings.visibility === 'disabled') {
    // Hide completely when disabled
    networthIndicator.classList.add('hidden');
    if (networthHoverZone) {
      networthHoverZone.classList.add('hidden');
    }
  } else if (netWorthSettings.visibility === 'hover') {
    networthIndicator.classList.add('hover-only');
    // Show/hide hover zone based on visibility mode
    if (networthHoverZone) {
      networthHoverZone.classList.remove('hidden');
    }
  } else {
    // Always visible
    if (networthHoverZone) {
      networthHoverZone.classList.add('hidden');
    }
  }
  
  // Lock state is managed by updateLockState()
  updateLockState();
  
  // Position
  positionNetWorthIndicator();
  positionBuildIndicator();
}

function applyBuildSettings() {
  if (!buildIndicator) return;

  // Visibility
  buildIndicator.classList.remove('hover-only', 'hidden', 'visible');
  if (buildSettings.visibility === 'disabled') {
    // Hide completely when disabled
    buildIndicator.classList.add('hidden');
    if (buildHoverZone) {
      buildHoverZone.classList.add('hidden');
    }
  } else if (buildSettings.visibility === 'hover') {
    buildIndicator.classList.add('hover-only');
    // Show/hide hover zone based on visibility mode
    if (buildHoverZone) {
      buildHoverZone.classList.remove('hidden');
    }
  } else {
    // Always visible
    if (buildHoverZone) {
      buildHoverZone.classList.add('hidden');
    }
  }

  // Position
  positionBuildIndicator();
}

function updateBuildLiveTrackingIndicator(settings) {
  if (!buildIndicator || !buildLiveBadge) return;
  const activeCharacterName = typeof settings?.activeCharacterName === 'string' ? settings.activeCharacterName : null;
  const activeCharacterLeague = typeof settings?.activeCharacterLeague === 'string' ? settings.activeCharacterLeague : null;
  const current = settings?.currentCharacterLiveTracking && typeof settings.currentCharacterLiveTracking === 'object'
    ? settings.currentCharacterLiveTracking
    : null;
  const pending = settings?.liveTrackingPending && typeof settings.liveTrackingPending === 'object'
    ? settings.liveTrackingPending
    : null;
  const hasEnabledEntries = Boolean(
    settings?.liveTrackingByCharacter &&
    typeof settings.liveTrackingByCharacter === 'object' &&
    Object.values(settings.liveTrackingByCharacter).some((entry) => entry && entry.enabled === true)
  );

  buildLiveBadge.classList.remove('on', 'off', 'armed');
  let mode = 'off';
  const isArmed = Boolean(pending && current?.enabled !== true);
  if (current?.enabled === true || hasEnabledEntries || isArmed) {
    mode = 'on';
  }
  buildLiveBadge.classList.add(mode);

  const activeLabel = activeCharacterName
    ? `${activeCharacterName}${activeCharacterLeague ? ` (${activeCharacterLeague})` : ''}`
    : 'none';
  const trackingLabel = current?.enabled === true || hasEnabledEntries ? 'ON' : isArmed ? 'ARMED' : 'OFF';
  buildLiveBadge.title = `Live tracking ${trackingLabel}`;
  buildIndicator.title =
    `Left-click: open/close build guide overlay. Right-click: toggle quick preview. ` +
    `Click the top-right badge (or middle-click) to toggle live tracking for active character. ` +
    `Active character: ${activeLabel}. Live tracking: ${trackingLabel}.`;
}

async function toggleLiveTrackingFromIndicator() {
  try {
    const settings = await window.managementAPI.getSettings();
    const visibility = settings?.liveTrackingPending?.visibility === 'public' ? 'public' : 'private';
    const result = await window.managementAPI.toggleLiveTrackingForActiveCharacter({ visibility });
    if (!result?.ok) {
      console.warn('[MANAGEMENT] Live tracking toggle failed:', result?.error || 'unknown error');
    }
  } catch (err) {
    console.error('[MANAGEMENT] Failed to toggle live tracking for active character:', err);
  }
}

function applyQuickPreviewSettings() {
  if (quickPreviewTreeWrap) {
    quickPreviewTreeWrap.classList.toggle('hidden', !buildSettings.quickPreviewShowTree);
  }
  if (quickPreviewSkillsWrap) {
    quickPreviewSkillsWrap.classList.toggle('hidden', !buildSettings.quickPreviewShowSkills);
  }
  if (quickPreviewGearWrap) {
    quickPreviewGearWrap.classList.toggle('hidden', !buildSettings.quickPreviewShowGear);
  }
  if (buildQuickPreview) {
    buildQuickPreview.classList.toggle('draggable', settingsWindowOpen);
  }
  if (buildQuickPreview && !buildQuickPreview.classList.contains('hidden')) {
    positionBuildQuickPreview();
  }
}

function showNetWorthOnHover() {
  if (networthIndicator && netWorthSettings.visibility === 'hover') {
    networthIndicator.classList.add('visible');
    // Ensure window receives mouse events while indicator is visible
    updateClickThrough(false);
    // While visible, disable the hover zone so clicks reach the indicator
    if (networthHoverZone) {
      networthHoverZone.classList.add('hidden');
    }
  }
}

function hideNetWorthOnHover() {
  if (networthIndicator && netWorthSettings.visibility === 'hover') {
    setTimeout(() => {
      const overIndicator = networthIndicator.matches(':hover');
      const overHoverZone = networthHoverZone ? networthHoverZone.matches(':hover') : false;
      if (!overIndicator && !overHoverZone) {
        networthIndicator.classList.remove('visible');
        // Re-enable hover zone so it can trigger show on next hover
        if (networthHoverZone) {
          networthHoverZone.classList.remove('hidden');
        }
        // Restore click-through since indicator is no longer visible
        refreshClickThroughState();
      }
    }, 100);
  }
}

function showDockingHandleOnHover() {
  if (dockingHandle) {
    dockingHandle.classList.add('visible');
    // Ensure window receives mouse events while handle is visible
    updateClickThrough(false);
  }
}

function hideDockingHandleOnHover() {
  if (dockingHandle) {
    setTimeout(() => {
      const overHandle = dockingHandle.matches(':hover');
      const overHoverZone = dockingHandleHoverZone ? dockingHandleHoverZone.matches(':hover') : false;
      if (!overHandle && !overHoverZone) {
        dockingHandle.classList.remove('visible');
        // Restore click-through since handle is no longer visible
        refreshClickThroughState();
      }
    }, 100);
  }
}

// Setup hover listeners for net worth indicator
function setupNetWorthHoverListeners() {
  if (!networthHoverZone) return;
  
  // Remove old listeners
  networthHoverZone.removeEventListener('mouseenter', showNetWorthOnHover);
  networthHoverZone.removeEventListener('mouseleave', hideNetWorthOnHover);
  if (networthIndicator) {
    networthIndicator.removeEventListener('mouseenter', showNetWorthOnHover);
    networthIndicator.removeEventListener('mouseleave', hideNetWorthOnHover);
  }
  
  // Only add listeners when visibility is 'hover' (not disabled)
  if (netWorthSettings.visibility === 'hover') {
    // Add listeners to hover zone and indicator
    networthHoverZone.addEventListener('mouseenter', showNetWorthOnHover);
    networthHoverZone.addEventListener('mouseleave', hideNetWorthOnHover);
    if (networthIndicator) {
      networthIndicator.addEventListener('mouseenter', showNetWorthOnHover);
      networthIndicator.addEventListener('mouseleave', hideNetWorthOnHover);
    }
  }
}

// Decide whether the management window should be click-through right now
function refreshClickThroughState() {
  const hasOpenPanel =
    !feedBar.classList.contains('hidden') ||
    !feedDropdown.classList.contains('hidden') ||
    !contextMenu.classList.contains('hidden') ||
    (buildQuickPreview && !buildQuickPreview.classList.contains('hidden'));
  const hasActiveDrag =
    isDragging || isNetWorthDragging || isBuildDragging || isQuickPreviewDragging || isLevelPopupDragging;

  if (levelPopupPositionMode) {
    // Position mode must not lock the full-screen transparent management window.
    // Keep click-through enabled by default and only disable while hovering UI or dragging.
    if (hasOpenPanel || hasActiveDrag) {
      updateClickThrough(false);
    } else {
      updateClickThrough(!isOverUI);
    }
    return;
  }

  if (settingsWindowOpen) {
    // While settings are open, keep click-through enabled by default so the settings window
    // remains clickable; handleMouseMove will temporarily disable it only when hovering UI.
    if (hasOpenPanel || hasActiveDrag) {
      updateClickThrough(false);
    } else {
      updateClickThrough(!isOverUI);
    }
    return;
  }

  const uiVisible =
    hasOpenPanel ||
    (levelUpPopup && !levelUpPopup.classList.contains('hidden') && (levelPopupPinned || levelPopupPositionMode)) ||
    (dockingHandle && dockingHandle.classList.contains('visible')) ||
    (networthIndicator && networthIndicator.classList.contains('visible')) ||
    hasActiveDrag;
  updateClickThrough(!uiVisible);
}

// Update docking handle visibility
function updateDockingHandleVisibility() {
  if (!dockingHandle) return;
  
  dockingHandle.classList.remove('hover-only', 'hidden', 'visible');
  if (dockingHandleSettings.visibility === 'disabled') {
    // Hide completely when disabled
    dockingHandle.classList.add('hidden');
    if (dockingHandleHoverZone) {
      dockingHandleHoverZone.classList.add('hidden');
    }
  } else if (dockingHandleSettings.visibility === 'hover') {
    dockingHandle.classList.add('hover-only');
    if (dockingHandleHoverZone) {
      dockingHandleHoverZone.classList.remove('hidden');
    }
  } else {
    // Always visible
    if (dockingHandleHoverZone) {
      dockingHandleHoverZone.classList.add('hidden');
    }
  }
  
  setupDockingHandleHoverListeners();
  // Keep hover zone aligned with current handle position
  positionDockingHandleHoverZone();
  // Recompute click-through based on current visibility
  refreshClickThroughState();
}

// Setup hover listeners for docking handle
function setupDockingHandleHoverListeners() {
  if (!dockingHandleHoverZone) return;
  
  // Remove old listeners
  dockingHandleHoverZone.removeEventListener('mouseenter', showDockingHandleOnHover);
  dockingHandleHoverZone.removeEventListener('mouseleave', hideDockingHandleOnHover);
  if (dockingHandle) {
    dockingHandle.removeEventListener('mouseenter', showDockingHandleOnHover);
    dockingHandle.removeEventListener('mouseleave', hideDockingHandleOnHover);
  }
  
  // Only add listeners when visibility is 'hover' and not disabled and settings are closed
  if (dockingHandleSettings.visibility === 'hover' && !settingsWindowOpen) {
    // Add listeners to hover zone and handle
    dockingHandleHoverZone.addEventListener('mouseenter', showDockingHandleOnHover);
    dockingHandleHoverZone.addEventListener('mouseleave', hideDockingHandleOnHover);
    if (dockingHandle) {
      dockingHandle.addEventListener('mouseenter', showDockingHandleOnHover);
      dockingHandle.addEventListener('mouseleave', hideDockingHandleOnHover);
    }
  }
}

// Save net worth position
async function saveNetWorthPosition() {
  if (!networthIndicator) return;
  const rect = networthIndicator.getBoundingClientRect();
  netWorthSettings.position = {
    right: window.innerWidth - rect.right,
    top: rect.top
  };
  await window.managementAPI.updateSettings({
    netWorthPosition: netWorthSettings.position
  });
}

// Load handle position from settings
async function loadHandlePosition() {
  try {
    const settings = await window.managementAPI.getSettings();
    if (settings && settings.managementHandlePosition) {
      const pos =
        clampPosition(settings.managementHandlePosition, window.innerWidth, window.innerHeight) ||
        settings.managementHandlePosition;
      dockingHandle.style.right = pos.right + 'px';
      dockingHandle.style.top = pos.top + 'px';
      dockingHandle.style.transform = 'none';
    }
    // Positioneer hover zone
    positionDockingHandleHoverZone();
    // Load docking handle settings
    await loadDockingHandleSettings();
    // Load net worth settings
    await loadNetWorthSettings();
    // Load build settings
    await loadBuildSettings();
    // Position net worth indicator after loading the handle position
    positionNetWorthIndicator();
    positionBuildIndicator();
    // Update lock state
    updateLockState();
    // Setup hover listeners
    setupDockingHandleHoverListeners();
  } catch (err) {
    console.error('[MANAGEMENT] Failed to load handle position:', err);
  }
}

// Save handle position to settings
async function saveHandlePosition() {
  const rect = dockingHandle.getBoundingClientRect();
  await window.managementAPI.updateSettings({
    managementHandlePosition: {
      right: window.innerWidth - rect.right,
      top: rect.top
    }
  });
}

// Update lock state based on settings window
function updateLockState() {
  const locked = !settingsWindowOpen;
  
  if (locked) {
    // Settings closed: locked (not draggable), but clickable
    dockingHandle.classList.add('locked');
    dockingHandle.classList.remove('draggable');
    
    // Apply visibility setting based on dockingHandleSettings
    if (dockingHandleSettings.visibility === 'disabled') {
      // Hide completely when disabled
      dockingHandle.classList.add('hidden');
      dockingHandle.classList.remove('hover-only', 'visible');
      if (dockingHandleHoverZone) {
        dockingHandleHoverZone.classList.add('hidden');
      }
    } else if (dockingHandleSettings.visibility === 'hover') {
      dockingHandle.classList.add('hover-only');
      dockingHandle.classList.remove('visible', 'hidden'); // Start hidden
      // Show hover zone when hover-only mode
      if (dockingHandleHoverZone) {
        dockingHandleHoverZone.classList.remove('hidden');
      }
    } else {
      // Always visible
      dockingHandle.classList.remove('hover-only', 'hidden');
      dockingHandle.classList.remove('visible'); // visible is default
      // Hide hover zone when always visible
      if (dockingHandleHoverZone) {
        dockingHandleHoverZone.classList.add('hidden');
      }
    }
    
    if (networthIndicator) {
      networthIndicator.classList.add('locked');
      networthIndicator.classList.remove('draggable');
      // Apply visibility setting when settings are closed
      if (netWorthSettings.visibility === 'disabled') {
        // Completely hidden
        networthIndicator.classList.add('hidden');
        networthIndicator.classList.remove('visible');
        networthIndicator.classList.remove('hover-only');
        if (networthHoverZone) networthHoverZone.classList.add('hidden');
      } else if (netWorthSettings.visibility === 'hover') {
        // Hover-only mode: indicator hidden by default, shown via .visible
        networthIndicator.classList.remove('hidden');
        networthIndicator.classList.add('hover-only');
        networthIndicator.classList.remove('visible');
        if (networthHoverZone) networthHoverZone.classList.remove('hidden');
      } else {
        // Always visible
        networthIndicator.classList.remove('hidden');
        networthIndicator.classList.remove('hover-only');
        networthIndicator.classList.remove('visible');
        if (networthHoverZone) networthHoverZone.classList.add('hidden');
      }
      // Ensure cursor is pointer when locked (clickable)
      networthIndicator.style.cursor = 'pointer';
    }
    if (dragOverlay) {
      dragOverlay.classList.add('hidden');
    }
    // Enable click-through when settings are closed (unless over UI)
    if (!isOverUI) {
      updateClickThrough(true);
    }
  } else {
    // Settings open: unlocked (draggable), not clickable
    dockingHandle.classList.remove('locked');
    dockingHandle.classList.add('draggable');
    // When settings are open, show based on visibility setting (except disabled)
    if (dockingHandleSettings.visibility === 'disabled') {
      // Hide completely when disabled, even when settings are open
      dockingHandle.classList.add('hidden');
      dockingHandle.classList.remove('hover-only', 'visible');
      if (dockingHandleHoverZone) {
        dockingHandleHoverZone.classList.add('hidden');
      }
    } else {
      // Show the docking handle when settings are open (for dragging)
      dockingHandle.classList.remove('hidden', 'hover-only');
      dockingHandle.classList.remove('visible'); // visible is default
    }
    if (networthIndicator) {
      networthIndicator.classList.remove('locked');
      networthIndicator.classList.add('draggable');
      // When settings are open, show based on visibility setting (except disabled)
      if (netWorthSettings.visibility === 'disabled') {
        // Hide completely when disabled, even when settings are open
        networthIndicator.classList.add('hidden');
        if (networthHoverZone) {
          networthHoverZone.classList.add('hidden');
        }
      } else {
        // Show the net worth indicator when settings are open (for dragging)
        networthIndicator.classList.remove('hidden');
        networthIndicator.classList.remove('hover-only');
        networthIndicator.classList.add('visible');
        // Disable its hover zone during settings so it doesn't intercept drag/clicks
        if (networthHoverZone) {
          networthHoverZone.classList.add('hidden');
        }
      }
      // Cursor will be set to 'move' when dragging starts
      networthIndicator.style.cursor = '';
    }
    if (dragOverlay) {
      dragOverlay.classList.remove('hidden');
    }
    // Hide hover zones when settings are open (unless disabled)
    if (dockingHandleHoverZone && dockingHandleSettings.visibility !== 'disabled') {
      dockingHandleHoverZone.classList.add('hidden');
    }
    // Enable click-through when settings are open (will be disabled when over blocks)
    updateClickThrough(true);
  }
  
  // Setup hover listeners based on visibility setting
  setupDockingHandleHoverListeners();
  applyQuickPreviewSettings();
}

// Dragging functionality
function startDrag(e) {
  if (!settingsWindowOpen && !e.altKey) return;
  
  isDragging = true;
  dockingHandle.classList.add('dragging');

  const rect = dockingHandle.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;

  // Disable click-through during drag
  updateClickThrough(false);

  e.preventDefault();
}

function drag(e) {
  if (!isDragging) return;

  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;

  // Constrain to window bounds
  const maxX = window.innerWidth - dockingHandle.offsetWidth;
  const maxY = window.innerHeight - dockingHandle.offsetHeight;

  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));

  dockingHandle.style.right = (window.innerWidth - constrainedX - dockingHandle.offsetWidth) + 'px';
  dockingHandle.style.top = constrainedY + 'px';
  dockingHandle.style.transform = 'none';
  
  // Update hover zone position
  positionDockingHandleHoverZone();
  
  // Update net worth indicator position during drag
  positionNetWorthIndicator();
}

function endDrag() {
  if (!isDragging) return;

  isDragging = false;
  dockingHandle.classList.remove('dragging');
  saveHandlePosition();

  // Click-through will be handled by handleMouseMove
}

// Smart positioning for feed bar
function positionFeedBar() {
  const handleRect = dockingHandle.getBoundingClientRect();
  const barWidth = feedBar.offsetWidth || 500; // Estimate if not rendered yet
  const barHeight = feedBar.offsetHeight || 80;

  // Try to position to the left of handle
  let left = handleRect.left - barWidth - 8;
  let top = handleRect.top + (handleRect.height / 2) - (barHeight / 2);

  // If not enough space on left, position to right
  if (left < 0) {
    left = handleRect.right + 8;
  }

  // Constrain vertically
  if (top < 0) top = 8;
  if (top + barHeight > window.innerHeight) {
    top = window.innerHeight - barHeight - 8;
  }

  feedBar.style.left = left + 'px';
  feedBar.style.top = top + 'px';
}

// Toggle feed bar
function toggleFeedBar() {
  // Don't toggle when settings are open
  if (settingsWindowOpen) return;
  
  if (feedBar.classList.contains('hidden')) {
    feedBar.classList.remove('hidden');
    positionFeedBar();
    // Always disable click-through when feedBar is open
    isOverUI = true;
    updateClickThrough(false);
  } else {
    feedBar.classList.add('hidden');
    closeDropdown();
    closeContextMenu();
    // Re-enable click-through when bar closes
    isOverUI = false;
    updateClickThrough(true);
  }
}

// Render feed icons
function renderFeeds() {
  feedIconsEl.innerHTML = '';

  for (const feed of feeds) {
    const icon = document.createElement('div');
    icon.className = 'feed-icon';
    if (feed.muted) icon.classList.add('muted');
    icon.dataset.feedId = feed.id;

    // Icon or default app icon
    if (feed.icon) {
      icon.innerHTML = `<img src="${escapeHtml(feed.icon)}" class="feed-icon-img" alt="${escapeHtml(feed.name)}" />`;
    } else {
      // Use app icon as default
      icon.innerHTML = `<img src="../assets/app-icon-256.png" class="feed-icon-img" alt="${escapeHtml(feed.name)}" />`;
    }

    // Feed name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'feed-icon-name';
    nameLabel.textContent = feed.name;
    icon.appendChild(nameLabel);

    feedIconsEl.appendChild(icon);
  }

  // Reposition bar after rendering
  setTimeout(() => positionFeedBar(), 10);
}

// Show dropdown under feed icon
function showDropdown(feedId) {
  const feed = feeds.find(f => f.id === feedId);
  if (!feed) return;

  openDropdownFeedId = feedId;
  if (window.managementAPI.setFocusMode) {
    window.managementAPI.setFocusMode(true);
  }

  // Populate dropdown
  document.getElementById('dropdownName').value = feed.name || '';
  document.getElementById('dropdownUrl').value = feed.url || '';
  document.getElementById('dropdownMute').textContent = feed.muted ? 'Unmute' : 'Mute';

  // Show temporarily to get dimensions
  feedDropdown.classList.remove('hidden');
  feedDropdown.style.visibility = 'hidden';

  // Position dropdown below feed icon with screen bounds checking
  const icon = document.querySelector(`.feed-icon[data-feed-id="${feedId}"]`);
  if (icon) {
    const iconRect = icon.getBoundingClientRect();
    const dropdownRect = feedDropdown.getBoundingClientRect();

    // Default position: below and aligned left with icon
    let left = iconRect.left;
    let top = iconRect.bottom + 8;

    // Check right edge
    if (left + dropdownRect.width > window.innerWidth) {
      // Align right edge with icon right edge
      left = iconRect.right - dropdownRect.width;
    }

    // If still off screen, align with right edge of screen
    if (left + dropdownRect.width > window.innerWidth) {
      left = window.innerWidth - dropdownRect.width - 8;
    }

    // Check left edge
    if (left < 8) {
      left = 8;
    }

    // Check bottom edge
    if (top + dropdownRect.height > window.innerHeight) {
      // Position above icon instead
      top = iconRect.top - dropdownRect.height - 8;
    }

    // Check top edge
    if (top < 8) {
      top = 8;
    }

    feedDropdown.style.left = left + 'px';
    feedDropdown.style.top = top + 'px';
  }

  feedDropdown.style.visibility = 'visible';

  // Disable click-through when dropdown is open
  updateClickThrough(false);

  // Focus the first input field to enable typing
  setTimeout(() => {
    const nameInput = document.getElementById('dropdownName');
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }, 100);
}

function closeDropdown() {
  if (openDropdownFeedId) {
    const draftIndex = feeds.findIndex((feed) => feed.id === openDropdownFeedId && feed._draft === true)
    if (draftIndex >= 0) {
      feeds.splice(draftIndex, 1)
      renderFeeds()
    }
  }
  feedDropdown.classList.add('hidden');
  openDropdownFeedId = null;
  if (window.managementAPI.setFocusMode) {
    window.managementAPI.setFocusMode(false);
  }
  // Restore click-through unless other UI keeps it disabled
  refreshClickThroughState();
}

// Show context menu
function showContextMenu(feedId, x, y) {
  contextMenuFeedId = feedId;
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.remove('hidden');
  // Disable click-through when menu is open
  updateClickThrough(false);
}

function closeContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuFeedId = null;
  // Restore click-through unless other UI keeps it disabled
  refreshClickThroughState();
}

// Save feed changes from dropdown
async function saveFeedChanges() {
  if (!openDropdownFeedId) return;

  const name = document.getElementById('dropdownName').value.trim();
  const url = document.getElementById('dropdownUrl').value.trim();
  const existingFeed = feeds.find((feed) => feed.id === openDropdownFeedId) || null;

  if (name && url) {
    if (existingFeed?._draft === true) {
      await window.managementAPI.addFeed({
        id: openDropdownFeedId,
        name,
        url,
        muted: false,
        icon: null,
      });
      const draftIndex = feeds.findIndex((feed) => feed.id === openDropdownFeedId);
      if (draftIndex >= 0) {
        feeds[draftIndex] = {
          ...feeds[draftIndex],
          name,
          url,
          _draft: false,
        };
      }
      console.log('[MANAGEMENT] Feed created:', name);
    } else {
      await window.managementAPI.updateFeed(openDropdownFeedId, { name, url });
      console.log('[MANAGEMENT] Feed saved:', name);
    }
  }

  closeDropdown();
}

// Toggle feed mute
async function toggleFeedMute(feedId) {
  const feed = feeds.find(f => f.id === feedId);
  if (!feed) return;

  await window.managementAPI.updateFeed(feedId, {
    muted: !feed.muted
  });

  console.log('[MANAGEMENT] Feed mute toggled:', feed.name);
}

async function toggleAllFeedsMute() {
  if (!window.managementAPI.toggleAllFeedsMute) return;
  try {
    await window.managementAPI.toggleAllFeedsMute();
    console.log('[MANAGEMENT] Toggled all feeds mute');
  } catch (err) {
    console.error('[MANAGEMENT] Failed to toggle all feeds mute:', err);
  }
}

function updateDockMutedState(value) {
  allFeedsMuted = !!value;
  if (dockingHandle) {
    dockingHandle.classList.toggle('muted', allFeedsMuted);
  }
}

// Custom confirm dialog
function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const confirmDialog = document.getElementById('confirmDialog');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmOk = document.getElementById('confirmOk');
    const confirmCancel = document.getElementById('confirmCancel');

    confirmMessage.textContent = message;
    confirmDialog.classList.remove('hidden');

    const handleOk = () => {
      confirmDialog.classList.add('hidden');
      confirmOk.removeEventListener('click', handleOk);
      confirmCancel.removeEventListener('click', handleCancel);
      resolve(true);
    };

    const handleCancel = () => {
      confirmDialog.classList.add('hidden');
      confirmOk.removeEventListener('click', handleOk);
      confirmCancel.removeEventListener('click', handleCancel);
      resolve(false);
    };

    confirmOk.addEventListener('click', handleOk);
    confirmCancel.addEventListener('click', handleCancel);
  });
}

// Delete feed
async function deleteFeed(feedId) {
  const feed = feeds.find(f => f.id === feedId);
  if (!feed) return;

  if (feed._draft === true) {
    feeds = feeds.filter((entry) => entry.id !== feedId);
    renderFeeds();
    closeDropdown();
    closeContextMenu();
    return;
  }

  const confirmed = await showConfirmDialog(`Delete feed "${feed.name}"?`);
  if (!confirmed) return;

  await window.managementAPI.deleteFeed(feedId);
  console.log('[MANAGEMENT] Feed deleted:', feed.name);

  closeDropdown();
  closeContextMenu();
}

// Add new feed: create a new block and open inline dropdown for editing
async function addNewFeed(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const newFeed = {
    id: `feed-${Date.now()}`,
    name: 'New Feed',
    url: '',
    muted: false,
    icon: null,
    _draft: true,
  };

  // Optimistically add locally for immediate UI feedback
  feeds.push(newFeed);
  renderFeeds();

  // Open the dropdown so the user can enter name + URL
  showDropdown(newFeed.id);

}

// Load feeds
async function loadFeeds() {
  try {
    const settings = await window.managementAPI.getSettings();
    if (Array.isArray(settings.feeds)) {
      feeds = settings.feeds.map(f => ({
        ...f,
        muted: f.muted || false,
        icon: f.icon || null,
        _draft: false,
      }));
    }
    renderFeeds();
    updateDockMutedState(feeds.length > 0 && feeds.every(f => f.muted));
  } catch (err) {
    console.error('[MANAGEMENT] Failed to load feeds:', err);
  }
}

function escapeHtml(s) {
  const str = (s == null) ? '' : String(s);
  return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Check if mouse is over any UI element
function checkMouseOverUI(x, y) {
  const elements = document.elementsFromPoint(x, y);

  for (const el of elements) {
    if (el === dockingHandle ||
        dockingHandle.contains(el) ||
        el === dockingHandleHoverZone ||
        (dockingHandleHoverZone && dockingHandleHoverZone.contains(el)) ||
        el === networthIndicator ||
        (networthIndicator && networthIndicator.contains(el)) ||
        el === networthHoverZone ||
        (networthHoverZone && networthHoverZone.contains(el)) ||
          el === buildIndicator ||
          (buildIndicator && buildIndicator.contains(el)) ||
          el === buildHoverZone ||
          (buildHoverZone && buildHoverZone.contains(el)) ||
        el === buildQuickPreview ||
        (buildQuickPreview && buildQuickPreview.contains(el)) ||
        (levelUpPopup && levelUpPopup.classList.contains('positioning') && (el === levelUpPopup || levelUpPopup.contains(el))) ||
        el === runTimerIndicator ||
        (runTimerIndicator && runTimerIndicator.contains(el)) ||
        el === feedBar ||
        feedBar.contains(el) ||
        el === feedDropdown ||
        feedDropdown.contains(el) ||
        el === contextMenu ||
        contextMenu.contains(el)) {
      return true;
    }
  }

  return false;
}

// Update click-through state
function updateClickThrough(enabled) {
  if (enabled !== clickThroughEnabled) {
    clickThroughEnabled = enabled;
    window.managementAPI.setClickThrough(enabled);
    console.log('[MANAGEMENT] Click-through:', enabled ? 'enabled' : 'disabled');
  }
}

// Mouse move handler for dynamic click-through
function handleMouseMove(e) {
  // Throttle mouse move checks to prevent rapid toggling
  const now = Date.now();
  if (now - lastMouseMoveTime < mouseMoveThrottleDelay) {
    return;
  }
  lastMouseMoveTime = now;

  // If any UI element is visible, always disable click-through
  const networthIndicator = document.getElementById('networthIndicator');
  if (!feedBar.classList.contains('hidden') ||
      !feedDropdown.classList.contains('hidden') ||
      !contextMenu.classList.contains('hidden') ||
      isDragging ||
      isNetWorthDragging ||
      isBuildDragging ||
      isQuickPreviewDragging ||
      isLevelPopupDragging) {
    if (isOverUI !== true) {
      isOverUI = true;
      updateClickThrough(false);
    }
    return;
  }

  // When settings are open, only disable click-through when over the blocks
  if (settingsWindowOpen) {
    const overUI = checkMouseOverUI(e.clientX, e.clientY);
    if (overUI !== isOverUI) {
      isOverUI = overUI;
      updateClickThrough(!overUI); // Disable click-through only when over UI blocks
    }
    return;
  }

  // Normal behavior when settings are closed
  const overUI = checkMouseOverUI(e.clientX, e.clientY);

  if (overUI !== isOverUI) {
    isOverUI = overUI;
    updateClickThrough(!overUI); // Disable click-through when over UI
  }
}

// Event listeners
dockingHandle.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // Left click only
    if (settingsWindowOpen) {
      // When settings are open, allow direct dragging
      startDrag(e);
    } else if (e.altKey) {
      startDrag(e);
    } else {
      // When settings are closed, check if it's a click or drag
      if (!isDragging) {
        const startX = e.clientX;
        const startY = e.clientY;

        const checkDrag = (moveE) => {
          const deltaX = Math.abs(moveE.clientX - startX);
          const deltaY = Math.abs(moveE.clientY - startY);

          if (deltaX > 5 || deltaY > 5) {
            // It's a drag
            document.removeEventListener('mousemove', checkDrag);
            // Don't start drag when settings are closed
          }
        };

        const checkClick = (upE) => {
          document.removeEventListener('mousemove', checkDrag);
          document.removeEventListener('mouseup', checkClick);

          const deltaX = Math.abs(upE.clientX - startX);
          const deltaY = Math.abs(upE.clientY - startY);

          if (deltaX < 5 && deltaY < 5) {
            // It's a click
            toggleFeedBar();
          }
        };

        document.addEventListener('mousemove', checkDrag);
        document.addEventListener('mouseup', checkClick);
      }
    }
  }
});

// Right-click on docking handle to mute all feeds
dockingHandle.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  toggleAllFeedsMute();
});

document.addEventListener('mousemove', (e) => {
  drag(e);
  dragNetWorth(e);
  dragBuild(e);
  dragQuickPreview(e);
  dragLevelPopup(e);
  handleMouseMove(e);
});
document.addEventListener('mouseup', () => {
  endDrag();
  endNetWorthDrag();
  endBuildDrag();
  endQuickPreviewDrag();
  endLevelPopupDrag();
});

// Feed icon clicks
feedIconsEl.addEventListener('click', (e) => {
  const icon = e.target.closest('.feed-icon');
  if (icon) {
    const feedId = icon.dataset.feedId;
    if (openDropdownFeedId === feedId) {
      closeDropdown();
    } else {
      showDropdown(feedId);
    }
  }
});

// Feed icon right-clicks - toggle mute/unmute directly
feedIconsEl.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const icon = e.target.closest('.feed-icon');
  if (icon) {
    const feedId = icon.dataset.feedId;
    await toggleFeedMute(feedId);
  }
});

// Dropdown buttons
document.getElementById('dropdownSave').addEventListener('click', saveFeedChanges);
document.getElementById('dropdownMute').addEventListener('click', async () => {
  if (openDropdownFeedId) {
    await toggleFeedMute(openDropdownFeedId);
    closeDropdown();
  }
});
document.getElementById('dropdownDelete').addEventListener('click', () => {
  if (openDropdownFeedId) {
    deleteFeed(openDropdownFeedId);
  }
});

// Context menu items
contextMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('.context-item');
  if (item && contextMenuFeedId) {
    const action = item.dataset.action;

    if (action === 'mute') {
      await toggleFeedMute(contextMenuFeedId);
      closeContextMenu();
    } else if (action === 'edit') {
      closeContextMenu();
      showDropdown(contextMenuFeedId);
    } else if (action === 'delete') {
      deleteFeed(contextMenuFeedId);
    }
  }
});

// Add feed icon
addFeedIcon.addEventListener('click', addNewFeed);

// Click outside to close
document.addEventListener('click', (e) => {
  const networthIndicator = document.getElementById('networthIndicator');
  
  if (!feedBar.classList.contains('hidden') &&
      !feedBar.contains(e.target) &&
      !dockingHandle.contains(e.target) &&
      !(networthIndicator && networthIndicator.contains(e.target)) &&
      !feedDropdown.contains(e.target) &&
      !contextMenu.contains(e.target)) {
    feedBar.classList.add('hidden');
    closeDropdown();
    closeContextMenu();
  }

  if (!feedDropdown.classList.contains('hidden') &&
      !feedDropdown.contains(e.target) &&
      !addFeedIcon.contains(e.target) &&
      !e.target.closest('.feed-icon')) {
    closeDropdown();
  }

  if (!contextMenu.classList.contains('hidden') &&
      !contextMenu.contains(e.target)) {
    closeContextMenu();
  }
});

// Listen for feed icon updates
window.managementAPI.onFeedIconUpdate((data) => {
  const feed = feeds.find(f => f.id === data.feedId);
  if (feed && !feed.icon) {
    feed.icon = data.icon;
    renderFeeds();
  }
});

// Listen for settings updates
window.managementAPI.onSettingsUpdated((newSettings) => {
  if (newSettings && Array.isArray(newSettings.feeds)) {
    feeds = newSettings.feeds.map(f => ({
      ...f,
      muted: f.muted || false,
      icon: f.icon || null,
      _draft: false,
    }));
    renderFeeds();
    updateDockMutedState(feeds.length > 0 && feeds.every(f => f.muted));
  }
  
  // Net Worth settings updates
  if (newSettings) {
    let needsUpdate = false;
    
    if (newSettings.netWorthCurrencyDisplay === 'chaos' || newSettings.netWorthCurrencyDisplay === 'divines') {
      if (netWorthSettings.currencyDisplay !== newSettings.netWorthCurrencyDisplay) {
        netWorthSettings.currencyDisplay = newSettings.netWorthCurrencyDisplay;
        needsUpdate = true;
      }
    }
    
    if (newSettings.netWorthVisibility === 'hover' || newSettings.netWorthVisibility === 'always' || newSettings.netWorthVisibility === 'disabled') {
      if (netWorthSettings.visibility !== newSettings.netWorthVisibility) {
        netWorthSettings.visibility = newSettings.netWorthVisibility;
        needsUpdate = true;
      }
    }
    
    // netWorthLocked removed - now controlled by settingsWindowOpen
    
    if (newSettings.netWorthPosition) {
      netWorthSettings.position = newSettings.netWorthPosition;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      applyNetWorthSettings();
      // Ensure hover listeners match the new visibility mode
      setupNetWorthHoverListeners();
      // Reload net worth value to update currency display
      loadNetWorthIndicator();
    }
    
    // Docking Handle settings updates
    if (newSettings.dockingHandleVisibility === 'hover' || newSettings.dockingHandleVisibility === 'always' || newSettings.dockingHandleVisibility === 'disabled') {
      if (dockingHandleSettings.visibility !== newSettings.dockingHandleVisibility) {
        dockingHandleSettings.visibility = newSettings.dockingHandleVisibility;
        // Update visibility first, then lock state
        updateDockingHandleVisibility();
        updateLockState(); // This will respect the disabled state
      }
    }

    // Build Guide settings updates
    let buildNeedsUpdate = false;

    if (newSettings.buildDockVisibility === 'hover' || newSettings.buildDockVisibility === 'always' || newSettings.buildDockVisibility === 'disabled') {
      if (buildSettings.visibility !== newSettings.buildDockVisibility) {
        buildSettings.visibility = newSettings.buildDockVisibility;
        buildNeedsUpdate = true;
      }
    }

    if ('buildPosition' in newSettings) {
      if (newSettings.buildPosition) {
        buildSettings.position = newSettings.buildPosition;
      } else {
        buildSettings.position = null;
      }
      buildNeedsUpdate = true;
    }

      if (typeof newSettings.characterLevel === 'number') {
        if (buildSettings.characterLevel !== newSettings.characterLevel) {
          buildSettings.characterLevel = newSettings.characterLevel;
          if (buildLevel) {
            buildLevel.textContent = `Lv ${newSettings.characterLevel}`;
          }
          updateQuickPreviewLevelDisplay();
          if (buildQuickPreview && !buildQuickPreview.classList.contains('hidden')) {
            void updateBuildQuickPreview();
          }
        }
      }
      if (Number.isFinite(newSettings.buildQuickPreviewLevelOffset)) {
        if (buildSettings.quickPreviewLevelOffset !== newSettings.buildQuickPreviewLevelOffset) {
          buildSettings.quickPreviewLevelOffset = newSettings.buildQuickPreviewLevelOffset;
          updateQuickPreviewLevelDisplay();
          if (buildQuickPreview && !buildQuickPreview.classList.contains('hidden')) {
            void updateBuildQuickPreview();
          }
        }
      }
      if (Number.isFinite(newSettings.buildQuickPreviewZoomFactor)) {
        const nextZoomFactor = Math.max(0.2, Math.min(4, newSettings.buildQuickPreviewZoomFactor));
        if (Math.abs(quickPreviewZoomFactor - nextZoomFactor) > 0.001) {
          setQuickPreviewZoomFactor(nextZoomFactor, { rerender: true });
        }
      }
      if (newSettings.buildLevelPopupPosition) {
        buildSettings.levelPopupPosition = newSettings.buildLevelPopupPosition;
        applyLevelPopupPosition();
      }

    if (buildNeedsUpdate) {
      applyBuildSettings();
    }

    let quickPreviewNeedsUpdate = false;
    if (typeof newSettings.buildQuickPreviewShowTree === 'boolean') {
      buildSettings.quickPreviewShowTree = newSettings.buildQuickPreviewShowTree;
      quickPreviewNeedsUpdate = true;
    }
    if (typeof newSettings.buildQuickPreviewShowSkills === 'boolean') {
      buildSettings.quickPreviewShowSkills = newSettings.buildQuickPreviewShowSkills;
      quickPreviewNeedsUpdate = true;
    }
    if (typeof newSettings.buildQuickPreviewShowGear === 'boolean') {
      buildSettings.quickPreviewShowGear = newSettings.buildQuickPreviewShowGear;
      quickPreviewNeedsUpdate = true;
    }
    if ('buildQuickPreviewPosition' in newSettings) {
      if (newSettings.buildQuickPreviewPosition) {
        buildSettings.quickPreviewPosition = newSettings.buildQuickPreviewPosition;
      } else {
        buildSettings.quickPreviewPosition = null;
      }
      quickPreviewNeedsUpdate = true;
    }
    if (quickPreviewNeedsUpdate) {
      applyQuickPreviewSettings();
      if (buildQuickPreview && !buildQuickPreview.classList.contains('hidden')) {
        void updateBuildQuickPreview();
      }
    }

    if ('buildQuickPreviewControllerCombo' in newSettings) {
      buildSettings.buildQuickPreviewControllerCombo = newSettings.buildQuickPreviewControllerCombo;
      updateControllerShortcuts({ ...newSettings, buildQuickPreviewControllerCombo: newSettings.buildQuickPreviewControllerCombo });
    }
    if ('buildQuickPreviewControllerEnabled' in newSettings) {
      buildSettings.buildQuickPreviewControllerEnabled = newSettings.buildQuickPreviewControllerEnabled === true;
      updateControllerShortcuts({ ...newSettings, buildQuickPreviewControllerEnabled: newSettings.buildQuickPreviewControllerEnabled });
    }
    if ('openSettingsControllerCombo' in newSettings) {
      buildSettings.openSettingsControllerCombo = newSettings.openSettingsControllerCombo;
      updateControllerShortcuts({ ...newSettings, openSettingsControllerCombo: newSettings.openSettingsControllerCombo });
    }
    if ('openSettingsControllerEnabled' in newSettings) {
      buildSettings.openSettingsControllerEnabled = newSettings.openSettingsControllerEnabled === true;
      updateControllerShortcuts({ ...newSettings, openSettingsControllerEnabled: newSettings.openSettingsControllerEnabled });
    }
    if ('controllerType' in newSettings) {
      buildSettings.controllerType = newSettings.controllerType;
      updateControllerShortcuts(newSettings);
    }
    updateBuildLiveTrackingIndicator(newSettings);
    }
  });

  if (window.managementAPI.onBuildLevelUp) {
    window.managementAPI.onBuildLevelUp((payload) => {
      if (!payload || typeof payload.level !== 'number') return;
      if (levelPopupPositionMode) return;
      void showLevelUpPopup(payload.level);
    });
  }
  
  // Listen for force open command
  window.managementAPI.onForceOpen(() => {
  console.log('[MANAGEMENT] Force opening feed bar');
  if (feedBar.classList.contains('hidden')) {
    toggleFeedBar();
  }
});

if (window.managementAPI.onPositionLevelPopup) {
  window.managementAPI.onPositionLevelPopup(() => {
    openLevelPopupPositioner();
  });
}

if (window.managementAPI.onShortcutBuildQuickPreview) {
  window.managementAPI.onShortcutBuildQuickPreview(() => {
    toggleBuildQuickPreview();
  });
}

if (window.managementAPI.onShortcutOpenSettings) {
  window.managementAPI.onShortcutOpenSettings(() => {
    window.managementAPI.toggleSettings('general');
  });
}

// Listen for settings window events
window.managementAPI.onSettingsWindowOpened((tab) => {
  settingsWindowOpen = true;
  updateDockingHandleVisibility(); // Ensure visibility is correct
  updateLockState();
  console.log('[MANAGEMENT] Settings window opened', tab);
});

window.managementAPI.onSettingsWindowClosed(() => {
  settingsWindowOpen = false;
  updateDockingHandleVisibility(); // Ensure visibility is correct
  updateLockState();
  if (levelPopupPinned || levelPopupPositionMode) {
    hideLevelUpPopup();
  }
  console.log('[MANAGEMENT] Settings window closed');
});

// Window resize handler - update net worth indicator positie
window.addEventListener('resize', () => {
  positionNetWorthIndicator();
  positionDockingHandleHoverZone();
});

// Initial load
(async () => {
  await loadHandlePosition();
  await loadFeeds();
  await loadNetWorthIndicator();

  // showManagementByDefault removed - feed bar is always hidden by default
})();

// Load net worth indicator
async function loadNetWorthIndicator() {
  try {
    const lastScan = await window.managementAPI.getLastScan();
    if (lastScan) {
      updateNetWorthIndicator(lastScan);
    } else {
      networthValue.textContent = '-';
      networthValue.classList.add('loading');
    }
  } catch (err) {
    console.error('[MANAGEMENT] Failed to load net worth:', err);
    networthValue.textContent = '-';
  }
}

// Update net worth indicator
function updateNetWorthIndicator(scan) {
  if (!scan) {
    networthValue.textContent = '-';
    return;
  }

  if (!scan.netWorth) {
    networthValue.textContent = '-';
    networthValue.classList.remove('loading');
    return;
  }
  
  const scanRates = (scan && typeof scan.currencyRates === 'object' && scan.currencyRates)
    ? scan.currencyRates
    : null;
  const divineRate = Number.isFinite(Number(scanRates?.divine)) && Number(scanRates.divine) > 0
    ? Number(scanRates.divine)
    : 200;
  const exaltedRate = Number.isFinite(Number(scanRates?.exalted)) && Number(scanRates.exalted) > 0
    ? Number(scanRates.exalted)
    : 15;

  // Use converted value if available, otherwise calculate from raw values
  let chaos = 0;
  let divine = 0;
  
  if (scan.converted) {
    chaos = scan.converted.chaos || 0;
    divine = scan.converted.divine || 0;
  } else {
    // Fallback: calculate ourselves (simplified)
    chaos = scan.netWorth.chaos || 0;
    divine = scan.netWorth.divine || 0;
    // Convert other currencies to chaos
    const totalChaos = chaos + ((divine || 0) * divineRate) + ((scan.netWorth.exalted || 0) * exaltedRate);
    divine = totalChaos / divineRate;
    chaos = totalChaos;
  }
  
  // Display value according to currency display setting
  if (netWorthSettings.currencyDisplay === 'chaos') {
    const totalChaos = Number.isFinite(Number(scan?.converted?.chaos))
      ? Number(scan.converted.chaos)
      : (chaos + (divine * divineRate));
    if (totalChaos >= 1) {
      networthValue.textContent = `${Math.round(totalChaos)}c`;
    } else {
      networthValue.textContent = '-';
    }
  } else {
    // Default: divines
    if (divine >= 1) {
      networthValue.textContent = `${divine.toFixed(1)}d`;
    } else if (chaos >= 1) {
      networthValue.textContent = `${Math.round(chaos)}c`;
    } else {
      networthValue.textContent = '-';
    }
  }
  
  networthValue.classList.remove('loading');
}

// Net worth indicator click
if (networthIndicator) {
  networthIndicator.addEventListener('click', (e) => {
    // Disable clicks when settings are open
    if (settingsWindowOpen) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // If we're dragging, don't click
    if (isNetWorthDragging) {
      const dragDistance = Math.abs(e.clientX - netWorthDragStartPos.x) + Math.abs(e.clientY - netWorthDragStartPos.y);
      if (dragDistance > 5) {
        // Was a drag, not a click
        return;
      }
    }

    if (runTimerIndicator && !runTimerIndicator.classList.contains('hidden')) {
      e.preventDefault();
      e.stopPropagation();
      if (window.managementAPI.toggleRunPause) {
        window.managementAPI.toggleRunPause();
      }
      return;
    }

    // Toggle overlay: close if visible, otherwise open
    window.managementAPI.isNetworthOverlayVisible().then((visible) => {
      if (visible) {
        window.managementAPI.toggleNetworthOverlay();
      } else {
        window.managementAPI.openNetworthOverlay();
      }
    }).catch(() => {
      // Fallback to open
      window.managementAPI.openNetworthOverlay();
    });
  });
  
  // Net worth dragging functionality
    networthIndicator.addEventListener('mousedown', (e) => {
      // Allow dragging when settings are open, or when holding Alt.
      if ((!settingsWindowOpen && !e.altKey) || e.target === networthValue) return;
    
    isNetWorthDragging = true;
    netWorthDragStartPos.x = e.clientX;
    netWorthDragStartPos.y = e.clientY;
    networthIndicator.style.cursor = 'move';
    
    const rect = networthIndicator.getBoundingClientRect();
    netWorthDragOffset.x = e.clientX - rect.left;
    netWorthDragOffset.y = e.clientY - rect.top;
    
    // Only prevent default when dragging (settings open)
    e.preventDefault();
    e.stopPropagation();
  });
  
  // Right-click to open settings
  networthIndicator.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.managementAPI.openSettings('networth');
  });
}

// Build indicator click
if (buildIndicator) {
  if (buildLiveBadge) {
    buildLiveBadge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (settingsWindowOpen) return;
      void toggleLiveTrackingFromIndicator();
    });
  }

  buildIndicator.addEventListener('click', (e) => {
    // Disable clicks when settings are open
    if (settingsWindowOpen) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // If we're dragging, don't click
    if (isBuildDragging) {
      const dragDistance = Math.abs(e.clientX - buildDragStartPos.x) + Math.abs(e.clientY - buildDragStartPos.y);
      if (dragDistance > 5) {
        // Was a drag, not a click
        return;
      }
    }

    // Open build overlay
    window.managementAPI.isBuildOverlayVisible().then((visible) => {
      if (visible) {
        window.managementAPI.toggleBuildOverlay();
      } else {
        window.managementAPI.openBuildOverlay();
      }
    }).catch(() => {
      // Fallback to open
      window.managementAPI.openBuildOverlay();
    });
  });

  // Build dragging functionality
  buildIndicator.addEventListener('mousedown', (e) => {
    // Allow dragging when settings are open, or when holding Alt for quick reposition.
    if ((!settingsWindowOpen && !e.altKey) || e.target === buildLevel) return;

    isBuildDragging = true;
    buildDragStartPos.x = e.clientX;
    buildDragStartPos.y = e.clientY;
    buildIndicator.style.cursor = 'move';

    const rect = buildIndicator.getBoundingClientRect();
    buildDragOffset.x = e.clientX - rect.left;
    buildDragOffset.y = e.clientY - rect.top;

    // Only prevent default when dragging (settings open)
    e.preventDefault();
    e.stopPropagation();
  });

  // Right-click to open settings
  buildIndicator.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    toggleBuildQuickPreview();
  });

  // Middle-click toggles live tracking for the currently detected in-game character.
  buildIndicator.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    if (settingsWindowOpen) return;
    void toggleLiveTrackingFromIndicator();
  });
}

if (quickPreviewHeader && buildQuickPreview) {
  quickPreviewHeader.addEventListener('mousedown', (e) => {
    if (!settingsWindowOpen) return;
    if (e.button !== 0) return;

    isQuickPreviewDragging = true;
    quickPreviewDragStartPos.x = e.clientX;
    quickPreviewDragStartPos.y = e.clientY;
    buildQuickPreview.style.cursor = 'move';

    const rect = buildQuickPreview.getBoundingClientRect();
    quickPreviewDragOffset.x = e.clientX - rect.left;
    quickPreviewDragOffset.y = e.clientY - rect.top;

    updateClickThrough(false);
    e.preventDefault();
    e.stopPropagation();
  });
}

if (quickPreviewClose && buildQuickPreview) {
  quickPreviewClose.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideBuildQuickPreview();
  });
}

if (levelUpPopup) {
    levelUpPopup.addEventListener('mousedown', (e) => {
      const positioningActive =
        levelPopupPositionMode ||
        levelPopupPinned ||
        levelUpPopup.classList.contains('positioning');
      if ((!settingsWindowOpen && !e.altKey && !positioningActive) || e.button !== 0) return;
      isLevelPopupDragging = true;
      const rect = levelUpPopup.getBoundingClientRect();
      levelPopupDragOffset.x = e.clientX - rect.left;
      levelPopupDragOffset.y = e.clientY - rect.top;
    levelUpPopup.classList.add('dragging');
    updateClickThrough(false);
    e.preventDefault();
    e.stopPropagation();
  });
}

function getQuickPreviewLevel(baseLevel) {
  const offset = Number.isFinite(buildSettings.quickPreviewLevelOffset) ? buildSettings.quickPreviewLevelOffset : 0;
  const level = Number.isFinite(baseLevel) ? baseLevel : 1;
  return Math.max(1, Math.min(100, level + offset));
}

function updateQuickPreviewLevelDisplay(levelOverride) {
  if (!quickPreviewLevelValue) return;
  const baseLevel = Number.isFinite(buildSettings.characterLevel) ? buildSettings.characterLevel : 1;
  const level = Number.isFinite(levelOverride) ? levelOverride : getQuickPreviewLevel(baseLevel);
  quickPreviewLevelValue.textContent = `Lv ${level}`;
}

function adjustQuickPreviewLevel(delta) {
  const current = Number.isFinite(buildSettings.quickPreviewLevelOffset) ? buildSettings.quickPreviewLevelOffset : 0;
  const baseLevel = Number.isFinite(buildSettings.characterLevel) ? buildSettings.characterLevel : 1;
  const nextOffset = Math.max(1 - baseLevel, Math.min(100 - baseLevel, current + delta));
  buildSettings.quickPreviewLevelOffset = nextOffset;
  window.managementAPI.saveSettings({ buildQuickPreviewLevelOffset: nextOffset });
  updateQuickPreviewLevelDisplay();
  if (buildQuickPreview && !buildQuickPreview.classList.contains('hidden')) {
    void updateBuildQuickPreview();
  }
}

if (quickPreviewLevelMinus) {
  quickPreviewLevelMinus.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  quickPreviewLevelMinus.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    adjustQuickPreviewLevel(-1);
  });
}

if (quickPreviewLevelPlus) {
  quickPreviewLevelPlus.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  quickPreviewLevelPlus.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    adjustQuickPreviewLevel(1);
  });
}

function handleQuickPreviewZoomWheel(e) {
  if ((!e.ctrlKey && !e.metaKey) || !quickPreviewTreeWrap || !buildQuickPreview) return;
  if (buildQuickPreview.classList.contains('hidden')) return;
  const target = e.target instanceof Node ? e.target : null;
  if (!target || !quickPreviewTreeWrap.contains(target)) return;
  const renderer = ensureQuickPreviewTreeRenderer();
  if (!renderer) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') {
    e.stopImmediatePropagation();
  }
  renderer.zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
  setQuickPreviewZoomFactor(renderer.zoomFactor, { persist: true, rerender: true });
}

document.addEventListener('wheel', handleQuickPreviewZoomWheel, {
  passive: false,
  capture: true,
});

// Net worth drag handler
function dragNetWorth(e) {
  if (!isNetWorthDragging) return;
  
  const x = e.clientX - netWorthDragOffset.x;
  const y = e.clientY - netWorthDragOffset.y;
  
  // Constrain to window bounds
  const maxX = window.innerWidth - networthIndicator.offsetWidth;
  const maxY = window.innerHeight - networthIndicator.offsetHeight;
  
  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));
  
  const right = window.innerWidth - constrainedX - networthIndicator.offsetWidth;
  networthIndicator.style.right = right + 'px';
  networthIndicator.style.top = constrainedY + 'px';
  networthIndicator.style.transform = 'none';
  
  // Update hover zone position
  if (networthHoverZone) {
    networthHoverZone.style.right = right + 'px';
    networthHoverZone.style.top = constrainedY + 'px';
    networthHoverZone.style.transform = 'none';
  }

  positionRunTimer();
}

function endNetWorthDrag() {
  if (!isNetWorthDragging) return;

  isNetWorthDragging = false;
  if (networthIndicator) {
    networthIndicator.style.cursor = '';
    saveNetWorthPosition();
  }
}

// Build drag handler
function dragBuild(e) {
  if (!isBuildDragging) return;

  const x = e.clientX - buildDragOffset.x;
  const y = e.clientY - buildDragOffset.y;

  // Constrain to window bounds
  const maxX = window.innerWidth - buildIndicator.offsetWidth;
  const maxY = window.innerHeight - buildIndicator.offsetHeight;

  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));

  const right = window.innerWidth - constrainedX - buildIndicator.offsetWidth;
  buildIndicator.style.right = right + 'px';
  buildIndicator.style.top = constrainedY + 'px';
  buildIndicator.style.transform = 'none';

  // Update hover zone position
  if (buildHoverZone) {
    buildHoverZone.style.right = right + 'px';
    buildHoverZone.style.top = constrainedY + 'px';
    buildHoverZone.style.transform = 'none';
  }
}

function endBuildDrag() {
  if (!isBuildDragging) return;

  isBuildDragging = false;
  if (buildIndicator) {
    buildIndicator.style.cursor = '';
    saveBuildPosition();
  }
}

function dragQuickPreview(e) {
  if (!isQuickPreviewDragging || !buildQuickPreview) return;

  const x = e.clientX - quickPreviewDragOffset.x;
  const y = e.clientY - quickPreviewDragOffset.y;

  const maxX = window.innerWidth - buildQuickPreview.offsetWidth;
  const maxY = window.innerHeight - buildQuickPreview.offsetHeight;

  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));

  buildQuickPreview.style.left = `${constrainedX}px`;
  buildQuickPreview.style.top = `${constrainedY}px`;
  buildQuickPreview.style.right = 'auto';
}

function dragLevelPopup(e) {
  if (!isLevelPopupDragging || !levelUpPopup) return;
  const rect = levelUpPopup.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width;
  const maxY = window.innerHeight - rect.height;
  const x = e.clientX - levelPopupDragOffset.x;
  const y = e.clientY - levelPopupDragOffset.y;
  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));
  levelUpPopup.style.left = `${constrainedX}px`;
  levelUpPopup.style.top = `${constrainedY}px`;
  levelUpPopup.style.right = 'auto';
}

function endLevelPopupDrag() {
  if (!isLevelPopupDragging || !levelUpPopup) return;
  isLevelPopupDragging = false;
  levelUpPopup.classList.remove('dragging');
  const rect = levelUpPopup.getBoundingClientRect();
  buildSettings.levelPopupPosition = {
    right: window.innerWidth - rect.right,
    top: rect.top
  };
  window.managementAPI.saveSettings({ buildLevelPopupPosition: buildSettings.levelPopupPosition });
  applyLevelPopupPosition();
  refreshClickThroughState();
}

function endQuickPreviewDrag() {
  if (!isQuickPreviewDragging) return;
  isQuickPreviewDragging = false;
  if (buildQuickPreview) {
    buildQuickPreview.style.cursor = '';
  }
  saveQuickPreviewPosition();
  refreshClickThroughState();
}

function saveQuickPreviewPosition() {
  if (!buildQuickPreview) return;
  const rect = buildQuickPreview.getBoundingClientRect();
  buildSettings.quickPreviewPosition = {
    left: rect.left,
    top: rect.top,
  };
  window.managementAPI.saveSettings({ buildQuickPreviewPosition: buildSettings.quickPreviewPosition });
}

function saveBuildPosition() {
  if (!buildIndicator) return;
  const right = parseInt(buildIndicator.style.right) || 0;
  const top = parseInt(buildIndicator.style.top) || 0;
  buildSettings.position = { right, top };
  // Save to settings via IPC
  window.managementAPI.saveSettings({ buildPosition: { right, top } });
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
];

const BANDIT_POINTS = {
  kill_all: 2,
  alira: 0,
  oak: 0,
  kraityn: 0,
};

const EXTRA_POINT_QUESTS = [
  { min: 6, max: 6, quest: 'The Dweller of the Deep', zone: 'The Flooded Depths' },
  { min: 12, max: 12, quest: 'The Marooned Mariner', zone: 'The Ship Graveyard Cave' },
  { min: 17, max: 18, quest: 'The Way Forward', zone: "The Western Forest / Prisoner\'s Gate" },
  { min: 18, max: 18, quest: 'Through Sacred Ground', zone: 'The Crypt Level 2' },
  { min: 16, max: 19, quest: 'Deal With The Bandits (kill leaders)', zone: 'Broken Bridge / Western Forest / Wetlands' },
  { min: 26, max: 26, quest: "Victario\'s Secrets", zone: 'The Sewers' },
  { min: 30, max: 30, quest: "Piety\'s Pets", zone: 'Lunaris Temple Level 2 (Act 3)' },
  { min: 35, max: 35, quest: 'An Indomitable Spirit', zone: 'Mines Level 2' },
  { min: 41, max: 41, quest: 'In Service to Science', zone: 'Control Blocks' },
  { min: 44, max: 44, quest: "Kitava\'s Torments", zone: 'Reliquary' },
  { min: 46, max: 46, quest: 'The Father of War', zone: 'Karui Fortress' },
  { min: 47, max: 47, quest: 'The Cloven One', zone: "Prisoner\'s Gate" },
  { min: 48, max: 48, quest: 'The Puppet Mistress', zone: 'Spawning Grounds (Wetlands A6)' },
  { min: 53, max: 53, quest: 'The Master of a Million Faces', zone: 'Dread Thicket' },
  { min: 53, max: 53, quest: 'Queen of Despair', zone: 'Dread Thicket' },
  { min: 54, max: 54, quest: "Kishara\'s Star", zone: 'Causeway' },
  { min: 57, max: 57, quest: 'Love is Dead', zone: 'The Quay' },
  { min: 57, max: 57, quest: 'The Gemling Legion', zone: 'Grain Gate' },
  { min: 58, max: 58, quest: 'Reflection of Terror', zone: 'High Gardens (Bath House)' },
  { min: 61, max: 61, quest: 'Queen of the Sands', zone: 'Vastiri Desert' },
  { min: 63, max: 63, quest: 'The Ruler of Highgate', zone: 'The Quarry' },
  { min: 66, max: 66, quest: "Vilenta\'s Vengeance", zone: 'Control Blocks (Act 10)' },
  { min: 67, max: 67, quest: 'An End to Hunger', zone: 'Feeding Trough' },
];

function toString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeImageUrl(value) {
  const raw = toString(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return raw;
}

function resolveAssetPath(path) {
  const cleaned = normalizeImageUrl(path);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith('/assets/')) return `../assets/assets/${cleaned.replace('/assets/', '')}`;
  if (cleaned.startsWith('assets/')) return `../assets/assets/${cleaned.replace('assets/', '')}`;
  if (cleaned.startsWith('/tree-assets/')) return `../assets/tree-assets/${cleaned.replace('/tree-assets/', '')}`;
  if (cleaned.startsWith('tree-assets/')) return `../assets/tree-assets/${cleaned.replace('tree-assets/', '')}`;
  if (cleaned.startsWith('/')) return `..${cleaned}`;
  return cleaned;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let hoverTooltipEl = null;

function getHoverTooltipEl() {
  if (hoverTooltipEl) return hoverTooltipEl;
  hoverTooltipEl = document.createElement('div');
  hoverTooltipEl.className = 'item-tooltip';
  hoverTooltipEl.style.display = 'none';
  document.body.appendChild(hoverTooltipEl);
  return hoverTooltipEl;
}

function showHoverTooltip(html, event) {
  const el = getHoverTooltipEl();
  if (!html) return;
  el.innerHTML = html;
  el.style.display = 'block';
  if (event) positionHoverTooltip(event);
}

function hideHoverTooltip() {
  if (!hoverTooltipEl) return;
  hoverTooltipEl.style.display = 'none';
}

function positionHoverTooltip(event) {
  if (!hoverTooltipEl || hoverTooltipEl.style.display === 'none') return;
  const padding = 12;
  const rect = hoverTooltipEl.getBoundingClientRect();
  let x = event.clientX + padding;
  let y = event.clientY + padding;
  if (x + rect.width > window.innerWidth) {
    x = Math.max(padding, window.innerWidth - rect.width - padding);
  }
  if (y + rect.height > window.innerHeight) {
    y = Math.max(padding, window.innerHeight - rect.height - padding);
  }
  hoverTooltipEl.style.left = `${x}px`;
  hoverTooltipEl.style.top = `${y}px`;
}

function attachHoverTooltip(el, getHtml) {
  if (!el) return;
  el.addEventListener('mouseenter', (event) => {
    const html = getHtml?.();
    if (html) showHoverTooltip(html, event);
  });
  el.addEventListener('mousemove', (event) => {
    positionHoverTooltip(event);
  });
  el.addEventListener('mouseleave', () => {
    hideHoverTooltip();
  });
}

function resolveGearRarity(gearItem, itemMeta) {
  const typeRaw = toString(gearItem?.item_type || gearItem?.itemType || itemMeta?.item_type || itemMeta?.rarity).toLowerCase();
  if (typeRaw.includes('unique')) return 'unique';
  if (typeRaw.includes('magic')) return 'magic';
  if (typeRaw.includes('rare')) return 'rare';
  return 'normal';
}

function formatGearMods(meta) {
  if (!meta || typeof meta !== 'object') return [];

  if (Array.isArray(meta.mods)) {
    return meta.mods.filter((m) => typeof m === 'string' && m.trim());
  }

  if (Array.isArray(meta.mod_entries)) {
    return meta.mod_entries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const tierText = toString(entry.tierText);
        if (tierText.trim()) return tierText.trim();
        const text = toString(entry.text);
        return text.trim() ? text.trim() : null;
      })
      .filter(Boolean);
  }

  return [];
}

function buildGearTooltip(gearItem, itemMeta, fallbackName) {
  const meta = itemMeta && typeof itemMeta === 'object' ? itemMeta : {};
  const snapshot =
    meta && typeof meta.gear_item_snapshot === 'object' ? meta.gear_item_snapshot : null;
  const name =
    toString(gearItem?.name) ||
    toString(snapshot?.name) ||
    toString(meta.name) ||
    toString(fallbackName) ||
    'Item';
  const baseType =
    toString(gearItem?.base_type) ||
    toString(snapshot?.base_type) ||
    toString(meta.base_type) ||
    '';
  const itemType =
    toString(gearItem?.item_type) ||
    toString(snapshot?.item_type) ||
    toString(meta.item_type) ||
    '';
  const rarity = resolveGearRarity(gearItem, meta);
  const rarityLabel = rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : '';
  const mods = formatGearMods(meta);

  const typeLine = baseType || itemType;
  const modsBlock = mods.length
    ? `<div class="tt-section-title">Modifiers</div><div class="tt-mods">${mods
      .map((mod) => `<div class="tt-row">${escapeHtml(mod)}</div>`)
      .join('')}</div>`
    : '';

  return `
    <div class="tt-header ${rarity}">
      <div class="tt-name">${escapeHtml(name)}</div>
      ${typeLine ? `<div class="tt-type">${escapeHtml(typeLine)}</div>` : ''}
      ${rarityLabel ? `<div class="tt-rarity">${escapeHtml(rarityLabel)}</div>` : ''}
    </div>
    <div class="tt-body">
      ${modsBlock || '<div class="tt-muted">No modifiers listed</div>'}
    </div>
  `;
}

function buildGemTooltip(gem) {
  if (!gem) return '';
  const name = toString(gem.name) || 'Gem';
  const levelText = gem.level ? `Level ${gem.level}` : '';

  return `
    <div class="tt-header gem">
      <div class="tt-name">${escapeHtml(name)}</div>
      ${levelText ? `<div class="tt-rarity">${escapeHtml(levelText)}</div>` : ''}
    </div>
  `;
}

function resolveGearImageUrl(item) {
  const meta = item && typeof item.metadata === 'object' ? item.metadata : {};
  const snapshot =
    meta && typeof meta.gear_item_snapshot === 'object' ? meta.gear_item_snapshot : null;
  const direct = normalizeImageUrl(
    item?.resolvedImageUrl ||
    item?.image_url ||
    snapshot?.image_url ||
    meta?.image_url ||
    meta?.resolvedImageUrl
  );
  if (direct) {
    if (/^https?:\/\//i.test(direct)) return direct;
    const baseRaw = normalizeImageUrl(gearImagesBaseUrl);
    const base = baseRaw ? baseRaw.replace(/\/+$/g, '') : '';
    if (base && direct.startsWith('/')) {
      return `${base}/${direct.replace(/^\/+/, '')}`;
    }
    if (base && direct.startsWith('storage/')) {
      return `${base}/${direct}`;
    }
    return resolveAssetPath(direct);
  }

  const path = normalizeImageUrl(item?.image_path || snapshot?.image_path || meta?.image_path);
  if (!path) return null;

  const baseRaw = normalizeImageUrl(gearImagesBaseUrl);
  const base = baseRaw ? baseRaw.replace(/\/+$/g, '') : '';
  if (!base) return null;

  const bucketRaw = normalizeImageUrl(gearImagesBucket);
  const bucket = (bucketRaw || 'gear-images').replace(/^\/+|\/+$/g, '');
  if (!bucket) return null;

  const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${base}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

function parseLevelValue(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeSectionLevelBounds(blocks, defaultMax = 100) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const mins = blocks.map((block) =>
    block ? parseLevelValue(block.levelRange?.min) : null
  );
  const maxs = blocks.map((block) =>
    block ? parseLevelValue(block.levelRange?.max) : null
  );
  const bounds = Array(blocks.length).fill(null);
  const fallbackMax = Number.isFinite(defaultMax) ? defaultMax : 100;

  let prevEnd = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const start = Math.max(prevEnd + 1, 1);
    const maxRaw = maxs[i];
    let end = null;

    if (Number.isFinite(maxRaw)) {
      end = Math.max(start, maxRaw);
    } else {
      const nextMin = mins.slice(i + 1).find((v) => Number.isFinite(v)) ?? null;
      if (Number.isFinite(nextMin)) {
        end = Math.max(start, nextMin - 1);
      } else {
        end = Math.max(start, fallbackMax);
      }
    }

    bounds[i] = { start, end };
    prevEnd = end;
  }

  return bounds;
}

function getSectionIndexForLevel(blocks, level) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { section: null, index: -1, bounds: [] };
  }
  const lvl = Number.isFinite(level) ? level : 1;
  const bounds = computeSectionLevelBounds(blocks, 100);
  for (let i = 0; i < bounds.length; i += 1) {
    const end = bounds[i]?.end ?? 100;
    if (lvl <= end) {
      return { section: blocks[i], index: i, bounds };
    }
  }
  const lastIdx = blocks.length - 1;
  return { section: blocks[lastIdx], index: lastIdx, bounds };
}

function formatLevelRange(block) {
  if (!block || !block.levelRange) return '';
  const min = toString(block.levelRange.min).trim();
  const max = toString(block.levelRange.max).trim();
  if (!min && !max) return '';
  return `Lv ${min || '?'}-${max || '?'}`;
}

function getGearSlotRank(slotId) {
  const raw = toString(slotId).toLowerCase();
  const key = raw.replace(/[^a-z0-9]/g, '');
  const order = {
    helmet: 0,
    helm: 0,
    amulet: 1,
    body: 2,
    bodyarmour: 2,
    armour: 2,
    armor: 2,
    chest: 2,
    weapon1: 3,
    mainhand: 3,
    weapon: 3,
    weapon2: 4,
    offhand: 4,
    gloves: 5,
    ring1: 6,
    ring2: 7,
    belt: 8,
    boots: 9,
    flask1: 10,
    flask2: 11,
    flask3: 12,
    flask4: 13,
    flask5: 14,
  };
  if (key.startsWith('jewel')) {
    const idx = Number.parseInt(key.replace(/^\D+/g, ''), 10);
    return Number.isFinite(idx) ? 30 + idx : 30;
  }
  return order[key] ?? 20;
}

function totalPassivePointsAtLevel(level, banditChoice) {
  const lvl = Number.isFinite(level) ? Math.floor(level) : 1;
  const clamped = Math.max(1, Math.min(100, lvl));
  const levelPoints = Math.max(0, clamped - 1);
  const questPoints = PASSIVE_POINT_BONUS_MILESTONES.reduce(
    (sum, milestone) => (clamped >= milestone.level ? sum + milestone.bonusPoints : sum),
    0
  );
  const banditPoints = BANDIT_POINTS[banditChoice] ?? BANDIT_POINTS.kill_all;
  return levelPoints + questPoints + banditPoints;
}

function getQuestRewardsForLevel(level) {
  const lvl = Number.isFinite(level) ? Math.floor(level) : 1;
  return EXTRA_POINT_QUESTS.filter((entry) => lvl >= entry.min && lvl <= entry.max);
}

function resolveSectionTreeLists(sectionTree, viewMode = 'tree') {
  const mode = viewMode === 'ascendancy' || viewMode === 'bloodline' ? viewMode : 'tree';
  if (!sectionTree || typeof sectionTree !== 'object') {
    return { orderedKeys: [], stepNodeIds: [], highlight: null };
  }
  const orderedByMode = sectionTree.orderedKeysByMode || sectionTree.orderedKeys || {};
  const stepByMode = sectionTree.stepNodeIdsByMode || sectionTree.stepNodeIds || {};
  const highlightByMode = sectionTree.highlightByMode || sectionTree.highlight || null;

  const orderedKeys = Array.isArray(orderedByMode?.[mode])
    ? orderedByMode[mode]
    : Array.isArray(orderedByMode)
      ? orderedByMode
      : [];
  const stepNodeIds = Array.isArray(stepByMode?.[mode])
    ? stepByMode[mode]
    : Array.isArray(stepByMode)
      ? stepByMode
      : [];

  let highlight = null;
  if (highlightByMode && typeof highlightByMode === 'object') {
    if (Array.isArray(highlightByMode.previous) || Array.isArray(highlightByMode.current) || Array.isArray(highlightByMode.removed)) {
      highlight = highlightByMode;
    } else if (highlightByMode[mode]) {
      highlight = highlightByMode[mode];
    }
  }

  return { orderedKeys, stepNodeIds, highlight };
}

function buildTreeProgress(state, level, viewMode = 'tree') {
  const blocks = Array.isArray(state?.blocks) ? state.blocks : [];
  const banditChoice =
    toString(state?.banditChoice) ||
    toString(state?.general?.banditChoice || state?.general?.bandit_choice) ||
    'kill_all';
  const safeLevel = Number.isFinite(level) ? level : 1;
  const { index: initialSectionIndex, bounds } = getSectionIndexForLevel(blocks, safeLevel);
  const prevPoints = totalPassivePointsAtLevel(Math.max(1, safeLevel - 1), banditChoice);
  const curPoints = totalPassivePointsAtLevel(Math.max(1, safeLevel), banditChoice);

  const buildProgressForSection = (sectionIndex) => {
    const section = sectionIndex >= 0 ? blocks[sectionIndex] || null : null;
    const sectionBounds = sectionIndex >= 0 ? bounds[sectionIndex] || null : null;
    const sectionTree = section?.id ? (state?.guideTreeBySection?.[section.id] || null) : null;
    const { orderedKeys, stepNodeIds, highlight } = resolveSectionTreeLists(sectionTree, viewMode);
    const previousNodes = uniqueNodeIds(highlight?.previous);
    const currentNodes = uniqueNodeIds(highlight?.current);
    const removedNodes = uniqueNodeIds(highlight?.removed);
    const progressNodes = stepNodeIds.length > 0 ? uniqueNodeIds(stepNodeIds) : uniqueNodeIds(orderedKeys);
    const actions = Array.isArray(sectionTree?.actions) ? sectionTree.actions : [];
    const relevantTreeNodeIds = new Set(uniqueNodeIds(previousNodes.concat(currentNodes, removedNodes, progressNodes)));
    const filteredActions =
      viewMode === 'tree' && relevantTreeNodeIds.size > 0
        ? actions.filter((action) => action?.nodeId && relevantTreeNodeIds.has(String(action.nodeId)))
        : actions;

    const sectionStartLevel = sectionBounds?.start || 1;
    const pointsBeforeSection = totalPassivePointsAtLevel(Math.max(1, sectionStartLevel - 1), banditChoice);

    if (viewMode === 'tree' && filteredActions.length > 0) {
      const simulateActions = (earnedPoints) => {
        let available = Math.max(0, earnedPoints);
        const active = new Set(previousNodes);
        const allocated = [];
        const removed = [];
        let nextAllocateId = null;

        for (const action of filteredActions) {
          if (!action || !action.type || !action.nodeId) continue;
          const nodeId = String(action.nodeId);
          if (action.type === 'allocate') {
            if (available <= 0) {
              nextAllocateId = nodeId;
              break;
            }
            available -= 1;
            active.add(nodeId);
            allocated.push(nodeId);
            continue;
          }
          if (action.type === 'deallocate') {
            if (!active.has(nodeId)) continue;
            active.delete(nodeId);
            removed.push(nodeId);
            available += 1;
          }
        }

        return {
          activeNodeIds: Array.from(active),
          allocated,
          removed,
          nextAllocateId,
        };
      };

      const prevSim = simulateActions(prevPoints - pointsBeforeSection);
      const curSim = simulateActions(curPoints - pointsBeforeSection);
      const currentStepNodes = curSim.allocated.slice(prevSim.allocated.length);
      const currentRemovedNodes = curSim.removed.slice(prevSim.removed.length);
      const nextNodeId =
        currentStepNodes[0] ||
        curSim.nextAllocateId ||
        null;

      return {
        flatOrder: curSim.allocated,
        nextIndex: prevSim.allocated.length,
        nextNodeId,
        highlightNodes: currentStepNodes,
        section,
        sectionIndex,
        sectionStartIndex: 0,
        sectionNodeOffset: prevSim.allocated.length,
        sectionBounds,
        previousNodes,
        currentNodes: currentStepNodes,
        removedNodes: currentRemovedNodes,
        progressNodes: curSim.allocated,
        activeNodeIds: uniqueNodeIds(curSim.activeNodeIds),
        allocatedBeforeCurrentCount: prevSim.allocated.length,
        allocatedAtCurrentCount: curSim.allocated.length,
        actionDriven: true,
      };
    }

    const allocatedBeforeCurrentCount = Math.max(
      0,
      Math.min(progressNodes.length, prevPoints - pointsBeforeSection)
    );
    const allocatedAtCurrentCount = Math.max(
      0,
      Math.min(progressNodes.length, curPoints - pointsBeforeSection)
    );
    const currentStepNodes = progressNodes.slice(allocatedBeforeCurrentCount, allocatedAtCurrentCount);
    const activeNodeIds = uniqueNodeIds(
      previousNodes.concat(progressNodes.slice(0, allocatedAtCurrentCount))
    );
    const nextNodeId =
      currentStepNodes[0] ||
      progressNodes[allocatedAtCurrentCount] ||
      null;

    return {
      flatOrder: progressNodes,
      nextIndex: allocatedBeforeCurrentCount,
      nextNodeId,
      highlightNodes: currentStepNodes,
      section,
      sectionIndex,
      sectionStartIndex: 0,
      sectionNodeOffset: allocatedBeforeCurrentCount,
      sectionBounds,
      previousNodes,
      currentNodes,
      removedNodes,
      progressNodes,
      activeNodeIds,
      allocatedBeforeCurrentCount,
      allocatedAtCurrentCount,
    };
  };

  const startIndex = initialSectionIndex >= 0 ? initialSectionIndex : 0;
  for (let idx = startIndex; idx < blocks.length; idx += 1) {
    const progress = buildProgressForSection(idx);
    if (
      progress?.nextNodeId ||
      (Array.isArray(progress?.highlightNodes) && progress.highlightNodes.length > 0) ||
      idx === blocks.length - 1
    ) {
      return progress;
    }
  }

  return buildProgressForSection(startIndex);
}

function updateQuestHint(el, level, highlightCount = 0) {
  if (!el) return;
  const rewards = getQuestRewardsForLevel(level);
  if (!rewards.length) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  const label = rewards.map((r) => r.quest).join(' | ');
  el.textContent = `Extra skillpoint: ${label}`;
  el.classList.remove('hidden');
}

function getSectionForLevel(blocks, level) {
  const result = getSectionIndexForLevel(blocks, level);
  return result.section;
}

async function ensureActiveGuideState() {
  try {
    const state = await window.managementAPI.getActiveGuideState();
    if (state) activeGuideState = state;
  } catch (err) {
    console.warn('[MANAGEMENT] Failed to load guide state:', err);
  }
  return activeGuideState;
}

function positionBuildQuickPreview() {
  if (!buildQuickPreview || buildQuickPreview.classList.contains('hidden') || !buildIndicator) return;
  if (buildSettings.quickPreviewPosition && !isQuickPreviewDragging) {
    const left = Number(buildSettings.quickPreviewPosition.left);
    const top = Number(buildSettings.quickPreviewPosition.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      buildQuickPreview.style.left = `${left}px`;
      buildQuickPreview.style.top = `${top}px`;
      buildQuickPreview.style.right = 'auto';
      return;
    }
    buildQuickPreview.style.right = 'auto';
  }
  const indicatorRect = buildIndicator.getBoundingClientRect();
  const previewRect = buildQuickPreview.getBoundingClientRect();
  let left = indicatorRect.left - previewRect.width - 12;
  if (left < 12) {
    left = indicatorRect.right + 12;
  }
  const maxLeft = window.innerWidth - previewRect.width - 12;
  left = Math.max(12, Math.min(left, maxLeft));
  const top = Math.max(12, Math.min(indicatorRect.top - 12, window.innerHeight - previewRect.height - 12));
  buildQuickPreview.style.left = `${left}px`;
  buildQuickPreview.style.top = `${top}px`;
  buildQuickPreview.style.right = 'auto';
}

function persistQuickPreviewZoomFactor() {
  if (quickPreviewZoomSaveTimer) {
    clearTimeout(quickPreviewZoomSaveTimer);
  }
  quickPreviewZoomSaveTimer = setTimeout(() => {
    quickPreviewZoomSaveTimer = null;
    window.managementAPI.saveSettings({ buildQuickPreviewZoomFactor: quickPreviewZoomFactor });
  }, 150);
}

function setQuickPreviewZoomFactor(nextFactor, { persist = false, rerender = false } = {}) {
  quickPreviewZoomFactor = Math.max(0.2, Math.min(4, Number(nextFactor) || 1));
  if (quickPreviewTreeRenderer) {
    quickPreviewTreeRenderer.setZoomFactor(quickPreviewZoomFactor);
  }
  if (persist) {
    persistQuickPreviewZoomFactor();
  }
  if (rerender && buildQuickPreview && !buildQuickPreview.classList.contains('hidden')) {
    void updateBuildQuickPreview();
  }
}

function hideBuildQuickPreview() {
  if (!buildQuickPreview) return;
  buildQuickPreview.classList.add('hidden');
  refreshClickThroughState();
}

function toggleBuildQuickPreview() {
  if (!buildQuickPreview) return;
  if (buildQuickPreview.classList.contains('hidden')) {
    void updateBuildQuickPreview();
    buildQuickPreview.classList.remove('hidden');
    positionBuildQuickPreview();
    refreshClickThroughState();
  } else {
    hideBuildQuickPreview();
  }
}

async function updateBuildQuickPreview() {
  if (!buildQuickPreview || !quickPreviewSkills || !quickPreviewGear || !quickPreviewSection) return;
  const state = await ensureActiveGuideState();
  quickPreviewSkills.innerHTML = '';
  quickPreviewGear.innerHTML = '';
  applyQuickPreviewSettings();

  const showTree = buildSettings.quickPreviewShowTree !== false;
  const showSkills = buildSettings.quickPreviewShowSkills !== false;
  const showGear = buildSettings.quickPreviewShowGear !== false;
  const emptyTarget = showSkills ? quickPreviewSkills : showGear ? quickPreviewGear : null;

    if (!state || !Array.isArray(state.blocks) || state.blocks.length === 0) {
      quickPreviewSection.textContent = 'Select a build';
      if (quickPreviewNodeLabel) quickPreviewNodeLabel.textContent = '--';
      setPreviewActionHint(quickPreviewActionHint, '');
      updateQuickPreviewLevelDisplay();
      updateQuestHint(quickPreviewQuestHint, getQuickPreviewLevel(buildSettings.characterLevel || 1), 0);
      if (emptyTarget) {
        const empty = document.createElement('div');
        empty.className = 'quick-preview-empty';
      empty.textContent = 'Open a build guide to load section data.';
      emptyTarget.appendChild(empty);
    }
    return;
  }

    const currentLevel = buildSettings.characterLevel || 1;
    const previewLevel = getQuickPreviewLevel(currentLevel);
    updateQuickPreviewLevelDisplay(previewLevel);
    const progress = buildTreeProgress(state, previewLevel, 'tree');
    const section = progress.section;
    if (!section) {
      quickPreviewSection.textContent = 'Section unavailable';
      if (quickPreviewNodeLabel) quickPreviewNodeLabel.textContent = '--';
      setPreviewActionHint(quickPreviewActionHint, '');
      updateQuestHint(quickPreviewQuestHint, previewLevel, 0);
      if (emptyTarget) {
        const empty = document.createElement('div');
        empty.className = 'quick-preview-empty';
        empty.textContent = 'No section data for this level.';
        emptyTarget.appendChild(empty);
      }
      return;
    }

    const title = toString(section.customTitle || section.blockTitle || 'Section');
    const rangeText = formatLevelRange(section);
    quickPreviewSection.textContent = rangeText ? `${title} - ${rangeText}` : title;

    const sectionTree = state?.guideTreeBySection?.[section.id] || null;
    const treeInstruction = buildPopupTreeInstruction(progress, sectionTree, state, quickPreviewTreeRenderer);
    updateQuestHint(quickPreviewQuestHint, previewLevel, progress.highlightNodes.length);
    setPreviewActionHint(quickPreviewActionHint, treeInstruction.actionHint, { respec: treeInstruction.requiresRespec });
    if (quickPreviewNodeLabel) {
      quickPreviewNodeLabel.dataset.nodeId = treeInstruction.highlightNodeId ? String(treeInstruction.highlightNodeId) : '';
      quickPreviewNodeLabel.textContent = treeInstruction.label;
    }
    const className = toString(state.general?.class || state.general?.className) || null;
    const treeRenderer = ensureQuickPreviewTreeRenderer();
    if (showTree && treeRenderer && treeInstruction.renderNodes.length > 0) {
      treeRenderer.render(treeInstruction.renderNodes, {
        highlightNodeId: treeInstruction.highlightNodeId,
        highlightNodeIds: treeInstruction.highlightNodeIds,
        visibleNodeIds: treeInstruction.visibleNodeIds,
        inactiveNodeIds: treeInstruction.inactiveNodeIds,
        className,
        showAllNodes: true,
        centerOnHighlight: true,
        viewMode: 'tree',
        transparentBackground: true,
        sectionHighlight: treeInstruction.sectionHighlight,
        masterySelections: sectionTree?.masterySelections || {},
      });
      if (quickPreviewNodeLabel && progress.highlightNodes.length > 0 && typeof treeRenderer.ensureLoaded === 'function') {
        const pendingId = treeInstruction.highlightNodeId ? String(treeInstruction.highlightNodeId) : '';
        void treeRenderer.ensureLoaded().then(() => {
          if (!quickPreviewNodeLabel || quickPreviewNodeLabel.dataset.nodeId !== pendingId) return;
          const loadedInstruction = buildPopupTreeInstruction(progress, sectionTree, state, treeRenderer);
          quickPreviewNodeLabel.textContent = loadedInstruction.label;
          setPreviewActionHint(quickPreviewActionHint, loadedInstruction.actionHint, { respec: loadedInstruction.requiresRespec });
        });
      }
    } else if (showTree && quickPreviewTreeCanvas) {
    const ctx = quickPreviewTreeCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, quickPreviewTreeCanvas.width, quickPreviewTreeCanvas.height);
  }

  const chains = Array.isArray(section.chains) ? section.chains : [];
  if (!showSkills) {
    // skip
  } else if (chains.length === 0) {
    const emptySkills = document.createElement('div');
    emptySkills.className = 'quick-preview-empty';
    emptySkills.textContent = 'No skills listed.';
    quickPreviewSkills.appendChild(emptySkills);
  } else {
    chains.forEach((chain) => {
      quickPreviewSkills.appendChild(renderSocketChain(chain));
    });
  }

  const gearSlots = state.gearByBlock?.[section.id] || state.gearByBlock?.global || {};
  const gearEntries = Object.entries(gearSlots).sort(([a], [b]) => {
    const rankDiff = getGearSlotRank(a) - getGearSlotRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b);
  });
  if (!showGear) {
    // skip
  } else if (gearEntries.length === 0) {
    const emptyGear = document.createElement('div');
    emptyGear.className = 'quick-preview-empty';
    emptyGear.textContent = 'No gear listed.';
    quickPreviewGear.appendChild(emptyGear);
  } else {
    gearEntries.forEach(([slotId, item]) => {
      if (!item) return;
      const row = document.createElement('div');
      row.className = 'quick-preview-gear-item';
      const imgUrl = resolveGearImageUrl(item);
      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = slotId;
        img.className = 'quick-preview-gear-icon';
        row.appendChild(img);
      }
      const label = document.createElement('div');
      label.className = 'quick-preview-gear-label';
      label.textContent = toString(item?.metadata?.name || item?.name || slotId);
      row.appendChild(label);
      attachHoverTooltip(row, () => buildGearTooltip(null, item?.metadata, label.textContent));
      quickPreviewGear.appendChild(row);
    });
  }
}

function ensureLevelPopupRenderer() {
  if (!levelUpCanvas || !window.TreePreviewRenderer) return null;
  if (!levelPopupRenderer) {
    levelPopupRenderer = new window.TreePreviewRenderer(levelUpCanvas, {
      zoomFactor: 1,
      minZoom: 0.120,
      maxZoom: 0.120,
      transparentBackground: true,
      highlightRingScale: 0.8,
      highlightRingWidth: 4,
      highlightRingColor: 'rgba(255, 208, 64, 0.95)',
      highlightGlowColor: 'rgba(255, 208, 64, 0.9)',
      highlightGlowBlur: 40,
      highlightFillColor: 'rgba(255, 208, 64, 0.22)',
      highlightOuterScale: 0.95,
    });
  }
  return levelPopupRenderer;
}

function ensureQuickPreviewTreeRenderer() {
  if (!quickPreviewTreeCanvas || !window.TreePreviewRenderer) return null;
  if (!quickPreviewTreeRenderer) {
    quickPreviewTreeRenderer = new window.TreePreviewRenderer(quickPreviewTreeCanvas, {
      zoomFactor: 1,
      minZoom: 0.02,
      maxZoom: 0.5,
      transparentBackground: true,
      highlightRingScale: 0.8,
      highlightRingWidth: 4,
      highlightRingColor: 'rgba(255, 208, 64, 0.95)',
      highlightGlowColor: 'rgba(255, 208, 64, 0.9)',
      highlightGlowBlur: 40,
        highlightFillColor: 'rgba(255, 208, 64, 0.22)',
        highlightOuterScale: 0.95,
      });
    quickPreviewTreeRenderer.setZoomFactor(quickPreviewZoomFactor);
  }
  return quickPreviewTreeRenderer;
}

function renderSocketChain(chain) {
  const row = document.createElement('div');
  row.className = 'quick-preview-skill-row';

  const label = document.createElement('div');
  label.className = 'quick-preview-skill-label';
  label.textContent = toString(chain?.label || 'Skill').replace(/:$/, '');
  row.appendChild(label);

  const socketsWrap = document.createElement('div');
  socketsWrap.className = 'quick-preview-sockets';

  const sockets = Array.isArray(chain?.sockets) ? chain.sockets : [];
  sockets.forEach((socket, idx) => {
    const socketEl = document.createElement('div');
    socketEl.className = 'quick-preview-socket';

    const socketColor = socket?.socketColorOverride === 'white' ? 'white' : (socket?.color || 'white');
    const socketImg = SOCKET_IMG[socketColor] || SOCKET_IMG.white;
    if (socketImg) {
      const img = document.createElement('img');
      img.src = socketImg;
      img.alt = socketColor;
      socketEl.appendChild(img);
    }

    if (socket && socket.type !== 'empty') {
      const iconPath = resolveAssetPath(socket.icon);
      if (iconPath) {
        const gemImg = document.createElement('img');
        gemImg.src = iconPath;
        gemImg.alt = socket.name || 'Gem';
        gemImg.className = 'quick-preview-gem-icon';
        socketEl.appendChild(gemImg);
      } else if (socket.name) {
        socketEl.title = socket.name;
      }
      attachHoverTooltip(socketEl, () => buildGemTooltip(socket));
    }

    socketsWrap.appendChild(socketEl);

    if (idx < sockets.length - 1 && LINK_IMG) {
      const linkImg = document.createElement('img');
      linkImg.src = LINK_IMG;
      linkImg.alt = '-';
      linkImg.className = 'quick-preview-link';
      socketsWrap.appendChild(linkImg);
    }
  });

  row.appendChild(socketsWrap);
  return row;
}

function hideLevelUpPopup() {
  if (!levelUpPopup) return;
  levelPopupRequestVersion += 1;
  clearTimeout(levelPopupTimer);
  levelPopupTimer = null;
  isLevelPopupDragging = false;
  levelPopupPositionMode = false;
  levelPopupPinned = false;
  levelUpPopup.classList.remove('dragging');
  levelUpPopup.classList.add('hidden');
  levelUpPopup.classList.remove('positioning');
  refreshClickThroughState();
}

function openLevelPopupPositioner() {
  if (levelPopupPositionMode) {
    hideLevelUpPopup();
    return;
  }
  levelPopupPositionMode = true;
  isOverUI = false;
  updateClickThrough(true);
  const level = Number.isFinite(buildSettings.characterLevel) ? buildSettings.characterLevel : 1;
  void showLevelUpPopup(level, { pinned: true });
  setTimeout(() => {
    // Extra safety: ensure we do not stay in full-window capture state when no drag is active.
    if (!isLevelPopupDragging) {
      refreshClickThroughState();
    }
  }, 0);
}

async function showLevelUpPopup(level, options = {}) {
  if (!levelUpPopup || !levelUpCanvas) return;
  const requestVersion = ++levelPopupRequestVersion;
  const state = await ensureActiveGuideState();
  if (requestVersion !== levelPopupRequestVersion) return;
  const baseLevel = Number.isFinite(level) ? level : buildSettings.characterLevel || 1;
  const previewLevel = getQuickPreviewLevel(baseLevel);
  const pinned = options.pinned === true || levelPopupPositionMode === true;
  levelPopupPinned = pinned;

  if (levelUpLevel) {
    levelUpLevel.textContent = `Lv ${previewLevel}`;
  }

  levelUpPopup.classList.remove('hidden');
  levelUpPopup.classList.toggle('positioning', pinned);
  applyLevelPopupPosition();

      if (!state || !Array.isArray(state.blocks) || !state.guideTreeBySection) {
      if (levelUpNodeLabel) levelUpNodeLabel.textContent = 'Select a build to enable guide info.';
      setPreviewActionHint(levelUpActionHint, '');
      updateQuestHint(levelUpQuestHint, previewLevel, 0);
      clearTimeout(levelPopupTimer);
      if (!pinned) {
        levelPopupTimer = setTimeout(() => {
          if (requestVersion !== levelPopupRequestVersion) return;
          hideLevelUpPopup();
        }, 10000);
      } else {
        levelPopupTimer = null;
      }
    refreshClickThroughState();
    return;
  }

  const progress = buildTreeProgress(state, previewLevel, 'tree');
  const sectionTree = state?.guideTreeBySection?.[progress.section?.id] || null;
  const treeInstruction = buildPopupTreeInstruction(progress, sectionTree, state, levelPopupRenderer);
  updateQuestHint(levelUpQuestHint, previewLevel, progress.highlightNodes.length);
  setPreviewActionHint(levelUpActionHint, treeInstruction.actionHint, { respec: treeInstruction.requiresRespec });

  if (levelUpNodeLabel) {
    levelUpNodeLabel.dataset.nodeId = treeInstruction.highlightNodeId ? String(treeInstruction.highlightNodeId) : '';
    levelUpNodeLabel.textContent = treeInstruction.label;
  }

  const renderer = ensureLevelPopupRenderer();
  if (renderer && treeInstruction.renderNodes.length > 0) {
    const className = toString(state.general?.class || state.general?.className) || null;
    requestAnimationFrame(() => {
      renderer.render(treeInstruction.renderNodes, {
        highlightNodeId: treeInstruction.highlightNodeId,
        highlightNodeIds: treeInstruction.highlightNodeIds,
        visibleNodeIds: treeInstruction.visibleNodeIds,
        inactiveNodeIds: treeInstruction.inactiveNodeIds,
        className,
        showAllNodes: true,
        centerOnHighlight: !treeInstruction.requiresRespec,
        viewMode: 'tree',
        transparentBackground: true,
        sectionHighlight: treeInstruction.sectionHighlight,
        masterySelections: sectionTree?.masterySelections || {},
      });
      if (levelUpNodeLabel && progress.highlightNodes.length > 0 && typeof renderer.ensureLoaded === 'function') {
        const pendingId = treeInstruction.highlightNodeId ? String(treeInstruction.highlightNodeId) : '';
        void renderer.ensureLoaded().then(() => {
          if (!levelUpNodeLabel || levelUpNodeLabel.dataset.nodeId !== pendingId) return;
          const loadedInstruction = buildPopupTreeInstruction(progress, sectionTree, state, renderer);
          levelUpNodeLabel.textContent = loadedInstruction.label;
          setPreviewActionHint(levelUpActionHint, loadedInstruction.actionHint, { respec: loadedInstruction.requiresRespec });
        });
      }
    });
  }

  clearTimeout(levelPopupTimer);
  if (!pinned) {
    levelPopupTimer = setTimeout(() => {
      if (requestVersion !== levelPopupRequestVersion) return;
      hideLevelUpPopup();
    }, 10000);
  } else {
    levelPopupTimer = null;
  }
  if (!pinned) {
    isOverUI = false;
    updateClickThrough(true);
  }
  refreshClickThroughState();
}

// Poll for refreshed scan snapshots while the feed bar is open.
setInterval(async () => {
  if (!feedBar.classList.contains('hidden')) {
    await loadNetWorthIndicator();
  }
}, 30000);

// ============================================
// RUN TIMER FUNCTIONALITY
// ============================================

const runTimerIndicator = document.getElementById('networthRunTimer');
const runTimerText = document.getElementById('runTimerText');
let runTimerState = {
  remainingSeconds: null,
  endsAt: null,
  isPaused: false,
};
let runTimerInterval = null;
let runTimerEndRequested = false;

function positionRunTimer() {
  return;
}

// Format time from seconds to MM:SS
function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getDisplayedRunTimerSeconds() {
  if (runTimerState.isPaused || !Number.isFinite(runTimerState.endsAt)) {
    return Math.max(0, Number(runTimerState.remainingSeconds) || 0);
  }
  return Math.max(0, Math.ceil((runTimerState.endsAt - Date.now()) / 1000));
}

function renderRunTimerFromState() {
  if (!runTimerIndicator || !runTimerText) return;
  const remainingSeconds = getDisplayedRunTimerSeconds();
  runTimerText.textContent = formatTime(remainingSeconds);
  runTimerText.className = 'networth-run-timer-text';
  networthIndicator?.classList.remove('run-critical');
  if (remainingSeconds <= 60) {
    runTimerText.classList.add('critical');
    networthIndicator?.classList.add('run-critical');
  } else if (remainingSeconds <= 300) {
    runTimerText.classList.add('warning');
  }

  if (!runTimerState.isPaused && remainingSeconds <= 0 && !runTimerEndRequested) {
    runTimerEndRequested = true;
    if (window.managementAPI.requestRunEnd) {
      window.managementAPI.requestRunEnd();
    }
  }
}

function ensureRunTimerInterval() {
  if (runTimerInterval) return;
  runTimerInterval = setInterval(() => {
    if (runTimerIndicator?.classList.contains('hidden')) return;
    renderRunTimerFromState();
  }, 250);
}

function stopRunTimerInterval() {
  if (!runTimerInterval) return;
  clearInterval(runTimerInterval);
  runTimerInterval = null;
}

// Update run timer display
function updateRunTimer(data) {
  if (!data || !runTimerIndicator) return;

  if (typeof data.remainingSeconds === 'number') {
    runTimerState.remainingSeconds = Math.max(0, data.remainingSeconds);
  }
  runTimerState.endsAt = Number.isFinite(data.endsAt) ? data.endsAt : null;
  runTimerState.isPaused = data.isPaused === true;

  if (runTimerState.isPaused) {
    runTimerIndicator.classList.add('paused');
  } else {
    runTimerIndicator.classList.remove('paused');
  }
  runTimerEndRequested = false;
  showRunTimer();
  renderRunTimerFromState();
}

// Show run timer
function showRunTimer() {
  if (runTimerIndicator) {
    runTimerIndicator.classList.remove('hidden');
    networthIndicator?.classList.add('run-active');
    ensureRunTimerInterval();
    renderRunTimerFromState();
  }
}

// Hide run timer
function hideRunTimer() {
  if (runTimerIndicator) {
    runTimerIndicator.classList.add('hidden');
  }
  networthIndicator?.classList.remove('run-active');
  networthIndicator?.classList.remove('run-critical');
  runTimerState = {
    remainingSeconds: null,
    endsAt: null,
    isPaused: false,
  };
  runTimerEndRequested = false;
  stopRunTimerInterval();
}

// Reposition timer when networth indicator moves or window resizes
window.addEventListener('resize', () => {
  positionNetWorthIndicator();
  positionDockingHandleHoverZone();
  positionBuildQuickPreview();
});

// Listen for run timer events from networth overlay
if (window.managementAPI.onRunTimerUpdate) {
  window.managementAPI.onRunTimerUpdate((data) => {
    updateRunTimer(data);
  });
}

if (window.managementAPI.onRunStarted) {
  window.managementAPI.onRunStarted((data) => {
    if (data) {
      updateRunTimer(data);
    }
    showRunTimer();
  });
}

if (window.managementAPI.onRunEnded) {
  window.managementAPI.onRunEnded(() => {
    hideRunTimer();
  });
}

if (!runTimerIndicator) {
  console.error('[MANAGEMENT] Run timer indicator element not found!');
}

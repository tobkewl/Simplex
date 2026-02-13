const state = {
  items: new Map(),
  whispers: new Map(),
  locked: false,
  readOnly: true,
  displayFeedName: false,  // Show feed name instead of item name
  showModRanges: true,  // Show mod ranges like [24-28]
  expandedItems: new Set(),
  refreshIntervals: new Map(),  // Track refresh intervals for each item
  refreshDelays: new Map(),  // Track current refresh delay for each item (in ms)
  rateLimitCount: 0,  // Track consecutive rate limits
  lastRateLimitTime: 0,  // Track when last rate limit occurred
  updatingIntervals: false,  // Flag to prevent recursive interval updates
  lastDelayDecrease: 0  // Track when we last decreased the delay
};

const overlayEl = document.getElementById('overlay');
const liveTradesItemsEl = document.getElementById('liveTradesItems');
const whispersItemsEl = document.getElementById('whispersItems');
const liveTradesSectionEl = document.getElementById('liveTradesSection');
const whispersSectionEl = document.getElementById('whispersSection');
function resizeWindowToContent() {
  const overlayEl = document.getElementById('overlay');
  if (!overlayEl) return;

  const headerEl = document.querySelector('.header');
  const liveTradesSectionEl = document.getElementById('liveTradesSection');
  const whispersSectionEl = document.getElementById('whispersSection');
  const liveTradesItemsEl = document.getElementById('liveTradesItems');
  const whispersItemsEl = document.getElementById('whispersItems');

  if (!headerEl) return;

  // Measure each component
  const headerHeight = headerEl.offsetHeight;
  let totalHeight = headerHeight;

  // Add live trades section if visible
  if (liveTradesSectionEl && !liveTradesSectionEl.classList.contains('hidden')) {
    totalHeight += liveTradesSectionEl.offsetHeight;
    if (liveTradesItemsEl) {
      totalHeight += liveTradesItemsEl.scrollHeight;
    }
  }

  // Add whispers section if visible
  if (whispersSectionEl && !whispersSectionEl.classList.contains('hidden')) {
    totalHeight += whispersSectionEl.offsetHeight;
    if (whispersItemsEl) {
      totalHeight += whispersItemsEl.scrollHeight;
    }
  }

  // Add small padding and constrain to min/max
  const finalHeight = Math.max(150, Math.min(totalHeight + 16, 800));
  const finalWidth = Math.max(428, overlayEl.offsetWidth);

  try {
    window.overlayAPI.resizeWindow(finalWidth, finalHeight);
  } catch (err) {
    console.error('[OVERLAY] Failed to resize:', err);
  }
}

function render() {
  // Render live trades
  if (liveTradesItemsEl) {
    liveTradesItemsEl.innerHTML = '';
    const itemsArray = Array.from(state.items.values());

    // Update count
    const countEl = document.getElementById('liveTradesCount');
    if (countEl) {
      countEl.textContent = itemsArray.length;
    }

    // Show/hide section based on items
    if (liveTradesSectionEl) {
      if (itemsArray.length > 0) {
        liveTradesSectionEl.classList.remove('hidden');
      } else {
        liveTradesSectionEl.classList.add('hidden');
      }
    }

    // Sort by timestamp, newest first
    itemsArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    for (const item of itemsArray) {
      const el = createItemCard(item);
      liveTradesItemsEl.appendChild(el);
    }
  }

  // Render whispers
  if (whispersItemsEl) {
    whispersItemsEl.innerHTML = '';
    const whispersArray = Array.from(state.whispers.values());

    // Update count
    const countEl = document.getElementById('whispersCount');
    if (countEl) {
      countEl.textContent = whispersArray.length;
    }

    // Show/hide section based on whispers
    if (whispersSectionEl) {
      if (whispersArray.length > 0) {
        whispersSectionEl.classList.remove('hidden');
      } else {
        whispersSectionEl.classList.add('hidden');
      }
    }

    // Sort by timestamp, newest first
    whispersArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    for (const whisper of whispersArray) {
      const el = createWhisperCard(whisper);
      whispersItemsEl.appendChild(el);
    }
  }

  // Show/hide overlay based on content
  const hasItems = state.items.size > 0;
  const hasWhispers = state.whispers.size > 0;
  console.log('[OVERLAY] Render: hasItems=', hasItems, 'hasWhispers=', hasWhispers);
  
  if (hasItems || hasWhispers) {
    console.log('[OVERLAY] Removing hidden class from overlay');
    overlayEl.classList.remove('hidden');
    try {
      window.overlayAPI.setVisible(true);
      console.log('[OVERLAY] Set overlay visible to true');
    } catch (err) {
      console.error('[OVERLAY] Error setting visible:', err);
    }
  } else {
    console.log('[OVERLAY] Adding hidden class to overlay');
    overlayEl.classList.add('hidden');
    try {
      window.overlayAPI.setVisible(false);
    } catch (err) {
      console.error('[OVERLAY] Error setting visible:', err);
    }
  }

  // Resize window to fit content - double RAF + setTimeout to ensure layout is complete
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resizeWindowToContent();
      // Additional resize after a short delay to catch any late layout updates
      setTimeout(() => {
        resizeWindowToContent();
      }, 50);
    });
  });
}

function createItemCard(item) {
  const el = document.createElement('div');
  el.className = 'card no-drag';
  el.dataset.itemId = item.id;
  
  const timeAgo = item.timestamp ? formatTimeAgo(item.timestamp) : 'now';
  const isExpanded = state.expandedItems.has(item.id);

  // Determine display name: feed name or item name
  const displayName = state.displayFeedName && item.feedName
    ? item.feedName
    : item.name;

  // Status indicator color (only for the dot)
  let statusColor = '#666'; // grey = offline
  if (item.online) {
    statusColor = '#4ade80'; // green = online
    if (item.status === 'afk') statusColor = 'var(--accent-yellow)'; // accent = afk
    if (item.status === 'dnd') statusColor = '#f87171'; // red = dnd
  }

  // Price display with currency icon
  let priceHtml = '';
  if (item.currencyIcon) {
    priceHtml = `${escapeHtml(item.priceAmount || '')} <img src="${escapeHtml(item.currencyIcon)}" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 2px;" alt="${escapeHtml(item.priceCurrency || '')}"/>`;
  } else {
    priceHtml = `💰 ${escapeHtml(item.price || '?')}`;
  }

  // Prepare details for expansion with mod tiers
  let modsHtml = '';
  if (item.modsDetailed && item.modsDetailed.length > 0) {
    modsHtml = item.modsDetailed.slice(0, 10).map(mod => {
      let tierLabel = '';
      if (mod.tier) {
        const tierColor = mod.affix === 'suffix' ? '#60a5fa' : 'var(--accent-yellow)';
        let fullLabel = mod.tier;
        // Only show range if showModRanges is enabled AND range exists and is not empty
        if (state.showModRanges && mod.range && mod.range.trim()) {
          fullLabel = mod.tier + ' <span style="opacity: 0.7;">' + mod.range + '</span>';
        }
        tierLabel = `<span style="color: ${tierColor}; font-weight: 600; font-size: 10px; margin-right: 4px;">${fullLabel}</span>`;
      }
      // Only color special mod types (crafted, fractured, enchant), keep normal mods white
      let modColor = '#e8e8e8';
      if (mod.type === 'crafted') modColor = '#88c0d0';
      if (mod.type === 'fractured') modColor = 'var(--accent-yellow)';
      if (mod.type === 'enchant') modColor = '#a78bfa';
      return `<div style="margin-bottom: 3px; font-size: 11px; display: flex; align-items: flex-start; gap: 4px;">${tierLabel}<span style="flex: 1; color: ${modColor};">${escapeHtml(mod.text)}</span></div>`;
    }).join('');
  } else if (item.mods && item.mods.length > 0) {
    modsHtml = item.mods.slice(0, 8).map(m => `<div style="margin-bottom: 2px;">${escapeHtml(m)}</div>`).join('');
  }
  const hasMods = modsHtml.length > 0;

  // Build properties HTML
  let propsHtml = '';
  const propsSections = [];
  if (item.props && item.props.properties) {
    for (const prop of item.props.properties) {
      if (prop.name && prop.values && prop.values.length > 0) {
        const val = prop.values[0][0];
        const valType = prop.values[0][1] || 0;
        const valColor = valType === 1 ? 'rgba(136, 136, 255, 0.9)' : 'rgba(200, 200, 200, 0.9)';
        propsSections.push(`<div style="font-size: 11px; margin-bottom: 2px;"><span style="color: rgba(200, 200, 200, 0.8);">${escapeHtml(prop.name)}: </span><span style="color: ${valColor};">${escapeHtml(val)}</span></div>`);
      }
    }
  }
  if (item.props && item.props.ilvl != null) {
    propsSections.push(`<div style="font-size: 11px; margin-bottom: 2px; color: rgba(200, 200, 200, 0.8);">Item Level: <span style="color: rgba(200, 200, 200, 0.9);">${item.props.ilvl}</span></div>`);
  }
  if (item.props && item.props.requirements) {
    const reqBits = [];
    for (const req of item.props.requirements) {
      if (req.name && req.values && req.values.length > 0) {
        const val = req.values[0][0];
        reqBits.push(`<span style="color: rgba(200, 200, 200, 0.9);">${escapeHtml(val)}</span> <span style="color: rgba(200, 200, 200, 0.8);">${escapeHtml(req.name)}</span>`);
      }
    }
    if (reqBits.length > 0) {
      propsSections.push(`<div style="font-size: 11px; margin-bottom: 2px; color: rgba(200, 200, 200, 0.8);">Requires ${reqBits.join(', ')}</div>`);
    }
  }
  if (item.props && item.props.quality != null) {
    propsSections.push(`<div style="font-size: 11px; margin-bottom: 2px; color: rgba(200, 200, 200, 0.8);">Quality: <span style="color: rgba(136, 136, 255, 0.9);">+${item.props.quality}%</span></div>`);
  }
  if (propsSections.length > 0) {
    propsHtml = `<div style="padding: 8px 0; border-top: 1px solid rgba(var(--accent-yellow-rgb), 0.3); margin-top: 4px;">${propsSections.join('')}</div>`;
  }
  
  let actionButtonsHtml = '';
  if (item.availableButtons && item.availableButtons.hideout) {
    actionButtonsHtml += `<button class="action-btn-icon hideout-btn" data-id="${escapeHtml(item.id)}" title="Travel to hideout">🏠 Hideout</button>`;
  }
  if (item.availableButtons && item.availableButtons.whisper) {
    actionButtonsHtml += `<button class="action-btn-icon whisper-btn" data-id="${escapeHtml(item.id)}" title="Whisper seller">💬 Whisper</button>`;
  }
  if (!actionButtonsHtml) {
    actionButtonsHtml = `<button class="action-btn-icon whisper-btn" data-id="${escapeHtml(item.id)}" title="Whisper seller">💬 Whisper</button>`;
  }
  
  const iconHtml = item.icon
    ? `<img src="${escapeHtml(item.icon)}" class="item-icon" alt="${escapeHtml(item.name)}" />`
    : `<div class="item-icon-placeholder">?</div>`;

  el.innerHTML = `
    <div class="compact-item">
      <div class="item-row">
        <button class="expand-btn no-drag" data-id="${escapeHtml(item.id)}" title="Show/hide details">
          <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
        </button>
        ${iconHtml}
        <div class="item-info">
          <div class="item-name">${escapeHtml(displayName)}</div>
          <div class="item-meta">
            <span class="seller"><span style="color: ${statusColor};">●</span> <span style="color: #999;">${escapeHtml(item.seller || 'Unknown')}</span></span>
            <span class="price">${priceHtml}</span>
            <span class="time">${timeAgo}</span>
          </div>
        </div>
        <div class="actions-compact">
          ${actionButtonsHtml}
          <button class="action-btn-icon dismiss-btn" data-id="${escapeHtml(item.id)}" title="Dismiss">✕</button>
        </div>
      </div>
      ${isExpanded ? `
        <div class="item-details-expanded">
          ${hasMods ? `<div class="mods">${modsHtml}</div>` : ''}
          ${propsHtml}
        </div>
      ` : ''}
    </div>
  `;

  return el;
}

function createWhisperCard(whisper) {
  const el = document.createElement('div');
  el.className = `card no-drag whisper-card ${whisper.type}`;
  el.dataset.whisperId = whisper.id;
  
  const timeAgo = formatTimeAgo(whisper.timestamp);
  
  const guildHtml = whisper.guildName
    ? `<span style="font-size: 11px; color: #999; margin-left: 8px;">&lt;${escapeHtml(whisper.guildName)}&gt;</span>`
    : '';
  
  // Item name and price
  let itemNameText = '';
  let priceHtml = '';

  if (whisper.itemName) {
    const itemQuantityText = whisper.itemQuantity && whisper.itemQuantity > 1
      ? `${whisper.itemQuantity} `
      : '';

    itemNameText = `${itemQuantityText}${escapeHtml(whisper.itemName)}`;

    // Price display with currency icon (like live searches)
    if (whisper.currencyIcon && whisper.priceQuantity) {
      priceHtml = `<span class="price" style="color: var(--accent-yellow); font-weight: 600; white-space: nowrap;">${escapeHtml(whisper.priceQuantity)} <img src="${escapeHtml(whisper.currencyIcon)}" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 2px;" alt="${escapeHtml(whisper.priceType || '')}"/></span>`;
    } else if (whisper.priceQuantity && whisper.priceType) {
      priceHtml = `<span class="price" style="color: var(--accent-yellow); font-weight: 600; white-space: nowrap;">${escapeHtml(whisper.priceQuantity)} ${escapeHtml(whisper.priceType)}</span>`;
    } else if (whisper.priceType) {
      priceHtml = `<span class="price" style="color: var(--accent-yellow); font-weight: 600; white-space: nowrap;">${escapeHtml(whisper.priceType)}</span>`;
    }
  }
  
  const actionsHtml = whisper.type === 'incoming'
    ? `
      <button class="action-btn-icon" data-action="invite" data-id="${whisper.id}" title="Invite to party">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <line x1="19" y1="8" x2="19" y2="14"></line>
          <line x1="22" y1="11" x2="16" y2="11"></line>
        </svg>
      </button>
      <button class="action-btn-icon" data-action="trade" data-id="${whisper.id}" title="Open trade">🛒</button>
      <button class="action-btn-icon" data-action="thanks" data-id="${whisper.id}" title="Say thanks">👍</button>
      <button class="action-btn-icon dismiss-btn" data-action="kick" data-id="${whisper.id}" title="Kick from party">👋</button>
    `
    : `
      <button class="action-btn-icon" data-action="hideout" data-id="${whisper.id}" title="Go to player's hideout">🏠</button>
      <button class="action-btn-icon" data-action="trade" data-id="${whisper.id}" title="Open trade">🛒</button>
      <button class="action-btn-icon" data-action="thanks" data-id="${whisper.id}" title="Say thanks">👍</button>
      <button class="action-btn-icon dismiss-btn" data-action="leave" data-id="${whisper.id}" title="Leave party">👋</button>
      <button class="action-btn-icon dismiss-btn" data-action="hideout-own" data-id="${whisper.id}" title="Go to own hideout">🏡</button>
    `;
  
  // Status indicator color (online by default for whispers, can be updated if status info is available)
  let statusColor = '#4ade80'; // green = online (default for whispers)
  if (whisper.online === false) {
    statusColor = '#666'; // grey = offline
  } else if (whisper.status === 'afk') {
    statusColor = 'var(--accent-yellow)'; // accent = afk
  } else if (whisper.status === 'dnd') {
    statusColor = '#f87171'; // red = dnd
  }

  el.innerHTML = `
    <div class="compact-item whisper-compact">
      <div class="whisper-info-row">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 4px;">
          <div style="font-size: 13px; font-weight: 600; color: #e8e8e8; flex: 1; min-width: 0;">${itemNameText}</div>
          <button class="action-btn-icon dismiss-btn whisper-dismiss" data-action="dismiss" data-id="${whisper.id}" title="Dismiss" style="padding: 4px 8px; min-width: auto;">✕</button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="font-size: 12px; font-weight: 500; flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;">
            <span style="color: ${statusColor};">●</span>
            <span class="whisper-player-name" data-action="whois" data-id="${whisper.id}" style="color: #999; cursor: pointer; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px;" title="Whois player">${escapeHtml(whisper.playerName)}</span>${guildHtml}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${priceHtml}
            <span class="time" style="white-space: nowrap; color: #999; font-size: 11px;">${timeAgo}</span>
          </div>
        </div>
      </div>
      <div class="whisper-actions-row">
        ${actionsHtml}
      </div>
    </div>
  `;
  
  return el;
}

function formatTime(date, time) {
  if (!date || !time) return '';
  try {
    const [hours, minutes] = time.split(':');
    return `${hours}:${minutes}`;
  } catch {
    return time;
  }
}

function handleWhisperAction(action, id, whisper) {
  switch (action) {
    case 'whois':
      // Whois player
      window.overlayAPI.sendToGame(`/whois ${whisper.playerName}`);
      break;
    case 'invite':
      // Invite player to party
      window.overlayAPI.sendToGame(`/invite ${whisper.playerName}`);
      break;
    case 'trade':
      // Open trade with player
      window.overlayAPI.sendToGame(`/tradewith ${whisper.playerName}`);
      break;
    case 'thanks':
      // Say thanks (just send "thanks" as whisper message)
      window.overlayAPI.sendToGame(`@${whisper.playerName} thanks`);
      break;
    case 'kick':
      // Kick player from party (for incoming whispers)
      window.overlayAPI.sendToGame(`/kick ${whisper.playerName}`);
      break;
    case 'hideout':
      // Go to player's hideout (for outgoing whispers)
      window.overlayAPI.sendToGame(`/hideout ${whisper.playerName}`);
      break;
    case 'leave':
      // Leave party (for outgoing whispers)
      window.overlayAPI.sendToGame(`/leave`);
      break;
    case 'hideout-own':
      // Go to own hideout (for outgoing whispers)
      window.overlayAPI.sendToGame(`/hideout`);
      break;
    case 'dismiss':
      // Remove whisper from overlay
      state.whispers.delete(id);
      render();
      break;
  }
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Adaptive refresh delays: 5s -> 10s -> 30s -> 1min -> 2min -> 5min -> stop refresh
// Progressively increases when rate limited, stops after 5min
const REFRESH_DELAYS = [5000, 10000, 30000, 60000, 120000, 300000]; // 5s, 10s, 30s, 1min, 2min, 5min
const DEFAULT_REFRESH_DELAY = REFRESH_DELAYS[0]; // Start at 5 seconds

function getCurrentRefreshDelay() {
  // Determine delay based on rate limit count
  // If rateLimitCount exceeds array length, return null to stop refresh
  if (state.rateLimitCount >= REFRESH_DELAYS.length) {
    return null; // Stop refresh
  }
  const index = Math.min(state.rateLimitCount, REFRESH_DELAYS.length - 1);
  return REFRESH_DELAYS[index];
}

function increaseRefreshDelay() {
  // Prevent recursive calls while updating intervals
  if (state.updatingIntervals) {
    return;
  }

  // Increase delay when rate limited
  // Stop refresh after reaching 5min delay
  if (state.rateLimitCount < REFRESH_DELAYS.length) {
    state.rateLimitCount++;
    state.lastRateLimitTime = Date.now();
    const newDelay = getCurrentRefreshDelay();

    // Set flag to prevent recursive calls
    state.updatingIntervals = true;

    try {
      if (newDelay === null) {
        // Stop all refresh intervals
        console.log('[OVERLAY] Rate limit reached maximum, stopping refresh for all items');
        for (const [itemId, intervalId] of state.refreshIntervals.entries()) {
          stopItemRefresh(itemId);
        }
      } else {
        console.log('[OVERLAY] Rate limit detected, increasing refresh delay to', newDelay, 'ms');

        // Update all active refresh intervals with new delay
        for (const [itemId, intervalId] of state.refreshIntervals.entries()) {
          if (state.items.has(itemId)) {
            stopItemRefresh(itemId);
            startItemRefresh(itemId);
          }
        }
      }
    } finally {
      // Always clear the flag, even if there's an error
      state.updatingIntervals = false;
    }
  }
}

function decreaseRefreshDelay() {
  // Prevent recursive calls while updating intervals
  if (state.updatingIntervals) {
    return;
  }

  const now = Date.now();
  const timeSinceLastRateLimit = now - state.lastRateLimitTime;
  const timeSinceLastDecrease = now - state.lastDelayDecrease;

  // Only decrease if:
  // 1. No rate limit for at least 30 seconds
  // 2. At least 30 seconds since last decrease (prevent rapid decreases)
  // 3. We actually have a count to decrease
  if (state.rateLimitCount > 0 && timeSinceLastRateLimit > 30000 && timeSinceLastDecrease > 30000) {
    state.rateLimitCount--;
    state.lastDelayDecrease = now;
    console.log('[OVERLAY] No rate limiting detected, decreasing refresh delay to', getCurrentRefreshDelay(), 'ms');

    // Set flag to prevent recursive calls
    state.updatingIntervals = true;

    try {
      // Update all active refresh intervals with new delay
      for (const [itemId, intervalId] of state.refreshIntervals.entries()) {
        if (state.items.has(itemId)) {
          stopItemRefresh(itemId);
          startItemRefresh(itemId);
        }
      }
    } finally {
      // Always clear the flag, even if there's an error
      state.updatingIntervals = false;
    }
  }
}

function startItemRefresh(itemId) {
  // Only refresh items that are still on the overlay
  if (!state.items.has(itemId)) {
    return;
  }

  // Clear existing interval if any
  if (state.refreshIntervals.has(itemId)) {
    clearInterval(state.refreshIntervals.get(itemId));
  }

  const currentDelay = getCurrentRefreshDelay();
  
  // If delay is null, don't start refresh (stopped)
  if (currentDelay === null) {
    console.log('[OVERLAY] Refresh stopped for item:', itemId, '(reached maximum delay)');
    return;
  }
  
  state.refreshDelays.set(itemId, currentDelay);

  // Start new interval with adaptive delay
  const intervalId = setInterval(() => {
    // Only refresh if item is still on overlay
    if (state.items.has(itemId)) {
      console.log('[OVERLAY] Auto-refreshing item:', itemId, 'with delay:', currentDelay, 'ms');
      window.overlayAPI.refreshItemOnSite(itemId);
      
      // Check if we should decrease delay (no rate limiting)
      decreaseRefreshDelay();
    } else {
      // Item was removed, clear interval
      clearInterval(intervalId);
      state.refreshIntervals.delete(itemId);
      state.refreshDelays.delete(itemId);
    }
  }, currentDelay);

  state.refreshIntervals.set(itemId, intervalId);
  console.log('[OVERLAY] Started auto-refresh for item:', itemId, 'with delay:', currentDelay, 'ms');
}

function stopItemRefresh(itemId) {
  if (state.refreshIntervals.has(itemId)) {
    clearInterval(state.refreshIntervals.get(itemId));
    state.refreshIntervals.delete(itemId);
    state.refreshDelays.delete(itemId);
    console.log('[OVERLAY] Stopped auto-refresh for item:', itemId);
  }
}

function dismissAllItems() {
  // Stop all refresh intervals
  for (const [itemId, intervalId] of state.refreshIntervals.entries()) {
    clearInterval(intervalId);
  }
  state.refreshIntervals.clear();
  state.refreshDelays.clear();
  
  // Clear all items and whispers
  state.items.clear();
  state.whispers.clear();
  state.expandedItems.clear();
  
  // Hide overlay
  overlayEl.classList.add('hidden');
  try {
    window.overlayAPI.setVisible(false);
  } catch (err) {}
  
  // Re-render to update UI
  render();
  
  console.log('[OVERLAY] All items and whispers dismissed');
}

function onNewItems(items) {
  console.log('[OVERLAY] onNewItems called with:', items);
  if (!Array.isArray(items) || items.length === 0) {
    console.warn('[OVERLAY] onNewItems: invalid items array');
    return;
  }

  // Play sound notification for new items
  try {
    const soundEl = document.getElementById('soundNotification');
    if (soundEl) {
      soundEl.currentTime = 0; // Reset to start
      soundEl.play().catch(err => {
        console.warn('[OVERLAY] Could not play sound:', err);
      });
    }
  } catch (err) {
    console.warn('[OVERLAY] Sound playback error:', err);
  }

  // Merge and sort newest first, add timestamps
  for (const it of items) {
    if (!it.timestamp) it.timestamp = Date.now();
    state.items.set(it.id, it);
    console.log('[OVERLAY] New item:', it.name, '-', it.price, 'from', it.seller);

    // Start auto-refresh for this item
    startItemRefresh(it.id);
  }

  console.log('[OVERLAY] Calling render after adding items, total items:', state.items.size);
  render();
}

function onNewWhisper(whisper) {
  console.log('[OVERLAY] onNewWhisper called with:', whisper);
  const id = `${whisper.type}-${whisper.timestamp}-${whisper.playerName}`;
  
  // Play sound notification
  try {
    const soundEl = document.getElementById('soundNotification');
    if (soundEl) {
      soundEl.currentTime = 0;
      soundEl.play().catch(err => {
        console.warn('[OVERLAY] Could not play sound:', err);
      });
    }
  } catch (err) {
    console.warn('[OVERLAY] Sound playback error:', err);
  }
  
  state.whispers.set(id, { ...whisper, id });
  console.log('[OVERLAY] New whisper:', whisper.type, 'from', whisper.playerName);
  console.log('[OVERLAY] Calling render after adding whisper, total whispers:', state.whispers.size);
  
  render();
}

// Update timestamps continuously every second without re-rendering
function updateTimestamps() {
  // Update item timestamps
  const itemCards = liveTradesItemsEl?.querySelectorAll('.card');
  if (itemCards) {
    itemCards.forEach(card => {
      const itemId = card.dataset.itemId;
      const item = state.items.get(itemId);
      if (item && item.timestamp) {
        const timeEl = card.querySelector('.time');
        if (timeEl) {
          timeEl.textContent = formatTimeAgo(item.timestamp);
        }
      }
    });
  }

  // Update whisper timestamps
  const whisperCards = whispersItemsEl?.querySelectorAll('.whisper-card');
  if (whisperCards) {
    whisperCards.forEach(card => {
      const whisperId = card.dataset.whisperId;
      const whisper = state.whispers.get(whisperId);
      if (whisper && whisper.timestamp) {
        const timeEl = card.querySelector('.time');
        if (timeEl) {
          timeEl.textContent = formatTimeAgo(whisper.timestamp);
        }
      }
    });
  }
}

setInterval(() => {
  if ((state.items.size > 0 || state.whispers.size > 0) && !overlayEl.classList.contains('hidden')) {
    updateTimestamps();
  }
}, 1000);

function onRemoved(ids) {
  if (!Array.isArray(ids)) return;

  for (const id of ids) {
    state.items.delete(id);
    stopItemRefresh(id);  // Stop auto-refresh when item is removed
  }

  render();

  // Hide overlay if no items or whispers left
  if (state.items.size === 0 && state.whispers.size === 0) {
    overlayEl.classList.add('hidden');
    try {
      window.overlayAPI.setVisible(false);
    } catch (err) {}
  }
}

function onItemUnavailable(itemId) {
  console.log('[OVERLAY] Item no longer available, removing:', itemId);
  state.items.delete(itemId);
  state.expandedItems.delete(itemId);
  stopItemRefresh(itemId);  // Stop auto-refresh

  render();

  // Hide overlay if no items or whispers left
  if (state.items.size === 0 && state.whispers.size === 0) {
    overlayEl.classList.add('hidden');
    try {
      window.overlayAPI.setVisible(false);
    } catch (err) {}
  }
}

let rateLimitTimer = null;
function showRateLimitNotification() {
  const headerEl = document.querySelector('.header');
  if (!headerEl) return;

  // Increase refresh delay when rate limited
  increaseRefreshDelay();

  // Clear existing notification
  const existingNotif = document.getElementById('rate-limit-notif');
  if (existingNotif) existingNotif.remove();
  if (rateLimitTimer) clearTimeout(rateLimitTimer);

  // Create notification with current refresh delay info
  const currentDelay = getCurrentRefreshDelay();
  const delaySeconds = currentDelay / 1000;
  const notif = document.createElement('div');
  notif.id = 'rate-limit-notif';
  notif.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, rgba(180, 70, 70, 0.95), rgba(160, 60, 60, 0.95));
    color: rgba(255, 200, 200, 0.95);
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    border: 1px solid rgba(200, 90, 90, 0.6);
    border-top: none;
    border-radius: 0 0 6px 6px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  `;
  notif.textContent = `RATE LIMITED - Refresh delay increased to ${delaySeconds}s. Waiting...`;

  headerEl.appendChild(notif);

  // Remove after 5 seconds
  rateLimitTimer = setTimeout(() => {
    if (notif && notif.parentNode) {
      notif.remove();
    }
  }, 5000);
}

function escapeHtml(s) {
  // Convert to string first if it's not already
  const str = (s == null) ? '' : String(s);
  return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Lock button functions (defined before async init)
// Lock button removed - overlay is unlocked when settings are open on overlay tab

function updateHeaderDraggable() {
  const header = document.querySelector('.header');
  if (header) {
    if (state.locked) {
      // Locked: header is NOT draggable
      header.classList.remove('drag');
      header.classList.add('no-drag');
      console.log('[OVERLAY] Header set to NOT draggable (locked)');
    } else {
      // Unlocked: header IS draggable
      header.classList.remove('no-drag');
      header.classList.add('drag');
      console.log('[OVERLAY] Header set to draggable (unlocked)');
    }
  } else {
    console.warn('[OVERLAY] Header element not found');
  }
}

(async () => {
  // Load settings
  try {
    const s = await window.overlayAPI.getSettings();
    if (s && typeof s.readOnly === 'boolean') state.readOnly = s.readOnly;
    if (s && typeof s.displayFeedName === 'boolean') state.displayFeedName = s.displayFeedName;
    if (s && typeof s.showModRanges === 'boolean') state.showModRanges = s.showModRanges;
  } catch (err) {}

  // Start with overlay locked by default
  state.locked = true;
  updateHeaderDraggable();

  window.overlayAPI.onNewItems(onNewItems);
  window.overlayAPI.onRemoved(onRemoved);
  window.overlayAPI.onItemUnavailable(onItemUnavailable);
  window.overlayAPI.onNewWhisper(onNewWhisper);

  // Listen for settings updates
  window.overlayAPI.onSettingsUpdated((newSettings) => {
    if (newSettings) {
      if (typeof newSettings.readOnly === 'boolean') state.readOnly = newSettings.readOnly;
      if (typeof newSettings.displayFeedName === 'boolean') state.displayFeedName = newSettings.displayFeedName;
      if (typeof newSettings.showModRanges === 'boolean') state.showModRanges = newSettings.showModRanges;
      // Overlay lock is now controlled by settings window status, not checkbox
      console.log('[OVERLAY] Settings updated:', { displayFeedName: state.displayFeedName, showModRanges: state.showModRanges, locked: state.locked });
      // Re-render to update UI if needed
      render();
    }
  });

  // Listen for rate limiting
  window.overlayAPI.onRateLimited(() => {
    showRateLimitNotification();
  });

  // Listen for settings window open/close to unlock/lock overlay
  let settingsWindowOpen = false;
  let settingsTab = null;
  
  window.overlayAPI.onSettingsWindowOpened((tab) => {
    settingsWindowOpen = true;
    settingsTab = tab;
    // Unlock overlay if settings are open on overlay tab (or if tab is null, meaning just opened)
    if (tab === 'overlay' || tab === null) {
      state.locked = false;
      updateHeaderDraggable();
      console.log('[OVERLAY] Settings opened on overlay tab - overlay unlocked');
    } else {
      // Keep locked if on other tabs
      state.locked = true;
      updateHeaderDraggable();
      console.log('[OVERLAY] Settings opened on other tab - overlay locked');
    }
  });
  
  window.overlayAPI.onSettingsWindowClosed(() => {
    settingsWindowOpen = false;
    settingsTab = null;
    // Lock overlay when settings are closed
    state.locked = true;
    updateHeaderDraggable();
    console.log('[OVERLAY] Settings closed - overlay locked');
  });

  // Start with overlay locked by default
  state.locked = true;
  updateHeaderDraggable();

  // Start hidden → make window click-through so it doesn't block Settings
  try {
    window.overlayAPI.setVisible(false);
  } catch (err) {}

  // Initial resize to minimum size
  requestAnimationFrame(() => {
    resizeWindowToContent();
  });
})();

// Lock button removed - overlay is unlocked when settings are open on overlay tab

// Setup dismiss all button listener (dismisses everything)
const dismissAllBtn = document.getElementById('dismissAllBtn');
if (dismissAllBtn) {
  dismissAllBtn.addEventListener('click', () => {
    dismissAllItems();
  });
}

// Event delegation for item buttons (works for both live trades and whispers)
if (liveTradesItemsEl) {
  liveTradesItemsEl.addEventListener('click', (e) => {
    const target = e.target;
    const itemId = target.dataset.id || target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;
    
    const item = state.items.get(itemId);
    if (!item) return;
    
    // Expand button
    if (target.classList.contains('expand-btn') || target.closest('.expand-btn')) {
      if (state.expandedItems.has(itemId)) {
        state.expandedItems.delete(itemId);
      } else {
        state.expandedItems.add(itemId);
      }
      render();
      return;
    }
    
    // Whisper button
    if (target.classList.contains('whisper-btn') || target.closest('.whisper-btn')) {
      window.overlayAPI.clickWhisperOnSite(item.id);
      return;
    }
    
    // Hideout button
    if (target.classList.contains('hideout-btn') || target.closest('.hideout-btn')) {
      window.overlayAPI.clickHideoutOnSite(item.id);
      return;
    }
    
    // Dismiss button
    if (target.classList.contains('dismiss-btn') || target.closest('.dismiss-btn')) {
      state.items.delete(itemId);
      state.expandedItems.delete(itemId);
      stopItemRefresh(itemId);
      render();
      return;
    }
    
    // View link
    if (target.classList.contains('view-link') || target.closest('.view-link')) {
      e.preventDefault();
      if (item.url) {
        window.overlayAPI.openExternal(item.url);
      }
      return;
    }
  });
}

// Event delegation for whisper buttons
if (whispersItemsEl) {
  whispersItemsEl.addEventListener('click', (e) => {
    const target = e.target;
    const whisperId = target.dataset.id || target.closest('[data-whisper-id]')?.dataset.whisperId;
    if (!whisperId) return;
    
    const whisper = state.whispers.get(whisperId);
    if (!whisper) return;
    
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    if (action) {
      handleWhisperAction(action, whisperId, whisper);
    }
  });
}

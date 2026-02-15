function createLiveSnapshotBuilder({ logger, getApiClient }) {
  function normalizeInventoryKey(inventoryId) {
    return String(inventoryId || '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
  }

  function getItemInventoryId(item) {
    return (
      item?.inventoryId ||
      item?.inventory_id ||
      item?.slot ||
      item?.equipmentSlot ||
      item?.equipment_slot ||
      item?.location ||
      null
    );
  }

  function inferSlotFromItem(item) {
    const raw = [
      item?.name || '',
      item?.typeLine || item?.type_line || '',
      item?.baseType || item?.base_type || '',
      item?.itemClass || item?.item_class || '',
    ].join(' ').toLowerCase();

    if (!raw) return null;
    if (/\b(flask)\b/.test(raw)) return 'flask';
    if (/\b(amulet|talisman)\b/.test(raw)) return 'amulet';
    if (/\b(ring)\b/.test(raw)) return 'ring';
    if (/\b(belt|sash)\b/.test(raw)) return 'belt';
    if (/\b(helmet|helm|hood|circlet|mask|crown)\b/.test(raw)) return 'helm';
    if (/\b(gloves|gauntlets|mitts|grips)\b/.test(raw)) return 'gloves';
    if (/\b(boots|greaves|slippers)\b/.test(raw)) return 'boots';
    if (/\b(body armour|body armor|vest|robe|chest|tunic|garb)\b/.test(raw)) return 'body';
    if (/\b(shield|buckler|focus|quiver)\b/.test(raw)) return 'offhand';
    if (/\b(bow|wand|sword|axe|mace|dagger|claw|staff|sceptre|scepter|spear|crossbow)\b/.test(raw)) return 'weapon';
    return null;
  }

  function mapInventoryIdToSlot(inventoryId, item = null) {
    const key = normalizeInventoryKey(inventoryId);
    const map = {
      weapon: 'weapon',
      weapon1: 'weapon',
      weaponset1mainhand: 'weapon',
      mainhand: 'weapon',
      mainhandweapon: 'weapon',
      weapon2: 'weapon',
      weaponset2mainhand: 'weapon',
      offhand: 'offhand',
      offhand1: 'offhand',
      weaponset1offhand: 'offhand',
      offhandweapon: 'offhand',
      offhand2: 'offhand',
      weaponset2offhand: 'offhand',
      helm: 'helm',
      helmet: 'helm',
      bodyarmour: 'body',
      bodyarmor: 'body',
      body: 'body',
      gloves: 'gloves',
      boots: 'boots',
      amulet: 'amulet',
      ring: 'ring1',
      ring1: 'ring1',
      ring2: 'ring2',
      belt: 'belt',
      flask: 'flask1',
      flask1: 'flask1',
      flask2: 'flask2',
      flask3: 'flask3',
      flask4: 'flask4',
      flask5: 'flask5',
    };
    if (map[key]) return map[key];

    if (key.startsWith('flask')) {
      const idx = Number.parseInt(key.replace(/\D+/g, ''), 10);
      if (Number.isFinite(idx) && idx >= 1 && idx <= 5) return `flask${idx}`;
      return 'flask';
    }

    if (key === 'leftring') return 'ring1';
    if (key === 'rightring') return 'ring2';

    if (key === 'maininventory' || key === 'inventory' || key === 'main') {
      const inferred = inferSlotFromItem(item);
      return inferred || null;
    }

    const inferred = inferSlotFromItem(item);
    return inferred || null;
  }

  function nextAvailableIndexedSlot(base, usedSet, max) {
    for (let i = 1; i <= max; i += 1) {
      const candidate = `${base}${i}`;
      if (!usedSet.has(candidate)) return candidate;
    }
    return `${base}${max}`;
  }

  function resolveGearSlotId(item, usedSet) {
    const rawSlot = mapInventoryIdToSlot(getItemInventoryId(item), item);
    if (!rawSlot) return null;

    if (rawSlot === 'ring') {
      return nextAvailableIndexedSlot('ring', usedSet, 2);
    }
    if (rawSlot === 'flask') {
      const x = Number(item?.x);
      if (Number.isFinite(x)) {
        const idx = Math.min(5, Math.max(1, Math.floor(x) + 1));
        const candidate = `flask${idx}`;
        if (!usedSet.has(candidate)) return candidate;
      }
      return nextAvailableIndexedSlot('flask', usedSet, 5);
    }
    if (rawSlot === 'ring1' && usedSet.has('ring1') && !usedSet.has('ring2')) return 'ring2';
    if (rawSlot === 'flask1' && usedSet.has('flask1')) return nextAvailableIndexedSlot('flask', usedSet, 5);
    return rawSlot;
  }

  function mapItemSlot(inventoryId, item = null) {
    const key = normalizeInventoryKey(inventoryId);
    const map = {
      weapon: 'weapon1',
      weapon1: 'weapon1',
      weaponset1mainhand: 'weapon1',
      mainhand: 'weapon1',
      weapon2: 'weapon1',
      weaponset2mainhand: 'weapon1',
      offhand: 'weapon2',
      offhand1: 'weapon2',
      weaponset1offhand: 'weapon2',
      offhand2: 'weapon2',
      weaponset2offhand: 'weapon2',
      helm: 'helmet',
      helmet: 'helmet',
      bodyarmour: 'body',
      bodyarmor: 'body',
      body: 'body',
      gloves: 'gloves',
      boots: 'boots',
    };
    if (map[key]) return map[key];
    const base = mapInventoryIdToSlot(inventoryId, item);
    if (base === 'weapon') return 'weapon1';
    if (base === 'offhand') return 'weapon2';
    if (base === 'helm') return 'helmet';
    if (base === 'body') return 'body';
    if (base === 'gloves') return 'gloves';
    if (base === 'boots') return 'boots';
    return 'any';
  }

  function normalizeMods(item) {
    const mods = [];
    const pushMods = (list) => {
      if (Array.isArray(list)) {
        list.forEach((m) => {
          if (typeof m === 'string' && m.trim()) mods.push(m.trim());
        });
      }
    };
    pushMods(item?.implicitMods);
    pushMods(item?.implicit_mods);
    pushMods(item?.explicitMods);
    pushMods(item?.explicit_mods);
    pushMods(item?.craftedMods);
    pushMods(item?.crafted_mods);
    pushMods(item?.enchantMods);
    pushMods(item?.enchant_mods);
    pushMods(item?.rune_mods);
    return mods;
  }

  function rarityFromFrame(frameType) {
    const raw = Number.isFinite(frameType) ? Number(frameType) : Number.NaN;
    if (raw === 3) return 'unique';
    if (raw === 2) return 'rare';
    if (raw === 1) return 'magic';
    if (typeof frameType === 'string' && frameType.trim()) return frameType.trim().toLowerCase();
    return 'normal';
  }

  function slugifyLive(value) {
    const raw = String(value || '').toLowerCase();
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'item';
  }

  function buildGearRowsFromItems(items) {
    const rows = [];
    const usedSlots = new Set();
    (items || []).forEach((item) => {
      const slotId = resolveGearSlotId(item, usedSlots);
      if (!slotId || usedSlots.has(slotId)) return;
      usedSlots.add(slotId);
      const typeLine = item?.typeLine || item?.type_line || item?.baseType || item?.base_type || '';
      const name = [item?.name, typeLine].filter(Boolean).join(' ').trim() || typeLine || 'Item';
      const rarity = rarityFromFrame(item?.frameType ?? item?.frame_type ?? item?.rarity);
      const mods = normalizeMods(item);
      const baseSlug = slugifyLive(`${slotId}-${name || item?.typeLine || 'item'}`);
      const liveSlug = `live-${baseSlug}`;
      const metadata = {
        name: item?.name || '',
        base_type: item?.baseType || item?.base_type || typeLine || '',
        item_type: rarity,
        image_url: item?.icon || null,
        mods,
        mod_entries: mods.map((text) => ({ text })),
        gear_item_slug: liveSlug,
        gear_item_snapshot: {
          slug: liveSlug,
          name,
          base_type: item?.baseType || item?.base_type || typeLine || '',
          item_type: rarity,
          image_url: item?.icon || null,
          mods,
        },
      };
      rows.push({ slotId, item_name: name, metadata });
    });
    return rows;
  }

  function parseGemProperty(item, key) {
    const props = Array.isArray(item?.properties) ? item.properties : (Array.isArray(item?.props) ? item.props : []);
    const prop = props.find((p) => p && typeof p.name === 'string' && p.name.toLowerCase() === key);
    if (!prop || !Array.isArray(prop.values)) return null;
    const value = prop.values[0]?.[0];
    const num = Number.parseInt(String(value || '').replace(/\D+/g, ''), 10);
    return Number.isFinite(num) ? num : null;
  }

  function isPlaceholderGemName(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'empty' || normalized === 'none' || normalized === 'socket';
  }

  function buildSkillChainsFromItems(items) {
    const chains = [];
    let chainIndex = 1;
    (items || []).forEach((item) => {
      const socketedItems = Array.isArray(item?.socketedItems)
        ? item.socketedItems
        : (Array.isArray(item?.socketed_items) ? item.socketed_items : []);
      let sockets = Array.isArray(item?.sockets) ? item.sockets : [];
      if (sockets.length === 0 && socketedItems.length > 0) {
        sockets = socketedItems.map((gem, idx) => ({
          group: Number.isFinite(gem?.group) ? Number(gem.group) : 0,
          colour: gem?.colour || gem?.color || 'white',
          socket: idx,
        }));
      }
      if (sockets.length === 0) return;
      const inventoryId = getItemInventoryId(item);
      const byGroup = new Map();
      sockets.forEach((socket, idx) => {
        const group = Number.isFinite(socket?.group) ? socket.group : 0;
        if (!byGroup.has(group)) byGroup.set(group, []);
        byGroup.get(group).push({ socket, index: idx });
      });

      byGroup.forEach((groupSockets) => {
        const ordered = groupSockets.sort((a, b) => a.index - b.index);
        const socketEntries = ordered.map(({ socket, index }) => {
          const gem = socketedItems.find((si) => Number(si?.socket ?? si?.socket_index) === index) || null;
          const color = socket?.colour ? String(socket.colour).toLowerCase() : (socket?.color ? String(socket.color).toLowerCase() : 'white');
          if (!gem) {
            return null;
          }
          const gemName = gem?.typeLine || gem?.type_line || gem?.name || 'Gem';
          if (isPlaceholderGemName(gemName)) {
            return null;
          }
          return {
            id: String(gemName).toLowerCase().replace(/\s+/g, '-'),
            color,
            name: gemName,
            type: 'gem',
            icon: gem?.icon || null,
            isSupport: gem?.support === true,
            itemSlot: mapItemSlot(inventoryId, item),
            socketColorOverride: color === 'white' ? 'white' : null,
            level: parseGemProperty(gem, 'level'),
            quality: parseGemProperty(gem, 'quality') ?? 0,
          };
        }).filter(Boolean);
        if (socketEntries.length === 0) return;
        chains.push({
          id: `chain-${chainIndex}`,
          label: `Skill ${chainIndex}:`,
          description: '',
          role: '',
          itemSlot: mapItemSlot(inventoryId, item),
          sockets: socketEntries,
        });
        chainIndex += 1;
      });
    });

    return chains;
  }

  function buildSkillChainsFromSkillList(skills) {
    if (!Array.isArray(skills) || skills.length === 0) return [];
    const sockets = skills
      .map((skill) => {
        if (!skill || typeof skill !== 'object') return null;
        const name = skill?.name || skill?.typeLine || skill?.type_line || skill?.display_name || null;
        if (!name) return null;
        if (isPlaceholderGemName(name)) return null;
        const supportByFlag = skill?.support === true || skill?.isSupport === true || skill?.supportGem === true;
        const supportByText = String(skill?.typeLine || skill?.type_line || '').toLowerCase().includes('support');
        return {
          id: String(name).toLowerCase().replace(/\s+/g, '-'),
          color: 'white',
          name: String(name),
          type: 'gem',
          icon: skill?.icon || null,
          isSupport: supportByFlag || supportByText,
          itemSlot: 'any',
          socketColorOverride: 'white',
          level: Number.isFinite(skill?.level) ? Number(skill.level) : null,
          quality: Number.isFinite(skill?.quality) ? Number(skill.quality) : 0,
        };
      })
      .filter(Boolean);
    if (sockets.length === 0) return [];
    return [{
      id: 'chain-1',
      label: 'Skill 1:',
      description: '',
      role: '',
      itemSlot: 'any',
      sockets,
    }];
  }

  function normalizeNodeId(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      const candidate = value[0];
      if (candidate === null || candidate === undefined) return null;
      return String(candidate);
    }
    if (typeof value === 'object') {
      const candidate = value.id ?? value.hash ?? value.node ?? value.nodeId;
      if (candidate === null || candidate === undefined) return null;
      return String(candidate);
    }
    return null;
  }

  function isLikelyItemObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Boolean(
      value?.inventoryId ||
      value?.inventory_id ||
      value?.slot ||
      value?.equipmentSlot ||
      value?.typeLine ||
      value?.type_line ||
      value?.baseType ||
      value?.base_type ||
      value?.icon ||
      value?.frameType !== undefined ||
      Array.isArray(value?.sockets) ||
      Array.isArray(value?.socketedItems) ||
      Array.isArray(value?.socketed_items)
    );
  }

  function buildItemDedupeKey(item) {
    const directId = item?.id || item?.item_id || item?.uuid || null;
    if (directId) return `id:${String(directId)}`;
    return [
      getItemInventoryId(item) || '',
      item?.x ?? '',
      item?.y ?? '',
      item?.w ?? '',
      item?.h ?? '',
      item?.name || '',
      item?.typeLine || item?.type_line || item?.baseType || item?.base_type || '',
      item?.icon || '',
    ].join('|');
  }

  function pushSnapshotItem(item, out, seen, fallbackInventoryId = null) {
    if (!item || typeof item !== 'object') return;
    let nextItem = item;
    if (!getItemInventoryId(item) && fallbackInventoryId) {
      nextItem = { ...item, inventoryId: fallbackInventoryId };
    }
    const key = buildItemDedupeKey(nextItem);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(nextItem);
  }

  function appendItemsFromCandidate(candidate, out, seen, fallbackInventoryId = null) {
    if (!candidate) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => appendItemsFromCandidate(entry, out, seen, fallbackInventoryId));
      return;
    }
    if (isLikelyItemObject(candidate)) {
      pushSnapshotItem(candidate, out, seen, fallbackInventoryId);
      return;
    }
    if (typeof candidate === 'object') {
      Object.entries(candidate).forEach(([key, value]) => {
        const nestedFallback = fallbackInventoryId || key;
        appendItemsFromCandidate(value, out, seen, nestedFallback);
      });
    }
  }

  function collectSnapshotItems(detail, rawDetail = null) {
    const candidates = [
      detail?.items,
      detail?.item,
      detail?.equipment,
      detail?.inventory,
      detail?.jewels,
      detail?.flasks,
      detail?.weaponSet,
      detail?.weaponSets,
      detail?.weapon_set,
      detail?.weapon_sets,
      rawDetail?.items,
      rawDetail?.item,
      rawDetail?.equipment,
      rawDetail?.inventory,
      rawDetail?.jewels,
      rawDetail?.flasks,
      rawDetail?.weaponSet,
      rawDetail?.weaponSets,
      rawDetail?.weapon_set,
      rawDetail?.weapon_sets,
      rawDetail?.character?.items,
      rawDetail?.character?.item,
      rawDetail?.character?.equipment,
      rawDetail?.character?.inventory,
      rawDetail?.character?.jewels,
      rawDetail?.character?.flasks,
      rawDetail?.character?.weaponSet,
      rawDetail?.character?.weaponSets,
      rawDetail?.character?.weapon_set,
      rawDetail?.character?.weapon_sets,
    ];
    const out = [];
    const seen = new Set();
    candidates.forEach((list) => {
      appendItemsFromCandidate(list, out, seen, null);
    });
    return out;
  }

  function collectSkillsFromCandidate(candidate, out, seen) {
    if (!candidate) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => collectSkillsFromCandidate(entry, out, seen));
      return;
    }
    if (typeof candidate === 'object') {
      if (isLikelyItemObject(candidate) || candidate?.name || candidate?.typeLine || candidate?.type_line || candidate?.display_name) {
        const key = [
          candidate?.id || '',
          candidate?.name || '',
          candidate?.typeLine || candidate?.type_line || candidate?.display_name || '',
          candidate?.icon || '',
        ].join('|');
        if (!seen.has(key)) {
          seen.add(key);
          out.push(candidate);
        }
        return;
      }
      Object.values(candidate).forEach((entry) => collectSkillsFromCandidate(entry, out, seen));
    }
  }

  function collectSnapshotSkills(detail, rawDetail = null) {
    const candidates = [
      detail?.skills,
      detail?.skillGems,
      detail?.skill_gems,
      rawDetail?.skills,
      rawDetail?.skillGems,
      rawDetail?.skill_gems,
      rawDetail?.character?.skills,
      rawDetail?.character?.skillGems,
      rawDetail?.character?.skill_gems,
    ];
    const out = [];
    const seen = new Set();
    candidates.forEach((value) => collectSkillsFromCandidate(value, out, seen));
    return out;
  }

  function summarizeSkillChains(chains, maxChains = 6, maxSockets = 6) {
    if (!Array.isArray(chains)) return [];
    return chains.slice(0, maxChains).map((chain, index) => {
      const sockets = Array.isArray(chain?.sockets) ? chain.sockets : [];
      return {
        chainIndex: index + 1,
        id: chain?.id || null,
        label: chain?.label || null,
        itemSlot: chain?.itemSlot || null,
        socketNames: sockets
          .slice(0, maxSockets)
          .map((socket) => socket?.name || socket?.typeLine || socket?.type_line || null)
          .filter(Boolean),
        supportCount: sockets.filter((socket) => socket?.isSupport === true).length,
      };
    });
  }

  function summarizePassivesPayload(passives, detail, rawDetail) {
    const hashes = Array.isArray(passives?.hashes)
      ? passives.hashes
      : (Array.isArray(passives?.hashes_ex)
        ? passives.hashes_ex
        : (Array.isArray(passives?.passiveSkillTree)
          ? passives.passiveSkillTree
          : (Array.isArray(detail?.passiveSkillTree)
            ? detail.passiveSkillTree
            : (Array.isArray(rawDetail?.passiveSkillTree) ? rawDetail.passiveSkillTree : []))));
    return {
      hasPassivesObject: Boolean(passives && typeof passives === 'object'),
      passivesKeys: passives && typeof passives === 'object' ? Object.keys(passives).slice(0, 30) : [],
      detailPassiveSkillTreeCount: Array.isArray(detail?.passiveSkillTree) ? detail.passiveSkillTree.length : 0,
      rawPassiveSkillTreeCount: Array.isArray(rawDetail?.passiveSkillTree) ? rawDetail.passiveSkillTree.length : 0,
      hashCount: hashes.length,
      hashSample: hashes.slice(0, 25).map((id) => String(id)),
    };
  }

  async function buildLiveSnapshot(characterName, league) {
    const apiClient = typeof getApiClient === 'function' ? getApiClient() : null;
    if (!apiClient || typeof apiClient.getLiveBuildSnapshot !== 'function') {
      throw new Error('Snapshot API client is not available');
    }
    logger.info('live-tracking:snapshot:server-oauth', { characterName });
    const snapshotData = await apiClient.getLiveBuildSnapshot({ characterName });
    const rawDetail = snapshotData?.detail ?? null;
    const detail = rawDetail?.character ?? rawDetail;
    const passives = snapshotData?.passives ?? detail?.passives ?? rawDetail?.passives ?? null;
    if (!detail) {
      throw new Error('Unable to fetch character snapshot data from server OAuth');
    }

    const hashes = Array.isArray(passives?.hashes)
      ? passives.hashes
      : (Array.isArray(passives?.hashes_ex)
        ? passives.hashes_ex
        : (Array.isArray(passives?.passiveSkillTree)
          ? passives.passiveSkillTree
          : (Array.isArray(detail?.passiveSkillTree) ? detail.passiveSkillTree : [])));

    const treeSelectionOrder = hashes.map(normalizeNodeId).filter(Boolean);
    const items = collectSnapshotItems(detail, rawDetail);
    const gear = buildGearRowsFromItems(items);
    let chains = buildSkillChainsFromItems(items);
    if (chains.length === 0) {
      const skillsList = collectSnapshotSkills(detail, rawDetail);
      chains = buildSkillChainsFromSkillList(skillsList);
    }
    logger.info('live-tracking:snapshot:normalized', {
      characterName,
      itemCount: items.length,
      gearCount: gear.length,
      chainCount: chains.length,
      treeCount: treeSelectionOrder.length,
      inventoryIds: items.slice(0, 12).map((item) => String(getItemInventoryId(item) || '')).filter(Boolean),
      mappedSlots: gear.map((row) => row.slotId),
      sampleItems: items.slice(0, 8).map((item) => ({
        inventoryId: getItemInventoryId(item),
        name: item?.name || null,
        typeLine: item?.typeLine || item?.type_line || null,
        baseType: item?.baseType || item?.base_type || null,
        x: Number.isFinite(item?.x) ? Number(item.x) : null,
        y: Number.isFinite(item?.y) ? Number(item.y) : null,
        socketCount: Array.isArray(item?.sockets) ? item.sockets.length : 0,
        socketedCount: Array.isArray(item?.socketedItems)
          ? item.socketedItems.length
          : (Array.isArray(item?.socketed_items) ? item.socketed_items.length : 0),
      })),
      sampleChains: summarizeSkillChains(chains),
      passives: summarizePassivesPayload(passives, detail, rawDetail),
    });

    const meta = {
      version: 1,
      general: {
        league,
        class: detail?.class || '',
        ascendancy: detail?.ascendancyClass || detail?.ascendancy || '',
        bloodline: detail?.bloodline || '',
        source: 'server-oauth',
      },
      tree: {
        sectionMode: 'manual',
      },
    };

    return { treeSelectionOrder, gear, chains, meta };
  }

  return {
    buildLiveSnapshot,
    summarizeSkillChains,
  };
}

module.exports = {
  createLiveSnapshotBuilder,
};
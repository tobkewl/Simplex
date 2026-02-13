const { contextBridge, ipcRenderer } = require('electron');

// Listen to messages posted from the page-shim and forward to main
window.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'POE_LIVE_RAW') {
    ipcRenderer.send('poe-live:raw', data.payload);
  }
  if (data.type === 'POE_LIVE_ITEMS') {
    ipcRenderer.send('poe-live:new-items', data.payload);
  }
  if (data.type === 'POE_LIVE_REMOVED') {
    ipcRenderer.send('poe-live:removed', data.payload);
  }
  if (data.type === 'POE_RATE_LIMITED') {
    ipcRenderer.send('poe-live:rate-limited');
  }
});

// Inject a shim into the page context
function injectShim() {
  try {
    const script = document.createElement('script');
    script.textContent = `(() => {
      // Prevent double injection
      if (window.__vibeTradrShimInjected) return;
      window.__vibeTradrShimInjected = true;

      const queryId = (() => {
        const parts = location.pathname.split('/');
        const idx = parts.indexOf('search');
        if (idx >= 0 && parts.length >= idx + 3) {
          return parts[idx + 2];
        }
        return '';
      })();

      const chunk = (arr, size) => {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // Currency icon mapping
      const currencyIconMap = {
        'chaos': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
        'divine': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
        'divine orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
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

      async function fetchDetails(ids) {
        const items = [];
        for (const batch of chunk(ids, 10)) {
          const url = "/api/trade/fetch/" + batch.join(',') + (queryId ? ("?query=" + encodeURIComponent(queryId)) : '');
          try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) {
              continue;
            }
            const json = await res.json();
            if (Array.isArray(json.result)) {
              for (const r of json.result) {
                try {
                  const nm = (r.item && r.item.name && r.item.typeLine) ? (r.item.name + ' ' + r.item.typeLine) : (r.item && r.item.typeLine) || (r.item && r.item.name) || 'Item';

                  // Extract price with currency icon
                  let price = '';
                  let priceAmount = '';
                  let priceCurrency = '';
                  let currencyIcon = '';
                  if (r.listing && r.listing.price) {
                    priceAmount = r.listing.price.amount || '';
                    priceCurrency = r.listing.price.currency || '';
                    // Map currency to icon URL
                    currencyIcon = currencyIconMap[priceCurrency.toLowerCase()] || '';
                    price = priceAmount + ' ' + priceCurrency;
                  } else if (r.listing && r.listing.convertedPrice) {
                    priceAmount = r.listing.convertedPrice.amount || '';
                    priceCurrency = r.listing.convertedPrice.currency || '';
                    currencyIcon = currencyIconMap[priceCurrency.toLowerCase()] || '';
                    price = priceAmount + ' ' + priceCurrency;
                  }

                  const url = location.origin + location.pathname.replace(/\\/live$/, '') + '#' + (r.id || '');
                  const sellerName = (r.listing && r.listing.account && r.listing.account.name) || '';
                  const characterName = (r.listing && r.listing.account && r.listing.account.lastCharacterName) || sellerName;
                  const whisperMsg = (r.listing && r.listing.whisper) || '';

                  // Extract online status (online, afk, dnd)
                  const accountStatus = (r.listing && r.listing.account && r.listing.account.status) || 'offline';
                  const isOnline = !!(r.listing && r.listing.account && r.listing.account.online);

                  // Parse mods with tier information
                  const modsDetailed = [];
                  const extMods = r.item && r.item.extended && r.item.extended.mods;
                  const hashesObj = r.item && r.item.extended && r.item.extended.hashes;

                  // Implicit mods
                  if (r.item && r.item.implicitMods) {
                    for (let i = 0; i < r.item.implicitMods.length; i++) {
                      modsDetailed.push({ text: r.item.implicitMods[i], type: 'implicit', tier: '', range: '', affix: '' });
                    }
                  }

                  // Explicit mods - resolve via extended.hashes.explicit -> extended.mods.explicit
                  if (r.item && r.item.explicitMods) {
                    const hashesList = (hashesObj && Array.isArray(hashesObj.explicit)) ? hashesObj.explicit : null;

                    for (let i = 0; i < r.item.explicitMods.length; i++) {
                      let tiers = [];
                      let ranges = [];
                      let affixTypes = [];
                      let affixNames = [];

                      // Extract stat hash and modObj indices from hashes.explicit[i]
                      // Structure: ["explicit.stat_xxx", [0, 2]] or ["explicit.stat_xxx", [0]]
                      let statHash = null;
                      const modIndices = [];
                      if (hashesList && hashesList[i]) {
                        const entry = hashesList[i];
                        if (Array.isArray(entry)) {
                          statHash = entry[0]; // The stat hash string
                          if (entry.length > 1 && Array.isArray(entry[1])) {
                            modIndices.push(...entry[1]); // The array of indices
                          }
                        }
                      }

                      // Fallback: use positional index if no indices found
                      if (modIndices.length === 0) {
                        modIndices.push(i);
                      }

                      // Process each modObj for composite mods
                      for (const idx of modIndices) {
                        let modObj = null;
                        if (extMods && extMods.explicit) {
                          if (Array.isArray(extMods.explicit)) {
                            modObj = extMods.explicit[idx];
                          } else if (typeof extMods.explicit === 'object' && idx in extMods.explicit) {
                            modObj = extMods.explicit[idx];
                          }
                        }

                        if (modObj) {
                          // Extract tier
                          if (modObj.tier) {
                            tiers.push(modObj.tier);
                          }

                          // Extract range from magnitudes, filtering by stat hash
                          if (modObj.magnitudes && modObj.magnitudes.length > 0) {
                            for (const mag of modObj.magnitudes) {
                              // Only include magnitudes that match the current stat hash
                              if (mag.min != null && mag.max != null && (!statHash || mag.hash === statHash)) {
                                ranges.push('[' + mag.min + '—' + mag.max + ']');
                              }
                            }
                          }

                          // Extract affix name
                          if (modObj.name) {
                            affixNames.push(modObj.name);
                          }

                          // Determine prefix/suffix
                          if (modObj.tier) {
                            const t = modObj.tier;
                            if (t && t.startsWith && t.startsWith('P')) {
                              affixTypes.push('prefix');
                            } else if (t && t.startsWith && t.startsWith('S')) {
                              affixTypes.push('suffix');
                            }
                          }
                        }
                      }

                      const tierLabel = tiers.join(' + ');
                      const rangeLabel = ranges.join(' + ');
                      const primaryAffixType = affixTypes.length > 0 ? affixTypes[0] : '';

                      modsDetailed.push({
                        text: r.item.explicitMods[i],
                        type: 'explicit',
                        tier: tierLabel,
                        range: rangeLabel,
                        affix: primaryAffixType,
                        affixName: affixNames.join(' + ')
                      });
                    }
                  }

                  // Enchant mods
                  if (r.item && r.item.enchantMods) {
                    for (let i = 0; i < r.item.enchantMods.length; i++) {
                      modsDetailed.push({ text: r.item.enchantMods[i], type: 'enchant', tier: '', range: '', affix: '', affixName: '' });
                    }
                  }

                  // Fractured mods - resolve via extended.hashes.fractured -> extended.mods.fractured
                  if (r.item && r.item.fracturedMods) {
                    const hashesList = (hashesObj && Array.isArray(hashesObj.fractured)) ? hashesObj.fractured : null;

                    for (let i = 0; i < r.item.fracturedMods.length; i++) {
                      let tiers = [];
                      let ranges = [];
                      let affixTypes = [];
                      let affixNames = [];

                      let statHash = null;
                      const modIndices = [];
                      if (hashesList && hashesList[i]) {
                        const entry = hashesList[i];
                        if (Array.isArray(entry)) {
                          statHash = entry[0];
                          if (entry.length > 1 && Array.isArray(entry[1])) {
                            modIndices.push(...entry[1]);
                          }
                        }
                      }

                      if (modIndices.length === 0) {
                        modIndices.push(i);
                      }

                      for (const idx of modIndices) {
                        let modObj = null;
                        if (extMods && extMods.fractured) {
                          if (Array.isArray(extMods.fractured)) {
                            modObj = extMods.fractured[idx];
                          } else if (typeof extMods.fractured === 'object' && idx in extMods.fractured) {
                            modObj = extMods.fractured[idx];
                          }
                        }

                        if (modObj) {
                          if (modObj.tier) {
                            tiers.push(modObj.tier);
                          }

                          if (modObj.magnitudes && modObj.magnitudes.length > 0) {
                            for (const mag of modObj.magnitudes) {
                              if (mag.min != null && mag.max != null && (!statHash || mag.hash === statHash)) {
                                ranges.push('[' + mag.min + '—' + mag.max + ']');
                              }
                            }
                          }

                          if (modObj.name) {
                            affixNames.push(modObj.name);
                          }

                          if (modObj.tier) {
                            const t = modObj.tier;
                            if (t && t.startsWith && t.startsWith('P')) {
                              affixTypes.push('prefix');
                            } else if (t && t.startsWith && t.startsWith('S')) {
                              affixTypes.push('suffix');
                            }
                          }
                        }
                      }

                      const tierLabel = tiers.join(' + ');
                      const rangeLabel = ranges.join(' + ');
                      const primaryAffixType = affixTypes.length > 0 ? affixTypes[0] : '';

                      modsDetailed.push({
                        text: r.item.fracturedMods[i],
                        type: 'fractured',
                        tier: tierLabel,
                        range: rangeLabel,
                        affix: primaryAffixType,
                        affixName: affixNames.join(' + ')
                      });
                    }
                  }

                  // Crafted mods - resolve via extended.hashes.crafted -> extended.mods.crafted
                  if (r.item && r.item.craftedMods) {
                    const hashesList = (hashesObj && Array.isArray(hashesObj.crafted)) ? hashesObj.crafted : null;

                    for (let i = 0; i < r.item.craftedMods.length; i++) {
                      let tiers = [];
                      let ranges = [];
                      let affixTypes = [];
                      let affixNames = [];

                      let statHash = null;
                      const modIndices = [];
                      if (hashesList && hashesList[i]) {
                        const entry = hashesList[i];
                        if (Array.isArray(entry)) {
                          statHash = entry[0];
                          if (entry.length > 1 && Array.isArray(entry[1])) {
                            modIndices.push(...entry[1]);
                          }
                        }
                      }

                      if (modIndices.length === 0) {
                        modIndices.push(i);
                      }

                      for (const idx of modIndices) {
                        let modObj = null;
                        if (extMods && extMods.crafted) {
                          if (Array.isArray(extMods.crafted)) {
                            modObj = extMods.crafted[idx];
                          } else if (typeof extMods.crafted === 'object' && idx in extMods.crafted) {
                            modObj = extMods.crafted[idx];
                          }
                        }

                        if (modObj) {
                          if (modObj.tier) {
                            tiers.push(modObj.tier);
                          }

                          if (modObj.magnitudes && modObj.magnitudes.length > 0) {
                            for (const mag of modObj.magnitudes) {
                              if (mag.min != null && mag.max != null && (!statHash || mag.hash === statHash)) {
                                ranges.push('[' + mag.min + '—' + mag.max + ']');
                              }
                            }
                          }

                          if (modObj.name) {
                            affixNames.push(modObj.name);
                          }

                          if (modObj.tier) {
                            const t = modObj.tier;
                            if (t && t.startsWith && t.startsWith('P')) {
                              affixTypes.push('prefix');
                            } else if (t && t.startsWith && t.startsWith('S')) {
                              affixTypes.push('suffix');
                            }
                          }
                        }
                      }

                      const tierLabel = tiers.join(' + ');
                      const rangeLabel = ranges.join(' + ');
                      const primaryAffixType = affixTypes.length > 0 ? affixTypes[0] : '';

                      modsDetailed.push({
                        text: r.item.craftedMods[i],
                        type: 'crafted',
                        tier: tierLabel,
                        range: rangeLabel,
                        affix: primaryAffixType,
                        affixName: affixNames.join(' + ')
                      });
                    }
                  }

                  // Determine available buttons from API response
                  // hasDirectButton: user has "Direct Whisper" or "Travel to Hideout" enabled
                  // Otherwise only dropdown whisper is available
                  const hasDirectButton = !!(r.listing && (r.listing.hideout_token || r.listing.whisper));
                  const isHideout = !!(r.listing && r.listing.hideout_token);

                  // Extract item properties and requirements
                  const itemProperties = r.item && r.item.properties ? r.item.properties : [];
                  const itemRequirements = r.item && r.item.requirements ? r.item.requirements : [];

                  items.push({
                    id: r.id,
                    name: nm,
                    price: price,
                    priceAmount: priceAmount,
                    priceCurrency: priceCurrency,
                    currencyIcon: currencyIcon,
                    seller: sellerName,
                    character: characterName,
                    online: isOnline,
                    status: accountStatus,
                    whisper: whisperMsg,
                    url: url,
                    mods: ([]).concat(r.item && r.item.implicitMods || [], r.item && r.item.explicitMods || [], r.item && r.item.enchantMods || [], r.item && r.item.fracturedMods || [], r.item && r.item.craftedMods || []).filter(function(x) { return !!x; }).slice(0, 10),
                    modsDetailed: modsDetailed.slice(0, 10),
                    props: {
                      ilvl: r.item && r.item.ilvl,
                      quality: r.item && r.item.quality,
                      properties: itemProperties,
                      requirements: itemRequirements
                    },
                    icon: (r.item && r.item.icon) || '',
                    availableButtons: {
                      hideout: isHideout,
                      whisper: !isHideout && hasDirectButton  // Direct whisper available
                    }
                  });
                } catch (itemErr) {}
              }
            }
          } catch (fetchErr) {}
        }
        return items;
      }

      // Block desktop notifications in-page
      try {
        const DummyNotification = function() {};
        Object.defineProperty(DummyNotification, 'permission', { get: () => 'denied' });
        DummyNotification.requestPermission = () => Promise.resolve('denied');
        window.Notification = DummyNotification;
      } catch {}

      const OrigWS = window.WebSocket;
      window.WebSocket = new Proxy(OrigWS, {
        construct: function(target, args) {
          const ws = new target(...args);
          try {
            ws.addEventListener('message', async function(ev) {
              const raw = ev && ev.data;
              if (!raw) return;
              try { window.postMessage({ type: 'POE_LIVE_RAW', payload: raw }, '*'); } catch (e) {}

              let obj = null;
              try { obj = JSON.parse(raw); } catch (parseErr) {
                return;
              }
              if (!obj || typeof obj !== 'object') return;

              // PoE uses JWT tokens containing item IDs
              // We detect the token and trigger a fetch, but DON'T post the items ourselves
              // The fetch hook below will intercept our fetch and post the items (preventing duplicates)
              if (obj.result && typeof obj.result === 'string' && obj.result.length > 50) {
                try {
                  const token = obj.result;
                  const fetchUrl = '/api/trade/fetch/' + token + (queryId ? ('?query=' + encodeURIComponent(queryId)) : '');
                  // Trigger fetch - will be intercepted by fetch hook below
                  fetch(fetchUrl, { credentials: 'include' }).catch(() => {});
                } catch (err) {}
                return;
              }

              // Handle regular WebSocket messages with item IDs (fallback)
              const newIds = ([]).concat(obj.new || [], obj.update || [], obj.created || [], obj.live || []).filter(function(x) { return typeof x === 'string'; });
              const removedIds = ([]).concat(obj.gone || [], obj.remove || [], obj.deleted || []).filter(function(x) { return typeof x === 'string'; });
              if (newIds.length) {
                try {
                  const details = await fetchDetails(newIds);
                  if (details.length) {
                    window.postMessage({ type: 'POE_LIVE_ITEMS', payload: details }, '*');
                  }
                } catch (err) {}
              }
              if (removedIds.length) {
                try {
                  window.postMessage({ type: 'POE_LIVE_REMOVED', payload: removedIds }, '*');
                } catch (err) {}
              }
            });
          } catch (e) {}
          return ws;
        }
      });
      
      // Hook fetch to intercept /api/trade/fetch/ responses
      try {
        const origFetch = window.fetch;
        if (origFetch) {
          window.fetch = new Proxy(origFetch, {
            apply: function(target, thisArg, args) {
              const url = args && args[0] ? String(args[0]) : '';
              const isTradeFetch = url.includes('/api/trade/fetch/');
              return target.apply(thisArg, args).then(async function(res) {
                try {
                  if (!isTradeFetch) return res;

                  if (!res || !res.ok) {
                    if (res && res.status === 429) {
                      console.error('[RATE LIMITED] PoE API returned 429 - Too Many Requests');
                      window.postMessage({ type: 'POE_RATE_LIMITED' }, '*');
                    }
                    return res;
                  }
                  const ct = (res.headers && res.headers.get) ? res.headers.get('content-type') : '';
                  if (!ct.includes('application/json')) return res;
                  if (!res.clone) return res;
                  
                  const txt = await res.clone().text();
                  let obj = null;
                  try { obj = JSON.parse(txt); } catch (e) {
                    return res;
                  }


                  if (obj && typeof obj === 'object' && Array.isArray(obj.result)) {
                    const items = [];
                    for (let i = 0; i < obj.result.length; i++) {
                      const r = obj.result[i];
                      try {
                        const nm = (r.item && r.item.name && r.item.typeLine) ? (r.item.name + ' ' + r.item.typeLine) : (r.item && r.item.typeLine) || (r.item && r.item.name) || 'Item';

                        // Extract price with currency icon
                        let price = '';
                        let priceAmount = '';
                        let priceCurrency = '';
                        let currencyIcon = '';
                        if (r.listing && r.listing.price) {
                          priceAmount = r.listing.price.amount || '';
                          priceCurrency = r.listing.price.currency || '';
                          // Map currency to icon URL
                          currencyIcon = currencyIconMap[priceCurrency.toLowerCase()] || '';
                          price = priceAmount + ' ' + priceCurrency;
                        } else if (r.listing && r.listing.convertedPrice) {
                          priceAmount = r.listing.convertedPrice.amount || '';
                          priceCurrency = r.listing.convertedPrice.currency || '';
                          currencyIcon = currencyIconMap[priceCurrency.toLowerCase()] || '';
                          price = priceAmount + ' ' + priceCurrency;
                        }

                        const url = location.origin + location.pathname.replace(/\\/live$/, '') + '#' + (r.id || '');
                        const sellerName = (r.listing && r.listing.account && r.listing.account.name) || '';
                        const characterName = (r.listing && r.listing.account && r.listing.account.lastCharacterName) || sellerName;
                        const whisperMsg = (r.listing && r.listing.whisper) || '';

                        // Extract online status (online, afk, dnd)
                        const accountStatus = (r.listing && r.listing.account && r.listing.account.status) || 'offline';
                        const isOnline = !!(r.listing && r.listing.account && r.listing.account.online);

                        // Parse mods with tier information
                        const modsDetailed = [];
                        const extMods = r.item && r.item.extended && r.item.extended.mods;
                        const hashesObj = r.item && r.item.extended && r.item.extended.hashes;


                        // Implicit mods
                        if (r.item && r.item.implicitMods) {
                          for (let i = 0; i < r.item.implicitMods.length; i++) {
                            modsDetailed.push({ text: r.item.implicitMods[i], type: 'implicit', tier: '', range: '', affix: '', affixName: '' });
                          }
                        }

                        // Explicit mods with tier info from extended.mods
                        if (r.item && r.item.explicitMods) {
                          const hashesList = (hashesObj && Array.isArray(hashesObj.explicit)) ? hashesObj.explicit : null;

                          for (let i = 0; i < r.item.explicitMods.length; i++) {
                            let tiers = [];
                            let ranges = [];
                            let affixTypes = [];
                            let affixNames = [];

                            // Extract stat hash and modObj indices from hashes.explicit[i]
                            // Structure: ["explicit.stat_xxx", [0, 2]] or ["explicit.stat_xxx", [0]]
                            let statHash = null;
                            const modIndices = [];
                            if (hashesList && hashesList[i]) {
                              const entry = hashesList[i];
                              if (Array.isArray(entry)) {
                                statHash = entry[0]; // The stat hash string
                                if (entry.length > 1 && Array.isArray(entry[1])) {
                                  modIndices.push(...entry[1]); // The array of indices
                                }
                              }
                            }

                            // Fallback: use positional index if no indices found
                            if (modIndices.length === 0) {
                              modIndices.push(i);
                            }

                            // Process each modObj for composite mods
                            for (const idx of modIndices) {
                              let modObj = null;
                              if (extMods && extMods.explicit) {
                                if (Array.isArray(extMods.explicit)) {
                                  modObj = extMods.explicit[idx];
                                } else if (typeof extMods.explicit === 'object' && idx in extMods.explicit) {
                                  modObj = extMods.explicit[idx];
                                }
                              }

                              if (modObj) {
                                // Extract tier
                                if (modObj.tier) {
                                  tiers.push(modObj.tier);
                                }

                                // Extract range from magnitudes, filtering by stat hash
                                if (modObj.magnitudes && modObj.magnitudes.length > 0) {
                                  for (const mag of modObj.magnitudes) {
                                    // Only include magnitudes that match the current stat hash
                                    if (mag.min != null && mag.max != null && (!statHash || mag.hash === statHash)) {
                                      ranges.push('[' + mag.min + '—' + mag.max + ']');
                                    }
                                  }
                                }

                                // Extract affix name
                                if (modObj.name) {
                                  affixNames.push(modObj.name);
                                }

                                // Determine prefix/suffix
                                if (modObj.tier) {
                                  const t = modObj.tier;
                                  if (t && t.startsWith && t.startsWith('P')) {
                                    affixTypes.push('prefix');
                                  } else if (t && t.startsWith && t.startsWith('S')) {
                                    affixTypes.push('suffix');
                                  }
                                }
                              }
                            }

                            const tierLabel = tiers.join(' + ');
                            const rangeLabel = ranges.join(' + ');
                            const primaryAffixType = affixTypes.length > 0 ? affixTypes[0] : '';

                            modsDetailed.push({
                              text: r.item.explicitMods[i],
                              type: 'explicit',
                              tier: tierLabel,
                              range: rangeLabel,
                              affix: primaryAffixType,
                              affixName: affixNames.join(' + ')
                            });
                          }
                        }

                        // Enchant mods
                        if (r.item && r.item.enchantMods) {
                          for (let i = 0; i < r.item.enchantMods.length; i++) {
                            modsDetailed.push({ text: r.item.enchantMods[i], type: 'enchant', tier: '', range: '', affix: '', affixName: '' });
                          }
                        }

                        // Fractured mods - resolve via extended.hashes.fractured -> extended.mods.fractured
                        if (r.item && r.item.fracturedMods) {
                          const hashesList = (hashesObj && Array.isArray(hashesObj.fractured)) ? hashesObj.fractured : null;

                          for (let i = 0; i < r.item.fracturedMods.length; i++) {
                            let tiers = [];
                            let ranges = [];
                            let affixTypes = [];
                            let affixNames = [];

                            let statHash = null;
                            const modIndices = [];
                            if (hashesList && hashesList[i]) {
                              const entry = hashesList[i];
                              if (Array.isArray(entry)) {
                                statHash = entry[0];
                                if (entry.length > 1 && Array.isArray(entry[1])) {
                                  modIndices.push(...entry[1]);
                                }
                              }
                            }

                            if (modIndices.length === 0) {
                              modIndices.push(i);
                            }

                            for (const idx of modIndices) {
                              let modObj = null;
                              if (extMods && extMods.fractured) {
                                if (Array.isArray(extMods.fractured)) {
                                  modObj = extMods.fractured[idx];
                                } else if (typeof extMods.fractured === 'object' && idx in extMods.fractured) {
                                  modObj = extMods.fractured[idx];
                                }
                              }

                              if (modObj) {
                                if (modObj.tier) {
                                  tiers.push(modObj.tier);
                                }

                                if (modObj.magnitudes && modObj.magnitudes.length > 0) {
                                  for (const mag of modObj.magnitudes) {
                                    if (mag.min != null && mag.max != null && (!statHash || mag.hash === statHash)) {
                                      ranges.push('[' + mag.min + '—' + mag.max + ']');
                                    }
                                  }
                                }

                                if (modObj.name) {
                                  affixNames.push(modObj.name);
                                }

                                if (modObj.tier) {
                                  const t = modObj.tier;
                                  if (t && t.startsWith && t.startsWith('P')) {
                                    affixTypes.push('prefix');
                                  } else if (t && t.startsWith && t.startsWith('S')) {
                                    affixTypes.push('suffix');
                                  }
                                }
                              }
                            }

                            const tierLabel = tiers.join(' + ');
                            const rangeLabel = ranges.join(' + ');
                            const primaryAffixType = affixTypes.length > 0 ? affixTypes[0] : '';

                            modsDetailed.push({
                              text: r.item.fracturedMods[i],
                              type: 'fractured',
                              tier: tierLabel,
                              range: rangeLabel,
                              affix: primaryAffixType,
                              affixName: affixNames.join(' + ')
                            });
                          }
                        }

                        // Crafted mods - resolve via extended.hashes.crafted -> extended.mods.crafted
                        if (r.item && r.item.craftedMods) {
                          const hashesList = (hashesObj && Array.isArray(hashesObj.crafted)) ? hashesObj.crafted : null;

                          for (let i = 0; i < r.item.craftedMods.length; i++) {
                            let tiers = [];
                            let ranges = [];
                            let affixTypes = [];
                            let affixNames = [];

                            let statHash = null;
                            const modIndices = [];
                            if (hashesList && hashesList[i]) {
                              const entry = hashesList[i];
                              if (Array.isArray(entry)) {
                                statHash = entry[0];
                                if (entry.length > 1 && Array.isArray(entry[1])) {
                                  modIndices.push(...entry[1]);
                                }
                              }
                            }

                            if (modIndices.length === 0) {
                              modIndices.push(i);
                            }

                            for (const idx of modIndices) {
                              let modObj = null;
                              if (extMods && extMods.crafted) {
                                if (Array.isArray(extMods.crafted)) {
                                  modObj = extMods.crafted[idx];
                                } else if (typeof extMods.crafted === 'object' && idx in extMods.crafted) {
                                  modObj = extMods.crafted[idx];
                                }
                              }

                              if (modObj) {
                                if (modObj.tier) {
                                  tiers.push(modObj.tier);
                                }

                                if (modObj.magnitudes && modObj.magnitudes.length > 0) {
                                  for (const mag of modObj.magnitudes) {
                                    if (mag.min != null && mag.max != null && (!statHash || mag.hash === statHash)) {
                                      ranges.push('[' + mag.min + '—' + mag.max + ']');
                                    }
                                  }
                                }

                                if (modObj.name) {
                                  affixNames.push(modObj.name);
                                }

                                if (modObj.tier) {
                                  const t = modObj.tier;
                                  if (t && t.startsWith && t.startsWith('P')) {
                                    affixTypes.push('prefix');
                                  } else if (t && t.startsWith && t.startsWith('S')) {
                                    affixTypes.push('suffix');
                                  }
                                }
                              }
                            }

                            const tierLabel = tiers.join(' + ');
                            const rangeLabel = ranges.join(' + ');
                            const primaryAffixType = affixTypes.length > 0 ? affixTypes[0] : '';

                            modsDetailed.push({
                              text: r.item.craftedMods[i],
                              type: 'crafted',
                              tier: tierLabel,
                              range: rangeLabel,
                              affix: primaryAffixType,
                              affixName: affixNames.join(' + ')
                            });
                          }
                        }

                        // Determine available buttons from API response
                        const hasDirectButton = !!(r.listing && (r.listing.hideout_token || r.listing.whisper));
                        const isHideout = !!(r.listing && r.listing.hideout_token);

                        // Extract item properties and requirements
                        const itemProperties = r.item && r.item.properties ? r.item.properties : [];
                        const itemRequirements = r.item && r.item.requirements ? r.item.requirements : [];

                        items.push({
                          id: r.id,
                          name: nm,
                          price: price,
                          priceAmount: priceAmount,
                          priceCurrency: priceCurrency,
                          currencyIcon: currencyIcon,
                          seller: sellerName,
                          character: characterName,
                          online: isOnline,
                          status: accountStatus,
                          whisper: whisperMsg,
                          url: url,
                          mods: ([]).concat(r.item && r.item.implicitMods || [], r.item && r.item.explicitMods || [], r.item && r.item.enchantMods || [], r.item && r.item.fracturedMods || [], r.item && r.item.craftedMods || []).filter(function(x) { return !!x; }).slice(0, 10),
                          modsDetailed: modsDetailed.slice(0, 10),
                          props: {
                            ilvl: r.item && r.item.ilvl,
                            quality: r.item && r.item.quality,
                            properties: itemProperties,
                            requirements: itemRequirements
                          },
                          icon: (r.item && r.item.icon) || '',
                          availableButtons: {
                            hideout: isHideout,
                            whisper: !isHideout && hasDirectButton
                          }
                        });
                      } catch (e) {}
                    }
                    if (items.length) {
                      window.postMessage({ type: 'POE_LIVE_ITEMS', payload: items }, '*');
                    }
                  }
                } catch (e) {}
                return res;
              });
            }
          });
        }
      } catch (e) {}
    })();`;
    (document.head || document.documentElement || document).appendChild(script);
    script.remove();
  } catch (e) {}
}

try { 
  injectShim(); 
} catch (err) {}
window.addEventListener('DOMContentLoaded', () => { 
  try { 
    injectShim(); 
  } catch (err) {}
}, { once: true });

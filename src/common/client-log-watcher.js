const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * Watches Path of Exile Client.txt file for new whispers
 */
class ClientLogWatcher extends EventEmitter {
  constructor() {
    super();
    this.clientPath = null;
    this.watcher = null;
    this.fileHandle = null;
    this.lastPosition = 0;
    this.isWatching = false;
    this.checkInterval = null;
    
    // Regex patterns for parsing client log chat lines
    this.CLIENT_MESSAGE_REGEX = /((?<date>\d{4}\/\d{2}\/\d{2}) (?<time>\d{2}:\d{2}:\d{2}))?.*\] (?<message>.+)/;
    this.CLIENT_WHISPER_REGEX = /@(?<messageType>От кого|\S+) (?<guildName><.+>)? ?(?<playerName>[^:]+):(\s+)(?<message>.+)/;
    
    // Language-specific patterns for detecting incoming/outgoing
    // English: "to" = outgoing, "from" = incoming
    // Russian: "кому" = outgoing, "от кого" = incoming
    // etc.
    this.incomingTags = new Set(['from', 'de', 'von', 'от кого', '來自', 'para', 'à', '宛先', 'ถึง', 'para']);
    this.outgoingTags = new Set(['to', 'à', 'an', 'кому', '向', 'para', 'à', '宛先', 'ถึง', 'para']);
    
    this.LEVEL_UP_REGEXES = [
      // Example: ": dfvvqvds (Witch) is now level 2"
      /^\s*:\s*(?<character>[^()]+)\s*\((?<class>[^)]+)\)\s*is now level\s*(?<level>\d+)/i,
      /you have reached level (?<level>\d+)/i,
      /you have advanced to level (?<level>\d+)/i,
      /you have attained level (?<level>\d+)/i,
      /you are now level (?<level>\d+)/i
    ];
    this.CHARACTER_ACTIVE_REGEXES = [
      // Example: ": MyChar (Witch) has joined the area."
      /^\s*:\s*(?<character>[^()]+)\s*\((?<class>[^)]+)\)\s*has joined the area\.?$/i,
      // Example: ": MyChar has joined the area."
      /^\s*:\s*(?<character>[^:]+?)\s*has joined the area\.?$/i
    ];
    this.LOGGED_OUT_REGEX = /^\s*=+\s*logged out\s*=+\s*$/i;
    this.lastLevel = null;
    this.lastCharacterName = null;
    this.lastCharacterEventName = null;
    this.allowedCharacterNames = null;

    // Trade detection keywords for multilingual whisper formats
    // These are the key phrases that indicate a trade whisper
    this.tradeIndicators = [
      // English
      'like to buy', 'i\'d like to buy', 'i would like to buy', 'wtb',
      // French
      't\'acheter', 'souhaiterais t\'acheter', 'voudrais t\'acheter',
      // German
      'ich möchte',
      // Spanish
      'comprar tu', 'quisiera comprar', 'me gustaría comprar',
      // Portuguese
      'eu gostaria de comprar', 'gostaria de comprar',
      // Russian
      'хочу купить у вас',
      // Chinese
      '我想購買',
      // Japanese
      'を購入したいです',
      // Korean
      '올려놓은', '구매하고 싶습니다',
      // Thai
      'เราต้องการจะชื้อของคุณ'
    ];
    
    // Trade parsing patterns for common whisper formats
    // English patterns (most common) - order matters! More specific patterns first
    this.tradePatterns = [
      // Pattern 1: Full format with stash tab and position
      /((Hi, )?(I would|I'd) like to buy your|wtb) (?<itemName>.+?) (listed for|for my) ((?<priceQuantity>\d+((\.|,)\d+)?) (?<priceType>.+?)) in (?<league>.+?) \(stash tab \\?"(?<stashtabName>.+?)"; position: left (?<stashX>\d+), top (?<stashY>\d+)\)\.?(?<bonusText>.*)?/i,
      // Pattern 2: With stash tab and position, no price
      /((Hi, )?(I would|I'd) like to buy your|wtb) (?<itemName>.+?) in (?<league>.+?) \(stash tab \\?"(?<stashtabName>.+?)"; position: left (?<stashX>\d+), top (?<stashY>\d+)\)\.?(?<bonusText>.*)?/i,
      // Pattern 3: With price, no stash info
      /((Hi, )?(I would|I'd) like to buy your|wtb) (?<itemName>.+?) (listed for|for my) ((?<priceQuantity>\d+((\.|,)\d+)?) (?<priceType>.+?)) in (?<league>.+?)\.?(?<bonusText>.*)?/i,
      // Pattern 4: Simple - just item name and league
      /((Hi, )?(I would|I'd) like to buy your|wtb) (?<itemName>.+?) in (?<league>.+?)\.?(?<bonusText>.*)?/i,
      // Pattern 5: Bulk trade format with item quantity
      /Hi, I'd like to buy your ((?<itemQuantity>\d+((\.|,)\d+)?) (?<itemName>.+?)) for my ((?<priceQuantity>\d+((\.|,)\d+)?) (?<priceType>.+?)) in (?<league>.+?)\./i
    ];
    
    // Currency icon mapping - same as in live-preload.js
    this.currencyIconMap = {
      'chaos': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
      'chaos orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
      'divine': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
      'divine orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
      'exalted': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png',
      'exalted orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png',
      'mirror': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MX1d/7111e35254/CurrencyDuplicate.png',
      'mirror of kalandra': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MX1d/7111e35254/CurrencyDuplicate.png',
      'alchemy': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlVG9SYXJlIiwic2NhbGUiOjF9XQ/9817b9b70c/CurrencyUpgradeToRare.png',
      'orb of alchemy': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlVG9SYXJlIiwic2NhbGUiOjF9XQ/9817b9b70c/CurrencyUpgradeToRare.png',
      'alteration': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxNYWdpYyIsInNjYWxlIjoxfV0/88e4f67b0a/CurrencyRerollMagic.png',
      'orb of alteration': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxNYWdpYyIsInNjYWxlIjoxfV0/88e4f67b0a/CurrencyRerollMagic.png',
      'chromatic': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRDb2xvdXJzIiwic2NhbGUiOjF9XQ/c7ece1f0b0/CurrencyRerollSocketColours.png',
      'chromatic orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRDb2xvdXJzIiwic2NhbGUiOjF9XQ/c7ece1f0b0/CurrencyRerollSocketColours.png',
      'jewellers': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXROdW1iZXJzIiwic2NhbGUiOjF9XQ/275c8d09d3/CurrencyRerollSocketNumbers.png',
      'jeweller\'s orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXROdW1iZXJzIiwic2NhbGUiOjF9XQ/275c8d09d3/CurrencyRerollSocketNumbers.png',
      'fusing': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRMaW5rcyIsInNjYWxlIjoxfV0/ee65d31e75/CurrencyRerollSocketLinks.png',
      'orb of fusing': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRMaW5rcyIsInNjYWxlIjoxfV0/ee65d31e75/CurrencyRerollSocketLinks.png',
      'vaal': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lWYWFsIiwic2NhbGUiOjF9XQ/2fb6e0089f/CurrencyVaal.png',
      'vaal orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lWYWFsIiwic2NhbGUiOjF9XQ/2fb6e0089f/CurrencyVaal.png',
      'regal': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlTWFnaWNUb1JhcmUiLCJzY2FsZSI6MX1d/c6b68437cd/CurrencyUpgradeMagicToRare.png',
      'regal orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lVcGdyYWRlTWFnaWNUb1JhcmUiLCJzY2FsZSI6MX1d/c6b68437cd/CurrencyUpgradeMagicToRare.png',
      'regret': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lQYXNzaXZlUmVmdW5kIiwic2NhbGUiOjF9XQ/7e3b8c2683/CurrencyPassiveRefund.png',
      'orb of regret': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lQYXNzaXZlUmVmdW5kIiwic2NhbGUiOjF9XQ/7e3b8c2683/CurrencyPassiveRefund.png',
      'scour': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lDb252ZXJ0VG9Ob3JtYWwiLCJzY2FsZSI6MX1d/e34e6c8ba5/CurrencyConvertToNormal.png',
      'orb of scouring': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lDb252ZXJ0VG9Ob3JtYWwiLCJzY2FsZSI6MX1d/e34e6c8ba5/CurrencyConvertToNormal.png',
      'blessed': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lJbXByaW50Iiwic2NhbGUiOjF9XQ/afd4b7b7f5/CurrencyImprint.png',
      'blessed orb': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lJbXByaW50Iiwic2NhbGUiOjF9XQ/afd4b7b7f5/CurrencyImprint.png',
      'gcp': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lHZW1RdWFsaXR5Iiwic2NhbGUiOjF9XQ/5eb318f69f/CurrencyGemQuality.png',
      'gemcutter\'s prism': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lHZW1RdWFsaXR5Iiwic2NhbGUiOjF9XQ/5eb318f69f/CurrencyGemQuality.png'
    };
  }

  extractClientMessage(line) {
    if (!line) return null;
    const messageMatch = line.match(this.CLIENT_MESSAGE_REGEX);
    if (!messageMatch) return null;
    const fullMessage = messageMatch.groups?.message;
    const date = messageMatch.groups?.date;
    const time = messageMatch.groups?.time;
    if (!fullMessage || !date || !time) return null;
    return { fullMessage, date, time };
  }

  bootstrapCharacterState() {
    if (!this.clientPath) return;
    const MAX_BOOTSTRAP_BYTES = 2 * 1024 * 1024;

    try {
      const stats = fs.statSync(this.clientPath);
      if (!stats.size) return;

      const startPos = Math.max(0, stats.size - MAX_BOOTSTRAP_BYTES);
      const length = stats.size - startPos;
      if (length <= 0) return;

      const fd = fs.openSync(this.clientPath, 'r');
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, buffer.length, startPos);
      fs.closeSync(fd);

      const content = buffer.toString('utf8').replace(/\0/g, '');
      const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) return;

      // Restrict inference to the latest game session when possible.
      let sessionStartIndex = 0;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const parsed = this.extractClientMessage(lines[i]);
        if (!parsed) continue;
        if (/\[STARTUP\]\s+Game Start/i.test(parsed.fullMessage)) {
          sessionStartIndex = i;
          break;
        }
      }

      let inferred = null;
      for (let i = lines.length - 1; i >= sessionStartIndex; i -= 1) {
        const parsed = this.extractClientMessage(lines[i]);
        if (!parsed) continue;

        const characterState = this.parseCharacterState(parsed.fullMessage);
        if (characterState?.state === 'logout') {
          break;
        }
        if (characterState?.state === 'active' && characterState.characterName) {
          inferred = {
            characterName: characterState.characterName,
            className: characterState.className || null,
            date: parsed.date,
            time: parsed.time,
            raw: lines[i]
          };
          break;
        }

        const levelInfo = this.parseLevelUp(parsed.fullMessage);
        if (levelInfo?.level) {
          this.lastLevel = levelInfo.level;
          if (levelInfo.characterName) {
            this.lastCharacterName = levelInfo.characterName;
            inferred = {
              characterName: levelInfo.characterName,
              className: levelInfo.className || null,
              date: parsed.date,
              time: parsed.time,
              raw: lines[i]
            };
            break;
          }
        }
      }

      if (inferred?.characterName) {
        this.lastCharacterEventName = inferred.characterName;
        this.emit('character', {
          state: 'active',
          characterName: inferred.characterName,
          className: inferred.className,
          date: inferred.date,
          time: inferred.time,
          timestamp: Date.now(),
          raw: inferred.raw,
          bootstrap: true
        });
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Check if a whisper message is a trade whisper
   * @param {string} message - The whisper message
   * @returns {boolean} - True if it's a trade whisper
   */
  isTradeWhisper(message) {
    if (!message) return false;
    
    const messageLower = message.toLowerCase();
    
    // Check if message contains any trade indicator
    for (const indicator of this.tradeIndicators) {
      if (messageLower.includes(indicator.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Parse trade details from a trade whisper message
   * @param {string} message - The whisper message
   * @returns {object|null} - Trade details or null if parsing fails
   */
  parseTradeDetails(message) {
    if (!message) return null;
    
    // Try each pattern until one matches
    for (const pattern of this.tradePatterns) {
      const match = message.match(pattern);
      if (match && match.groups) {
        const groups = match.groups;
        
        // Clean and extract values
        const itemName = groups.itemName ? groups.itemName.trim() : null;
        const itemQuantity = groups.itemQuantity ? this.cleanInt(groups.itemQuantity) : 1;
        const priceQuantity = groups.priceQuantity ? this.cleanDouble(groups.priceQuantity) : null;
        const priceType = groups.priceType ? groups.priceType.trim() : null;
        const league = groups.league ? groups.league.trim() : null;
        const stashTabName = groups.stashtabName ? groups.stashtabName.trim() : null;
        const stashX = groups.stashX ? this.cleanInt(groups.stashX) : null;
        const stashY = groups.stashY ? this.cleanInt(groups.stashY) : null;
        
        if (itemName) {
          // Map currency name to icon URL
          const currencyIcon = this.getCurrencyIcon(priceType);
          
          return {
            itemName: itemName,
            itemQuantity: itemQuantity,
            priceQuantity: priceQuantity,
            priceType: priceType,
            currencyIcon: currencyIcon,
            league: league,
            stashTabName: stashTabName,
            stashX: stashX,
            stashY: stashY
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Parse a level-up message
   * @param {string} message - The full client message
   * @returns {number|null} - Level or null if no match
   */
  parseLevelUp(message) {
    if (!message) return null;
    for (const regex of this.LEVEL_UP_REGEXES) {
      const match = message.match(regex);
      const rawLevel = match?.groups?.level || match?.[1];
      const level = this.cleanInt(rawLevel);
      if (level <= 0) continue;

      const characterName = match?.groups?.character?.trim() || null;
      const className = match?.groups?.class?.trim() || null;

      // Trust explicit in-game system lines that include class, even when
      // the character is not yet present in the cached account character list.
      const hasExplicitClass = Boolean(className);
      if (this.allowedCharacterNames && characterName && !hasExplicitClass) {
        const normalized = characterName.toLowerCase();
        if (!this.allowedCharacterNames.has(normalized)) {
          continue;
        }
      }

      return { level, characterName, className };
    }
    return null;
  }

  parseCharacterState(message) {
    if (!message) return null;

    if (this.LOGGED_OUT_REGEX.test(message)) {
      return { state: 'logout', characterName: null, className: null };
    }

    for (const regex of this.CHARACTER_ACTIVE_REGEXES) {
      const match = message.match(regex);
      const characterName = match?.groups?.character?.trim() || null;
      const className = match?.groups?.class?.trim() || null;
      if (!characterName) continue;

      // The "has joined the area" line without class can also match other players.
      // Only trust it when we can validate against known account character names.
      if (!className && !this.allowedCharacterNames) {
        continue;
      }

      // Trust explicit class-bearing join lines from Client.txt for newly
      // created characters that may not be in the API character cache yet.
      const hasExplicitClass = Boolean(className);
      if (this.allowedCharacterNames && !hasExplicitClass) {
        const normalized = characterName.toLowerCase();
        if (!this.allowedCharacterNames.has(normalized)) {
          continue;
        }
      }

      return { state: 'active', characterName, className };
    }

    return null;
  }

  setAllowedCharacterNames(names) {
    if (!Array.isArray(names) || names.length === 0) {
      this.allowedCharacterNames = null;
      return;
    }
    const normalized = names
      .map((name) => (typeof name === 'string' ? name.trim().toLowerCase() : ''))
      .filter(Boolean);
    this.allowedCharacterNames = normalized.length > 0 ? new Set(normalized) : null;
  }

  /**
   * Clean integer value (remove commas, parse)
   * @param {string} text - Text to parse
   * @returns {number} - Parsed integer or 0
   */
  cleanInt(text) {
    if (!text) return 0;
    try {
      return parseInt(text.replace(/,/g, ''), 10);
    } catch {
      return 0;
    }
  }

  /**
   * Get currency icon URL from currency name
   * @param {string} currencyName - Currency name (e.g., "Chaos Orb", "divine")
   * @returns {string|null} - Icon URL or null if not found
   */
  getCurrencyIcon(currencyName) {
    if (!currencyName) return null;
    const key = currencyName.toLowerCase().trim();
    return this.currencyIconMap[key] || null;
  }

  /**
   * Clean double value (handle commas/dots, parse)
   * @param {string} text - Text to parse
   * @returns {number} - Parsed double or 0
   */
  cleanDouble(text) {
    if (!text) return 0;
    try {
      // Replace comma with dot for decimal parsing
      const cleaned = text.replace(/,/g, '.');
      return parseFloat(cleaned);
    } catch {
      return 0;
    }
  }

  /**
   * Start watching the Client.txt file
   * @param {string} clientPath - Full path to Client.txt file
   */
  start(clientPath) {
    if (this.isWatching) {
      this.stop();
    }

    if (!clientPath || !fs.existsSync(clientPath)) {
      this.emit('error', new Error(`Client.txt file not found: ${clientPath}`));
      return;
    }

    this.clientPath = clientPath;
    this.isWatching = true;
    
    // Get initial file size
    try {
      const stats = fs.statSync(clientPath);
      this.lastPosition = stats.size;
    } catch (err) {
      this.emit('error', err);
      return;
    }

    // Watch for file changes
    this.watcher = fs.watch(clientPath, (eventType) => {
      if (eventType === 'change') {
        this.checkForNewLines();
      }
    });

    // Also poll periodically (more reliable than fs.watch on Windows)
    this.checkInterval = setInterval(() => {
      this.checkForNewLines();
    }, 250); // Polling fallback interval for reliable Windows file watching

    this.bootstrapCharacterState();
    this.emit('started', clientPath);
  }

  /**
   * Stop watching the file
   */
  stop() {
    this.isWatching = false;
    this.lastLevel = null;
    this.lastCharacterName = null;
    this.lastCharacterEventName = null;
    
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.fileHandle) {
      this.fileHandle.close();
      this.fileHandle = null;
    }
    
    this.emit('stopped');
  }

  /**
   * Check for new lines in the file
   */
  checkForNewLines() {
    if (!this.isWatching || !this.clientPath) return;

    try {
      const stats = fs.statSync(this.clientPath);
      const currentSize = stats.size;

      // File was truncated or rotated
      if (currentSize < this.lastPosition) {
        this.lastPosition = 0;
        this.lastLevel = null;
      }

      // No new content
      if (currentSize === this.lastPosition) {
        return;
      }

      // Read new content
      const fd = fs.openSync(this.clientPath, 'r');
      const buffer = Buffer.alloc(currentSize - this.lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf8');
      const lines = newContent.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          this.parseLine(line.trim());
        }
      }

      this.lastPosition = currentSize;
    } catch (err) {
      // File might be locked or deleted
      if (err.code !== 'ENOENT') {
        this.emit('error', err);
      }
    }
  }

  /**
   * Parse a line from Client.txt
   */
  parseLine(line) {
    const parsed = this.extractClientMessage(line);
    if (!parsed) return;
    const { fullMessage, date, time } = parsed;

    // Check if it's a whisper (starts with @)
    if (fullMessage[0] === '@') {
      const whisperMatch = fullMessage.match(this.CLIENT_WHISPER_REGEX);
      if (whisperMatch) {
        const messageType = whisperMatch.groups?.messageType?.toLowerCase();
        const playerName = whisperMatch.groups?.playerName;
        const guildName = whisperMatch.groups?.guildName;
        const message = whisperMatch.groups?.message;

        if (!messageType || !playerName || !message) return;

        // Determine if incoming or outgoing
        let whisperType = null;
        if (this.incomingTags.has(messageType)) {
          whisperType = 'incoming';
        } else if (this.outgoingTags.has(messageType)) {
          whisperType = 'outgoing';
        } else {
          // Try to detect by common patterns
          if (messageType.includes('from') || messageType.includes('de') || messageType.includes('von')) {
            whisperType = 'incoming';
          } else if (messageType.includes('to') || messageType.includes('à') || messageType.includes('an')) {
            whisperType = 'outgoing';
          }
        }

        if (whisperType) {
          // Only emit trade whispers (filter out non-trade whispers)
          if (this.isTradeWhisper(message)) {
            // Parse trade details from the message
            const tradeDetails = this.parseTradeDetails(message);
            
            this.emit('whisper', {
              type: whisperType,
              playerName: playerName.trim(),
              guildName: guildName ? guildName.replace(/[<>]/g, '') : null,
              message: message.trim(),
              date: date,
              time: time,
              timestamp: Date.now(),
              raw: line,
              // Trade details (if parsed successfully)
              itemName: tradeDetails?.itemName || null,
              itemQuantity: tradeDetails?.itemQuantity || 1,
              priceQuantity: tradeDetails?.priceQuantity || null,
              priceType: tradeDetails?.priceType || null,
              currencyIcon: tradeDetails?.currencyIcon || null,
              league: tradeDetails?.league || null,
              stashTabName: tradeDetails?.stashTabName || null,
              stashX: tradeDetails?.stashX || null,
              stashY: tradeDetails?.stashY || null
            });
          }
        }
      }
    }

    const levelInfo = this.parseLevelUp(fullMessage);
    if (levelInfo && levelInfo.level) {
      const sameLevel = levelInfo.level === this.lastLevel;
      const sameCharacter = !levelInfo.characterName || levelInfo.characterName === this.lastCharacterName;
      if (!sameLevel || !sameCharacter) {
        this.lastLevel = levelInfo.level;
        if (levelInfo.characterName) {
          this.lastCharacterName = levelInfo.characterName;
        }
        this.emit('level', {
          level: levelInfo.level,
          characterName: levelInfo.characterName,
          className: levelInfo.className,
          date,
          time,
          timestamp: Date.now(),
          raw: line
        });
      }
    }

    const characterState = this.parseCharacterState(fullMessage);
    if (characterState) {
      if (characterState.state === 'logout') {
        this.lastCharacterEventName = null;
        this.emit('character', {
          state: 'logout',
          characterName: null,
          className: null,
          date,
          time,
          timestamp: Date.now(),
          raw: line
        });
        return;
      }

      const nextName = characterState.characterName || null;
      if (nextName && nextName !== this.lastCharacterEventName) {
        this.lastCharacterEventName = nextName;
        this.emit('character', {
          state: 'active',
          characterName: nextName,
          className: characterState.className || null,
          date,
          time,
          timestamp: Date.now(),
          raw: line
        });
      }
    }
  }
}

module.exports = ClientLogWatcher;


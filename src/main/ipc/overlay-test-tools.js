function createTestItem(index) {
  const currencyIconMap = {
    chaos: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
    divine: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
    exalted: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png',
  };

  const testItems = [
    {
      name: 'Phoenix Mitts Murder Mitts',
      price: '15 chaos',
      priceAmount: '15',
      priceCurrency: 'chaos',
      currencyIcon: currencyIconMap.chaos,
      seller: 'TestPlayer1',
      online: true,
      status: 'online',
      modsDetailed: [
        { text: '+32 to Evasion Rating', type: 'explicit', tier: 'P1', range: '[21-42]', affix: 'prefix' },
        { text: '+143 to maximum Life', type: 'explicit', tier: 'P1 + P1', range: '[24-28] + [115-129]', affix: 'prefix' },
        { text: 'Regenerate 41.1 Life per second', type: 'explicit', tier: 'S3', range: '[32.1-48]', affix: 'suffix' },
        { text: '0.37% of Physical Attack Damage Leeched as Life', type: 'explicit', tier: 'S1', range: '[0.2-0.4]', affix: 'suffix' },
      ],
    },
    {
      name: 'Mystic Shadows Iceberg Map',
      price: '1 chaos',
      priceAmount: '1',
      priceCurrency: 'chaos',
      currencyIcon: currencyIconMap.chaos,
      seller: 'TestPlayer2',
      online: true,
      status: 'online',
      modsDetailed: [
        { text: 'Area contains The Sacred Grove', type: 'implicit', tier: '', range: '', affix: '' },
        { text: 'Area has increased monster variety', type: 'explicit', tier: 'P1', range: '[3-3]', affix: 'prefix' },
        { text: '25% increased Magic Monsters', type: 'explicit', tier: 'S1', range: '[20-30]', affix: 'suffix' },
        { text: 'Monsters have 30% chance to Avoid Elemental Ailments', type: 'explicit', tier: 'S1', range: '[30-30]', affix: 'suffix' },
        { text: '20% increased Monster Movement Speed', type: 'explicit', tier: 'P1', range: '[15-20]', affix: 'prefix' },
        { text: '20% increased Monster Attack Speed', type: 'explicit', tier: 'P1', range: '[20-25]', affix: 'prefix' },
        { text: '25% increased Monster Cast Speed', type: 'explicit', tier: 'P1', range: '[20-25]', affix: 'prefix' },
        { text: 'Unique Boss has 25% increased Life', type: 'explicit', tier: 'P1', range: '[25-25]', affix: 'prefix' },
        { text: 'Unique Boss has 45% increased Area of Effect', type: 'explicit', tier: 'P1', range: '[45-45]', affix: 'prefix' },
        { text: 'Players have 15% less Accuracy Rating', type: 'explicit', tier: 'S1', range: '[-15--15]', affix: 'suffix' },
      ],
    },
    {
      name: 'Steel Ring of Rage',
      price: '50 chaos',
      priceAmount: '50',
      priceCurrency: 'chaos',
      currencyIcon: currencyIconMap.chaos,
      seller: 'TestPlayer3',
      online: true,
      status: 'online',
      modsDetailed: [
        { text: 'Adds 3 to 4 Physical Damage to Attacks', type: 'implicit', tier: '', range: '', affix: '' },
        { text: '+45 to Strength', type: 'explicit', tier: 'P2', range: '[38-42]', affix: 'prefix' },
        { text: '+72 to maximum Life', type: 'explicit', tier: 'P2', range: '[70-79]', affix: 'prefix' },
        { text: '48% increased Elemental Damage with Attack Skills', type: 'explicit', tier: 'S1', range: '[46-48]', affix: 'suffix' },
        { text: '+39% to Fire Resistance', type: 'explicit', tier: 'S2', range: '[36-41]', affix: 'suffix' },
      ],
    },
  ];

  const template = testItems[index % testItems.length];
  return {
    id: `test-item-${Date.now()}-${Math.random()}`,
    name: template.name,
    feedName: `Test Feed ${(index % testItems.length) + 1}`,
    price: template.price,
    priceAmount: template.priceAmount,
    priceCurrency: template.priceCurrency,
    currencyIcon: template.currencyIcon,
    seller: template.seller,
    character: template.seller.replace('Player', 'Char'),
    online: template.online !== undefined ? template.online : true,
    status: template.status || 'online',
    whisper: `@${template.seller} Hi, I would like to buy your ${template.name} listed for ${template.price}`,
    url: 'https://www.pathofexile.com/trade/',
    icon: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvUmluZ3MvUmluZzEzIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/e4732f6815/Ring13.png',
    mods: template.modsDetailed.map((m) => m.text),
    modsDetailed: template.modsDetailed,
    props: { ilvl: 75, quality: 20 },
    availableButtons: {
      hideout: false,
      whisper: true,
    },
  };
}

function createTestWhisper(index) {
  const currencyIconMap = {
    chaos: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
    divine: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MX1d/ec48896769/CurrencyModValues.png',
    exalted: 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MX1d/9c89730e81/CurrencyAddModToRare.png',
  };

  const testWhispers = [
    {
      type: 'incoming',
      playerName: 'TestPlayer1',
      guildName: 'TestGuild',
      message: 'Hi, I would like to buy your Phoenix Mitts Murder Mitts listed for 15 chaos in Standard (stash tab "Tab1"; position: left 5, top 3).',
      date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      time: new Date().toTimeString().split(' ')[0],
      itemName: 'Phoenix Mitts Murder Mitts',
      itemQuantity: 1,
      priceQuantity: 15,
      priceType: 'chaos',
      currencyIcon: currencyIconMap.chaos,
      league: 'Standard',
      stashTabName: 'Tab1',
      stashX: 5,
      stashY: 3,
    },
    {
      type: 'outgoing',
      playerName: 'TestPlayer2',
      guildName: null,
      message: 'Hi, I would like to buy your Mystic Shadows Iceberg Map listed for 1 chaos in Standard (stash tab "Tab2"; position: left 2, top 1).',
      date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      time: new Date().toTimeString().split(' ')[0],
      itemName: 'Mystic Shadows Iceberg Map',
      itemQuantity: 1,
      priceQuantity: 1,
      priceType: 'chaos',
      currencyIcon: currencyIconMap.chaos,
      league: 'Standard',
      stashTabName: 'Tab2',
      stashX: 2,
      stashY: 1,
    },
    {
      type: 'incoming',
      playerName: 'TestPlayer3',
      guildName: null,
      message: "Hi, I'd like to buy your Steel Ring of Rage listed for 50 chaos in Standard.",
      date: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      time: new Date().toTimeString().split(' ')[0],
      itemName: 'Steel Ring of Rage',
      itemQuantity: 1,
      priceQuantity: 50,
      priceType: 'chaos',
      currencyIcon: currencyIconMap.chaos,
      league: 'Standard',
    },
  ];

  const template = testWhispers[index % testWhispers.length];
  return {
    ...template,
    timestamp: Date.now(),
  };
}

function registerOverlayTestToolsIpc({
  ipcMain,
  logger,
  ensureOverlayWindow,
  getOverlayWindow,
  setOverlayVisible,
  updateOverlayMouse,
  forwardToOverlay,
}) {
  let testItemCounter = 0;
  let testWhisperCounter = 0;

  ipcMain.on('overlay:test', () => {
    logger.info('overlay:test:start');

    const overlayWindow = ensureOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      logger.warn('overlay:test:window-destroyed');
      return;
    }

    overlayWindow.show();
    overlayWindow.setIgnoreMouseEvents(false);
    setOverlayVisible(true);
    updateOverlayMouse();

    logger.info('overlay:test:window-shown');

    const sendTestData = () => {
      const win = getOverlayWindow();
      if (!win || win.isDestroyed()) {
        logger.warn('overlay:test:window-destroyed');
        return;
      }

      logger.info('overlay:test:sending-data');

      const testItem1 = createTestItem(0);
      const testItem2 = createTestItem(1);
      logger.info('overlay:test:sending', { testItems: [testItem1, testItem2] });
      win.webContents.send('poe-live:new-items', [testItem1, testItem2]);
      logger.info('overlay:test:items-sent');

      const testWhisper1 = createTestWhisper(0);
      const testWhisper2 = createTestWhisper(1);
      logger.info('overlay:test:sending-whispers', { testWhispers: [testWhisper1, testWhisper2] });
      win.webContents.send('overlay:new-whisper', testWhisper1);
      win.webContents.send('overlay:new-whisper', testWhisper2);
      logger.info('overlay:test:whispers-sent');

      logger.info('overlay:test:sent');
      testItemCounter = 2;
      testWhisperCounter = 2;
    };

    if (overlayWindow.webContents.isLoading()) {
      logger.info('overlay:test:waiting-for-load');
      overlayWindow.webContents.once('did-finish-load', () => {
        logger.info('overlay:test:load-complete');
        setTimeout(sendTestData, 500);
      });
    } else {
      logger.info('overlay:test:already-loaded');
      setTimeout(sendTestData, 500);
    }
  });

  ipcMain.on('overlay:addTestItem', () => {
    const overlayWindow = ensureOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlayWindow.show();

    setTimeout(() => {
      const win = getOverlayWindow();
      if (!win || win.isDestroyed()) return;
      const newItem = createTestItem(testItemCounter);
      testItemCounter += 1;
      logger.info('overlay:addTestItem:sending', { item: newItem });
      forwardToOverlay('poe-live:new-items', [newItem]);
      logger.info('overlay:addTestItem:sent');
    }, 100);
  });

  ipcMain.on('overlay:addTestWhisper', () => {
    const overlayWindow = ensureOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlayWindow.show();

    setTimeout(() => {
      const win = getOverlayWindow();
      if (!win || win.isDestroyed()) return;
      const newWhisper = createTestWhisper(testWhisperCounter);
      testWhisperCounter += 1;
      logger.info('overlay:addTestWhisper:sending', { whisper: newWhisper });
      win.webContents.send('overlay:new-whisper', newWhisper);
      logger.info('overlay:addTestWhisper:sent');
    }, 100);
  });
}

module.exports = {
  registerOverlayTestToolsIpc,
};

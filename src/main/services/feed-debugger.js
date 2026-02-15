function extractTradeEventChanges(payload) {
  const ids = []
    .concat(payload?.new || [])
    .concat(payload?.update || [])
    .concat(payload?.created || [])
    .concat(payload?.live || [])
    .filter((value) => typeof value === 'string');

  const removed = []
    .concat(payload?.gone || [])
    .concat(payload?.remove || [])
    .concat(payload?.deleted || [])
    .filter((value) => typeof value === 'string');

  return { ids, removed };
}

function parseQueryIdFromLiveUrl(liveUrl) {
  try {
    const match = /\/trade\/search\/[^/]+\/([^/]+)\/live/.exec(liveUrl);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function createFeedDebuggerService({
  logger,
  feedMeta,
  onTradeEventsObserved,
  forwardToOverlay,
}) {
  function setupFeedDebugger(feedWindow, liveUrl, feedInfo = {}) {
    const wc = feedWindow.webContents;
    const id = wc.id;
    const queryId = parseQueryIdFromLiveUrl(liveUrl);

    feedMeta.set(id, {
      liveUrl,
      queryId,
      feedId: feedInfo.id || '',
      feedName: feedInfo.name || '',
      feedUrl: feedInfo.url || liveUrl,
      window: feedWindow,
    });
    logger.info('feed:debugger:attach:start', { id, queryId, liveUrl, feedName: feedInfo.name });

    const dbg = wc.debugger;
    if (dbg.isAttached()) {
      logger.warn('feed:debugger:already-attached', { id });
      return;
    }

    try {
      dbg.attach('1.3');
      logger.info('feed:debugger:attached', { id });
    } catch (err) {
      logger.error('feed:debugger:attach-failed', { id, error: String(err) });
      return;
    }

    try {
      dbg.sendCommand('Network.enable');
      logger.info('feed:debugger:network-enabled', { id });
    } catch (err) {
      logger.error('feed:debugger:network-enable-failed', { id, error: String(err) });
    }

    try {
      dbg.sendCommand('Network.setCacheDisabled', { cacheDisabled: true });
      logger.info('feed:debugger:cache-disabled', { id });
    } catch (err) {
      logger.error('feed:debugger:cache-disable-failed', { id, error: String(err) });
    }

    dbg.on('message', (_event, method, params) => {
      if (method === 'Network.responseReceived') {
        try {
          const mime = params?.response?.mimeType;
          if (mime === 'text/event-stream') {
            logger.info('feed:es:response', { id, url: params?.response?.url });
          }
        } catch {}
      }

      if (method === 'Network.eventSourceMessageReceived') {
        try {
          const data = params?.data;
          let obj = null;
          try { obj = JSON.parse(data); } catch {}
          if (!obj || typeof obj !== 'object') return;

          const { ids, removed } = extractTradeEventChanges(obj);
          if (ids.length || removed.length) {
            onTradeEventsObserved();
          }
          if (removed.length) {
            forwardToOverlay('poe-live:removed', removed);
          }
        } catch {}
      }

      if (method === 'Network.webSocketFrameReceived') {
        const payload = params?.response?.payloadData;
        if (!payload || typeof payload !== 'string') return;

        let obj = null;
        try { obj = JSON.parse(payload); } catch {}
        if (!obj || typeof obj !== 'object') return;

        if (obj.result && typeof obj.result === 'string' && obj.result.startsWith('eyJ')) {
          onTradeEventsObserved();
          return;
        }

        const { ids, removed } = extractTradeEventChanges(obj);
        if (ids.length || removed.length) {
          onTradeEventsObserved();
        }
        if (removed.length) {
          forwardToOverlay('poe-live:removed', removed);
        }
      }
    });

    wc.on('destroyed', () => {
      try {
        if (dbg.isAttached()) dbg.detach();
      } catch {}
      feedMeta.delete(id);
      logger.info('feed:destroyed', { id });
    });
  }

  return {
    setupFeedDebugger,
  };
}

module.exports = {
  createFeedDebuggerService,
};

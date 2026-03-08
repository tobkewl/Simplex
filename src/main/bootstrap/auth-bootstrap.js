async function initializeAuthAndApiClient({
  app,
  logger,
  initializeAuth,
  requireAuth,
  BuildApiClient,
  apiBaseUrl,
  devLoginShortcutEnabled,
}) {
  logger.info('auth:initializing');

  try {
    const authService = await initializeAuth();
    logger.info('auth:initialized', {
      authenticated: authService.isAuthenticated(),
      username: authService.getUser()?.poeAccountName || authService.getUser()?.username || authService.getUser()?.name || null,
    });

    const authUser = authService.getUser();
    const hasUserIdentity = Boolean(
      authUser?.poeAccountId ||
      authUser?.poeAccountName ||
      authUser?.username ||
      authUser?.name
    );
    const isLegacyDevShortcutUser =
      authUser?.poeAccountId === 'dev-local' ||
      authUser?.poeAccountName === 'Local Dev';

    const staleReason =
      authService.isAuthenticated() && !hasUserIdentity
        ? 'authenticated session has no user identity'
        : authService.isAuthenticated() && isLegacyDevShortcutUser && !devLoginShortcutEnabled
          ? 'legacy dev shortcut session detected while shortcut is disabled'
          : null;

    if (staleReason) {
      logger.warn('auth:stale-session-detected', { reason: staleReason });
      if (typeof authService.clearSession === 'function') {
        authService.clearSession();
        logger.info('auth:stale-session-cleared', { reason: staleReason });
      }
    }

    if (!authService.isAuthenticated()) {
      logger.info('auth:not-authenticated', { message: 'Showing login window' });
      const isLoggedIn = await requireAuth();

      if (!isLoggedIn) {
        logger.info('auth:required', { message: 'Login window closed. Quitting app.' });
        app.quit();
        return null;
      }

      logger.info('auth:login-success', {
        username: authService.getUser()?.poeAccountName || authService.getUser()?.username || authService.getUser()?.name || null,
      });
    } else {
      logger.info('auth:already-authenticated', {
        username: authService.getUser()?.poeAccountName || authService.getUser()?.username || authService.getUser()?.name || null,
      });
    }

    const apiClient = new BuildApiClient({
      baseUrl: apiBaseUrl,
      authService,
    });
    logger.info('api:client-initialized');

    Promise.resolve()
      .then(() => apiClient.getNetworthCurrencyExchangeRates?.({ realm: 'pc' }))
      .then((payload) => {
        if (!payload || typeof payload !== 'object') return;
        const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
        logger.info('networth:currency-exchange:prefetch', {
          available: payload.available === true,
          realm: typeof payload.realm === 'string' ? payload.realm : 'pc',
          snapshots: snapshots.length,
          syncedAt: Number.isFinite(Number(payload.syncedAt)) ? Number(payload.syncedAt) : null,
        });
      })
      .catch((error) => {
        logger.warn('networth:currency-exchange:prefetch-failed', {
          error: String(error?.message || error),
        });
      });

    return { authService, apiClient };
  } catch (err) {
    logger.error('auth:initialization-failed', { error: String(err), stack: err?.stack });
    app.quit();
    return null;
  }
}

module.exports = {
  initializeAuthAndApiClient,
};

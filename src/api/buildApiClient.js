/**
 * API client for communication with the build API.
 * Use this client in your Electron app to fetch build data.
 */

const fetch = require('node-fetch')
const REQUEST_TIMEOUT_MS = 10000

function resolveAuthApiBaseUrl() {
  if (process.env.SIMPLEX_AUTH_API_BASE_URL) {
    return process.env.SIMPLEX_AUTH_API_BASE_URL.replace(/\/$/, '')
  }
  if (process.env.SIMPLEX_AUTH_BASE_URL) {
    return `${process.env.SIMPLEX_AUTH_BASE_URL.replace(/\/$/, '')}/api/client`
  }
  if (process.env.SIMPLEX_PUBLIC_BASE_URL) {
    return `${process.env.SIMPLEX_PUBLIC_BASE_URL.replace(/\/$/, '')}/api/client`
  }
  return 'https://simplex.gg/api/client'
}

class BuildApiClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.API_BASE_URL || 'https://simplex.gg/api/client'
    this.authApiBaseUrl = config.authApiBaseUrl || resolveAuthApiBaseUrl()
    this.authService = config.authService || null
  }

  /**
   * Prefer the app API base for OAuth-backed PoE calls so local dev uses local routes/logging.
   * In production both bases usually resolve to simplex.gg/api/client anyway.
   * @private
   */
  getOAuthApiBaseUrl() {
    return this.baseUrl || this.authApiBaseUrl
  }

  /**
   * Get the user ID of the signed-in user.
   * @private
   */
  getUserId() {
    return this.authService?.getUserId() || null
  }

  /**
   * Make an API request with the correct headers.
   * @private
   */
  async request(endpoint, options = {}, targetBaseUrl = null) {
    const primaryBaseUrl = targetBaseUrl || this.baseUrl
    const primaryUrl = `${primaryBaseUrl}${endpoint}`
    const makeHeaders = () => {
      const accessToken = this.authService?.getAccessToken?.()
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      }
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }
      return headers
    }

    const buildUrl = (baseUrl) => `${baseUrl}${endpoint}`
    const makeFetchOptions = () => ({
      ...options,
      headers: makeHeaders(),
      timeout: typeof options.timeout === 'number' ? options.timeout : REQUEST_TIMEOUT_MS,
    })

    try {
      let activeBaseUrl = primaryBaseUrl
      let url = primaryUrl
      let response = await fetch(url, makeFetchOptions())

      // If broker API does not have this endpoint/method deployed yet, transparently fall back to local API.
      if ((response.status === 404 || response.status === 405) && primaryBaseUrl !== this.baseUrl) {
        activeBaseUrl = this.baseUrl
        url = buildUrl(activeBaseUrl)
        response = await fetch(url, makeFetchOptions())
      }

      if (response.status === 401 && this.authService?.refreshSession) {
        const refreshed = await this.authService.refreshSession().catch(() => false)
        if (refreshed) {
          response = await fetch(url, makeFetchOptions())
        }
      }

      // Check rate limiting headers
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining')
      const rateLimitReset = response.headers.get('X-RateLimit-Reset')

      if (rateLimitRemaining !== null && parseInt(rateLimitRemaining) < 10) {
        console.warn(`Rate limit warning: ${rateLimitRemaining} requests remaining until ${rateLimitReset}`)
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const message = [
          error?.error || `API request failed with status ${response.status}`,
          error?.details ? String(error.details) : null,
        ].filter(Boolean).join(': ')
        throw new Error(message)
      }

      return await response.json()
    } catch (error) {
      // Check if it's a network error (server not running)
      const message = String(error?.message || '')
      if (
        message.includes('fetch failed') ||
        message.includes('network timeout') ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT'
      ) {
        console.error('Cannot connect to API server at:', primaryUrl)
        throw new Error(`Cannot connect to website server. Make sure the dev server is running at ${primaryBaseUrl}`)
      }
      console.error('API request failed:', error)
      throw error
    }
  }

  /**
   * Fetch all builds.
   * @param {Object} options - Query options
   * @param {string} options.userId - Filter by user ID (optional, uses signed-in user automatically)
   * @param {number} options.limit - Result limit (default: 50)
   * @param {number} options.offset - Result offset (default: 0)
   * @returns {Promise<{builds: Array, pagination: Object}>}
   */
  async getBuilds(options = {}) {
    let { userId, limit = 50, offset = 0 } = options

    // If no userId is provided, use the signed-in user.
    if (!userId && this.authService) {
      userId = this.getUserId()
    }

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })

    if (userId) {
      params.append('userId', userId)
    }

    return this.request(`/builds?${params}`)
  }

  /**
   * Fetch a specific build with all details.
   * @param {string} buildId - Build UUID
   * @returns {Promise<Object>} Build data with items, skillBlocks, trees, nodes, sequences, steps
   */
  async getBuild(buildId) {
    if (!buildId) {
      throw new Error('buildId is required')
    }

    return this.request(`/builds/${buildId}`)
  }

  /**
   * Fetch followed guides for the signed-in user.
   * @param {Object} options - Query options
   * @param {string} options.userId - User ID (optional, uses signed-in user automatically)
   * @param {number} options.limit - Result limit (default: 50)
   * @param {number} options.offset - Result offset (default: 0)
   * @returns {Promise<{builds: Array, pagination: Object}>}
   */
  async getFollowedGuides(options = {}) {
    let { userId, limit = 50, offset = 0 } = options

    if (!userId && this.authService) {
      userId = this.getUserId()
    }

    if (!userId) {
      throw new Error('userId is required to fetch followed guides')
    }

    const params = new URLSearchParams({
      userId,
      limit: limit.toString(),
      offset: offset.toString(),
    })

    return this.request(`/follows?${params}`)
  }

  /**
   * Follow or unfollow a guide/live build.
   * @param {string} buildId
   * @param {boolean} follow
   */
  async setGuideFollow(buildId, follow = true) {
    if (!buildId || typeof buildId !== 'string') {
      throw new Error('buildId is required')
    }
    return this.request('/follows', {
      method: 'POST',
      body: JSON.stringify({
        buildId,
        follow: follow !== false,
      }),
    })
  }

  /**
   * Fetch only the build items (gear) for a specific build.
   * @param {string} buildId - Build UUID
   * @returns {Promise<Array>} Array of build items
   */
  async getBuildItems(buildId) {
    const data = await this.getBuild(buildId)
    return data.items || []
  }

  /**
   * Fetch only the skill blocks for a specific build.
   * @param {string} buildId - Build UUID
   * @returns {Promise<Array>} Array of skill blocks
   */
  async getBuildSkills(buildId) {
    const data = await this.getBuild(buildId)
    return data.skillBlocks || []
  }

  /**
   * Fetch only passive tree data for a specific build.
   * @param {string} buildId - Build UUID
   * @returns {Promise<Array>} Array of trees and nodes
   */
  async getBuildTree(buildId) {
    const data = await this.getBuild(buildId)
    return {
      trees: data.trees || [],
      nodes: data.nodes || [],
    }
  }

  /**
   * Fetch only leveling sequences for a specific build.
   * @param {string} buildId - Build UUID
   * @returns {Promise<Array>} Array of sequences with steps
   */
  async getBuildSequences(buildId) {
    const data = await this.getBuild(buildId)
    return {
      sequences: data.sequences || [],
      steps: data.steps || [],
    }
  }

  /**
   * Fetch gear items by slug.
   * @param {string[]} slugs
   * @returns {Promise<{ items: Array }>}
   */
  async getGearItems(slugs = []) {
    const payload = {
      slugs: Array.isArray(slugs) ? slugs : [],
    }

    return this.request('/gear', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Start or resume a live build for a character + league.
   * @param {Object} payload
   * @param {string} payload.characterName
   * @param {string} payload.league
   * @param {string} payload.visibility
   */
  async startLiveBuild(payload = {}) {
    return this.request('/live-builds/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Capture a live build snapshot at a level.
   * @param {Object} payload
   */
  async captureLiveBuildLevel(payload = {}) {
    return this.request('/live-builds/capture', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Fetch live builds for the signed-in user.
   */
  async getLiveBuilds(options = {}) {
    const { limit = 50, offset = 0 } = options
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    return this.request(`/live-builds?${params}`)
  }

  /**
   * Fetch public live builds for discovery/following.
   */
  async getPublicLiveBuilds(options = {}) {
    const { limit = 100, offset = 0 } = options
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    return this.request(`/live-builds/public?${params}`)
  }

  /**
   * Fetch public guides for discovery/following.
   */
  async getPublicGuides(options = {}) {
    const { limit = 100, offset = 0 } = options
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    return this.request(`/guides/public?${params}`)
  }

  /**
   * Fetch a live build detail with levels.
   * @param {string} buildId
   */
  async getLiveBuild(buildId) {
    if (!buildId) throw new Error('buildId is required')
    return this.request(`/live-builds/${buildId}`)
  }

  /**
   * Update tracking state for a live build.
   * @param {string} buildId
   * @param {boolean} enabled
   */
  async setLiveBuildTracking(buildId, enabled) {
    if (!buildId) throw new Error('buildId is required')
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean')
    return this.request('/live-builds/tracking', {
      method: 'POST',
      body: JSON.stringify({ buildId, enabled }),
    })
  }

  /**
   * Fetch PoE character snapshot data (detail + passives) through the server-side token store.
   * @param {Object} payload
   * @param {string} payload.characterName
   * @param {string} [payload.realm]
   */
  async getLiveBuildSnapshot(payload = {}) {
    return this.request('/live-builds/snapshot', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, this.getOAuthApiBaseUrl())
  }

  /**
   * Fetch PoE character list via simplex.gg server-side OAuth.
   * @param {Object} options
   * @param {string} [options.realm]
   */
  async getPoeCharacters(options = {}) {
    const params = new URLSearchParams()
    if (typeof options.realm === 'string' && options.realm.trim()) {
      params.set('realm', options.realm.trim())
    }
    const query = params.toString()
    return this.request(`/poe/characters${query ? `?${query}` : ''}`, {}, this.getOAuthApiBaseUrl())
  }

  /**
   * Get server-side PoE OAuth status for the signed-in simplex account.
   */
  async getPoeOAuthStatus() {
    return this.request('/poe/status', {}, this.getOAuthApiBaseUrl())
  }

  /**
   * Proxy a PoE API call through simplex.gg server OAuth.
   * @param {string} endpoint
   * @param {Object} options
   * @param {string} [options.method]
   * @param {string|Object|null} [options.body]
   */
  async callPoeApi(endpoint, options = {}) {
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('endpoint is required')
    }
    const method = typeof options.method === 'string' ? options.method.toUpperCase() : 'GET'
    let body = options.body
    if (body && typeof body !== 'string') {
      body = JSON.stringify(body)
    }
    return this.request('/poe/proxy', {
      method: 'POST',
      body: JSON.stringify({
        endpoint,
        method,
        body: body || null,
      }),
    }, this.getOAuthApiBaseUrl())
  }
}

// Export for use in Electron
module.exports = BuildApiClient

// For CommonJS default export
module.exports.default = BuildApiClient

const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const fetch = require('node-fetch')
const { loadEnv } = require('../config/loadEnv')
const { randomUUID } = require('crypto')

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '==='.slice((payload.length + 3) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

const getTokenExpiryMs = (token) => {
  const payload = decodeJwtPayload(token)
  const exp = payload && typeof payload.exp === 'number' ? payload.exp : null
  if (!exp) return null
  return exp * 1000
}

// OAuth base URL resolution order:
// 1) SIMPLEX_AUTH_BASE_URL (explicit auth broker)
// 2) SIMPLEX_PUBLIC_BASE_URL (shared website host)
// 3) API_BASE_URL host fallback
// This keeps production auth traffic separate while still allowing local testing.
const resolveAuthBaseUrl = () => {
  if (process.env.SIMPLEX_AUTH_BASE_URL) {
    return process.env.SIMPLEX_AUTH_BASE_URL.replace(/\/$/, '')
  }
  if (process.env.SIMPLEX_PUBLIC_BASE_URL) {
    return process.env.SIMPLEX_PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/api\/client\/?$/, '')
  }
  return 'https://simplex.gg'
}

class AuthService {
  constructor() {
    this.baseUrl = null
    this.tokens = null
    this.user = null
    this.userId = null
    this.sessionFile = null
    this.rememberFile = null
    this.deviceIdFile = null
    this.rememberMe = true
    this.deviceId = null
    this.listeners = new Set()
    this.currentAuthEnv = null
  }

  async initialize() {
    loadEnv()

    this.baseUrl = resolveAuthBaseUrl()

    const userDataPath = process.env.SIMPLEX_USER_DATA_PATH || app.getPath('userData')

    this.sessionFile = path.join(userDataPath, 'session.json')
    this.rememberFile = path.join(userDataPath, 'auth-preferences.json')
    this.deviceIdFile = path.join(userDataPath, 'device-id.txt')

    this.rememberMe = this.loadRememberPreference()
    this.deviceId = this.loadDeviceId()

    if (this.rememberMe) {
      await this.loadSession()
    } else {
      this.clearSession()
    }

    if (this.isAuthenticated()) {
      await this.fetchUserProfile()
    }

    return this
  }

  async request(pathname, payload) {
    const url = `${this.baseUrl}${pathname}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    })
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      const message = data?.error || data?.message || text || `HTTP ${response.status}`
      throw new Error(message)
    }
    return data
  }

  loadDeviceId() {
    try {
      if (this.deviceIdFile && fs.existsSync(this.deviceIdFile)) {
        const existing = fs.readFileSync(this.deviceIdFile, 'utf-8').trim()
        if (existing) return existing
      }
    } catch (error) {
      console.error('Failed to load device ID:', error)
    }

    const id = randomUUID()
    try {
      fs.writeFileSync(this.deviceIdFile, id)
    } catch (error) {
      console.error('Failed to store device ID:', error)
    }
    return id
  }

  getDeviceInfo() {
    return {
      deviceId: this.deviceId,
      platform: process.platform,
      appVersion: app.getVersion(),
    }
  }

  async startDeviceLogin({ env } = {}) {
    const deviceInfo = this.getDeviceInfo()
    const baseUrl = this.baseUrl || resolveAuthBaseUrl()
    // Environment resolution for device-login tokens:
    // - explicit runtime env argument wins
    // - then SIMPLEX_AUTH_ENV (dev/prod)
    // - then automatic fallback (localhost => dev, other hosts => prod)
    const isLocal = baseUrl ? baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') : false
    const configuredEnv = process.env.SIMPLEX_AUTH_ENV === 'dev' ? 'dev' : process.env.SIMPLEX_AUTH_ENV === 'prod' ? 'prod' : null
    // Local development shortcut bypass for auth testing only.
    // Keep disabled in production-like runs.
    const useDevShortcut = process.env.SIMPLEX_DEV_LOGIN_SHORTCUT === '1'
    const resolvedEnv = env === 'dev' ? 'dev' : env === 'prod' ? 'prod' : configuredEnv || (isLocal ? 'dev' : 'prod')
    // Persist env choice so polling uses the same token namespace as startDeviceLogin.
    this.currentAuthEnv = resolvedEnv
    const payload = {
      ...deviceInfo,
      env: resolvedEnv,
      useDevShortcut,
    }
    const response = await this.request('/api/device-login/start', payload)

    if (response?.status === 'authorized') {
      const now = Date.now()
      await this.applyTokens(
        {
          accessToken: response.accessToken,
          refreshToken: response.deviceRefreshToken,
          accessTokenExpiresAt: now + (response.accessTokenExpiresIn || 900) * 1000,
          refreshTokenExpiresAt: response.refreshTokenExpiresAt || null,
          user: response.user || null,
        },
        'SIGNED_IN'
      )
    }

    return response
  }

  async pollDeviceLogin(deviceLoginId) {
    const baseUrl = this.baseUrl || resolveAuthBaseUrl()
    const isLocal = baseUrl ? baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') : false
    const configuredEnv = process.env.SIMPLEX_AUTH_ENV === 'dev' ? 'dev' : process.env.SIMPLEX_AUTH_ENV === 'prod' ? 'prod' : null
    // Keep polling on the same env selected at login start; otherwise use configured/auto fallback.
    const resolvedEnv = this.currentAuthEnv || configuredEnv || (isLocal ? 'dev' : 'prod')
    const payload = { deviceLoginId, env: resolvedEnv }
    const response = await this.request('/api/device-login/poll', payload)

    if (response?.status === 'authorized') {
      const now = Date.now()
      const accessToken = response.accessToken
      const refreshToken = response.deviceRefreshToken
      const accessTokenExpiresAt = now + (response.accessTokenExpiresIn || 900) * 1000
      const refreshTokenExpiresAt = response.refreshTokenExpiresAt || null
      const user = response.user || null

      await this.applyTokens(
        {
          accessToken,
          refreshToken,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
          user,
        },
        'SIGNED_IN'
      )
    }

    return response
  }

  async refreshSession() {
    if (!this.tokens?.refreshToken) return false
    try {
      const response = await this.request('/api/auth/refresh', {
        deviceRefreshToken: this.tokens.refreshToken,
      })
      const now = Date.now()
      await this.applyTokens(
        {
          accessToken: response.accessToken,
          refreshToken: response.deviceRefreshToken,
          accessTokenExpiresAt: now + (response.accessTokenExpiresIn || 900) * 1000,
          refreshTokenExpiresAt: response.refreshTokenExpiresAt || null,
          user: this.user,
        },
        'TOKEN_REFRESHED'
      )
      if (!this.user) {
        await this.fetchUserProfile()
      }
      return true
    } catch (error) {
      const message = String(error?.message || '')
      if (/invalid refresh token/i.test(message)) {
        console.warn('Stored session is no longer valid. Login is required.')
        await this.applyTokens(null, 'SIGNED_OUT')
        return false
      }
      console.error('Failed to refresh session:', error)
      return false
    }
  }

  async loadSession() {
    try {
      if (!this.sessionFile || !fs.existsSync(this.sessionFile)) return
      const sessionData = fs.readFileSync(this.sessionFile, 'utf-8')
      const stored = JSON.parse(sessionData)
      if (!stored?.accessToken || !stored?.refreshToken) {
        this.clearSession()
        return
      }

      const expiresAtMs = stored.accessTokenExpiresAt || getTokenExpiryMs(stored.accessToken)
      if (expiresAtMs && Date.now() > expiresAtMs) {
        this.tokens = { accessToken: stored.accessToken, refreshToken: stored.refreshToken }
        const refreshed = await this.refreshSession()
        if (!refreshed) {
          this.clearSession()
        }
        return
      }

      await this.applyTokens(
        {
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
          accessTokenExpiresAt: expiresAtMs,
          refreshTokenExpiresAt: stored.refreshTokenExpiresAt || null,
          user: stored.user || null,
        },
        'SIGNED_IN'
      )
    } catch (error) {
      console.error('Failed to load session:', error)
      this.clearSession()
    }
  }

  async applyTokens(tokens, eventName) {
    this.tokens = tokens

    if (tokens?.accessToken) {
      const payload = decodeJwtPayload(tokens.accessToken)
      this.userId = payload?.sub || null
      this.user = tokens.user || null
      if (this.rememberMe) {
        this.saveSession(tokens)
      } else {
        this.clearSessionFile()
      }
    } else {
      this.user = null
      this.userId = null
      this.clearSession()
    }

    this.notifyListeners(eventName, this.getSession())
  }

  async fetchUserProfile({ allowRefresh = true } = {}) {
    if (!this.tokens?.accessToken || !this.baseUrl) return null
    try {
      const response = await fetch(`${this.baseUrl}/api/client/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
      })
      if (!response.ok) {
        if (response.status === 401 && allowRefresh) {
          const refreshed = await this.refreshSession()
          if (refreshed) {
            return this.fetchUserProfile({ allowRefresh: false })
          }
          return null
        }
        const body = await response.text().catch(() => '')
        console.warn('Failed to fetch user profile:', response.status, body)
        return null
      }
      const data = await response.json()
      const user = data?.user || null
      if (user) {
        this.user = user
        if (this.rememberMe) {
          this.saveSession({
            accessToken: this.tokens.accessToken,
            refreshToken: this.tokens.refreshToken,
            accessTokenExpiresAt: this.tokens.accessTokenExpiresAt,
            refreshTokenExpiresAt: this.tokens.refreshTokenExpiresAt,
            user,
          })
        }
      }
      return user
    } catch (error) {
      console.error('Failed to fetch user profile:', error)
      return null
    }
  }

  getSession() {
    const accessToken = this.tokens?.accessToken || null
    const refreshToken = this.tokens?.refreshToken || null
    const expiresAt = this.tokens?.accessTokenExpiresAt || (accessToken ? getTokenExpiryMs(accessToken) : null)
    return accessToken
      ? {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt ? Math.floor(expiresAt / 1000) : null,
          user: this.user,
        }
      : null
  }

  saveSession(tokens) {
    if (!this.rememberMe || !this.sessionFile) return
    try {
      fs.writeFileSync(
        this.sessionFile,
        JSON.stringify(
          {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            accessTokenExpiresAt: tokens.accessTokenExpiresAt,
            refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
            user: tokens.user || null,
          },
          null,
          2
        )
      )
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  clearSessionFile() {
    try {
      if (this.sessionFile && fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile)
      }
    } catch (error) {
      console.error('Failed to clear session:', error)
    }
  }

  clearSession() {
    this.tokens = null
    this.user = null
    this.userId = null
    this.clearSessionFile()
  }

  async logout() {
    if (this.tokens?.refreshToken) {
      try {
        await this.request('/api/logout', { deviceRefreshToken: this.tokens.refreshToken })
      } catch (error) {
        console.warn('Failed to revoke session:', error)
      }
    }

    await this.applyTokens(null, 'SIGNED_OUT')
  }

  isAuthenticated() {
    return Boolean(this.tokens?.accessToken)
  }

  getUser() {
    return this.user
  }

  getUserId() {
    return this.userId
  }

  getAccessToken() {
    return this.tokens?.accessToken || null
  }

  getRememberMe() {
    return this.rememberMe
  }

  setRememberMe(enabled) {
    this.rememberMe = enabled === true
    this.saveRememberPreference(this.rememberMe)
    if (!this.rememberMe) {
      this.clearSessionFile()
    }
  }

  loadRememberPreference() {
    try {
      if (this.rememberFile && fs.existsSync(this.rememberFile)) {
        const raw = fs.readFileSync(this.rememberFile, 'utf-8')
        const data = JSON.parse(raw)
        if (typeof data.rememberMe === 'boolean') {
          return data.rememberMe
        }
      }
    } catch (error) {
      console.error('Failed to load remember me preference:', error)
    }

    return true
  }

  saveRememberPreference(value) {
    try {
      if (!this.rememberFile) return
      fs.writeFileSync(this.rememberFile, JSON.stringify({ rememberMe: !!value }, null, 2))
    } catch (error) {
      console.error('Failed to save remember me preference:', error)
    }
  }

  onAuthStateChange(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  notifyListeners(event, session) {
    this.listeners.forEach((callback) => {
      try {
        callback(event, session)
      } catch (error) {
        console.error('Error in auth listener:', error)
      }
    })
  }
}

let authServiceInstance = null

function getAuthService() {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService()
  }
  return authServiceInstance
}

module.exports = { getAuthService, AuthService }

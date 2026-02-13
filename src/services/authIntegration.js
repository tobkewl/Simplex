/**
 * Auth integration for the main process
 * Handles IPC communication and window management for authentication
 */

const { BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { getAuthService } = require('./authService')

let authWindow = null
let authService = null

// Auth redirects may target production hosts or local dev hosts.
// Keep this list strict and limited to known auth endpoints.
const allowedAuthHosts = new Set([
  'simplex.gg',
  'www.simplex.gg',
  'localhost',
  '127.0.0.1',
])

function isAllowedAuthUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false
  const value = rawUrl.trim()
  if (!value) return false
  let parsed = null
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  return allowedAuthHosts.has(parsed.hostname.toLowerCase())
}

/**
 * Initialize auth service and IPC handlers
 */
async function initializeAuth() {
  authService = getAuthService()
  await authService.initialize()

  // Setup IPC handlers
  setupIpcHandlers()

  console.log('Auth service initialized')
  if (authService.isAuthenticated()) {
    console.log('User is logged in:', authService.getUser()?.username || authService.getUser()?.name || 'unknown')
  }

  return authService
}

/**
 * Set up IPC handlers for auth
 */
function setupIpcHandlers() {
  // Re-register shell:openExternal for auth windows so login links are validated
  // against allowedAuthHosts (including localhost for local OAuth testing).
  try {
    ipcMain.removeHandler('shell:openExternal')
  } catch {
    // ignore if not registered
  }
  ipcMain.handle('shell:openExternal', async (_e, url) => {
    try {
      const { shell } = require('electron')
      if (isAllowedAuthUrl(url)) {
        await shell.openExternal(url)
      } else {
        throw new Error('Blocked external URL')
      }
      return true
    } catch (error) {
      throw error
    }
  })

  // Check auth status
  ipcMain.handle('auth:check', () => {
    return {
      authenticated: authService.isAuthenticated(),
      user: authService.getUser(),
      userId: authService.getUserId(),
      username: authService.getUser()?.poeAccountName || authService.getUser()?.name || null,
    }
  })

  ipcMain.handle('auth:device-login-start', async (_event, { env, rememberMe } = {}) => {
    try {
      console.log('[AUTH_IPC] auth:device-login-start', { env, rememberMe })
      if (typeof rememberMe === 'boolean') {
        authService.setRememberMe(rememberMe)
      }
      const result = await authService.startDeviceLogin({ env })
      console.log('[AUTH_IPC] auth:device-login-start:success', {
        hasLoginUrl: typeof result?.loginUrl === 'string',
        status: result?.status || null,
      })
      return { success: true, ...result }
    } catch (error) {
      console.error('[AUTH_IPC] auth:device-login-start:error', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('auth:device-login-poll', async (_event, { deviceLoginId }) => {
    try {
      const result = await authService.pollDeviceLogin(deviceLoginId)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Logout
  ipcMain.handle('auth:logout', async () => {
    try {
      await authService.logout()
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get user
  ipcMain.handle('auth:get-user', () => {
    return authService.getUser()
  })

  // Get user ID
  ipcMain.handle('auth:get-user-id', () => {
    return authService.getUserId()
  })

  ipcMain.handle('auth:get-remember', () => {
    return { rememberMe: authService.getRememberMe() }
  })

  // Close auth window
  ipcMain.on('auth:close-window', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close()
    }
  })

  ipcMain.on('auth:hide-window', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.minimize()
    }
  })

  ipcMain.on('auth:show-window', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.show()
      authWindow.focus()
    }
  })

  ipcMain.on('auth:show-login', () => {
    showAuthWindow()
  })

}

/**
 * Show login window
 */
function showAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus()
    return authWindow
  }

  authWindow = new BrowserWindow({
    width: 450,
    height: 650,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    center: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'auth-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
    show: false,
  })

  authWindow.loadFile(path.join(__dirname, '..', 'renderer', 'auth.html'))
    .catch((error) => {
      console.error('[AUTH_WINDOW] loadFile failed:', error)
    })

  authWindow.webContents.on('did-finish-load', () => {
    console.log('[AUTH_WINDOW] did-finish-load')
  })

  authWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('[AUTH_WINDOW] did-fail-load', { code, description, validatedURL })
  })

  authWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[AUTH_RENDERER_CONSOLE]', { level, message, line, sourceId })
  })

  authWindow.once('ready-to-show', () => {
    authWindow.show()
  })

  authWindow.on('closed', () => {
    authWindow = null
  })

  return authWindow
}

/**
 * Check whether the user is logged in; if not, show the login window
 */
async function requireAuth() {
  if (!authService) {
    await initializeAuth()
  }

  if (!authService.isAuthenticated()) {
    return new Promise((resolve) => {
      const window = showAuthWindow()

      // Listen for auth state changes
      const unsubscribe = authService.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          unsubscribe()
          resolve(true)
        }
      })

      // If the window closes without login
      window.on('closed', () => {
        unsubscribe()
        resolve(false)
      })
    })
  }

  return true
}

/**
 * Get the auth service
 */
function getAuth() {
  return authService
}

module.exports = {
  initializeAuth,
  showAuthWindow,
  requireAuth,
  getAuth,
}

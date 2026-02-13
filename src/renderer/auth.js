/**
 * Device link auth UI
 */

(() => {
if (window.__simplexAuthUiInitialized) {
  console.warn('[AUTH_UI] already initialized, skipping duplicate load')
  return
}
window.__simplexAuthUiInitialized = true

const authAPI = window.authAPI

const connectBtn = document.getElementById('connect-btn')
const statusEl = document.getElementById('status')
const errorDiv = document.getElementById('error')
const successDiv = document.getElementById('success')
const rememberMeInput = document.getElementById('remember-me')

let pollTimer = null
const hasAuthBridge = !!(authAPI && typeof authAPI.invoke === 'function' && typeof authAPI.send === 'function')
console.log('[AUTH_UI] script loaded', { hasAuthBridge })

function showError(message) {
  errorDiv.textContent = message
  errorDiv.classList.add('visible')
  successDiv.classList.remove('visible')
}

function hideError() {
  errorDiv.classList.remove('visible')
}

function showSuccess(message) {
  successDiv.textContent = message
  successDiv.classList.add('visible')
  errorDiv.classList.remove('visible')
}

function setStatus(message) {
  statusEl.textContent = message
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function startPolling(deviceLoginId) {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const result = await authAPI.invoke('auth:device-login-poll', { deviceLoginId })
      if (!result?.success) {
        stopPolling()
        showError(result?.error || 'Login failed.')
        connectBtn.disabled = false
        connectBtn.textContent = 'Login with PoE'
        setStatus('Ready to connect your account.')
        return
      }

      if (result.status === 'pending') {
        setStatus('Waiting for approval in the browser...')
        return
      }

      if (result.status === 'authorized') {
        stopPolling()
        showSuccess('Device linked! You can return to the app.')
        setStatus('Login complete.')
        setTimeout(() => {
          authAPI.send('auth:close-window')
        }, 1200)
        return
      }

      if (result.status === 'expired') {
        stopPolling()
        showError('Login request expired. Please try again.')
        connectBtn.disabled = false
        connectBtn.textContent = 'Login with PoE'
        setStatus('Ready to connect your account.')
        authAPI.send('auth:show-window')
        return
      }

      if (result.status === 'consumed') {
        stopPolling()
        showError('Login link already used. Please try again.')
        connectBtn.disabled = false
        connectBtn.textContent = 'Login with PoE'
        setStatus('Ready to connect your account.')
        authAPI.send('auth:show-window')
      }
    } catch (error) {
      stopPolling()
      showError(error.message || 'Login failed.')
      connectBtn.disabled = false
      connectBtn.textContent = 'Login with PoE'
      setStatus('Ready to connect your account.')
      authAPI.send('auth:show-window')
    }
  }, 2000)
}

connectBtn.addEventListener('click', async () => {
  console.log('[AUTH_UI] connect button clicked')
  if (!hasAuthBridge) {
    console.warn('[AUTH_UI] auth bridge unavailable')
    showError('Login bridge is unavailable. Please restart the app.')
    return
  }
  hideError()
  showSuccess('')
  connectBtn.disabled = true
  connectBtn.textContent = 'Opening browser...'
  setStatus('Preparing secure login...')

  const rememberMe = rememberMeInput ? rememberMeInput.checked : true
  let loginUrl = null

  try {
    console.log('[AUTH_UI] invoking auth:device-login-start')
    const result = await authAPI.invoke('auth:device-login-start', { rememberMe })
    console.log('[AUTH_UI] auth:device-login-start result', result)
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to start login.')
    }

    if (result.status === 'authorized') {
      showSuccess('Device linked! You can return to the app.')
      setStatus('Login complete.')
      setTimeout(() => {
        authAPI.send('auth:close-window')
      }, 800)
      return
    }

    if (typeof result.loginUrl !== 'string' || !/^https?:\/\//i.test(result.loginUrl)) {
      throw new Error('Invalid login URL returned by server.')
    }
    loginUrl = result.loginUrl

    console.log('[AUTH_UI] opening external login URL', { loginUrl: result.loginUrl })
    const opened = await authAPI.invoke('shell:openExternal', result.loginUrl)
    console.log('[AUTH_UI] shell:openExternal result', { opened })
    if (opened !== true) {
      throw new Error('Failed to open browser automatically.')
    }
    authAPI.send('auth:hide-window')
    connectBtn.textContent = 'Waiting for approval...'
    setStatus('Browser opened. Approve the login to continue.')
    await startPolling(result.deviceLoginId)
  } catch (error) {
    const baseError = error?.message || 'Failed to start login.'
    const withUrl = loginUrl ? `${baseError} Open manually: ${loginUrl}` : baseError
    showError(withUrl)
    connectBtn.disabled = false
    connectBtn.textContent = 'Login with PoE'
    setStatus('Ready to connect your account.')
    if (hasAuthBridge) {
      authAPI.send('auth:show-window')
    }
  }
})

if (!hasAuthBridge) {
  showError('Auth IPC bridge not available. Check preload setup and restart the app.')
  connectBtn.disabled = true
  setStatus('Unable to initialize login.')
} else if (rememberMeInput) {
  authAPI.invoke('auth:get-remember').then((result) => {
    if (result && typeof result.rememberMe === 'boolean') {
      rememberMeInput.checked = result.rememberMe
    }
  }).catch(() => {})
}

if (hasAuthBridge) {
  authAPI.invoke('auth:check').then(result => {
    if (result.authenticated) {
      showSuccess('Already linked. Closing window...')
      setStatus('Login complete.')
      setTimeout(() => {
        authAPI.send('auth:close-window')
      }, 1000)
    }
  })
}
})()

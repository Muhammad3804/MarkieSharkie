import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { getAuthSnapshot, onUnauthorized, restoreSession, signOut, subscribeAuth } from '../../api/auth.js'
import { AuthContext } from './authContext.js'
import LoginDialog from './LoginDialog.jsx'
import WelcomeToast from './WelcomeToast.jsx'

// The element that opened the modal is usually gone after logging in (the Log in button became the avatar, a
// guard card became the page, a menu closed), so native focus restore lands on <body>. Move focus to the account
// button, or to the page heading once a lazy route has rendered.
function focusAfterLogin() {
  let tries = 0
  const place = () => {
    // Still on something real (the trigger survived)? Leave it. A control inside the closed dialog doesn't count.
    const current = document.activeElement
    if (current && current !== document.body && !current.closest('dialog:not([open])')) return
    const target = document.getElementById('account-button') ?? document.querySelector('main h1, h1')
    if (target) {
      if (target.tagName === 'H1' && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    } else if (++tries < 10) setTimeout(place, 100)
  }
  requestAnimationFrame(place)
}

// Holds the session and the one login modal. Mounted at the router root (app/router.jsx) so every page and the
// header share it. The session comes from the server (api/auth.js): restored from the refresh cookie on page load,
// and a log in or out in another tab shows up here too. `ready` is false until that first restore has finished.
export default function AuthProvider({ children }) {
  const { ready, user } = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot)
  const { pathname } = useLocation()
  // { id, intent, pathname } while the modal is open (id restarts the modal at its first step). It only counts as open on the page it was opened from, so
  // back / forward closes it and the pending action (which belonged to the old page) is dropped on close.
  // Logging in from another tab also closes it (nothing to resume there).
  const [login, setLogin] = useState(null)
  const pending = useRef(null)
  // { id, name, role, first } after a login from the modal (first = the account's first ever login).
  const [welcome, setWelcome] = useState(null)
  const dismissWelcome = useCallback(() => setWelcome(null), [])
  const open = login !== null && login.pathname === pathname && !user
  // Read the path through a ref so openLogin (and the context value) stay stable across navigations.
  const path = useRef(pathname)
  useEffect(() => {
    path.current = pathname
  }, [pathname])

  const openLogin = useCallback((intent = 'default', action = null) => {
    pending.current = action
    setLogin({ id: Date.now(), intent, pathname: path.current })
  }, [])
  const closeLogin = useCallback(() => {
    pending.current = null
    setLogin(null)
  }, [])
  const completeLogin = useCallback((signedIn) => {
    const action = pending.current
    pending.current = null
    setLogin(null)
    if (signedIn?.name) setWelcome({ id: Date.now(), name: signedIn.name, role: signedIn.role, first: Boolean(signedIn.firstLogin) })
    try {
      action?.(signedIn)
    } finally {
      focusAfterLogin()
    }
  }, [])
  const logout = useCallback(() => signOut(), [])

  useEffect(() => {
    restoreSession()
  }, [])
  // The session ended mid-use (refresh token expired or revoked): the user is already cleared, ask them to log in.
  useEffect(() => onUnauthorized(() => openLogin('default')), [openLogin])

  const value = useMemo(() => ({ ready, user, openLogin, logout }), [ready, user, openLogin, logout])
  return (
    <AuthContext value={value}>
      {children}
      <LoginDialog open={open} openKey={login?.id} intent={login?.intent} onClose={closeLogin} onSignedIn={completeLogin} />
      <WelcomeToast welcome={welcome} onDismiss={dismissWelcome} />
    </AuthContext>
  )
}

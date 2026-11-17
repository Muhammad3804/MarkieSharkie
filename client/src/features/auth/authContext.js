import { createContext, useCallback, useContext } from 'react'

// { user, openLogin(intent, action?), logout } from AuthProvider. `user` is the signed-in mock user or null.
export const AuthContext = createContext(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}

// requireAuth(intent, action): signed in -> runs action(user) now and returns its result. Signed out -> opens the
// login modal with that trigger's heading (features/auth/intents.js) and runs action(user) once the person has
// logged in. Closing the modal drops the action.
export function useRequireAuth() {
  const { user, openLogin } = useAuth()
  return useCallback((intent, action) => (user ? action(user) : openLogin(intent, action)), [user, openLogin])
}

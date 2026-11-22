import { Link } from 'react-router-dom'
import RequireAuth from './RequireAuth.jsx'
import { useAuth } from './authContext.js'

// Route guard by role (REQ-3). Signed out: RequireAuth's "log in" card. Signed in with another role: a 403 page.
// UI only: the server checks the role on every request.
export default function RequireRole({ role, intent = 'default', fullScreen = false, children }) {
  return (
    <RequireAuth intent={intent} fullScreen={fullScreen}>
      <RoleGate role={role} fullScreen={fullScreen}>
        {children}
      </RoleGate>
    </RequireAuth>
  )
}

function RoleGate({ role, fullScreen, children }) {
  const { user } = useAuth()
  if (user?.role === role) return children
  return (
    <section className={`grid place-items-center px-4 ${fullScreen ? 'min-h-dvh bg-surface py-10' : 'min-h-[60dvh] py-16'}`}>
      <title>No access | MarkieSharkie</title>
      <div className="w-full max-w-[440px] rounded-[28px] border border-line bg-white px-6 py-9 text-center shadow-modal sm:px-10">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-primary">403</p>
        <h1 className="mt-2 text-balance font-heading text-[26px] font-semibold leading-tight text-ink-strong">You don’t have access to this page</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-pretty text-[15px] leading-relaxed text-muted-warm">
          This page is for MarkieSharkie admins. You’re logged in as {user?.name}.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-[16px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Back to home
        </Link>
      </div>
    </section>
  )
}

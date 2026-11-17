import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button.jsx'
import Logo from '../../components/ui/Logo.jsx'
import { useAuth } from './authContext.js'
import { loginIntent } from './intents.js'

// Route guard for pages that need an account (direct links, a refresh after logging out). Signed out: a short
// "log in to continue" card that opens the login modal; once logged in, the page renders in place. UI only: the
// server checks the access token on every request. `fullScreen` is for routes outside PublicLayout (no header).
export default function RequireAuth({ intent = 'default', fullScreen = false, children }) {
  const { user, openLogin } = useAuth()
  if (user) return children
  const copy = loginIntent(intent)
  return (
    <section className={`grid place-items-center px-4 ${fullScreen ? 'min-h-dvh bg-surface py-10' : 'min-h-[60dvh] py-16'}`}>
      <title>Log in | MarkieSharkie</title>
      <div className="w-full max-w-[440px] rounded-[28px] border border-line bg-white px-6 py-9 text-center shadow-modal sm:px-10">
        {fullScreen && (
          <div className="mb-4 flex justify-center">
            <Logo className="-my-2 scale-[0.8]" />
          </div>
        )}
        <h1 className="text-balance font-heading text-[26px] font-semibold leading-tight text-ink-strong">{copy.title}</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-pretty text-[15px] leading-relaxed text-muted-warm">{copy.subtitle}</p>
        <Button onClick={() => openLogin(intent)} className="mt-7 min-h-12 w-full text-[16px]">
          Log in
        </Button>
        {fullScreen && (
          <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-primary">
            Back to home
          </Link>
        )}
      </div>
    </section>
  )
}

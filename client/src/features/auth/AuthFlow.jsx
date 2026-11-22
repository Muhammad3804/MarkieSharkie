import { useEffect, useRef, useState } from 'react'
import { LogoMark } from '../../components/ui/Logo.jsx'
import { RESEND_SECONDS, RESET_CODE_MINUTES, RESET_UNAVAILABLE, logInWithPassword, requestPasswordReset, resetPassword, signUp } from '../../api/auth.js'
import { bioError, businessNameError, cityError, emailError, identifierError, nameError, parseIdentifier, passwordError, phoneError } from '../../lib/accountRules.js'
import { formatPkMobileIntl } from '../../lib/phone.js'
import { CITIES } from '../host/options.js'
import { AuthField, CheckboxField, FieldError, FormAlert, Notice, OtpInput, PasswordField, SelectField, SubmitButton } from './fields.jsx'
import { loginIntent } from './intents.js'

// What's inside the login modal (lazy-loaded by LoginDialog). One minimal column per step:
//   start    logo mark, "Log in or sign up", the trigger's prompt, phone or email -> Continue,
//            "New to MarkieSharkie? Sign up". Continue -> password (the server has no account lookup, srs-alignment #23)
//   password "Welcome back": password, Keep me logged in, Forgot password?, "New here? Create an account"
//   signup   account type (customer / venue owner / decorator, REQ-1), name, email, mobile, city, the type's business
//            fields, password + strength, confirm, terms
// Google / Apple sign-in is hidden until the server supports it; password reset says it isn't available yet.
//   forgot   confirm where the 6-digit code goes -> reset: code, new password (REQ-2 reset by one-time code)
// Every step after start has a back arrow (top left); the close X (top right) is LoginDialog's.
// `run(kind, task)` (from LoginDialog) marks the modal busy and blocks closing; `login(kind, task)` also finishes
// the login, so every method resumes the trigger's action the same way.

const CITY_NAMES = CITIES.map((city) => city.value)
const EMPTY_CODE = ['', '', '', '', '', '']
const BACK_TO = { password: 'start', signup: 'start', forgot: 'password', reset: 'password' }

const focusId = (id) => document.getElementById(id)?.focus()
const linkButton = 'cursor-pointer rounded font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const describeIdentifier = (text) => {
  const id = parseIdentifier(text)
  return id?.kind === 'phone' ? formatPkMobileIntl(id.value) : id?.value ?? text
}

export default function AuthFlow({ intent, busy, run, login }) {
  const [view, setView] = useState('start')
  const [identifier, setIdentifier] = useState('')
  const [reset, setReset] = useState(null) // { sentTo, channel, demoCode, sentAt }
  const [notice, setNotice] = useState(null) // { tone, text }
  const panel = useRef(null)
  const moveFocus = useRef(true) // also on first open: start at the phone / email field
  const prompt = loginIntent(intent).prompt

  function go(next, { message = null } = {}) {
    if (busy) return
    moveFocus.current = true
    setNotice(message)
    setView(next)
  }
  // On open and after every step change, focus the step's first field.
  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    panel.current?.querySelector('[data-autofocus]')?.focus()
  }, [view])

  const heading = {
    start: { title: 'Log in or sign up', subtitle: prompt },
    signup: { title: 'Create your account', subtitle: prompt },
    password: { title: 'Welcome back', subtitle: 'Enter your password to continue.' },
    forgot: { title: 'Reset your password', subtitle: 'We’ll send you a 6-digit code to set a new password.' },
    reset: { title: 'Enter your code', subtitle: reset ? `We sent a 6-digit code to ${reset.sentTo}. It expires in ${RESET_CODE_MINUTES} minutes.` : '' },
  }[view]

  return (
    <div ref={panel}>
      {BACK_TO[view] && (
        <button
          type="button"
          onClick={() => go(BACK_TO[view])}
          aria-label="Back"
          aria-disabled={busy ? true : undefined}
          className="absolute left-3 top-3 z-10 grid size-11 cursor-pointer place-items-center rounded-full text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40 sm:left-5 sm:top-5"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 9H3M8 4 3 9l5 5" />
          </svg>
        </button>
      )}

      <div className="flex justify-center">
        <LogoMark />
      </div>
      <h2 id="login-title" className="mt-4 text-balance text-center font-heading text-[26px] font-semibold leading-tight text-ink-strong sm:text-[28px]">
        {heading.title}
      </h2>
      <p id="login-subtitle" className="mx-auto mt-1.5 max-w-[40ch] text-pretty text-center text-[14px] leading-relaxed text-muted-warm">
        {heading.subtitle}
      </p>

      <div className="mt-7 flex flex-col gap-4">
        <Notice tone={notice?.tone}>{notice?.text}</Notice>

        {view === 'start' && (
          <>
            <IdentifierStep identifier={identifier} setIdentifier={setIdentifier} onContinue={() => go('password')} />
            <p className="text-center text-[14px] text-muted-warm">
              New to MarkieSharkie?{' '}
              <button type="button" onClick={() => go('signup')} className={`${linkButton} min-h-11 text-ink-strong`}>
                Sign up
              </button>
            </p>
          </>
        )}

        {view === 'password' && (
          <>
            <PasswordStep identifier={identifier} busy={busy} login={login} onForgot={() => setNotice({ tone: 'info', text: RESET_UNAVAILABLE })} />
            <p className="text-center text-[14px] text-muted-warm">
              New to MarkieSharkie?{' '}
              <button type="button" onClick={() => go('signup')} className={`${linkButton} min-h-11 text-ink-strong`}>
                Create an account
              </button>
            </p>
          </>
        )}

        {view === 'signup' && (
          <SignupStep
            intent={intent}
            initial={parseIdentifier(identifier)}
            busy={busy}
            login={login}
            onIdentifier={setIdentifier}
            onRegistered={(email) => {
              setIdentifier(email)
              go('password', { message: { tone: 'success', text: 'Your account is ready. Log in to continue.' } })
            }}
          />
        )}

        {view === 'forgot' && (
          <ForgotStep
            identifier={identifier}
            busy={busy}
            run={run}
            onSent={(sent) => {
              setReset({ ...sent, sentAt: Date.now() })
              go('reset')
            }}
            onBack={() => go('password')}
          />
        )}

        {view === 'reset' && reset && (
          <ResetStep
            identifier={identifier}
            sent={reset}
            busy={busy}
            run={run}
            onResent={(sent) => setReset({ ...sent, sentAt: Date.now() })}
            onDone={() => go('password', { message: { tone: 'success', text: 'Password changed. Log in with your new password.' } })}
            onBack={() => go('password')}
          />
        )}
      </div>
    </div>
  )
}

// Hidden username next to a password, so password managers know which account the password belongs to.
const HiddenUsername = ({ value }) => <input type="text" name="username" autoComplete="username" value={value} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />

function IdentifierStep({ identifier, setIdentifier, onContinue }) {
  const [touched, setTouched] = useState(false)
  const error = touched ? identifierError(identifier) : ''

  function submit(event) {
    event.preventDefault()
    setTouched(true)
    if (identifierError(identifier)) return focusId('auth-identifier')
    onContinue()
  }

  // Mobile numbers are shown in +92 format once the field is left (either format is accepted while typing).
  function onBlur() {
    const id = parseIdentifier(identifier)
    if (id?.kind === 'phone') setIdentifier(formatPkMobileIntl(id.value))
    if (identifier.trim()) setTouched(true)
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div>
        {/* Floating label: sits inside the box like a placeholder, moves up once the field has focus or text. */}
        <div className="relative">
          <input
            id="auth-identifier"
            name="username"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder=" "
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            onBlur={onBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'auth-identifier-error' : undefined}
            data-autofocus
            className="peer block h-[60px] w-full rounded-xl border-[1.5px] border-ink-strong/70 bg-white px-4 pb-2 pt-6 text-[16px] text-ink-strong transition-colors hover:border-ink-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary aria-[invalid=true]:border-danger"
          />
          <label
            htmlFor="auth-identifier"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-muted-warm transition-all duration-150 motion-reduce:transition-none peer-focus:top-[18px] peer-focus:text-[12px] peer-not-placeholder-shown:top-[18px] peer-not-placeholder-shown:text-[12px]"
          >
            Phone number or email
          </label>
        </div>
        <FieldError id="auth-identifier-error">{error}</FieldError>
      </div>
      <SubmitButton>Continue</SubmitButton>
    </form>
  )
}

function PasswordStep({ identifier, busy, login, onForgot }) {
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [alert, setAlert] = useState(null) // { text, reset }
  const shownError = error || (touched && !password ? 'Enter your password.' : '')

  async function submit(event) {
    event.preventDefault()
    setTouched(true)
    setAlert(null)
    if (!password) return focusId('auth-password')
    const result = await login('password', () => logInWithPassword({ identifier, password, remember }))
    if (result.cancelled || !result.error) return
    const { code, message, details } = result.error
    if (code === 'INVALID_CREDENTIALS') {
      // Same message for an unknown account and a wrong password (EUC-02 4.1), so it doesn't say which was wrong.
      setError(message)
      const input = document.getElementById('auth-password')
      input?.focus()
      input?.select()
    } else if (code === 'ACCOUNT_LOCKED') {
      // REQ-2: 15-minute lock after 5 wrong passwords; the message says how long is left.
      setAlert({ text: message })
      focusId('auth-password')
    } else if (code === 'VALIDATION_ERROR' && details) {
      if (details.password) setError(details.password)
      else setAlert({ text: details.identifier ?? message })
    } else {
      // ACCOUNT_SUSPENDED, RATE_LIMITED, NETWORK carry a message meant for the person.
      if (!code) console.error('[auth] login failed', result.error)
      setAlert({ text: code ? message : 'We couldn’t log you in. Try again.' })
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <HiddenUsername value={identifier} />
      <p className="truncate rounded-xl border border-line bg-surface px-4 py-3 text-center text-[15px] font-medium text-ink-strong">{describeIdentifier(identifier)}</p>
      <PasswordField
        id="auth-password"
        name="password"
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          setError('')
        }}
        // No blur error for an empty password: the message would push the controls below it down mid-click.
        error={shownError}
        data-autofocus
      />
      <div className="-my-1 flex flex-wrap items-center justify-between gap-x-4">
        <CheckboxField id="auth-remember" label="Keep me logged in" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
        <button id="auth-forgot" type="button" onClick={onForgot} className={`${linkButton} min-h-11 text-[14px]`}>
          Forgot password?
        </button>
      </div>
      <FormAlert>{alert?.text}</FormAlert>
      <SubmitButton loading={busy === 'password'} loadingText="Logging in…">
        Log in
      </SubmitButton>
    </form>
  )
}

// REQ-1: the account type decides the extra fields (server: modules/auth/schemas.js registerBodySchema).
const ROLES = [
  { value: 'customer', label: 'Book venues', description: 'Find and book a venue for your event.' },
  { value: 'venue_owner', label: 'List my venue', description: 'I own or manage a marquee or hall.' },
  { value: 'decorator', label: 'Offer decor', description: 'I provide event decoration services.' },
]
const ROLE_FIELDS = {
  customer: [],
  venue_owner: ['businessName', 'contactNumber'],
  decorator: ['businessName', 'bio'],
}
const BASE_FIELDS = ['name', 'email', 'phone', 'city']
const signupFields = (role) => [...BASE_FIELDS, ...ROLE_FIELDS[role], 'password', 'confirm', 'terms']
const FIELD_IDS = { businessName: 'auth-business-name', contactNumber: 'auth-contact-number', bio: 'auth-bio' }
const fieldId = (field) => FIELD_IDS[field] ?? `auth-${field}`

function RoleField({ value, onChange, disabled }) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[14px] font-medium text-ink-strong">I want to</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {ROLES.map((role) => (
          <label
            key={role.value}
            className="flex min-h-11 cursor-pointer gap-3 rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 transition-colors hover:border-outline-strong has-checked:border-primary has-checked:bg-surface has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary sm:flex-col sm:gap-1"
          >
            <input
              type="radio"
              name="role"
              value={role.value}
              checked={value === role.value}
              onChange={() => onChange(role.value)}
              disabled={disabled}
              className="mt-0.5 size-4 shrink-0 accent-primary sm:sr-only"
            />
            <span>
              <span className="block text-[15px] font-semibold text-ink-strong">{role.label}</span>
              <span className="block text-[13px] leading-snug text-muted-warm">{role.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SignupStep({ intent, initial, busy, login, onIdentifier, onRegistered }) {
  const [values, setValues] = useState(() => ({
    role: intent === 'host' ? 'venue_owner' : 'customer',
    name: '',
    email: initial?.kind === 'email' ? initial.value : '',
    phone: initial?.kind === 'phone' ? formatPkMobileIntl(initial.value) : '',
    city: '',
    businessName: '',
    contactNumber: '',
    bio: '',
    password: '',
    confirm: '',
    terms: false,
  }))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [apiErrors, setApiErrors] = useState({})
  const [alert, setAlert] = useState('')
  const fields = signupFields(values.role)

  const rules = {
    name: nameError(values.name),
    email: emailError(values.email),
    phone: phoneError(values.phone),
    city: cityError(values.city),
    businessName: businessNameError(values.businessName),
    contactNumber: values.contactNumber.trim() ? phoneError(values.contactNumber) : 'Enter the number customers can call about your venue.',
    bio: bioError(values.bio),
    password: passwordError(values.password),
    confirm: !values.confirm ? 'Type your password again.' : values.confirm !== values.password ? 'Passwords don’t match.' : '',
    terms: values.terms ? '' : 'Accept the terms to create an account.',
  }
  const errorFor = (field) => apiErrors[field] || (touched[field] || submitted ? rules[field] : '')
  const set = (field) => (event) => {
    const value = field === 'terms' ? event.target.checked : event.target.value
    setValues((current) => ({ ...current, [field]: value }))
    setApiErrors((current) => ({ ...current, [field]: '' }))
    // The Log in tab picks up the email (not the mobile, so it doesn't flip between the two).
    if (field === 'email') onIdentifier(value)
  }
  // Errors show once a field has been left with something in it (or after a submit), not while first typing.
  const blur = (field) => () => setTouched((current) => ({ ...current, [field]: current[field] || Boolean(values[field]) }))

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setAlert('')
    const first = fields.find((field) => rules[field])
    if (first) return focusId(fieldId(first))
    const { role, name, email, phone, city, businessName, contactNumber, bio, password } = values
    const result = await login('signup', () => signUp({ role, name, email, phone, city, businessName, contactNumber, bio, password }))
    if (result.cancelled || !result.error) return
    const { code, message, details } = result.error
    if (code === 'REGISTERED_LOGIN_FAILED') return onRegistered(email.trim().toLowerCase())
    // 400 VALIDATION_ERROR and 409 EMAIL_TAKEN / PHONE_TAKEN both carry per-field messages from the server.
    const shown = details ? Object.fromEntries(Object.entries(details).filter(([field]) => fields.includes(field))) : {}
    if (Object.keys(shown).length) {
      setApiErrors(shown)
      const field = fields.find((name) => shown[name])
      if (field) focusId(fieldId(field))
      if (Object.keys(shown).length < Object.keys(details).length) setAlert(message)
    } else {
      // RATE_LIMITED, NETWORK, or anything unexpected.
      if (!code) console.error('[auth] signup failed', result.error)
      setAlert(code ? message : 'We couldn’t create your account. Try again.')
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <RoleField value={values.role} onChange={(role) => setValues((current) => ({ ...current, role }))} disabled={busy === 'signup'} />
      <AuthField id="auth-name" name="name" label="Full name" autoComplete="name" autoCapitalize="words" value={values.name} onChange={set('name')} onBlur={blur('name')} error={errorFor('name')} data-autofocus />
      <AuthField id="auth-email" name="email" label="Email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" value={values.email} onChange={set('email')} onBlur={blur('email')} error={errorFor('email')} />
      <AuthField id="auth-phone" name="phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+92 300 1234567" hint="Pakistani mobile, like +92 300 1234567 or 0300-1234567" value={values.phone} onChange={set('phone')} onBlur={blur('phone')} error={errorFor('phone')} />
      <SelectField id="auth-city" name="city" label="City" autoComplete="address-level2" placeholder="Choose your city" options={CITY_NAMES} value={values.city} onChange={set('city')} onBlur={blur('city')} error={errorFor('city')} />
      {values.role !== 'customer' && (
        <AuthField id="auth-business-name" name="organization" label="Business name" autoComplete="organization" value={values.businessName} onChange={set('businessName')} onBlur={blur('businessName')} error={errorFor('businessName')} />
      )}
      {values.role === 'venue_owner' && (
        <AuthField id="auth-contact-number" name="contact-number" label="Business contact number" type="tel" inputMode="tel" autoComplete="off" placeholder="+92 300 1234567" hint="The number customers call about your venue. Can be the same as your mobile." value={values.contactNumber} onChange={set('contactNumber')} onBlur={blur('contactNumber')} error={errorFor('contactNumber')} />
      )}
      {values.role === 'decorator' && (
        <AuthField id="auth-bio" name="bio" label="About your services" autoComplete="off" maxLength={500} placeholder="Stage and floral decor for weddings and mehndis" hint="A short description customers see (up to 500 characters)" value={values.bio} onChange={set('bio')} onBlur={blur('bio')} error={errorFor('bio')} />
      )}
      <PasswordField id="auth-password" name="new-password" label="Password" autoComplete="new-password" hint="At least 8 characters, with letters and numbers" meter value={values.password} onChange={set('password')} onBlur={blur('password')} error={errorFor('password')} />
      <PasswordField id="auth-confirm" name="confirm-password" label="Confirm password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} onBlur={blur('confirm')} error={errorFor('confirm')} />
      <CheckboxField
        id="auth-terms"
        name="terms"
        label="I agree to MarkieSharkie’s Terms of Service and Privacy Policy."
        checked={values.terms}
        onChange={set('terms')}
        error={submitted ? errorFor('terms') : ''}
      />
      <FormAlert>{alert}</FormAlert>
      <SubmitButton loading={busy === 'signup'} loadingText="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  )
}

function ForgotStep({ identifier, busy, run, onSent, onBack }) {
  const [error, setError] = useState('')
  const kind = parseIdentifier(identifier)?.kind
  async function submit(event) {
    event.preventDefault()
    const result = await run('forgot', () => requestPasswordReset(identifier))
    if (result.cancelled) return
    if (result.error) return setError(result.error.message)
    onSent(result.value)
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink">
        We’ll send the code {kind === 'phone' ? 'by SMS to' : 'to'} <span className="font-semibold text-ink-strong">{describeIdentifier(identifier)}</span>.
      </p>
      <FormAlert>{error}</FormAlert>
      <SubmitButton loading={busy === 'forgot'} loadingText="Sending…" data-autofocus>
        Send code
      </SubmitButton>
      <button type="button" onClick={onBack} className={`${linkButton} mx-auto min-h-11 text-[14px]`}>
        Back to log in
      </button>
    </form>
  )
}

function ResetStep({ identifier, sent, busy, run, onResent, onDone, onBack }) {
  const [code, setCode] = useState(EMPTY_CODE)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState({})
  const [apiErrors, setApiErrors] = useState({})
  const [alert, setAlert] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const wait = Math.min(RESEND_SECONDS, Math.max(0, RESEND_SECONDS - Math.floor((now - sent.sentAt) / 1000)))

  useEffect(() => {
    if (wait <= 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [wait, sent.sentAt])

  const rules = {
    code: code.join('').length === 6 ? '' : 'Enter all 6 digits.',
    password: passwordError(password),
    confirm: !confirm ? 'Type your new password again.' : confirm !== password ? 'Passwords don’t match.' : '',
  }
  const errorFor = (field) => apiErrors[field] || (touched[field] || submitted ? rules[field] : '')

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setAlert('')
    const first = ['code', 'password', 'confirm'].find((field) => rules[field])
    if (first) return focusId({ code: 'auth-code', password: 'auth-new-password', confirm: 'auth-new-confirm' }[first])
    const result = await run('reset', () => resetPassword({ identifier, code: code.join(''), password }))
    if (result.cancelled) return
    if (!result.error) return onDone()
    const { code: errorCode, message } = result.error
    if (errorCode === 'CODE_INVALID') {
      setApiErrors({ code: message })
      setCode(EMPTY_CODE)
      focusId('auth-code')
    } else if (errorCode === 'CODE_EXPIRED') {
      setApiErrors({ code: message })
      setCode(EMPTY_CODE)
      // Resend appears once its wait is over; until then stay on the code.
      if (document.getElementById('auth-resend')) focusId('auth-resend')
      else focusId('auth-code')
    } else if (errorCode === 'VALIDATION') {
      setApiErrors({ password: message })
      focusId('auth-new-password')
    } else setAlert(message || 'We couldn’t reset your password. Try again.')
  }

  async function resend() {
    const result = await run('resend', () => requestPasswordReset(identifier))
    if (result.cancelled) return
    if (result.error) return setAlert(result.error.message)
    setApiErrors({})
    setCode(EMPTY_CODE)
    setNow(Date.now())
    onResent(result.value)
    focusId('auth-code')
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <HiddenUsername value={identifier} />
      <p className="rounded-xl border border-dashed border-outline-strong bg-surface px-4 py-3 text-[14px] text-ink">
        Demo: no {sent.channel === 'phone' ? 'SMS' : 'email'} is sent. Your code is <span className="font-heading text-[16px] font-semibold tracking-[0.2em] text-ink-strong">{sent.demoCode}</span>
      </p>
      <OtpInput
        id="auth-code"
        value={code}
        onChange={(next) => {
          setCode(next)
          setApiErrors((current) => ({ ...current, code: '' }))
        }}
        error={errorFor('code')}
      />
      <p className="-mt-2 text-[14px] text-muted-warm">
        {wait > 0 ? (
          <span aria-live="off">Didn’t get it? You can resend in 0:{String(wait).padStart(2, '0')}</span>
        ) : (
          <>
            Didn’t get it?{' '}
            <button id="auth-resend" type="button" onClick={resend} className={`${linkButton} min-h-11`}>
              {busy === 'resend' ? 'Sending…' : 'Resend code'}
            </button>
          </>
        )}
      </p>
      <PasswordField
        id="auth-new-password"
        name="new-password"
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters, with letters and numbers"
        meter
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          setApiErrors((current) => ({ ...current, password: '' }))
        }}
        onBlur={() => setTouched((current) => ({ ...current, password: current.password || Boolean(password) }))}
        error={errorFor('password')}
      />
      <PasswordField
        id="auth-new-confirm"
        name="confirm-password"
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        onBlur={() => setTouched((current) => ({ ...current, confirm: current.confirm || Boolean(confirm) }))}
        error={errorFor('confirm')}
      />
      <FormAlert>{alert}</FormAlert>
      <SubmitButton loading={busy === 'reset'} loadingText="Saving…">
        Reset password
      </SubmitButton>
      <button type="button" onClick={onBack} className={`${linkButton} mx-auto min-h-11 text-[14px]`}>
        Back to log in
      </button>
    </form>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/http.js'
import { getProfile, listMySearches, listMyServerBookings, updateProfile } from '../api/profile.js'
import Button from '../components/ui/Button.jsx'
import { ToastProvider } from '../features/admin/toast.jsx'
import { useToast } from '../features/admin/toastContext.js'
import { AuthField, FieldError, SelectField } from '../features/auth/fields.jsx'
import StatusBadge from '../features/booking/StatusBadge.jsx'
import { CITIES, EVENT_TYPES } from '../features/host/options.js'
import { BIO_MAX, bioError, budgetError, businessNameError, cityError, guestCountError, nameError, phoneError } from '../features/profile/rules.js'
import { formatEventDate } from '../lib/format.js'
import { formatAmount } from '../lib/money.js'
import { formatPkMobileIntl, normalizePkMobile } from '../lib/phone.js'

// /me: EUC-03 Manage Profile (REQ-4). Every logged-in role sees their details; customers, venue owners and
// decorators edit them (PATCH /me), admins get a read-only view (srs-alignment #24). Customers also see their past
// searches and bookings from the server (GET /me/searches, /me/bookings).

const CITY_NAMES = CITIES.map((c) => c.value)
const ROLE_LABELS = { customer: 'Customer', venue_owner: 'Venue owner', decorator: 'Decorator', admin: 'Admin' }
const EVENT_LABEL = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.label]))
const memberSince = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })
const searchedAt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })
const cityOptions = (current) => (current && !CITY_NAMES.includes(current) ? [current, ...CITY_NAMES] : CITY_NAMES)

export default function Profile() {
  return (
    <ToastProvider>
      <ProfilePage />
    </ToastProvider>
  )
}

function ProfilePage() {
  const [state, setState] = useState({ status: 'loading', user: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getProfile()
      .then((user) => !cancelled && setState({ status: 'ready', user }))
      .catch(() => !cancelled && setState({ status: 'error', user: null }))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const user = state.user
  return (
    <main id="main" className="mx-auto w-full max-w-[880px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <title>Your profile | MarkieSharkie</title>
      <h1 className="font-heading text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">Your profile</h1>
      {state.status === 'loading' && <ProfileSkeleton />}
      {state.status === 'error' && (
        <div role="alert" className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-[16px] font-semibold text-ink-strong">We couldn’t load your profile.</p>
          <p className="mt-1 text-[15px] text-muted-warm">Check your connection and try again.</p>
          <Button onClick={() => setAttempt((n) => n + 1)} className="mt-4 min-h-11 px-5">
            Try again
          </Button>
        </div>
      )}
      {user && (
        <>
          <AccountSummary user={user} />
          {user.role === 'admin' ? <AdminDetails user={user} /> : <ProfileForm user={user} onSaved={(next) => setState({ status: 'ready', user: next })} />}
          <PasswordNote />
          {user.role === 'customer' && (
            <>
              <PastSearches />
              <MyBookings />
            </>
          )}
        </>
      )}
    </main>
  )
}

function Section({ title, description, children, labelledBy }) {
  return (
    <section aria-labelledby={labelledBy} className="mt-8 rounded-[24px] border border-line bg-white p-5 sm:p-7">
      <h2 id={labelledBy} className="text-[20px] font-semibold text-ink-strong">
        {title}
      </h2>
      {description && <p className="mt-1 text-[14px] leading-relaxed text-muted-warm">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function AccountSummary({ user }) {
  return (
    <div className="mt-6 flex min-w-0 items-center gap-4 rounded-[24px] border border-line bg-surface px-5 py-5 sm:px-7">
      <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-[20px] font-semibold text-white">
        {user.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0].toUpperCase())
          .join('')}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[18px] font-semibold text-ink-strong">{user.name}</p>
        <p className="truncate text-[14px] text-muted-warm">{user.email}</p>
        <p className="mt-0.5 text-[13px] text-muted-warm">
          {ROLE_LABELS[user.role] ?? user.role}
          {user.createdAt && ` · Member since ${memberSince.format(new Date(user.createdAt))}`}
        </p>
      </div>
    </div>
  )
}

function AdminDetails({ user }) {
  const rows = [
    ['Name', user.name],
    ['Email', user.email],
    ['Mobile', formatPkMobileIntl(user.phone)],
    ['City', user.city],
  ]
  return (
    <Section title="Account details" labelledBy="details-heading" description="Admin accounts are managed by another admin, so these details can’t be edited here.">
      <dl className="grid gap-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[13px] font-medium text-muted-warm">{label}</dt>
            <dd className="mt-0.5 break-words text-[16px] text-ink-strong">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

// ---------------------------------------------------------------- edit form

function initialValues(user) {
  const p = user.preferences ?? {}
  return {
    name: user.name ?? '',
    phone: formatPkMobileIntl(user.phone) ?? '',
    city: user.city ?? '',
    businessName: user.businessName ?? '',
    contactNumber: formatPkMobileIntl(user.contactNumber) ?? '',
    bio: user.bio ?? '',
    serviceCity: user.serviceCity ?? '',
    preferredCity: p.preferredCity ?? '',
    eventTypes: p.eventTypes ?? [],
    guestCount: p.guestCount ? String(p.guestCount) : '',
    budgetMax: p.budgetMax ? String(p.budgetMax).replace(/\.00$/, '') : '',
  }
}

function validate(values, role) {
  const errors = { name: nameError(values.name), phone: phoneError(values.phone), city: cityError(values.city) }
  if (role === 'venue_owner') {
    errors.businessName = businessNameError(values.businessName)
    errors.contactNumber = phoneError(values.contactNumber, 'business contact number')
  }
  if (role === 'decorator') {
    errors.businessName = businessNameError(values.businessName)
    errors.bio = bioError(values.bio)
    errors.serviceCity = cityError(values.serviceCity, 'service city')
  }
  if (role === 'customer') {
    errors.guestCount = guestCountError(values.guestCount)
    errors.budgetMax = budgetError(values.budgetMax)
  }
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message))
}

// Only what changed goes to the server (it rejects an empty body).
function changesFrom(values, user) {
  const out = {}
  const trimmed = (key) => values[key].trim()
  if (trimmed('name') !== user.name) out.name = trimmed('name')
  if (normalizePkMobile(values.phone) !== user.phone) out.phone = values.phone.trim()
  if (trimmed('city') !== user.city) out.city = trimmed('city')
  if (user.role === 'venue_owner') {
    if (trimmed('businessName') !== user.businessName) out.businessName = trimmed('businessName')
    if (normalizePkMobile(values.contactNumber) !== user.contactNumber) out.contactNumber = values.contactNumber.trim()
  }
  if (user.role === 'decorator') {
    if (trimmed('businessName') !== user.businessName) out.businessName = trimmed('businessName')
    if (trimmed('bio') !== user.bio) out.bio = trimmed('bio')
    if (trimmed('serviceCity') !== user.serviceCity) out.serviceCity = trimmed('serviceCity')
  }
  if (user.role === 'customer') {
    const preferences = {}
    if (values.preferredCity) preferences.preferredCity = values.preferredCity
    if (values.eventTypes.length) preferences.eventTypes = values.eventTypes
    if (values.guestCount.trim()) preferences.guestCount = Number(values.guestCount.trim())
    if (values.budgetMax.trim()) preferences.budgetMax = values.budgetMax.replace(/,/g, '').trim()
    const before = user.preferences ?? {}
    const same =
      (before.preferredCity ?? '') === (preferences.preferredCity ?? '') &&
      JSON.stringify([...(before.eventTypes ?? [])].sort()) === JSON.stringify([...(preferences.eventTypes ?? [])].sort()) &&
      (before.guestCount ?? null) === (preferences.guestCount ?? null) &&
      String(before.budgetMax ?? '').replace(/\.00$/, '') === String(preferences.budgetMax ?? '').replace(/\.00$/, '')
    if (!same) out.preferences = preferences
  }
  return out
}

// Server field paths -> form field names ("preferences.guestCount" -> guestCount).
const fieldFromServer = (path) => path.replace(/^preferences\./, '')

function ProfileForm({ user, onSaved }) {
  const toast = useToast()
  const [values, setValues] = useState(() => initialValues(user))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)

  const errors = useMemo(() => validate(values, user.role), [values, user.role])
  const changes = useMemo(() => changesFrom(values, user), [values, user])
  const dirty = Object.keys(changes).length > 0
  const errorFor = (key) => serverErrors[key] || ((touched[key] || submitted) && errors[key]) || ''

  const set = (key) => (event) => {
    const value = event.target.value
    setValues((v) => ({ ...v, [key]: value }))
    setServerErrors((e) => ({ ...e, [key]: '' }))
  }
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }))
  const toggleEvent = (value) =>
    setValues((v) => ({ ...v, eventTypes: v.eventTypes.includes(value) ? v.eventTypes.filter((e) => e !== value) : [...v.eventTypes, value] }))

  const focusFirstError = useCallback((keys) => {
    const first = keys[0]
    if (first) requestAnimationFrame(() => formRef.current?.querySelector(`#profile-${first}`)?.focus())
  }, [])

  async function onSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setFormError('')
    const invalid = Object.keys(errors)
    if (invalid.length) return focusFirstError(invalid)
    if (!dirty) return
    setSaving(true)
    try {
      const next = await updateProfile(changes)
      onSaved(next)
      setValues(initialValues(next))
      setTouched({})
      setSubmitted(false)
      toast('Your profile is saved.')
    } catch (error) {
      if (error instanceof ApiError) {
        const mapped = Object.fromEntries(Object.entries(error.fieldErrors).map(([k, m]) => [fieldFromServer(k), m]))
        if (error.code === 'PHONE_TAKEN') mapped.phone = error.message
        setServerErrors(mapped)
        if (Object.keys(mapped).length) focusFirstError(Object.keys(mapped))
        else setFormError(error.message)
      } else setFormError('We couldn’t save your profile. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setValues(initialValues(user))
    setTouched({})
    setSubmitted(false)
    setServerErrors({})
    setFormError('')
  }

  return (
    <Section title="Your details" labelledBy="details-heading" description="Venues and decorators see your name and mobile number when you contact them.">
      <form ref={formRef} noValidate onSubmit={onSubmit} aria-describedby={formError ? 'profile-form-error' : undefined}>
        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField id="profile-name" name="name" label="Full name" autoComplete="name" value={values.name} onChange={set('name')} onBlur={blur('name')} error={errorFor('name')} className="sm:col-span-2" />
          <AuthField id="profile-email" label="Email" value={user.email} readOnly disabled hint="Your email can’t be changed here." className="sm:col-span-2" />
          <AuthField id="profile-phone" name="phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+92 300 1234567" value={values.phone} onChange={set('phone')} onBlur={blur('phone')} error={errorFor('phone')} hint="0300-1234567 or +92 300 1234567" />
          <SelectField id="profile-city" name="city" label="City" autoComplete="address-level2" placeholder="Choose your city" options={cityOptions(values.city)} value={values.city} onChange={set('city')} onBlur={blur('city')} error={errorFor('city')} />

          {user.role === 'venue_owner' && (
            <>
              <AuthField id="profile-businessName" name="businessName" label="Business name" autoComplete="organization" value={values.businessName} onChange={set('businessName')} onBlur={blur('businessName')} error={errorFor('businessName')} />
              <AuthField id="profile-contactNumber" name="contactNumber" label="Business contact number" type="tel" inputMode="tel" placeholder="+92 300 1234567" value={values.contactNumber} onChange={set('contactNumber')} onBlur={blur('contactNumber')} error={errorFor('contactNumber')} hint="Customers call this number about bookings." />
            </>
          )}

          {user.role === 'decorator' && (
            <>
              <AuthField id="profile-businessName" name="businessName" label="Business name" autoComplete="organization" value={values.businessName} onChange={set('businessName')} onBlur={blur('businessName')} error={errorFor('businessName')} />
              <SelectField id="profile-serviceCity" name="serviceCity" label="Service city" placeholder="Choose a city" options={cityOptions(values.serviceCity)} value={values.serviceCity} onChange={set('serviceCity')} onBlur={blur('serviceCity')} error={errorFor('serviceCity')} />
              <BioField value={values.bio} onChange={set('bio')} onBlur={blur('bio')} error={errorFor('bio')} />
            </>
          )}

          {user.role === 'customer' && (
            <fieldset className="min-w-0 sm:col-span-2">
              <legend className="text-[16px] font-semibold text-ink-strong">Preferences</legend>
              <p className="mt-0.5 text-[14px] text-muted-warm">Optional. They help us suggest venues for you.</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <SelectField id="profile-preferredCity" name="preferredCity" label="Preferred city" placeholder="Any city" options={cityOptions(values.preferredCity)} value={values.preferredCity} onChange={set('preferredCity')} error={errorFor('preferredCity')} />
                <AuthField id="profile-guestCount" name="guestCount" label="Usual guest count" inputMode="numeric" placeholder="e.g. 300" value={values.guestCount} onChange={set('guestCount')} onBlur={blur('guestCount')} error={errorFor('guestCount')} />
                <AuthField id="profile-budgetMax" name="budgetMax" label="Budget up to (Rs)" inputMode="decimal" placeholder="e.g. 500000" value={values.budgetMax} onChange={set('budgetMax')} onBlur={blur('budgetMax')} error={errorFor('budgetMax')} className="sm:col-span-2" />
              </div>
              <fieldset className="mt-5 min-w-0">
                <legend className="mb-2 text-[14px] font-medium text-ink-strong">Events you plan</legend>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map((event) => {
                    const checked = values.eventTypes.includes(event.value)
                    return (
                      <label key={event.value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${checked ? 'border-primary bg-primary/5 text-primary' : 'border-outline-strong text-ink-strong hover:border-ink'}`}>
                        <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleEvent(event.value)} />
                        {checked && <span aria-hidden="true">✓</span>}
                        {event.label}
                      </label>
                    )
                  })}
                </div>
                <FieldError id="profile-eventTypes-error">{errorFor('eventTypes')}</FieldError>
              </fieldset>
            </fieldset>
          )}
        </div>

        <div aria-live="polite">
          {formError && (
            <p id="profile-form-error" role="alert" className="mt-5 rounded-xl bg-danger-bg px-4 py-3 text-[14px] text-danger">
              {formError}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || !dirty} aria-disabled={saving || !dirty} className="min-h-12 px-6 text-[15px] disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {dirty && !saving && (
            <Button variant="outline" onClick={reset} className="min-h-12 px-6 text-[15px]">
              Discard
            </Button>
          )}
          {!dirty && <span className="text-[14px] text-muted-warm">No unsaved changes.</span>}
        </div>
      </form>
    </Section>
  )
}

function BioField({ value, onChange, onBlur, error }) {
  const left = BIO_MAX - value.trim().length
  return (
    <div className="sm:col-span-2">
      <label htmlFor="profile-bio" className="mb-1.5 block text-[14px] font-medium text-ink-strong">
        About your services
      </label>
      <textarea
        id="profile-bio"
        name="bio"
        rows={4}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={`profile-bio-count${error ? ' profile-bio-error' : ''}`}
        className="block w-full rounded-xl border border-outline-strong bg-white px-4 py-3 text-[16px] text-ink-strong hover:border-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary aria-[invalid=true]:border-danger"
      />
      <p id="profile-bio-count" className={`mt-1.5 text-[13px] ${left < 0 ? 'text-danger' : 'text-muted-warm'}`}>
        {left >= 0 ? `${left} characters left` : `${-left} characters over the limit`}
      </p>
      <FieldError id="profile-bio-error">{error}</FieldError>
    </div>
  )
}

function PasswordNote() {
  return (
    <section aria-labelledby="password-heading" className="mt-8 rounded-[24px] border border-line bg-white p-5 sm:p-7">
      <h2 id="password-heading" className="text-[20px] font-semibold text-ink-strong">
        Password
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-muted-warm">
        To change your password, log out and choose “Forgot password?” on the login screen. We’ll email you a 6-digit code.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------- customer history

function usePaged(load) {
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const key = `${page}:${attempt}`
  // `key` says which request a result belongs to, so "loading" is derived instead of set inside the effect.
  const [result, setResult] = useState({ key: null, status: 'loading', data: [], total: 0, pageSize: 10 })
  useEffect(() => {
    let cancelled = false
    load({ page, pageSize: 10 })
      .then((res) => !cancelled && setResult({ key, status: 'ready', data: res.data, total: res.total, pageSize: res.pageSize }))
      .catch(() => !cancelled && setResult((s) => ({ ...s, key, status: 'error' })))
    return () => {
      cancelled = true
    }
  }, [load, page, key])
  const status = result.key === key ? result.status : 'loading'
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))
  return { ...result, status, page, pages, setPage, retry: () => setAttempt((n) => n + 1) }
}

function ListState({ state, empty, children }) {
  if (state.status === 'loading' && !state.data.length) return <SkeletonList />
  if (state.status === 'error')
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-3 text-[14px] text-ink-strong">
        We couldn’t load this list.
        <button type="button" onClick={state.retry} className="min-h-11 cursor-pointer font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
          Try again
        </button>
      </div>
    )
  if (!state.data.length) return empty
  return (
    <>
      {children}
      {state.pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-[14px]">
          <Button variant="outline" disabled={state.page <= 1} onClick={() => state.setPage(state.page - 1)} className="min-h-11 px-4 disabled:opacity-40">
            Previous
          </Button>
          <span className="text-muted-warm">
            Page {state.page} of {state.pages}
          </span>
          <Button variant="outline" disabled={state.page >= state.pages} onClick={() => state.setPage(state.page + 1)} className="min-h-11 px-4 disabled:opacity-40">
            Next
          </Button>
        </nav>
      )}
    </>
  )
}

function EmptyNote({ title, body, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-strong px-5 py-8 text-center">
      <p className="text-[16px] font-semibold text-ink-strong">{title}</p>
      <p className="mx-auto mt-1 max-w-[42ch] text-[14px] text-muted-warm">{body}</p>
      {action}
    </div>
  )
}

const FILTER_KEYS = { city: null, guests: 'guests', date: 'date', eventType: 'event', venueType: 'setting', minPrice: 'from Rs', maxPrice: 'up to Rs', minRating: 'rating' }

// search_history.filters holds the Explore query parameters, so "Search again" can rebuild the link.
function searchSummary(item) {
  const f = item.filters ?? {}
  const parts = []
  for (const [key, label] of Object.entries(FILTER_KEYS)) {
    const value = f[key]
    if (value === undefined || value === null || value === '' || key === 'city') continue
    parts.push(label ? `${label} ${Array.isArray(value) ? value.join(', ') : value}` : String(value))
  }
  return parts.join(' · ')
}

function searchHref(item) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(item.filters ?? {})) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const query = params.toString()
  return `/explore${query ? `?${query}` : ''}`
}

function PastSearches() {
  const load = useCallback((options) => listMySearches(options), [])
  const state = usePaged(load)
  return (
    <Section title="Past searches" labelledBy="searches-heading" description="Searches you made while logged in.">
      <ListState state={state} empty={<EmptyNote title="No searches yet" body="When you search for venues while logged in, they show up here so you can run them again." action={<Button to="/explore" className="mt-4 min-h-11 px-5">Explore venues</Button>} />}>
        <ul className="divide-y divide-line">
          {state.data.map((item) => (
            <li key={item.id ?? item.searchId ?? item.searchedAt} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink-strong">{item.queryText || item.filters?.city || 'All cities'}</p>
                <p className="text-[13px] text-muted-warm">
                  {[searchSummary(item), `${item.resultsCount ?? 0} results`, item.searchedAt && searchedAt.format(new Date(item.searchedAt))].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Link to={searchHref(item)} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-primary">
                Search again
              </Link>
            </li>
          ))}
        </ul>
      </ListState>
    </Section>
  )
}

function MyBookings() {
  const load = useCallback((options) => listMyServerBookings(options), [])
  const state = usePaged(load)
  return (
    <Section title="My bookings" labelledBy="bookings-heading" description="Your bookings on MarkieSharkie, newest event first.">
      <ListState state={state} empty={<EmptyNote title="No bookings yet" body="When you book a venue, it shows up here with its status." action={<Button to="/explore" className="mt-4 min-h-11 px-5">Find a venue</Button>} />}>
        <ul className="grid gap-3">
          {state.data.map((booking) => (
            <li key={booking.id} className="min-w-0 rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/venues/${booking.venue.id}`} className="block truncate text-[16px] font-semibold text-ink-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                    {booking.venue.name}
                  </Link>
                  <p className="text-[13px] text-muted-warm">
                    {[booking.hall?.name, booking.venue.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <StatusBadge booking={booking} />
              </div>
              <p className="mt-2 text-[14px] text-ink">
                {[booking.slot?.date ? formatEventDate(booking.slot.date.slice(0, 10)) : null, EVENT_LABEL[booking.eventType] ?? booking.eventType, `${booking.guestCount} guests`, Number(booking.totalAmount) > 0 ? formatAmount(booking.totalAmount) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </ListState>
    </Section>
  )
}

function SkeletonList() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
      ))}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your profile" className="mt-6 grid gap-6">
      <div className="h-24 animate-pulse rounded-[24px] bg-surface motion-reduce:animate-none" />
      <div className="h-80 animate-pulse rounded-[24px] bg-surface motion-reduce:animate-none" />
    </div>
  )
}

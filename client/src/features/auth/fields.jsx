import { useRef, useState } from 'react'
import { passwordStrength } from '../../lib/accountRules.js'

// Form controls for the login modal. Every control has a visible label; an error sits under its field and is
// linked with aria-describedby (`${id}-error`), so the modal can focus the first invalid field by id.

const inputClass =
  'block h-12 w-full rounded-xl border border-outline-strong bg-white px-4 text-[16px] text-ink-strong placeholder:text-placeholder transition-colors hover:border-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary aria-[invalid=true]:border-danger'
const labelClass = 'mb-1.5 block text-[14px] font-medium text-ink-strong'
const describedBy = (...ids) => ids.filter(Boolean).join(' ') || undefined

// The live wrapper is always mounted, so an error that appears while the field keeps focus (Wrong password after
// Enter) is still announced.
export function FieldError({ id, children }) {
  return <div aria-live="polite">{children && <ErrorLine id={id}>{children}</ErrorLine>}</div>
}

function ErrorLine({ id, children }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-danger">
      <svg viewBox="0 0 24 24" className="mt-px size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

export function AuthField({ id, label, error, hint, className = '', ...props }) {
  const hintId = hint ? `${id}-hint` : null
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(hintId, error && `${id}-error`)} className={inputClass} {...props} />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[13px] text-muted-warm">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}

export function SelectField({ id, label, error, options, placeholder, className = '', ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <select id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={`${inputClass} cursor-pointer appearance-none pr-10`} {...props}>
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-warm" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}

const EyeIcon = ({ open }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <path d="M4 4l16 16" />}
  </svg>
)

// Password with a show / hide toggle (type switches, the value stays). `meter` adds the strength meter (advice
// only; the rule is passwordError in lib/accountRules.js).
export function PasswordField({ id, label, error, value, meter = false, hint, className = '', ...props }) {
  const [shown, setShown] = useState(false)
  const meterId = meter ? `${id}-strength` : null
  const hintId = hint ? `${id}-hint` : null
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, meterId, error && `${id}-error`)}
          className={`${inputClass} pr-14`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-label="Show password"
          aria-pressed={shown}
          aria-controls={id}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted-warm hover:text-ink-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <EyeIcon open={!shown} />
        </button>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-[13px] text-muted-warm">
          {hint}
        </p>
      )}
      {meter && <StrengthMeter id={meterId} value={value} />}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}

const STRENGTH_COLORS = ['', 'bg-danger', 'bg-gold', 'bg-success', 'bg-success']
const STRENGTH_TEXT = ['', 'text-danger', 'text-pending', 'text-success', 'text-success']

function StrengthMeter({ id, value }) {
  const { score, label } = passwordStrength(value)
  return (
    <div className="mt-2 flex items-center gap-3">
      <div aria-hidden="true" className="grid flex-1 grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={`h-1.5 rounded-full transition-colors ${step <= score ? STRENGTH_COLORS[score] : 'bg-line'}`} />
        ))}
      </div>
      <p id={id} className={`min-w-[4.5rem] text-right text-[13px] font-medium ${score ? STRENGTH_TEXT[score] : 'text-muted-warm'}`}>
        {label ? `Strength: ${label}` : <span className="sr-only">Password strength appears as you type</span>}
      </p>
    </div>
  )
}

export function CheckboxField({ id, label, error, className = '', ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-[14px] leading-snug text-ink">
        <input id={id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="mt-px size-5 shrink-0 cursor-pointer accent-primary" {...props} />
        <span>{label}</span>
      </label>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}

// Six one-digit boxes for the reset code: typing moves on, Backspace moves back, arrows move, and a pasted or
// autofilled code (autocomplete="one-time-code" on the first box) fills them all. `value` is an array of 6 strings.
export function OtpInput({ id, value, onChange, error, label = '6-digit code' }) {
  const boxes = useRef([])
  const focusBox = (index) => boxes.current[Math.max(0, Math.min(5, index))]?.focus()

  function fill(start, text) {
    const all = text.replace(/\D/g, '')
    // A whole code pasted into any box fills from the first one.
    if (all.length === 6) start = 0
    const digits = all.slice(0, 6 - start)
    if (!digits) return
    const next = [...value]
    digits.split('').forEach((digit, offset) => (next[start + offset] = digit))
    onChange(next)
    focusBox(start + digits.length)
  }

  function onKeyDown(event, index) {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault()
      const next = [...value]
      next[index - 1] = ''
      onChange(next)
      focusBox(index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined}>
      <legend className={labelClass}>{label}</legend>
      <div className="grid grid-cols-6 gap-2">
        {value.map((digit, index) => (
          <input
            key={index}
            ref={(node) => (boxes.current[index] = node)}
            id={index === 0 ? id : `${id}-${index}`}
            value={digit}
            onChange={(event) => {
              const text = event.target.value
              if (!text) {
                const next = [...value]
                next[index] = ''
                onChange(next)
              } else if (digit && text.length === 2) {
                // Typed over a filled box: keep the new digit, wherever the caret was.
                fill(index, text[0] === digit ? text[1] : text[0])
              } else fill(index, text)
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPaste={(event) => {
              event.preventDefault()
              fill(index, event.clipboardData.getData('text'))
            }}
            onFocus={(event) => event.target.select()}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            data-autofocus={index === 0 || undefined}
            aria-label={`Digit ${index + 1} of 6`}
            aria-invalid={error ? true : undefined}
            className="h-12 w-full min-w-0 rounded-xl border border-outline-strong bg-white text-center font-heading text-[20px] font-semibold tabular-nums text-ink-strong hover:border-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary aria-[invalid=true]:border-danger"
          />
        ))}
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </fieldset>
  )
}

export function FormAlert({ children, action }) {
  if (!children) return null
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-danger/25 bg-danger-bg px-4 py-3 text-[14px] leading-snug text-danger">
      <p>{children}</p>
      {action}
    </div>
  )
}

export function Notice({ tone = 'info', children }) {
  if (!children) return null
  const tones = { info: 'border-info/20 bg-info-bg text-info', success: 'border-success/25 bg-success-bg text-success' }
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-[14px] leading-snug ${tones[tone]}`}>
      {children}
    </p>
  )
}

export function SubmitButton({ loading, children, loadingText, ...props }) {
  return (
    <button
      type="submit"
      aria-disabled={loading ? true : undefined}
      {...props}
      className={`flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-linear-to-r from-primary to-primary-bright text-[16px] font-semibold text-white shadow-chip transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${loading ? 'cursor-wait opacity-85' : ''}`}
    >
      {loading && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
      {loading ? loadingText : children}
    </button>
  )
}

import { useId, useState } from 'react'
import HostIcon from './icons.jsx'
import { useWizard } from './WizardContext.js'
import { newId } from './draft.js'
import { fieldId, inputClass } from './fieldStyles.js'

// Form building blocks for the host wizard. Every control has a visible label; errors sit under the field and
// are linked with aria-describedby. Error ids are derived from the field id: `${id}-error`.

export function StepHeading({ title, subtitle, eyebrow }) {
  return (
    <header className="mb-8 sm:mb-10">
      {eyebrow && <p className="mb-3 text-[15px] font-medium text-muted-warm">{eyebrow}</p>}
      {/* Focused after each step change (HostWizard) so screen readers announce the new question. */}
      <h1 tabIndex={-1} data-step-heading className="font-heading text-[28px] font-semibold leading-tight text-balance text-ink-strong outline-none sm:text-[36px]">
        {title}
      </h1>
      {subtitle && <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-muted-warm sm:text-[18px]">{subtitle}</p>}
    </header>
  )
}

export function ErrorText({ id, children }) {
  if (!children) return null
  return (
    <p id={id} data-error className="mt-2 flex items-start gap-1.5 text-[14px] leading-snug text-danger">
      <svg viewBox="0 0 24 24" className="mt-px size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

const describedBy = (...ids) => ids.filter(Boolean).join(' ') || undefined

// Text input bound to a draft path. `path` is the error key and also becomes the element id.
export function TextField({ path, label, hint, value, onChange, optional, className = '', inputClassName = '', prefix, suffix, ...props }) {
  const { errorFor, touch } = useWizard()
  const id = fieldId(path)
  const error = errorFor(path)
  const hintId = hint ? `${id}-hint` : null
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-[15px] font-medium text-ink-strong">
        {label}
        {optional && <span className="font-normal text-muted-warm"> (optional)</span>}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[16px] text-muted-warm">{prefix}</span>}
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => touch(path)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(hintId, error && `${id}-error`)}
          className={`${inputClass} h-14 ${prefix ? 'pl-12' : ''} ${inputClassName}`}
          {...props}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[16px] text-muted-warm">{suffix}</span>}
      </div>
      {hint && (
        <p id={hintId} className="mt-2 text-[14px] text-muted-warm">
          {hint}
        </p>
      )}
      <ErrorText id={`${id}-error`}>{error}</ErrorText>
    </div>
  )
}

export function TextArea({ path, label, hint, value, onChange, maxLength, minLength, rows = 6, className = '', ...props }) {
  const { errorFor, touch } = useWizard()
  const id = fieldId(path)
  const error = errorFor(path)
  const length = value.trim().length
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-[15px] font-medium text-ink-strong">
          {label}
        </label>
        {/* Visible counter only; screen readers get the limit from the hint instead of a live count per key. */}
        <span aria-hidden="true" className={`text-[14px] tabular-nums ${length > maxLength ? 'text-danger' : 'text-muted-warm'}`}>
          {length}/{maxLength}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => touch(path)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(`${id}-hint`, error && `${id}-error`)}
        className={`${inputClass} resize-y py-3 leading-relaxed`}
        {...props}
      />
      <p id={`${id}-hint`} className="mt-2 text-[14px] text-muted-warm">
        {hint ?? (minLength ? `${minLength} to ${maxLength} characters.` : `Up to ${maxLength} characters.`)}
      </p>
      <ErrorText id={`${id}-error`}>{error}</ErrorText>
    </div>
  )
}

export function SelectField({ path, label, value, onChange, options, placeholder, className = '' }) {
  const { errorFor, touch } = useWizard()
  const id = fieldId(path)
  const error = errorFor(path)
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-[15px] font-medium text-ink-strong">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => touch(path)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} h-14 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23241f20'%20stroke-width='2'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E")] bg-[length:20px] bg-[right_16px_center] bg-no-repeat pr-12`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label ?? option.value}
          </option>
        ))}
      </select>
      <ErrorText id={`${id}-error`}>{error}</ErrorText>
    </div>
  )
}

// Big selectable card around a real radio or checkbox, so arrow keys / Space and screen readers work natively.
export function ChoiceCard({ type = 'radio', name, value, checked, onChange, icon, label, description, className = '' }) {
  return (
    <label
      className={`group relative flex cursor-pointer flex-col justify-between gap-4 rounded-2xl border bg-white p-4 transition-[border-color,box-shadow,background-color] duration-150 hover:border-ink-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary sm:p-5 ${
        checked ? 'border-primary bg-blush shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-outline-strong'
      } ${className}`}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      {icon && (
        <span className={checked ? 'text-primary' : 'text-ink-strong'}>
          <HostIcon name={icon} className="size-8" />
        </span>
      )}
      <span>
        <span className="block text-[16px] font-medium text-ink-strong">{label}</span>
        {description && <span className="mt-1 block text-[14px] leading-snug text-muted-warm">{description}</span>}
      </span>
      {checked && (
        <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-primary text-white">
          <HostIcon name="check" className="size-4" strokeWidth={2.5} />
        </span>
      )}
    </label>
  )
}

const roundButton =
  'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-outline-strong text-ink-strong transition-colors hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-outline-strong'

// − value + stepper. The value is announced through the group label.
export function Counter({ label, value, min, max, onChange, id }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex items-center justify-between gap-4" id={id}>
      <span id={labelId} className="text-[17px] text-ink-strong sm:text-[18px]">
        {label}
      </span>
      <div className="flex items-center gap-3">
        {/* aria-disabled, not disabled: a disabled button drops keyboard focus to <body>. */}
        <button type="button" className={roundButton} onClick={() => value > min && onChange(value - 1)} aria-disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          <HostIcon name="minus" className="size-4" strokeWidth={2} />
        </button>
        <output aria-live="polite" className="w-8 text-center text-[17px] tabular-nums text-ink-strong">
          {value}
        </output>
        <button type="button" className={roundButton} onClick={() => value < max && onChange(value + 1)} aria-disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          <HostIcon name="plus" className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label, description, id }) {
  const descriptionId = useId()
  return (
    <div className="flex items-center justify-between gap-6">
      <span>
        <label htmlFor={id} className="block cursor-pointer text-[16px] font-medium text-ink-strong">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="mt-1 block text-[14px] text-muted-warm">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-[52px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${
          checked ? 'bg-primary' : 'bg-outline-strong'
        }`}
      >
        <span
          className={`absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </div>
  )
}

// Tags typed one at a time: Enter or comma adds, Backspace on an empty field removes the last, each tag has its
// own remove button. Pasting "a, b, c" adds three.
export function TagInput({ path, label, hint, tags, onChange, placeholder, maxTags = 40 }) {
  const { errorFor, touch } = useWizard()
  const [text, setText] = useState('')
  const id = fieldId(path)
  const error = errorFor(path)

  function add(raw) {
    const names = raw
      .split(',')
      .map((name) => name.trim().slice(0, 60))
      .filter(Boolean)
    const seen = new Set(tags.map((tag) => tag.name.toLowerCase()))
    const fresh = []
    for (const name of names) {
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      fresh.push({ itemId: newId(), name })
    }
    if (fresh.length) onChange([...tags, ...fresh].slice(0, maxTags))
    setText('')
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[15px] font-medium text-ink-strong">
        {label}
      </label>
      <div className="rounded-xl border border-outline-strong bg-white p-2 has-[:focus-visible]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[[aria-invalid=true]]:border-danger">
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-2 p-1" aria-label={`${label}, ${tags.length} added`}>
            {tags.map((tag) => (
              <li key={tag.itemId ?? tag.name} className="flex items-center gap-1 rounded-full bg-rose py-1 pl-3 pr-1 text-[14px] text-ink-strong">
                {tag.name}
                <button
                  type="button"
                  onClick={() => {
                    onChange(tags.filter((t) => t !== tag))
                    document.getElementById(id)?.focus() // the button is gone; keep focus in the field
                  }}
                  aria-label={`Remove ${tag.name}`}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <HostIcon name="x" className="size-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            const value = event.target.value
            if (value.includes(',')) add(value)
            else setText(value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim()) {
              // Add the tag instead of moving to the next step.
              event.preventDefault()
              add(text)
            } else if (event.key === 'Backspace' && !text && tags.length) {
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={() => {
            if (text.trim()) add(text)
            touch(path)
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(`${id}-hint`, error && `${id}-error`)}
          className="h-11 w-full min-w-0 bg-transparent px-2 text-[16px] text-ink-strong outline-none placeholder:text-placeholder"
        />
      </div>
      <p id={`${id}-hint`} className="mt-2 text-[14px] text-muted-warm">
        {hint}
      </p>
      <ErrorText id={`${id}-error`}>{error}</ErrorText>
    </div>
  )
}

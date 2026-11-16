// Shared by the wizard's form controls (fields.jsx) and steps with custom inputs.
export const inputClass =
  'block w-full rounded-xl border border-outline-strong bg-white px-4 text-[16px] text-ink-strong placeholder:text-placeholder transition-colors hover:border-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary aria-[invalid=true]:border-danger'

// Dotted draft path -> a valid, stable element id ("halls.0.name" -> "field-halls-0-name").
export const fieldId = (path) => `field-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`

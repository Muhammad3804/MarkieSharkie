import { useSyncExternalStore } from 'react'
import { loadDraft, saveDraft } from '../../api/host.js'
import { emptyDraft } from './draft.js'

// The wizard's draft, kept in memory and written through saveDraft() on every change (autosave). `saved` is false
// when storage refused the write, so the header can say so instead of claiming it saved.
const listeners = new Set()
let state = null

function current() {
  if (!state) state = { draft: loadDraft() ?? emptyDraft(), saved: true }
  return state
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateDraft(recipe, { edit = true } = {}) {
  const next = recipe(current().draft)
  if (next === current().draft) return
  const draft = edit ? { ...next, updatedAt: new Date().toISOString() } : next
  state = { draft, saved: saveDraft(draft) }
  emit()
}

// Where "Continue your listing" reopens the wizard. Not an edit, so "Last edited" doesn't change.
export function setLastStep(step) {
  if (current().draft.lastStep !== step) updateDraft((draft) => ({ ...draft, lastStep: step }), { edit: false })
}

// After submitting or "Start over": the next read starts from storage again. Deliberately doesn't notify, so a
// still-mounted wizard never re-renders with an empty draft; call it once the wizard is gone.
export function resetDraftStore() {
  state = null
}

export function useDraftState() {
  return useSyncExternalStore(subscribe, current, current)
}

// Two "admin data changed" signals:
//   - data:   after a write, admin pages refetch (features/admin/hooks.js useAdminData). Also fires when another tab
//             of this browser made a change (through localStorage).
//   - counts: the sidebar badge numbers were reloaded; only the badges re-read (pages don't refetch for this).
const channels = { data: new Set(), counts: new Set() }
const KEY = 'markiesharkie:admin-changed'
const emit = (name) => {
  for (const listener of channels[name]) listener()
}

export function subscribeAdminChanges(listener, { counts = false } = {}) {
  channels.data.add(listener)
  if (counts) channels.counts.add(listener)
  return () => {
    channels.data.delete(listener)
    channels.counts.delete(listener)
  }
}

export function notifyAdminChange() {
  emit('data')
  try {
    localStorage.setItem(KEY, String(Date.now()))
  } catch {
    // storage blocked: this tab still refreshes
  }
}

export function notifyCountsChange() {
  emit('counts')
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) emit('data')
  })
}

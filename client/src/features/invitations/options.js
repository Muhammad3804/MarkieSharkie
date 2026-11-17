// Invitation builder choices. `template` and `eventType` are proposed [Design] columns on `invitations`
// (srs-alignment #21); the SRS invitation only has title, message, date, time and the share link (REQ-36).

export const INVITE_TEMPLATES = [
  { value: 'classic', label: 'Classic maroon & gold', description: 'Deep maroon, gold frame, serif type. Formal and timeless.' },
  { value: 'floral', label: 'Floral pastel', description: 'Soft blush, hand-drawn flowers, flowing script.' },
  { value: 'modern', label: 'Modern minimal', description: 'White space, bold type, one maroon accent.' },
  { value: 'mehndi', label: 'Mehndi festive', description: 'Green and marigold, mandala and bunting, with Urdu lettering.' },
]
export const templateLabel = (value) => INVITE_TEMPLATES.find((t) => t.value === value)?.label ?? ''

// The brief's list. Booking event types outside it (conference, religious gathering) start as "Other".
export const INVITE_EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding', urdu: 'شادی' },
  { value: 'walima', label: 'Walima', urdu: 'ولیمہ' },
  { value: 'mehndi', label: 'Mehndi', urdu: 'مہندی' },
  { value: 'barat', label: 'Barat', urdu: 'بارات' },
  { value: 'engagement', label: 'Engagement', urdu: 'منگنی' },
  { value: 'birthday', label: 'Birthday', urdu: 'سالگرہ' },
  { value: 'corporate', label: 'Corporate', urdu: 'تقریب' },
  { value: 'other', label: 'Other', urdu: 'تقریب' },
]
export const inviteEventType = (value) => INVITE_EVENT_TYPES.find((t) => t.value === value) ?? INVITE_EVENT_TYPES.at(-1)

export const LIMITS = { title: 80, hostNames: 120, message: 300 }

// Guests answer for their whole party (proposed `rsvps.party_size`, srs-alignment #21).
export const MAX_PARTY_SIZE = 20

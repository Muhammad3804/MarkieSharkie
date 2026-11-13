// Shared venue labels used by both the UI and the mock data.

// Venue detail tabs, in the order of the Figma section nav (61:5).
export const VENUE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'halls', label: 'Halls' },
  { id: 'menu', label: 'Menu' },
  { id: 'availability', label: 'Availability' },
  { id: 'reviews', label: 'Reviews' },
]

// venues.facilities keys and their labels; the first six have icons in the design.
export const AMENITIES = [
  { key: 'garden', label: 'Landscaped garden' },
  { key: 'decor', label: 'Stage décor options' },
  { key: 'valet', label: 'Valet parking' },
  { key: 'climate', label: 'Climate-controlled halls' },
  { key: 'catering', label: 'In-house catering' },
  { key: 'access', label: 'Step-free access' },
  { key: 'bridal', label: 'Bridal suite' },
  { key: 'generator', label: 'Backup generator' },
  { key: 'prayer', label: 'Prayer area' },
  { key: 'sound', label: 'Sound system and SMD screens' },
  { key: 'wifi', label: 'Guest Wi-Fi' },
  { key: 'security', label: 'On-site security staff' },
  { key: 'family', label: 'Separate family seating' },
  { key: 'photo', label: 'Photography spots' },
]

// Labels for the event_type enum values used on reviews.
export const EVENT_LABELS = {
  wedding: 'Wedding',
  mehndi: 'Mehndi event',
  barat: 'Barat',
  walima: 'Walima reception',
  engagement: 'Engagement',
  birthday: 'Birthday',
  corporate: 'Corporate event',
}

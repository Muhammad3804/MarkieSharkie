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

// Photo gallery sections, in the order of the Figma gallery frame (90:1063). `detail` is the line under the copy.
// Image categories are UI-only: venue_images has no category column in the ERD.
export const GALLERY_SECTIONS = [
  { key: 'tour', title: '360 virtual tour', description: 'Explore the venue from every angle with a guided 360 walkthrough of the halls, suites and arrival spaces.', detail: () => 'Interactive walkthrough' },
  { key: 'hall', title: 'Hall', description: 'A generous, climate-controlled banquet hall with layered ceiling details, warm ambient light and flexible seating plans.', detail: (venue, hall) => `${hall.name} · ${hall.capacity.toLocaleString('en-US')} guests` },
  { key: 'stage', title: 'Stage', description: 'A raised focal stage with generous sightlines, adaptable florals and production-ready lighting for every ceremony style.', detail: () => 'Custom décor ready' },
  { key: 'bridal', title: 'Bridal room', description: 'A calm, private suite for final preparations, complete with a dressing table, full-length mirrors and comfortable seating.', detail: () => 'Private suite' },
  { key: 'bathroom', title: 'Bathroom', description: 'A bright, well-appointed private bathroom adjoining the bridal room, finished in clean stone and brushed brass.', detail: () => 'Suite access' },
  { key: 'parking', title: 'Parking area', description: 'A dedicated, stewarded arrival area with direct access to the halls and ample room for guest drop-off and parking.', detail: (venue) => `${venue.parkingSpaces} vehicles` },
  { key: 'entrance', title: 'Entrance', description: 'A landscaped approach and statement façade create a composed first impression from arrival through reception.', detail: () => 'Private guest arrival' },
  { key: 'hallway', title: 'Hallway', description: 'Wide, softly lit corridors connect each guest area with intuitive wayfinding and step-free access throughout.', detail: () => 'Step-free circulation' },
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

// Choices offered in the "Become a host" wizard. Values that land in the database use the enum values from
// db/schema.sql; anything marked UI-only has no column yet (see docs/progress.md, "Host wizard").

// UI-only listing category (the cards on the first question). venues.venue_type (REQ-5: indoor / outdoor /
// semi_outdoor) is derived from the halls instead, see deriveVenueType() in draft.js.
export const VENUE_CATEGORIES = [
  { value: 'marquee', label: 'Marquee', icon: 'tent' },
  { value: 'banquet_hall', label: 'Banquet hall', icon: 'building' },
  { value: 'lawn', label: 'Lawn / outdoor', icon: 'trees' },
  { value: 'farmhouse', label: 'Farmhouse', icon: 'farm' },
  { value: 'hotel_ballroom', label: 'Hotel ballroom', icon: 'hotel' },
  { value: 'rooftop', label: 'Rooftop', icon: 'rooftop' },
]

// venue_type enum, chosen per hall.
export const HALL_SETTINGS = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'semi_outdoor', label: 'Semi-outdoor' },
]

// Cities with a map centre for the pin step. Pakistan only (CLAUDE.md).
export const CITIES = [
  { value: 'Abbottabad', lat: 34.1688, lng: 73.2215 },
  { value: 'Bahawalpur', lat: 29.3956, lng: 71.6836 },
  { value: 'Chiniot', lat: 31.72, lng: 72.9789 },
  { value: 'Faisalabad', lat: 31.4504, lng: 73.135 },
  { value: 'Gujranwala', lat: 32.1877, lng: 74.1945 },
  { value: 'Hyderabad', lat: 25.396, lng: 68.3578 },
  { value: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  { value: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { value: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { value: 'Multan', lat: 30.1575, lng: 71.5249 },
  { value: 'Peshawar', lat: 34.0151, lng: 71.5249 },
  { value: 'Quetta', lat: 30.1798, lng: 66.975 },
  { value: 'Rawalpindi', lat: 33.5651, lng: 73.0169 },
  { value: 'Sahiwal', lat: 30.6682, lng: 73.1114 },
  { value: 'Sargodha', lat: 32.0836, lng: 72.6711 },
  { value: 'Sialkot', lat: 32.4945, lng: 74.5229 },
]

// Rough bounding box of Pakistan, used to reject pins dropped outside the country.
export const PAKISTAN_BOUNDS = { minLat: 23.5, maxLat: 37.2, minLng: 60.8, maxLng: 77.9 }

// event_type enum (venues.supported_events).
export const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'mehndi', label: 'Mehndi' },
  { value: 'barat', label: 'Barat' },
  { value: 'walima', label: 'Walima' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'conference', label: 'Conference' },
  { value: 'religious', label: 'Religious gathering' },
  { value: 'other', label: 'Other events' },
]

// venues.facilities keys, grouped for the amenities step. Custom amenities are stored as their own text.
export const AMENITY_GROUPS = [
  {
    title: 'Basics',
    items: [
      { key: 'ac', label: 'Air conditioning', icon: 'snowflake' },
      { key: 'generator', label: 'Generator backup', icon: 'zap' },
      { key: 'parking', label: 'Parking', icon: 'car' },
      { key: 'valet', label: 'Valet parking', icon: 'key' },
    ],
  },
  {
    title: 'Facilities',
    items: [
      { key: 'bridal', label: 'Bridal room', icon: 'sparkles' },
      { key: 'prayer', label: 'Prayer area', icon: 'moon' },
      { key: 'washrooms', label: 'Washrooms', icon: 'droplet' },
      { key: 'kitchen', label: 'Kitchen', icon: 'chef' },
      { key: 'stage', label: 'Stage', icon: 'stage' },
    ],
  },
  {
    title: 'Services',
    items: [
      { key: 'catering', label: 'In-house catering', icon: 'utensils' },
      { key: 'decor', label: 'Basic decor', icon: 'flower' },
      { key: 'sound', label: 'Sound system', icon: 'speaker' },
      { key: 'lighting', label: 'Lighting', icon: 'lightbulb' },
      { key: 'photography', label: 'Photography', icon: 'camera' },
    ],
  },
  {
    title: 'Safety',
    items: [
      { key: 'cctv', label: 'CCTV', icon: 'cctv' },
      { key: 'fire', label: 'Fire extinguishers', icon: 'flame' },
      { key: 'security', label: 'Security guards', icon: 'shield' },
    ],
  },
]

export const AMENITY_KEYS = AMENITY_GROUPS.flatMap((group) => group.items.map((item) => item.key))
export const AMENITY_LABELS = Object.fromEntries(AMENITY_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.label])))

// Photo categories (UI-only: venue_images has no category or hall column yet). Hall categories repeat per hall.
export const HALL_PHOTO_CATEGORIES = [
  { value: 'main_hall', label: 'Main hall' },
  { value: 'stage', label: 'Stage' },
  { value: 'seating', label: 'Seating' },
  { value: 'bridal_room', label: 'Bridal room' },
  { value: 'washrooms', label: 'Washrooms' },
]
export const VENUE_PHOTO_CATEGORIES = [
  { value: 'entrance', label: 'Entrance' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'parking', label: 'Parking' },
  { value: 'hallway', label: 'Lobby / hallways' }, // "Hallway" section on the venue page's gallery
]

// REQ-8 and docs/api-and-security.md: JPEG/PNG only, at most 5 MB each.
export const PHOTO_TYPES = ['image/jpeg', 'image/png']
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const MIN_PHOTOS = 5
export const MAX_PHOTOS = 60

// Default dish sections in every package (menu_items.category). Hosts can rename, reorder, remove or add their own.
export const MENU_SECTIONS = ['Appetizers', 'Main course', 'Rice / Biryani', 'BBQ', 'Breads', 'Desserts / Sweets', 'Drinks']
export const MAX_DISHES = 60

// Starter menu packages the host can edit (menu_packages + menu_items). Prices are rupees per guest.
// `sections` maps a section name to its dishes; sections left out start empty.
export const MENU_TEMPLATES = [
  {
    name: 'Classic',
    description: 'A simple two-dish menu for smaller events.',
    pricePerHead: '1800',
    minGuests: '100',
    sections: {
      'Main course': ['Chicken qorma'],
      'Rice / Biryani': ['Vegetable pulao'],
      Breads: ['Naan'],
      'Desserts / Sweets': ['Kheer'],
      'Salads & raita': ['Raita', 'Green salad'],
    },
  },
  {
    name: 'Premium',
    description: 'Our most booked wedding menu.',
    pricePerHead: '2800',
    minGuests: '150',
    sections: {
      Appetizers: ['Chicken corn soup'],
      'Main course': ['Mutton qorma'],
      'Rice / Biryani': ['Chicken biryani'],
      BBQ: ['Chicken tikka'],
      Breads: ['Naan'],
      'Desserts / Sweets': ['Gajar ka halwa'],
      Drinks: ['Soft drinks'],
      'Salads & raita': ['Raita', 'Green salad'],
    },
  },
  {
    name: 'Royal',
    description: 'A full spread with live counters.',
    pricePerHead: '4200',
    minGuests: '200',
    sections: {
      Appetizers: ['Hot and sour soup', 'Fish crackers'],
      'Main course': ['Chicken karahi', 'Beef nihari'],
      'Rice / Biryani': ['Mutton biryani'],
      BBQ: ['Live BBQ counter', 'Fish tikka'],
      Breads: ['Naan', 'Roghni naan'],
      'Desserts / Sweets': ['Shahi tukray', 'Ice cream'],
      Drinks: ['Soft drinks', 'Green tea'],
    },
  },
]

// add_on_type enum (REQ-34). Decor is booked with decorators separately (REQ-30), so it is not offered here.
export const ADD_ON_TYPES = [
  { value: 'sound_system', label: 'Sound system / DJ', placeholder: 'DJ with sound system' },
  { value: 'smd', label: 'SMD screen', placeholder: '10 x 6 ft SMD screen' },
]

export const WEEKDAYS = [
  { value: 'mon', label: 'Monday', short: 'Mon' },
  { value: 'tue', label: 'Tuesday', short: 'Tue' },
  { value: 'wed', label: 'Wednesday', short: 'Wed' },
  { value: 'thu', label: 'Thursday', short: 'Thu' },
  { value: 'fri', label: 'Friday', short: 'Fri' },
  { value: 'sat', label: 'Saturday', short: 'Sat' },
  { value: 'sun', label: 'Sunday', short: 'Sun' },
]

// Default slot times follow docs/booking-engine.md ("Lunch 12:00-16:00, Dinner 19:00-23:00").
export const SLOT_TYPES = [
  { value: 'lunch', label: 'Lunch', start: '12:00', end: '16:00' },
  { value: 'dinner', label: 'Dinner', start: '19:00', end: '23:00' },
]

// UI-only and informational: payments are tracked, never processed (REQ-25), and customers can still cancel
// any active booking before the event date (REQ-22).
export const CANCELLATION_POLICIES = [
  { value: 'flexible', label: 'Flexible', description: 'Full advance returned if the customer cancels at least 7 days before the event.' },
  { value: 'moderate', label: 'Moderate', description: 'Half the advance returned if the customer cancels at least 30 days before the event.' },
  { value: 'strict', label: 'Strict', description: 'The advance is not returned once the booking is confirmed.' },
  { value: 'custom', label: 'Custom', description: 'Set your own refund for each period before the event.' },
]

// Rule builder rows for the Custom cancellation policy (UI-only, like the other policies).
export const CUSTOM_POLICY_STARTER = [
  { fromDays: '30', toDays: '', refundPercent: '100' },
  { fromDays: '7', toDays: '30', refundPercent: '50' },
  { fromDays: '0', toDays: '7', refundPercent: '0' },
]
export const MAX_POLICY_TIERS = 6

// House rules shown under "Good to know" on the venue page (UI-only).
export const HOUSE_RULES = [
  { key: 'outside_decorators', label: 'Outside decorators allowed' },
  { key: 'outside_catering', label: 'Outside catering allowed' },
  { key: 'outside_photographers', label: 'Outside photographers welcome' },
  { key: 'fireworks', label: 'Fireworks by approval' },
  { key: 'family_seating', label: 'Separate family seating available' },
  { key: 'no_smoking', label: 'No smoking indoors' },
  { key: 'sound_curfew', label: 'Sound must stop by 10:00 PM' },
]

// Hall layout zones, each placed in one cell of a 3 x 3 grid over the floor plan (row 0 = back of the hall).
export const LAYOUT_ZONES = [
  { key: 'stage', label: 'Stage', short: 'S' },
  { key: 'entrance', label: 'Entrance', short: 'E' },
  { key: 'seating', label: 'Seating', short: 'T' },
]
export const LAYOUT_CELLS = ['Back left', 'Back centre', 'Back right', 'Middle left', 'Middle centre', 'Middle right', 'Front left', 'Front centre', 'Front right']

// Floor plans: an image or a PDF (UI-only; not covered by REQ-8, which is about venue photos).
export const FLOOR_PLAN_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const FLOOR_PLAN_MAX_BYTES = 10 * 1024 * 1024

// 3D walkthrough per hall. `upload` is REQ-11 (walkthrough_assets); generate and link are UI-only extras.
export const WALKTHROUGH_MODES = [
  { value: 'generate', label: 'Generate from dimensions', description: 'We build a 3D model of the room from its size and layout.' },
  { value: 'upload', label: 'Upload a 3D model or 360° photo', description: '.glb or .gltf up to 50 MB, or a 360° JPEG up to 20 MB.' },
  { value: 'link', label: 'Paste a 360° or Matterport link', description: 'A virtual tour you already have online.' },
  { value: 'skip', label: 'Skip for now', description: 'Customers see your photos. You can add a walkthrough later.' },
]
// docs/api-and-security.md: 3D .glb/.gltf ≤ 50 MB, 360 JPEG ≤ 20 MB.
export const WALKTHROUGH_FILES = [
  { assetType: 'model_3d', extensions: ['.glb', '.gltf'], maxBytes: 50 * 1024 * 1024 },
  { assetType: 'panorama_360', extensions: ['.jpg', '.jpeg'], maxBytes: 20 * 1024 * 1024 },
]

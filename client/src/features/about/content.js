// Copy for the About page. Every claim here has to match the SRS (docs/requirements.md); the REQ numbers say
// which rule each line describes, so update both together.

export const CUSTOMER_STEPS = [
  {
    title: 'Search',
    // REQ-12
    text: 'Filter by city, date, guest count, budget and event type. Only venues that are free on your date show up.',
  },
  {
    title: 'Compare',
    // REQ-14, REQ-27
    text: 'Look through halls, menus, photos and reviews side by side. Not sure? Describe your event to the AI assistant.',
  },
  {
    title: 'Book',
    // REQ-18, REQ-26
    text: 'Pick a slot and it’s held for 10 minutes while you confirm. Track the booking and every payment from your dashboard.',
  },
  {
    title: 'Invite guests',
    // REQ-36, REQ-37, REQ-40
    text: 'Send invitations on WhatsApp with a Yes/No RSVP, and give guests a QR code for entry if you want one.',
  },
]

export const OWNER_STEPS = [
  {
    title: 'List your venue',
    // REQ-5, REQ-6, REQ-9
    text: 'Add your halls, capacity, menus, add-ons and photos. We review every listing before it goes live, and check photos are genuine.',
  },
  {
    title: 'Manage your calendar',
    // REQ-16, REQ-17, REQ-23
    text: 'Open slots, block dates and add bookings you take offline. Customers see every change in real time.',
  },
  {
    title: 'Get bookings',
    // REQ-21, REQ-24, REQ-25
    text: 'Accept requests, reply to quotations, and record advance and balance payments as they come in.',
  },
]

// `icon` is a key into features/about/icons.jsx (see FEATURE_ICONS in pages/About.jsx).
export const FEATURES = [
  {
    icon: 'sparkles',
    title: 'AI venue assistant',
    // REQ-27, REQ-28, Scope 2.4 (AI only suggests)
    text: 'Describe your event in plain words and get venue suggestions with prices and availability. It suggests, you decide.',
  },
  {
    icon: 'calendar',
    title: 'Real-time availability',
    // REQ-16, REQ-20
    text: 'Calendars update live, and each slot is locked while someone books it, so a date can never be double booked.',
  },
  {
    icon: 'cube',
    title: '3D walkthroughs',
    // REQ-11
    text: 'Walk through a hall in 3D or 360° before you visit, wherever the venue has uploaded a tour.',
  },
  {
    icon: 'qr',
    title: 'QR check-in',
    // REQ-40, REQ-41
    text: 'Guests get a QR code with their invite. Attendants scan it at the gate, with no app or account needed.',
  },
]

// Photos and roles are placeholders until the team sends them. `photo` takes an imported WebP; `role` is shown
// only when set.
export const TEAM = [
  { name: 'Shayaan', role: null, photo: null },
  { name: 'Sadaf', role: null, photo: null },
  { name: 'Muhammad', role: null, photo: null },
]

export const FAQS = [
  {
    question: 'Do I pay through MarkieSharkie?',
    // REQ-25, Scope 2.4
    answer:
      'No. MarkieSharkie never takes or processes payments. You pay the venue directly, however you agree with them. The venue records each advance and balance payment, so you both see the same history and remaining balance.',
  },
  {
    question: 'How does the 10-minute hold work?',
    // REQ-18, REQ-19
    answer:
      'When you pick a slot, it’s held for you for 10 minutes so nobody else can take it while you confirm the details. If you don’t confirm in time, the slot is released for others.',
  },
  {
    question: 'Can two people book the same slot?',
    // REQ-20
    answer:
      'No. A venue slot can only have one active booking, including bookings the owner takes offline. The database itself enforces this, so it holds even when two people book at the same moment.',
  },
  {
    question: 'Can I cancel a booking?',
    // REQ-22
    answer:
      'Yes, any time before the event date. Give a reason, and the slot is released and the venue notified. Completed bookings can’t be cancelled.',
  },
  {
    question: 'Do my guests need an account?',
    // REQ-37, REQ-38, REQ-40
    answer:
      'No. Guests open their invitation from a WhatsApp link, reply Yes or No, and show their QR code at the gate if you’ve turned QR entry on.',
  },
  {
    question: 'How are venues and photos verified?',
    // REQ-5, REQ-7, REQ-9, REQ-10
    answer:
      'Our admin team reviews every new or edited venue before customers can see it. Each photo also goes through an AI authenticity check, and anything flagged is reviewed by a person before it can be published.',
  },
  {
    question: 'Can I book a decorator as well?',
    // REQ-30, REQ-32, REQ-33
    answer:
      'Yes. Once you have a booking, you can preview décor ideas on the venue’s stage photos with AI and request quotes from decorators. Décor is agreed and paid separately from the venue booking.',
  },
]

// Wizard steps in order. `id` is the URL segment (/host/new/:step). Intro steps open each phase.
// `help` fills the "Questions?" drawer for that step.
export const PHASES = [
  {
    number: 1,
    title: 'Tell us about your marquee',
    intro: 'We’ll ask what kind of venue you have, where it is, and how many halls and guests it can hold.',
  },
  {
    number: 2,
    title: 'Make it stand out',
    intro: 'Add the amenities you offer and at least 5 photos, then write a title and description that make families want to visit.',
  },
  {
    number: 3,
    title: 'Packages & publish',
    intro: 'Set your menu packages, add-ons and booking rules, then send your listing to our team for review.',
  },
]

export const STEPS = [
  {
    id: 'about',
    phase: 1,
    intro: true,
    help: {
      title: 'Getting started',
      tips: [
        'It takes about 15 minutes. Your progress is saved on this device after every change.',
        'Have your hall capacities, menu prices and a few good photos ready.',
        'Use “Save & exit” at any time and continue from “Become a host” later.',
      ],
    },
  },
  {
    id: 'venue-type',
    phase: 1,
    help: {
      title: 'Choosing a venue type',
      tips: [
        'Pick the option customers would use to describe your place.',
        'If you have both a marquee and a lawn, pick the one most events use. You’ll set indoor or outdoor for each hall later.',
      ],
    },
  },
  {
    id: 'name',
    phase: 1,
    help: {
      title: 'Your venue name',
      tips: ['Use the name on your signboard so guests can find you.', 'Leave out the city; we show it next to the name.'],
    },
  },
  {
    id: 'location',
    phase: 1,
    help: {
      title: 'Your address',
      tips: [
        'Use the address guests would type into a map app.',
        'We only list venues in Pakistan.',
      ],
    },
  },
  {
    id: 'pin',
    phase: 1,
    help: {
      title: 'Placing the pin',
      tips: [
        'Drag the pin or click the map to move it. With the keyboard, focus the pin and use the arrow keys.',
        '“Use my location” works best when you’re at the venue.',
        'A Google Maps link is optional. Customers get a “Read reviews on Google” button that opens it.',
      ],
    },
  },
  {
    id: 'directions',
    phase: 1,
    help: {
      title: 'Getting there',
      tips: [
        'Pick a landmark most guests know, like a mall, a chowk or a mosque.',
        'Mention the gate to use, where drivers can drop guests and where parking is.',
        'This step is optional. You can skip it with Next.',
      ],
    },
  },
  {
    id: 'halls',
    phase: 1,
    help: {
      title: 'Halls and capacity',
      tips: [
        'Add one hall for every space that can host an event on its own.',
        'Seated capacity is what customers search by. Bookings start at 25 guests.',
        'Halls with a mix of covered and open areas are “Semi-outdoor”. Outdoor venues get a rain advisory before confirmed events.',
        'Measure length along the hall from the entrance to the back wall. Approximate sizes are fine; we use them for the 3D model.',
      ],
    },
  },
  {
    id: 'bridal-suite',
    phase: 1,
    help: {
      title: 'Bridal suite',
      tips: ['A bridal suite is a private room for getting ready. It isn’t booked on its own.', 'No suite? Leave the switch off and continue.'],
    },
  },
  {
    id: 'events',
    phase: 1,
    help: {
      title: 'Events you host',
      tips: ['Customers filter by event type, so tick every kind you’re happy to host.', 'You can change this later from your dashboard.'],
    },
  },
  {
    id: 'stand-out',
    phase: 2,
    intro: true,
    help: {
      title: 'Making your listing stand out',
      tips: ['Listings with photos of every hall and a clear description get more inquiries.', 'Every photo is checked before it goes live.'],
    },
  },
  {
    id: 'amenities',
    phase: 2,
    help: {
      title: 'Amenities',
      tips: ['Only pick what every customer gets without asking.', 'Missing something? Add your own amenity at the bottom.'],
    },
  },
  {
    id: 'photos',
    phase: 2,
    help: {
      title: 'Photo tips',
      tips: [
        'Use JPEG or PNG photos up to 5 MB each. Shoot in daylight, landscape, with the hall set up for an event.',
        'Add at least 5 photos, with at least one of each hall.',
        'Photos must be real. Each photo is checked for AI-generated or edited images, and flagged photos go to our team instead of your listing.',
        'Reorder photos with the arrow buttons or by dragging. The cover photo is the first thing customers see.',
      ],
    },
  },
  {
    id: 'layout',
    phase: 2,
    help: {
      title: 'Floor plans',
      tips: [
        'A floor plan is optional. A photo of a printed plan works, or a PDF from your architect (up to 10 MB).',
        'Marking the stage, entrance and seating helps customers picture the room and places them in your 3D model.',
        'Spots are rough: back, middle or front, and left, centre or right as you face the back wall.',
      ],
    },
  },
  {
    id: 'walkthrough',
    phase: 2,
    help: {
      title: '3D walkthroughs',
      tips: [
        '“Generate from dimensions” builds a simple 3D room from the size and layout you entered. Customers can turn and zoom it.',
        'Have a real 3D scan? Upload a .glb model, or a 360° photo taken from the middle of the hall. Uploads are checked before they go live.',
        'Already on Matterport or another 360° site? Paste the link instead.',
      ],
    },
  },
  {
    id: 'title',
    phase: 2,
    help: {
      title: 'Writing a great listing',
      tips: [
        'Titles that name the setting and the size work well, like “Garden marquee for 800 guests on Canal Road”.',
        'In the description, cover the halls, parking, food, and what makes your venue different.',
        'Our AI assistant uses your description to recommend venues, so be specific.',
      ],
    },
  },
  {
    id: 'finish',
    phase: 3,
    intro: true,
    help: {
      title: 'Packages and rules',
      tips: ['Customers see the cost as price per guest × guest count.', 'MarkieSharkie tracks payments; it never takes money from customers.'],
    },
  },
  {
    id: 'menus',
    phase: 3,
    help: {
      title: 'Menu packages',
      tips: [
        'Start from a template and change it to match your menu.',
        'Put each dish in a section: press Enter or type a comma after each one. Empty sections are hidden from customers.',
        'Use the arrows to reorder sections, or add your own, like “Live stations”.',
        'The minimum guest count applies to the package, not the hall.',
      ],
    },
  },
  {
    id: 'custom',
    phase: 3,
    help: {
      title: 'Custom menus and add-ons',
      tips: [
        'If you accept custom menu requests, customers can ask for changes when they request a quotation.',
        'Decor is booked through decorators on MarkieSharkie, so it isn’t an add-on here.',
      ],
    },
  },
  {
    id: 'rules',
    phase: 3,
    help: {
      title: 'Booking rules',
      tips: [
        'Slots can’t overlap and can’t run past midnight.',
        'The advance is recorded by you when the customer pays. MarkieSharkie doesn’t take payments.',
        'Customers can cancel a booking any time before the event date; your policy tells them what happens to the advance.',
        'A custom policy is a list of rules like “30 or more days before: 100% back”. Rules can’t overlap.',
      ],
    },
  },
  {
    id: 'house-rules',
    phase: 3,
    help: {
      title: 'House rules',
      tips: ['House rules appear under “Good to know” on your listing.', 'Only list rules you enforce for every event.'],
    },
  },
  {
    id: 'review',
    phase: 3,
    help: {
      title: 'Before you submit',
      tips: [
        'Our team checks every new listing before customers can see it.',
        'You’ll get a notification when it’s approved, or a reason if something needs fixing.',
      ],
    },
  },
]

export const STEP_IDS = STEPS.map((step) => step.id)
export const stepIndex = (id) => STEP_IDS.indexOf(id)

// Fill (0 to 1) of each phase segment in the progress bar while on `stepId`.
export function phaseProgress(stepId) {
  const current = STEPS[stepIndex(stepId)]
  return PHASES.map((phase) => {
    if (phase.number < current.phase) return 1
    if (phase.number > current.phase) return 0
    const inPhase = STEPS.filter((step) => step.phase === phase.number)
    return inPhase.findIndex((step) => step.id === stepId) / inPhase.length
  })
}

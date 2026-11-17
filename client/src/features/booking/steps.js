import { SLOT_HOLD_MINUTES } from '../../lib/booking.js'

// Booking flow screens in order (/venues/:id/book/:step), one topic each like the host wizard. `help` fills the
// "Questions?" drawer. The confirmation screen comes after these and has no progress bar.
export const BOOKING_STEPS = [
  {
    id: 'selection',
    title: 'Your selection',
    help: {
      title: 'Your selection',
      tips: [
        `Starting here holds the slot for you for ${SLOT_HOLD_MINUTES} minutes. Nobody else can book it while the timer runs.`,
        'You can change the guest count and menu here. Changing the date, time or hall takes you back to the venue page and releases this hold.',
        'If the timer runs out, the slot is released. You can try to hold it again if it’s still free.',
      ],
    },
  },
  {
    id: 'details',
    title: 'Event details',
    help: {
      title: 'Event details',
      tips: [
        'The venue sees the event type, name and the host’s contact so they can plan the day.',
        'Use a Pakistani mobile number, like 0300-1234567 or +92 300 1234567.',
        'Special requests are optional: seating, stage, dietary needs, timing.',
      ],
    },
  },
  {
    id: 'add-ons',
    title: 'Add-ons',
    help: {
      title: 'Add-ons',
      tips: ['Add-ons are offered by the venue for your slot. The price is added to your total.', 'Décor is booked separately with decorators after your booking is confirmed.'],
    },
  },
  {
    id: 'price',
    title: 'Price breakdown',
    help: {
      title: 'How the price works',
      tips: [
        'Menu cost = price per guest × guest count. Some menus have a minimum guest count.',
        'The advance is a share of the total that the venue asks for after it accepts your request.',
        'MarkieSharkie never takes payments. You pay the venue directly; the venue records it here.',
      ],
    },
  },
  {
    id: 'review',
    title: 'Review & request',
    help: {
      title: 'Before you request',
      tips: ['Sending a request books the slot for you while the venue decides. Nobody else can take it.', 'No payment is needed now. You can cancel from My bookings before the event date.'],
    },
  },
]

export const bookingStepIndex = (id) => BOOKING_STEPS.findIndex((step) => step.id === id)

// Invitation builder screens in order (/bookings/:id/invite/:step). `help` fills the "Questions?" drawer.
export const INVITE_STEPS = [
  {
    id: 'template',
    title: 'Choose a design',
    help: {
      title: 'Choosing a design',
      tips: [
        'Each preview already shows your event, so you can compare them as your guests will see them.',
        'You can come back and switch designs any time. The details you typed stay as they are.',
        'Names and messages typed in Urdu display properly in every design. Mehndi festive also adds Urdu lettering.',
      ],
    },
  },
  {
    id: 'details',
    title: 'Event details',
    help: {
      title: 'Event details',
      tips: [
        'Venue, hall, date, time and address come from your booking and can’t be changed here. To change them, change the booking.',
        'Guests can reply until the end of the reply-by day. It must be before the event day.',
        'The contact number is printed on the card so guests can reach you with questions.',
      ],
    },
  },
  {
    id: 'review',
    title: 'Review & share',
    help: {
      title: 'Sharing your invitation',
      tips: [
        'Generating makes a QR code and a link. Anyone with either one can open the invitation and reply. No account needed.',
        'Guests reply Attending (with how many people) or Can’t make it. Their replies show up on your booking.',
        'If you change something later, generate again. The QR code changes too, so share the new one.',
      ],
    },
  },
]

export const inviteStepIndex = (id) => INVITE_STEPS.findIndex((step) => step.id === id)

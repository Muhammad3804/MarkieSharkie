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
    title: 'Review & save',
    help: {
      title: 'After saving',
      tips: [
        'Saving stores the invitation. Next you add guests with an email or a mobile number.',
        'Each guest gets their own link: by email, or copy it and share it on WhatsApp. Links are personal, so one guest can’t see another’s reply.',
        'Guests reply Attending (with how many people) or Can’t make it, and can change it until the event day.',
      ],
    },
  },
]

export const inviteStepIndex = (id) => INVITE_STEPS.findIndex((step) => step.id === id)

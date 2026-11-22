// Copy per trigger (useRequireAuth(intent, ...)). The modal always says "Log in or sign up" and shows `prompt` under
// it; the route guard card (RequireAuth) uses `title` + `subtitle`.
export const LOGIN_INTENTS = {
  default: { title: 'Log in or sign up', subtitle: 'Book venues, follow your requests and send invitations, all in one place.', prompt: 'Book venues, follow your requests and send invitations.' },
  availability: { title: 'Log in to book this venue', subtitle: 'We’ll keep your date, hall, guests and menu, and hold the slot right after.', prompt: 'Log in to book this venue. We’ll keep your date, hall, guests and menu.' },
  booking: { title: 'Log in to continue your booking', subtitle: 'Your date, hall, guests and menu are saved on this device.', prompt: 'Log in to continue your booking.' },
  host: { title: 'Become a host', subtitle: 'Log in to list your venue', prompt: 'Log in to list your venue' },
  bookings: { title: 'Log in to see your bookings', subtitle: 'Your requests, confirmations and invitations, all in one place.', prompt: 'Log in to see your bookings.' },
  report: { title: 'Log in to report a review', subtitle: 'Reports go to our team, who check every one.', prompt: 'Log in to report this review.' },
  profile: { title: 'Log in to see your profile', subtitle: 'Your details, past searches and bookings.', prompt: 'Log in to see your profile.' },
  admin: { title: 'Admin log in', subtitle: 'Log in with your admin account to open the dashboard.', prompt: 'Log in with your admin account.' },
  invitation: { title: 'Log in to send invitations', subtitle: 'Invitations are made from your confirmed bookings.', prompt: 'Log in to send invitations.' },
}

export const loginIntent = (intent) => LOGIN_INTENTS[intent] ?? LOGIN_INTENTS.default

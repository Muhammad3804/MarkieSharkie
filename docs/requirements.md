# Requirements (condensed from the SRS)

This is a working summary of `docs/srs/SRS.pdf` Sections 2.4, 3.2 and 3.3. Wording is shortened, meaning is not changed. When in doubt, open the PDF. IDs (REQ-x, NFR-x, EUC-xx, UC-xx) must be kept in code comments, test names and commit messages where a rule comes from the SRS.

## Scope (SRS 2.4)

In: web PWA for Customers, Venue Owners, Decorators, Guests, Attendants, Admins. Registration/login, venue listing and approval, image verification, 3D walkthroughs, search, comparison, recommendations, AI chatbot, live availability calendar, slot hold and booking, quotations and payment tracking, offline booking logging, decor and add-ons, AI decor previews, reviews, notifications, weather advisory, digital invitations with RSVP, QR check-in, admin panel.

Out (first release): processing payments (only records them), native Android/iOS apps, venues outside Pakistan or currencies other than PKR, AI making decisions for the user, catering prep/transport/logistics beyond menu packages.

## Functional requirements

### Auth and access (3.2.1)
| ID | Rule |
|---|---|
| REQ-1 | Register with role (Customer, Venue Owner, Decorator), full name, email, mobile, password, city. Owner also: business name + contact number. Decorator also: business name + short description. Validate mandatory fields, email format, PK mobile (`03XX-XXXXXXX` or `+92 3XX XXXXXXX`), password ≥ 8 chars with letters and digits. Reject duplicate email or mobile. **Admins are created only by an existing Admin.** |
| REQ-2 | Login with email **or** mobile + password, open role home page. **Lock for 15 min after 5 consecutive failed attempts.** Password reset by one-time code to email or mobile. Session ends on logout or **30 min inactivity**. |
| REQ-3 | RBAC: each role sees only its functions and data. Guests see only their invitation via secure link. Attendants see only check-in for their assigned events. Suspended accounts denied. |
| REQ-4 | View/update profile (name, phone, city, business details, preferences). Customer profile also shows past searches, bookings, preferences (used for personalization). |

### Venues (3.2.2, 3.2.3)
| ID | Rule |
|---|---|
| REQ-5 | Owner creates/edits/deactivates venues: name, address, city, type (indoor/outdoor/semi-outdoor), event types, capacity, base price, facilities, description, Google place ID. **New or changed venue goes to Admin approval** before customers see it. |
| REQ-6 | Owner publishes packages/pricing, menu packages (name, description, price per head, customizable?, min guests), sound/SMD add-ons (type, description, price, availability). Edit/remove. |
| REQ-7 | Admin views pending venues, approves or rejects **with a reason**. Owner notified. |
| REQ-8 | Owner uploads JPEG/PNG photos. Reject other types or oversize files. |
| REQ-9 | Every image goes to AI detection. **Only genuine images are published.** Flagged images not published, sent to Admin. Owner told result per image. Service down → image stays pending, owner asked to retry later. |
| REQ-10 | Admin approves/rejects flagged images. Decision recorded, owner notified. |
| REQ-11 | Owner uploads 3D or 360° walkthrough files (type and size checked). Shown interactively on venue page. No walkthrough → photos only. |

### Search and discovery (3.2.4)
| ID | Rule |
|---|---|
| REQ-12 | Search approved venues by location, event type, date, guest capacity, budget. **Only venues free on that date.** Ranked by match. Each search saved to history. No match → say so, suggest changing filters. |
| REQ-13 | Venue page: photos, facilities, packages, menus, add-ons, availability calendar, walkthrough (if any), reviews. |
| REQ-14 | Compare 2+ venues side by side on price, capacity, facilities. |
| REQ-15 | Recommendations from search history, preferences, and **venue description similarity** (embeddings). No history → popular venues. |

### Calendar and booking (3.2.5)
| ID | Rule |
|---|---|
| REQ-16 | Time-slot calendar, each slot **Available, Held, Booked or Blocked**. Changes pushed to all connected users in real time, no refresh. |
| REQ-17 | Owner blocks/unblocks free slots. **Cannot block a booked slot.** |
| REQ-18 | Selecting an available slot places a **temporary hold** (shown unavailable to others) with a timer. Auto-release on timeout or when the customer leaves. Hold duration configurable, **default 10 min**. |
| REQ-19 | Customer confirms a held slot with event type + guest count → booking created, slot **Booked**, real-time update, owner notified, customer gets confirmation. |
| REQ-20 | **Only one booking per venue + slot**, including simultaneous customers and owner offline bookings. |
| REQ-21 | Owner views booking requests, confirms or rejects. Status: **Requested, Held, Confirmed, Completed, Cancelled**, visible to both. |
| REQ-22 | Customer cancels an active booking before the event date with a reason → Cancelled, slot released, owner notified. **Completed bookings cannot be cancelled.** |
| REQ-23 | Owner logs offline booking: date, slot, client name, client phone, event type, guest count. Check slot still free → Booked, recorded as offline. |

### Quotations and payments (3.2.6)
| ID | Rule |
|---|---|
| REQ-24 | Customer requests a quotation for venue + date + event details. Owner sends amount, terms, valid-until. Customer accepts, rejects or counters; repeats until accept/reject. Status: **Proposed, Countered, Accepted, Rejected, Expired**. Auto-expire after valid-until. |
| REQ-25 | Owner records advance or balance payment: amount, type, method, reference, date. System computes remaining balance, **rejects amount > balance**. **Records only, never processes money.** |
| REQ-26 | Payment history and balance visible to customer and owner. Customer notified on each payment. |

### AI chatbot (3.2.7)
| ID | Rule |
|---|---|
| REQ-27 | Plain-language request → retrieval over venue info (RAG) → reply with venue suggestions. |
| REQ-28 | Answers on availability, pricing, venue details, booking process. **Chat history saved per customer.** AI down → message + suggest normal search. |

### Decor (3.2.8, 3.2.9)
| ID | Rule |
|---|---|
| REQ-29 | Decorator profile: business details, portfolio images, themes, prices. |
| REQ-30 | **Customer with a booking** browses decorators, sends decor request (event details + shortlisted previews). Decorator quotes; customer accepts, rejects, or asks for revision. **Decor negotiation and payment are separate from the venue booking.** |
| REQ-31 | Owner uploads bare-stage photos (base for previews). |
| REQ-32 | Customer with a booking enters a style/theme → stage photo + prompt to image-generation service → several concepts. Can regenerate with a different style. Error + retry if service fails. |
| REQ-33 | Customer shortlists concepts and shares the shortlist with a chosen decorator. |

### Add-ons and menus (3.2.10)
| ID | Rule |
|---|---|
| REQ-34 | Customer adds sound/SMD to a booking. Check add-on available on the event date, update booking total, notify owner. |
| REQ-35 | Menu cost = price per head × guest count, respecting min guests. Show if customizable. |

### Invitations and check-in (3.2.11, 3.2.12)
| ID | Rule |
|---|---|
| REQ-36 | Invitation **only for a Confirmed booking**. Title, message, event date/time/venue (prefilled from booking). Generates a card + shareable link. |
| REQ-37 | Add guests, send link via messaging service (WhatsApp). Show delivery status per guest. Includes Yes/No RSVP poll. |
| REQ-38 | Guest opens link **without an account**, sees details + venue on map, sends or changes Yes/No. Customer sees RSVP summary. |
| REQ-39 | Guest can open directions to the venue. |
| REQ-40 | Customer chooses whether to use QR check-in. If yes, each guest gets a unique QR in the invitation. |
| REQ-41 | Attendant scans QR: valid? belongs to this event? not used before? → record arrival time. Show **valid / invalid / duplicate**. Customer sees attendance count. |

### Reviews (3.2.13)
| ID | Rule |
|---|---|
| REQ-42 | Review only after a **Completed** booking, **once per booking**, rating 1-5 + optional comment. Update venue average rating. |
| REQ-43 | Platform reviews shown with Google rating/reviews. Google fails → platform reviews only. |
| REQ-44 | Admin views flagged reviews, removes rule-breaking ones. |

### Notifications and weather (3.2.14)
| ID | Rule |
|---|---|
| REQ-45 | In-app notification on booking, quotation or payment events. List + mark as read. |
| REQ-46 | For a **Confirmed** booking at an **outdoor or semi-outdoor** venue: fetch forecast for event date + location, warn on heavy rain or thunderstorm. Good forecast → no advisory. Service down → retry later. |

### Admin (3.2.15)
| ID | Rule |
|---|---|
| REQ-47 | View/search users, suspend, unblock, remove. **Warn if user has active bookings.** |
| REQ-48 | Monitor bookings. Disputes raised by customer or owner: **Open, Under Review, Resolved**. Admin reviews booking, quotations, payments, records resolution, notifies both. |

## Non-functional requirements (3.3)

| ID | Target | What it means in code |
|---|---|---|
| NFR-1 Performance | Pages < 3 s on mobile, search < 3 s, slot change visible to others < 2 s, chatbot < 10 s | Indexes on search filters, paginate, code-split routes, Socket.io rooms per venue, stream or time-limit LLM calls |
| NFR-2 Reliability | 99% uptime, **never a double booking**, daily DB backup, external failures don't stop booking | Transactions + row locks + DB constraints; timeouts and fallbacks on every external call |
| NFR-3 Usability | Simple, consistent, few steps to book, clear error messages that say how to fix it | Shared UI components, inline field errors, empty states |
| NFR-4 Security | Hashed passwords, HTTPS, token auth with RBAC, API keys server-side, all input validated, admin actions logged | See `docs/api-and-security.md` |
| NFR-5 Compatibility | Chrome, Edge, Firefox, Safari; phone/tablet/desktop; installable PWA on Android + iOS | Mobile-first Tailwind, manifest + service worker, test on Safari |
| NFR-6 Maintainability | Separate modules, documented REST API, version control, unit + system tests | Feature modules, OpenAPI spec, Vitest + Playwright |
| NFR-7 Scalability | Frontend and backend deployed separately, managed DB, real-time handles many viewers per calendar | Separate deploys, Socket.io rooms, Redis adapter if scaled out |
| NFR-8 Privacy | Collect only needed data, guest details only to inviting customer (and owner when needed), account deletion on request | Scoped queries, soft delete + anonymize |

## Use case map (SRS 4.3)

| EUC | Name | Actor | REQs |
|---|---|---|---|
| 01 | Register Account | User | 1, 3 |
| 02 | Log In and Log Out | User, Admin | 2, 3 |
| 03 | Manage Profile | User | 4 |
| 04 | Manage Venue Profile | Owner | 5 |
| 05 | Upload and Verify Venue Images | Owner | 8, 9 |
| 06 | Upload 3D Walkthrough Assets | Owner | 11 |
| 07 | Manage Menu Packages and Add-Ons | Owner | 6 |
| 08 | Approve Venue Listing | Admin | 7 |
| 09 | Search Venues | Customer | 12 |
| 10 | Compare Venues | Customer | 14 |
| 11 | View Personalized Recommendations | Customer | 15 |
| 12 | View Venue Details and 3D Walkthrough | Customer | 13, 11, 43 |
| 13 | Manage Availability Calendar | Owner | 16, 17 |
| 14 | Hold Slot and Book Venue | Customer | 16, 18, 19, 20 |
| 15 | Confirm or Reject Booking Request | Owner | 21 |
| 16 | Cancel Booking | Customer | 22 |
| 17 | Log Offline Booking | Owner | 23, 20 |
| 18 | Negotiate Quotation | Customer + Owner | 24 |
| 19 | Track Payments | Customer + Owner | 25, 26 |
| 20 | Chat with AI Assistant | Customer | 27, 28 |
| 21 | Manage Decorator Profile and Portfolio | Decorator | 29 |
| 22 | Request Decor Quotation | Customer + Decorator | 30 |
| 23 | Generate AI Decor Preview | Customer | 31, 32, 33 |
| 24 | Book Add-Ons and Menu Package | Customer | 34, 35 |
| 25 | Generate and Send Invitation | Customer | 36, 37 |
| 26 | Respond to Invitation (RSVP) | Guest | 38 |
| 27 | View Event Details and Navigate to Venue | Guest | 38, 39 |
| 28 | Check In Guest by QR Code | Attendant | 40, 41 |
| 29 | Submit Review | Customer | 42 |
| 30 | View Platform and Google Reviews | Customer | 43 |
| 31 | Receive Notifications | Customer, Owner | 45 |
| 32 | View Weather Advisory | Customer | 46 |
| 33 | Manage Users | Admin | 47 |
| 34 | Moderate Content and Flagged Images | Admin | 10, 44 |
| 35 | Resolve Dispute | Admin | 48 |

System use cases: SYS-01 Prevent Double-Booking, SYS-02 Verify Image, SYS-03 Validate QR Code, SYS-04 Check Role Permissions, SYS-05 Fetch Google Reviews.

Each EUC has numbered alternative steps (e.g. EUC-14 step 2.1 "slot already held → show other free slots"). Implement every alternative step as an explicit error/edge case and test it.

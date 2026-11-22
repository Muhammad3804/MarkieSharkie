# Booking engine

The booking engine is the core of the project and the thing most likely to be demoed and attacked by the panel ("what if two people click Book at the same time?"). Treat it with extra care.

Covers: REQ-16 to REQ-26, EUC-13 to EUC-19, SYS-01, SRS Figures 7, 18, 19.

## States

### Time slot (`time_slots.status`, REQ-16)

```
available --select--> held --customer confirms--> booked
    ^                   |                            |
    |<--hold expires----|                            |
    |<--customer leaves-|                            |
    |<---------------booking cancelled / rejected----|
available --owner blocks--> blocked --owner unblocks--> available
available --owner logs offline booking--> booked
```

- `held` always has `held_by` + `held_until` (DB check constraint). Other states never do.
- `booked` and `held` slots cannot be blocked (REQ-17).

### Booking (`bookings.status`, REQ-21)

Decided interpretation (see `docs/srs-alignment.md` #1):

| Status | Meaning | Slot |
|---|---|---|
| `requested` | Customer confirmed the held slot with event type + guest count (REQ-19). Waiting for the owner. | `booked` (locked so nobody else can take it, REQ-20) |
| `held` | Owner accepted the request; waiting for the advance payment (state machine "slot Held, awaiting advance"). | `booked` |
| `confirmed` | Owner confirmed (normally after recording the advance). Invitations, decor, weather advisory unlock. | `booked` |
| `completed` | Event date has passed (nightly job). Reviews unlock. | `booked` (history kept) |
| `cancelled` | Customer cancelled (with reason), owner rejected, or owner never acted before the event. | back to `available` |

Allowed transitions (enforce in `booking.service`, reject everything else with 409):

```
requested -> held | confirmed | cancelled
held      -> confirmed | cancelled
confirmed -> completed | cancelled      (cancel only before event date, REQ-22)
completed -> (none)                      (REQ-22: cannot cancel)
cancelled -> (none)
```

Offline bookings (REQ-23) are created directly as `confirmed` with `source = 'offline'`.

### Quotation (`quotations.status`, REQ-24)

Each row is one round. A counter-offer creates a new row with `round + 1`, `previous_quotation_id`, and marks the previous row `countered`.

```
proposed --other side counters--> countered (old row) + new proposed row
proposed --accept--> accepted --> customer books the slot at the agreed amount
proposed --reject--> rejected
proposed --valid_until passes--> expired   (nightly job + check on read)
```

`proposed_by` is `customer` or `venue_owner`. Only the side that did NOT propose a round can accept/reject/counter it.

A quotation can exist before a booking (customer is still negotiating). When the customer books after an accepted quote, set `quotations.booking_id` and use the accepted amount as `bookings.total_amount`.

## The hold-and-book flow (EUC-14, Figure 19)

```
POST /api/venues/:venueId/slots/:slotId/hold
  BEGIN
    SELECT * FROM time_slots WHERE slot_id = $1 AND venue_id = $2 FOR UPDATE;
    -- lazily release an expired hold on this row
    IF status = 'held' AND held_until < now() THEN status := 'available'
    IF status <> 'available' -> ROLLBACK, 409 SLOT_UNAVAILABLE (+ list of other free slots, EUC-14 2.1)
    UPDATE time_slots SET status='held', held_by=$customer, held_until=now() + HOLD_MINUTES
  COMMIT
  emit to room venue:<venueId>  'slot:updated' {slotId, status:'held'}

POST /api/bookings   { slotId, eventType, guestCount, menuPackageId?, addOns?, quotationId? }
  BEGIN
    SELECT ... FROM time_slots WHERE slot_id=$1 FOR UPDATE;
    IF status <> 'held' OR held_by <> $customer OR held_until < now()
        -> ROLLBACK, 409 HOLD_EXPIRED (EUC-14 4.1)
    validate guestCount <= venue.capacity, menu min_guests, add-on availability on that date
    compute total_amount (quotation amount or base price + menu + add-ons)
    INSERT INTO bookings (... status 'requested')        -- unique index is the last line of defence
    UPDATE time_slots SET status='booked', held_by=NULL, held_until=NULL
    INSERT notifications (owner, type 'booking')
  COMMIT
  emit 'slot:updated' {status:'booked'}; notify owner via socket
```

Rules:
- **Always lock the slot row first** (`FOR UPDATE`), then the booking row if needed. Same order everywhere, to avoid deadlocks.
- Catch Postgres `23505` (unique violation) and `23P01` (exclusion violation) and turn them into `409` responses. They mean a race was lost, not a server error.
- Emit socket events **after COMMIT** only.
- `HOLD_MINUTES` comes from config (`SLOT_HOLD_MINUTES`, default 10, REQ-18).

## Releasing holds (REQ-18)

Three ways, all needed:
1. **Timer job** every 30 s: `UPDATE time_slots SET status='available', held_by=NULL, held_until=NULL WHERE status='held' AND held_until < now() RETURNING slot_id, venue_id` → emit `slot:updated` for each.
2. **Lazy check** inside the hold/book transaction (above), so correctness never depends on the job.
3. **Customer leaves**: client calls `DELETE /api/slots/:slotId/hold` on route leave / `beforeunload` (`navigator.sendBeacon`), and the socket `disconnect` handler releases holds owned by that socket's user.

## Owner actions

- **Block/unblock** (REQ-17, EUC-13): lock slot row; only `available -> blocked` and `blocked -> available`.
- **Confirm/reject request** (REQ-21, EUC-15, built 2026-11-22): lock slot, then booking. Confirm = `requested → confirmed` (srs-alignment #38: booking `held` waits for payments). Reject = `cancelled`, `closed_as = 'rejected'`, reason required ("Rejected by the venue: …"), slot `available`. TODO(notifications): notify the customer.
- **Offline booking** (REQ-23, EUC-17): lock slot; must be `available` (EUC-17 6.1 otherwise 409 "slot taken, pick another"); insert booking `source='offline'`, `status='confirmed'`, `client_name`, `client_phone`; slot `booked`.
- **Deactivated venue** (REQ-5, srs-alignment #35): `venues.is_active = false` -> no new holds, requests or
  quotations (check it with the venue row locked). Confirmed bookings stay valid; requested / held ones stay with the
  owner to accept or reject (they are not cancelled automatically).
- **Price snapshot**: when a booking is created, store `bookings.menu_price_per_head` (the package's price at that
  moment) and `booking_add_ons.unit_price`. Packages and add-ons a booking points at are never changed afterwards
  (editing archives them and creates new rows), so totals and receipts never move.
- **Create slots**: owner defines slots per date (e.g. Lunch 12:00-16:00, Dinner 19:00-23:00). The exclusion constraint rejects overlaps. Midnight end = `24:00`. Slots that cross midnight are not supported.

## Payments (REQ-25, REQ-26, EUC-19)

```
POST /api/bookings/:id/payments  { amount, type, method, reference, paidAt }   (owner only)
  BEGIN
    SELECT * FROM bookings WHERE booking_id=$1 FOR UPDATE;
    paid := SUM(amount) FROM payments WHERE booking_id=$1 AND status <> 'void'
    balance := total_amount - paid
    IF amount > balance -> 422 AMOUNT_EXCEEDS_BALANCE (EUC-19 3.1)
    INSERT payment; if type='advance' UPDATE bookings.advance_amount += amount
    INSERT notification for customer (REQ-26)
  COMMIT
```

Balance is always computed, never stored separately. No payment gateway, ever.

## Cancellation (REQ-22, EUC-16)

Customer can cancel `requested | held | confirmed` bookings when `slot.date > today`. Reason required (DB check). Slot back to `available`. `completed` → 409. Built 2026-11-22: `closed_as = 'cancelled'`; `refund_percent` from `policy_snapshot` tiers by days before the event; `refund_amount` = that % of `advance_due`, only if the booking was `confirmed` (recorded, never paid out). TODO(notifications): notify the owner.

## Scheduled jobs

| Job | Every | Does |
|---|---|---|
| release-expired-holds | 30 s | REQ-18 |
| expire-quotations | 1 h | `proposed` rows with `valid_until < today` → `expired`, notify both (EUC-18 5.1) |
| complete-bookings | daily 03:00 PKT | `confirmed` bookings whose slot date has passed → `completed` |
| weather-advisory | every 6 h | `confirmed` bookings, venue `outdoor/semi_outdoor`, event within forecast range (5 days) → fetch, insert advisory on heavy rain/thunderstorm (REQ-46) |
| refresh-google-reviews | daily | re-fetch for venues with `google_place_id` |

Use `node-cron` in the API process for the FYP. Jobs must be idempotent (safe to run twice).

**Built (2026-11-22):** `modules/bookings/jobs.js` runs every 30 s in the API process (`server.js`, not in tests): releases expired holds, turns unanswered `requested` bookings whose date has passed into `cancelled` / `closed_as = 'expired'`, and `confirmed` ones into `completed`, each with a `booking_events` row (actor `system`). The same settle runs lazily before every booking read and change, so correctness never waits for the timer.

## Tests that must exist

- Two customers hold the same slot concurrently → exactly one succeeds (`Promise.all` against a real Postgres).
- Customer books after hold expired → 409.
- Offline booking on a held slot → 409.
- Owner blocks a booked slot → 409.
- Payment larger than balance → 422.
- Cancel a completed booking → 409.
- Counter-offer by the same side that proposed → 403.

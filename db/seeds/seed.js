// The demo seed (npm run seed, in server/). Builds the venues the website showed before the API existed
// (client/src/features/venues/mockVenues.js, read by catalog.js) plus the accounts that own and review them.
//
// Idempotent: every row has a fixed id (UUIDv5 of a stable name, e.g. "venue:qasar-e-noor") and is inserted with
// ON CONFLICT DO NOTHING, so a second run adds nothing and never overwrites what people changed in the app (an
// admin's decision, a booked slot, a changed password). Only time slots move with the calendar: a run on a later
// day adds the new days at the end of the 60-day window.
//
// Plain SQL with $n parameters only. No npm imports here (this folder is outside server/): the caller passes the
// pg client and the helpers (argon2 hashing, phone normalising).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assetFile, loadMockCatalog } from "./catalog.js";

export const SLOT_DAYS = 60;
export const APPROVED_COUNT = 20;
const SLOT_TIMES = { lunch: ["12:00", "16:00"], dinner: ["19:00", "23:00"] };
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- ids

const NAMESPACE = Buffer.from("6b1e4c52a0d94f3e8c7a2f61d93b0e47", "hex");
// RFC 4122 version 5 (SHA-1, name-based): the same name always gives the same UUID.
export function seedId(name) {
  const hash = crypto
    .createHash("sha1")
    .update(NAMESPACE)
    .update(name, "utf8")
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------- which mock venues get which status

// Round-robin over the landing rows, so every row and city has approved venues. The first 20 are approved; the next
// five fill the admin dashboard: 3 pending, 1 rejected, 1 suspended.
export function pickVenues(landingSections, venues) {
  const byId = new Map(venues.map((v) => [v.id, v]));
  const order = [];
  const seen = new Set();
  const longest = Math.max(...landingSections.map((s) => s.venues.length));
  for (let i = 0; i < longest; i++) {
    for (const section of landingSections) {
      const card = section.venues[i];
      if (card && !seen.has(card.id) && byId.has(card.id)) {
        seen.add(card.id);
        order.push(byId.get(card.id));
      }
    }
  }
  const status = (index) =>
    index < APPROVED_COUNT
      ? "approved"
      : ["pending", "pending", "pending", "rejected", "suspended"][
          index - APPROVED_COUNT
        ];
  return order
    .slice(0, APPROVED_COUNT + 5)
    .map((venue, index) => ({ venue, status: status(index), index }));
}

// ---------------------------------------------------------------- small helpers

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
function karachiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
    now,
  ); // YYYY-MM-DD
}
const addDays = (day, n) =>
  isoDate(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);

// Money: decimal strings in, integer paisa for maths, decimal strings out (never JS float maths on money).
const toPaisa = (text) => {
  const [whole, fraction = ""] = String(text).split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
};
const fromPaisa = (paisa) =>
  `${Math.floor(paisa / 100)}.${String(paisa % 100).padStart(2, "0")}`;

const CATEGORY = [
  [/marquee/i, "marquee"],
  [/garden|lawn/i, "lawn"],
  [/estate|palace/i, "hotel_ballroom"],
  [/pavilion/i, "lawn"],
];
const categoryFor = (kindLabel) =>
  CATEGORY.find(([re]) => re.test(kindLabel))?.[1] ?? "banquet_hall";

const PHOTO_CATEGORY = {
  tour: "tour",
  hall: "main_hall",
  stage: "stage",
  bridal: "bridal_room",
  bathroom: "washrooms",
  parking: "parking",
  entrance: "entrance",
  hallway: "hallway",
};

const slugName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");

// ---------------------------------------------------------------- photos

// Seed photos are the WebP files the client already ships (client/src/assets). They are copied into
// <uploadsDir>/seed/ at run time (git-ignored), so the repo gains no image files, and served by the API at
// /uploads/seed/<name>. Only files the chosen venues use are copied.
function makePhotoCopier(uploadsDir) {
  const target = path.join(uploadsDir, "seed");
  fs.mkdirSync(target, { recursive: true });
  const copied = new Map();
  return (value) => {
    const file = assetFile(value);
    if (!file) throw new Error(`not a seed asset: ${value}`);
    if (!copied.has(file.fileName)) {
      const dest = path.join(target, file.fileName);
      const size = fs.statSync(file.source).size;
      if (!fs.existsSync(dest) || fs.statSync(dest).size !== size)
        fs.copyFileSync(file.source, dest);
      copied.set(file.fileName, {
        url: `/uploads/seed/${file.fileName}`,
        size,
      });
    }
    return copied.get(file.fileName);
  };
}

// ---------------------------------------------------------------- users

// Returns the user's id. An existing account with this email is reused and not changed, unless resetPassword is
// set and the account has a password from .env (then only its password changes and its sessions end). One with a
// different role is an error. New accounts get a fixed id; the password is hashed only when it is needed.
async function ensureUser(db, helpers, user, { resetPassword = false } = {}) {
  const { rows } = await db.query(
    "SELECT user_id, role FROM users WHERE email = $1::citext",
    [user.email],
  );
  if (rows[0]) {
    if (rows[0].role !== user.role) {
      throw new Error(
        `${user.email} already exists as ${rows[0].role}, not ${user.role}; use another email`,
      );
    }
    if (resetPassword && user.password) {
      await db.query(
        "UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1",
        [rows[0].user_id, await helpers.hashPassword(user.password)],
      );
      await db.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [rows[0].user_id],
      );
      return { id: rows[0].user_id, created: false, passwordReset: true };
    }
    return { id: rows[0].user_id, created: false };
  }
  const id = seedId(`user:${user.email.toLowerCase()}`);
  const passwordHash = await helpers.hashPassword(
    user.password ?? crypto.randomBytes(32).toString("base64url"),
  );
  await db.query(
    `INSERT INTO users (user_id, name, email, phone, password_hash, role, city)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      id,
      user.name,
      user.email.toLowerCase(),
      user.phone,
      passwordHash,
      user.role,
      user.city,
    ],
  );
  if (user.role === "customer") {
    await db.query(
      `INSERT INTO customers (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [id],
    );
  } else if (user.role === "venue_owner") {
    await db.query(
      `INSERT INTO venue_owners (user_id, business_name, contact_number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [id, user.businessName, user.phone],
    );
  } else if (user.role === "decorator") {
    await db.query(
      `INSERT INTO decorators (user_id, business_name, bio, city) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [id, user.businessName, user.bio, user.city],
    );
  } else if (user.role === "admin") {
    await db.query(
      `INSERT INTO admins (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [id],
    );
  }
  return { id, created: true };
}

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

// SEED_ADMIN_* (skipped with a message if name, email or password is missing) and SEED_DEMO_PASSWORD for the
// three demo accounts. Passwords are never printed.
function accountsFromEnv(env, helpers, notes) {
  const accounts = [];
  const {
    SEED_ADMIN_NAME,
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_ADMIN_PHONE,
    SEED_ADMIN_CITY,
  } = env;
  if (SEED_ADMIN_NAME && SEED_ADMIN_EMAIL && SEED_ADMIN_PASSWORD) {
    if (!PASSWORD_RULE.test(SEED_ADMIN_PASSWORD))
      throw new Error(
        "SEED_ADMIN_PASSWORD needs 8+ characters with letters and digits",
      );
    const phone = helpers.normalizePhone(SEED_ADMIN_PHONE || "0300-0000100");
    if (!phone)
      throw new Error(
        "SEED_ADMIN_PHONE is not a Pakistani mobile number like 0300-1234567",
      );
    accounts.push({
      key: "admin",
      role: "admin",
      name: SEED_ADMIN_NAME,
      email: SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      phone,
      city: SEED_ADMIN_CITY || "Faisalabad",
    });
  } else {
    notes.push(
      "admin skipped: set SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env to seed one",
    );
  }
  const demoPassword = env.SEED_DEMO_PASSWORD;
  if (demoPassword) {
    if (!PASSWORD_RULE.test(demoPassword))
      throw new Error(
        "SEED_DEMO_PASSWORD needs 8+ characters with letters and digits",
      );
    accounts.push(
      {
        key: "customer",
        role: "customer",
        name: "Demo Customer",
        email: "demo.customer@markiesharkie.pk",
        password: demoPassword,
        phone: "+923000000101",
        city: "Lahore",
      },
      {
        key: "owner",
        role: "venue_owner",
        name: "Demo Venue Owner",
        email: "demo.owner@markiesharkie.pk",
        password: demoPassword,
        phone: "+923000000102",
        city: "Lahore",
        businessName: "Demo Marquees & Banquets",
      },
      {
        key: "decorator",
        role: "decorator",
        name: "Demo Decorator",
        email: "demo.decorator@markiesharkie.pk",
        password: demoPassword,
        phone: "+923000000103",
        city: "Faisalabad",
        businessName: "Demo Floral Studio",
        bio: "Stage, floral and lighting decor for weddings, mehndis and receptions.",
      },
    );
  } else {
    notes.push(
      "demo customer / owner / decorator skipped: set SEED_DEMO_PASSWORD in .env to seed them",
    );
  }
  return accounts;
}

// ---------------------------------------------------------------- venues

const REJECTION_REASON =
  "The photos show a different building from the address given. Please list your own venue with your own photos.";
const SUSPENSION_REASON =
  "Several guests reported the venue was double-booked on the day. Suspended while we look into it.";

function venueRow(entry, { ownerId, adminId, today, avgRating }) {
  const { venue: v, status, index } = entry;
  const landmark = /^(\d+) min from (.+)$/.exec(v.nearby ?? "");
  // Approved ones went live over the last few months; the waiting ones were sent in the last few days.
  const submitted =
    status === "pending"
      ? addDays(today, -(index - APPROVED_COUNT + 1))
      : addDays(today, -(40 + index * 3));
  const reviewed = status === "pending" ? null : addDays(submitted, 1);
  const lowest = Math.min(
    ...v.menuPackages.map((m) => toPaisa(m.pricePerHead)),
  );
  return [
    seedId(`venue:${v.id}`), // 1
    ownerId,
    status === "pending" ? null : adminId,
    v.name,
    v.address, // 5
    v.city,
    v.lng,
    v.lat,
    v.venueType,
    v.supportedEvents, // 10
    Math.max(...v.halls.map((h) => h.capacity)),
    fromPaisa(lowest),
    v.facilities,
    v.description,
    avgRating, // 15
    status,
    status === "rejected" ? REJECTION_REASON : null,
    categoryFor(v.kindLabel),
    v.tagline.slice(0, 60),
    v.area, // 20
    landmark ? landmark[2] : null,
    landmark ? Number(landmark[1]) : null,
    v.locationDescription,
    v.parkingSpaces,
    v.bookingTerms.houseRules, // 25
    v.bookingTerms.advancePercent,
    v.bookingTerms.cancellationPolicy,
    status === "suspended" ? SUSPENSION_REASON : null,
    `${submitted}T09:00:00Z`,
    reviewed ? `${reviewed}T11:00:00Z` : null, // 30
    Number(today.slice(0, 4)) - v.host.yearsHosting,
  ];
}

async function insertVenue(db, row) {
  await db.query(
    `INSERT INTO venues (venue_id, owner_id, approved_by, name, address, city, location, venue_type, supported_events,
                         capacity, base_price, facilities, description, avg_rating, approval_status, rejection_reason,
                         category, headline, area, landmark, landmark_minutes, directions, parking_spaces, house_rules,
                         advance_percent, cancellation_policy, suspension_reason, submitted_at, reviewed_at,
                         hosting_since, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9::venue_type,
             $10::event_type[], $11, $12, $13, $14, $15, $16::approval_status, $17, $18, $19, $20, $21, $22, $23, $24,
             $25, $26, $27, $28, $29::timestamptz, $30::timestamptz, $31, $29::timestamptz)
     ON CONFLICT (venue_id) DO NOTHING`,
    row,
  );
}

// A Google Maps search link for the venue (no API key: it just opens Google Maps).
export const mapsSearchUrl = (name, city) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`;

async function insertVenueChildren(db, entry, venueId, photo) {
  const v = entry.venue;
  const live = entry.status === "approved" || entry.status === "suspended";

  for (const [index, hall] of v.halls.entries()) {
    const outdoor = /lawn/i.test(hall.name);
    const plan = hall.floorPlanUrl ? photo(hall.floorPlanUrl) : null;
    await db.query(
      `INSERT INTO halls (hall_id, venue_id, name, capacity, standing_capacity, setting, has_ac, length_ft, width_ft,
                          ceiling_ft, description, floor_plan_url, floor_plan_type, zone_stage, zone_entrance,
                          zone_seating, walkthrough_mode, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6::venue_type, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (hall_id) DO NOTHING`,
      [
        seedId(`hall:${hall.hallId}`),
        venueId,
        hall.name,
        hall.capacity,
        hall.standingCapacity,
        outdoor ? "outdoor" : "indoor",
        !outdoor,
        hall.lengthFt,
        hall.widthFt,
        hall.ceilingFt,
        hall.description,
        plan?.url ?? null,
        plan ? "image" : null,
        hall.zones?.stage ?? null,
        hall.zones?.entrance ?? null,
        hall.zones?.seating ?? null,
        hall.walkthrough?.mode ?? "skip",
        index,
      ],
    );
  }

  if (v.bridalSuite) {
    await db.query(
      `INSERT INTO bridal_suites (venue_id, name, capacity, length_ft, width_ft, description)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (venue_id) DO NOTHING`,
      [
        venueId,
        v.bridalSuite.name,
        v.bridalSuite.capacity,
        v.bridalSuite.lengthFt,
        v.bridalSuite.widthFt,
        v.bridalSuite.description,
      ],
    );
  }

  // Photos, in gallery order. The card photo (first "hall" photo of hall 1) is the cover. Seed photos are the
  // platform's own, so they count as genuine; they are published once the venue is live.
  const images = v.images.map((image, sortOrder) => {
    const file = photo(image.imageUrl);
    return {
      id: seedId(`image:${image.imageId}`),
      hallId: seedId(`hall:${image.hallId}`),
      category: PHOTO_CATEGORY[image.category] ?? "main_hall",
      url: file.url,
      size: file.size,
      sortOrder,
      isCover:
        image.imageUrl === v.image &&
        image.category === "hall" &&
        image.hallId === v.halls[0].hallId,
    };
  });
  let coverSet = false;
  for (const image of images) {
    if (image.isCover && !coverSet) coverSet = true;
    else image.isCover = false;
  }
  await db.query(
    `INSERT INTO venue_images (image_id, venue_id, hall_id, category, image_url, sort_order, is_cover, size_bytes,
                               mime_type, verification_status, is_published)
     SELECT id, $1, hall, cat, url, ord, cover, size, 'image/webp', 'genuine', $9
       FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::smallint[], $7::boolean[], $8::int[])
            AS t(id, hall, cat, url, ord, cover, size)
     ON CONFLICT (image_id) DO NOTHING`,
    [
      venueId,
      images.map((i) => i.id),
      images.map((i) => i.hallId),
      images.map((i) => i.category),
      images.map((i) => i.url),
      images.map((i) => i.sortOrder),
      images.map((i) => i.isCover),
      images.map((i) => i.size),
      live,
    ],
  );

  for (const [index, menu] of v.menuPackages.entries()) {
    const menuId = seedId(`menu:${menu.menuId}`);
    await db.query(
      `INSERT INTO menu_packages (menu_id, venue_id, name, description, price_per_head, is_customizable, min_guests, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (menu_id) DO NOTHING`,
      [
        menuId,
        venueId,
        menu.name,
        menu.description,
        menu.pricePerHead,
        menu.isCustomizable,
        menu.minGuests,
        index,
      ],
    );
    await db.query(
      `INSERT INTO menu_items (item_id, menu_id, name, category, is_optional, sort_order)
       SELECT id, $1, name, cat, false, ord
         FROM unnest($2::uuid[], $3::text[], $4::text[], $5::smallint[]) AS t(id, name, cat, ord)
       ON CONFLICT (item_id) DO NOTHING`,
      [
        menuId,
        menu.items.map((item) => seedId(`item:${item.itemId}`)),
        menu.items.map((item) => item.name),
        menu.items.map((item) => item.category),
        menu.items.map((_item, i) => i),
      ],
    );
  }

  for (const addOn of v.addOns) {
    await db.query(
      `INSERT INTO add_ons (add_on_id, venue_id, type, name, description, price, is_available)
       VALUES ($1, $2, $3::add_on_type, $4, $5, $6, true) ON CONFLICT (add_on_id) DO NOTHING`,
      [
        seedId(`addon:${addOn.addOnId}`),
        venueId,
        addOn.type,
        addOn.name,
        addOn.description,
        addOn.price,
      ],
    );
  }

  for (const [type, [start, end]] of Object.entries(SLOT_TIMES)) {
    await db.query(
      `INSERT INTO venue_slot_templates (venue_id, slot_type, start_time, end_time)
       VALUES ($1, $2, $3, $4) ON CONFLICT (venue_id, slot_type) DO NOTHING`,
      [venueId, type, start, end],
    );
  }

  for (const [index, tier] of (v.bookingTerms.customTiers ?? []).entries()) {
    await db.query(
      `INSERT INTO venue_cancellation_tiers (tier_id, venue_id, from_days, to_days, refund_percent)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tier_id) DO NOTHING`,
      [
        seedId(`tier:${v.id}:${index}`),
        venueId,
        Number(tier.fromDays),
        tier.toDays === "" ? null : Number(tier.toDays),
        Number(tier.refundPercent),
      ],
    );
  }
}

// ---------------------------------------------------------------- slots, bookings, reviews

// The next 60 days, Lunch and Dinner per hall. The mock's booked dates are booked in every hall (an offline,
// confirmed booking each, REQ-23), so "free on this date" searches and the calendars look real.
async function insertCalendar(db, entry, venueId, today) {
  const v = entry.venue;
  const booked = new Set(v.bookedDates);
  const slots = [];
  for (let day = 0; day < SLOT_DAYS; day++) {
    const date = addDays(today, day);
    for (const hall of v.halls) {
      for (const [type, [start, end]] of Object.entries(SLOT_TIMES)) {
        slots.push({
          id: seedId(`slot:${hall.hallId}:${date}:${type}`),
          hallId: seedId(`hall:${hall.hallId}`),
          date,
          start,
          end,
          booked: booked.has(date),
          guests: Math.min(hall.capacity, 300),
        });
      }
    }
  }
  await db.query(
    `INSERT INTO time_slots (slot_id, venue_id, hall_id, date, start_time, end_time, status)
     SELECT id, $1, hall, d, s, e, CASE WHEN b THEN 'booked' ELSE 'available' END::slot_status
       FROM unnest($2::uuid[], $3::uuid[], $4::date[], $5::time[], $6::time[], $7::boolean[]) AS t(id, hall, d, s, e, b)
     ON CONFLICT DO NOTHING`,
    [
      venueId,
      slots.map((s) => s.id),
      slots.map((s) => s.hallId),
      slots.map((s) => s.date),
      slots.map((s) => s.start),
      slots.map((s) => s.end),
      slots.map((s) => s.booked),
    ],
  );
  const offline = slots.filter((s) => s.booked);
  const price = toPaisa(v.menuPackages[0].pricePerHead);
  await db.query(
    `INSERT INTO bookings (booking_id, slot_id, venue_id, hall_id, event_type, guest_count, status, source, client_name,
                           client_phone, total_amount, advance_amount)
     SELECT id, slot, $1, hall, 'wedding', guests, 'confirmed', 'offline', 'Walk-in client', '+923000000999', total, 0
       FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::int[], $6::numeric[]) AS t(id, slot, hall, guests, total)
     ON CONFLICT DO NOTHING`,
    [
      venueId,
      offline.map((s) => seedId(`booking:${s.id}`)),
      offline.map((s) => s.id),
      offline.map((s) => s.hallId),
      offline.map((s) => s.guests),
      offline.map((s) => fromPaisa(price * s.guests)),
    ],
  );
}

// D4 (B): every mock review comes from a real, completed booking (REQ-42 "after a completed event"), on a past
// evening slot of hall 1, by one of the reviewer accounts.
function reviewPlan(entry) {
  const v = entry.venue;
  const used = new Set();
  return v.reviews.map((review) => {
    let date = isoDate(Date.parse(review.createdAt) - DAY_MS);
    while (used.has(date))
      date = isoDate(Date.parse(`${date}T00:00:00Z`) - DAY_MS);
    used.add(date);
    return { review, date };
  });
}

async function insertReviews(db, entry, venueId, reviewerIds) {
  const v = entry.venue;
  const hall = v.halls[0];
  const hallId = seedId(`hall:${hall.hallId}`);
  const price = toPaisa(v.menuPackages[0].pricePerHead);
  for (const { review, date } of reviewPlan(entry)) {
    const slotId = seedId(`past-slot:${review.reviewId}`);
    const bookingId = seedId(`past-booking:${review.reviewId}`);
    const guests = Math.min(hall.capacity, 250);
    await db.query(
      `INSERT INTO time_slots (slot_id, venue_id, hall_id, date, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, '19:00', '23:00', 'booked') ON CONFLICT DO NOTHING`,
      [slotId, venueId, hallId, date],
    );
    await db.query(
      `INSERT INTO bookings (booking_id, slot_id, customer_id, venue_id, hall_id, event_type, guest_count, status,
                             source, total_amount, advance_amount, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::event_type, $7, 'completed', 'online', $8, $9, $10::date - 30)
       ON CONFLICT DO NOTHING`,
      [
        bookingId,
        slotId,
        reviewerIds.get(review.customerName),
        venueId,
        hallId,
        review.eventType,
        guests,
        fromPaisa(price * guests),
        fromPaisa(Math.round((price * guests) / 4)),
        date,
      ],
    );
    await db.query(
      `INSERT INTO reviews (review_id, customer_id, booking_id, venue_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [
        seedId(`review:${review.reviewId}`),
        reviewerIds.get(review.customerName),
        bookingId,
        venueId,
        review.rating,
        review.comment,
        review.createdAt,
      ],
    );
  }
}

// ---------------------------------------------------------------- main

// Row counts of every table the seed writes (one fixed query, no SQL built from values).
export async function countRows(db) {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM users)::int                    AS users,
            (SELECT count(*) FROM admins)::int                   AS admins,
            (SELECT count(*) FROM customers)::int                AS customers,
            (SELECT count(*) FROM venue_owners)::int             AS venue_owners,
            (SELECT count(*) FROM decorators)::int               AS decorators,
            (SELECT count(*) FROM venues)::int                   AS venues,
            (SELECT count(*) FROM halls)::int                    AS halls,
            (SELECT count(*) FROM bridal_suites)::int            AS bridal_suites,
            (SELECT count(*) FROM venue_images)::int             AS venue_images,
            (SELECT count(*) FROM menu_packages)::int            AS menu_packages,
            (SELECT count(*) FROM menu_items)::int               AS menu_items,
            (SELECT count(*) FROM add_ons)::int                  AS add_ons,
            (SELECT count(*) FROM venue_slot_templates)::int     AS venue_slot_templates,
            (SELECT count(*) FROM venue_cancellation_tiers)::int AS venue_cancellation_tiers,
            (SELECT count(*) FROM time_slots)::int               AS time_slots,
            (SELECT count(*) FROM bookings)::int                 AS bookings,
            (SELECT count(*) FROM reviews)::int                  AS reviews`,
  );
  return rows[0];
}

// The whole seed. Run it inside one transaction (the caller does BEGIN / COMMIT). Returns { counts, notes, created }.
// helpers: { hashPassword(text) -> argon2 hash, normalizePhone(text) -> '+923...' | null }
// resetPasswords: also set the admin's and demo accounts' passwords to the ones in env (npm run seed -- --reset-passwords).
export async function seedDatabase(
  db,
  { env = {}, helpers, uploadsDir, now = new Date(), resetPasswords = false },
) {
  const notes = [];
  const today = karachiToday(now);
  const { landingSections, venues } = await loadMockCatalog();
  const picked = pickVenues(landingSections, venues);
  const photo = makePhotoCopier(uploadsDir);

  // Accounts
  const ids = {};
  let created = 0;
  for (const account of accountsFromEnv(env, helpers, notes)) {
    const result = await ensureUser(db, helpers, account, {
      resetPassword: resetPasswords,
    });
    ids[account.key] = result.id;
    if (result.created) created++;
    if (result.passwordReset)
      notes.push(
        `password updated from .env for ${account.email} (its sessions ended)`,
      );
  }
  // The catalogue's owner and the reviewers can't log in (random password nobody knows).
  const host = await ensureUser(db, helpers, {
    role: "venue_owner",
    name: "MarkieSharkie Venues",
    email: "venues@markiesharkie.pk",
    phone: "+923000000110",
    city: "Lahore",
    businessName: "MarkieSharkie partner venues",
  });
  const reviewerNames = [
    ...new Set(
      picked.flatMap(({ venue }) => venue.reviews.map((r) => r.customerName)),
    ),
  ].sort();
  const reviewerIds = new Map();
  for (const [index, name] of reviewerNames.entries()) {
    const city = picked
      .flatMap(({ venue }) => venue.reviews)
      .find((r) => r.customerName === name)
      .customerCity.split(",")[0];
    const result = await ensureUser(db, helpers, {
      role: "customer",
      name,
      email: `reviewer.${slugName(name)}@markiesharkie.pk`,
      phone: `+9230000002${String(index).padStart(2, "0")}`,
      city,
    });
    reviewerIds.set(name, result.id);
  }

  // Venues. The demo owner (if seeded) owns two live venues and the five the admin has to deal with, so their
  // "My venues" list shows every status; the rest belong to the catalogue owner.
  for (const entry of picked) {
    const venueId = seedId(`venue:${entry.venue.id}`);
    const demoOwned =
      ids.owner && (entry.index < 2 || entry.status !== "approved");
    const live = entry.status === "approved" || entry.status === "suspended";
    const ratings = live
      ? reviewPlan(entry).map(({ review }) => review.rating)
      : [];
    const avgRating = ratings.length
      ? Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100,
        ) / 100
      : 0;
    await insertVenue(
      db,
      venueRow(entry, {
        ownerId: demoOwned ? ids.owner : host.id,
        adminId: ids.admin ?? null,
        today,
        avgRating,
      }),
    );
    await insertVenueChildren(db, entry, venueId, photo);
    // srs-alignment #37: every 4th live venue gets a Google Maps link so both states of "Read reviews on Google"
    // can be demoed. Only set when empty, so a link an owner entered is never overwritten (idempotent).
    if (entry.status === "approved" && entry.index % 4 === 0) {
      await db.query(
        "UPDATE venues SET google_maps_url = $2 WHERE venue_id = $1 AND google_maps_url IS NULL",
        [venueId, mapsSearchUrl(entry.venue.name, entry.venue.city)],
      );
    }
    if (live) {
      await insertCalendar(db, entry, venueId, today);
      await insertReviews(db, entry, venueId, reviewerIds);
    }
  }

  return { counts: await countRows(db), notes, created, today };
}

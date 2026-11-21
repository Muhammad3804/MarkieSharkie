import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { unauthenticated } from '../../lib/AppError.js'
import { mapUserUniqueViolation, takenError } from '../../lib/pgErrors.js'
import * as repo from './repository.js'

// UC-04 Manage Profile (EUC-03, REQ-4). The user id always comes from req.user (the verified token + DB), never
// from the request body or params, so a user can only ever read or change their own profile.

export async function getProfile(userId) {
  const profile = await repo.findProfile(pool, userId)
  if (!profile) throw unauthenticated() // deleted between authenticate and here
  return profile
}

function pick(input, keys) {
  const out = {}
  for (const key of keys) if (input[key] !== undefined) out[key] = input[key]
  return out
}

// EUC-03 steps 5-7: input is already validated for this role. users + role row change in ONE transaction, so an
// error anywhere saves nothing (step 5.1). Returns the updated profile (step 7 "confirms the update").
export async function updateProfile({ id: userId, role }, input) {
  const userFields = pick(input, ['name', 'phone', 'city'])

  try {
    return await withTransaction(async (client) => {
      if (userFields.phone && (await repo.isPhoneUsedByAnotherUser(client, { phone: userFields.phone, userId }))) {
        throw takenError({ phoneTaken: true })
      }

      if (Object.keys(userFields).length) {
        const updated = await repo.updateUserFields(client, userId, userFields)
        if (!updated) throw unauthenticated()
      }

      if (role === 'customer' && input.preferences !== undefined) {
        // preference_embedding is not recomputed here; that is REQ-15 (Phase 3 recommendations).
        await expectRow(repo.updateCustomerPreferences(client, userId, input.preferences), role)
      }
      if (role === 'venue_owner') {
        const fields = pick(input, ['businessName', 'contactNumber'])
        if (Object.keys(fields).length) await expectRow(repo.updateVenueOwner(client, userId, fields), role)
      }
      if (role === 'decorator') {
        const fields = pick(input, ['businessName', 'bio', 'serviceCity'])
        if (Object.keys(fields).length) await expectRow(repo.updateDecorator(client, userId, fields), role)
      }

      return repo.findProfile(client, userId)
    })
  } catch (err) {
    throw mapUserUniqueViolation(err) // phone taken by a concurrent change (23505 users_phone_key)
  }
}

// A role user without its role row would be a data bug (registration inserts both); fail loudly, roll back.
async function expectRow(promise, role) {
  if (!(await promise)) throw new Error(`profile update found no ${role} row`)
}

function page({ page, pageSize }) {
  return { limit: pageSize, offset: (page - 1) * pageSize }
}

// EUC-03 step 2 "past searches" (customer only; route enforces the role).
export async function listSearches(customerId, query) {
  const [total, data] = await Promise.all([
    repo.countSearches(pool, customerId),
    repo.listSearches(pool, customerId, page(query)),
  ])
  return { data, page: query.page, pageSize: query.pageSize, total }
}

// EUC-03 step 2 "bookings" (customer only; route enforces the role). Only rows with customer_id = this customer.
export async function listBookings(customerId, query) {
  const [total, data] = await Promise.all([
    repo.countBookings(pool, customerId),
    repo.listBookings(pool, customerId, page(query)),
  ])
  return { data, page: query.page, pageSize: query.pageSize, total }
}

import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { validationError } from '../../lib/validation.js'
import * as repo from './repository.js'
import * as users from './usersRepository.js'

// Admin user management (REQ-47, EUC-33, srs-alignment #40). Each action locks the target user (and, when an admin
// could lose their role or access, every active admin), checks the safeguards and writes admin_audit_log in the
// same transaction (NFR-4).
//   - No admin acts on themselves; the last active admin can't be suspended, demoted or deleted (409).
//   - Suspend: account inactive, every refresh token revoked (signed out everywhere), login refused with
//     ACCOUNT_SUSPENDED; an owner's venues drop out of search and pages, confirmed bookings stay.
//   - Role change between customer, venue owner and decorator (admins are only created by the CLI, REQ-1), refused
//     while the old role still has live work (an owner's venues, a customer's active bookings).
//   - Delete = anonymise (NFR-8): the row stays for bookings and the audit log, personal data is replaced.

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const userNotFound = () => notFoundError('We couldn’t find that user.')
const statusOf = (u) => (u.deleted_at ? 'deleted' : u.is_active ? 'active' : 'suspended')
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

function toRow(u) {
  return {
    id: u.user_id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    city: u.city,
    status: statusOf(u),
    createdAt: iso(u.created_at),
    lastLoginAt: iso(u.last_login_at),
    suspensionReason: u.suspension_reason,
    activeBookings: u.active_bookings,
    venueCount: u.venue_count,
  }
}

export async function listUsers(query) {
  const rows = await users.listUsers(pool, {
    q: query.q ? escapeLike(query.q) : null,
    role: query.role,
    status: query.status,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })
  const total = rows[0]?.total ?? 0
  return {
    rows: rows.map(toRow),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: await users.userCounts(pool),
  }
}

export async function getUser(id) {
  const u = await users.findUser(pool, id)
  if (!u) throw userNotFound()
  const [act, history] = await Promise.all([users.activity(pool, id), users.userHistory(pool, id)])
  return {
    user: {
      id: u.user_id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      city: u.city,
      status: statusOf(u),
      createdAt: iso(u.created_at),
      lastLoginAt: iso(u.last_login_at),
      deletedAt: iso(u.deleted_at),
      suspensionReason: u.suspension_reason,
      suspendedAt: iso(u.suspended_at),
      lockedUntil: iso(u.locked_until),
      business:
        u.role === 'venue_owner'
          ? { name: u.owner_business_name, contactNumber: u.contact_number }
          : u.role === 'decorator'
            ? { name: u.decorator_business_name, bio: u.bio, city: u.decorator_city }
            : null,
      activity: {
        activeBookings: act.active_bookings,
        allBookings: act.all_bookings,
        venueCount: act.venue_count,
        liveVenues: act.live_venues,
        activeVenueBookings: act.active_venue_bookings,
      },
    },
    history: history.map((h) => ({ action: h.action, details: h.details, at: iso(h.created_at), by: h.admin_name })),
  }
}

// Locks the target; refuses self-actions and actions that would leave no active admin.
async function guard(client, actorId, targetId, { removesAdmin }) {
  if (actorId === targetId)
    throw new AppError(409, 'SELF_ACTION', 'You can’t do that to your own account. Ask another admin.')
  const target = await users.lockUser(client, targetId)
  if (!target) throw userNotFound()
  if (target.deleted_at) throw new AppError(409, 'INVALID_STATUS', 'This account has been deleted.')
  if (target.role === 'admin' && removesAdmin) {
    const admins = await users.lockActiveAdmins(client)
    if (admins.includes(targetId) && admins.length <= 1)
      throw new AppError(409, 'LAST_ADMIN', 'This is the last active admin. Add another admin first.')
  }
  return target
}

async function audit(client, adminId, action, targetId, details) {
  await repo.insertAudit(client, { adminId, action, targetTable: 'users', targetId, details })
}

export async function suspendUser(adminId, id, { reason }) {
  return withTransaction(async (client) => {
    const target = await guard(client, adminId, id, { removesAdmin: true })
    if (!target.is_active) throw new AppError(409, 'INVALID_STATUS', 'This account is already suspended.')
    const act = await users.activity(client, id)
    await users.setSuspended(client, { userId: id, suspended: true, reason })
    await users.revokeSessions(client, id)
    await audit(client, adminId, 'user.suspend', id, {
      reason,
      role: target.role,
      activeBookings: act.active_bookings,
      liveVenues: act.live_venues,
    })
    return { status: 'suspended' }
  })
}

export async function reactivateUser(adminId, id, { reason }) {
  return withTransaction(async (client) => {
    const target = await guard(client, adminId, id, { removesAdmin: false })
    if (target.is_active) throw new AppError(409, 'INVALID_STATUS', 'This account is already active.')
    await users.setSuspended(client, { userId: id, suspended: false })
    await audit(client, adminId, 'user.reactivate', id, { reason, role: target.role })
    return { status: 'active' }
  })
}

export async function changeRole(adminId, id, body) {
  return withTransaction(async (client) => {
    const target = await guard(client, adminId, id, { removesAdmin: true })
    if (target.role === body.role)
      throw new AppError(409, 'INVALID_STATUS', `This account is already a ${body.role.replace('_', ' ')}.`)
    const act = await users.activity(client, id)
    if (target.role === 'venue_owner' && act.venue_count > 0)
      throw new AppError(
        409,
        'HAS_VENUES',
        `This owner has ${act.venue_count} venue${act.venue_count === 1 ? '' : 's'}. Their venues need an owner, so the role can’t change.`,
      )
    if (target.role === 'customer' && act.active_bookings > 0)
      throw new AppError(
        409,
        'HAS_ACTIVE_BOOKINGS',
        `This customer has ${act.active_bookings} active booking${act.active_bookings === 1 ? '' : 's'}. Wait until they’re finished or cancelled.`,
      )
    const u = await users.findUser(client, id)
    if (body.role === 'customer') await users.ensureCustomer(client, id)
    if (body.role === 'venue_owner') {
      if (!body.businessName) throw validationError([{ field: 'businessName', message: 'Add the business name.' }])
      await users.upsertVenueOwner(client, {
        userId: id,
        businessName: body.businessName,
        contactNumber: body.contactNumber ?? u.phone,
      })
    }
    if (body.role === 'decorator') {
      const problems = []
      if (!body.businessName) problems.push({ field: 'businessName', message: 'Add the business name.' })
      if (!body.bio) problems.push({ field: 'bio', message: 'Add a short description of their services.' })
      if (problems.length) throw validationError(problems)
      await users.upsertDecorator(client, {
        userId: id,
        businessName: body.businessName,
        bio: body.bio,
        city: body.city ?? u.city,
      })
    }
    await users.setRole(client, { userId: id, role: body.role })
    await users.revokeSessions(client, id) // the new role applies from the next login
    await audit(client, adminId, 'user.role_change', id, { reason: body.reason, from: target.role, to: body.role })
    return { role: body.role }
  })
}

export async function deleteUser(adminId, id, { reason }) {
  return withTransaction(async (client) => {
    const target = await guard(client, adminId, id, { removesAdmin: true })
    const act = await users.activity(client, id)
    await users.anonymise(client, id)
    await users.revokeSessions(client, id)
    // The audit row keeps who the account was (admins only can read it), so the deletion can be explained later.
    await audit(client, adminId, 'user.delete', id, {
      reason,
      role: target.role,
      name: target.name,
      activeBookings: act.active_bookings,
      activeVenueBookings: act.active_venue_bookings,
    })
    return { status: 'deleted' }
  })
}

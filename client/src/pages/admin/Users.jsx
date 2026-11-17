import { useEffect, useRef, useState } from 'react'
import { getUser, listUsers, setUserState } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import AdminIcon from '../../features/admin/icons.jsx'
import { Button, Card, EmptyState, ErrorState, Initials, PageHeader, Pager, SearchField, SelectField, Skeleton, SkeletonRows, StatusBadge, Th, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { ROLE_LABELS, actionLabel, ago, formatDate, formatDateTime } from '../../features/admin/format.js'

// REQ-47: view and search users, suspend, unblock, remove; warn first when the user has active bookings.
// The open user is ?user=<id>, so the panel survives a refresh and Back closes it.
const DEFAULTS = { role: '', status: '', q: '', page: 1, user: '' }
const ROLE_TABS = [
  { value: '', label: 'All users' },
  { value: 'customer', label: 'Customers' },
  { value: 'venue_owner', label: 'Venue owners' },
  { value: 'decorator', label: 'Decorators' },
]
const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'removed', label: 'Removed' },
]
const ACTION_COPY = {
  suspend: { title: 'Suspend', confirm: 'Suspend user', tone: 'danger', body: 'They can’t sign in or use MarkieSharkie until you unblock them (REQ-3).', done: 'suspended' },
  unblock: { title: 'Unblock', confirm: 'Unblock user', tone: 'primary', body: 'They can sign in again straight away.', done: 'unblocked' },
  remove: { title: 'Remove', confirm: 'Remove account', tone: 'danger', body: 'The account is closed and personal details are anonymised. This can’t be undone.', done: 'removed' },
}

export default function Users() {
  const [params, setParams] = useUrlState(DEFAULTS, { role: ROLE_TABS.map((t) => t.value), status: STATUS_OPTIONS.map((o) => o.value) })
  const href = useHref()
  const { user: openUserId, ...listParams } = params
  const { status, data, reload, refreshing } = useAdminData(() => listUsers(listParams), JSON.stringify(listParams))
  const [pending, setPending] = useState(null) // { user, action }
  const rows = data?.rows ?? []
  const openUser = (id) => setParams({ user: id, page: params.page }, { push: true })

  const totalCount = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : undefined
  return (
    <>
      <title>Users | Admin | MarkieSharkie</title>
      <PageHeader title="Users" description="Customers, venue owners and decorators. Admin accounts are created by another admin." />
      <UrlTabs label="Role" value={params.role} hrefFor={(value) => href({ role: value, user: '' })} items={ROLE_TABS.map((tab) => ({ ...tab, count: tab.value ? data?.counts[tab.value] : totalCount }))} />
      <Card bodyClassName="">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:p-4">
          <SearchField label="Search users" value={params.q} onChange={(q) => setParams({ q })} placeholder="Search by name, email, phone or city" className="flex-1" />
          <SelectField label="Status" value={params.status} onChange={(value) => setParams({ status: value })} options={STATUS_OPTIONS} className="sm:w-40" />
        </div>
        {status === 'loading' ? (
          <SkeletonRows label="Loading users" />
        ) : status === 'error' ? (
          <ErrorState onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon="users" title="No users match" body="Try another search, role or status." action={(params.q || params.status) && <Button variant="secondary" onClick={() => setParams({ q: '', status: '' })}>Clear search</Button>} />
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : ''}>
            <table className="hidden w-full text-[14px] md:table">
              <caption className="sr-only">Users</caption>
              <thead className="border-b border-line bg-surface/60">
                <tr>
                  <Th className="pl-4">Name</Th>
                  <Th>Role</Th>
                  <Th className="hidden lg:table-cell">City</Th>
                  <Th className="hidden text-right lg:table-cell">Active bookings</Th>
                  <Th>Joined</Th>
                  <Th>Status</Th>
                  <Th className="pr-4 text-right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((user) => (
                  <tr key={user.id} className="hover:bg-surface/60">
                    <td className="py-2.5 pr-3 pl-4">
                      <div className="flex items-center gap-3">
                        <Initials name={user.name} />
                        <div className="min-w-0">
                          <button type="button" onClick={() => openUser(user.id)} className={`block truncate rounded text-left font-medium text-ink-strong hover:text-primary hover:underline ${focusRing}`}>{user.name}</button>
                          <p className="truncate text-[13px] text-muted-warm">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink">{ROLE_LABELS[user.role]}</td>
                    <td className="hidden px-3 py-2.5 text-ink lg:table-cell">{user.city}</td>
                    <td className="hidden px-3 py-2.5 text-right text-ink tabular-nums lg:table-cell">{user.activeBookings}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink">{formatDate(user.createdAt)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={user.status} /></td>
                    <td className="py-2.5 pr-4">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" icon="eye" onClick={() => openUser(user.id)} aria-label={`View ${user.name}`}>View</Button>
                        <UserActions user={user} onAction={(action) => setPending({ user, action })} compact />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((user) => (
                <li key={user.id}>
                  <button type="button" onClick={() => openUser(user.id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface ${focusRing} focus-visible:-outline-offset-2`}>
                    <Initials name={user.name} className="size-9 text-[12px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink-strong">{user.name}</span>
                      <span className="block truncate text-[13px] text-muted-warm">{ROLE_LABELS[user.role]} · {user.city}</span>
                    </span>
                    <StatusBadge status={user.status} />
                    <AdminIcon name="chevron-right" className="size-4 text-muted-warm" />
                  </button>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page, user: '' })} noun="users" />
          </div>
        )}
      </Card>

      <UserPanel userId={openUserId} onClose={() => setParams({ user: '', page: params.page })} onAction={(user, action) => setPending({ user, action })} />

      <ConfirmDialog
        open={Boolean(pending)}
        tone={pending ? ACTION_COPY[pending.action].tone : 'primary'}
        title={pending && `${ACTION_COPY[pending.action].title} ${pending.user.name}?`}
        body={pending && ACTION_COPY[pending.action].body}
        warning={pending && pending.action !== 'unblock' && pending.user.activeBookings > 0 && `${pending.user.name} has ${pending.user.activeBookings} active ${pending.user.activeBookings === 1 ? 'booking' : 'bookings'}. They stay in place; contact the ${pending.user.role === 'venue_owner' ? 'customers' : 'venue owners'} involved before you continue (REQ-47).`}
        confirmLabel={pending ? ACTION_COPY[pending.action].confirm : ''}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          await setUserState(pending.user.id, pending.action)
          return `${pending.user.name} ${ACTION_COPY[pending.action].done}`
        }}
      />
    </>
  )
}

function UserActions({ user, onAction, compact = false }) {
  if (user.status === 'removed') return null
  return (
    <>
      {user.status === 'active' ? (
        <Button size={compact ? 'sm' : 'md'} variant="danger-outline" icon="ban" onClick={() => onAction('suspend')} aria-label={`Suspend ${user.name}`}>Suspend</Button>
      ) : (
        <Button size={compact ? 'sm' : 'md'} variant="secondary" icon="rotate-ccw" onClick={() => onAction('unblock')} aria-label={`Unblock ${user.name}`}>Unblock</Button>
      )}
      {!compact && (
        <Button variant="ghost" icon="trash" onClick={() => onAction('remove')} className="text-danger hover:bg-danger-bg">Remove account</Button>
      )}
    </>
  )
}

// Side panel (native modal dialog) with the user's details and their audit history.
function UserPanel({ userId, onClose, onAction }) {
  const ref = useRef(null)
  const { status, data } = useAdminData(() => (userId ? getUser(userId) : Promise.resolve(null)), userId || 'none')
  useEffect(() => {
    const dialog = ref.current
    if (userId && !dialog.open) dialog.showModal()
    if (!userId && dialog.open) dialog.close()
  }, [userId])

  return (
    <dialog
      ref={ref}
      aria-label="User details"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => event.target === ref.current && onClose()}
      className="ml-auto mr-0 h-dvh max-h-none w-full max-w-md bg-white p-0 backdrop:bg-ink-strong/40 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold text-ink-strong">User details</h2>
        <button type="button" onClick={onClose} aria-label="Close" className={`grid size-10 place-items-center rounded-lg text-muted-warm hover:bg-surface ${focusRing}`}>
          <AdminIcon name="x" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {status === 'loading' ? (
          <div aria-busy="true" aria-label="Loading user" className="flex flex-col gap-3">
            <Skeleton className="size-14 rounded-full" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : status === 'error' ? (
          <ErrorState title="Couldn’t load this user" />
        ) : !data ? (
          <EmptyState icon="users" title="User not found" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Initials name={data.name} className="size-14 text-[16px]" />
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold text-ink-strong">{data.name}</p>
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-warm">
                  {ROLE_LABELS[data.role]} <StatusBadge status={data.status} />
                </p>
              </div>
            </div>
            <dl className="grid gap-3 text-[14px]">
              {[
                ['Email', data.email],
                ['Phone', <span key="p" className="tabular-nums">{data.phone}</span>],
                ['City', data.city],
                data.businessName && ['Business', data.businessName],
                ['Joined', formatDate(data.createdAt)],
                ['Last sign-in', `${ago(data.lastLoginAt)} (${formatDateTime(data.lastLoginAt)})`],
                ['Active bookings', data.activeBookings],
                data.deletedAt && ['Removed', formatDateTime(data.deletedAt)],
              ]
                .filter(Boolean)
                .map(([term, value]) => (
                  <div key={term} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                    <dt className="text-muted-warm">{term}</dt>
                    <dd className="break-words text-ink-strong">{value}</dd>
                  </div>
                ))}
            </dl>
            {data.activeBookings > 0 && data.status !== 'removed' && (
              <p className="flex gap-2 rounded-lg bg-pending-bg px-3 py-2.5 text-[13px] text-pending">
                <AdminIcon name="alert" className="mt-px size-4" />
                Has {data.activeBookings} active {data.activeBookings === 1 ? 'booking' : 'bookings'}. Check them before suspending or removing.
              </p>
            )}
            {data.status !== 'removed' && (
              <div className="flex flex-wrap gap-2">
                <UserActions user={data} onAction={(action) => onAction(data, action)} />
              </div>
            )}
            <section aria-labelledby="user-history">
              <h3 id="user-history" className="text-[13px] font-semibold text-ink-strong">Admin history</h3>
              {data.history.length === 0 ? (
                <p className="mt-1 text-[13px] text-muted-warm">No admin actions on this account.</p>
              ) : (
                <ol className="mt-2 flex flex-col gap-2">
                  {data.history.map((entry) => (
                    <li key={entry.logId} className="text-[13px]">
                      <span className="font-medium text-ink-strong">{actionLabel(entry.action)}</span> by {entry.adminName}
                      <span className="block text-[12px] text-muted-warm">{formatDateTime(entry.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </dialog>
  )
}

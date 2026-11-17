import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listVenues, suspendVenue, unsuspendVenue } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, Pager, SearchField, SelectField, SkeletonRows, SortHeader, StatusBadge, Th, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { VENUE_TYPE_LABELS, formatDate } from '../../features/admin/format.js'

// Every live venue (mock catalogue + approved listings). Suspending hides a venue from the home page, Explore and
// its venue page straight away (venues.is_active = false on the server); unsuspending brings it back.
const DEFAULTS = { status: 'live', q: '', city: '', sort: 'newest', page: 1 }
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'capacity', label: 'Largest capacity' },
]

export default function Venues() {
  const [params, setParams] = useUrlState(DEFAULTS, { status: ['live', 'suspended'], sort: SORTS.map((s) => s.value) })
  const href = useHref()
  const { status, data, reload, refreshing } = useAdminData(() => listVenues(params), JSON.stringify(params))
  const [target, setTarget] = useState(null) // { venue, action }
  const rows = data?.rows ?? []

  const actionsFor = (venue) =>
    venue.suspended ? (
      <Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => setTarget({ venue, action: 'unsuspend' })} aria-label={`Unsuspend ${venue.name}`}>Unsuspend</Button>
    ) : (
      <>
        <Button size="sm" variant="ghost" icon="external-link" to={`/venues/${venue.id}`} target="_blank" rel="noopener" aria-label={`View ${venue.name} on the site (new tab)`}>
          <span className="hidden xl:inline">View</span>
        </Button>
        <Button size="sm" variant="danger-outline" icon="ban" onClick={() => setTarget({ venue, action: 'suspend' })} aria-label={`Suspend ${venue.name}`}>Suspend</Button>
      </>
    )

  return (
    <>
      <title>All venues | Admin | MarkieSharkie</title>
      <PageHeader title="All venues" description="Venues customers can find. Suspend one to hide it from the site while you look into a problem." />
      <UrlTabs
        label="Venue status"
        value={params.status}
        hrefFor={(value) => href({ status: value === 'live' ? '' : value })}
        items={[
          { value: 'live', label: 'Live', count: data?.counts.live },
          { value: 'suspended', label: 'Suspended', count: data?.counts.suspended },
        ]}
      />
      <Card bodyClassName="">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:p-4">
          <SearchField label="Search venues" value={params.q} onChange={(q) => setParams({ q })} placeholder="Search by name, area or owner" className="flex-1" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <SelectField label="City" value={params.city} onChange={(city) => setParams({ city })} options={[{ value: '', label: 'All cities' }, ...(data?.cities ?? []).map((city) => ({ value: city, label: city }))]} className="sm:w-40" />
            <SelectField label="Sort" value={params.sort} onChange={(sort) => setParams({ sort })} options={SORTS} className="sm:w-44" />
          </div>
        </div>
        {status === 'loading' ? (
          <SkeletonRows label="Loading venues" />
        ) : status === 'error' ? (
          <ErrorState onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon={params.q || params.city ? 'search' : 'building'} title={params.q || params.city ? 'No venues match' : params.status === 'suspended' ? 'No suspended venues' : 'No live venues'} body={params.q || params.city ? 'Try another search or city.' : undefined} action={(params.q || params.city) && <Button variant="secondary" onClick={() => setParams({ q: '', city: '' })}>Clear search</Button>} />
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : ''}>
            <table className="hidden w-full text-[14px] md:table">
              <caption className="sr-only">{params.status === 'live' ? 'Live venues' : 'Suspended venues'}</caption>
              <thead className="border-b border-line bg-surface/60">
                <tr>
                  <SortHeader label="Venue" sortKey="name" sort={params.sort} onSort={(sort) => setParams({ sort })} className="pl-4" />
                  <Th className="hidden lg:table-cell">Type</Th>
                  <SortHeader label="Capacity" sortKey="capacity" direction="descending" sort={params.sort} onSort={(sort) => setParams({ sort })} className="text-right" />
                  <SortHeader label="Rating" sortKey="rating" direction="descending" sort={params.sort} onSort={(sort) => setParams({ sort })} className="hidden text-right lg:table-cell" />
                  <SortHeader label={params.status === 'suspended' ? 'Suspended' : 'Listed'} sortKey="newest" direction="descending" sort={params.sort} onSort={(sort) => setParams({ sort })} />
                  <Th className="pr-4 text-right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((venue) => (
                  <tr key={venue.id} className="hover:bg-surface/60">
                    <td className="py-2.5 pr-3 pl-4">
                      <div className="flex items-center gap-3">
                        {venue.image ? <img src={venue.image} alt="" width="48" height="40" loading="lazy" className="h-10 w-12 shrink-0 rounded-md bg-surface object-cover" /> : <span className="h-10 w-12 shrink-0 rounded-md bg-surface" />}
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium text-ink-strong">
                            {venue.name}
                            {venue.source === 'listing' && <span className="rounded bg-rose px-1.5 py-px text-[11px] font-semibold text-primary">New</span>}
                          </p>
                          <p className="truncate text-[13px] text-muted-warm">{venue.area}, {venue.city} · {venue.ownerName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink lg:table-cell">{VENUE_TYPE_LABELS[venue.venueType]}</td>
                    <td className="px-3 py-2.5 text-right text-ink tabular-nums">{venue.capacity.toLocaleString('en-US')}</td>
                    <td className="hidden px-3 py-2.5 text-right text-ink tabular-nums lg:table-cell">{venue.reviewCount ? `${venue.rating.toFixed(2)} (${venue.reviewCount})` : 'New'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink">{params.status === 'suspended' ? formatDate(venue.suspended.at) : formatDate(venue.listedAt)}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex justify-end gap-1.5">{actionsFor(venue)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((venue) => (
                <li key={venue.id} className="flex flex-col gap-2.5 px-3 py-3">
                  <div className="flex items-start gap-3">
                    {venue.image ? <img src={venue.image} alt="" width="48" height="40" loading="lazy" className="h-10 w-12 shrink-0 rounded-md bg-surface object-cover" /> : <span className="h-10 w-12 shrink-0 rounded-md bg-surface" />}
                    <div className="min-w-0 flex-1">
                      {venue.suspended ? (
                        <p className="truncate text-[15px] font-medium text-ink-strong">{venue.name}</p>
                      ) : (
                        <Link to={`/venues/${venue.id}`} className={`block truncate text-[15px] font-medium text-ink-strong underline-offset-2 hover:underline ${focusRing}`}>{venue.name}</Link>
                      )}
                      <p className="truncate text-[13px] text-muted-warm">{venue.city} · {venue.capacity.toLocaleString('en-US')} guests · {venue.reviewCount ? `★ ${venue.rating.toFixed(2)}` : 'New'}</p>
                      {venue.suspended && <p className="mt-1"><StatusBadge status="suspended" /></p>}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {venue.suspended ? (
                      <Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => setTarget({ venue, action: 'unsuspend' })} aria-label={`Unsuspend ${venue.name}`}>Unsuspend</Button>
                    ) : (
                      <Button size="sm" variant="danger-outline" icon="ban" onClick={() => setTarget({ venue, action: 'suspend' })} aria-label={`Suspend ${venue.name}`}>Suspend</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page })} noun="venues" />
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={target?.action === 'suspend'}
        tone="danger"
        title={target && `Suspend ${target.venue.name}?`}
        body="It disappears from the home page, Explore and its venue page right away. Existing bookings aren’t changed. You can unsuspend it any time."
        confirmLabel="Suspend venue"
        field={{ label: 'Reason (for the audit log)', required: false, minLength: 0, placeholder: 'e.g. Reported for fake photos, checking with the owner.', hint: 'Optional. Only admins see this.' }}
        onClose={() => setTarget(null)}
        onConfirm={async (reason) => {
          await suspendVenue(target.venue.id, target.venue.name, reason)
          return `${target.venue.name} suspended and hidden from the site`
        }}
      />
      <ConfirmDialog
        open={target?.action === 'unsuspend'}
        title={target && `Unsuspend ${target.venue.name}?`}
        body="It shows on the site again straight away."
        confirmLabel="Unsuspend"
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          await unsuspendVenue(target.venue.id, target.venue.name)
          return `${target.venue.name} is live again`
        }}
      />
    </>
  )
}

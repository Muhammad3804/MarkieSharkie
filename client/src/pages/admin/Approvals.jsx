import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APPROVAL_STATUSES, approveListings, listApprovals } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import AdminIcon from '../../features/admin/icons.jsx'
import { Button, Card, Checkbox, DateField, EmptyState, ErrorState, Initials, PageHeader, Pager, SearchField, SelectField, SkeletonRows, SortHeader, StatusBadge, Th, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { STATUS_LABELS, VENUE_TYPE_LABELS, ago, formatDateTime } from '../../features/admin/format.js'
import { formatAmount } from '../../lib/money.js'

const DEFAULTS = { status: 'pending', q: '', city: '', type: '', from: '', to: '', sort: 'oldest', page: 1 }
const SORTS = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'capacity', label: 'Largest capacity' },
]
const TYPES = [{ value: '', label: 'All venue types' }, ...Object.entries(VENUE_TYPE_LABELS).map(([value, label]) => ({ value, label }))]

// REQ-7 queue: a table per approval status with search, filters, sort and pages, all in the URL.
export default function Approvals() {
  const [params, setParams] = useUrlState(DEFAULTS, { status: APPROVAL_STATUSES, sort: SORTS.map((s) => s.value), type: TYPES.map((t) => t.value) })
  const href = useHref()
  const navigate = useNavigate()
  const key = JSON.stringify(params)
  const { status, data, reload, refreshing } = useAdminData(() => listApprovals(params), key)
  const [selected, setSelected] = useState(() => new Set())
  const [selectionKey, setSelectionKey] = useState(key)
  const [confirm, setConfirm] = useState(null) // snapshot of the rows being approved
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A new tab, filter or page clears the selection.
  if (selectionKey !== key) {
    setSelectionKey(key)
    setSelected(new Set())
  }

  const canBulk = params.status === 'pending' || params.status === 'changes_requested'
  const rows = data?.rows ?? []
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const toggle = (id, on) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const activeFilters = ['city', 'type', 'from', 'to'].filter((name) => params[name]).length
  const hasQuery = activeFilters > 0 || params.q

  return (
    <>
      <title>Venue approvals | Admin | MarkieSharkie</title>
      <PageHeader title="Venue approvals" description="Check each new listing before customers can see it. Approve it, reject it with a reason, or ask the owner for changes (REQ-7)." />

      <UrlTabs
        label="Approval status"
        value={params.status}
        hrefFor={(value) => href({ status: value === 'pending' ? '' : value })}
        items={APPROVAL_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], count: data?.counts[value] }))}
      />

      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-4">
          <div className="flex gap-2">
            <SearchField label="Search listings" value={params.q} onChange={(q) => setParams({ q })} placeholder="Search by venue, city or owner" className="flex-1" />
            <Button variant="secondary" icon="filter" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-controls="approval-filters" className="lg:hidden">
              Filters{activeFilters ? ` (${activeFilters})` : ''}
            </Button>
            <SelectField label="Sort" value={params.sort} onChange={(sort) => setParams({ sort })} options={SORTS} className="hidden w-44 sm:block" />
          </div>
          <div id="approval-filters" className={`${filtersOpen ? 'grid' : 'hidden'} grid-cols-2 gap-2 sm:grid-cols-4 lg:grid lg:items-end`}>
            <SelectField label="City" hideLabel={false} value={params.city} onChange={(city) => setParams({ city })} options={[{ value: '', label: 'All cities' }, ...(data?.cities ?? []).map((city) => ({ value: city, label: city }))]} />
            <SelectField label="Venue type" hideLabel={false} value={params.type} onChange={(type) => setParams({ type })} options={TYPES} />
            <DateField label="Submitted from" value={params.from} max={params.to || undefined} onChange={(from) => setParams({ from })} />
            <DateField label="Submitted to" value={params.to} min={params.from || undefined} onChange={(to) => setParams({ to })} />
            <SelectField label="Sort" hideLabel={false} value={params.sort} onChange={(sort) => setParams({ sort })} options={SORTS} className="col-span-2 sm:hidden" />
          </div>
          {activeFilters > 0 && (
            <button type="button" onClick={() => setParams({ city: '', type: '', from: '', to: '' })} className={`self-start rounded text-[13px] font-medium text-primary hover:underline ${focusRing}`}>
              Clear filters
            </button>
          )}
        </div>

        {canBulk && selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-blush px-4 py-2.5">
            <p className="text-[14px] font-medium text-ink-strong" role="status">{selected.size} selected</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button size="sm" icon="check" onClick={() => setConfirm(rows.filter((r) => selected.has(r.id)))}>Approve {selected.size}</Button>
            </div>
          </div>
        )}

        {status === 'loading' ? (
          <SkeletonRows label="Loading listings" />
        ) : status === 'error' ? (
          <ErrorState onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={hasQuery ? 'search' : 'check-circle'}
            title={hasQuery ? 'No listings match' : params.status === 'pending' ? 'All caught up' : `No ${STATUS_LABELS[params.status].toLowerCase()} listings`}
            body={hasQuery ? 'Try another search or clear the filters.' : params.status === 'pending' ? 'New listings from hosts appear here as soon as they’re submitted.' : undefined}
            action={hasQuery && <Button variant="secondary" onClick={() => setParams({ q: '', city: '', type: '', from: '', to: '' })}>Clear search and filters</Button>}
          />
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : ''}>
            {/* Desktop table */}
            <table className="hidden w-full text-[14px] md:table">
              <caption className="sr-only">{`${STATUS_LABELS[params.status]} listings`}</caption>
              <thead className="border-b border-line bg-surface/60">
                <tr>
                  {canBulk && (
                    <th scope="col" className="w-10 pl-4">
                      <Checkbox label="Select all on this page" checked={allSelected} indeterminate={!allSelected && rows.some((r) => selected.has(r.id))} onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())} />
                    </th>
                  )}
                  <SortHeader label="Venue" sortKey="name" sort={params.sort} onSort={(sort) => setParams({ sort })} className={canBulk ? '' : 'pl-4'} />
                  <Th>Owner</Th>
                  <Th className="hidden lg:table-cell">Type</Th>
                  <SortHeader label="Capacity" sortKey="capacity" sort={params.sort} direction="descending" onSort={(sort) => setParams({ sort })} className="hidden text-right lg:table-cell" />
                  <SortHeader label="Submitted" sortKey={params.sort === 'newest' ? 'newest' : 'oldest'} sort={params.sort} direction={params.sort === 'newest' ? 'descending' : 'ascending'} onSort={() => setParams({ sort: params.sort === 'oldest' ? 'newest' : 'oldest' })} />
                  <Th>Status</Th>
                  <Th className="pr-4 text-right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="group cursor-pointer hover:bg-surface/60" onClick={(event) => !event.target.closest('a,button,input') && navigate(`/admin/approvals/${row.id}`)}>
                    {canBulk && (
                      <td className="pl-4">
                        <Checkbox label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={(on) => toggle(row.id, on)} />
                      </td>
                    )}
                    <td className={`py-2.5 pr-3 ${canBulk ? 'pl-3' : 'pl-4'}`}>
                      <div className="flex items-center gap-3">
                        <Thumb url={row.coverUrl} />
                        <div className="min-w-0">
                          <Link to={`/admin/approvals/${row.id}`} className={`block truncate font-medium text-ink-strong hover:text-primary hover:underline ${focusRing}`}>{row.name}</Link>
                          <p className="truncate text-[13px] text-muted-warm">{[row.area, row.city].filter(Boolean).join(', ')} · {row.hallCount} {row.hallCount === 1 ? 'hall' : 'halls'} · {row.photoCount} photos</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Initials name={row.owner.name} className="size-7 text-[11px]" />
                        <span className="truncate text-ink">{row.owner.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink lg:table-cell">{VENUE_TYPE_LABELS[row.venueType]}</td>
                    <td className="hidden px-3 py-2.5 text-right text-ink tabular-nums lg:table-cell">{row.capacity.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink">
                      <time dateTime={row.submittedAt} title={formatDateTime(row.submittedAt)}>{ago(row.submittedAt)}</time>
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge status={row.status} /></td>
                    <td className="py-2.5 pr-4 text-right">
                      <Button size="sm" variant="secondary" to={`/admin/approvals/${row.id}`} aria-label={`Review ${row.name}`}>Review</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-3 py-3">
                  {canBulk && <Checkbox label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={(on) => toggle(row.id, on)} className="mt-3" />}
                  <Link to={`/admin/approvals/${row.id}`} className={`flex min-w-0 flex-1 items-start gap-3 rounded-lg ${focusRing}`}>
                    <Thumb url={row.coverUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-[15px] font-medium text-ink-strong">{row.name}</span>
                        <AdminIcon name="chevron-right" className="mt-0.5 size-4 text-muted-warm" />
                      </span>
                      <span className="block truncate text-[13px] text-muted-warm">{row.city} · {row.owner.name}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-warm">
                        <StatusBadge status={row.status} />
                        <span>{ago(row.submittedAt)}</span>
                        <span>· {row.capacity.toLocaleString('en-US')} guests · {formatAmount(row.basePrice, 'Rs')}/head</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page })} noun="listings" />
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm && `Approve ${confirm.length} ${confirm.length === 1 ? 'listing' : 'listings'}?`}
        body={
          <>
            They go live on the home page and in Explore right away, and each owner is notified. Only bulk-approve listings you’ve already checked.
            <ul className="mt-2 list-disc pl-5 text-ink">
              {confirm?.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
          </>
        }
        confirmLabel={confirm ? `Approve ${confirm.length}` : ''}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const count = confirm.length
          await approveListings(confirm.map((r) => r.id))
          setSelected(new Set())
          return `${count} ${count === 1 ? 'listing' : 'listings'} approved and live`
        }}
      />
    </>
  )
}

function Thumb({ url }) {
  return url ? (
    <img src={url} alt="" width="48" height="40" loading="lazy" className="h-10 w-12 shrink-0 rounded-md bg-surface object-cover" />
  ) : (
    <span className="grid h-10 w-12 shrink-0 place-items-center rounded-md bg-surface text-muted-warm">
      <AdminIcon name="image" className="size-4" />
    </span>
  )
}

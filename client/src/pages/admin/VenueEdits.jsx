import { Link } from 'react-router-dom'
import { REVISION_STATUSES, listRevisions } from '../../api/admin.js'
import { useAdminData, useHref, useUrlState } from '../../features/admin/hooks.js'
import AdminIcon from '../../features/admin/icons.jsx'
import { Button, Card, EmptyState, ErrorState, Initials, PageHeader, Pager, SkeletonRows, StatusBadge, Th, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { STATUS_LABELS, ago, formatDateTime } from '../../features/admin/format.js'

// REQ-5 "a changed venue goes to Admin approval before customers see it" (srs-alignment #35): edits owners made to
// live venues. The live version stays public until an edit is approved here.
const DEFAULTS = { status: 'pending', page: 1 }

export default function VenueEdits() {
  const [params] = useUrlState(DEFAULTS, { status: REVISION_STATUSES })
  const href = useHref()
  const { status, data, reload, refreshing } = useAdminData(() => listRevisions(params), JSON.stringify(params))
  const rows = data?.rows ?? []

  return (
    <>
      <title>Live venue edits | Admin | MarkieSharkie</title>
      <PageHeader
        title="Live venue edits"
        description="Owners changed these live venues. Customers keep seeing the current version until you approve the changes (REQ-5)."
      />
      <UrlTabs
        label="Edit status"
        value={params.status}
        hrefFor={(value) => href({ status: value === 'pending' ? '' : value, page: '' })}
        items={REVISION_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], count: data?.counts?.[value] }))}
      />
      <Card bodyClassName="">
        {status === 'loading' ? (
          <SkeletonRows label="Loading edits" />
        ) : status === 'error' ? (
          <ErrorState onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title={params.status === 'pending' ? 'No edits waiting' : `No ${STATUS_LABELS[params.status].toLowerCase()} edits`}
            body={params.status === 'pending' ? 'When an owner changes the name, halls, description or booking rules of a live venue, it appears here.' : undefined}
          />
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : ''}>
            <table className="hidden w-full text-[14px] md:table">
              <caption className="sr-only">{`${STATUS_LABELS[params.status]} edits`}</caption>
              <thead className="border-b border-line bg-surface/60">
                <tr>
                  <Th className="pl-4">Venue</Th>
                  <Th>Owner</Th>
                  <Th>What changed</Th>
                  <Th>Sent</Th>
                  <Th>Status</Th>
                  <Th className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface/60">
                    <td className="py-2.5 pl-4 pr-3">
                      <Link to={`/admin/edits/${row.id}`} className={`block truncate font-medium text-ink-strong hover:text-primary hover:underline ${focusRing}`}>
                        {row.venueName}
                      </Link>
                      <p className="text-[13px] text-muted-warm">{row.city}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Initials name={row.ownerName} className="size-7 text-[11px]" />
                        <span className="truncate text-ink">{row.ownerName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {row.changeCount} {row.changeCount === 1 ? 'change' : 'changes'}
                      <span className="block text-[13px] text-muted-warm">{row.sections.join(', ')}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink">
                      <time dateTime={row.submittedAt} title={formatDateTime(row.submittedAt)}>
                        {ago(row.submittedAt)}
                      </time>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <Button size="sm" variant="secondary" to={`/admin/edits/${row.id}`} aria-label={`Review the edits to ${row.venueName}`}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link to={`/admin/edits/${row.id}`} className={`flex min-w-0 items-start gap-3 px-4 py-3 ${focusRing}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink-strong">{row.venueName}</span>
                      <span className="block truncate text-[13px] text-muted-warm">
                        {row.ownerName} · {row.changeCount} {row.changeCount === 1 ? 'change' : 'changes'}: {row.sections.join(', ')}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-warm">
                        <StatusBadge status={row.status} />
                        {ago(row.submittedAt)}
                      </span>
                    </span>
                    <AdminIcon name="chevron-right" className="mt-0.5 size-4 text-muted-warm" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page })} noun="edits" />
          </div>
        )}
      </Card>
    </>
  )
}

import { listAudit } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import { Card, EmptyState, ErrorState, Initials, PageHeader, Pager, SearchField, SelectField, SkeletonRows, Th } from '../../features/admin/ui.jsx'
import { actionLabel, ago, formatDateTime } from '../../features/admin/format.js'

// NFR-4: every admin action, who did it and when (admin_audit_log). Read-only.
const DEFAULTS = { q: '', action: '', page: 1 }
const ACTION_GROUPS = [
  { value: '', label: 'All actions' },
  { value: 'venue', label: 'Venues' },
  { value: 'image', label: 'Images' },
  { value: 'user', label: 'Users' },
  { value: 'dispute', label: 'Disputes' },
  { value: 'report', label: 'Reports' },
]

function detailText(details) {
  if (details.reason) return `Reason: ${details.reason}`
  if (details.note) return `Note: ${details.note}`
  if (details.resolution) return `Resolution: ${details.resolution}`
  if (details.checklist) return 'Checklist: photos, details and location ticked'
  if (details.bulk) return 'Bulk approval'
  if (details.aiScore !== undefined) return `AI score ${Math.round(details.aiScore * 100)}%`
  if (details.activeBookings) return `${details.activeBookings} active bookings at the time`
  return ''
}

export default function AuditLog() {
  const [params, setParams] = useUrlState(DEFAULTS, { action: ACTION_GROUPS.map((g) => g.value) })
  const href = useHref()
  const { status, data, reload, refreshing } = useAdminData(() => listAudit(params), JSON.stringify(params))
  const rows = data?.rows ?? []

  return (
    <>
      <title>Audit log | Admin | MarkieSharkie</title>
      <PageHeader title="Audit log" description="Every admin action, who did it and when. Entries can’t be edited or deleted (NFR-4)." />
      <Card bodyClassName="">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:p-4">
          <SearchField label="Search the audit log" value={params.q} onChange={(q) => setParams({ q })} placeholder="Search by venue, user, admin or reason" className="flex-1" />
          <SelectField label="Action type" value={params.action} onChange={(action) => setParams({ action })} options={ACTION_GROUPS} className="sm:w-44" />
        </div>
        {status === 'loading' ? (
          <SkeletonRows label="Loading the audit log" />
        ) : status === 'error' ? (
          <ErrorState onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon="history" title={params.q || params.action ? 'No entries match' : 'No admin actions yet'} body={params.q || params.action ? 'Try another search or action type.' : 'Approvals, suspensions and other decisions are recorded here.'} />
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : ''}>
            <table className="hidden w-full text-[14px] md:table">
              <caption className="sr-only">Admin actions, newest first</caption>
              <thead className="border-b border-line bg-surface/60">
                <tr>
                  <Th className="pl-4">When</Th>
                  <Th>Admin</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th className="pr-4">Details</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((entry) => (
                  <tr key={entry.logId} className="align-top">
                    <td className="py-2.5 pr-3 pl-4 whitespace-nowrap text-ink">
                      <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                      <span className="block text-[12px] text-muted-warm">{ago(entry.createdAt)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Initials name={entry.adminName} className="size-6 text-[10px]" />
                        {entry.adminName}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap text-ink-strong">
                      {actionLabel(entry.action)}
                      <code className="block text-[11px] font-normal text-muted-warm">{entry.action}</code>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {entry.targetLabel}
                      <span className="block text-[12px] text-muted-warm">{entry.targetTable}</span>
                    </td>
                    <td className="max-w-sm py-2.5 pr-4 text-[13px] text-muted-warm">{detailText(entry.details) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ol className="divide-y divide-line md:hidden">
              {rows.map((entry) => (
                <li key={entry.logId} className="flex gap-3 px-3 py-3">
                  <Initials name={entry.adminName} className="size-8 text-[11px]" />
                  <div className="min-w-0 text-[14px]">
                    <p className="text-ink">
                      <span className="font-medium text-ink-strong">{entry.adminName}</span> · {actionLabel(entry.action).toLowerCase()}
                    </p>
                    <p className="font-medium break-words text-ink-strong">{entry.targetLabel}</p>
                    {detailText(entry.details) && <p className="mt-0.5 text-[13px] break-words text-muted-warm">{detailText(entry.details)}</p>}
                    <p className="mt-0.5 text-[12px] text-muted-warm"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time></p>
                  </div>
                </li>
              ))}
            </ol>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page })} noun="entries" />
          </div>
        )}
      </Card>
    </>
  )
}

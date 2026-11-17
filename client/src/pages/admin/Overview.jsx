import { Link } from 'react-router-dom'
import { getOverview } from '../../api/admin.js'
import { useAdminData } from '../../features/admin/hooks.js'
import AdminIcon from '../../features/admin/icons.jsx'
import SubmissionsChart from '../../features/admin/SubmissionsChart.jsx'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, Button } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { actionLabel, ago } from '../../features/admin/format.js'

const ATTENTION_ICONS = { approval: 'file-check', dispute: 'scale', image: 'image-alert', report: 'flag' }
const ATTENTION_LABELS = { approval: 'Waiting over 48 hours', dispute: 'Open dispute', image: 'High AI score', report: 'Listing report' }

export default function Overview() {
  const { status, data, reload } = useAdminData(getOverview, 'overview')

  return (
    <>
      <title>Overview | Admin | MarkieSharkie</title>
      <PageHeader title="Overview" description="What needs a decision today, and how the marketplace is doing." actions={<Button to="/admin/approvals" icon="file-check">Review listings</Button>} />
      {status === 'error' ? (
        <Card>
          <ErrorState onRetry={reload} />
        </Card>
      ) : (
        <>
          <Kpis kpis={data?.kpis} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card title="Listings submitted per week">{data ? <SubmissionsChart weeks={data.weeks} /> : <Skeleton className="h-48 w-full" />}</Card>
            <Card title="Needs your attention" bodyClassName="">
              {!data ? (
                <ListSkeleton />
              ) : data.attention.length === 0 ? (
                <EmptyState icon="check-circle" title="Nothing waiting" body="No overdue listings, open disputes or high-risk images." />
              ) : (
                <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
                  {data.attention.slice(0, 8).map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link to={item.to} className={`flex items-start gap-3 px-4 py-3 hover:bg-surface sm:px-5 ${focusRing} focus-visible:-outline-offset-2`}>
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose text-primary">
                          <AdminIcon name={ATTENTION_ICONS[item.kind]} className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink-strong">{item.title}</span>
                          <span className="block truncate text-[12px] text-muted-warm">
                            {ATTENTION_LABELS[item.kind]} · {item.kind === 'approval' ? ago(item.at) : item.detail}
                          </span>
                        </span>
                        <AdminIcon name="chevron-right" className="mt-2 size-4 text-muted-warm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card title="Recent activity" actions={<Link to="/admin/audit" className={`rounded text-[13px] font-medium text-primary hover:underline ${focusRing}`}>Audit log</Link>} bodyClassName="">
            {!data ? (
              <ListSkeleton />
            ) : data.activity.length === 0 ? (
              <EmptyState icon="history" title="No activity yet" body="Submissions, reports and admin actions show up here." />
            ) : (
              <ol className="divide-y divide-line">
                {data.activity.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className={`size-2 shrink-0 rounded-full ${item.kind === 'audit' ? 'bg-primary' : item.kind === 'report' ? 'bg-danger' : 'bg-chart-approved'}`} aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-[14px] text-ink">
                      <span className="font-medium text-ink-strong">{item.actor}</span> · {actionLabel(item.action).toLowerCase()} <span className="font-medium text-ink-strong">{item.target}</span>
                    </p>
                    <time dateTime={item.at} className="shrink-0 text-[12px] text-muted-warm">{ago(item.at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function Kpis({ kpis }) {
  const items = kpis
    ? [
        { label: 'Pending approvals', value: kpis.pendingApprovals, note: `${kpis.pendingNewThisWeek} new this week`, to: '/admin/approvals', icon: 'file-check', emphasis: kpis.pendingApprovals > 0 },
        { label: 'Live venues', value: kpis.liveVenues, note: kpis.suspendedVenues ? `${kpis.suspendedVenues} suspended` : 'None suspended', to: '/admin/venues', icon: 'building' },
        { label: 'Users', value: kpis.users, note: `${kpis.usersByRole.customer} customers · ${kpis.usersByRole.venue_owner} owners`, to: '/admin/users', icon: 'users' },
        { label: 'Bookings this month', value: kpis.bookingsThisMonth, note: 'Mock until bookings exist', icon: 'calendar' },
        { label: 'Flagged images', value: kpis.flaggedImages, note: 'Waiting for a decision', to: '/admin/images', icon: 'image-alert', emphasis: kpis.flaggedImages > 0 },
      ]
    : Array.from({ length: 5 }, (_, i) => ({ label: `kpi-${i}` }))
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-busy={!kpis}>
      {items.map((item, index) => {
        const body = kpis ? (
          <>
            <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-warm">
              {item.label}
              <AdminIcon name={item.icon} className={`size-4 ${item.emphasis ? 'text-primary' : ''}`} />
            </span>
            <span className="font-heading text-[28px] leading-none font-semibold text-ink-strong tabular-nums">{item.value.toLocaleString('en-US')}</span>
            <span className="truncate text-[12px] text-muted-warm">{item.note}</span>
          </>
        ) : (
          <>
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </>
        )
        const box = `flex h-full flex-col gap-2.5 rounded-xl border border-line bg-white p-4`
        return (
          <li key={item.label} className={index === 4 ? 'col-span-2 md:col-span-1' : ''}>
            {item.to ? (
              <Link to={item.to} className={`${box} hover:border-outline-strong ${focusRing}`}>
                {body}
              </Link>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4 p-5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

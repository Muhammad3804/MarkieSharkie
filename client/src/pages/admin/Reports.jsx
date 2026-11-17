import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { REPORT_REASONS, listDisputes, listReports, updateDispute, updateReport } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import AdminIcon from '../../features/admin/icons.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { ROLE_LABELS, STATUS_LABELS, ago, formatDate, formatDateTime } from '../../features/admin/format.js'
import { formatAmount } from '../../lib/money.js'

// REQ-48: booking disputes (Open -> Under review -> Resolved), raised by a customer or owner. The admin reviews the
// booking, its quotation and payments, records a resolution and both sides are notified.
// Listing reports come from "Report this listing" on the venue page. UI-only: there is no table for them in
// db/schema.sql yet (proposed in docs/progress.md); they reuse the dispute statuses.
const DEFAULTS = { tab: 'disputes', status: 'open' }
const STATUSES = ['open', 'under_review', 'resolved']
const reasonLabel = (value) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value

export default function Reports() {
  const [params] = useUrlState(DEFAULTS, { tab: ['disputes', 'reports'], status: STATUSES })
  const href = useHref()
  const { hash } = useLocation()
  const isDisputes = params.tab !== 'reports'
  const { status, data, reload, refreshing } = useAdminData(() => (isDisputes ? listDisputes(params) : listReports(params)), `${params.tab}|${params.status}`)
  const disputeCounts = useAdminData(() => listDisputes({}), 'dispute-counts').data?.counts
  const reportCounts = useAdminData(() => listReports({}), 'report-counts').data?.counts
  const [resolving, setResolving] = useState(null)
  const [taking, setTaking] = useState(null)
  const rows = data?.rows ?? []

  // Deep link from the overview / notifications: scroll to the item.
  useEffect(() => {
    if (status !== 'ready' || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [status, hash])

  const counts = isDisputes ? disputeCounts : reportCounts
  const update = isDisputes ? updateDispute : updateReport
  const noun = isDisputes ? 'dispute' : 'report'

  return (
    <>
      <title>Disputes and reports | Admin | MarkieSharkie</title>
      <PageHeader title="Disputes & reports" description="Booking disputes between customers and owners (REQ-48), and listings visitors reported." />
      <UrlTabs
        label="Type"
        value={isDisputes ? 'disputes' : 'reports'}
        hrefFor={(value) => href({ tab: value === 'disputes' ? '' : value, status: '' }, { keep: false })}
        items={[
          { value: 'disputes', label: 'Booking disputes', count: disputeCounts?.open },
          { value: 'reports', label: 'Listing reports', count: reportCounts?.open },
        ]}
      />
      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {STATUSES.map((value) => {
          const active = params.status === value
          return (
            <Link
              key={value}
              to={href({ status: value === 'open' ? '' : value })}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium ${focusRing} ${active ? 'border-primary bg-rose text-primary' : 'border-line bg-white text-ink hover:border-outline-strong'}`}
            >
              {STATUS_LABELS[value]}
              {counts && <span className="tabular-nums text-muted-warm">{counts[value]}</span>}
            </Link>
          )
        })}
      </nav>

      {status === 'loading' ? (
        <Card bodyClassName="">
          <SkeletonRows label={`Loading ${noun}s`} rows={4} />
        </Card>
      ) : status === 'error' ? (
        <Card>
          <ErrorState onRetry={reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={isDisputes ? 'scale' : 'flag'} title={`No ${STATUS_LABELS[params.status].toLowerCase()} ${noun}s`} body={params.status === 'open' ? `New ${noun}s show up here.` : undefined} />
        </Card>
      ) : (
        <ul className={`flex flex-col gap-3 ${refreshing ? 'opacity-60 transition-opacity' : ''}`}>
          {rows.map((item) => (
            <li key={item.id} id={item.id} className="scroll-mt-24">
              {isDisputes ? (
                <DisputeCard dispute={item} onTake={() => setTaking(item)} onResolve={() => setResolving(item)} />
              ) : (
                <ReportCard report={item} onTake={() => setTaking(item)} onResolve={() => setResolving(item)} />
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(taking)}
        title={`Start reviewing this ${noun}?`}
        body={taking && (isDisputes ? `${taking.bookingId} moves to Under review with you as the admin on the case. Both sides are notified.` : `The report on ${taking.venueName} moves to Under review.`)}
        confirmLabel="Start review"
        onClose={() => setTaking(null)}
        onConfirm={async () => {
          await update(taking.id, { status: 'under_review' })
          return `${isDisputes ? taking.bookingId : `Report on ${taking.venueName}`} is under review`
        }}
      />
      <ConfirmDialog
        open={Boolean(resolving)}
        title={`Resolve this ${noun}?`}
        body={isDisputes ? 'Record what you decided. The customer and the owner both see it.' : 'Record what you did about this listing.'}
        confirmLabel={`Resolve ${noun}`}
        field={{ label: 'Resolution', required: true, placeholder: isDisputes ? 'e.g. Checked the payment records; the balance was received late. Marked as received.' : 'e.g. Asked the owner to replace the stage photos.', hint: isDisputes ? 'Required. Shared with both sides.' : 'Required. Kept in the audit log.' }}
        onClose={() => setResolving(null)}
        onConfirm={async (resolution) => {
          await update(resolving.id, { status: 'resolved', resolution })
          return `${isDisputes ? resolving.bookingId : `Report on ${resolving.venueName}`} resolved`
        }}
      />
    </>
  )
}

function Actions({ item, onTake, onResolve }) {
  if (item.status === 'resolved') return null
  return (
    <div className="flex flex-wrap gap-2">
      {item.status === 'open' && <Button size="sm" variant="secondary" icon="eye" onClick={onTake}>Start review</Button>}
      <Button size="sm" icon="check" onClick={onResolve}>Resolve</Button>
    </div>
  )
}

function DisputeCard({ dispute, onTake, onResolve }) {
  const [open, setOpen] = useState(false)
  const paid = dispute.payments.filter((p) => p.status !== 'void').reduce((sum, p) => sum + Number(p.amount), 0)
  return (
    <article aria-labelledby={`${dispute.id}-title`} className="rounded-xl border border-line bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${dispute.id}-title`} className="text-[15px] font-semibold text-ink-strong">{dispute.bookingId} · {dispute.venueName}</h2>
            <StatusBadge status={dispute.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted-warm">
            Raised by {dispute.raisedBy.name} ({ROLE_LABELS[dispute.raisedBy.role].toLowerCase()}) · <time dateTime={dispute.createdAt} title={formatDateTime(dispute.createdAt)}>{ago(dispute.createdAt)}</time>
            {dispute.adminName && ` · ${dispute.adminName} on the case`}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink">{dispute.reason}</p>
          {dispute.resolution && (
            <p className="mt-2 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-ink">
              <span className="font-semibold text-success">Resolution · {formatDateTime(dispute.resolvedAt)}: </span>
              {dispute.resolution}
            </p>
          )}
        </div>
        <Actions item={dispute} onTake={onTake} onResolve={onResolve} />
      </div>
      <div className="border-t border-line">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`${dispute.id}-details`} className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-medium text-ink-strong hover:bg-surface sm:px-5 ${focusRing} focus-visible:-outline-offset-2`}>
          Booking, quotation and payments
          <AdminIcon name="chevron-down" className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div id={`${dispute.id}-details`} className="grid gap-4 px-4 pb-4 text-[13px] sm:grid-cols-3 sm:px-5">
            <dl className="grid gap-1">
              <dt className="font-semibold text-muted-warm">Booking</dt>
              <dd className="text-ink-strong">{dispute.bookingId}</dd>
              <dd className="text-ink">Customer: {dispute.customerName}</dd>
              <dd className="text-ink">Event: {formatDate(`${dispute.eventDate}T12:00:00Z`)}</dd>
            </dl>
            <dl className="grid gap-1">
              <dt className="font-semibold text-muted-warm">Accepted quotation</dt>
              <dd className="text-ink-strong">{dispute.quotation.quotationId}</dd>
              <dd className="text-ink tabular-nums">{dispute.quotation.guests} guests × {formatAmount(dispute.quotation.pricePerHead, 'Rs')}</dd>
              <dd className="font-semibold text-ink-strong tabular-nums">{formatAmount(dispute.quotation.total, 'Rs')}</dd>
            </dl>
            <div>
              <p className="font-semibold text-muted-warm">Payments (tracked, not processed)</p>
              <ul className="mt-1 grid gap-1">
                {dispute.payments.map((payment) => (
                  <li key={payment.paymentId} className="flex justify-between gap-2 text-ink">
                    <span className="capitalize">{payment.type} · {payment.status}</span>
                    <span className="tabular-nums">{formatAmount(payment.amount, 'Rs')}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t border-line pt-1 font-semibold text-ink-strong">
                  <span>Balance left</span>
                  <span className="tabular-nums">{formatAmount(String(Number(dispute.quotation.total) - paid), 'Rs')}</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function ReportCard({ report, onTake, onResolve }) {
  return (
    <article aria-labelledby={`${report.id}-title`} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${report.id}-title`} className="text-[15px] font-semibold text-ink-strong">{report.venueName}</h2>
          <StatusBadge status={report.status} />
        </div>
        <p className="mt-1 text-[13px] text-muted-warm">
          {reasonLabel(report.reason)} · {report.reporter} · <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>{ago(report.createdAt)}</time>
        </p>
        {report.details && <p className="mt-2 text-[14px] leading-relaxed text-ink">“{report.details}”</p>}
        {report.resolution && (
          <p className="mt-2 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-ink">
            <span className="font-semibold text-success">Resolution · {formatDateTime(report.resolvedAt)}: </span>
            {report.resolution}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
          <Link to={`/venues/${report.venueId}`} target="_blank" rel="noopener" className={`inline-flex items-center gap-1 rounded font-medium text-primary hover:underline ${focusRing}`}>
            View listing <AdminIcon name="external-link" className="size-3.5" /><span className="sr-only">(opens in a new tab)</span>
          </Link>
          <Link to={`/admin/venues?q=${encodeURIComponent(report.venueName)}`} className={`rounded font-medium text-primary hover:underline ${focusRing}`}>
            Find in All venues
          </Link>
        </div>
      </div>
      <Actions item={report} onTake={onTake} onResolve={onResolve} />
    </article>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { REPORT_REASONS, actOnDispute, evidenceUrl, getDispute, listDisputes, listReports, updateReport } from '../../api/admin.js'
import { DISPUTE_CATEGORIES, OUTCOME_LABELS, categoryLabel } from '../../api/disputes.js'
import { ApiError } from '../../api/http.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import AdminIcon from '../../features/admin/icons.jsx'
import { useToast } from '../../features/admin/toastContext.js'
import { Button, Card, EmptyState, ErrorState, PageHeader, Pager, SearchField, SelectField, Skeleton, SkeletonRows, StatusBadge, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { ROLE_LABELS, STATUS_LABELS, ago, formatDate, formatDateTime } from '../../features/admin/format.js'
import { formatAmount } from '../../lib/money.js'

// REQ-48 / EUC-35 (srs-alignment #41): booking disputes raised by the customer or the venue owner
// (Open -> Under review -> Resolved, or Rejected), and listing reports from "Report this listing". Everything is on
// the server; each action is audited and both sides of a dispute are emailed the decision.
// The open dispute is ?dispute=<id>, so the panel survives a refresh and Back closes it.
const DEFAULTS = { tab: 'disputes', status: 'open', category: '', q: '', page: 1, dispute: '' }
const DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'rejected', 'all']
const REPORT_STATUSES = ['open', 'under_review', 'resolved', 'all']
const statusLabel = (value) => (value === 'all' ? 'All' : value === 'rejected' ? 'Rejected' : STATUS_LABELS[value])
const reasonLabel = (value) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value
const rs = (amount) => formatAmount(amount, 'Rs')
const errorText = (err) => (err instanceof ApiError && (err.status === 409 || err.status === 400) ? `${err.message} Nothing was changed.` : 'That didn’t work. Nothing was changed; try again.')

export default function Reports() {
  const [params, setParams] = useUrlState(DEFAULTS, { tab: ['disputes', 'reports'], status: DISPUTE_STATUSES, category: ['', ...DISPUTE_CATEGORIES.map((c) => c.value)] })
  const href = useHref()
  const { hash } = useLocation()
  const isDisputes = params.tab !== 'reports'
  const statuses = isDisputes ? DISPUTE_STATUSES : REPORT_STATUSES
  const status = statuses.includes(params.status) ? params.status : 'open'
  const listKey = JSON.stringify({ tab: params.tab, status, category: params.category, q: params.q, page: params.page })
  const list = useAdminData(() => (isDisputes ? listDisputes({ status, category: params.category, q: params.q, page: params.page }) : listReports({ status, page: params.page })), listKey)
  const disputeCounts = useAdminData(() => listDisputes({ status: 'open' }), 'dispute-counts').data?.counts
  const reportCounts = useAdminData(() => listReports({ status: 'open' }), 'report-counts').data?.counts
  const [taking, setTaking] = useState(null)
  const [resolving, setResolving] = useState(null)
  const rows = list.data?.rows ?? []
  const counts = isDisputes ? disputeCounts : reportCounts

  // Deep link to a report from the overview / notifications.
  useEffect(() => {
    if (list.status !== 'ready' || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [list.status, hash])

  return (
    <>
      <title>Disputes and reports | Admin | MarkieSharkie</title>
      <PageHeader title="Disputes & reports" description="Problems with a booking raised by the customer or the venue owner (REQ-48), and listings people reported." />
      <UrlTabs
        label="Type"
        value={isDisputes ? 'disputes' : 'reports'}
        hrefFor={(value) => href({ tab: value === 'disputes' ? '' : value, status: '', category: '', q: '', dispute: '' }, { keep: false })}
        items={[
          { value: 'disputes', label: 'Booking disputes', count: disputeCounts?.open },
          { value: 'reports', label: 'Listing reports', count: reportCounts?.open },
        ]}
      />
      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {statuses.map((value) => {
          const active = status === value
          return (
            <Link
              key={value}
              to={href({ status: value === 'open' ? '' : value, dispute: '' })}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium ${focusRing} ${active ? 'border-primary bg-rose text-primary' : 'border-line bg-white text-ink hover:border-outline-strong'}`}
            >
              {statusLabel(value)}
              {counts && value !== 'all' && <span className="tabular-nums text-muted-warm">{counts[value]}</span>}
            </Link>
          )
        })}
      </nav>
      {isDisputes && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchField label="Search disputes" value={params.q} onChange={(q) => setParams({ q })} placeholder="Venue, customer, owner or booking reference" className="flex-1" />
          <SelectField label="Category" value={params.category} onChange={(category) => setParams({ category })} options={[{ value: '', label: 'Any category' }, ...DISPUTE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} className="sm:w-56" />
        </div>
      )}

      {list.status === 'loading' ? (
        <Card bodyClassName="">
          <SkeletonRows label={`Loading ${isDisputes ? 'disputes' : 'reports'}`} rows={4} />
        </Card>
      ) : list.status === 'error' ? (
        <Card>
          <ErrorState onRetry={list.reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={isDisputes ? 'scale' : 'flag'} title={`No ${status === 'all' ? '' : `${statusLabel(status).toLowerCase()} `}${isDisputes ? 'disputes' : 'reports'}`} body={status === 'open' ? 'New ones show up here.' : undefined} />
        </Card>
      ) : (
        <div className={list.refreshing ? 'opacity-60 transition-opacity' : ''}>
          <ul className="flex flex-col gap-3">
            {rows.map((item) => (
              <li key={item.id} id={item.id} className="scroll-mt-24">
                {isDisputes ? <DisputeRow dispute={item} onOpen={() => setParams({ dispute: item.id, page: params.page }, { push: true })} /> : <ReportCard report={item} onTake={() => setTaking(item)} onResolve={() => setResolving(item)} />}
              </li>
            ))}
          </ul>
          <Pager page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} pageSize={list.data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page, dispute: '' })} noun={isDisputes ? 'disputes' : 'reports'} />
        </div>
      )}

      {isDisputes && <DisputePanel disputeId={params.dispute} onClose={() => setParams({ dispute: '', page: params.page })} />}

      <ConfirmDialog
        open={Boolean(taking)}
        title="Start reviewing this report?"
        body={taking && `The report on ${taking.venueName} moves to Under review with you on it.`}
        confirmLabel="Start review"
        onClose={() => setTaking(null)}
        onConfirm={async () => {
          await updateReport(taking.id, { status: 'under_review' })
          return `Report on ${taking.venueName} is under review`
        }}
      />
      <ConfirmDialog
        open={Boolean(resolving)}
        title="Resolve this report?"
        body="Record what you did about this listing. It’s kept in the audit log."
        confirmLabel="Resolve report"
        field={{ label: 'What you did', required: true, minLength: 10, tooShort: 'Write at least 10 characters.', placeholder: 'e.g. Asked the owner to replace the stage photos.', hint: 'Required. Kept in the audit log with your name.' }}
        onClose={() => setResolving(null)}
        onConfirm={async (resolution) => {
          await updateReport(resolving.id, { status: 'resolved', resolution })
          return `Report on ${resolving.venueName} resolved`
        }}
      />
    </>
  )
}

function DisputeRow({ dispute, onOpen }) {
  return (
    <article aria-labelledby={`${dispute.id}-title`} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${dispute.id}-title`} className="text-[15px] font-semibold text-ink-strong">{dispute.reference} · {dispute.venue.name}</h2>
          <StatusBadge status={dispute.status} label={statusLabel(dispute.status)} />
        </div>
        <p className="mt-1 text-[13px] text-muted-warm">
          {categoryLabel(dispute.category)} · raised by {dispute.raisedByName} ({ROLE_LABELS[dispute.raisedByRole].toLowerCase()}) · <time dateTime={dispute.createdAt} title={formatDateTime(dispute.createdAt)}>{ago(dispute.createdAt)}</time>
          {dispute.handledBy && ` · ${dispute.handledBy}`}
        </p>
        <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-ink">{dispute.description}</p>
        <p className="mt-1.5 text-[12px] text-muted-warm">
          {dispute.fileCount} photo{dispute.fileCount === 1 ? '' : 's'} · {dispute.noteCount} repl{dispute.noteCount === 1 ? 'y' : 'ies'} · event {formatDate(`${dispute.booking.eventDate}T12:00:00Z`)}
        </p>
      </div>
      <Button size="sm" variant={dispute.status === 'open' || dispute.status === 'under_review' ? 'primary' : 'secondary'} icon="eye" onClick={onOpen} aria-label={`Open dispute ${dispute.reference}`}>
        Open
      </Button>
    </article>
  )
}

// A private evidence photo, fetched with the admin's token.
function Evidence({ file, index }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    let made = null
    evidenceUrl(file.url)
      .then((u) => {
        made = u
        if (live) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [file.url])
  const label = `Photo ${index + 1} from the ${ROLE_LABELS[file.fromRole].toLowerCase()}`
  if (failed) return <div className="grid aspect-square place-items-center rounded-lg bg-surface text-[12px] text-muted-warm">Couldn’t load</div>
  if (!url) return <Skeleton className="aspect-square rounded-lg" />
  return (
    <a href={url} target="_blank" rel="noopener" className={`block overflow-hidden rounded-lg ${focusRing}`}>
      <img src={url} alt={label} className="aspect-square w-full object-cover" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink-strong">{title}</h3>
      {children}
    </section>
  )
}

const EVENT_LABELS = { requested: 'Requested', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', held: 'Held' }

// Side panel: the dispute, the booking (REQ-48 "reviews booking, quotations, payments": the price snapshot, advance
// and refund are what exists; quotations and payments come with their own modules), history, evidence, notes.
function DisputePanel({ disputeId, onClose }) {
  const ref = useRef(null)
  const { status, data, reload } = useAdminData(() => (disputeId ? getDispute(disputeId) : Promise.resolve(null)), disputeId || 'none')
  const [action, setAction] = useState(null) // 'take' | 'reject' | 'resolve'
  useEffect(() => {
    const dialog = ref.current
    if (disputeId && !dialog.open) dialog.showModal()
    if (!disputeId && dialog.open) dialog.close()
  }, [disputeId])
  const d = data?.dispute
  const b = data?.booking
  const open = d && (d.status === 'open' || d.status === 'under_review')

  return (
    <dialog
      ref={ref}
      aria-label="Dispute details"
      onCancel={(event) => {
        event.preventDefault()
        if (!action) onClose()
      }}
      onClick={(event) => event.target === ref.current && !action && onClose()}
      className="ml-auto mr-0 h-dvh max-h-none w-full max-w-xl bg-white p-0 backdrop:bg-ink-strong/40 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold text-ink-strong">{d ? `Dispute on ${d.reference}` : 'Dispute'}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className={`grid size-10 place-items-center rounded-lg text-muted-warm hover:bg-surface ${focusRing}`}>
          <AdminIcon name="x" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {status === 'loading' ? (
          <div aria-busy="true" aria-label="Loading dispute" className="flex flex-col gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : status === 'error' ? (
          <ErrorState title="Couldn’t load this dispute" onRetry={reload} />
        ) : !d ? (
          <EmptyState icon="scale" title="Dispute not found" />
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[18px] font-semibold text-ink-strong">{categoryLabel(d.category)}</p>
                <StatusBadge status={d.status} label={statusLabel(d.status)} />
              </div>
              <p className="mt-1 text-[13px] text-muted-warm">
                Raised by {d.raisedByName} ({ROLE_LABELS[d.raisedByRole].toLowerCase()}) on {formatDateTime(d.createdAt)}
                {d.handledBy && ` · ${d.handledBy} on the case`}
              </p>
              <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-ink">{d.description}</p>
            </div>

            {(d.status === 'resolved' || d.status === 'rejected') && (
              <p className={`rounded-lg px-3 py-2.5 text-[13px] text-ink ${d.status === 'resolved' ? 'bg-success-bg' : 'bg-surface'}`}>
                <span className={`font-semibold ${d.status === 'resolved' ? 'text-success' : 'text-ink-strong'}`}>
                  {d.status === 'resolved' ? `${OUTCOME_LABELS[d.outcome]}${d.compensation ? ` · ${rs(d.compensation)} compensation recorded` : ''}` : 'Rejected'} · {formatDateTime(d.resolvedAt)}
                </span>
                <span className="mt-1 block whitespace-pre-line">{d.resolution}</span>
              </p>
            )}

            {open && (
              <div className="flex flex-wrap gap-2">
                {d.status === 'open' && <Button icon="eye" onClick={() => setAction('take')}>Start review</Button>}
                {d.status === 'under_review' && <Button icon="check" onClick={() => setAction('resolve')}>Resolve</Button>}
                <Button variant="danger-outline" icon="x" onClick={() => setAction('reject')}>Reject</Button>
              </div>
            )}

            <Section title="Parties">
              <dl className="grid gap-2 text-[14px]">
                {[
                  ['Customer', d.parties.customer],
                  ['Venue owner', d.parties.owner],
                ].map(([term, p]) => (
                  <div key={term} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                    <dt className="text-muted-warm">{term}</dt>
                    <dd className="break-words text-ink-strong">
                      {p.name}
                      {p.business && <span className="text-ink"> · {p.business}</span>}
                      {p.email && <span className="block text-[13px] text-muted-warm">{p.email}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            {b && (
              <Section title="Booking">
                <dl className="grid gap-2 text-[14px]">
                  {[
                    ['Event', `${b.eventName || 'Untitled event'} · ${formatDate(`${b.date}T12:00:00Z`)}, ${b.startTime}–${b.endTime}`],
                    ['Venue', `${b.venueName}${b.hallName ? `, ${b.hallName}` : ''}`],
                    ['Status', `${EVENT_LABELS[b.status] ?? b.status}${b.closedAs && b.closedAs !== 'cancelled' ? ` (${b.closedAs})` : ''}`],
                    ['Guests', `${b.guestCount}${b.menuName ? ` · ${b.menuName} at ${rs(b.menuPricePerHead)} per guest` : ''}`],
                    ['Total', rs(b.totalAmount)],
                    ['Advance due', `${rs(b.advanceDue)} (${b.advancePercent}%)`],
                    b.refundAmount !== null && b.refundAmount !== undefined && ['Refund recorded', `${rs(b.refundAmount)} (${b.refundPercent}%)`],
                  ]
                    .filter(Boolean)
                    .map(([term, value]) => (
                      <div key={term} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                        <dt className="text-muted-warm">{term}</dt>
                        <dd className="break-words text-ink-strong tabular-nums">{value}</dd>
                      </div>
                    ))}
                </dl>
                <p className="text-[12px] text-muted-warm">Payments are tracked between the customer and the venue, never processed here.</p>
                {b.events?.length > 0 && (
                  <ol className="mt-1 flex flex-col gap-1.5 border-l-2 border-line pl-3">
                    {b.events.map((e) => (
                      <li key={`${e.to}-${e.at}`} className="text-[13px]">
                        <span className="font-medium text-ink-strong">{EVENT_LABELS[e.to] ?? e.to}</span>
                        <span className="text-ink"> by {e.byName ?? e.by}</span>
                        {e.reason && <span className="block text-ink">“{e.reason}”</span>}
                        <span className="block text-[12px] text-muted-warm">{formatDateTime(e.at)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            )}

            <Section title={`Evidence (${d.files.length})`}>
              {d.files.length === 0 ? (
                <p className="text-[13px] text-muted-warm">No photos attached.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {d.files.map((file, i) => (
                    <Evidence key={file.id} file={file} index={i} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Messages and notes">
              {d.notes.length === 0 ? (
                <p className="text-[13px] text-muted-warm">No messages yet.</p>
              ) : (
                <ol className="flex flex-col gap-2.5">
                  {d.notes.map((n) => (
                    <li key={n.id} className={`rounded-lg px-3 py-2 text-[13px] ${n.internal ? 'border border-dashed border-pending bg-pending-bg/40' : n.authorRole === 'admin' ? 'bg-rose' : 'bg-surface'}`}>
                      <p className="font-medium text-ink-strong">
                        {n.authorName} <span className="font-normal text-muted-warm">· {ROLE_LABELS[n.authorRole]}{n.internal ? ' · internal' : ''} · {formatDateTime(n.createdAt)}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink">{n.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              <NoteForm disputeId={d.id} />
            </Section>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={action === 'take'}
        title="Start reviewing this dispute?"
        body="It moves to Under review with you on the case. The customer and the owner see that an admin is reviewing."
        confirmLabel="Start review"
        onClose={() => setAction(null)}
        onConfirm={async () => {
          await actOnDispute(d.id, 'take')
          return `${d.reference} is under review`
        }}
      />
      <ConfirmDialog
        open={action === 'reject'}
        tone="danger"
        title="Reject this dispute?"
        body="Use this when there’s nothing to decide (wrong booking, spam, already settled). Both sides are emailed your reason."
        confirmLabel="Reject dispute"
        field={{ label: 'Reason', required: true, minLength: 10, tooShort: 'Write at least 10 characters.', placeholder: 'e.g. Both sides confirmed by phone that this was settled.', hint: 'Shared with both sides and kept in the audit log.' }}
        onClose={() => setAction(null)}
        onConfirm={async (reason) => {
          await actOnDispute(d.id, 'reject', { reason })
          return `${d.reference} rejected`
        }}
      />
      {d && <ResolveDialog open={action === 'resolve'} dispute={d} maxAmount={b?.totalAmount} onClose={() => setAction(null)} />}
    </dialog>
  )
}

function NoteForm({ disputeId }) {
  const id = useId()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (busy || !body.trim()) return
    setBusy(true)
    setError('')
    try {
      await actOnDispute(disputeId, 'note', { body: body.trim(), internal: !visible })
      setBody('')
      toast(visible ? 'Message sent to both sides' : 'Internal note added')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-2">
      <label htmlFor={`${id}-note`} className="sr-only">Add a note</label>
      <textarea id={`${id}-note`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder={visible ? 'Message to the customer and the owner' : 'Internal note (only admins see it)'} className="w-full resize-y rounded-lg border border-outline-strong px-3 py-2 text-[14px] text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-4 accent-primary" />
          Visible to both sides
        </label>
        <Button type="submit" size="sm" variant="secondary" busy={busy} aria-disabled={!body.trim() || undefined}>
          {visible ? 'Send message' : 'Add note'}
        </Button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </form>
  )
}

// Resolve: outcome, optional compensation (recorded only, at most the booking total; none when dismissed), and the
// resolution shared with both sides.
function ResolveDialog({ open, dispute, maxAmount, onClose }) {
  const ref = useRef(null)
  const id = useId()
  const toast = useToast()
  const [form, setForm] = useState({ outcome: '', compensation: '', resolution: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) {
      setForm({ outcome: '', compensation: '', resolution: '' })
      setErrors({})
      setError('')
      setBusy(false)
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  }, [open])
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))
  const canPay = form.outcome === 'upheld' || form.outcome === 'partially_upheld'

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const problems = {}
    if (!form.outcome) problems.outcome = 'Pick the outcome.'
    const amount = form.compensation.replace(/[,\s]/g, '')
    if (canPay && amount && !/^\d{1,10}(\.\d{1,2})?$/.test(amount)) problems.compensation = 'Enter an amount in rupees like 15000.'
    else if (canPay && amount && maxAmount && Number(amount) > Number(maxAmount)) problems.compensation = `At most the booking total (${rs(maxAmount)}).`
    if (form.resolution.trim().length < 10) problems.resolution = 'Write at least 10 characters.'
    setErrors(problems)
    if (Object.keys(problems).length) return
    setBusy(true)
    setError('')
    try {
      await actOnDispute(dispute.id, 'resolve', { outcome: form.outcome, resolution: form.resolution.trim(), ...(canPay && amount && Number(amount) > 0 ? { compensation: amount } : {}) })
      onClose()
      requestAnimationFrame(() => toast(`${dispute.reference} resolved. Both sides were emailed.`))
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors)
      setError(errorText(err))
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-outline-strong px-3 py-2 text-[14px] text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30 aria-invalid:border-danger'
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => event.target === ref.current && !busy && onClose()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-panel backdrop:bg-ink-strong/40"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 id={`${id}-title`} className="font-heading text-[18px] font-semibold text-ink-strong">Resolve {dispute.reference}</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-warm">Your decision and note are emailed to the customer and the venue owner. Compensation is recorded only; MarkieSharkie moves no money.</p>
        </div>
        <fieldset aria-describedby={errors.outcome ? `${id}-outcome-error` : undefined}>
          <legend className="mb-1.5 text-[13px] font-semibold text-ink-strong">Outcome</legend>
          {['upheld', 'partially_upheld', 'dismissed'].map((value) => (
            <label key={value} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-[14px] text-ink-strong hover:bg-surface">
              <input type="radio" name={`${id}-outcome`} value={value} checked={form.outcome === value} onChange={set('outcome')} className="size-4 accent-primary" />
              {OUTCOME_LABELS[value]}
              <span className="text-[12px] text-muted-warm">{value === 'upheld' ? 'the complaint was justified' : value === 'dismissed' ? 'no fault found' : 'some of it was justified'}</span>
            </label>
          ))}
          {errors.outcome && <p id={`${id}-outcome-error`} role="alert" className="text-[13px] text-danger">{errors.outcome}</p>}
        </fieldset>
        {canPay && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-amount`} className="text-[13px] font-semibold text-ink-strong">Compensation agreed (optional, Rs)</label>
            <input id={`${id}-amount`} inputMode="decimal" value={form.compensation} onChange={set('compensation')} placeholder="e.g. 15000" aria-invalid={Boolean(errors.compensation)} aria-describedby={`${id}-amount-hint`} className={`${input} h-10 tabular-nums`} />
            <p id={`${id}-amount-hint`} className={`text-[12px] ${errors.compensation ? 'text-danger' : 'text-muted-warm'}`} role={errors.compensation ? 'alert' : undefined}>
              {errors.compensation || `Settled between the two sides. At most the booking total${maxAmount ? ` (${rs(maxAmount)})` : ''}.`}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-resolution`} className="text-[13px] font-semibold text-ink-strong">Resolution</label>
          <textarea id={`${id}-resolution`} rows={4} maxLength={2000} value={form.resolution} onChange={set('resolution')} placeholder="What you found and what each side should do now." aria-invalid={Boolean(errors.resolution)} className={input} />
          {errors.resolution && <p role="alert" className="text-[13px] text-danger">{errors.resolution}</p>}
        </div>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => !busy && onClose()} aria-disabled={busy || undefined}>Cancel</Button>
          <Button type="submit" busy={busy}>Resolve dispute</Button>
        </div>
      </form>
    </dialog>
  )
}

function ReportCard({ report, onTake, onResolve }) {
  return (
    <article aria-labelledby={`${report.id}-title`} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${report.id}-title`} className="text-[15px] font-semibold text-ink-strong">{report.venueName}</h2>
          <StatusBadge status={report.status} />
          {report.venueStatus !== 'approved' && <StatusBadge status={report.venueStatus} label={`Venue ${STATUS_LABELS[report.venueStatus]?.toLowerCase() ?? report.venueStatus}`} />}
        </div>
        <p className="mt-1 text-[13px] text-muted-warm">
          {reasonLabel(report.reason)} · {report.reporter.name} ({ROLE_LABELS[report.reporter.role]?.toLowerCase()}) · <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>{ago(report.createdAt)}</time>
          {report.handledBy && ` · ${report.handledBy}`}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink">“{report.details}”</p>
        {report.resolution && (
          <p className="mt-2 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-ink">
            <span className="font-semibold text-success">Resolved · {formatDateTime(report.resolvedAt)}: </span>
            {report.resolution}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
          <Link to={`/venues/${report.venueId}`} target="_blank" rel="noopener" className={`inline-flex items-center gap-1 rounded font-medium text-primary hover:underline ${focusRing}`}>
            View listing <AdminIcon name="external-link" className="size-3.5" /><span className="sr-only">(opens in a new tab)</span>
          </Link>
          <Link to={`/admin/venues?q=${encodeURIComponent(report.venueName)}`} className={`rounded font-medium text-primary hover:underline ${focusRing}`}>
            Find in All venues (suspend from there)
          </Link>
        </div>
      </div>
      {report.status !== 'resolved' && (
        <div className="flex flex-wrap gap-2">
          {report.status === 'open' && <Button size="sm" variant="secondary" icon="eye" onClick={onTake}>Start review</Button>}
          <Button size="sm" icon="check" onClick={onResolve}>Resolve</Button>
        </div>
      )}
    </article>
  )
}

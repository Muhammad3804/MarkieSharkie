import { useState } from 'react'
import { Link } from 'react-router-dom'
import { REVIEW_STATUSES, listModerationReviews, moderateReview } from '../../api/admin.js'
import { REVIEW_REPORT_REASONS } from '../../api/reviews.js'
import { useAdminData, useHref, useUrlState } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, Pager, SearchField, SkeletonRows, StatusBadge, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { STATUS_LABELS, ago, formatDateTime } from '../../features/admin/format.js'

// REQ-44 / EUC-34: reviews people reported, hidden ones and all reviews. Hide (reversible), keep (close the reports),
// restore or delete permanently, always with a reason (audited). Hidden reviews leave the venue page and its rating.
const DEFAULTS = { status: 'reported', q: '', page: 1 }
const TAB_LABELS = { reported: 'Reported', hidden: 'Hidden', all: 'All reviews' }
const REASON_LABEL = Object.fromEntries(REVIEW_REPORT_REASONS.map((r) => [r.value, r.label]))

const ACTIONS = {
  hide: {
    label: 'Hide',
    title: 'Hide this review?',
    body: 'It disappears from the venue page and no longer counts towards the rating. You can restore it later.',
    confirm: 'Hide review',
    tone: 'danger',
    placeholder: 'e.g. Shares a phone number, which breaks our review rules.',
    done: 'Review hidden. The venue rating was updated.',
  },
  dismiss: {
    label: 'Keep',
    title: 'Keep this review?',
    body: 'The review stays on the venue page and its reports are closed.',
    confirm: 'Keep review',
    tone: 'primary',
    placeholder: 'e.g. Honest negative feedback, no rules broken.',
    done: 'Review kept. Its reports are closed.',
  },
  restore: {
    label: 'Restore',
    title: 'Show this review again?',
    body: 'It goes back on the venue page and counts towards the rating again.',
    confirm: 'Restore review',
    tone: 'primary',
    placeholder: 'e.g. The reviewer removed the phone number.',
    done: 'Review restored. The venue rating was updated.',
  },
  delete: {
    label: 'Delete',
    title: 'Delete this review permanently?',
    body: 'It can’t be restored. A copy of its text stays in the audit log.',
    confirm: 'Delete permanently',
    tone: 'danger',
    placeholder: 'e.g. Spam advertising another business.',
    done: 'Review deleted. The venue rating was updated.',
  },
}
const actionsFor = (row) => (row.status === 'hidden' ? ['restore', 'delete'] : row.status === 'reported' ? ['hide', 'dismiss', 'delete'] : ['hide', 'delete'])

function Stars({ rating }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-ink-strong">
      <span aria-hidden="true" className="text-primary">
        ★
      </span>
      {rating}
      <span className="sr-only"> out of 5 stars</span>
    </span>
  )
}

export default function Reviews() {
  const [params, setParams] = useUrlState(DEFAULTS, { status: REVIEW_STATUSES })
  const href = useHref()
  const { status, data, reload, refreshing } = useAdminData(() => listModerationReviews(params), JSON.stringify(params))
  const [dialog, setDialog] = useState(null) // { action, row }
  const rows = data?.rows ?? []
  const copy = dialog && ACTIONS[dialog.action]

  return (
    <>
      <title>Reviews | Admin | MarkieSharkie</title>
      <PageHeader title="Reviews" description="Check reviews people reported. Hidden reviews leave the venue page and the rating; every decision needs a reason (REQ-44)." />
      <UrlTabs
        label="Review status"
        value={params.status}
        hrefFor={(value) => href({ status: value === 'reported' ? '' : value, page: '' })}
        items={REVIEW_STATUSES.map((value) => ({ value, label: TAB_LABELS[value], count: data?.counts?.[value] }))}
      />
      <Card bodyClassName="">
        <div className="border-b border-line p-3 sm:p-4">
          <SearchField label="Search reviews" value={params.q} onChange={(q) => setParams({ q })} placeholder="Search by words in the review, reviewer or venue" />
        </div>
        {status === 'loading' ? (
          <SkeletonRows label="Loading reviews" />
        ) : status === 'error' ? (
          <ErrorState onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={params.q ? 'search' : 'check-circle'}
            title={params.q ? 'No reviews match' : params.status === 'reported' ? 'No reported reviews' : params.status === 'hidden' ? 'No hidden reviews' : 'No reviews yet'}
            body={params.q ? 'Try other words or clear the search.' : params.status === 'reported' ? 'When someone reports a review on a venue page, it shows up here.' : undefined}
            action={params.q && <Button variant="secondary" onClick={() => setParams({ q: '' })}>Clear search</Button>}
          />
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : ''}>
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.id} className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[14px]">
                        <span className="font-semibold text-ink-strong">{row.customerName}</span>
                        <Stars rating={row.rating} />
                        <span className="text-muted-warm">
                          on{' '}
                          <Link to={`/venues/${row.venueId}`} target="_blank" rel="noopener noreferrer" className={`text-primary underline underline-offset-4 ${focusRing}`}>
                            {row.venueName}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </Link>
                          , {row.city}
                        </span>
                      </p>
                      <p className="text-[12px] text-muted-warm">
                        <time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>
                          Written {ago(row.createdAt)}
                        </time>
                      </p>
                    </div>
                    <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />
                  </div>
                  <blockquote className="break-words rounded-lg bg-surface px-3 py-2 text-[14px] leading-relaxed text-ink">{row.comment || <span className="italic text-muted-warm">No comment, rating only.</span>}</blockquote>
                  {row.reports.length > 0 && (
                    <div className="text-[13px]">
                      <p className="font-semibold text-danger">
                        {row.openReports} open {row.openReports === 1 ? 'report' : 'reports'}
                      </p>
                      <ul className="mt-1 grid gap-1 text-ink">
                        {row.reports.map((r, i) => (
                          <li key={i} className="break-words">
                            {REASON_LABEL[r.reason] ?? r.reason}
                            {r.note ? `: “${r.note}”` : ''} <span className="text-muted-warm">· {ago(r.at)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {row.status === 'hidden' && row.removalReason && (
                    <p className="text-[13px] text-muted-warm">
                      Hidden {ago(row.hiddenAt)}: {row.removalReason}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {actionsFor(row).map((action) => (
                      <Button key={action} size="sm" variant={action === 'hide' || action === 'restore' ? 'primary' : 'secondary'} onClick={() => setDialog({ action, row })} aria-label={`${ACTIONS[action].label} the review by ${row.customerName}`}>
                        {ACTIONS[action].label}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={(page) => href({ page: page === 1 ? '' : page })} noun="reviews" />
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(dialog)}
        title={copy?.title}
        body={
          dialog && (
            <>
              {copy.body}
              <span className="mt-2 block break-words text-ink">
                {dialog.row.customerName} ({dialog.row.rating}★): “{dialog.row.comment.slice(0, 140)}
                {dialog.row.comment.length > 140 ? '…' : ''}”
              </span>
            </>
          )
        }
        confirmLabel={copy?.confirm}
        tone={copy?.tone}
        field={copy && { label: 'Reason', required: true, minLength: 5, hint: 'Kept in the audit log.', placeholder: copy.placeholder }}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await moderateReview(dialog.row.id, dialog.action, reason)
          return copy.done
        }}
      />
    </>
  )
}

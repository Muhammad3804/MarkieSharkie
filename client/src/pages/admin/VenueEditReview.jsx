import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { approveRevision, getRevision, rejectRevision } from '../../api/admin.js'
import { useAdminData } from '../../features/admin/hooks.js'
import { useCrumb } from '../../features/admin/crumbs.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { formatDateTime } from '../../features/admin/format.js'

// One owner's edit of a live venue: old versus new for every changed field (REQ-5, srs-alignment #35). Approving
// applies it to the live venue in one transaction (halls keep their ids, so slots and bookings stay attached);
// rejecting keeps the live venue and shows the reason to the owner. Both are audited (NFR-4).
const Walkthrough = lazy(() => import('../../features/venues/walkthrough/Walkthrough.jsx'))

export default function VenueEditReview() {
  const { id } = useParams()
  const { status, data, reload } = useAdminData(() => getRevision(id), id)
  useCrumb(data?.venueName ?? null)
  if (status === 'loading')
    return (
      <div aria-busy="true" aria-label="Loading the edit" className="grid gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    )
  if (status === 'error') return <ErrorState onRetry={reload} />
  if (!data)
    return (
      <Card>
        <EmptyState icon="search" title="Edit not found" body="It may have been withdrawn by the owner." action={<Button to="/admin/edits" variant="secondary" icon="arrow-left">Back to edits</Button>} />
      </Card>
    )
  return <Review revision={data} />
}

function Review({ revision: r }) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(null) // 'approve' | 'reject'
  const sections = [...new Set(r.changes.map((c) => c.section))]
  const pending = r.status === 'pending'

  return (
    <>
      <title>{`Edits to ${r.venueName} | Admin | MarkieSharkie`}</title>
      <PageHeader
        title={`Edits to ${r.venueName}`}
        description={`${r.ownerName} sent these on ${formatDateTime(r.submittedAt)}. Customers see the current version until you approve.`}
        actions={
          pending && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon="x" onClick={() => setDialog('reject')}>
                Reject
              </Button>
              <Button icon="check" onClick={() => setDialog('approve')}>
                Approve and publish
              </Button>
            </div>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[14px] text-muted-warm">
        <StatusBadge status={r.status} />
        <span>
          {r.changes.length} {r.changes.length === 1 ? 'change' : 'changes'} · {r.city}
        </span>
        <Link to={`/venues/${r.venueId}`} target="_blank" rel="noopener noreferrer" className={`text-primary underline underline-offset-4 ${focusRing}`}>
          Open the live page<span className="sr-only"> (new tab)</span>
        </Link>
        {r.venueStatus !== 'approved' && <span className="text-danger">The venue is {r.venueStatus.replace('_', ' ')}, so this edit can’t be approved now.</span>}
      </div>
      {r.status === 'rejected' && r.note && (
        <p className="mb-4 rounded-lg bg-danger-bg px-3 py-2.5 text-[14px] text-danger">
          Rejected {r.decidedAt ? formatDateTime(r.decidedAt) : ''}: {r.note}
        </p>
      )}

      <div className="grid gap-4">
        {sections.map((section) => (
          <Card key={section} title={section} bodyClassName="">
            <table className="w-full table-fixed text-[14px]">
              <caption className="sr-only">{`${section}: current and proposed values`}</caption>
              <thead className="border-b border-line bg-surface/60 text-left text-[12px] uppercase tracking-wide text-muted-warm">
                <tr>
                  <th scope="col" className="w-[30%] px-4 py-2 font-semibold">
                    Field
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {pending ? 'Live now' : 'Before'}
                  </th>
                  <th scope="col" className="px-3 py-2 pr-4 font-semibold">
                    {pending ? 'Proposed' : 'After'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {r.changes
                  .filter((c) => c.section === section)
                  .map((c) => (
                    <tr key={c.label}>
                      <th scope="row" className="break-words px-4 py-2.5 text-left font-medium text-ink-strong">
                        {c.label}
                      </th>
                      <td className="break-words px-3 py-2.5 text-muted-warm">
                        <del className="decoration-muted-warm/60">{c.before}</del>
                      </td>
                      <td className="break-words px-3 py-2.5 pr-4 text-ink-strong">
                        <ins className="no-underline">{c.after}</ins>
                        {c.afterUrl && <FilePreview change={c} />}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        title={`Approve the edits to ${r.venueName}?`}
        body="They go live right away. Halls keep their bookings; new or changed slot times apply from today."
        confirmLabel="Approve and publish"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await approveRevision(r.id)
          navigate('/admin/edits')
          return `Edits to ${r.venueName} are live.`
        }}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        title={`Reject the edits to ${r.venueName}?`}
        body="The live venue stays as it is. The owner sees your reason and can send new changes."
        confirmLabel="Reject edits"
        tone="danger"
        field={{ label: 'Reason for the owner', required: true, minLength: 5, hint: 'Say what to fix, e.g. “The new capacity doesn’t match the floor plan.”' }}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await rejectRevision(r.id, reason)
          navigate('/admin/edits')
          return `Edits to ${r.venueName} were rejected.`
        }}
      />
    </>
  )
}

function FilePreview({ change }) {
  const [open, setOpen] = useState(false)
  if (!change.afterAssetType)
    return (
      <a href={change.afterUrl} target="_blank" rel="noopener noreferrer" className={`mt-1 block text-primary underline underline-offset-4 ${focusRing}`}>
        Open the new file<span className="sr-only"> (new tab)</span>
      </a>
    )
  const kind = change.afterAssetType === 'panorama_360' ? '360° view' : '3D model'
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`text-primary underline underline-offset-4 ${focusRing}`}>
        {open ? `Close the ${kind}` : `Preview the ${kind}`}
      </button>
      {open && (
        <div className="mt-2">
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />}>
            <Walkthrough file={{ url: change.afterUrl, assetType: change.afterAssetType }} name={change.label} className="h-[300px]" />
          </Suspense>
        </div>
      )}
    </div>
  )
}

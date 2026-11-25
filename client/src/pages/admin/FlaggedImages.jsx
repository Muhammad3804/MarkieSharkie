import { useState } from 'react'
import { decideImage, listFlaggedImages } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import AiCheckTester from '../../features/admin/AiCheckTester.jsx'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import Lightbox from '../../components/venue/Lightbox.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { ago, formatDateTime } from '../../features/admin/format.js'

// REQ-9 / REQ-10 / srs-alignment #42: photos whose AI score reached the threshold (rejected as AI-generated) or that
// were flagged. They are never published and never deleted (the file is quarantined). The admin can override any
// photo with a reason (audited): keep (accepted, published if the venue is live; a venue rejected for AI images
// reopens once it has enough photos) or remove.
const TABS = [
  { value: 'review', label: 'Rejected or flagged' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'removed', label: 'Removed by an admin' },
]
const DECISION_LABEL = { rejected_ai: 'Rejected as AI-generated', flagged_for_review: 'Flagged', accepted: 'Accepted', rejected_admin: 'Removed' }
const REASON = { label: 'Reason', required: true, minLength: 5, tooShort: 'Write at least 5 characters.', hint: 'Saved in the audit log with your name.' }

export default function FlaggedImages() {
  const [params] = useUrlState({ status: 'review' }, { status: TABS.map((t) => t.value) })
  const href = useHref()
  const { status, data, reload } = useAdminData(() => listFlaggedImages(params), params.status)
  const [pending, setPending] = useState(null) // { image, decision }
  const [viewer, setViewer] = useState(null)

  const images = data?.images ?? []
  return (
    <>
      <title>Flagged images | Admin | MarkieSharkie</title>
      <PageHeader title="AI-checked images" description="Photos scoring at or above the AI threshold are rejected automatically and never published. Override any decision with a reason (REQ-9, REQ-10)." />
      <AiCheckTester />
      <UrlTabs label="Image decision" value={params.status} hrefFor={(value) => href({ status: value === 'review' ? '' : value })} items={TABS.map((tab) => ({ ...tab, count: data?.counts[tab.value] }))} />

      {status === 'loading' ? (
        <ul aria-busy="true" aria-label="Loading images" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="overflow-hidden rounded-xl border border-line bg-white">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      ) : status === 'error' ? (
        <Card>
          <ErrorState onRetry={reload} />
        </Card>
      ) : images.length === 0 ? (
        <Card>
          <EmptyState icon="check-circle" title={params.status === 'review' ? 'No rejected or flagged images' : 'Nothing here yet'} body={params.status === 'review' ? 'Photos the AI check rejects appear here; you can override them.' : undefined} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {images.map((image, index) => {
            const percent = image.aiScorePercent ?? 0
            const rejected = image.decision === 'rejected_ai' || image.decision === 'flagged_for_review'
            return (
              <li key={image.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
                <button type="button" onClick={(event) => setViewer({ index, opener: event.currentTarget })} aria-label={`Open ${image.fileName} full size`} className={`relative aspect-[4/3] bg-surface ${focusRing} focus-visible:-outline-offset-2`}>
                  <img src={image.imageUrl} alt="" loading="lazy" width="400" height="300" className="size-full object-cover" />
                  <span className="absolute top-2 left-2"><StatusBadge status={image.decision === 'accepted' ? 'approved' : image.decision === 'flagged_for_review' ? 'flagged' : 'rejected'} label={DECISION_LABEL[image.decision] ?? 'Unchecked'} /></span>
                </button>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-medium text-ink-strong">AI score</span>
                      <span className="font-semibold text-ink-strong tabular-nums">{percent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`AI score ${percent}%`}>
                      <div className={`h-full rounded-full ${image.thresholdApplied != null && percent >= image.thresholdApplied ? 'bg-danger' : 'bg-success'}`} style={{ width: `${Math.max(percent, 1)}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-muted-warm">{image.thresholdApplied != null ? `Threshold when checked: ${image.thresholdApplied}%` : 'Checked before the threshold existed'}</p>
                  </div>
                  <dl className="grid gap-1 text-[13px]">
                    <div className="flex justify-between gap-2"><dt className="text-muted-warm">Venue</dt><dd className="truncate text-right text-ink-strong">{image.venueName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-warm">File</dt><dd className="truncate text-right text-ink">{image.fileName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-warm">Uploaded</dt><dd className="text-right text-ink"><time dateTime={image.uploadedAt} title={formatDateTime(image.uploadedAt)}>{ago(image.uploadedAt)}</time></dd></div>
                    {image.reason && <div className="flex justify-between gap-2"><dt className="text-muted-warm">Admin reason</dt><dd className="text-right text-ink">{image.reason}</dd></div>}
                  </dl>
                  <div className="mt-auto flex gap-2 pt-1">
                    {image.decision !== 'accepted' && <Button variant="secondary" icon="check" className="flex-1" onClick={() => setPending({ image, decision: 'approved' })} aria-label={`Keep ${image.fileName}`}>Keep</Button>}
                    {image.decision !== 'rejected_admin' && !rejected && <Button variant="danger-outline" icon="trash" className="flex-1" onClick={() => setPending({ image, decision: 'rejected' })} aria-label={`Remove ${image.fileName}`}>Remove</Button>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {viewer && images.length > 0 && (
        <Lightbox
          images={images.map((image) => ({ imageId: image.id, imageUrl: image.imageUrl, alt: `${image.venueName}: ${image.fileName}, AI score ${image.aiScorePercent ?? 0}%` }))}
          index={viewer.index}
          onIndexChange={(update) => setViewer((current) => ({ ...current, index: typeof update === 'function' ? update(current.index) : update }))}
          onClose={() => setViewer(null)}
          returnFocusTo={viewer.opener}
        />
      )}

      <ConfirmDialog
        open={pending?.decision === 'approved'}
        title="Keep this photo?"
        body={pending && `${pending.image.fileName} is accepted for ${pending.image.venueName} and published once the venue is live. If the venue was rejected for AI-generated images and now has enough photos, it goes back to review.`}
        confirmLabel="Keep photo"
        field={REASON}
        onClose={() => setPending(null)}
        onConfirm={async (reason) => {
          const { reopened } = await decideImage(pending.image.id, 'approved', reason)
          return reopened ? `${pending.image.fileName} kept. ${pending.image.venueName} is back in review.` : `${pending.image.fileName} kept`
        }}
      />
      <ConfirmDialog
        open={pending?.decision === 'rejected'}
        tone="danger"
        title="Remove this photo?"
        body={pending && `${pending.image.fileName} won’t be published on ${pending.image.venueName}. The file is kept privately, not deleted. The owner sees it was removed and can upload another.`}
        confirmLabel="Remove photo"
        field={REASON}
        onClose={() => setPending(null)}
        onConfirm={async (reason) => {
          await decideImage(pending.image.id, 'rejected', reason)
          return `${pending.image.fileName} removed`
        }}
      />
    </>
  )
}

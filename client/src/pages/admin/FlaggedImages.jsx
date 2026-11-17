import { useState } from 'react'
import { decideImage, listFlaggedImages } from '../../api/admin.js'
import { useAdminData, useUrlState, useHref } from '../../features/admin/hooks.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import Lightbox from '../../components/venue/Lightbox.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, UrlTabs } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { ago, formatDateTime } from '../../features/admin/format.js'

// REQ-9 / REQ-10: photos the AI check flagged as possibly fake or stock. Flagged photos are never published or
// deleted automatically (CLAUDE.md rule 5); the admin keeps them (verification_status 'approved', published) or
// removes them ('rejected'). The owner is notified either way.
const TABS = [
  { value: 'flagged', label: 'Needs review' },
  { value: 'approved', label: 'Kept' },
  { value: 'rejected', label: 'Removed' },
]

export default function FlaggedImages() {
  const [params] = useUrlState({ status: 'flagged' }, { status: TABS.map((t) => t.value) })
  const href = useHref()
  const { status, data, reload } = useAdminData(() => listFlaggedImages(params), params.status)
  const [pending, setPending] = useState(null) // { image, decision }
  const [viewer, setViewer] = useState(null)

  const images = data?.images ?? []
  return (
    <>
      <title>Flagged images | Admin | MarkieSharkie</title>
      <PageHeader title="Flagged images" description="Photos our AI check thinks may be AI-generated or stock. Nothing is published or deleted until you decide (REQ-9, REQ-10)." />
      <UrlTabs label="Image decision" value={params.status} hrefFor={(value) => href({ status: value === 'flagged' ? '' : value })} items={TABS.map((tab) => ({ ...tab, count: data?.counts[tab.value] }))} />

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
          <EmptyState icon="check-circle" title={params.status === 'flagged' ? 'No flagged images' : 'Nothing here yet'} body={params.status === 'flagged' ? 'Photos the AI check flags appear here for a decision.' : undefined} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {images.map((image, index) => {
            const percent = Math.round(image.aiScore * 100)
            return (
              <li key={image.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
                <button type="button" onClick={(event) => setViewer({ index, opener: event.currentTarget })} aria-label={`Open ${image.fileName} full size`} className={`relative aspect-[4/3] bg-surface ${focusRing} focus-visible:-outline-offset-2`}>
                  <img src={image.imageUrl} alt="" loading="lazy" width="400" height="300" className="size-full object-cover" />
                  <span className="absolute top-2 left-2"><StatusBadge status={image.status === 'approved' ? 'approved' : image.status === 'rejected' ? 'rejected' : 'flagged'} label={image.status === 'approved' ? 'Kept' : image.status === 'rejected' ? 'Removed' : image.aiLabel} /></span>
                </button>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-medium text-ink-strong">AI score</span>
                      <span className="font-semibold text-ink-strong tabular-nums">{percent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${image.aiLabel}: ${percent}% confidence`}>
                      <div className={`h-full rounded-full ${percent >= 85 ? 'bg-danger' : 'bg-pending'}`} style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-muted-warm">{percent >= 85 ? 'High' : 'Medium'} confidence it is {image.aiLabel.replace('Possibly ', '').toLowerCase()}</p>
                  </div>
                  <dl className="grid gap-1 text-[13px]">
                    <div className="flex justify-between gap-2"><dt className="text-muted-warm">Venue</dt><dd className="truncate text-right text-ink-strong">{image.venueName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-warm">File</dt><dd className="truncate text-right text-ink">{image.fileName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-warm">Uploaded</dt><dd className="text-right text-ink"><time dateTime={image.uploadedAt} title={formatDateTime(image.uploadedAt)}>{ago(image.uploadedAt)}</time></dd></div>
                    {image.decidedAt && <div className="flex justify-between gap-2"><dt className="text-muted-warm">Decided</dt><dd className="text-right text-ink">{formatDateTime(image.decidedAt)}</dd></div>}
                  </dl>
                  {image.status === 'flagged' && (
                    <div className="mt-auto flex gap-2 pt-1">
                      <Button variant="secondary" icon="check" className="flex-1" onClick={() => setPending({ image, decision: 'approved' })} aria-label={`Keep ${image.fileName}`}>Keep</Button>
                      <Button variant="danger-outline" icon="trash" className="flex-1" onClick={() => setPending({ image, decision: 'rejected' })} aria-label={`Remove ${image.fileName}`}>Remove</Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {viewer && images.length > 0 && (
        <Lightbox
          images={images.map((image) => ({ imageId: image.id, imageUrl: image.imageUrl, alt: `${image.venueName}: ${image.fileName}, AI score ${Math.round(image.aiScore * 100)}%` }))}
          index={viewer.index}
          onIndexChange={(update) => setViewer((current) => ({ ...current, index: typeof update === 'function' ? update(current.index) : update }))}
          onClose={() => setViewer(null)}
          returnFocusTo={viewer.opener}
        />
      )}

      <ConfirmDialog
        open={pending?.decision === 'approved'}
        title="Keep this photo?"
        body={pending && `${pending.image.fileName} will be marked genuine and published on ${pending.image.venueName}. The owner is notified.`}
        confirmLabel="Keep and publish"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          await decideImage(pending.image.id, 'approved')
          return `${pending.image.fileName} kept and published`
        }}
      />
      <ConfirmDialog
        open={pending?.decision === 'rejected'}
        tone="danger"
        title="Remove this photo?"
        body={pending && `${pending.image.fileName} won’t be published on ${pending.image.venueName}. The owner is told it was removed and can upload another.`}
        confirmLabel="Remove photo"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          await decideImage(pending.image.id, 'rejected')
          return `${pending.image.fileName} removed`
        }}
      />
    </>
  )
}

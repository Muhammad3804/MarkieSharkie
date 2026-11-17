import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { approveListings, getApproval, rejectListing, requestListingChanges } from '../../api/admin.js'
import { useAdminData } from '../../features/admin/hooks.js'
import { useCrumb } from '../../features/admin/crumbs.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import AdminIcon from '../../features/admin/icons.jsx'
import { Button, Card, EmptyState, ErrorState, Initials, Skeleton, StatusBadge } from '../../features/admin/ui.jsx'
import { focusRing } from '../../features/admin/styles.js'
import { ROLE_LABELS, STATUS_LABELS, VENUE_TYPE_LABELS, ago, formatDateTime } from '../../features/admin/format.js'
import HallCard from '../../components/venue/HallCard.jsx'
import MenuCard from '../../components/venue/MenuCard.jsx'
import Lightbox from '../../components/venue/Lightbox.jsx'
import { dishCount, formatAddress, hallArea, tierSummary } from '../../features/host/draft.js'
import {
  ADD_ON_TYPES,
  AMENITY_LABELS,
  CANCELLATION_POLICIES,
  EVENT_TYPES,
  HALL_PHOTO_CATEGORIES,
  HALL_SETTINGS,
  HOUSE_RULES,
  LAYOUT_CELLS,
  LAYOUT_ZONES,
  SLOT_TYPES,
  VENUE_CATEGORIES,
  VENUE_PHOTO_CATEGORIES,
  WALKTHROUGH_MODES,
  WEEKDAYS,
} from '../../features/host/options.js'
import { formatAmount } from '../../lib/money.js'

// Full review of one submitted listing (REQ-7): every wizard answer grouped by the wizard's three phases, photos
// per hall with their mock AI score (REQ-9), floor plans and 3D previews (HallCard), menus, policies and the map.
// The admin ticks the checklist, then approves, rejects with a reason (shown to the owner) or asks for changes.
const label = (list, value) => list.find((item) => item.value === value)?.label ?? value
const number = (text) => Number(text).toLocaleString('en-US')
const PHOTO_LABELS = Object.fromEntries([...HALL_PHOTO_CATEGORIES, ...VENUE_PHOTO_CATEGORIES].map((c) => [c.value, c.label]))
function time12(value) {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const PHASES = [
  { id: 'about', label: 'About your venue' },
  { id: 'stand-out', label: 'Make it stand out' },
  { id: 'finish', label: 'Finish up' },
]
const CHECKS = [
  { key: 'photos', label: 'Photos are genuine and show this venue' },
  { key: 'details', label: 'Details are complete and believable' },
  { key: 'location', label: 'Location is valid' },
]

export default function ApprovalReview() {
  const { id } = useParams()
  const { status, data, reload } = useAdminData(() => getApproval(id), id)
  useCrumb(data?.listing.payload.venue.name ?? (status === 'loading' ? 'Loading…' : 'Not found'))

  if (status === 'loading') return <ReviewSkeleton />
  if (status === 'error')
    return (
      <Card>
        <ErrorState onRetry={reload} title="Couldn’t load this listing" />
      </Card>
    )
  if (!data)
    return (
      <Card>
        <title>Listing not found | Admin | MarkieSharkie</title>
        <EmptyState icon="search" title="Listing not found" body="It may have been removed, or the demo data was reset." action={<Button to="/admin/approvals" variant="secondary" icon="arrow-left">Back to approvals</Button>} />
      </Card>
    )
  return <Review key={data.listing.id} data={data} />
}

function Review({ data }) {
  const { listing, venue, urls, checks, aiScores } = data
  const { draft } = listing
  const [ticked, setTicked] = useState({ photos: false, details: false, location: false })
  const [dialog, setDialog] = useState(null) // 'approve' | 'reject' | 'changes'
  const [checklistError, setChecklistError] = useState(false)
  const checklistRef = useRef(null)
  const allTicked = CHECKS.every((check) => ticked[check.key])
  const decidable = listing.status === 'pending' || listing.status === 'changes_requested'
  const name = listing.payload.venue.name

  function startApprove() {
    if (!allTicked) {
      setChecklistError(true)
      checklistRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      checklistRef.current?.querySelector('input:not(:checked)')?.focus({ preventScroll: true })
      return
    }
    setDialog('approve')
  }

  const actions = decidable && (
    <>
      <Button icon="check" onClick={startApprove} aria-disabled={!allTicked || undefined} aria-describedby="approve-hint" className="flex-1 xl:w-full">
        Approve
      </Button>
      <Button variant="secondary" icon="message-edit" onClick={() => setDialog('changes')} className="flex-1 xl:w-full">
        <span className="sm:hidden">Changes</span>
        <span className="hidden sm:inline">Request changes</span>
      </Button>
      <Button variant="danger-outline" icon="x" onClick={() => setDialog('reject')} className="flex-1 xl:w-full">
        Reject
      </Button>
    </>
  )

  return (
    <>
      <title>{`${name} | Review | Admin | MarkieSharkie`}</title>
      <header className="flex flex-col gap-3">
        <Link to={`/admin/approvals${listing.status === 'pending' ? '' : `?status=${listing.status}`}`} className={`inline-flex items-center gap-1.5 self-start rounded text-[13px] font-medium text-muted-warm hover:text-ink-strong ${focusRing}`}>
          <AdminIcon name="arrow-left" className="size-4" /> Venue approvals
        </Link>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {venue.image && <img src={venue.image} alt="" width="64" height="64" className="hidden size-16 shrink-0 rounded-xl object-cover sm:block" />}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 tabIndex={-1} data-page-heading className="font-heading text-[22px] font-semibold text-ink-strong outline-none sm:text-[26px]">{name}</h1>
                <StatusBadge status={listing.status} />
              </div>
              <p className="mt-1 text-[14px] text-muted-warm">
                {label(VENUE_CATEGORIES, draft.venue.category)} in {draft.venue.area}, {draft.venue.city} · submitted <time dateTime={listing.submittedAt} title={formatDateTime(listing.submittedAt)}>{ago(listing.submittedAt)}</time> by {listing.owner.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {listing.status === 'approved' && data.suspended && <StatusBadge status="suspended" label="Suspended from the site" />}
            {listing.status === 'approved' && !data.suspended && (
              <Button variant="secondary" icon="external-link" to={`/venues/${listing.id}`} target="_blank" rel="noopener">
                View on site
              </Button>
            )}
          </div>
        </div>
        <DecisionBanner listing={listing} />
        <nav aria-label="Listing sections" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ol className="flex min-w-max gap-2">
            {PHASES.map((phase, index) => (
              <li key={phase.id}>
                <a href={`#phase-${phase.id}`} className={`flex h-9 items-center gap-2 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-ink hover:border-outline-strong ${focusRing}`}>
                  <span className="grid size-5 place-items-center rounded-full bg-rose text-[11px] font-bold text-primary">{index + 1}</span>
                  {phase.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8 pb-20 xl:pb-0">
          <AboutPhase draft={draft} venue={venue} />
          <StandOutPhase draft={draft} urls={urls} aiScores={aiScores} />
          <FinishPhase draft={draft} venue={venue} />
        </div>

        <aside aria-label="Review decision" className="flex flex-col gap-4 xl:sticky xl:top-[72px]">
          {decidable && (
            <Card title="Review checklist">
              <fieldset ref={checklistRef} aria-describedby={checklistError && !allTicked ? 'checklist-error' : undefined}>
                <legend className="sr-only">Tick each check before approving</legend>
                <ul className="flex flex-col gap-3">
                  {CHECKS.map((check) => {
                    const auto = checks[check.key]
                    return (
                      <li key={check.key}>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={ticked[check.key]}
                            onChange={(event) => setTicked((t) => ({ ...t, [check.key]: event.target.checked }))}
                            className={`mt-0.5 size-[18px] shrink-0 cursor-pointer accent-primary ${focusRing}`}
                          />
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium text-ink-strong">{check.label}</span>
                            <span className={`mt-0.5 flex items-start gap-1 text-[12px] ${auto.ok ? 'text-success' : 'text-pending'}`}>
                              <AdminIcon name={auto.ok ? 'check-circle' : 'alert'} className="mt-px size-3.5" />
                              <span>
                                <span className="sr-only">{auto.ok ? 'Automatic check passed: ' : 'Check this: '}</span>
                                {auto.hint}
                              </span>
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
              <p id="approve-hint" className={`mt-4 text-[12px] ${checklistError && !allTicked ? 'text-danger' : 'text-muted-warm'}`} role={checklistError && !allTicked ? 'alert' : undefined}>
                {allTicked ? 'All checks ticked. Approving makes the listing public right away.' : 'Tick all three checks to approve. The hints are automatic and only a guide.'}
              </p>
              <div className="mt-4 hidden flex-col gap-2 xl:flex">{actions}</div>
            </Card>
          )}

          <Card title="Owner">
            <div className="flex items-center gap-3">
              <Initials name={listing.owner.name} className="size-10 text-[13px]" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink-strong">{listing.owner.name}</p>
                <p className="text-[12px] text-muted-warm">{ROLE_LABELS.venue_owner}</p>
              </div>
            </div>
            <dl className="mt-3 grid gap-1.5 text-[13px]">
              <Row term="Email"><a href={`mailto:${listing.owner.email}`} className={`break-all text-primary hover:underline ${focusRing}`}>{listing.owner.email}</a></Row>
              <Row term="Phone"><span className="tabular-nums">{listing.owner.phone}</span></Row>
              <Row term="Listing ID"><span className="break-all text-muted-warm">{listing.id}</span></Row>
            </dl>
          </Card>

          <Card title="History">
            <ol className="flex flex-col gap-3">
              {[...listing.history].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${entry.status === 'approved' ? 'bg-success' : entry.status === 'rejected' ? 'bg-danger' : entry.status === 'changes_requested' ? 'bg-info' : 'bg-pending'}`} aria-hidden="true" />
                  <div className="min-w-0 text-[13px]">
                    <p className="font-medium text-ink-strong">{entry.by === 'owner' ? (entry.note || 'Submitted for review') : STATUS_LABELS[entry.status]}</p>
                    {entry.by === 'admin' && entry.note && <p className="mt-0.5 text-muted-warm">“{entry.note}”</p>}
                    <p className="text-[12px] text-muted-warm">{formatDateTime(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>

      {/* Below xl the actions stay in reach in a bar at the bottom of the screen. */}
      {decidable && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-[var(--admin-sidebar)] xl:hidden">{actions}</div>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        title={`Approve ${name}?`}
        body="It goes live on the home page and in Explore right away, and the owner is notified."
        confirmLabel="Approve listing"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await approveListings([listing.id], { checklist: ticked })
          return [`${name} approved and live`, { action: <Link to={`/venues/${listing.id}`} className="shrink-0 rounded text-[13px] font-semibold text-white underline focus-visible:outline-2 focus-visible:outline-white">View</Link> }]
        }}
      />
      <ConfirmDialog
        open={dialog === 'changes'}
        title="Ask the owner for changes"
        body={`${name} stays hidden until the owner fixes it and resubmits.`}
        confirmLabel="Send to owner"
        field={{ label: 'What should the owner change?', required: true, placeholder: 'e.g. Two stage photos look like stock images. Please upload photos of your own stage.', hint: 'The owner sees this note exactly as you write it.' }}
        onClose={() => setDialog(null)}
        onConfirm={async (note) => {
          await requestListingChanges(listing.id, note)
          return `Changes requested from ${listing.owner.name}`
        }}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        tone="danger"
        title={`Reject ${name}?`}
        body="The listing won’t be published. The owner can submit a new listing."
        confirmLabel="Reject listing"
        field={{ label: 'Reason', required: true, placeholder: 'e.g. We couldn’t verify that the venue exists at this address.', hint: 'Required (REQ-7). The owner sees this reason.' }}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await rejectListing(listing.id, reason)
          return `${name} rejected; the owner can see your reason`
        }}
      />
    </>
  )
}

function DecisionBanner({ listing }) {
  if (listing.status === 'pending') return null
  const tone = { approved: 'border-success/30 bg-success-bg text-success', rejected: 'border-danger/30 bg-danger-bg text-danger', changes_requested: 'border-info/30 bg-info-bg text-info' }[listing.status]
  const icon = { approved: 'check-circle', rejected: 'x-circle', changes_requested: 'message-edit' }[listing.status]
  const title = { approved: 'Approved and live', rejected: 'Rejected', changes_requested: 'Waiting for the owner to make changes' }[listing.status]
  const note = listing.rejectionReason || listing.changesNote
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${tone}`}>
      <AdminIcon name={icon} className="mt-0.5 size-5" />
      <div className="min-w-0 text-[14px]">
        <p className="font-semibold">
          {title} · {formatDateTime(listing.decidedAt)}
        </p>
        {note && <p className="mt-0.5 text-ink">{listing.status === 'rejected' ? 'Reason shown to the owner: ' : 'Note to the owner: '}“{note}”</p>}
      </div>
    </div>
  )
}

function Row({ term, children }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-warm">{term}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

// Two-column definition list used in every section card.
function Fields({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
      {items.filter(Boolean).map(([term, value, wide]) => (
        <div key={term} className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
          <dt className="text-[12px] font-semibold text-muted-warm">{term}</dt>
          <dd className="mt-0.5 break-words text-ink-strong">{value || <span className="text-muted-warm">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

function Phase({ id, index, title, children }) {
  return (
    <section id={`phase-${id}`} aria-labelledby={`phase-${id}-title`} className="flex scroll-mt-20 flex-col gap-4">
      <h2 id={`phase-${id}-title`} className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted-warm uppercase">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-[12px] text-white">{index}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function AboutPhase({ draft, venue }) {
  const { venue: v, halls, bridalSuite } = draft
  const mapsUrl = v.lat != null ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}` : null
  return (
    <Phase id="about" index={1} title="About your venue">
      <Card title="Basics">
        <Fields
          items={[
            ['Venue type', `${label(VENUE_CATEGORIES, v.category)} · ${VENUE_TYPE_LABELS[venue.venueType]} (from the halls)`],
            ['Venue name', v.name],
            ['Hosting events since', v.hostingSince],
            ['Capacity', `${number(venue.capacity)} guests (largest hall)`],
            ['Events hosted', v.supportedEvents.map((e) => label(EVENT_TYPES, e)).join(', '), true],
          ]}
        />
      </Card>
      <Card title="Location">
        <div className="grid gap-4 lg:grid-cols-2">
          <Fields
            items={[
              ['Address', formatAddress(v), true],
              ['Map pin', v.lat != null ? <span key="pin" className="tabular-nums">{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</span> : '', true],
              ['Google Maps link', v.googleMapsUrl && <a key="link" href={v.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={`break-all text-primary hover:underline ${focusRing}`}>{v.googleMapsUrl}</a>, true],
              ['Getting there', v.landmark ? `${v.landmarkMinutes} min from ${v.landmark}` : ''],
              ['Directions', v.directions, true],
            ]}
          />
          {mapsUrl ? (
            <div className="relative h-56 overflow-hidden rounded-lg bg-map lg:h-full lg:min-h-56">
              <iframe title={`Map of ${v.name}`} src={`https://www.google.com/maps?q=${v.lat},${v.lng}&z=14&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" tabIndex={-1} aria-hidden="true" className="pointer-events-none size-full border-0" />
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`absolute bottom-3 left-3 rounded-lg bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong shadow-chip hover:bg-surface ${focusRing}`}>
                Open pin in Google Maps<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          ) : (
            <p className="rounded-lg bg-danger-bg p-4 text-[14px] text-danger">No map pin was set.</p>
          )}
        </div>
      </Card>
      <Card title={`Halls (${halls.length})`}>
        <ul className="mb-4 grid gap-2 text-[14px] text-ink">
          {halls.map((hall) => {
            const zones = LAYOUT_ZONES.filter((zone) => hall.zones[zone.key] != null).map((zone) => `${zone.label}: ${LAYOUT_CELLS[hall.zones[zone.key]].toLowerCase()}`)
            return (
              <li key={hall.hallId}>
                <span className="font-medium text-ink-strong">{hall.name}</span> · {number(hall.capacity)} seated{hall.standingCapacity && ` · ${number(hall.standingCapacity)} standing`} · {label(HALL_SETTINGS, hall.setting)}
                {hall.hasAc ? ' · AC' : ''}
                <span className="block text-[13px] text-muted-warm">
                  {hall.lengthFt && hall.widthFt ? `${hall.lengthFt} × ${hall.widthFt} ft · ${hallArea(hall)?.toLocaleString('en-US')} sq ft` : 'No size given'}
                  {hall.ceilingFt && ` · ${hall.ceilingFt} ft ceiling`} · {hall.floorPlan ? `Plan: ${hall.floorPlan.fileName}` : 'No floor plan'}
                  {zones.length > 0 && ` · ${zones.join(', ')}`}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-3">
          {venue.halls.map((hall) => (
            <HallCard key={hall.hallId} hall={hall} />
          ))}
        </div>
      </Card>
      <Card title="Bridal suite">
        {bridalSuite.enabled ? (
          <Fields
            items={[
              ['Name', bridalSuite.name],
              ['Fits', bridalSuite.capacity && `${bridalSuite.capacity} people`],
              ['Size', hallArea(bridalSuite) && `${bridalSuite.lengthFt} × ${bridalSuite.widthFt} ft`],
              ['Description', bridalSuite.description, true],
            ]}
          />
        ) : (
          <p className="text-[14px] text-muted-warm">No bridal suite.</p>
        )}
      </Card>
    </Phase>
  )
}

function StandOutPhase({ draft, urls, aiScores }) {
  const { venue: v, halls, venueImages } = draft
  const facilities = [...v.facilities.map((key) => AMENITY_LABELS[key] ?? key), ...v.customFacilities]
  const groups = [
    ...halls.map((hall) => ({ id: hall.hallId, title: hall.name, images: venueImages.filter((image) => image.hallId === hall.hallId) })),
    { id: 'venue', title: 'Venue-wide', images: venueImages.filter((image) => image.hallId === null) },
  ].filter((group) => group.images.length)
  const [viewer, setViewer] = useState(null) // { groupId, index, opener }
  const viewerGroup = viewer && groups.find((g) => g.id === viewer.groupId)
  const lightboxImages = viewerGroup?.images.filter((image) => urls[image.imageId]).map((image) => ({ imageId: image.imageId, imageUrl: urls[image.imageId], alt: `${viewerGroup.title}: ${PHOTO_LABELS[image.category] ?? image.category}${image.isCover ? ' (cover)' : ''}` }))
  const flagged = venueImages.filter((image) => aiScores[image.imageId] >= 0.6).length

  return (
    <Phase id="stand-out" index={2} title="Make it stand out">
      <Card title="Amenities">
        {facilities.length ? (
          <ul className="flex flex-wrap gap-2">
            {facilities.map((item) => (
              <li key={item} className="rounded-full bg-surface px-3 py-1 text-[13px] text-ink-strong">{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-warm">None selected.</p>
        )}
        <p className="mt-3 text-[14px] text-ink">{v.parkingSpaces ? `Parking for ${number(v.parkingSpaces)} cars` : <span className="text-pending">Parking spaces not given</span>}</p>
      </Card>

      <Card title={`Photos (${venueImages.length})`} actions={flagged > 0 && <StatusBadge status="flagged" label={`${flagged} high AI score`} />}>
        <p className="mb-4 text-[13px] text-muted-warm">The AI score is the mock detector’s confidence that a photo is AI-generated or stock (REQ-9). 60% or more needs a closer look. Click a photo to open it full size.</p>
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="mb-2 text-[14px] font-semibold text-ink-strong">
                {group.title} <span className="font-normal text-muted-warm">· {group.images.length}</span>
              </h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {group.images.map((image) => {
                  const score = aiScores[image.imageId]
                  const url = urls[image.imageId]
                  const index = lightboxIndex(group, image, urls)
                  return (
                    <li key={image.imageId} className="flex flex-col gap-1">
                      {url ? (
                        <button
                          type="button"
                          onClick={(event) => setViewer({ groupId: group.id, index, opener: event.currentTarget })}
                          aria-label={`Open ${PHOTO_LABELS[image.category] ?? image.category} photo${image.isCover ? ' (cover)' : ''}, AI score ${Math.round(score * 100)}%`}
                          className={`group relative aspect-[4/3] overflow-hidden rounded-lg bg-surface ${focusRing}`}
                        >
                          <img src={url} alt="" loading="lazy" width="240" height="180" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none" />
                          {image.isCover && <span className="absolute top-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-ink-strong">Cover</span>}
                          <span className={`absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${score >= 0.6 ? 'bg-danger text-white' : 'bg-white/90 text-ink-strong'}`}>AI {Math.round(score * 100)}%</span>
                        </button>
                      ) : (
                        <span className="grid aspect-[4/3] place-items-center rounded-lg bg-danger-bg p-2 text-center text-[12px] text-danger">File missing</span>
                      )}
                      <span className="truncate text-[12px] text-muted-warm" title={image.fileName}>{PHOTO_LABELS[image.category] ?? image.category} · {image.fileName}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="3D walkthroughs">
        <ul className="grid gap-2 text-[14px] text-ink">
          {halls.map((hall) => (
            <li key={hall.hallId} className="min-w-0">
              <span className="font-medium text-ink-strong">{hall.name}</span> · {label(WALKTHROUGH_MODES, hall.walkthrough.mode)}
              {hall.walkthrough.mode === 'upload' && hall.walkthrough.file && ` (${hall.walkthrough.file.fileName}, no viewer yet)`}
              {hall.walkthrough.mode === 'link' && (
                <a href={hall.walkthrough.url} target="_blank" rel="noopener noreferrer" className={`block break-all text-primary hover:underline ${focusRing}`}>{hall.walkthrough.url}</a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-muted-warm">Generated models open with “View in 3D” on each hall card above.</p>
      </Card>

      <Card title="Title and description">
        <p className="text-[16px] font-semibold text-ink-strong">{v.headline || <span className="text-pending">No title</span>}</p>
        <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line text-ink">{v.description}</p>
      </Card>

      {viewer && lightboxImages?.length > 0 && (
        <Lightbox images={lightboxImages} index={viewer.index} onIndexChange={(update) => setViewer((current) => ({ ...current, index: typeof update === 'function' ? update(current.index) : update }))} onClose={() => setViewer(null)} returnFocusTo={viewer.opener} />
      )}
    </Phase>
  )
}

const lightboxIndex = (group, image, urls) => group.images.filter((i) => urls[i.imageId]).findIndex((i) => i.imageId === image.imageId)

function FinishPhase({ draft, venue }) {
  const { menuPackages, addOns, customMenu, bookingRules, venue: v } = draft
  const houseRules = [...v.houseRules.map((key) => HOUSE_RULES.find((rule) => rule.key === key)?.label ?? key), ...v.customHouseRules]
  const workingDays = bookingRules.days.length === 7 ? 'Every day' : bookingRules.days.map((d) => label(WEEKDAYS, d).slice(0, 3)).join(', ')
  return (
    <Phase id="finish" index={3} title="Finish up">
      <Card title={`Menu packages (${menuPackages.length})`}>
        <ul className="mb-4 grid gap-1 text-[14px] text-ink">
          {menuPackages.map((menu) => (
            <li key={menu.menuId}>
              <span className="font-medium text-ink-strong">{menu.name}</span> · <span className="tabular-nums">{formatAmount(menu.pricePerHead, 'Rs')}</span> per guest · from {number(menu.minGuests)} guests · {dishCount(menu)} dishes
              {customMenu.accepts && menu.isCustomizable && ' · customisable'}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          {venue.menuPackages.map((menu) => (
            <MenuCard key={menu.menuId} menu={menu} />
          ))}
        </div>
      </Card>
      <Card title="Custom menus and add-ons">
        <Fields
          items={[
            ['Custom menu requests', customMenu.accepts ? `Accepted${customMenu.note ? `: ${customMenu.note}` : ''}` : 'Not accepted', true],
            ['Add-ons', addOns.length ? addOns.map((a) => `${a.name} (${label(ADD_ON_TYPES, a.type)}, ${formatAmount(a.price, 'Rs')})`).join(', ') : 'None', true],
          ]}
        />
      </Card>
      <Card title="Booking rules and policies">
        <Fields
          items={[
            ['Open', workingDays],
            [
              'Slots',
              SLOT_TYPES.filter((s) => bookingRules.slots[s.value].enabled)
                .map((s) => `${s.label} ${time12(bookingRules.slots[s.value].start)}–${time12(bookingRules.slots[s.value].end)}`)
                .join(' · '),
            ],
            ['Advance', `${bookingRules.advancePercent}% of the total`],
            [
              'Cancellation policy',
              bookingRules.cancellationPolicy ? (
                <>
                  {label(CANCELLATION_POLICIES, bookingRules.cancellationPolicy)}
                  {bookingRules.cancellationPolicy === 'custom' && (
                    <ul className="mt-1 text-[13px] text-muted-warm">
                      {[...bookingRules.customPolicy.tiers].sort((a, b) => Number(b.fromDays) - Number(a.fromDays)).map((tier) => <li key={tier.tierId}>{tierSummary(tier)}</li>)}
                      {bookingRules.customPolicy.note && <li>{bookingRules.customPolicy.note}</li>}
                    </ul>
                  )}
                </>
              ) : (
                ''
              ),
            ],
            ['House rules', houseRules.join(' · '), true],
          ]}
        />
        <p className="mt-3 text-[12px] text-muted-warm">Policies are information only: payments are tracked, never processed (REQ-25), and customers can still cancel before the event (REQ-22).</p>
      </Card>
    </Phase>
  )
}

function ReviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading listing" className="flex flex-col gap-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-sm" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  )
}

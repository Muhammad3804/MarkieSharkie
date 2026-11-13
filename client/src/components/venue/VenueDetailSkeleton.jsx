// Loading skeleton for /venues/:id, shaped like the gallery, content column and booking card.
// Used as the lazy route's Suspense fallback and while the venue loads.
const block = 'rounded-[12px] bg-surface motion-safe:animate-pulse'

export default function VenueDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading venue" className="page-container pb-14">
      <div className="flex flex-col gap-6 pb-[38px] pt-8">
        <div className={`${block} h-10 w-3/4 max-w-[640px]`} />
        <div className={`${block} h-4 w-72`} />
        <div className="grid h-[260px] gap-2 sm:h-[438px] md:grid-cols-[650fr_327fr_327fr]">
          <div className={`${block} rounded-[18px]`} />
          <div className="hidden flex-col gap-2 md:flex">
            <div className={`${block} flex-1`} />
            <div className={`${block} flex-1`} />
          </div>
          <div className="hidden flex-col gap-2 md:flex">
            <div className={`${block} flex-1`} />
            <div className={`${block} flex-1`} />
          </div>
        </div>
      </div>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,808px)_416px] lg:justify-between">
        <div className="flex flex-col gap-6">
          <div className={`${block} h-8 w-2/3`} />
          <div className={`${block} h-20`} />
          <div className={`${block} h-24`} />
          <div className={`${block} h-40`} />
        </div>
        <div className={`${block} h-[540px] rounded-[18px] lg:mt-[55px]`} />
      </div>
    </div>
  )
}

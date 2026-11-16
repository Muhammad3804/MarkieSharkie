import { PHASES } from '../steps.js'
import { PHASE_IMAGES } from '../phaseImages.js'

// "Step 1 / Tell us about your marquee" screen that opens each phase.
export default function PhaseIntro({ phase }) {
  const { number, title, intro } = PHASES[phase - 1]
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div>
        <p className="mb-3 text-[17px] font-medium text-ink-strong sm:text-[18px]">Step {number}</p>
        <h1 tabIndex={-1} data-step-heading className="font-heading text-[36px] font-semibold leading-[1.1] text-balance text-ink-strong outline-none sm:text-[48px] lg:text-[56px]">
          {title}
        </h1>
        <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-ink sm:text-[19px]">{intro}</p>
      </div>
      <img
        src={PHASE_IMAGES[number]}
        alt=""
        width="640"
        height="480"
        className="order-first aspect-[4/3] w-full rounded-3xl object-cover lg:order-none"
      />
    </div>
  )
}

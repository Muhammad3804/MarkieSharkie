import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import { usePlatformStats } from '../features/about/usePlatformStats.js'
import { CUSTOMER_STEPS, FAQS, FEATURES, OWNER_STEPS, TEAM } from '../features/about/content.js'
import { ArrowRightIcon, CalendarCheckIcon, ChevronDownIcon, ClockIcon, CubeIcon, QrCodeIcon, ShieldCheckIcon, SparklesIcon } from '../features/about/icons.jsx'
import heroImage from '../assets/gallery/hall-1.webp'
import stageImage from '../assets/gallery/stage-2.webp'

const FEATURE_ICONS = { sparkles: SparklesIcon, calendar: CalendarCheckIcon, cube: CubeIcon, qr: QrCodeIcon }

const eyebrow = 'text-[13px] font-semibold uppercase tracking-[0.08em] text-primary'
const sectionHeading = 'font-heading text-[28px] font-semibold leading-tight text-ink-strong text-balance sm:text-[36px]'
const sectionLead = 'max-w-[60ch] text-[16px] leading-relaxed text-muted-warm'

// About page (no Figma frame; built from the landing tokens). Copy lives in features/about/content.js.
export default function About() {
  const { hash } = useLocation()

  // The page is lazy-loaded, so ScrollRestoration can run before #how-it-works / #faq exist. Scroll once mounted.
  useEffect(() => {
    // Our ids are plain ASCII, so the raw hash is enough (decodeURIComponent would throw on a malformed one).
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  return (
    <>
      <title>About · MarkieSharkie</title>
      <meta
        name="description"
        content="MarkieSharkie is an online marketplace for finding, comparing and booking marquees and event venues across Pakistan."
      />

      <Hero />
      <StatsStrip />
      <HowItWorks />
      <Features />
      <Team />
      <Faq />
      <ListYourVenue />
    </>
  )
}

function Hero() {
  return (
    <section aria-labelledby="about-heading" className="page-container grid items-center gap-12 pt-8 md:pt-14 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col items-start gap-6">
        <p className={eyebrow}>About MarkieSharkie</p>
        <h1 id="about-heading" className="font-heading text-[36px] font-semibold leading-[1.1] text-ink-strong text-balance sm:text-[48px] xl:text-[56px]">
          Book the right venue for your big day, without the phone calls.
        </h1>
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-strong">Our mission</h2>
          <p className="max-w-[56ch] text-[17px] leading-relaxed text-ink">
            We connect families planning weddings, mehndis and every kind of celebration with verified marquees and banquet halls across
            Pakistan. Compare venues side by side, see live availability, and handle everything from booking to guest check-in in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button to="/explore" className="min-h-12 px-6">
            Explore venues
          </Button>
          <Button to="/host" variant="outline" className="min-h-12 px-6">
            List your venue
          </Button>
        </div>
      </div>

      {/* Photo collage. Both images are decorative (the copy carries the message), so alt is empty. */}
      <div className="relative pb-10 sm:pb-12 lg:pb-16 lg:pl-10">
        <img
          src={heroImage}
          alt=""
          width="1200"
          height="509"
          fetchPriority="high"
          className="aspect-[4/3] w-full rounded-[30px] object-cover shadow-card"
        />
        <img
          src={stageImage}
          alt=""
          width="1200"
          height="528"
          loading="lazy"
          className="absolute bottom-0 right-4 hidden aspect-[4/3] w-[42%] rounded-[24px] border-4 border-white object-cover shadow-card sm:block"
        />
        <div className="absolute bottom-2 left-4 flex items-center gap-3 rounded-[20px] bg-white px-4 py-3 shadow-card sm:bottom-4 lg:left-0">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose text-primary">
            <ClockIcon className="size-5" />
          </span>
          <p className="flex flex-col text-[13px] leading-snug">
            <span className="font-semibold text-ink-strong">Slot held for 10 minutes</span>
            <span className="text-muted-warm">while you confirm your booking</span>
          </p>
        </div>
      </div>
    </section>
  )
}

const numberFormat = new Intl.NumberFormat('en-PK')

function StatsStrip() {
  const { status, stats } = usePlatformStats()
  if (status === 'error') return null

  const items = stats
    ? [
        { value: numberFormat.format(stats.venueCount), label: 'Listed venues' },
        { value: numberFormat.format(stats.hallCount), label: 'Bookable halls' },
        { value: numberFormat.format(stats.cityCount), label: stats.cityCount === 1 ? 'City' : 'Cities' },
        { value: stats.averageRating === null ? '–' : stats.averageRating.toFixed(1), label: 'Average venue rating' },
      ]
    : null

  return (
    <section aria-label="MarkieSharkie in numbers" className="page-container mt-14 md:mt-20">
      <dl aria-busy={status === 'loading'} className="grid grid-cols-2 gap-y-8 rounded-[30px] bg-surface px-6 py-8 md:grid-cols-4 md:px-10 md:py-10">
        {(items ?? Array.from({ length: 4 }, () => null)).map((item, index) => (
          <div key={index} className="flex flex-col-reverse gap-1 border-line px-2 md:border-l md:px-8 md:first:border-l-0">
            <dt className="text-[14px] text-muted-warm">{item ? item.label : <span className="block h-4 w-24 rounded bg-line motion-safe:animate-pulse" />}</dt>
            <dd className="font-heading text-[32px] font-bold leading-none text-primary tabular-nums sm:text-[40px]">
              {item ? item.value : <span className="block h-9 w-16 rounded-lg bg-line motion-safe:animate-pulse" />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="page-container py-16 md:py-24">
      <div className="flex flex-col gap-3">
        <p className={eyebrow}>How it works</p>
        <h2 id="how-heading" className={sectionHeading}>
          One marketplace, two sides
        </h2>
        <p className={sectionLead}>Customers find and book venues in a few steps. Venue owners fill their calendar without the back-and-forth.</p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <StepsCard
          audience="For customers"
          title="From search to celebration"
          steps={CUSTOMER_STEPS}
          link={{ to: '/explore', label: 'Start exploring' }}
          className="border border-line bg-white"
        />
        <StepsCard
          audience="For venue owners"
          title="From listing to booked out"
          steps={OWNER_STEPS}
          link={{ to: '/host', label: 'List your venue' }}
          className="bg-blush"
        />
      </div>
    </section>
  )
}

function StepsCard({ audience, title, steps, link, className }) {
  return (
    <article className={`flex flex-col gap-8 rounded-[30px] p-6 sm:p-8 lg:p-10 ${className}`}>
      <header className="flex flex-col gap-2">
        <p className="w-fit rounded-full bg-rose px-3 py-1 text-[13px] font-semibold text-primary">{audience}</p>
        <h3 className="font-heading text-[22px] font-semibold text-ink-strong sm:text-[24px]">{title}</h3>
      </header>

      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.title} className="relative grid grid-cols-[40px_1fr] gap-x-4 pb-7 last:pb-0">
            {/* Connector between step numbers; hidden after the last step. */}
            {index < steps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[19.5px] top-11 w-px bg-outline-strong" />}
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-primary text-[15px] font-semibold text-white tabular-nums">
              {index + 1}
            </span>
            <div className="flex flex-col gap-1 pt-2">
              <h4 className="text-[17px] font-semibold text-ink-strong">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h4>
              <p className="text-[15px] leading-relaxed text-muted-warm">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        to={link.to}
        className="group mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-full text-[15px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        {link.label}
        <ArrowRightIcon className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
      </Link>
    </article>
  )
}

function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="bg-surface py-16 md:py-24">
      <div className="page-container">
        <div className="flex flex-col gap-3">
          <p className={eyebrow}>Key features</p>
          <h2 id="features-heading" className={sectionHeading}>
            Built for how events are planned in Pakistan
          </h2>
          <p className={sectionLead}>Everything a family needs to choose with confidence, and everything a venue needs to run its calendar.</p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((feature) => {
            const FeatureIcon = FEATURE_ICONS[feature.icon]
            return (
              <li key={feature.title} className="flex flex-col gap-4 rounded-[24px] border border-line bg-white p-6 transition-shadow duration-200 hover:shadow-card">
                <span className="grid size-12 place-items-center rounded-2xl bg-rose text-primary">
                  <FeatureIcon />
                </span>
                <h3 className="font-heading text-[19px] font-semibold text-ink-strong">{feature.title}</h3>
                <p className="text-[15px] leading-relaxed text-muted-warm">{feature.text}</p>
              </li>
            )
          })}
        </ul>

        <p className="mt-8 flex items-start gap-2 text-[14px] leading-relaxed text-muted-warm">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          Every listing is approved by our team and every photo is checked for authenticity before customers see it.
        </p>
      </div>
    </section>
  )
}

function Team() {
  return (
    <section id="team" aria-labelledby="team-heading" className="page-container py-16 md:py-24">
      <div className="flex flex-col gap-3">
        <p className={eyebrow}>Our team</p>
        <h2 id="team-heading" className={sectionHeading}>
          The people behind MarkieSharkie
        </h2>
        <p className={sectionLead}>MarkieSharkie is our Final Year Project at FAST NUCES, Chiniot-Faisalabad campus.</p>
      </div>

      <ul className="mt-10 grid gap-6 sm:grid-cols-3">
        {TEAM.map((member) => (
          <li key={member.name} className="flex flex-col gap-4">
            {member.photo ? (
              <img
                src={member.photo}
                alt={`Portrait of ${member.name}`}
                width="600"
                height="600"
                loading="lazy"
                className="aspect-[4/3] w-full rounded-[24px] object-cover"
              />
            ) : (
              <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[24px] bg-rose">
                <span aria-hidden="true" className="font-heading text-[64px] font-semibold text-primary/70">
                  {member.name.charAt(0)}
                </span>
                <span className="absolute bottom-4 rounded-full bg-white/80 px-3 py-1 text-[12px] font-medium text-muted-warm">Photo coming soon</span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-[20px] font-semibold text-ink-strong">{member.name}</h3>
              {member.role && <p className="text-[15px] text-muted-warm">{member.role}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="border-t border-line">
      <div className="page-container grid gap-10 py-16 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <div className="flex flex-col gap-3">
          <p className={eyebrow}>FAQ</p>
          <h2 id="faq-heading" className={sectionHeading}>
            Frequently asked questions
          </h2>
          <p className={sectionLead}>Still unsure? Ask our AI assistant with the Ask AI button, any time.</p>
        </div>

        {/* Native <details>: keyboard and screen reader support for free, and works before JS loads. */}
        <div className="flex flex-col border-t border-line">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group border-b border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-semibold text-ink-strong hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDownIcon className="size-5 shrink-0 text-primary group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200" />
              </summary>
              <p className="max-w-[65ch] pb-6 text-[15px] leading-relaxed text-muted-warm">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function ListYourVenue() {
  return (
    <section aria-labelledby="cta-heading" className="page-container pb-16 md:pb-24">
      <div className="relative grid items-center gap-8 overflow-hidden rounded-[30px] bg-primary px-6 py-10 text-white sm:px-10 md:py-14 lg:grid-cols-[1fr_auto] lg:px-14">
        {/* Soft rings in the corner, purely decorative. */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border-[40px] border-white/5" />
        <div className="relative flex flex-col gap-3">
          <h2 id="cta-heading" className="font-heading text-[28px] font-semibold leading-tight text-balance sm:text-[36px]">
            Own a marquee or banquet hall?
          </h2>
          <p className="max-w-[58ch] text-[16px] leading-relaxed text-white/85">
            List your venue on MarkieSharkie and reach families planning events in your city. Manage your calendar, bookings and payments from
            one dashboard.
          </p>
        </div>
        <Link
          to="/host"
          className="relative inline-flex min-h-12 w-fit items-center gap-2 rounded-[20px] bg-white px-6 text-[15px] font-semibold text-primary transition-colors hover:bg-blush focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          List your venue
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </section>
  )
}

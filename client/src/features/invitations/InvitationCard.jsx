import { inviteEventType } from './options.js'
import { formatContact, formatLongDate, formatTimeRange } from './format.js'
import { normalizePkMobile } from '../../lib/phone.js'

// The invitation card in its four designs. Everything is sized in container units (cqi), so one component serves
// the template thumbnails, the live preview, the full card, the PNG download and the guest page.
// Guest-typed text gets dir="auto" and every font stack falls back to Noto Nastaliq Urdu, so names and messages
// written in Urdu render properly in any design. Fonts load through <InviteFonts />.
//
// `qr`: a data URL (shows the QR), 'pending' (dashed placeholder) or null (no QR block, e.g. the guest page).
// `titleAs`: the title's element (h1 on the guest page, p inside the template picker's labels).

const SERIF = "'Cormorant Garamond', 'Noto Nastaliq Urdu', Georgia, serif"
const SCRIPT = "'Great Vibes', 'Noto Nastaliq Urdu', 'Cormorant Garamond', cursive"
const SANS = "'DM Sans', 'Noto Nastaliq Urdu', ui-sans-serif, system-ui, sans-serif"
const URDU = "'Noto Nastaliq Urdu', 'Cormorant Garamond', serif"

const DESIGNS = { classic: Classic, floral: Floral, modern: Modern, mehndi: Mehndi }

export default function InvitationCard({ card, qr = null, titleAs = 'h2', className = '' }) {
  const Design = DESIGNS[card.template] ?? Classic
  const view = {
    title: card.title?.trim() || 'Your event name',
    hostNames: card.hostNames?.trim() || 'The host families',
    message: card.message?.trim() ?? '',
    type: inviteEventType(card.eventType),
    date: formatLongDate(card.eventDate),
    time: formatTimeRange(card.startTime, card.endTime),
    venue: card.venueName,
    hall: card.hallName,
    address: card.venueAddress,
    rsvpBy: card.rsvpBy ? formatLongDate(card.rsvpBy) : '',
    contact: formatContact(normalizePkMobile(card.contactPhone ?? '') ?? '') || card.contactPhone?.trim() || '',
    empty: { title: !card.title?.trim(), hostNames: !card.hostNames?.trim() },
  }
  return (
    <div className={`@container w-full ${className}`}>
      <Design view={view} qr={qr} TitleTag={titleAs} />
    </div>
  )
}

// Placeholder text (nothing typed yet) is dimmed so the host sees what still needs filling in.
const dim = (empty) => (empty ? { opacity: 0.55 } : undefined)

function QrBlock({ qr, small = false, className = 'mt-[5cqi]' }) {
  if (!qr) return null
  const size = small ? 'size-[20cqi]' : 'size-[24cqi]'
  return (
    <div className={`flex flex-col items-center gap-[1.5cqi] ${className}`}>
      {qr === 'pending' ? (
        <div className={`flex ${size} items-center justify-center rounded-[2cqi] border-2 border-dashed border-current p-[2cqi] text-center text-[2.4cqi] leading-tight opacity-70`}>QR appears after you generate</div>
      ) : (
        <img src={qr} alt="QR code that opens this invitation" className={`${size} rounded-[2cqi] bg-white p-[1.2cqi]`} width="240" height="240" />
      )}
      <p className={`${small ? 'text-[2.2cqi]' : 'text-[2.5cqi]'} font-medium uppercase tracking-[0.18em]`}>Scan to view &amp; reply</p>
    </div>
  )
}

function Footer({ view, className = '' }) {
  if (!view.rsvpBy && !view.contact) return null
  return (
    <div className={`mt-[4cqi] text-[max(11px,3.1cqi)] leading-snug ${className}`}>
      {view.rsvpBy && <p>Kindly reply by {view.rsvpBy}</p>}
      {view.contact && <p className="tabular-nums">Contact {view.contact}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Classic maroon & gold

function Classic({ view, qr, TitleTag }) {
  const gold = '#e0c27e'
  return (
    <article className="relative flex aspect-[5/7] flex-col p-[4.5cqi] text-center" style={{ background: 'radial-gradient(120% 85% at 50% 0%, #93203f 0%, #6e132b 55%, #4b0b1d 100%)', color: '#f7ecd8', fontFamily: SERIF }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {[0, 90, 180, 270].map((turn) => (
          <CornerFlourish key={turn} turn={turn} color={gold} />
        ))}
      </div>
      <div className="relative flex flex-1 flex-col border p-[1.2cqi]" style={{ borderColor: `${gold}cc` }}>
        <div className="flex flex-1 flex-col items-center justify-center border px-[7cqi] py-[8cqi]" style={{ borderColor: `${gold}80` }}>
          <p className="text-[2.7cqi] uppercase tracking-[0.3em]" style={{ color: gold }}>
            {view.type.label}
          </p>
          <p dir="auto" className="mt-[4cqi] text-[3.6cqi] font-semibold uppercase leading-snug tracking-[0.14em]" style={dim(view.empty.hostNames)}>
            {view.hostNames}
          </p>
          <p className="mt-[1.5cqi] text-[3.3cqi] italic">request the pleasure of your company at</p>
          <TitleTag dir="auto" className="mt-[3cqi] text-[9cqi] font-medium italic leading-[1.05] text-balance [overflow-wrap:anywhere]" style={{ color: '#fbf3e3', ...dim(view.empty.title) }}>
            {view.title}
          </TitleTag>
          <GoldRule color={gold} />
          <p className="text-[4.2cqi] font-semibold">{view.date}</p>
          <p className="mt-[0.5cqi] text-[3.6cqi]">{view.time}</p>
          <p className="mt-[3.5cqi] text-[4cqi] font-semibold" style={{ color: gold }}>
            {view.venue}
          </p>
          <p className="text-[3.3cqi]">{view.hall}</p>
          <p className="mt-[0.5cqi] text-[max(11px,3.1cqi)] opacity-85">{view.address}</p>
          {view.message && (
            <p dir="auto" className="mt-[4cqi] max-w-[60cqi] text-[3.4cqi] italic leading-snug [overflow-wrap:anywhere]">
              “{view.message}”
            </p>
          )}
          <Footer view={view} className="opacity-90" />
          <QrBlock qr={qr} />
        </div>
      </div>
    </article>
  )
}

function CornerFlourish({ turn, color }) {
  const position = { 0: 'left-0 top-0', 90: 'right-0 top-0', 180: 'right-0 bottom-0', 270: 'left-0 bottom-0' }[turn]
  return (
    <svg viewBox="0 0 100 100" className={`absolute size-[22cqi] ${position}`} style={{ transform: `rotate(${turn}deg)` }} fill="none" stroke={color} strokeWidth="1.4">
      <path d="M8 60 C8 30 30 8 60 8" />
      <path d="M14 44 C18 26 26 18 44 14" opacity="0.7" />
      <path d="M8 60 c6 -2 10 2 8 8 M60 8 c-2 6 2 10 8 8" />
      <circle cx="22" cy="22" r="3.2" fill={color} stroke="none" />
      <path d="M22 30 q-6 6 -2 14 M30 22 q6 -6 14 -2" opacity="0.8" />
    </svg>
  )
}

function GoldRule({ color }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 12" className="my-[4cqi] h-[2.6cqi] w-[44cqi]" fill="none" stroke={color} strokeWidth="1">
      <path d="M0 6 H82 M118 6 H200" />
      <path d="M100 1 L106 6 L100 11 L94 6 Z" fill={color} />
      <circle cx="88" cy="6" r="1.6" fill={color} stroke="none" />
      <circle cx="112" cy="6" r="1.6" fill={color} stroke="none" />
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Floral pastel

function Floral({ view, qr, TitleTag }) {
  const rose = '#8a3653'
  return (
    <article className="relative flex aspect-[5/7] flex-col p-[5cqi] text-center" style={{ background: 'linear-gradient(170deg, #fffaf7 0%, #fdf1f1 55%, #f9e6ea 100%)', color: '#5a464c', fontFamily: SERIF }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <FlowerCluster className="absolute -left-[6cqi] -top-[6cqi] size-[48cqi]" />
        <FlowerCluster className="absolute -bottom-[6cqi] -right-[6cqi] size-[48cqi] rotate-180" />
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center rounded-[3cqi] border px-[8cqi] py-[11cqi]" style={{ borderColor: '#e6b9c5' }}>
        <p className="text-[3.3cqi] italic">together with their families</p>
        <p dir="auto" className="mt-[1.5cqi] text-[3.6cqi] font-semibold uppercase leading-snug tracking-[0.16em]" style={{ color: rose, ...dim(view.empty.hostNames) }}>
          {view.hostNames}
        </p>
        <p className="mt-[1.5cqi] text-[3.3cqi] italic">invite you to celebrate the</p>
        <p className="mt-[1cqi] text-[2.8cqi] font-semibold uppercase tracking-[0.3em]">{view.type.label}</p>
        <TitleTag dir="auto" className="mt-[3cqi] text-[11cqi] leading-[1.15] text-balance [overflow-wrap:anywhere]" style={{ fontFamily: SCRIPT, color: rose, ...dim(view.empty.title) }}>
          {view.title}
        </TitleTag>
        <div aria-hidden="true" className="my-[4cqi] flex items-center gap-[2cqi]">
          <span className="h-px w-[14cqi]" style={{ background: '#e0a9b8' }} />
          <svg viewBox="0 0 20 20" className="size-[3.4cqi]" fill="#e59bb0">
            <path d="M10 2c2 3 2 5 0 8-2-3-2-5 0-8Zm0 16c-2-3-2-5 0-8 2 3 2 5 0 8ZM2 10c3-2 5-2 8 0-3 2-5 2-8 0Zm16 0c-3 2-5 2-8 0 3-2 5-2 8 0Z" />
          </svg>
          <span className="h-px w-[14cqi]" style={{ background: '#e0a9b8' }} />
        </div>
        <p className="text-[4.2cqi] font-semibold text-[#4a3a3f]">{view.date}</p>
        <p className="mt-[0.5cqi] text-[3.6cqi]">{view.time}</p>
        <p className="mt-[3.5cqi] text-[4cqi] font-semibold" style={{ color: rose }}>
          {view.venue}
        </p>
        <p className="text-[3.3cqi]">{view.hall}</p>
        <p className="mt-[0.5cqi] text-[max(11px,3.1cqi)]">{view.address}</p>
        {view.message && (
          <p dir="auto" className="mt-[4cqi] max-w-[60cqi] text-[3.4cqi] italic leading-snug [overflow-wrap:anywhere]">
            {view.message}
          </p>
        )}
        <Footer view={view} />
        <QrBlock qr={qr} />
      </div>
    </article>
  )
}

function FlowerCluster({ className }) {
  return (
    <svg viewBox="0 0 200 200" className={className}>
      <g fill="#a9c1a0" opacity="0.9">
        <path d="M60 120 C40 100 30 80 34 58 C52 70 62 92 60 120Z" />
        <path d="M110 70 C120 48 138 36 160 34 C152 54 134 68 110 70Z" />
        <path d="M120 120 C140 118 158 126 170 142 C148 146 132 138 120 120Z" opacity="0.8" />
      </g>
      <Flower cx={78} cy={78} r={30} petal="#f4bccb" core="#e88aa5" />
      <Flower cx={132} cy={104} r={20} petal="#f8d6c2" core="#eba67f" />
      <Flower cx={58} cy={140} r={15} petal="#f6cdd8" core="#e597ad" />
      <circle cx="150" cy="60" r="4" fill="#f4bccb" />
      <circle cx="100" cy="150" r="3" fill="#f8d6c2" />
      <circle cx="30" cy="100" r="3" fill="#e59bb0" />
    </svg>
  )
}

function Flower({ cx, cy, r, petal, core }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.6} fill={petal} transform={`rotate(${angle})`} />
      ))}
      <circle r={r * 0.28} fill={core} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Modern minimal

function Modern({ view, qr, TitleTag }) {
  return (
    <article className="relative flex aspect-[5/7] flex-col border border-line bg-white p-[9cqi] text-left text-ink" style={{ fontFamily: SANS }}>
      <span aria-hidden="true" className="block h-[1cqi] w-[12cqi] bg-primary" />
      <p className="mt-[6cqi] text-[2.8cqi] font-semibold uppercase tracking-[0.24em] text-primary">{view.type.label}</p>
      <TitleTag dir="auto" className="mt-[2cqi] text-[9.5cqi] font-bold leading-[1.02] tracking-[-0.02em] text-ink-strong text-balance [overflow-wrap:anywhere]" style={dim(view.empty.title)}>
        {view.title}
      </TitleTag>
      <p dir="auto" className="mt-[3cqi] text-[3.6cqi] leading-snug" style={dim(view.empty.hostNames)}>
        Hosted by <span className="font-semibold text-ink-strong">{view.hostNames}</span>
      </p>
      {view.message && (
        <p dir="auto" className="mt-[4cqi] border-l-[0.6cqi] border-primary/70 pl-[3cqi] text-[3.4cqi] leading-relaxed [overflow-wrap:anywhere]">
          {view.message}
        </p>
      )}
      <dl className="mt-auto grid grid-cols-2 gap-x-[5cqi] gap-y-[3.5cqi] border-t border-line pt-[5cqi] text-[3.4cqi]">
        <ModernFact label="Date" value={view.date} />
        <ModernFact label="Time" value={view.time} />
        <ModernFact label="Venue" value={`${view.venue}${view.hall ? `, ${view.hall}` : ''}`} wide />
        <ModernFact label="Address" value={view.address} wide />
      </dl>
      <div className="mt-[5cqi] flex items-end justify-between gap-[4cqi]">
        <Footer view={view} className="mt-0 text-muted-warm" />
        <QrBlock qr={qr} small className="shrink-0" />
      </div>
    </article>
  )
}

function ModernFact({ label, value, wide }) {
  if (!value) return null
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[2.5cqi] font-semibold uppercase tracking-[0.2em] text-muted-warm">{label}</dt>
      <dd className="mt-[0.6cqi] font-medium leading-snug text-ink-strong">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Mehndi / festive, with Urdu lettering

function Mehndi({ view, qr, TitleTag }) {
  const marigold = '#f5b041'
  return (
    <article className="relative flex aspect-[5/7] flex-col px-[7cqi] pb-[8cqi] pt-[14cqi] text-center" style={{ background: 'radial-gradient(110% 80% at 50% 10%, #2a6a41 0%, #1c4a2e 60%, #123421 100%)', color: '#fdf3dc', fontFamily: SERIF }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <Bunting />
        <Mandala className="absolute -bottom-[26cqi] left-1/2 size-[90cqi] -translate-x-1/2 opacity-[0.13]" color={marigold} />
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center">
        <Mandala className="size-[16cqi]" color={marigold} />
        <p lang="ur" dir="rtl" className="mt-[2cqi] text-[3.6cqi] leading-[2]" style={{ fontFamily: URDU, color: '#f7d774' }}>
          بسم اللہ الرحمن الرحیم
        </p>
        <p lang="ur" dir="rtl" className="text-[9cqi] leading-[1.9]" style={{ fontFamily: URDU, color: marigold }}>
          {view.type.urdu}
        </p>
        <p dir="auto" className="text-[3.5cqi] font-semibold uppercase leading-[1.8] tracking-[0.14em]" style={dim(view.empty.hostNames)}>
          {view.hostNames}
        </p>
        <p className="text-[3.3cqi] italic">invite you to the {view.type.label.toLowerCase()} celebration</p>
        <TitleTag dir="auto" className="mt-[2.5cqi] text-[8.5cqi] font-semibold leading-[1.35] text-balance [overflow-wrap:anywhere]" style={{ color: '#fff8e6', ...dim(view.empty.title) }}>
          {view.title}
        </TitleTag>
        <div aria-hidden="true" className="my-[3.5cqi] flex gap-[1.6cqi]">
          {['#f5b041', '#ec6f91', '#f7d774', '#ec6f91', '#f5b041'].map((color, i) => (
            <span key={i} className="size-[1.6cqi] rotate-45" style={{ background: color }} />
          ))}
        </div>
        <p className="text-[4.2cqi] font-semibold">{view.date}</p>
        <p className="mt-[0.5cqi] text-[3.6cqi]">{view.time}</p>
        <p className="mt-[3cqi] text-[4cqi] font-semibold" style={{ color: marigold }}>
          {view.venue}
        </p>
        <p className="text-[3.3cqi]">{view.hall}</p>
        <p className="mt-[0.5cqi] text-[max(11px,3.1cqi)] opacity-85">{view.address}</p>
        {view.message && (
          <p dir="auto" className="mt-[3.5cqi] max-w-[62cqi] text-[3.4cqi] italic leading-[1.9] [overflow-wrap:anywhere]">
            {view.message}
          </p>
        )}
        <Footer view={view} className="opacity-90" />
        <QrBlock qr={qr} />
      </div>
    </article>
  )
}

function Bunting() {
  const colors = ['#f5b041', '#ec6f91', '#f7d774', '#e85d3f']
  const flags = Array.from({ length: 12 }, (_, i) => i)
  return (
    <svg viewBox="0 0 240 40" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[11cqi] w-full">
      <path d="M0 4 Q120 16 240 4" fill="none" stroke="#f7d774" strokeWidth="0.8" />
      {flags.map((i) => {
        const x = 4 + i * 20
        const y = 4 + Math.sin((Math.PI * (x + 8)) / 240) * 9
        return <path key={i} d={`M${x} ${y} L${x + 16} ${y} L${x + 8} ${y + 20} Z`} fill={colors[i % colors.length]} />
      })}
    </svg>
  )
}

function Mandala({ className, color }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className} fill="none" stroke={color} strokeWidth="1.2">
      <circle cx="50" cy="50" r="8" />
      <circle cx="50" cy="50" r="3" fill={color} />
      <circle cx="50" cy="50" r="46" strokeDasharray="2 3" />
      {petals.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <path d="M50 42 C44 32 46 22 50 14 C54 22 56 32 50 42Z" />
          <circle cx="50" cy="9" r="1.6" fill={color} stroke="none" />
          <path d="M50 42 C40 36 34 30 32 22" opacity="0.6" />
        </g>
      ))}
    </svg>
  )
}

// Display fonts for the cards, only on invitation pages. crossOrigin so html-to-image can read and embed them in the
// card PNG. Google serves Noto Nastaliq Urdu split by unicode-range, so it only downloads when Urdu text shows up.
export function InviteFonts() {
  return (
    <link
      rel="stylesheet"
      precedence="default"
      crossOrigin="anonymous"
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Great+Vibes&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap"
    />
  )
}

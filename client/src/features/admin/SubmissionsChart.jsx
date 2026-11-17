import { useEffect, useId, useRef, useState } from 'react'
import { formatShortDate } from './format.js'

// Weekly listings submitted vs approved (12 weeks). Paired columns from one baseline, 2px gap between the pair,
// 4px rounded tops, ≤ 20px wide. Hover or focus a week for exact values; a table view carries the same data.
// Colours are chart tokens validated for colour-blind separation and 3:1 against white (index.css).
const SERIES = [
  { key: 'submitted', label: 'Submitted', color: 'var(--color-chart-submitted)' },
  { key: 'approved', label: 'Approved', color: 'var(--color-chart-approved)' },
]
const HEIGHT = 180
const PAD = { top: 12, right: 8, bottom: 26, left: 28 }

function niceMax(value) {
  if (value <= 4) return 4
  const step = value <= 10 ? 2 : value <= 25 ? 5 : 10
  return Math.ceil(value / step) * step
}

export default function SubmissionsChart({ weeks }) {
  const [active, setActive] = useState(null)
  const [showTable, setShowTable] = useState(false)
  const id = useId()
  // Drawn at the container's real width, so axis text stays 11px on phones instead of scaling down.
  const boxRef = useRef(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const node = boxRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(node)
    return () => observer.disconnect()
  }, [showTable])
  const max = niceMax(Math.max(...weeks.flatMap((w) => [w.submitted, w.approved])))
  const ticks = [0, max / 2, max]
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = plotW / weeks.length
  const bar = Math.min(16, (band - 10) / 2)
  const y = (value) => PAD.top + plotH - (value / max) * plotH
  const total = weeks.reduce((sum, w) => sum + w.submitted, 0)
  const last = weeks.at(-1)
  const summary = `${total} listings submitted over the last ${weeks.length} weeks; ${last.submitted} submitted and ${last.approved} approved this week.`

  // Column with only the top corners rounded (square on the baseline).
  const column = (x, value) => {
    const top = y(value)
    const h = PAD.top + plotH - top
    if (h <= 0) return ''
    const r = Math.min(4, h, bar / 2)
    return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + bar - r}Q${x + bar},${top} ${x + bar},${top + r}V${top + h}Z`
  }

  const activeWeek = active === null ? null : weeks[active]
  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex gap-4 text-[13px] text-ink" aria-label="Legend">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: series.color }} />
              {series.label}
            </li>
          ))}
        </ul>
        <button type="button" aria-expanded={showTable} aria-controls={`${id}-table`} onClick={() => setShowTable((v) => !v)} className="rounded px-1 text-[13px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div id={`${id}-table`} className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <caption className="sr-only">Listings per week</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted-warm">
                <th scope="col" className="py-2 font-semibold">Week of</th>
                <th scope="col" className="py-2 text-right font-semibold">Submitted</th>
                <th scope="col" className="py-2 text-right font-semibold">Approved</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.start} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1.5 text-left font-normal text-ink">{formatShortDate(week.start)}</th>
                  <td className="py-1.5 text-right text-ink-strong">{week.submitted}</td>
                  <td className="py-1.5 text-right text-ink-strong">{week.approved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={boxRef} className="relative">
          <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="group" aria-label={summary} className="h-auto w-full overflow-visible" onMouseLeave={() => setActive(null)}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-muted-warm)" className="tabular-nums">
                  {tick}
                </text>
              </g>
            ))}
            {weeks.map((week, index) => {
              const x0 = PAD.left + index * band + (band - (bar * 2 + 2)) / 2
              const every = width < 480 ? 3 : 2
              const showLabel = (weeks.length - 1 - index) % every === 0
              return (
                <g key={week.start}>
                  {/* Hit target: the whole band, bigger than the bars. */}
                  <rect
                    x={PAD.left + index * band}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill={active === index ? 'var(--color-surface)' : 'transparent'}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    tabIndex={0}
                    role="img"
                    aria-label={`Week of ${formatShortDate(week.start)}: ${week.submitted} submitted, ${week.approved} approved`}
                    className="outline-none focus-visible:stroke-primary"
                    strokeWidth="2"
                  />
                  <path d={column(x0, week.submitted)} fill={SERIES[0].color} pointerEvents="none" />
                  <path d={column(x0 + bar + 2, week.approved)} fill={SERIES[1].color} pointerEvents="none" />
                  {showLabel && (
                    <text x={PAD.left + index * band + band / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted-warm)" pointerEvents="none">
                      {formatShortDate(week.start)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          {activeWeek && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-chip"
              style={{ left: `${Math.min(86, Math.max(14, ((PAD.left + active * band + band / 2) / width) * 100))}%` }}
            >
              <p className="font-semibold whitespace-nowrap text-ink-strong">Week of {formatShortDate(activeWeek.start)}</p>
              {SERIES.map((series) => (
                <p key={series.key} className="flex items-center gap-1.5 whitespace-nowrap text-ink">
                  <span className="size-2 rounded-sm" style={{ background: series.color }} />
                  {series.label} <span className="ml-auto pl-3 font-semibold text-ink-strong tabular-nums">{activeWeek[series.key]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  )
}

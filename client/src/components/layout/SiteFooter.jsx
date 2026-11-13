import { Link } from 'react-router-dom'
import Logo from '../ui/Logo.jsx'
import globeIcon from '../../assets/icons/globe.svg'

const columns = [
  { title: 'Discover', links: [['Venues in Lahore', '/search?location=Lahore'], ['Wedding packages', '/search?eventType=wedding'], ['Planning guide', '/guide']] },
  { title: 'For venues', links: [['List your space', '/owner'], ['Partner standards', '/partners'], ['Host resources', '/hosts']] },
  { title: 'Support', links: [['Help center', '/help'], ['Contact an advisor', '/contact'], ['Trust & safety', '/trust']] },
]

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="page-container flex flex-col gap-[34px] pb-[28px] pt-[42px]">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex w-full max-w-[330px] flex-col gap-3">
            <Logo />
            <p className="text-[12px] leading-[1.5] text-muted-warm">
              Thoughtfully verified venues and local planning support for celebrations across Pakistan.
            </p>
          </div>
  
          {columns.map((column) => (
            <div key={column.title} className="flex w-[170px] flex-col gap-[10px]">
              <h2 className="text-[13px] font-semibold text-ink-strong">{column.title}</h2>
              {column.links.map(([label, to]) => (
                <Link key={label} to={to} className="text-[12px] text-muted-warm hover:text-primary">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
  
        <div className="h-px w-full bg-line" />
  
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-warm">
            © 2026 MarkieSharkie Marketplace · <Link to="/privacy" className="hover:text-primary">Privacy</Link> ·{' '}
            <Link to="/terms" className="hover:text-primary">Terms</Link>
          </p>
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink-strong">
            <img src={globeIcon} alt="" width="15" height="15" />
            <span>English (PK)</span>
            <span>PKR</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

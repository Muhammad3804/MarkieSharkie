import { Link } from 'react-router-dom'
import logoSprite from '../../assets/brand/logo.png'

// The logo file holds the tent and the wordmark side by side; Figma crops each part out of it.
export default function Logo({ className = '' }) {
  return (
    <Link to="/" aria-label="MarkieSharkie home" className={`relative block h-[89px] w-[241px] shrink-0 ${className}`}>
      <span className="absolute left-0 top-0 h-[89px] w-[104px] overflow-hidden">
        <img src={logoSprite} alt="" className="absolute left-[-29.97%] top-[-16.85%] h-[174.16%] w-[154.16%] max-w-none" />
      </span>
      <span className="absolute left-[104px] top-[19px] h-[51px] w-[137px] overflow-hidden">
        <img src={logoSprite} alt="" className="absolute left-[-34.19%] top-[-286.11%] h-[430.56%] w-[165.29%] max-w-none" />
      </span>
    </Link>
  )
}

import { Link } from 'react-router-dom'
import logoSprite from '../../assets/brand/logo.png'

// Just the tent (the login modal's mark), cropped from the same sprite as the full logo.
export function LogoMark({ className = '' }) {
  return (
    <span role="img" aria-label="MarkieSharkie" className={`relative block h-[64px] w-[75px] shrink-0 overflow-hidden ${className}`}>
      <img src={logoSprite} alt="" className="absolute left-[-29.97%] top-[-16.85%] h-[174.16%] w-[154.16%] max-w-none" />
    </span>
  )
}

// The logo file holds the tent and the wordmark side by side; Figma crops each part out of it.
// `link={false}` renders a plain image (e.g. inside the login modal, where leaving the page would be odd).
export default function Logo({ className = '', link = true }) {
  const Root = link ? Link : 'span'
  const rootProps = link ? { to: '/', 'aria-label': 'MarkieSharkie home' } : { role: 'img', 'aria-label': 'MarkieSharkie' }
  return (
    <Root {...rootProps} className={`relative block h-[89px] w-[241px] shrink-0 ${className}`}>
      <span className="absolute left-0 top-0 h-[89px] w-[104px] overflow-hidden">
        <img src={logoSprite} alt="" className="absolute left-[-29.97%] top-[-16.85%] h-[174.16%] w-[154.16%] max-w-none" />
      </span>
      <span className="absolute left-[104px] top-[19px] h-[51px] w-[137px] overflow-hidden">
        <img src={logoSprite} alt="" className="absolute left-[-34.19%] top-[-286.11%] h-[430.56%] w-[165.29%] max-w-none" />
      </span>
    </Root>
  )
}

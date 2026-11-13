import { Link } from 'react-router-dom'

const variants = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  outline: 'border border-primary text-primary hover:bg-primary/5',
}

// Pill button. Renders a router Link when `to` is set, otherwise a <button>.
export default function Button({ variant = 'primary', to, className = '', ...props }) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-[20px] text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${variants[variant]} ${className}`
  if (to) return <Link to={to} className={classes} {...props} />
  return <button type="button" className={classes} {...props} />
}

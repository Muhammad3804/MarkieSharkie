import Logo from '../../components/ui/Logo.jsx'

// Slim header for the booking flow and its confirmation screen (no site nav, like the host wizard).
export default function FlowHeaderShell({ children }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-screen-2xl items-center justify-between gap-3 px-4 sm:h-[88px] sm:px-6 lg:px-12">
        <div className="h-[53px] w-[60px] shrink-0 overflow-hidden sm:w-[145px]">
          <Logo className="origin-top-left scale-[0.6]" />
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">{children}</div>
      </div>
    </header>
  )
}

import { Outlet, ScrollRestoration } from 'react-router-dom'
import SiteHeader from '../../components/layout/SiteHeader.jsx'
import SiteFooter from '../../components/layout/SiteFooter.jsx'
import ChatWidget from '../../features/chatbot/ChatWidget.jsx'

export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="@container flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <ChatWidget />
      {/* New navigation -> scroll to top; back/forward restores. Venue tab links use preventScrollReset so they
          don't jump. (Don't key this by pathname: that restores an old position when a venue is revisited.) */}
      <ScrollRestoration />
    </div>
  )
}

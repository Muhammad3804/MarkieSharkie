import { Outlet } from 'react-router-dom'
import SiteHeader from '../../components/layout/SiteHeader.jsx'
import SiteFooter from '../../components/layout/SiteFooter.jsx'

export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="@container flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

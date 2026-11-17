import { lazy, Suspense } from 'react'

// /admin, lazy-loaded so none of the admin code ships with the public pages (route list in app/router.jsx).
// TODO(auth): wrap AdminShellRoute in <RequireRole role="admin"> once auth exists: signed-out visitors go to the
// login page, other roles get a 403 page. That guard is UI only; the server checks role = admin on every
// /api/admin request.
const AdminLayout = lazy(() => import('../features/admin/AdminLayout.jsx'))
const PAGES = {
  overview: lazy(() => import('../pages/admin/Overview.jsx')),
  approvals: lazy(() => import('../pages/admin/Approvals.jsx')),
  review: lazy(() => import('../pages/admin/ApprovalReview.jsx')),
  images: lazy(() => import('../pages/admin/FlaggedImages.jsx')),
  venues: lazy(() => import('../pages/admin/Venues.jsx')),
  users: lazy(() => import('../pages/admin/Users.jsx')),
  reports: lazy(() => import('../pages/admin/Reports.jsx')),
  audit: lazy(() => import('../pages/admin/AuditLog.jsx')),
  settings: lazy(() => import('../pages/admin/Settings.jsx')),
}

export function AdminShellRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading admin" className="min-h-dvh bg-app" />}>
      <AdminLayout />
    </Suspense>
  )
}

// One admin section; `page` is a key of PAGES.
export function AdminPageRoute({ page }) {
  const Page = PAGES[page]
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading" className="min-h-[50vh]" />}>
      <Page />
    </Suspense>
  )
}

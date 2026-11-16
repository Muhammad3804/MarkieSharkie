import { Navigate } from 'react-router-dom'
import { loadDraft } from '../api/host.js'

// /host/new without a step: reopen the saved draft where the host left off, or start at the first screen.
export default function HostResumeRedirect() {
  return <Navigate to={`/host/new/${loadDraft()?.lastStep ?? 'about'}`} replace />
}

import { useEffect, useId, useRef, useState } from 'react'
import { getImageDetectionStatus, testImageDetection } from '../../api/admin.js'
import { Button, Card, StatusBadge } from './ui.jsx'

const MAX_BYTES = 5 * 1024 * 1024
const percent = (score) => `${Math.round(score * 100)}%`

// REQ-9 demo panel: shows which AI check is running (live Sightengine or the fake detector) and lets the admin run
// one photo through it with the same rules real uploads get. Nothing is stored except an audit row.
export default function AiCheckTester() {
  const [status, setStatus] = useState(null) // detector info, or { error }
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [state, setState] = useState({ busy: false, result: null, error: '' })
  const inputId = useId()

  useEffect(() => {
    let live = true
    getImageDetectionStatus()
      .then((info) => live && setStatus(info))
      .catch(() => live && setStatus({ error: true }))
    return () => {
      live = false
    }
  }, [])

  // The preview URL is made when a photo is picked and freed when it changes or the panel unmounts.
  const previewRef = useRef('')
  useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), [])
  function showPreview(chosen) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = chosen ? URL.createObjectURL(chosen) : ''
    setPreview(previewRef.current)
  }

  function pick(event) {
    const chosen = event.target.files?.[0] ?? null
    setState({ busy: false, result: null, error: '' })
    if (chosen && !['image/jpeg', 'image/png'].includes(chosen.type)) {
      setFile(null)
      showPreview(null)
      setState({ busy: false, result: null, error: 'Choose a JPEG or PNG photo.' })
      return
    }
    if (chosen && chosen.size > MAX_BYTES) {
      setFile(null)
      showPreview(null)
      setState({ busy: false, result: null, error: 'Choose a photo up to 5 MB.' })
      return
    }
    setFile(chosen)
    showPreview(chosen)
  }

  async function run() {
    if (!file || state.busy) return
    setState({ busy: true, result: null, error: '' })
    try {
      const result = await testImageDetection(file)
      setState({ busy: false, result, error: '' })
    } catch (error) {
      setState({ busy: false, result: null, error: error?.message || 'The AI check didn’t answer. Try again.' })
    }
  }

  const { result } = state
  return (
    <Card
      title="Test the AI image check"
      className="mb-5"
      actions={
        status &&
        !status.error && (
          <StatusBadge
            status={status.live ? 'approved' : 'pending'}
            label={status.live ? 'Live · Sightengine' : 'Demo mode · fake detector'}
          />
        )
      }
    >
      <p className="max-w-[70ch] text-[14px] leading-relaxed text-muted-warm">
        Upload any photo to see what the AI check says about it. It uses the same detector and rules as owners’ uploads:
        a photo scoring {status?.threshold != null ? `${status.threshold}%` : 'the threshold'} or more is rejected as AI-generated (change it in Settings).
        {status && !status.error && !status.live && ' No Sightengine keys are set, so the demo detector scores every photo 2%.'}
        {' '}Nothing is saved except an entry in the audit log.
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-3 sm:w-64">
          <label htmlFor={inputId} className="text-[14px] font-medium text-ink-strong">
            Photo (JPEG or PNG, up to 5 MB)
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png"
            onChange={pick}
            className="block w-full cursor-pointer text-[13px] text-ink file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-ink-strong hover:file:bg-line"
          />
          {preview && file && <img src={preview} alt={`Selected: ${file.name}`} className="aspect-[4/3] w-full rounded-lg object-cover" />}
          <Button icon="sparkles" busy={state.busy} disabled={!file || state.busy} onClick={run}>
            {state.busy ? 'Checking…' : 'Run AI check'}
          </Button>
        </div>

        <div aria-live="polite" className="min-w-0 flex-1">
          {state.error && <p className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-[14px] text-danger">{state.error}</p>}
          {result && (
            <div className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={result.verdict === 'accepted' ? 'approved' : 'rejected'} label={result.verdict === 'accepted' ? 'Accepted' : 'Rejected as AI-generated'} />
                <span className="text-[14px] text-ink">
                  {result.verdict === 'accepted'
                    ? 'This photo would be accepted and published once the venue is approved.'
                    : 'This photo would be rejected and kept out of the gallery (you can still override it).'}
                </span>
              </div>
              <p className="mt-4 text-[13px] font-medium text-muted-warm">AI-generated score</p>
              <p className="font-heading text-[32px] font-semibold leading-tight text-ink-strong">{percent(result.score)}</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface" role="img" aria-label={`Score ${percent(result.score)} out of 100%`}>
                <div className={`h-full rounded-full ${result.verdict === 'accepted' ? 'bg-success' : 'bg-danger'}`} style={{ width: percent(Math.max(result.score, 0.01)) }} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
                <div><dt className="text-muted-warm">Detector</dt><dd className="font-medium text-ink-strong">{result.live ? 'Sightengine (live)' : 'Fake (demo)'}</dd></div>
                <div><dt className="text-muted-warm">Answered in</dt><dd className="font-medium text-ink-strong">{(result.durationMs / 1000).toFixed(1)} s</dd></div>
                <div><dt className="text-muted-warm">Threshold</dt><dd className="font-medium text-ink-strong">{result.threshold}%</dd></div>
                <div><dt className="text-muted-warm">Score</dt><dd className="font-medium text-ink-strong tabular-nums">{result.scorePercent}%</dd></div>
              </dl>
            </div>
          )}
          {!state.error && !result && (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted-warm">
              Tip for the demo: try a real venue photo, then an AI-generated image.
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

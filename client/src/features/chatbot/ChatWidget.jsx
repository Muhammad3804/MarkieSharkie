import { useEffect, useRef, useState } from 'react'
import { LayoutGroup, MotionConfig } from 'motion/react'
import { sendMessage } from '../../api/chat.js'
import AskAiButton from './AskAiButton.jsx'
import ChatPanel from './ChatPanel.jsx'

// Launcher and panel share a layoutId, so opening morphs the button into the panel and closing morphs
// it back. Closing is two steps: fade the panel contents out, then unmount the panel (which starts the
// morph). It's non-modal: the page behind stays usable on desktop, like most chat widgets.
// reducedMotion="user" skips the morph (size/position) for people who ask for less motion; fades remain.
export default function ChatWidget() {
  const [phase, setPhase] = useState('closed') // 'closed' | 'open' | 'closing'
  const [hasOpened, setHasOpened] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const launcherRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const restoreFocus = useRef(false)
  // Counter instead of crypto.randomUUID, which only exists on HTTPS/localhost (not when testing from a phone on the LAN).
  const nextId = useRef(0)

  function openChat() {
    setPhase('open')
    setHasOpened(true)
  }

  // Only hand focus back to the launcher if it was inside the panel, so Esc pressed
  // elsewhere on the page doesn't steal focus.
  function closeChat() {
    if (phase !== 'open') return
    restoreFocus.current = panelRef.current?.contains(document.activeElement) ?? false
    setPhase('closing')
  }

  async function handleSend() {
    const text = draft.trim()
    if (!text) return
    const history = messages
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text, sentAt: new Date() }])
    setDraft('')
    try {
      await sendMessage({ message: text, history })
    } catch (error) {
      console.error('[chat] sendMessage failed', error)
    }
  }

  useEffect(() => {
    if (phase === 'closed' && restoreFocus.current) {
      restoreFocus.current = false
      launcherRef.current?.focus({ preventScroll: true })
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'open') return
    function handleKeyDown(event) {
      if (event.key === 'Escape') closeChat()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <MotionConfig reducedMotion="user">
      {/* No AnimatePresence on purpose: it keeps the outgoing element mounted, so the button and panel
          crossfade as two overlapping boxes instead of one element morphing. The close fade-out is
          handled by the 'closing' phase instead. */}
      <LayoutGroup>
        {phase === 'closed' ? (
          <AskAiButton key="launcher" ref={launcherRef} onClick={openChat} pulse={!hasOpened} fadeContent={hasOpened} />
        ) : (
          <ChatPanel
            key="panel"
            ref={panelRef}
            closing={phase === 'closing'}
            onClose={closeChat}
            onContentShown={() => inputRef.current?.focus({ preventScroll: true })}
            onContentHidden={() => setPhase('closed')}
            messages={messages}
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            inputRef={inputRef}
          />
        )}
      </LayoutGroup>
    </MotionConfig>
  )
}

import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { CHAT_LAYOUT_ID, contentIn, contentOut, openMorph } from './morph.js'
import { formatTime } from '../../lib/format.js'
import botIcon from '../../assets/icons/bot.svg'
import botWhiteIcon from '../../assets/icons/bot-white.svg'
import onlineDotIcon from '../../assets/icons/online-dot.svg'
import ellipsisIcon from '../../assets/icons/ellipsis.svg'
import closeIcon from '../../assets/icons/close.svg'
import zapIcon from '../../assets/icons/zap.svg'
import arrowRightIcon from '../../assets/icons/arrow-right.svg'

// Chat panel from Figma (file zEl0W4jI3xx9Gm2L8eKVan, node 160:113). UI only: no assistant replies yet.
// Conversation state lives in ChatWidget so it survives the panel unmounting when it morphs back.
const ASSISTANT = 'Marquee Assistant'
const prompts = ['Guest count', 'Food', 'Price range']

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function AssistantGroup({ children }) {
  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0 pt-6">
        <img src={botIcon} alt="" width="30" height="30" className="m-px" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p className="text-[11px] text-chat-meta">{ASSISTANT}</p>
        {children}
      </div>
    </div>
  )
}

function Bubble({ children }) {
  return <p className="max-w-[288px] rounded-[24px] bg-white px-[15px] py-[11px] text-[14px] leading-5 text-chat-text">{children}</p>
}

export default function ChatPanel({ ref, closing, onClose, onContentHidden, onContentShown, messages, draft, onDraftChange, onSend, inputRef }) {
  const listRef = useRef(null)
  const hasScrolled = useRef(false)
  const canSend = draft.trim().length > 0

  // Keep the newest message in view; jump straight there when the panel (re)opens.
  useEffect(() => {
    const list = listRef.current
    if (!list || messages.length === 0) return
    const smooth = hasScrolled.current && !prefersReducedMotion()
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    hasScrolled.current = true
  }, [messages])

  function handleSubmit(event) {
    event.preventDefault()
    onSend()
  }

  function applyPrompt(label) {
    onDraftChange(`${label}: `)
    inputRef.current?.focus()
  }

  return (
    <motion.section
      ref={ref}
      layoutId={CHAT_LAYOUT_ID}
      transition={{ layout: openMorph }}
      style={{ borderRadius: 12 }}
      id="chat-panel"
      role="dialog"
      aria-labelledby="chat-panel-title"
      className="fixed inset-3 z-50 flex flex-col overflow-hidden bg-white font-chat shadow-panel sm:inset-auto sm:bottom-6 sm:right-4 sm:h-[min(584px,calc(100dvh-3rem))] sm:w-[380px] lg:right-[89px]"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={closing ? contentOut : contentIn}
        onAnimationComplete={() => (closing ? onContentHidden() : onContentShown())}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex h-[60px] shrink-0 items-center gap-3 bg-primary px-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[24px] border border-white bg-primary">
            <img src={botWhiteIcon} alt="" width="26" height="26" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="chat-panel-title" className="text-[15px] font-bold text-white">{ASSISTANT}</h2>
            <p className="flex items-center gap-1 text-[11px] text-accent">
              <img src={onlineDotIcon} alt="" width="7" height="7" />
              Online Now
            </p>
          </div>
          {/* Options menu isn't designed yet, so the icon is decorative for now. */}
          <img src={ellipsisIcon} alt="" width="24" height="24" className="shrink-0" />
          <button type="button" aria-label="Close chat" onClick={onClose} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-white">
            <img src={closeIcon} alt="" width="24" height="24" />
          </button>
        </header>

        <div ref={listRef} role="log" aria-label="Conversation" className="flex flex-1 flex-col overflow-y-auto px-3 py-[18px]">
          <AssistantGroup>
            <Bubble>Hi! Let’s find your perfect marquee.</Bubble>
            <Bubble>Tell me your requirements: guest count, food preference and price range.</Bubble>
            <div className="flex flex-wrap gap-1.5">
              {prompts.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyPrompt(label)}
                  className="rounded-[24px] border border-accent px-3 py-[9px] text-[12px] text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {label}
                </button>
              ))}
            </div>
          </AssistantGroup>

          {messages.map((message, index) => {
            // 4px between consecutive messages from the same sender, 20px when the sender changes
            // (the greeting above counts as the assistant).
            const previousRole = index === 0 ? 'assistant' : messages[index - 1].role
            return (
              <div
                key={message.id}
                className={`flex max-w-[284px] flex-col self-end rounded-[24px] bg-primary px-[15px] py-[11px] text-[14px] leading-5 text-white ${previousRole === message.role ? 'mt-1' : 'mt-5'}`}
              >
                <p className="whitespace-pre-wrap break-words">
                  <span className="sr-only">You: </span>
                  {message.text}
                </p>
                <time dateTime={message.sentAt.toISOString()} className="mt-0.5 self-end text-[10px] leading-3 text-white/75">
                  {formatTime(message.sentAt)}
                </time>
              </div>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-[50px] shrink-0 items-center gap-3 border-t border-accent px-3 py-2 focus-within:border-primary">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Reply to Marquee Assistant…"
            aria-label="Message"
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-chat-text outline-none placeholder:text-chat-placeholder"
          />
          <span className="flex shrink-0 items-center gap-1 text-[12px] text-primary">
            <img src={zapIcon} alt="" width="13" height="13" />
            Marquee AI
          </span>
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <img src={arrowRightIcon} alt="" width="16" height="16" />
          </button>
        </form>
      </motion.div>
    </motion.section>
  )
}

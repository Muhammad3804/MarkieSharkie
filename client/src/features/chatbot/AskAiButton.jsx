import { motion } from 'motion/react'
import { CHAT_LAYOUT_ID, closeMorph, labelIn } from './morph.js'
import botIcon from '../../assets/icons/bot.svg'

// Floating launcher for the chat assistant (REQ-27). It morphs into the chat panel (shared layoutId).
// `pulse` shows a glow ring until the chat is first opened; `fadeContent` fades the label back in after
// the panel has morphed back into the button.
// `compact` (detail pages): an icon-only circle hugging the right edge that grows left into the full pill on
// hover or keyboard focus. Pure CSS (label max-width + opacity), so motion's layout morph isn't involved and
// opens from whichever size the button is at. Tailwind's hover: only applies on hover-capable devices, so
// touch screens keep the circle and a tap just opens the chat.
export default function AskAiButton({ ref, onClick, pulse, fadeContent, compact = false }) {
  return (
    <motion.button
      ref={ref}
      layoutId={CHAT_LAYOUT_ID}
      transition={{ layout: closeMorph }}
      style={{ borderRadius: compact ? 32 : 24 }}
      type="button"
      onClick={onClick}
      aria-label="Ask AI for help"
      aria-expanded={false}
      aria-controls="chat-panel"
      className={`group fixed bottom-6 right-4 z-50 flex items-center border border-accent bg-white py-4 text-[15px] font-semibold text-primary shadow-launcher hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        compact
          ? 'px-4 transition-[padding,background-color] duration-250 ease-out hover:px-[22px] focus-visible:px-[22px] motion-reduce:transition-none'
          : 'px-[22px] lg:right-[89px]'
      }`}
    >
      {pulse && <span aria-hidden className="pointer-events-none absolute inset-0 animate-glow rounded-[inherit] motion-reduce:animate-none" />}
      <motion.span
        initial={fadeContent ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={labelIn}
        className={`flex items-center ${compact ? '' : 'gap-3'}`}
      >
        <img src={botIcon} alt="" width="30" height="30" />
        <span
          className={
            compact
              ? 'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,margin,opacity] duration-250 ease-out group-hover:ml-3 group-hover:max-w-[150px] group-hover:opacity-100 group-focus-visible:ml-3 group-focus-visible:max-w-[150px] group-focus-visible:opacity-100 motion-reduce:transition-none'
              : undefined
          }
        >
          Ask AI for help!
        </span>
      </motion.span>
    </motion.button>
  )
}

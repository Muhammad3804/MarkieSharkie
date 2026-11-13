import { motion } from 'motion/react'
import { CHAT_LAYOUT_ID, closeMorph, labelIn } from './morph.js'
import botIcon from '../../assets/icons/bot.svg'

// Floating launcher for the chat assistant (REQ-27). It morphs into the chat panel (shared layoutId).
// `pulse` shows a glow ring until the chat is first opened; `fadeContent` fades the label back in after
// the panel has morphed back into the button.
export default function AskAiButton({ ref, onClick, pulse, fadeContent }) {
  return (
    <motion.button
      ref={ref}
      layoutId={CHAT_LAYOUT_ID}
      transition={{ layout: closeMorph }}
      style={{ borderRadius: 24 }}
      type="button"
      onClick={onClick}
      aria-expanded={false}
      aria-controls="chat-panel"
      className="fixed bottom-6 right-4 z-50 flex items-center gap-3 border border-accent bg-white px-[22px] py-4 text-[15px] font-semibold text-primary shadow-launcher hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:right-[89px]"
    >
      {pulse && <span aria-hidden className="pointer-events-none absolute inset-0 animate-glow rounded-[inherit] motion-reduce:animate-none" />}
      <motion.span
        initial={fadeContent ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={labelIn}
        className="flex items-center gap-3"
      >
        <img src={botIcon} alt="" width="30" height="30" />
        Ask AI for help!
      </motion.span>
    </motion.button>
  )
}

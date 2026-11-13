import botIcon from '../../assets/icons/bot.svg'

// Floating launcher for the chat assistant (REQ-27). The chat panel isn't built yet, so `onClick` is optional.
export default function AskAiButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-4 z-30 flex items-center gap-[10px] rounded-[24px] border border-accent bg-white px-[18px] py-[14px] text-[14px] font-semibold text-primary drop-shadow-float hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:right-[89px]"
    >
      <img src={botIcon} alt="" width="30" height="30" />
      Ask AI for help!
    </button>
  )
}

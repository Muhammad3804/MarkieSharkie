// The launcher and the panel share this layoutId (inside one LayoutGroup), so motion morphs one into the other.
export const CHAT_LAYOUT_ID = 'ask-ai-chat'

const ease = [0.32, 0.72, 0, 1]

// The element that mounts runs the morph: the panel when opening, the launcher when closing.
export const openMorph = { type: 'tween', duration: 0.5, ease }
export const closeMorph = { type: 'tween', duration: 0.4, ease }

// Panel contents fade in 0.2s after the morph starts, and fade out before it starts on close.
export const contentIn = { duration: 0.25, delay: 0.2 }
export const contentOut = { duration: 0.15 }

// Launcher label fades back in as the closing morph settles.
export const labelIn = { duration: 0.2, delay: 0.25 }

import { createContext, useContext } from 'react'

// show(message, { tone: 'success' | 'error', action }) from the nearest ToastProvider (toast.jsx).
export const ToastContext = createContext(() => {})

export function useToast() {
  return useContext(ToastContext)
}

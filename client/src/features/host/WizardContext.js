import { createContext, useContext } from 'react'

// { draft, update(recipe), errorFor(path), touch(path) } for the current step. See pages/HostWizard.jsx.
export const WizardContext = createContext(null)

export function useWizard() {
  const value = useContext(WizardContext)
  if (!value) throw new Error('useWizard must be used inside the host wizard')
  return value
}

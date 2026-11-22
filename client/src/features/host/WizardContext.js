import { createContext, useContext } from 'react'

// { draft, update(recipe), errorFor(path), touch(path) } for the current step. See pages/HostWizard.jsx.
export const WizardContext = createContext(null)

// 1 in the wizard (one step per page), 2 in the owner's listing editor (several steps under the page's h1).
export const HeadingLevelContext = createContext(1)

export function useWizard() {
  const value = useContext(WizardContext)
  if (!value) throw new Error('useWizard must be used inside the host wizard')
  return value
}

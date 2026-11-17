import { createContext, useContext, useEffect } from 'react'

// Pages set the last breadcrumb (e.g. the venue name on the review page); AdminLayout renders it.
export const CrumbContext = createContext(() => {})

export function useCrumb(label) {
  const setCrumb = useContext(CrumbContext)
  useEffect(() => {
    setCrumb(label)
    return () => setCrumb(null)
  }, [label, setCrumb])
}

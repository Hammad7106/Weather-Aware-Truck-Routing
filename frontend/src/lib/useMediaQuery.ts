import { useSyncExternalStore } from 'react'

/** Whether a CSS media query currently matches; updates live (e.g. on rotation or resize). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Tailwind's `md` breakpoint: side-by-side layout from here up. */
export const DESKTOP_QUERY = '(min-width: 768px)'

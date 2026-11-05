import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { useLayout } from '../../store/layout'

type Snap = 'peek' | 'half' | 'full'

/** Sheet heights as a fraction of the viewport (peek is a fixed height). */
const PEEK_PX = 132
const SNAP_FRACTION: Record<Exclude<Snap, 'peek'>, number> = { half: 0.5, full: 0.88 }
/** A tap (not a drag) on the handle toggles between peek and half. */
const TAP_TOLERANCE_PX = 6

function snapHeight(snap: Snap, viewport: number): number {
  return snap === 'peek' ? PEEK_PX : Math.round(SNAP_FRACTION[snap] * viewport)
}

/**
 * Desktop: a fixed side panel. Phones: a bottom sheet over a full-screen map that can be
 * dragged between three heights by its handle (or tapped to toggle).
 */
export function ResponsiveSidebar({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const setMapBottomInset = useLayout((s) => s.setMapBottomInset)
  const [snap, setSnap] = useState<Snap>('half')
  const [viewport, setViewport] = useState(() => window.innerHeight)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const height = dragHeight ?? snapHeight(snap, viewport)

  // Tell the map how much of it the sheet covers, so routes are framed above it.
  useEffect(() => {
    setMapBottomInset(desktop ? 0 : snapHeight(snap, viewport))
  }, [desktop, snap, viewport, setMapBottomInset])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startY: event.clientY, startHeight: height, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const dy = drag.current.startY - event.clientY
    if (Math.abs(dy) > TAP_TOLERANCE_PX) drag.current.moved = true
    if (drag.current.moved) {
      setDragHeight(Math.min(viewport * 0.95, Math.max(PEEK_PX, drag.current.startHeight + dy)))
    }
  }

  function onPointerUp() {
    const state = drag.current
    drag.current = null
    if (!state) return
    if (!state.moved) {
      setSnap((current) => (current === 'peek' ? 'half' : 'peek'))
      return
    }
    // Snap to whichever height is closest to where the sheet was let go.
    const released = dragHeight ?? state.startHeight
    const nearest = (['peek', 'half', 'full'] as const).reduce((best, s) =>
      Math.abs(snapHeight(s, viewport) - released) < Math.abs(snapHeight(best, viewport) - released)
        ? s
        : best,
    )
    setSnap(nearest)
    setDragHeight(null)
  }

  if (desktop) {
    return (
      <aside className="z-10 flex h-full w-[400px] shrink-0 flex-col border-r border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-200 px-5 py-3.5">{header}</div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.18)]',
        dragHeight === null && 'transition-[height] duration-300 ease-out',
      )}
      style={{ height }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={snap === 'peek' ? 'Expand panel' : 'Collapse panel'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setSnap((current) =>
              current === 'peek' ? 'half' : current === 'half' ? 'full' : 'peek',
            )
          }
        }}
        className="shrink-0 cursor-grab touch-none border-b border-slate-100 px-5 pt-2 pb-3 select-none active:cursor-grabbing"
      >
        <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
        {header}
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
        {children}
      </div>
    </aside>
  )
}

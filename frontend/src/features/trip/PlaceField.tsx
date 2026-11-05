import { Clock, Crosshair, LoaderCircle, LocateFixed, MapPin, X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useGeocode } from '../../api/queries'
import type { Place } from '../../api/types'
import { cn } from '../../lib/cn'
import { formatCoordinates, parseCoordinates } from '../../lib/geo'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { usePlanner, type PlaceRole } from '../../store/planner'
import { ROLE_STYLE } from './roleStyle'
import { useResolvePoint } from './useResolvePoint'

interface Option {
  key: string
  kind: 'result' | 'recent' | 'coordinates'
  place: Place
}

interface PlaceFieldProps {
  role: PlaceRole
  label: string
  placeholder: string
  error?: string
}

/** Highlight the part of `text` that matches `query`. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-slate-900">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  )
}

/**
 * Address combobox. The selected place is the source of truth; the text box is only a search.
 * Leaving the box without choosing restores the selected place's label.
 */
export function PlaceField({ role, label, placeholder, error }: PlaceFieldProps) {
  const place = usePlanner((s) => s.draft[role])
  const setPlace = usePlanner((s) => s.setPlace)
  const pickTarget = usePlanner((s) => s.pickTarget)
  const setPickTarget = usePlanner((s) => s.setPickTarget)
  const recentPlaces = usePlanner((s) => s.recentPlaces)
  const resolvePoint = useResolvePoint()

  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const value = editing ? text : (place?.label ?? '')
  const debounced = useDebouncedValue(editing ? text : '', 250)
  const searching = editing && text.trim().length >= 2
  const geocode = useGeocode(searching ? debounced : '')
  const waiting = searching && (geocode.isFetching || debounced !== text)

  const coordinates = editing ? parseCoordinates(text) : null
  const options: Option[] = [
    ...(coordinates
      ? [
          {
            key: 'coords',
            kind: 'coordinates' as const,
            place: { ...coordinates, label: formatCoordinates(coordinates) },
          },
        ]
      : []),
    ...(searching && !coordinates
      ? (geocode.data ?? []).map((p, i) => ({ key: `r${i}`, kind: 'result' as const, place: p }))
      : []),
    ...(!searching && !coordinates
      ? recentPlaces.map((p, i) => ({ key: `h${i}`, kind: 'recent' as const, place: p }))
      : []),
  ]
  const showList = open && (options.length > 0 || (searching && !waiting))
  const activeIndex = Math.min(active, Math.max(0, options.length - 1))
  const picking = pickTarget === role
  const style = ROLE_STYLE[role]

  function choose(option: Option) {
    setPlace(role, option.place)
    setEditing(false)
    setOpen(false)
    if (picking) setPickTarget(null)
  }

  function cancelEdit() {
    setEditing(false)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (options.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + options.length) % options.length)
    } else if (event.key === 'Enter' && showList && options[activeIndex]) {
      event.preventDefault()
      choose(options[activeIndex])
    } else if (event.key === 'Escape') {
      if (open || editing) event.stopPropagation()
      cancelEdit()
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocateError('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        void resolvePoint(role, position.coords.latitude, position.coords.longitude)
      },
      () => {
        setLocating(false)
        setLocateError('Could not get your location. Check the browser permission.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }

  const message = error ?? locateError
  const inputId = `field-${role}`

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div
        className={cn(
          'flex items-center rounded-lg border bg-white shadow-sm transition focus-within:ring-2',
          message
            ? 'border-red-300 focus-within:ring-red-200'
            : picking
              ? 'border-sky-400 ring-2 ring-sky-200'
              : 'border-slate-300 focus-within:border-sky-500 focus-within:ring-sky-100',
        )}
      >
        <span
          className={cn(
            'ml-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
            style.bg,
            place?.resolving && 'animate-pulse',
          )}
          aria-hidden
        >
          {style.letter}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && options[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          aria-invalid={Boolean(message)}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          placeholder={picking ? 'Click a point on the map…' : placeholder}
          value={value}
          onChange={(event) => {
            setText(event.target.value)
            setEditing(true)
            setOpen(true)
            setActive(0)
          }}
          onFocus={(event) => {
            event.target.select()
            setOpen(true)
          }}
          onBlur={cancelEdit}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center gap-0.5 pr-1.5">
          {waiting && <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" aria-hidden />}
          {(place || value) && (
            <IconButton
              label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                setPlace(role, null)
                setText('')
                setEditing(true)
                inputRef.current?.focus()
              }}
            >
              <X className="h-4 w-4" />
            </IconButton>
          )}
          {role === 'origin' && (
            <IconButton label="Use my location" onClick={locate} disabled={locating}>
              {locating ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
            </IconButton>
          )}
          <IconButton
            label={picking ? 'Cancel picking on the map' : `Pick ${label.toLowerCase()} on the map`}
            pressed={picking}
            onClick={() => setPickTarget(picking ? null : role)}
          >
            <Crosshair className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">
              {geocode.isError ? 'Search is unavailable right now.' : 'No matching places.'}
            </li>
          )}
          {!searching && options.length > 0 && (
            <li className="px-3 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
              Recent
            </li>
          )}
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                index === activeIndex ? 'bg-sky-50 text-slate-900' : 'text-slate-700',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.kind === 'recent' ? (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              ) : (
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              )}
              <span>
                {option.kind === 'coordinates' && 'Use coordinates '}
                <Highlight text={option.place.label} query={searching ? text : ''} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'rounded-md p-1.5 transition disabled:opacity-50',
        pressed
          ? 'bg-sky-100 text-sky-700'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  )
}

import { CloudSun } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { ApiError } from './api/client'
import { ApiStatus } from './components/ApiStatus'
import { ResponsiveSidebar } from './components/layout/ResponsiveSidebar'
import { PlanPanel } from './features/plan/PlanPanel'
import { useCurrentPlan } from './features/plan/useCurrentPlan'
import { TripForm } from './features/trip/TripForm'
import { TripSummary } from './features/trip/TripSummary'
import { useTripFromUrl } from './features/trip/useTripFromUrl'
import { usePlanner } from './store/planner'

// The map (MapLibre, ~300 kB gzipped) loads as its own chunk so the form is usable sooner.
const MapView = lazy(() => import('./features/map/MapView').then((m) => ({ default: m.MapView })))

/** The full form, or a one-line summary once a trip has been planned. */
function TripSection() {
  const trip = usePlanner((s) => s.submittedTrip)
  const formOpen = usePlanner((s) => s.formOpen)
  const plan = useCurrentPlan()
  // Invalid input is reported on the form fields, so the form must be visible then.
  const hasFieldErrors = plan.error instanceof ApiError && plan.error.status === 400

  if (!trip || formOpen || hasFieldErrors) return <TripForm />
  return <TripSummary trip={trip} />
}

function Header() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
        <CloudSun className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div>
        <h1 className="text-[15px] leading-tight font-semibold tracking-tight">
          Weather-Aware Truck Routing
        </h1>
        <ApiStatus />
      </div>
    </div>
  )
}

function MapLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
      Loading map…
    </div>
  )
}

export default function App() {
  useTripFromUrl()

  return (
    <div className="relative h-full md:flex">
      <ResponsiveSidebar header={<Header />}>
        <TripSection />
        <PlanPanel />
      </ResponsiveSidebar>
      <main className="absolute inset-0 md:relative md:inset-auto md:min-h-0 md:flex-1">
        <Suspense fallback={<MapLoading />}>
          <MapView />
        </Suspense>
      </main>
    </div>
  )
}

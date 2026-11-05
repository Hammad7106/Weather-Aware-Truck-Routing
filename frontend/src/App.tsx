import { CloudSun } from 'lucide-react'
import { ApiStatus } from './components/ApiStatus'
import { MapView } from './features/map/MapView'
import { PlanPanel } from './features/plan/PlanPanel'
import { TripForm } from './features/trip/TripForm'
import { useTripFromUrl } from './features/trip/useTripFromUrl'

export default function App() {
  useTripFromUrl()

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="z-10 flex max-h-[55%] w-full shrink-0 flex-col border-b border-slate-200 bg-white shadow-lg md:max-h-none md:w-[400px] md:border-r md:border-b-0">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
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
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <TripForm />
          <PlanPanel />
        </div>
      </aside>

      <main className="relative min-h-0 flex-1">
        <MapView />
      </main>
    </div>
  )
}

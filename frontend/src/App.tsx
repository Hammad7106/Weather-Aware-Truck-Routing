import { ApiStatus } from './components/ApiStatus'
import { MapView } from './components/MapView'

export default function App() {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="z-10 flex max-h-[45%] w-full shrink-0 flex-col border-b border-slate-200 bg-white shadow-lg md:max-h-none md:w-[380px] md:border-r md:border-b-0">
        <header className="border-b border-slate-200 px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight">Weather-Aware Truck Routing</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Compare routes by weather risk, load and travel time.
          </p>
          <div className="mt-3">
            <ApiStatus />
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-5 py-4 text-sm text-slate-500">
          Trip planner form and route options will appear here.
        </section>
      </aside>

      <main className="relative min-h-0 flex-1">
        <MapView />
      </main>
    </div>
  )
}

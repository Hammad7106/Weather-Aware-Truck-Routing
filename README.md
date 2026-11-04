# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver pick the **safest route** between two places,
based on forecast weather along each route, the truck's load weight, and travel time.

> **Status:** Batch 0 of 7 is done (project scaffold, CI, deployable skeleton). Features arrive in
> later batches; see the [Roadmap](#roadmap).

## Features (target)

- Driver enters origin, destination, departure date/time and load weight.
- 3 truck route options from a routing API.
- Weather checked every **10 / 25 / 50 miles** at the truck's **estimated arrival time** at each checkpoint.
- Risk rating at each checkpoint from wind, rain and snow thresholds plus load-weight rules.
- Recommended route: fewest severe miles, then fewest high miles, then lowest average risk, then shortest travel time.
- Map showing all routes, checkpoints, risk levels, ETAs and route summaries.
- Weather heatmap along the trip corridor with a **0–48 h forecast slider**.

## Tech stack

| Layer               | Choice                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| Frontend            | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query               |
| Map                 | MapLibre GL via `react-map-gl` (WebGL), OpenFreeMap vector tiles (no key) |
| Backend             | Django 5.2, Django REST Framework, httpx                                  |
| Routing / geocoding | TomTom Routing API (truck mode, vehicle weight) + TomTom Search           |
| Weather             | Open-Meteo hourly forecast (free, no key)                                 |
| Hosting             | Vercel (frontend), Render (API)                                           |

## Repository layout

```
.
├── backend/                 Django API
│   ├── config/              settings (all from env vars), urls, wsgi
│   ├── planner/             routing, weather, risk engine, API views + tests
│   ├── build.sh             Render build script
│   └── requirements*.txt
├── frontend/                React app (Vite)
│   └── src/
│       ├── api/             typed API client
│       └── components/      map + UI components
├── .github/workflows/ci.yml lint, format check, tests and build for both apps
└── render.yaml              Render Blueprint for the API
```

## Local development

**Prerequisites:** Python 3.12+, Node 22+, and a free [TomTom API key](https://developer.tomtom.com/)
(needed from Batch 2 onwards).

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # then fill in TOMTOM_API_KEY
python manage.py runserver    # http://localhost:8000/api/health
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:8000
npm run dev                   # http://localhost:5173
```

### Quality checks

```bash
# backend
ruff check . && ruff format --check . && pytest
# frontend
npm run lint && npm run format:check && npm run build
```

CI runs the same checks on every push and pull request.

## Environment variables

**Backend** (`backend/.env`)

| Variable               | Required | Description                                                 |
| ---------------------- | -------- | ----------------------------------------------------------- |
| `SECRET_KEY`           | prod     | Django secret key                                           |
| `DEBUG`                | –        | `True` locally, `False` in production (default `False`)     |
| `ALLOWED_HOSTS`        | –        | Comma-separated; the Render hostname is added automatically |
| `CORS_ALLOWED_ORIGINS` | prod     | Comma-separated frontend origins, e.g. the Vercel URL       |
| `TOMTOM_API_KEY`       | yes      | TomTom routing + search key                                 |
| `CACHE_URL`            | –        | Optional cache backend (default: in-memory)                 |

**Frontend** (`frontend/.env`)

| Variable             | Required | Description                               |
| -------------------- | -------- | ----------------------------------------- |
| `VITE_API_BASE_URL`  | yes      | Base URL of the API, no trailing slash    |
| `VITE_MAP_STYLE_URL` | –        | MapLibre style URL (default: OpenFreeMap) |

## Deployment

1. **API on Render:** New → Blueprint → choose this repo (it reads `render.yaml`). Set
   `TOMTOM_API_KEY` and `CORS_ALLOWED_ORIGINS` (your Vercel URL). Health check: `/api/health`.
2. **Frontend on Vercel:** Import the repo and set **Root Directory** to `frontend`. Set
   `VITE_API_BASE_URL` to the Render URL. Then redeploy.

> Render's free tier sleeps after 15 minutes idle, so the first request can take about 50 s. The
> header badge shows "Connecting to API…" while it wakes up.

## Roadmap

- [x] **Batch 0:** Scaffold, CI, deployable skeleton
- [ ] **Batch 1:** Risk engine (thresholds, load rules, route summaries, ranking) + tests
- [ ] **Batch 2:** Routing, geocoding, checkpoint sampling and ETAs
- [ ] **Batch 3:** Weather at checkpoint ETAs + `/api/plan` with recommendation
- [ ] **Batch 4:** Trip form, route options and route lines on the map
- [ ] **Batch 5:** Risk-coloured segments, checkpoints, popups, legend
- [ ] **Batch 6:** Corridor weather heatmap + 0–48 h slider
- [ ] **Batch 7:** Polish, performance, docs, deployment

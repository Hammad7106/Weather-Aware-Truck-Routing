# Assumptions and design decisions

The brief leaves several details open. This file records how each one was resolved, and why, so
the behaviour of the app can be checked against a written rule. Every rule marked **(tested)** has
a unit test that pins it down.

## 1. Inputs

| Input                | Decision                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Origin / destination | Picked from address autocomplete (TomTom Search, limited to the US, Canada and Mexico), clicked on the map, or taken from the browser's location. The API receives coordinates, so the backend never has to guess which "Springfield" was meant. |
| Departure date/time  | Entered in the driver's local time zone and sent as ISO 8601 with its UTC offset. Allowed range: up to 1 hour in the past (treated as "now") to **7 days** ahead, so the whole trip stays inside the forecast window.                            |
| Load weight          | **Cargo weight in pounds**, 0–80,000 lb. The load rules use this number exactly as entered.                                                                                                                                                      |
| Checkpoint spacing   | "Sample weather every 10 / 25 / 50 miles" is read as **a spacing the driver chooses**: 10, 25 or 50 miles (default 25). Smaller spacing gives more detail and makes more weather lookups.                                                        |

## 2. Routing

- **Provider:** TomTom Calculate Route in `travelMode=truck` with `vehicleCommercial=true`.
- **Three options:** `maxAlternatives=2` asks for the fastest route plus two alternatives. If
  TomTom finds fewer than three distinct routes (for example on a short trip), the app shows the
  routes it got and says so. It never invents a route.
- **Vehicle weight for routing:** TomTom's `vehicleWeight` is the _gross_ weight. It is set to
  cargo + **35,000 lb** (a typical empty tractor-trailer), converted to kg, so weight-restricted
  roads are avoided realistically.
- **Traffic:** for a future departure, `departAt` is sent so TomTom uses predicted traffic for
  that time. On some trips TomTom then returns fewer alternatives (Seattle → Salt Lake City
  drops from 3 routes to 1). When that happens, the routes are requested again with current
  traffic and whichever answer has more routes is used. Three options matter more to this app
  than the small change in drive time (about 1%).
- **Route names:** each route is labelled with the two road numbers it uses for the longest
  distance (for example "via I-80 · I-76"), worked out from TomTom's turn-by-turn guidance.

## 3. Checkpoints and ETAs

- **Placement (tested):** checkpoints sit at mile 0 (the origin), then every _N_ miles along the
  actual route line, plus the destination. Distance is measured along the road (haversine sums
  over the route line), not as a straight line.
- **Miles each checkpoint represents (tested):** a checkpoint covers the road halfway back to the
  previous checkpoint and halfway on to the next. The pieces add up exactly to the route length.
  These miles are what "Severe miles" and "High miles" count, and they are the coloured segments
  on the map.
- **ETA (tested):** TomTom's guidance gives the travel time at every manoeuvre. A checkpoint's ETA
  is interpolated linearly between the two manoeuvres around it. This follows real speed changes
  (city streets vs. interstate) instead of assuming one average speed.
- **Driving time only:** ETAs do not include rest breaks or hours-of-service stops. TomTom's
  travel time is pure driving time. This is listed as a known limitation.

## 4. Weather

- **Provider:** Open-Meteo hourly forecast (free, no key, ~16-day horizon). Units are requested
  directly as mph and inches, so no unit conversion is needed.
- **Variables:** sustained wind at 10 m (`wind_speed_10m`), gusts (`wind_gusts_10m`), rain
  (`rain + showers`), snowfall (`snowfall`, inches of snow, not water equivalent), plus
  temperature and weather code for display only.
- **Which forecast hour (tested):** the hourly value **nearest** the checkpoint ETA.
- **Wind input:** risk is classified on **sustained wind**, which is how wind thresholds are
  usually written. Gusts are shown next to it in the UI but do not change the level.
- **Lookups:** checkpoint coordinates are rounded to 0.05° (about 3.5 miles, close to the
  weather model's own grid spacing), de-duplicated, and fetched in **batched multi-location
  requests**. Results are cached for 30 minutes.
- **Missing data:** if a checkpoint ETA is outside the forecast or the provider returns no value,
  the checkpoint is marked _"No forecast"_ and is not counted as Low. The route summary shows how
  many miles had no data.

## 5. Risk classification

Levels form a scale: **Low = 0, Moderate = 1, High = 2, Severe = 3, No Travel = 4.**

### 5.1 Thresholds (tested)

Where the brief's ranges overlap or leave gaps (rain 0.25 appears in both Moderate and High, and
wind 34.5 falls between 34 and 35), each range **includes its lower bound and excludes its upper
bound**. Wind is measured as a continuous number, so "25–34" means 25 ≤ wind < 35.

| Condition   | Low    | Moderate      | High          | Severe      | No Travel |
| ----------- | ------ | ------------- | ------------- | ----------- | --------- |
| Wind (mph)  | < 25   | 25 – < 35     | 35 – < 45     | 45 – < 55   | ≥ 55      |
| Rain (in/h) | < 0.10 | 0.10 – < 0.25 | 0.25 – < 0.50 | 0.50 – 1.00 | > 1.00    |
| Snow (in/h) | < 0.5  | 0.5 – < 1.0   | 1.0 – < 2.0   | 2.0 – 3.0   | > 3.0     |

The top edge of Severe follows the brief's own wording: rain of exactly 1.00 in/h is Severe
(No Travel is "> 1.00"), and wind of exactly 55 mph is No Travel ("≥ 55").

### 5.2 Combining conditions (tested)

A checkpoint's weather level is the **worst** of its wind, rain and snow levels. The condition
that set it is recorded and shown in the UI (for example "Snow 1.4 in/h → High").

### 5.3 Load rules (tested)

Load rules can only **raise** a level, never lower it:

| Wind      | Load        | Result          |
| --------- | ----------- | --------------- |
| ≥ 55 mph  | any         | No Travel       |
| 45 – < 55 | > 30,000 lb | No Travel       |
| 35 – < 45 | > 40,000 lb | at least Severe |

"> 30,000 lb" is strict: exactly 30,000 lb does not trigger the rule. When a load rule changes
the level, the checkpoint shows which rule did it.

## 6. Route summary

- **Miles per level (tested):** the sum of the miles represented by checkpoints at each level.
- **Average risk (tested):** the **distance-weighted** mean of checkpoint levels (0–4), so a
  checkpoint covering 25 miles counts more than the 5-mile stub at the destination.
- **Peak risk:** the highest level on the route.

## 7. Recommendation (tested)

Routes are sorted by this key, in order. The first difference decides:

1. **No Travel miles**, fewest first. The brief ranks by Severe miles first, but a No Travel mile
   is worse than a Severe mile, so it has to rank first.
2. **Severe miles**, fewest first.
3. **High miles**, fewest first.
4. **Average risk**, lowest first.
5. **Travel time**, shortest first.

Miles are compared after rounding to 0.1 mile and average risk after rounding to 0.01, so
floating-point noise cannot decide the ranking. The recommendation includes plain-English reasons
that compare the winner with the runner-up at the deciding step (for example "4.0 fewer Severe
miles than Route B").

**When every route is unsafe:** if all routes have No Travel miles, the least-bad route is still
ranked first, but the UI shows a clear warning that no route is safe at this departure time.

## 8. Corridor heatmap

- **Corridor:** a grid of points covering the area around all route options, keeping only points
  within about 40 miles of any route. Grid spacing adapts to trip length so there are at most
  about 300 points.
- **Time axis:** the slider runs from **0 to 48 hours after departure**, in 1-hour steps. All 49
  hours come back in one response, so moving the slider makes no network request.
- **What it shows:** risk level (the same rules as checkpoints, including the load rules), or raw
  wind, rain or snow, chosen with a toggle.
- **Truck position:** at each slider hour the map shows where the truck would be on each route,
  using the same ETA model as the checkpoints.

## 9. Scope and limitations

- North America only (the autocomplete is limited to the US, Canada and Mexico; routing and
  weather would work anywhere).
- No user accounts or saved trips. A trip can be shared through its URL instead.
- Forecasts lose accuracy beyond ~3 days. The UI shows how far ahead each value is.
- Freezing rain, fog, visibility and road closures are not in the brief's rules and are not
  classified.
- Rest breaks are not modelled (see section 3).

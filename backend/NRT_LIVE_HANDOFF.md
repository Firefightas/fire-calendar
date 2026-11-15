# P4 live-hotspot recheck for P6

Verified 15 November 2026, 10:53-10:55 Bucharest time (08:53-08:55 UTC), on
https://fire-calendar.onrender.com, deployment `3636a0e`.

P6's earlier seven-day `FIRMS rejected MAP_KEY` failure is not reproduced on the
current deployment. Both regional queries and equivalent global-bbox queries
return HTTP 200 GeoJSON with real observations from MODIS Terra/Aqua and VIIRS
NOAA-20/21. No secret was inspected, changed or recorded.

| Seven-day region query | Hotspots | Terra | Aqua | NOAA-20 | NOAA-21 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Río Negro | 272 | 5 | 2 | 129 | 136 |
| California | 2,359 | 52 | 100 | 1,118 | 1,089 |

Both contain observations dated 9-15 November 2026. Every feature has a valid
Point geometry inside its requested bbox, an allowed satellite, a valid four-digit
time, nominal/high confidence, finite nonnegative FRP and D/N daynight. No
duplicates share satellite/date/time/coordinates. Both equivalent global-bbox
responses exactly match the corresponding regional payload.

These regional/repeated requests may use the backend's 15-minute cache. A further
seven-day global request with a distinct bbox,
`-71.899877,-42,-62.8,-37.5`, avoids the exact cache keys used in those tests. It
completed in 1.483 seconds with HTTP 200 and 272 features, including all four
satellites. It exactly matches the Río Negro payload in this snapshot. Render
returned zero `FIRMS NRT failure` log matches during 08:53:00-08:55:30 UTC.

This verifies the currently served live-hotspot API, including a fresh bbox
request. It does not identify whether the earlier rejection was caused by an
invalid key, activation, quota or the previous deployment state; upstream account
history was not inspected. It also does not guarantee future quota availability.
No backend code or contract change was needed.

P6 can now repeat **Ignite from live hotspots** in the Tactical Containment
Sandbox. The UI interaction and resulting ignition state still need P6's check;
this handoff verifies the backend input, not the sandbox behavior.

Machine-readable evidence:
[verification/2026-11-15-nrt.json](verification/2026-11-15-nrt.json).
Observation counts are a timestamped snapshot, not expected constants or UI values.

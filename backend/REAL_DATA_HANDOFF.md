# P4 real-data and Render verification

Verified 15 November 2026 at https://fire-calendar.onrender.com against deployment
`dep-dbsm8iuc6qcc739igqf0`, commit `efb661b` (PR #24), live since 07:52:10 UTC.
P1 confirmed the deployment and the human confirmed Render's **My Workspace**.
The branch also incorporates P2/P5 handoffs through `72aa5c5`. The performance
fix was subsequently verified live on `3636a0e`; see the final section below.

## Matched inputs

These are the screened tables committed on main, paired with P3's regenerated
calendar/calibration. They now reach Render through Git; the previous manual
Parquet-upload handoff is resolved.

| Region | Table | Rows | Bytes | Observed dates |
| --- | --- | ---: | ---: | --- |
| Río Negro | points.parquet | 307,352 | 6,163,295 | 2000-11-08 to 2026-11-13 |
| Río Negro | hex_day.parquet | 143,233 | 1,056,491 | 2000-11-08 to 2026-11-13 |
| California | points.parquet | 2,049,536 | 38,511,137 | 2000-11-01 to 2026-11-14 |
| California | hex_day.parquet | 521,339 | 3,271,461 | 2000-11-01 to 2026-11-14 |

SHA-256, calculated again from the committed files:

- Río Negro points: `a3e1fdd924e003dc3a0c68167b1e4c6cb60f7761ef8089b308a0a5e7699f4312`
- Río Negro hex/day: `96b915fd704715091980c1c9713035e2abefba40bd45a0e056ffcc67d209bccb`
- California points: `cd8f88c933b00a9761dfd920b2c172cedccdd299db33ba8515dbe063481da20d`
- California hex/day: `dd2b3a1cb86ce695f3c784df8c79b5610170d227ffca80d0ae5b0bddd7c20872`

There are 27,405 unique H3 cells in each Río Negro table and 49,314 in each
California table. Hashes match P2's
[Río Negro](../pipeline/ingest/RIO_NEGRO_STATUS.md) and
[California](../pipeline/ingest/CALIFORNIA_STATUS.md) handoffs.
P2 confirmed California's conservative persistence screen in PR #25. Some
ambiguous recurrent sources remain; these data are not an exhaustive industrial
source mask. Sandbox terrain is still mock and is a separate P2/P6 handoff.

## Live API acceptance checks

Both regions pass:

- `GET /api/health` returns `using_mocks: ["romania"]`.
- Regional calendar and calibration JSON are `is_mock: false`, validate against
  their frozen schemas and exactly equal the corresponding committed JSON.
- `POST /api/calendar` for the polygons below returns HTTP 200,
  `is_mock: false`, and 313 schema-valid months, November 2000-November 2026.
- Calendar CSVs have 313 rows; all fields match the polygon JSON response.
- Point CSVs complete with the independently checked row totals below.
- Both exports have CSV content types, correct filenames, `X-Data-Source:
  processed`, and no mock label.

| P3 held-out metric | Río Negro | California |
| --- | ---: | ---: |
| test_mae (cell-days) | 91.11 | 152.27 |
| test_mape | 0.332 | 0.175 |

These are the values served by Render and stored in P3's committed calibration
files, not new P4 estimates. The older Río Negro 102.01 / 0.354 results applied to
the unscreened input pair and have been superseded.

Calibration method, fitting windows and contracts are unchanged. The previous
early NOAA handover fix remains: the supplied S-NPP archive ends July 2026, so
polygon calendars follow P3's explicit NOAA-20 source from August. Quiet areas do
not imply missing satellite coverage. H3-center calendar selection and exact
coordinate filtering for point exports retain their existing semantics.

## Render timing and memory

One sequential client run from this Windows workstation; times include HTTP
transfer, not just database execution. All requests use `start=2000-11`,
`end=2026-11`. Each bbox describes a closed rectangular GeoJSON polygon;
bounds are west, south, east, north.

| Case | Bounds | Calendar JSON | Calendar CSV | Points CSV |
| --- | --- | ---: | ---: | --- |
| Río Negro | [-65.9, -39.6, -65.3, -39.0] | 1.035 s | 1.163 s | 10.490 s; 8,864 rows |
| California | [-121.5, 37.5, -120.5, 38.5] | 0.980 s | 1.304 s | 32.564 s; 25,608 rows |
| California large | [-123, 36, -118, 41] | 3.230 s | not run | stopped at 35.135 s; 29,601 rows |

The large export has **1,202,900** matching points. It returned HTTP 200 and
headers in 4.266 seconds, but had transferred only 2,490,368 bytes when the client
stopped it at its 35-second deadline. This was a client-imposed deadline, not an
observed Render gateway timeout. It demonstrates that broad exports are too slow
with the deployed per-row streaming implementation.

Render free service `srv-dbs80plg1s2s73ef2mv0`, instance
`srv-dbs80plg1s2s73ef2mv0-zhmnp`, memory limit 536,870,900 bytes (about 512 MiB):

| UTC window | Whole-instance memory samples |
| --- | --- |
| 07:57:00-07:59:00, representative requests | 96,583,680-156,909,570 bytes (92.1-149.6 MiB) |
| 08:00:00-08:01:30, large polygon/export | 100,728,830-497,963,000 bytes (96.1-474.9 MiB) |
| 08:02:00-08:04:00, after cancellation | 105,955,330-118,476,800 bytes (101.0-113.0 MiB) |

Metrics are Render's `memory_usage` samples at 30-second resolution. They are
whole-instance measurements, may include other traffic, and cannot establish
instantaneous or per-request peak RSS. The large-query sampled maximum is 92.8%
of the instance limit. No OOM or server timeout was observed in this run.

Request timestamps, byte/row counts, response provenance, exact-file comparisons
and memory samples are recorded in
[verification/2026-11-15-render.json](verification/2026-11-15-render.json).
No CSV bodies or credentials are retained.

## Backend performance fix

The deployed exporter yielded one string per row. Starlette schedules each
synchronous iterator advance in its thread pool and sends each yielded string
through ASGI. This made a multi-million-row export incur millions of scheduling
and send operations.

This branch sends the CSV header promptly, then batches complete records into
approximately 64 Ki characters per chunk (one oversized record may exceed the
target). It preserves columns, quoting, nulls, lowercase booleans, leading-zero
times, sorting, polygon/holes filtering and provenance. It does not accumulate
the entire export.

Each DuckDB query now uses one thread and a 128 MiB buffer budget, with its own
temporary spill directory. Query and spill resources close on success, query
failure and client disconnect, including ASGI 2.4's exception path. This is a
per-query DuckDB budget, not a total process RSS limit or a guarantee under
unbounded concurrent exports. The buffer/thread/spill choices follow
[DuckDB's workload tuning guidance](https://duckdb.org/docs/2.0/guides/performance/how_to_tune_workloads.html).

Local HTTP measurements of the revised code, on the same committed real inputs:

| California polygon | Calendar JSON | Complete points export |
| --- | ---: | --- |
| Representative | 0.205 s | 0.446 s; 25,608 rows |
| Large | 0.608 s | 15.157 s; 1,202,900 rows; 104,752,608 bytes |
| Entire region bbox [-124.5, 32.5, -114.1, 42] | 2.010 s | 24.888 s; 2,049,536 rows; 178,328,175 bytes |

The local server's Windows peak working set across the run was 253,124,608 bytes
(241.4 MiB). These measurements are **local, not post-fix Render measurements**.
Representative polygon payloads match the deployed payloads after excluding the
request-specific `generated_at` timestamp.

## Initial validation and deployment handoff

130 Python tests and Ruff pass. New regressions check bounded/lazy CSV batching,
quoted multiline Unicode fields, trailing chunks, boolean/null preservation and
connection/spill cleanup when a client disconnects. Existing tests cover dates,
polygon edges/holes, leading-zero times, mock provenance and scientific behavior.
The frontend production build was checked in an isolated scratch copy so its
automatic data sync could not modify P5's tracked files.

P4's initial real-data acceptance checks passed on `efb661b`. P1 merged the
performance fix as PR #27 (`71d0379`) and deployed main containing it. The required
live performance follow-up is complete below. No calibration or contract changes
were needed.

## Post-fix Render verification: complete

Verified 15 November 2026, 10:43-10:48 Bucharest time (08:43-08:48 UTC), after
deployment `dep-dbsn0oe1egvs73eaoprg` became live at 08:43:11 UTC. The deployed
commit is `3636a0e9dda264e08e3e6c7dc09fd0aba828ca74`, which contains PR #27.
Instance: `srv-dbs80plg1s2s73ef2mv0-cbpjn`. Initial checks before this rollout
finished still reached the old revision; the results below all follow `live`.

Both regions again passed health (`using_mocks: ["romania"]`), exact committed
regional JSON equality, `is_mock: false`, schema-valid 313-month polygon
responses, and both CSV exports with processed provenance and correct filenames.
All fields in both representative calendar CSVs match their polygon JSON.
Calibration metrics remain Río Negro 91.11 / 0.332 and California 152.27 / 0.175.

The same polygon bounds and full-history date window were used as above:

| Case | Calendar JSON | Calendar CSV | Complete points CSV | Points headers |
| --- | ---: | ---: | --- | ---: |
| Río Negro representative | 0.703 s | 0.701 s | 1.075 s; 8,864 rows | 0.274 s |
| California representative | 1.008 s | 0.816 s | 2.153 s; 25,608 rows | 0.808 s |
| California large | 3.499 s | not repeated | 63.470 s; 1,202,900 rows; 104,752,608 bytes | 6.195 s |
| Entire California bbox | 9.487 s | not repeated | 108.457 s; 2,049,536 rows; 178,328,175 bytes | 9.393 s |

Every points export completed with HTTP 200 and an independently checked row
total from the committed Parquet. The large/whole checks allowed 120/180 seconds
of total client time so the full transfers could be measured; neither hit that
deadline, a read timeout, or an observed Render gateway timeout. These are single
warm-service measurements, not guarantees for all loads or cold starts.

The representative California export improved from 32.564 to 2.153 seconds on
Render. Broad exports still take about one to two minutes because their complete
CSV bodies are 105-178 MB. P5's existing 90-second export timeout is cleared when
`fetch` receives the response headers, before awaiting the body; these requests
received their headers within 10 seconds. No frontend change was required.

Render's final 30-second memory samples for the new instance, 08:43:30-08:48:30
UTC, range from 83,894,270 to **284,057,600 bytes (270.9 MiB, 52.9% of the
512 MiB limit)**. At 08:47:30, after the full export completed, memory was back to
114,290,690 bytes (109.0 MiB). The pre-fix large-area run sampled 497,963,000 bytes
(474.9 MiB); the post-fix run also exercised the larger, whole-region archive.
These are whole-instance samples and can miss instantaneous peaks. Other service
traffic was not isolated. No OOM was observed, and Render returned zero
error-level logs for 08:43:15-08:47:30 UTC.

Evidence: [verification/2026-11-15-render-postfix.json](verification/2026-11-15-render-postfix.json).
All 133 Python tests, Ruff and the frontend production build pass on the
integrated main used for this recheck. This follow-up changes only verification
documentation/evidence and the requested P4 PLAN status. The deployment and live
performance check for PR #27 are complete; no further fix was needed in this run.

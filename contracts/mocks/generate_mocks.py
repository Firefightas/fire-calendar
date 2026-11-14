"""Generate MOCK contract files for every region in contracts/regions.json.

All numbers here are synthetic (is_mock: true). They have the right shape, a
realistic seasonal pattern, a visible 2012 sensor jump in the raw series and a
spatially coherent sandbox map (river, villages, farms, forest), so the
frontend, backend and sandbox can be built before real data exists.

Usage (from repo root):
    uv run python contracts/mocks/generate_mocks.py

Always writes:  <region>/calendar.json, <region>/calibration.json
Needs `h3` for: <region>/sandbox_grid.json, points.sample.csv, hex_day.sample.csv,
                hex_fire_history.sample.csv (skipped with a message if h3 is missing).
"""

from __future__ import annotations

import csv
import json
import math
import random
import statistics
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOCKS = ROOT / "contracts" / "mocks"
REGIONS = json.loads((ROOT / "contracts" / "regions.json").read_text())["regions"]

FIRST = (2000, 11)  # MODIS Collection 6.1 starts 1 Nov 2000
LAST = (2026, 11)
AQUA_START = (2002, 7)
VIIRS_SNPP_START = (2012, 2)  # first full S-NPP month (data from 20 Jan 2012)
SNPP_END = (2026, 10)  # last full S-NPP month (stopped 2 Nov 2026)
NRT_FROM = (2026, 6)  # SP lags ~5 months
FIT_YEARS = (2012, 2020)
TEST_YEARS = (2021, 2025)
BASELINE = (2001, 2025)  # complete years
ANOMALY_FLOOR = 1.0  # TEAM_PLAN §2.3

# Relative monthly fire activity (Jan..Dec) and typical VIIRS cell-days at peak.
PROFILES = {
    "rio_negro": ([1.0, 0.85, 0.55, 0.3, 0.15, 0.08, 0.1, 0.15, 0.25, 0.35, 0.6, 0.9], 140),
    "california": ([0.1, 0.1, 0.15, 0.2, 0.3, 0.55, 0.9, 1.0, 0.85, 0.55, 0.3, 0.12], 260),
    "romania": ([0.15, 0.3, 0.9, 1.0, 0.4, 0.15, 0.3, 0.6, 0.75, 0.5, 0.25, 0.1], 60),
}
# VIIRS/MODIS ratio: higher where fires are small (agriculture).
BASE_RATIO = {"rio_negro": 3.2, "california": 2.4, "romania": 4.5}
TERRA_SHARE = 0.55  # Terra-only months see ~55% of Terra+Aqua cell-days
NOAA20_RAW = 0.97  # NOAA-20 raw cell-days relative to S-NPP
NOAA21_RAW = 0.988

LANDCOVER_CLASSES = {"10": "tree", "20": "shrub", "30": "grass", "40": "crop", "50": "built",
                     "60": "bare", "80": "water", "90": "wetland"}
ASSET_TYPE = {10: "forest", 20: "grassland", 30: "grassland", 40: "farm", 50: "village", 80: "river"}
BURNABLE = {10, 20, 30, 40, 50}


def months():
    y, m = FIRST
    while (y, m) <= LAST:
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def quantile(xs, q):
    xs = sorted(xs)
    pos = (len(xs) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def build_region(region: dict, now: str) -> tuple[dict, dict]:
    rid = region["id"]
    rng = random.Random(rid)
    season, peak = PROFILES.get(rid, ([0.5] * 12, 50))
    base_ratio = BASE_RATIO.get(rid, 3.0)
    ratio = [base_ratio * (1.0 + 0.25 * (1 - s)) for s in season]  # small-fire months: higher ratio

    year_effect = {y: math.exp(rng.gauss(0, 0.2)) for y in range(2000, 2027)}
    rows = []
    for y, m in months():
        truth = peak * season[m - 1] * year_effect[y] * math.exp(rng.gauss(0, 0.25))
        modis_ta = truth / ratio[m - 1] * math.exp(rng.gauss(0, 0.12))
        has_aqua = (y, m) >= AQUA_START
        modis = modis_ta if has_aqua else modis_ta * TERRA_SHARE
        if VIIRS_SNPP_START <= (y, m) <= SNPP_END:
            viirs, source = truth, "viirs_snpp"
        elif (y, m) > SNPP_END:
            viirs, source = truth * NOAA20_RAW, "viirs_noaa20"
        else:
            viirs, source = None, ("modis_terra_aqua" if has_aqua else "modis_terra")
        rows.append({
            "year": y, "month": m,
            "modis_raw": round(modis, 1),
            "viirs_raw": None if viirs is None else round(viirs, 1),
            "source": source,
            "is_nrt": (y, m) >= NRT_FROM,
        })

    # --- Calibration learned on fit years only, like the real pipeline must do.
    monthly = []
    for m in range(1, 13):
        ratios = [r["viirs_raw"] / r["modis_raw"] for r in rows
                  if r["month"] == m and FIT_YEARS[0] <= r["year"] <= FIT_YEARS[1]
                  and r["source"] == "viirs_snpp" and r["modis_raw"] > 0]
        monthly.append({"month": m, "factor": round(statistics.median(ratios), 3),
                        "cv": round(statistics.pstdev(ratios) / statistics.mean(ratios), 3),
                        "n_years": len(ratios), "fallback": False})
    terra_only_factor = round(1 / TERRA_SHARE, 3)
    noaa20_factor = round(1 / NOAA20_RAW, 3)
    noaa21_factor = round(1 / NOAA21_RAW, 3)

    def from_modis(r, terra_only: bool) -> float:
        f = monthly[r["month"] - 1]["factor"]
        return r["modis_raw"] * (terra_only_factor if terra_only else 1.0) * f

    for r in rows:
        if r["source"].startswith("modis"):
            r["harmonized"] = round(from_modis(r, r["source"] == "modis_terra"), 1)
            r["is_estimated"] = True
            cv = monthly[r["month"] - 1]["cv"]
        elif r["source"] == "viirs_noaa20":
            r["harmonized"] = round(r["viirs_raw"] * noaa20_factor, 1)
            r["is_estimated"] = False
            cv = 0.03
        else:
            r["harmonized"] = r["viirs_raw"]
            r["is_estimated"] = False
            cv = 0.0
        h = r["harmonized"]
        half = 1.96 * math.sqrt(h + (cv * h) ** 2)
        r["unc_low"] = round(max(0.0, h - half), 1)
        r["unc_high"] = round(h + half, 1)

    # --- Median / IQR / IQR Anomaly Score per calendar month over the baseline.
    for m in range(1, 13):
        vals = [r["harmonized"] for r in rows if r["month"] == m and BASELINE[0] <= r["year"] <= BASELINE[1]]
        med, iqr = statistics.median(vals), quantile(vals, 0.75) - quantile(vals, 0.25)
        for r in rows:
            if r["month"] == m:
                r["median_m"] = round(med, 1)
                r["iqr_m"] = round(iqr, 1)
                r["anomaly_z"] = round((r["harmonized"] - med) / max(iqr, ANOMALY_FLOOR), 2)

    # --- Validation numbers, computed from the mock series.
    test = [r for r in rows if TEST_YEARS[0] <= r["year"] <= TEST_YEARS[1] and r["source"] == "viirs_snpp"]
    errs = [abs(from_modis(r, False) - r["viirs_raw"]) for r in test]
    mape = [e / r["viirs_raw"] for e, r in zip(errs, test, strict=True) if r["viirs_raw"] > 0]

    def mean_of(years, key):
        return statistics.mean(key(r) for r in rows if years[0] <= r["year"] <= years[1])

    def naive(r):
        return r["viirs_raw"] if r["viirs_raw"] is not None else r["modis_raw"]

    before, after = (2009, 2011), (2013, 2015)

    order = ["year", "month", "modis_raw", "viirs_raw", "harmonized", "is_estimated", "is_nrt",
             "median_m", "iqr_m", "anomaly_z", "unc_low", "unc_high", "source"]
    calendar = {
        "region_id": rid, "unit": "active_fire_cell_days", "scale": "SNPP_VIIRS_EQ",
        "is_mock": True, "generated_at": now,
        "first_month": f"{FIRST[0]}-{FIRST[1]:02d}", "last_month": f"{LAST[0]}-{LAST[1]:02d}",
        "baseline_years": list(BASELINE),
        "months": [{k: r[k] for k in order} for r in rows],
    }
    calibration = {
        "region_id": rid, "is_mock": True, "generated_at": now,
        "method": "overlap median ratio per calendar month (MOCK)",
        "target_scale": "SNPP_VIIRS_EQ",
        "fit_years": list(FIT_YEARS), "test_years": list(TEST_YEARS),
        "test_mae": round(statistics.mean(errs), 2),
        "terra_only_factor": terra_only_factor,
        "noaa20_factor": noaa20_factor,
        "noaa21_factor": noaa21_factor,
        "monthly_factors": monthly,
        "test_mape": round(statistics.mean(mape), 3),
        "raw_step_ratio": round(mean_of(after, naive) / mean_of(before, naive), 2),
        "harmonized_step_ratio": round(mean_of(after, lambda r: r["harmonized"])
                                       / mean_of(before, lambda r: r["harmonized"]), 2),
        "diagnostics": {"note": "mock values; real file may hold Aqua-only / Terra-only factor checks"},
    }
    return calendar, calibration


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    (la1, lo1), (la2, lo2) = map(lambda p: (math.radians(p[0]), math.radians(p[1])), (a, b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def build_h3_mocks(region: dict, out: Path, h3) -> None:
    """Spatially coherent ~1,000-hex demo map around the region center."""
    rid = region["id"]
    rng = random.Random(rid + "-h3")
    lon_c, lat_c = region["center"]
    center = h3.latlng_to_cell(lat_c, lon_c, 7)
    cells = list(h3.grid_disk(center, 18))
    pos = {c: h3.cell_to_latlng(c) for c in cells}

    # A river meanders west-east through the center; villages sit near it; forest on high ground.
    def river_lat(lon):
        return lat_c + 0.06 * math.sin((lon - lon_c) * 9)

    villages = [(lat_c + 0.04, lon_c - 0.15), (lat_c - 0.05, lon_c + 0.2), (lat_c + 0.12, lon_c + 0.05)]
    elevation, landcover = {}, {}
    for c, (lat, lon) in pos.items():
        dist_river = abs(lat - river_lat(lon))
        elevation[c] = 120 + 2200 * max(0.0, dist_river - 0.01) + 120 * (lat - lat_c) * 10 + rng.gauss(0, 8)
        near_village = min(haversine_m((lat, lon), v) for v in villages)
        if dist_river < 0.012:
            lc = 80
        elif near_village < 2500:
            lc = 50
        elif dist_river < 0.07:
            lc = rng.choices([40, 30], weights=[75, 25])[0]
        elif elevation[c] > 330:
            lc = rng.choices([10, 20], weights=[80, 20])[0]
        else:
            lc = rng.choices([20, 30, 10, 60], weights=[40, 40, 12, 8])[0]
        landcover[c] = lc

    # Recent burn scars: two patches burned 1-3 years ago; most land unburned for long.
    scars = [h3.cell_to_latlng(rng.choice(cells)) for _ in range(2)]
    grid, history = [], []
    for c, (lat, lon) in pos.items():
        lc = landcover[c]
        nbrs = [n for n in h3.grid_ring(c, 1) if n in pos]
        slope = max((math.degrees(math.atan(abs(elevation[n] - elevation[c]) / haversine_m(pos[c], pos[n])))
                     for n in nbrs), default=0.0)
        burnable = lc in BURNABLE
        if not burnable or lc == 50:
            burns, ysl = 0.0, None
        elif min(haversine_m((lat, lon), s) for s in scars) < 6000:
            burns, ysl = round(rng.uniform(2, 8), 1), round(rng.uniform(1, 3), 1)
        elif rng.random() < 0.35:
            burns, ysl = round(rng.uniform(0.5, 4), 1), round(rng.uniform(4, 22), 1)
        else:
            burns, ysl = 0.0, None
        grid.append({
            "h3": c, "lat": round(lat, 5), "lon": round(lon, 5), "landcover": lc,
            "asset_type": ASSET_TYPE.get(lc, "none"), "burnable": burnable,
            "elevation_m": round(elevation[c], 1), "slope_deg": round(slope, 2),
            "burn_count": burns, "years_since_last_fire": ysl,
        })
        history.append((c, burns, "" if ysl is None else ysl))

    (out / "sandbox_grid.json").write_text(json.dumps({
        "region_id": rid, "is_mock": True, "h3_resolution": 7,
        "landcover_classes": LANDCOVER_CLASSES, "cells": grid,
    }, indent=1))
    with open(out / "hex_fire_history.sample.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["h3", "burn_count", "years_since_last_fire"])
        w.writerows(history)

    sats = [("modis", "terra"), ("modis", "aqua"), ("viirs", "snpp"), ("viirs", "noaa20")]
    burnable_cells = [g["h3"] for g in grid if g["burnable"]]
    points, hexday = [], {}
    for _ in range(600):
        c = rng.choice(burnable_cells)
        lat, lon = pos[c]
        day = date(2018, 1, 1) + timedelta(days=rng.randrange(0, 365 * 8 + 300))
        sensor, sat = rng.choice(sats)
        if sat == "snpp" and day > date(2026, 11, 1):
            sat = "noaa20"
        frp = round(rng.lognormvariate(2.0, 1.0), 1)
        points.append({
            "date": day.isoformat(), "time": f"{rng.choice([3, 4, 14, 15, 17, 18]):02d}{rng.randrange(60):02d}",
            "lat": round(lat + rng.uniform(-0.01, 0.01), 5), "lon": round(lon + rng.uniform(-0.01, 0.01), 5),
            "h3": c, "sensor": sensor, "satellite": sat,
            "confidence_class": rng.choice(["nominal", "nominal", "high"]),
            "frp": frp, "daynight": rng.choice(["D", "N"]),
            "type": 0 if sensor == "modis" else "", "is_nrt": day >= date(2026, 6, 1),
        })
        k = (c, day.isoformat(), sensor, sat)
        n, s = hexday.get(k, (0, 0.0))
        hexday[k] = (n + 1, s + frp)

    with open(out / "points.sample.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(points[0]))
        w.writeheader()
        w.writerows(sorted(points, key=lambda p: (p["date"], p["time"])))
    with open(out / "hex_day.sample.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["h3", "date", "sensor", "satellite", "n_points", "frp_sum"])
        for (c, d, sensor, sat), (n, s) in sorted(hexday.items(), key=lambda kv: kv[0][1]):
            w.writerow([c, d, sensor, sat, n, round(s, 1)])


def main() -> None:
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    try:
        import h3  # noqa: PLC0415
    except ImportError:
        h3 = None
    for region in REGIONS:
        out = MOCKS / region["id"]
        out.mkdir(parents=True, exist_ok=True)
        calendar, calibration = build_region(region, now)
        (out / "calendar.json").write_text(json.dumps(calendar, indent=1))
        (out / "calibration.json").write_text(json.dumps(calibration, indent=1))
        print(f"{region['id']}: {len(calendar['months'])} months, raw step x{calibration['raw_step_ratio']}, "
              f"harmonized step x{calibration['harmonized_step_ratio']}, test MAPE {calibration['test_mape']:.0%}")
        if h3 is not None:
            build_h3_mocks(region, out, h3)
    if h3 is None:
        print("h3 not installed: skipped sandbox_grid.json and *.sample.csv "
              "(run with `uv run`, which installs it).")


if __name__ == "__main__":
    main()

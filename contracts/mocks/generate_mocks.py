"""Generate MOCK contract files for every region in contracts/regions.json.

All numbers here are synthetic (is_mock: true). They have the right shape, a
realistic seasonal pattern and a visible 2012 sensor jump in the raw series,
so the frontend, backend and sandbox can be built before real data exists.

Usage (from repo root):
    uv run python contracts/mocks/generate_mocks.py

Always writes:  <region>/calendar.json, <region>/calibration.json
Needs `h3` for: <region>/sandbox_grid.json, points.sample.csv, hex_day.sample.csv
(skipped with a message if h3 is not installed).
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
BASELINE = (2001, 2025)

# Relative monthly fire activity (Jan..Dec) and typical VIIRS cell-days at peak.
PROFILES = {
    "rio-negro": ([1.0, 0.85, 0.55, 0.3, 0.15, 0.08, 0.1, 0.15, 0.25, 0.35, 0.6, 0.9], 140),
    "california": ([0.1, 0.1, 0.15, 0.2, 0.3, 0.55, 0.9, 1.0, 0.85, 0.55, 0.3, 0.12], 260),
    "romania": ([0.15, 0.3, 0.9, 1.0, 0.4, 0.15, 0.3, 0.6, 0.75, 0.5, 0.25, 0.1], 60),
}
# VIIRS/MODIS ratio per month: higher when fires are small (agriculture).
BASE_RATIO = {"rio-negro": 3.2, "california": 2.4, "romania": 4.5}


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
    terra_share = 0.55  # Terra-only months see ~55% of Terra+Aqua cell-days

    year_effect = {y: math.exp(rng.gauss(0, 0.2)) for y in range(2000, 2027)}
    rows = []
    for y, m in months():
        truth = peak * season[m - 1] * year_effect[y] * math.exp(rng.gauss(0, 0.25))
        modis_ta = truth / ratio[m - 1] * math.exp(rng.gauss(0, 0.12))
        has_aqua = (y, m) >= AQUA_START
        modis = modis_ta if has_aqua else modis_ta * terra_share
        if VIIRS_SNPP_START <= (y, m) <= SNPP_END:
            viirs, source = truth, "viirs_snpp"
        elif (y, m) > SNPP_END:
            viirs, source = truth * 0.97, "viirs_noaa20"  # NOAA-20 raw, ~3% lower than S-NPP
        else:
            viirs, source = None, ("modis_terra_aqua" if has_aqua else "modis_terra")
        rows.append({
            "year": y, "month": m,
            "modis_raw": round(modis, 1),
            "viirs_raw": None if viirs is None else round(viirs, 1),
            "source": source,
            "is_nrt": (y, m) >= NRT_FROM,
        })

    # --- "Calibration" learned on fit years only, like the real pipeline must do.
    def monthly_factors(pred_ok):
        out = []
        for m in range(1, 13):
            ratios = [r["viirs_raw"] / r["modis_raw"] for r in rows
                      if r["month"] == m and FIT_YEARS[0] <= r["year"] <= FIT_YEARS[1]
                      and r["source"] == "viirs_snpp" and r["modis_raw"] > 0 and pred_ok(r)]
            f = statistics.median(ratios)
            cv = statistics.pstdev(ratios) / statistics.mean(ratios)
            out.append({"month": m, "factor": round(f, 3), "cv": round(cv, 3), "n_years": len(ratios)})
        return out

    ta = monthly_factors(lambda r: True)
    terra = [{**e, "factor": round(e["factor"] / terra_share, 3)} for e in ta]

    def convert(r):
        f = (ta if r["source"] == "modis_terra_aqua" else terra)[r["month"] - 1]["factor"]
        return r["modis_raw"] * f

    for r in rows:
        if r["source"].startswith("modis"):
            r["harmonized"] = round(convert(r), 1)
            r["is_estimated"] = True
            cv = ta[r["month"] - 1]["cv"]
        elif r["source"] == "viirs_noaa20":
            r["harmonized"] = round(r["viirs_raw"] / 0.97, 1)
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

    # --- Median / IQR / anomaly per calendar month over the baseline.
    for m in range(1, 13):
        vals = [r["harmonized"] for r in rows if r["month"] == m and BASELINE[0] <= r["year"] <= BASELINE[1]]
        med, iqr = statistics.median(vals), quantile(vals, 0.75) - quantile(vals, 0.25)
        floor = max(1.0, 0.1 * med)
        for r in rows:
            if r["month"] == m:
                r["median_m"] = round(med, 1)
                r["iqr_m"] = round(iqr, 1)
                r["anomaly_z"] = round((r["harmonized"] - med) / max(iqr, floor), 2)

    # --- Validation numbers, computed from the mock series.
    test = [r for r in rows if TEST_YEARS[0] <= r["year"] <= TEST_YEARS[1] and r["source"] == "viirs_snpp"]
    errs = [abs(convert({**r, "source": "modis_terra_aqua"}) - r["viirs_raw"]) for r in test]
    mape = [e / r["viirs_raw"] for e, r in zip(errs, test, strict=False) if r["viirs_raw"] > 0]

    def mean_of(years, key):
        return statistics.mean(key(r) for r in rows if years[0] <= r["year"] <= years[1])

    naive = lambda r: r["viirs_raw"] if r["viirs_raw"] is not None else r["modis_raw"]  # noqa: E731
    before, after = (2009, 2011), (2013, 2015)

    order = ["year", "month", "modis_raw", "viirs_raw", "harmonized", "is_estimated", "is_nrt",
             "median_m", "iqr_m", "anomaly_z", "unc_low", "unc_high", "source"]
    calendar = {
        "region_id": rid, "unit": "active_fire_cell_days", "scale": "viirs_snpp_equivalent",
        "is_mock": True, "generated_at": now,
        "first_month": f"{FIRST[0]}-{FIRST[1]:02d}", "last_month": f"{LAST[0]}-{LAST[1]:02d}",
        "baseline_years": list(BASELINE),
        "months": [{k: r[k] for k in order} for r in rows],
    }
    calibration = {
        "region_id": rid, "is_mock": True, "generated_at": now,
        "method": "overlap median ratio per calendar month (MOCK)",
        "reference_sensor": "viirs_snpp",
        "fit_years": list(FIT_YEARS), "test_years": list(TEST_YEARS),
        "sensors": [
            {"sensor": "modis_terra_aqua", "overlap": ["2012-02", "2026-10"], "monthly": ta},
            {"sensor": "modis_terra", "overlap": ["2012-02", "2026-10"], "monthly": terra},
            {"sensor": "viirs_noaa20", "overlap": ["2018-04", "2026-10"],
             "monthly": [{"month": m, "factor": 1.031, "cv": 0.03, "n_years": 8} for m in range(1, 13)]},
            {"sensor": "viirs_noaa21", "overlap": ["2024-01", "2026-10"],
             "monthly": [{"month": m, "factor": 1.012, "cv": 0.05, "n_years": 2} for m in range(1, 13)]},
        ],
        "validation": {
            "test_mae": round(statistics.mean(errs), 2),
            "test_mape": round(statistics.mean(mape), 3),
            "raw_step_ratio": round(mean_of(after, naive) / mean_of(before, naive), 2),
            "harmonized_step_ratio": round(mean_of(after, lambda r: r["harmonized"])
                                           / mean_of(before, lambda r: r["harmonized"]), 2),
        },
    }
    return calendar, calibration


def build_h3_mocks(region: dict, out: Path) -> None:
    import h3  # noqa: PLC0415  (optional dependency)

    rid = region["id"]
    rng = random.Random(rid + "-h3")
    lon_c, lat_c = region["center"]
    center = h3.latlng_to_cell(lat_c, lon_c, 7)
    cells = list(h3.grid_disk(center, 18))  # ~1,000 hexes around the center

    grid = []
    for c in cells:
        lat, lon = h3.cell_to_latlng(c)
        d = h3.grid_distance(center, c)
        lc = rng.choices([10, 20, 30, 40, 50, 60, 80], weights=[15, 30, 25, 18, 3, 6, 3])[0]
        burnable = lc in (10, 20, 30, 40)
        burns = round(rng.expovariate(1 / 6), 1) if burnable else 0.0
        grid.append({
            "h3": c, "landcover": lc, "burnable": burnable,
            "elevation_m": round(150 + 12 * d + 40 * math.sin(lat * 7) + rng.gauss(0, 15), 1),
            "burn_count": burns,
            "years_since_last_fire": (round(rng.uniform(0, 20), 1) if burns > 0 else None),
        })
    (out / "sandbox_grid.json").write_text(json.dumps({
        "region_id": rid, "is_mock": True, "h3_resolution": 7,
        "landcover_classes": {"10": "tree", "20": "shrub", "30": "grass", "40": "crop",
                              "50": "built", "60": "bare", "80": "water"},
        "cells": grid,
    }, indent=1))

    sats = [("modis", "terra"), ("modis", "aqua"), ("viirs", "snpp"), ("viirs", "noaa20")]
    points, hexday = [], {}
    for _ in range(600):
        c = rng.choice(cells)
        lat, lon = h3.cell_to_latlng(c)
        day = date(2018, 1, 1) + timedelta(days=rng.randrange(0, 365 * 8))
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
        k = (c, day.isoformat(), sat)
        n, s = hexday.get(k, (0, 0.0))
        hexday[k] = (n + 1, s + frp)

    with open(out / "points.sample.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(points[0]))
        w.writeheader()
        w.writerows(sorted(points, key=lambda p: (p["date"], p["time"])))
    with open(out / "hex_day.sample.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["h3", "date", "satellite", "n_points", "frp_sum"])
        for (c, d, sat), (n, s) in sorted(hexday.items(), key=lambda kv: kv[0][1]):
            w.writerow([c, d, sat, n, round(s, 1)])


def main() -> None:
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    try:
        import h3  # noqa: F401, PLC0415
        have_h3 = True
    except ImportError:
        have_h3 = False
    for region in REGIONS:
        out = MOCKS / region["id"]
        out.mkdir(parents=True, exist_ok=True)
        calendar, calibration = build_region(region, now)
        (out / "calendar.json").write_text(json.dumps(calendar, indent=1))
        (out / "calibration.json").write_text(json.dumps(calibration, indent=1))
        v = calibration["validation"]
        print(f"{region['id']}: {len(calendar['months'])} months, raw step x{v['raw_step_ratio']}, "
              f"harmonized step x{v['harmonized_step_ratio']}, test MAPE {v['test_mape']:.0%}")
        if have_h3:
            build_h3_mocks(region, out)
    if not have_h3:
        print("h3 not installed: skipped sandbox_grid.json, points.sample.csv, hex_day.sample.csv "
              "(run with `uv run`, which installs it).")


if __name__ == "__main__":
    main()

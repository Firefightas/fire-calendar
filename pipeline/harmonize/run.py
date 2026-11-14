"""Harmonize one region: hex_day.parquet -> calendar.json + calibration.json.

Method: pipeline/harmonize/README.md (binding) and TEAM_PLAN.md §2. Shapes: contracts/.

Usage (from repo root):
    uv run python -m pipeline.harmonize.run --region rio_negro
    uv run python -m pipeline.harmonize.run --region rio_negro --synthetic --out <dir>

Until P2 lands real data, `--synthetic` builds a small hex_day table in code with
known sensor ratios (SYNTHETIC_TRUTH) so the method can be checked end to end.
Synthetic outputs are always written with is_mock: true.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
REGIONS = {r["id"]: r for r in json.loads((ROOT / "contracts" / "regions.json").read_text())["regions"]}

SATELLITES = ["terra", "aqua", "snpp", "noaa20", "noaa21"]

# Epoch boundaries as (year, month), TEAM_PLAN §2.2 / README table.
AQUA_START = (2002, 7)
SNPP_START = (2012, 2)  # first full S-NPP month (data from 20 Jan 2012)
SNPP_END = (2026, 10)  # last full S-NPP month (stopped 2 Nov 2026)
NOAA20_START = (2018, 4)
NOAA21_START = (2024, 2)  # first full NOAA-21 month (data from 17 Jan 2024)

FIT_YEARS = (2012, 2020)
TEST_YEARS = (2021, 2025)
BASELINE = (2001, 2025)  # clipped to the complete years actually present
STEP_BEFORE, STEP_AFTER = (2009, 2011), (2013, 2015)

ANOMALY_FLOOR = 1.0  # TEAM_PLAN §2.3
MIN_CELL_DAYS = 5  # a monthly ratio needs at least this many cell-days in its denominator
MIN_RATIO_YEARS = 3  # fewer valid fit-year ratios for a calendar month -> pooled factor
NRT_LAG_MONTHS = 5  # standard processing lags ~5 months (TEAM_PLAN §2.4)
Z95 = 1.96

# --- Synthetic input (known ratios) -----------------------------------------------------------

SYNTH_FIRST_DAY, SYNTH_LAST_DAY = "2000-11-01", "2026-11-13"
SYNTH_PEAK_P = 0.04  # daily fire probability per hex at the seasonal peak
# satellite: (sensor, P(detect | fire in hex that day), first day, last day)
SYNTH_SATELLITES = {
    "terra": ("modis", 0.25, "2000-11-01", SYNTH_LAST_DAY),
    "aqua": ("modis", 0.35, "2002-07-04", SYNTH_LAST_DAY),
    "snpp": ("viirs", 1.00, "2012-01-20", "2026-11-01"),
    "noaa20": ("viirs", 0.95, "2018-04-01", SYNTH_LAST_DAY),
    "noaa21": ("viirs", 0.97, "2024-01-17", SYNTH_LAST_DAY),
}
_P_MODIS = 1 - (1 - SYNTH_SATELLITES["terra"][1]) * (1 - SYNTH_SATELLITES["aqua"][1])
SYNTHETIC_TRUTH = {
    "monthly_factor": 1 / _P_MODIS,
    "terra_only_factor": _P_MODIS / SYNTH_SATELLITES["terra"][1],
    "noaa20_factor": 1 / SYNTH_SATELLITES["noaa20"][1],
    "noaa21_factor": 1 / SYNTH_SATELLITES["noaa21"][1],
}


def synthetic_hex_day(region_id: str = "rio_negro", seed: int = 0) -> pd.DataFrame:
    """Small fake hex_day table (contracts/tables.md columns) where every sensor ratio is known.

    Each hex burns on a given day with a seasonal probability; each satellite then sees that
    fire independently with a fixed probability, so the expected cell-day ratios between
    satellites are exactly SYNTHETIC_TRUTH.
    """
    import h3  # noqa: PLC0415

    region = REGIONS[region_id]
    rng = np.random.default_rng(seed)
    lon_c, lat_c = region["center"]
    cells = np.array(sorted(h3.grid_disk(h3.latlng_to_cell(lat_c, lon_c, 7), 11)))
    days = pd.date_range(SYNTH_FIRST_DAY, SYNTH_LAST_DAY)

    peak_month = 1 if region.get("hemisphere") == "south" else 7
    season = np.maximum(0.1, 0.55 + 0.45 * np.cos(2 * np.pi * (days.month.to_numpy() - peak_month) / 12))
    year_effect = {y: math.exp(rng.normal(0, 0.2)) for y in range(days[0].year, days[-1].year + 1)}
    p_fire = SYNTH_PEAK_P * season * days.year.map(year_effect).to_numpy()
    fire = rng.random((len(days), len(cells))) < p_fire[:, None]

    frames = []
    for satellite, (sensor, p_detect, first, last) in SYNTH_SATELLITES.items():
        flying = np.asarray((days >= first) & (days <= last))
        seen = fire & flying[:, None] & (rng.random(fire.shape) < p_detect)
        d, c = np.nonzero(seen)
        n_points = 1 + rng.poisson(0.3 if sensor == "modis" else 3.0, len(d))
        frames.append(pd.DataFrame({
            "h3": cells[c], "date": days.date[d], "sensor": sensor, "satellite": satellite,
            "n_points": n_points.astype("int32"),
            "frp_sum": np.round(n_points * rng.lognormal(2.0, 1.0, len(d)), 1),
        }))
    return pd.concat(frames, ignore_index=True).sort_values(["date", "satellite", "h3"], ignore_index=True)


# --- Step 1: monthly cell-days ----------------------------------------------------------------

def _t(year, month):
    """Month index, so (year, month) pairs compare and subtract like integers."""
    return year * 12 + month - 1


def _window(monthly: pd.DataFrame, start: tuple[int, int], end: tuple[int, int]) -> pd.DataFrame:
    t = _t(monthly["year"], monthly["month"])
    return monthly[(t >= _t(*start)) & (t <= _t(*end))]


def monthly_cell_days(hex_day: pd.DataFrame) -> pd.DataFrame:
    """One row per month from the first to the last data month: cell-days per satellite, plus
    `modis` = distinct (h3, date) over Terra+Aqua (a hex seen by both on one day counts once)."""
    dates = pd.to_datetime(hex_day["date"])
    df = pd.DataFrame({"h3": hex_day["h3"].to_numpy(), "date": dates.to_numpy(),
                       "sensor": hex_day["sensor"].to_numpy(), "satellite": hex_day["satellite"].to_numpy(),
                       "year": dates.dt.year.to_numpy(), "month": dates.dt.month.to_numpy()})
    df = df.drop_duplicates(["h3", "date", "satellite"])
    per_sat = df.groupby(["year", "month", "satellite"]).size().unstack("satellite", fill_value=0)
    modis = df[df["sensor"] == "modis"].drop_duplicates(["h3", "date"]).groupby(["year", "month"]).size()

    first, last = dates.min(), dates.max()
    span = range(_t(first.year, first.month), _t(last.year, last.month) + 1)
    idx = pd.MultiIndex.from_tuples([(t // 12, t % 12 + 1) for t in span], names=["year", "month"])
    out = per_sat.reindex(index=idx, columns=SATELLITES, fill_value=0)
    out["modis"] = modis.reindex(idx, fill_value=0)
    return out.astype(int).reset_index()


# --- Steps 3-4: factors, fit years only -------------------------------------------------------

def _ratios(rows: pd.DataFrame, num: str, den: str) -> pd.Series:
    """Monthly num/den, only where the denominator is not sparse and the numerator is non-zero."""
    ok = (rows[den] >= MIN_CELL_DAYS) & (rows[num] > 0)
    return rows.loc[ok, num] / rows.loc[ok, den]


def _cv(ratios: pd.Series) -> float:
    return float(ratios.std(ddof=0) / ratios.mean()) if len(ratios) else 0.0


def _single_factor(rows: pd.DataFrame, num: str, den: str) -> dict:
    r = _ratios(rows, num, den)
    if r.empty:  # no overlap in the data: neutral factor, flagged as not measured
        return {"factor": 1.0, "cv": 0.0, "n_months": 0, "measured": False}
    return {"factor": float(r.median()), "cv": _cv(r), "n_months": int(len(r)), "measured": True}


def fit_factors(monthly: pd.DataFrame) -> dict:
    """All conversion factors to SNPP_VIIRS_EQ. Reads only fit-year rows, except noaa21 (see below)."""
    fit = _window(monthly, max(SNPP_START, (FIT_YEARS[0], 1)), (FIT_YEARS[1], 12))
    ratios = _ratios(fit, "snpp", "modis")
    if ratios.empty:
        raise ValueError(f"no usable S-NPP/MODIS overlap months in {FIT_YEARS}: cannot calibrate")
    pooled, pooled_cv = float(ratios.median()), _cv(ratios)

    monthly_factors = []
    for m in range(1, 13):
        r = ratios[fit.loc[ratios.index, "month"] == m]
        fallback = len(r) < MIN_RATIO_YEARS
        monthly_factors.append({"month": m, "factor": pooled if fallback else float(r.median()),
                                "cv": pooled_cv if fallback else _cv(r), "n_years": int(len(r)),
                                "fallback": bool(fallback)})

    noaa20_fit = _window(monthly, NOAA20_START, (FIT_YEARS[1], 12))
    # NOAA-21 launched after the fit years, so its only overlap with S-NPP is 2024 -> Oct 2026.
    noaa21_fit = _window(monthly, NOAA21_START, SNPP_END)
    return {
        "monthly": monthly_factors,
        "terra_only": _single_factor(fit, "modis", "terra"),
        "noaa20": _single_factor(noaa20_fit, "snpp", "noaa20"),
        "noaa21": _single_factor(noaa21_fit, "snpp", "noaa21"),
        # Orbit check (README step 3): afternoon Aqua vs. morning Terra against S-NPP.
        "aqua_to_snpp": _single_factor(fit, "snpp", "aqua"),
        "terra_to_snpp": _single_factor(fit, "snpp", "terra"),
    }


# --- Steps 3, 6, 7: harmonized series, uncertainty, IQR Anomaly Score -------------------------

def harmonize(monthly: pd.DataFrame, factors: dict) -> pd.DataFrame:
    """Add modis_raw, viirs_raw, harmonized, source, is_estimated, unc_low, unc_high per month."""
    mf = {f["month"]: f for f in factors["monthly"]}
    terra, n20, n21 = factors["terra_only"], factors["noaa20"], factors["noaa21"]
    rows = []
    for r in monthly.to_dict("records"):
        ym, f = (r["year"], r["month"]), mf[r["month"]]
        if ym < AQUA_START:
            h, cv = r["terra"] * terra["factor"] * f["factor"], math.hypot(f["cv"], terra["cv"])
            modis_raw, viirs_raw, source = r["terra"], None, "modis_terra"
        elif ym < SNPP_START:
            h, cv = r["modis"] * f["factor"], f["cv"]
            modis_raw, viirs_raw, source = r["modis"], None, "modis_terra_aqua"
        elif ym <= SNPP_END:
            h, cv = r["snpp"], 0.0
            modis_raw, viirs_raw, source = r["modis"], r["snpp"], "viirs_snpp"
        elif r["noaa20"] == 0 and r["noaa21"] > 0:
            h, cv = r["noaa21"] * n21["factor"], n21["cv"]
            modis_raw, viirs_raw, source = r["modis"], r["noaa21"], "viirs_noaa21"
        else:
            h, cv = r["noaa20"] * n20["factor"], n20["cv"]
            modis_raw, viirs_raw, source = r["modis"], r["noaa20"], "viirs_noaa20"
        half = Z95 * math.sqrt(h + (cv * h) ** 2)  # Poisson count noise + factor spread
        rows.append({"year": r["year"], "month": r["month"], "modis_raw": modis_raw, "viirs_raw": viirs_raw,
                     "harmonized": h, "is_estimated": viirs_raw is None, "source": source,
                     "unc_low": max(0.0, h - half), "unc_high": h + half})
    return pd.DataFrame(rows)


def baseline_years(first_day: pd.Timestamp, last_day: pd.Timestamp) -> tuple[int, int]:
    """Complete calendar years inside BASELINE."""
    first = first_day.year if (first_day.month, first_day.day) == (1, 1) else first_day.year + 1
    last = last_day.year if (last_day.month, last_day.day) == (12, 31) else last_day.year - 1
    return max(BASELINE[0], first), min(BASELINE[1], last)


def add_anomaly(series: pd.DataFrame, baseline: tuple[int, int]) -> pd.DataFrame:
    """IQR Anomaly Score (Z_IQR) per calendar month: (H - median) / max(IQR, ANOMALY_FLOOR)."""
    base = series[series["year"].between(*baseline)].groupby("month")["harmonized"]
    stats = pd.DataFrame({"median_m": base.median(), "iqr_m": base.quantile(0.75) - base.quantile(0.25)})
    out = series.join(stats.reindex(range(1, 13), fill_value=0.0), on="month")
    out["anomaly_z"] = (out["harmonized"] - out["median_m"]) / out["iqr_m"].clip(lower=ANOMALY_FLOOR)
    return out


# --- Step 5: held-out validation ---------------------------------------------------------------

def validate(monthly: pd.DataFrame, series: pd.DataFrame, factors: dict) -> dict:
    """Predict S-NPP from MODIS on the test years with the fit-year factors."""
    test = _window(monthly, (TEST_YEARS[0], 1), min(SNPP_END, (TEST_YEARS[1], 12)))
    if test.empty:
        raise ValueError(f"no S-NPP months in test years {TEST_YEARS}: cannot compute test_mae")
    factor = test["month"].map({f["month"]: f["factor"] for f in factors["monthly"]})
    err = (test["modis"] * factor - test["snpp"]).abs()
    out = {"test_mae": float(err.mean())}
    seen = test["snpp"] > 0
    if seen.any():
        out["test_mape"] = float((err[seen] / test.loc[seen, "snpp"]).mean())

    naive = series["viirs_raw"].fillna(series["modis_raw"])  # what you get by just switching sensors
    before, after = series["year"].between(*STEP_BEFORE), series["year"].between(*STEP_AFTER)
    if before.any() and after.any() and naive[before].mean() > 0 and series.loc[before, "harmonized"].mean() > 0:
        out["raw_step_ratio"] = float(naive[after].mean() / naive[before].mean())
        out["harmonized_step_ratio"] = float(series.loc[after, "harmonized"].mean()
                                             / series.loc[before, "harmonized"].mean())

    if factors["noaa20"]["measured"]:
        out["noaa20_test_mae"] = float((test["noaa20"] * factors["noaa20"]["factor"] - test["snpp"]).abs().mean())
    return out


# --- Outputs ------------------------------------------------------------------------------------

def _ym(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def build_outputs(hex_day: pd.DataFrame, region_id: str, is_mock: bool) -> tuple[dict, dict]:
    """(calendar, calibration) dicts matching contracts/*.schema.json."""
    dates = pd.to_datetime(hex_day["date"])
    first_day, last_day = dates.min(), dates.max()
    monthly = monthly_cell_days(hex_day)
    factors = fit_factors(monthly)
    baseline = baseline_years(first_day, last_day)
    series = add_anomaly(harmonize(monthly, factors), baseline)
    metrics = validate(monthly, series, factors)
    # hex_day has no is_nrt column: flag the months inside the standard-processing lag.
    nrt_from = _t(last_day.year, last_day.month) - NRT_LAG_MONTHS
    now = datetime.now(UTC).replace(microsecond=0).isoformat()

    months = []
    for r in series.to_dict("records"):
        months.append({
            "year": int(r["year"]), "month": int(r["month"]),
            "modis_raw": round(float(r["modis_raw"]), 1),
            "viirs_raw": None if pd.isna(r["viirs_raw"]) else round(float(r["viirs_raw"]), 1),
            "harmonized": round(r["harmonized"], 1),
            "is_estimated": bool(r["is_estimated"]),
            "is_nrt": bool(_t(r["year"], r["month"]) >= nrt_from),
            "median_m": round(r["median_m"], 1), "iqr_m": round(r["iqr_m"], 1),
            "anomaly_z": round(r["anomaly_z"], 2),
            "unc_low": round(r["unc_low"], 1), "unc_high": round(r["unc_high"], 1),
            "source": r["source"],
        })
    calendar = {
        "region_id": region_id, "unit": "active_fire_cell_days", "scale": "SNPP_VIIRS_EQ",
        "is_mock": is_mock, "generated_at": now,
        "first_month": _ym(months[0]["year"], months[0]["month"]),
        "last_month": _ym(months[-1]["year"], months[-1]["month"]),
        "baseline_years": list(baseline),
        "months": months,
    }

    def diag(f: dict) -> dict:
        return {"factor": round(f["factor"], 3), "cv": round(f["cv"], 3), "n_months": f["n_months"],
                "measured": f["measured"]}

    diagnostics = {
        "input": "synthetic hex_day with known ratios (MOCK)" if is_mock else "hex_day.parquet",
        "last_data_date": last_day.date().isoformat(),
        "min_cell_days_per_ratio": MIN_CELL_DAYS, "min_ratio_years": MIN_RATIO_YEARS,
        "fit_windows": {
            "monthly_factors": [_ym(*max(SNPP_START, (FIT_YEARS[0], 1))), _ym(FIT_YEARS[1], 12)],
            "terra_only_factor": [_ym(*max(SNPP_START, (FIT_YEARS[0], 1))), _ym(FIT_YEARS[1], 12)],
            "noaa20_factor": [_ym(*NOAA20_START), _ym(FIT_YEARS[1], 12)],
            "noaa21_factor": [_ym(*NOAA21_START), _ym(*SNPP_END)],
        },
        "noaa21_note": "NOAA-21 has no overlap with S-NPP inside fit_years; fitted on its whole overlap",
        "terra_only": diag(factors["terra_only"]),
        "noaa20": diag(factors["noaa20"]),
        "noaa21": diag(factors["noaa21"]),
        "orbit_check": {"aqua_to_snpp": diag(factors["aqua_to_snpp"]),
                        "terra_to_snpp": diag(factors["terra_to_snpp"])},
    }
    if "noaa20_test_mae" in metrics:
        diagnostics["noaa20"]["test_mae"] = round(metrics["noaa20_test_mae"], 2)
    if is_mock:
        diagnostics["synthetic_truth"] = {k: round(v, 3) for k, v in SYNTHETIC_TRUTH.items()}

    calibration = {
        "region_id": region_id, "is_mock": is_mock, "generated_at": now,
        "method": "overlap median ratio of active fire cell-days per calendar month"
                  + (" (SYNTHETIC INPUT, MOCK)" if is_mock else ""),
        "target_scale": "SNPP_VIIRS_EQ",
        "fit_years": list(FIT_YEARS), "test_years": list(TEST_YEARS),
        "test_mae": round(metrics["test_mae"], 2),
        "terra_only_factor": round(factors["terra_only"]["factor"], 3),
        "noaa20_factor": round(factors["noaa20"]["factor"], 3),
        "noaa21_factor": round(factors["noaa21"]["factor"], 3),
        "monthly_factors": [{**f, "factor": round(f["factor"], 3), "cv": round(f["cv"], 3)}
                            for f in factors["monthly"]],
    }
    for key, digits in (("test_mape", 3), ("raw_step_ratio", 2), ("harmonized_step_ratio", 2)):
        if key in metrics:
            calibration[key] = round(metrics[key], digits)
    calibration["diagnostics"] = diagnostics
    return calendar, calibration


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--region", required=True, choices=sorted(REGIONS))
    parser.add_argument("--synthetic", action="store_true",
                        help="use a synthetic hex_day table with known ratios (outputs are is_mock: true)")
    parser.add_argument("--out", type=Path, help="output folder (default: data/processed/<region>)")
    args = parser.parse_args(argv)

    if args.synthetic:
        if args.out is None:
            # The backend treats data/processed/<region>/calendar.json as real data.
            parser.error("--synthetic needs an explicit --out")
        hex_day = synthetic_hex_day(args.region)
    else:
        path = PROCESSED / args.region / "hex_day.parquet"
        if not path.exists():
            parser.error(f"{path} not found (P2 has not landed it yet); use --synthetic --out <dir>")
        hex_day = pd.read_parquet(path)

    calendar, calibration = build_outputs(hex_day, args.region, is_mock=args.synthetic)
    out = args.out or PROCESSED / args.region
    out.mkdir(parents=True, exist_ok=True)
    (out / "calendar.json").write_text(json.dumps(calendar, indent=1))
    (out / "calibration.json").write_text(json.dumps(calibration, indent=1))

    factors = [f["factor"] for f in calibration["monthly_factors"]]
    print(f"{args.region}{' (SYNTHETIC)' if args.synthetic else ''}: {len(calendar['months'])} months -> {out}")
    print(f"  monthly factors {min(factors)}..{max(factors)}, terra_only {calibration['terra_only_factor']}, "
          f"noaa20 {calibration['noaa20_factor']}, noaa21 {calibration['noaa21_factor']}")
    print(f"  test MAE {calibration['test_mae']} cell-days (MAPE {calibration.get('test_mape')}), 2012 step "
          f"raw x{calibration.get('raw_step_ratio')} -> harmonized x{calibration.get('harmonized_step_ratio')}")


if __name__ == "__main__":
    main()

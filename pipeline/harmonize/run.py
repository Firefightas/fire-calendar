"""Harmonize one region: hex_day.parquet -> calendar.json, calibration.json, hex_fire_history.parquet.

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

import h3
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
_REGIONS_FILE = ROOT / "contracts" / "regions.json"
REGIONS = {r["id"]: r for r in json.loads(_REGIONS_FILE.read_text(encoding="utf-8"))["regions"]}

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

# peak_event: the month's dominant fire cluster, for the NASA GIBS before/after imagery slider.
PEAK_RINGS = 6  # res-7 rings around the cluster's centre hex, a radius of about 15 km
PEAK_PAD = 1.25  # bbox grows by this factor around its centre
PEAK_MIN_SPAN = (0.60, 0.45)  # degrees lon x lat, so GIBS level 9 (~305 m) is never overzoomed
# Before/after imagery dates and labels chosen by P1 for the flagship months. They are not derived
# from the hotspot tables: the dates were picked for cloud-free imagery, not computed here.
VERIFIED_EVENTS = {
    ("rio_negro", 2017, 1): ("2016-12-15", "2017-01-26", "Río Negro Jan 2017 mega-fire scar"),
    ("rio_negro", 2016, 12): ("2016-12-02", "2017-01-12", "Río Negro Dec 2016 outbreak"),
    ("rio_negro", 2001, 1): ("2000-12-12", "2001-02-02", "Río Negro Jan 2001 Terra extreme fire"),
    ("california", 2021, 8): ("2021-07-10", "2021-09-15", "Aug 2021 Northern California fire cluster"),
    ("california", 2020, 9): ("2020-08-14", "2020-10-08", "Sep 2020 California Creek / August Complex scar"),
}
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


def _cell_days(hex_day: pd.DataFrame) -> pd.DataFrame:
    """One row per (hex, day, satellite) with year and month columns."""
    dates = pd.to_datetime(hex_day["date"])
    df = pd.DataFrame({"h3": hex_day["h3"].to_numpy(), "date": dates.to_numpy(),
                       "sensor": hex_day["sensor"].to_numpy(), "satellite": hex_day["satellite"].to_numpy(),
                       "year": dates.dt.year.to_numpy(), "month": dates.dt.month.to_numpy()})
    return df.drop_duplicates(["h3", "date", "satellite"])


def monthly_cell_days(hex_day: pd.DataFrame) -> pd.DataFrame:
    """One row per month from the first to the last data month: cell-days per satellite, plus
    `modis` = distinct (h3, date) over Terra+Aqua (a hex seen by both on one day counts once)."""
    df = _cell_days(hex_day)
    dates = df["date"]
    per_sat = df.groupby(["year", "month", "satellite"]).size().unstack("satellite", fill_value=0)
    modis = df[df["sensor"] == "modis"].drop_duplicates(["h3", "date"]).groupby(["year", "month"]).size()

    first, last = dates.min(), dates.max()
    span = range(_t(first.year, first.month), _t(last.year, last.month) + 1)
    idx = pd.MultiIndex.from_tuples([(t // 12, t % 12 + 1) for t in span], names=["year", "month"])
    out = per_sat.reindex(index=idx, columns=SATELLITES, fill_value=0)
    out["modis"] = modis.reindex(idx, fill_value=0)
    return out.astype(int).reset_index()


def snpp_last_month(hex_day: pd.DataFrame) -> tuple[int, int]:
    """Last month S-NPP can serve as the reference: its last complete month of data, at most SNPP_END.

    The standard-processing archive can stop months before the satellite did (S-NPP NRT is never
    used, TEAM_PLAN §2.4). Those missing months are not zero fire: NOAA-20 takes over from there.
    """
    dates = pd.to_datetime(hex_day.loc[hex_day["satellite"] == "snpp", "date"])
    if dates.empty:
        return SNPP_END
    last = dates.max()
    t = _t(last.year, last.month) - (0 if last.is_month_end else 1)
    return min(SNPP_END, (t // 12, t % 12 + 1))


def nrt_months(points: pd.DataFrame) -> set[tuple[int, int, str]]:
    """(year, month, satellite) combinations that contain near-real-time detections."""
    nrt = points[points["is_nrt"].astype(bool)]
    dates = pd.to_datetime(nrt["date"])
    return set(zip(dates.dt.year, dates.dt.month, nrt["satellite"], strict=True))


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


def _fit_window(monthly: pd.DataFrame) -> pd.DataFrame:
    return _window(monthly, max(SNPP_START, (FIT_YEARS[0], 1)), (FIT_YEARS[1], 12))


def _monthly_factors(fit: pd.DataFrame, num: str, den: str) -> list[dict]:
    """Median num/den per calendar month; a month with too few ratios takes the pooled median."""
    ratios = _ratios(fit, num, den)
    if ratios.empty:
        return []
    pooled, pooled_cv = float(ratios.median()), _cv(ratios)
    out = []
    for m in range(1, 13):
        r = ratios[fit.loc[ratios.index, "month"] == m]
        fallback = len(r) < MIN_RATIO_YEARS
        out.append({"month": m, "factor": pooled if fallback else float(r.median()),
                    "cv": pooled_cv if fallback else _cv(r), "n_years": int(len(r)), "fallback": bool(fallback)})
    return out


def fit_factors(monthly: pd.DataFrame, snpp_end: tuple[int, int] = SNPP_END) -> dict:
    """All conversion factors to SNPP_VIIRS_EQ. Reads only fit-year rows, except noaa21 (see below).

    snpp_end is the last month with complete S-NPP data (see snpp_last_month)."""
    fit = _fit_window(monthly)
    monthly_factors = _monthly_factors(fit, "snpp", "modis")
    if not monthly_factors:
        raise ValueError(f"no usable S-NPP/MODIS overlap months in {FIT_YEARS}: cannot calibrate")
    noaa20_fit = _window(monthly, NOAA20_START, (FIT_YEARS[1], 12))
    # NOAA-21 launched after the fit years, so its only overlap with S-NPP is 2024 -> Oct 2026.
    noaa21_fit = _window(monthly, NOAA21_START, snpp_end)
    return {
        "snpp_end": snpp_end,
        "monthly": monthly_factors,
        "terra_only": _single_factor(fit, "modis", "terra"),
        "noaa20": _single_factor(noaa20_fit, "snpp", "noaa20"),
        "noaa21": _single_factor(noaa21_fit, "snpp", "noaa21"),
    }


# --- Steps 3, 6, 7: harmonized series, uncertainty, IQR Anomaly Score -------------------------

def _epoch(r: dict, factors: dict) -> tuple[str, float, float, str]:
    """(count column, factor, cv, source) that give one month its harmonized value (README table)."""
    ym, f = (r["year"], r["month"]), factors["monthly"][r["month"] - 1]
    terra, n20, n21 = factors["terra_only"], factors["noaa20"], factors["noaa21"]
    if ym < AQUA_START:
        return "terra", terra["factor"] * f["factor"], math.hypot(f["cv"], terra["cv"]), "modis_terra"
    if ym < SNPP_START:
        return "modis", f["factor"], f["cv"], "modis_terra_aqua"
    if ym <= factors["snpp_end"]:
        return "snpp", 1.0, 0.0, "viirs_snpp"
    if r["noaa20"] == 0 and r["noaa21"] > 0:
        return "noaa21", n21["factor"], n21["cv"], "viirs_noaa21"
    return "noaa20", n20["factor"], n20["cv"], "viirs_noaa20"


def harmonize(monthly: pd.DataFrame, factors: dict) -> pd.DataFrame:
    """Add modis_raw, viirs_raw, harmonized, source, is_estimated, unc_low, unc_high per month."""
    rows = []
    for r in monthly.to_dict("records"):
        column, factor, cv, source = _epoch(r, factors)
        from_modis = source.startswith("modis")
        h = r[column] * factor
        half = Z95 * math.sqrt(h + (cv * h) ** 2)  # Poisson count noise + factor spread
        rows.append({"year": r["year"], "month": r["month"],
                     "modis_raw": r[column] if from_modis else r["modis"],
                     "viirs_raw": None if from_modis else r[column],
                     "harmonized": h, "is_estimated": from_modis, "source": source,
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


def month_to_date_anomaly(series: pd.DataFrame, hex_day: pd.DataFrame, factors: dict,
                          baseline: tuple[int, int], last_day: pd.Timestamp) -> pd.DataFrame:
    """Score an incomplete last month against the same days of that month in the baseline years.

    Without this, a month with 13 days of data is compared with full-month medians and always
    looks unusually quiet. Only the last row's median_m, iqr_m and anomaly_z change.
    """
    dates = pd.to_datetime(hex_day["date"])
    same_days = hex_day[((dates.dt.month == last_day.month) & (dates.dt.day <= last_day.day)).to_numpy()]
    to_date = harmonize(monthly_cell_days(same_days), factors)
    to_date = to_date[to_date["month"] == last_day.month].set_index("year")["harmonized"]
    values = to_date.reindex(range(baseline[0], baseline[1] + 1), fill_value=0.0)
    if values.empty:
        return series
    median, iqr = values.median(), values.quantile(0.75) - values.quantile(0.25)
    out, last = series.copy(), series.index[-1]
    out.loc[last, ["median_m", "iqr_m"]] = [median, iqr]
    out.loc[last, "anomaly_z"] = (out.loc[last, "harmonized"] - median) / max(iqr, ANOMALY_FLOOR)
    return out


# --- Step 5: held-out validation ---------------------------------------------------------------

def _test_window(monthly: pd.DataFrame) -> pd.DataFrame:
    return _window(monthly, (TEST_YEARS[0], 1), min(SNPP_END, (TEST_YEARS[1], 12)))


def _test_error(test: pd.DataFrame, column: str, monthly_factors: list[dict]) -> dict:
    """Error of `column` x its monthly factor as a prediction of S-NPP on the test months."""
    factor = test["month"].map({f["month"]: f["factor"] for f in monthly_factors})
    err = (test[column] * factor - test["snpp"]).abs()
    out = {"test_mae": float(err.mean())}
    seen = test["snpp"] > 0
    if seen.any():
        out["test_mape"] = float((err[seen] / test.loc[seen, "snpp"]).mean())
    return out


def orbit_check(monthly: pd.DataFrame) -> dict:
    """Does afternoon Aqua track afternoon S-NPP better than morning Terra does? (TEAM_PLAN §2.2)

    Each MODIS record (Aqua only, Terra only, both combined) gets its own monthly factors to
    S-NPP on the fit years and is scored on the test years. Diagnostics only: the calendar
    always uses the combined record.
    """
    fit, test = _fit_window(monthly), _test_window(monthly)
    out = {}
    for name, column in (("aqua_only", "aqua"), ("terra_only", "terra"), ("terra_aqua_combined", "modis")):
        factors = _monthly_factors(fit, "snpp", column)
        if not factors or test.empty:
            continue
        overall = _single_factor(fit, "snpp", column)
        out[name] = {"factor": overall["factor"], "ratio_cv": overall["cv"], "n_months": overall["n_months"],
                     "monthly_factors": [f["factor"] for f in factors], **_test_error(test, column, factors)}
    scored = {name: r["test_mape"] for name, r in out.items() if "test_mape" in r}
    if scored:
        out["lowest_test_mape"] = min(scored, key=scored.get)
    return out


def validate(monthly: pd.DataFrame, series: pd.DataFrame, factors: dict) -> dict:
    """Predict S-NPP from MODIS on the test years with the fit-year factors."""
    test = _test_window(monthly)
    if test.empty:
        raise ValueError(f"no S-NPP months in test years {TEST_YEARS}: cannot compute test_mae")
    out = _test_error(test, "modis", factors["monthly"])

    naive = series["viirs_raw"].fillna(series["modis_raw"])  # what you get by just switching sensors
    before, after = series["year"].between(*STEP_BEFORE), series["year"].between(*STEP_AFTER)
    if before.any() and after.any() and naive[before].mean() > 0 and series.loc[before, "harmonized"].mean() > 0:
        out["raw_step_ratio"] = float(naive[after].mean() / naive[before].mean())
        out["harmonized_step_ratio"] = float(series.loc[after, "harmonized"].mean()
                                             / series.loc[before, "harmonized"].mean())

    # Same step on MODIS alone (one sensor family throughout): how much of the change is real fire.
    modis_before = _window(monthly, (STEP_BEFORE[0], 1), (STEP_BEFORE[1], 12))["modis"]
    modis_after = _window(monthly, (STEP_AFTER[0], 1), (STEP_AFTER[1], 12))["modis"]
    if len(modis_before) and len(modis_after) and modis_before.mean() > 0:
        out["modis_only_step_ratio"] = float(modis_after.mean() / modis_before.mean())

    if factors["noaa20"]["measured"]:
        out["noaa20_test_mae"] = float((test["noaa20"] * factors["noaa20"]["factor"] - test["snpp"]).abs().mean())
    return out


# --- Step 9: fire history per hex, for the sandbox grid ---------------------------------------

def fire_history(hex_day: pd.DataFrame, monthly: pd.DataFrame, factors: dict) -> pd.DataFrame:
    """hex_fire_history table (contracts/tables.md): one row per hex with at least one detection.

    burn_count uses the same satellite and factor as the calendar does for each month, so the
    hexes of a region add up to the region's harmonized series. years_since_last_fire counts from
    the hex's last detection by any satellite to the latest data date.
    """
    df = _cell_days(hex_day)
    epochs = pd.DataFrame([(r["year"], r["month"], *_epoch(r, factors)[:2]) for r in monthly.to_dict("records")],
                          columns=["year", "month", "column", "factor"])
    df = df.merge(epochs, on=["year", "month"])
    counted = df[(df["satellite"] == df["column"]) | ((df["column"] == "modis") & (df["sensor"] == "modis"))]
    counted = counted.drop_duplicates(["h3", "date"])  # Terra+Aqua on the same day count once
    last_fire = df.groupby("h3")["date"].max()
    out = pd.DataFrame({
        "burn_count": counted.groupby("h3")["factor"].sum().reindex(last_fire.index, fill_value=0.0).round(2),
        "years_since_last_fire": ((df["date"].max() - last_fire).dt.days / 365.25).round(2),
    })
    return out.reset_index()


# --- Outputs ------------------------------------------------------------------------------------

def _padded_span(low: float, high: float, min_span: float, bound_low: float, bound_high: float) -> tuple:
    """[low, high] grown by PEAK_PAD around its centre to at least min_span, kept inside the bounds."""
    span = min(max((high - low) * PEAK_PAD, min_span), bound_high - bound_low)
    start = min(max((low + high - span) / 2, bound_low), bound_high - span)  # shift before shrinking
    return round(start, 4), round(start + span, 4)


def peak_events(hex_day: pd.DataFrame, region_id: str) -> dict[tuple[int, int], dict]:
    """Per (year, month) with fire: bbox and date window of the month's densest fire cluster.

    The cluster is every active hex within PEAK_RINGS of the hex whose neighbourhood holds the most
    cell-days in the month (ties: most active days in the hex itself, highest frp_sum, then h3).
    The hex with the most active days alone is not used: it is often a static source that burns
    every day with nothing around it. bbox is [west, south, east, north] of the hex centres,
    padded and kept inside the region bbox."""
    west, south, east, north = REGIONS[region_id]["bbox"]
    days = _cell_days(hex_day).drop_duplicates(["h3", "date"])
    dates = pd.to_datetime(hex_day["date"])
    frp = hex_day["frp_sum"].groupby([dates.dt.year.to_numpy(), dates.dt.month.to_numpy(),
                                     hex_day["h3"].to_numpy()]).sum()
    events = {}
    for (year, month), rows in days.groupby(["year", "month"]):
        active = rows.groupby("h3").size().to_dict()
        nearby = {h: sum(active.get(x, 0) for x in h3.grid_disk(h, PEAK_RINGS)) for h in active}
        peak = min(active, key=lambda h: (-nearby[h], -active[h], -frp.get((year, month, h), 0.0), h))
        cluster = set(h3.grid_disk(peak, PEAK_RINGS)) & set(active)
        window = rows.loc[rows["h3"].isin(cluster), "date"]
        centres = [h3.cell_to_latlng(h) for h in cluster]
        lats, lons = [c[0] for c in centres], [c[1] for c in centres]
        w, e = _padded_span(min(lons), max(lons), PEAK_MIN_SPAN[0], west, east)
        s, n = _padded_span(min(lats), max(lats), PEAK_MIN_SPAN[1], south, north)
        event = {"bbox": [w, s, e, n], "first_date": window.min().date().isoformat(),
                 "last_date": window.max().date().isoformat()}
        verified = VERIFIED_EVENTS.get((region_id, int(year), int(month)))
        if verified:
            event |= dict(zip(("verified_before_date", "verified_after_date", "label"), verified, strict=True))
        events[int(year), int(month)] = event
    return events


def _rounded(x, digits: int = 3):
    if isinstance(x, dict):
        return {k: _rounded(v, digits) for k, v in x.items()}
    if isinstance(x, list):
        return [_rounded(v, digits) for v in x]
    return round(x, digits) if isinstance(x, float) else x


def _ym(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def build_outputs(hex_day: pd.DataFrame, region_id: str, is_mock: bool,
                  points: pd.DataFrame | None = None) -> tuple[dict, dict, pd.DataFrame]:
    """(calendar, calibration) dicts matching contracts/*.schema.json, and the hex_fire_history table.

    points (points.parquet, optional) gives the real SP/NRT provenance for is_nrt; without it the
    months inside the standard-processing lag are flagged."""
    dates = pd.to_datetime(hex_day["date"])
    first_day, last_day = dates.min(), dates.max()
    monthly = monthly_cell_days(hex_day)
    factors = fit_factors(monthly, snpp_last_month(hex_day))
    baseline = baseline_years(first_day, last_day)
    series = add_anomaly(harmonize(monthly, factors), baseline)
    last_month_complete = bool(last_day.is_month_end)
    if not last_month_complete:
        series = month_to_date_anomaly(series, hex_day, factors, baseline, last_day)
    metrics = validate(monthly, series, factors)
    # hex_day has no is_nrt column: use points.parquet if given, else the standard-processing lag.
    nrt_from = _t(last_day.year, last_day.month) - NRT_LAG_MONTHS
    nrt = None if points is None else nrt_months(points)
    source_satellites = {"modis_terra": ("terra",), "modis_terra_aqua": ("terra", "aqua"), "viirs_snpp": ("snpp",),
                         "viirs_noaa20": ("noaa20",), "viirs_noaa21": ("noaa21",)}

    def is_nrt(r: dict) -> bool:
        if nrt is None:
            return bool(_t(r["year"], r["month"]) >= nrt_from)
        return any((r["year"], r["month"], s) in nrt for s in source_satellites[r["source"]])
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    events = peak_events(hex_day, region_id)

    months = []
    for r in series.to_dict("records"):
        months.append({
            "year": int(r["year"]), "month": int(r["month"]),
            "modis_raw": round(float(r["modis_raw"]), 1),
            "viirs_raw": None if pd.isna(r["viirs_raw"]) else round(float(r["viirs_raw"]), 1),
            "harmonized": round(r["harmonized"], 1),
            "is_estimated": bool(r["is_estimated"]),
            "is_nrt": is_nrt(r),
            "median_m": round(r["median_m"], 1), "iqr_m": round(r["iqr_m"], 1),
            "anomaly_z": round(r["anomaly_z"], 2),
            "unc_low": round(r["unc_low"], 1), "unc_high": round(r["unc_high"], 1),
            "source": r["source"],
        })
        if (months[-1]["year"], months[-1]["month"]) in events:
            months[-1]["peak_event"] = events[months[-1]["year"], months[-1]["month"]]
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
        "last_month_complete": last_month_complete,
        "snpp_reference_until": _ym(*factors["snpp_end"]),
        "is_nrt_rule": "points.parquet provenance" if points is not None else f"last {NRT_LAG_MONTHS + 1} data months",
        "min_cell_days_per_ratio": MIN_CELL_DAYS, "min_ratio_years": MIN_RATIO_YEARS,
        "fit_windows": {
            "monthly_factors": [_ym(*max(SNPP_START, (FIT_YEARS[0], 1))), _ym(FIT_YEARS[1], 12)],
            "terra_only_factor": [_ym(*max(SNPP_START, (FIT_YEARS[0], 1))), _ym(FIT_YEARS[1], 12)],
            "noaa20_factor": [_ym(*NOAA20_START), _ym(FIT_YEARS[1], 12)],
            "noaa21_factor": [_ym(*NOAA21_START), _ym(*factors["snpp_end"])],
        },
        "noaa21_note": "NOAA-21 has no overlap with S-NPP inside fit_years; fitted on its whole overlap",
        "terra_only": diag(factors["terra_only"]),
        "noaa20": diag(factors["noaa20"]),
        "noaa21": diag(factors["noaa21"]),
        "orbit_check": _rounded(orbit_check(monthly)),
    }
    if "modis_only_step_ratio" in metrics:
        diagnostics["modis_only_step_ratio"] = round(metrics["modis_only_step_ratio"], 2)
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
    return calendar, calibration, fire_history(hex_day, monthly, factors)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--region", required=True, choices=sorted(REGIONS))
    parser.add_argument("--synthetic", action="store_true",
                        help="use a synthetic hex_day table with known ratios (outputs are is_mock: true)")
    parser.add_argument("--out", type=Path, help="output folder (default: data/processed/<region>)")
    args = parser.parse_args(argv)

    points = None
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
        if (path.parent / "points.parquet").exists():
            points = pd.read_parquet(path.parent / "points.parquet", columns=["date", "satellite", "is_nrt"])

    calendar, calibration, history = build_outputs(hex_day, args.region, is_mock=args.synthetic, points=points)
    out = args.out or PROCESSED / args.region
    out.mkdir(parents=True, exist_ok=True)
    (out / "calendar.json").write_text(json.dumps(calendar, indent=1), encoding="utf-8")
    (out / "calibration.json").write_text(json.dumps(calibration, indent=1), encoding="utf-8")
    history.to_parquet(out / "hex_fire_history.parquet", index=False)

    factors = [f["factor"] for f in calibration["monthly_factors"]]
    print(f"{args.region}{' (SYNTHETIC)' if args.synthetic else ''}: {len(calendar['months'])} months -> {out}")
    print(f"  monthly factors {min(factors)}..{max(factors)}, terra_only {calibration['terra_only_factor']}, "
          f"noaa20 {calibration['noaa20_factor']}, noaa21 {calibration['noaa21_factor']}")
    print(f"  test MAE {calibration['test_mae']} cell-days (MAPE {calibration.get('test_mape')}), 2012 step "
          f"raw x{calibration.get('raw_step_ratio')} -> harmonized x{calibration.get('harmonized_step_ratio')}")
    print(f"  hex_fire_history: {len(history)} hexes, {history['burn_count'].sum():.0f} harmonized cell-days")


if __name__ == "__main__":
    main()

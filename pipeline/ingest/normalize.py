"""Normalize raw FIRMS CSVs into the contract tables (owner: P2).

Reads any mix of MODIS / VIIRS CSVs (country yearly files, archive downloads,
area API output), unifies the columns, filters non-fires, clips to the region
bbox, adds H3 res-7 cells and writes:

    data/processed/<region>/points.parquet
    data/processed/<region>/hex_day.parquet

Usage:
    uv run python -m pipeline.ingest.normalize --region rio_negro data/raw/rio_negro/*.csv

Contract: contracts/tables.md
"""

from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

import pandas as pd

from pipeline.ingest.persistence import screen_persistence

ROOT = Path(__file__).resolve().parents[2]
H3_RES = 7

SATELLITE_MAP = {
    "t": "terra", "terra": "terra",
    "a": "aqua", "aqua": "aqua",
    "n": "snpp", "npp": "snpp", "snpp": "snpp", "suomi npp": "snpp", "suomi-npp": "snpp",
    "n20": "noaa20", "noaa20": "noaa20", "noaa-20": "noaa20", "j1": "noaa20",
    "n21": "noaa21", "noaa21": "noaa21", "noaa-21": "noaa21", "j2": "noaa21",
}
POINT_COLUMNS = ["date", "time", "lat", "lon", "h3", "sensor", "satellite", "confidence_class",
                 "frp", "daynight", "type", "is_nrt"]


def modis_confidence(c) -> str:
    c = float(c)
    return "low" if c < 30 else ("nominal" if c < 80 else "high")


def viirs_confidence(c) -> str:
    c = str(c).strip().lower()
    return {"l": "low", "low": "low", "n": "nominal", "nominal": "nominal", "h": "high", "high": "high"}[c]


def normalize_frame(raw: pd.DataFrame, satellite_override: str | None = None) -> pd.DataFrame:
    """Unify one raw FIRMS table (MODIS or VIIRS). No filtering, no H3."""
    df = raw.rename(columns=str.lower)
    # VIIRS web-service output uses brightness/brightness_2, so check VIIRS first.
    if "bright_ti4" in df.columns or "brightness_2" in df.columns:
        sensor, conf = "viirs", df["confidence"].map(viirs_confidence)
    elif "bright_t31" in df.columns:
        sensor, conf = "modis", df["confidence"].map(modis_confidence)
    else:
        raise ValueError(f"cannot tell MODIS from VIIRS; columns: {list(df.columns)}")

    if satellite_override:
        sat = pd.Series(satellite_override, index=df.index)
    else:
        sat = df["satellite"].astype(str).str.strip().str.lower().map(SATELLITE_MAP)
        unknown = df.loc[sat.isna(), "satellite"].unique()
        if len(unknown):
            raise ValueError(f"unknown satellite codes {unknown}; pass --satellite")

    version = df["version"].astype(str) if "version" in df.columns else pd.Series("", index=df.index)
    out = pd.DataFrame({
        "date": pd.to_datetime(df["acq_date"]).dt.date,
        "time": df["acq_time"].astype(int).astype(str).str.zfill(4),
        "lat": df["latitude"].astype(float),
        "lon": df["longitude"].astype(float),
        "sensor": sensor,
        "satellite": sat,
        "confidence_class": conf,
        "frp": df["frp"].astype(float),
        "daynight": df["daynight"].astype(str).str.upper().str[0],
        "type": df["type"].astype("Int8") if "type" in df.columns else pd.array([pd.NA] * len(df), "Int8"),
        "is_nrt": version.str.upper().str.contains("RT"),
    })
    return out


def filter_and_clip(df: pd.DataFrame, bbox: list[float], keep_low: bool = False) -> pd.DataFrame:
    """Drop non-vegetation fires, low confidence, and points outside the bbox."""
    w, s, e, n = bbox
    keep = (df["type"].isna() | (df["type"] == 0)) & df["lon"].between(w, e) & df["lat"].between(s, n)
    if not keep_low:
        keep &= df["confidence_class"] != "low"
    return df[keep]


def dedupe_nrt(df: pd.DataFrame) -> pd.DataFrame:
    """Where standard (SP) data exists for a satellite-day, drop the NRT rows for it."""
    sp_days = set(map(tuple, df.loc[~df["is_nrt"], ["satellite", "date"]].drop_duplicates().to_numpy()))
    is_dup = df["is_nrt"] & pd.Series([(a, b) in sp_days for a, b in zip(df["satellite"], df["date"], strict=False)],
                                      index=df.index)
    return df[~is_dup]


def add_h3(df: pd.DataFrame) -> pd.DataFrame:
    import h3  # noqa: PLC0415

    df = df.copy()
    df["h3"] = [h3.latlng_to_cell(la, lo, H3_RES) for la, lo in zip(df["lat"], df["lon"], strict=False)]
    return df[POINT_COLUMNS]


def hex_day(points: pd.DataFrame) -> pd.DataFrame:
    """One row per (hex, day, satellite); see contracts/tables.md."""
    return (points.groupby(["h3", "date", "sensor", "satellite"], as_index=False)
            .agg(n_points=("frp", "size"), frp_sum=("frp", "sum"))
            .astype({"n_points": "int32"}))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", required=True)
    ap.add_argument("--satellite", help="force satellite (terra/aqua/snpp/noaa20/noaa21) if codes are odd")
    ap.add_argument("--keep-low", action="store_true", help="keep low-confidence detections")
    ap.add_argument("--no-persistence-filter", action="store_true", help="unfiltered baseline for audit only")
    ap.add_argument("csvs", nargs="+")
    args = ap.parse_args()

    regions = {r["id"]: r for r in json.loads(
        (ROOT / "contracts" / "regions.json").read_text(encoding="utf-8"))["regions"]}
    bbox = regions[args.region]["bbox"]

    frames = []
    paths = []
    for pattern in args.csvs:
        matches = sorted(glob.glob(pattern))
        if not matches:
            ap.error(f"no CSV files match {pattern}")
        paths.extend(Path(p) for p in matches)
    for path in dict.fromkeys(paths):
        raw = pd.read_csv(path)
        norm = filter_and_clip(normalize_frame(raw, args.satellite), bbox, args.keep_low)
        print(f"{path.name}: {len(raw):>9,} rows -> {len(norm):>9,} kept")
        frames.append(norm)

    points = add_h3(dedupe_nrt(pd.concat(frames, ignore_index=True).drop_duplicates()))
    removed, evidence = screen_persistence(points)
    if not args.no_persistence_filter:
        print(f"Persistence screen: removed {int(removed.sum()):,} of {len(points):,} detections")
        points = points.loc[~removed].copy()
    points = points.sort_values(["date", "time"]).reset_index(drop=True)
    out = ROOT / "data" / "processed" / args.region
    out.mkdir(parents=True, exist_ok=True)
    evidence.to_csv(out / "persistence_evidence.csv", index=False)
    points.to_parquet(out / "points.parquet", index=False)
    hex_day(points).to_parquet(out / "hex_day.parquet", index=False)

    summary = points.assign(year=pd.to_datetime(points["date"]).dt.year).pivot_table(
        index="year", columns="satellite", values="frp", aggfunc="size", fill_value=0)
    print(summary.to_string())
    print(f"wrote {out}/points.parquet ({len(points):,} rows) and hex_day.parquet")


if __name__ == "__main__":
    main()

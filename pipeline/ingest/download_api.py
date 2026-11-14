"""Download FIRMS hotspots for a region bbox through the area API (owner: P2).

Best for the recent tail (months not in the yearly country files) and gaps.
For full history prefer the yearly country CSVs (see README.md).

    uv run python -m pipeline.ingest.download_api --region rio_negro \
        --source VIIRS_NOAA20_SP --start 2026-01-01 --end 2026-11-13

Needs FIRMS_MAP_KEY in the environment or backend/.env.
API: /api/area/csv/<KEY>/<SOURCE>/<west,south,east,north>/<1..5>/<YYYY-MM-DD>
Limit: 5,000 transactions per 10 minutes (multi-day calls may count as several).
"""

from __future__ import annotations

import argparse
import io
import json
import os
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCES = {"MODIS_SP", "MODIS_NRT", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_SP",
           "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"}


def fetch(key: str, source: str, bbox: list[float], day: date, days: int) -> pd.DataFrame:
    area = ",".join(str(v) for v in bbox)
    url = f"{BASE}/{key}/{source}/{area}/{days}/{day.isoformat()}"
    failure = "no response"
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=120)
            failure = f"HTTP {r.status_code}"
            if r.status_code == 200:
                df = pd.read_csv(io.StringIO(r.text))
                if {"latitude", "longitude", "acq_date", "satellite"} <= set(df.columns):
                    return df
                failure = "unexpected CSV columns"
        except requests.RequestException:
            # Request exception messages include the URL, which contains the key.
            failure = "network error"
        except (pd.errors.ParserError, pd.errors.EmptyDataError):
            failure = "invalid CSV response"
        if attempt < 3:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"FIRMS {source} {day}: {failure}") from None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", required=True)
    ap.add_argument("--source", required=True, choices=sorted(SOURCES))
    ap.add_argument("--start", required=True, type=date.fromisoformat)
    ap.add_argument("--end", required=True, type=date.fromisoformat)
    args = ap.parse_args()
    if args.end < args.start:
        ap.error("--end must be on or after --start")

    load_dotenv(ROOT / "backend" / ".env")
    key = os.environ["FIRMS_MAP_KEY"]
    regions = json.loads((ROOT / "contracts" / "regions.json").read_text(encoding="utf-8"))["regions"]
    bbox = next(r["bbox"] for r in regions if r["id"] == args.region)

    out = ROOT / "data" / "raw" / args.region
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"api_{args.source}_{args.start}_{args.end}.csv"

    chunks, day = [], args.start
    while day <= args.end:
        days = min(5, (args.end - day).days + 1)
        df = fetch(key, args.source, bbox, day, days)
        print(f"{day} +{days}d: {len(df)} rows")
        chunks.append(df)
        day += timedelta(days=days)
        time.sleep(0.5)

    result = pd.concat(chunks, ignore_index=True) if chunks else pd.DataFrame()
    temporary = target.with_suffix(".csv.part")
    result.to_csv(temporary, index=False)
    temporary.replace(target)
    print(f"wrote {target} ({len(result):,} rows)")


if __name__ == "__main__":
    main()

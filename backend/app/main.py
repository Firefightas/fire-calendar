"""FastAPI backend (owner: P4). Contract: contracts/api.md.

Serves data/processed/<region>/ and falls back to contracts/mocks/<region>/
until real files exist. Endpoints marked TODO return 501 so the frontend can
already wire them up.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
PROCESSED = ROOT / "data" / "processed"
MOCKS = CONTRACTS / "mocks"

load_dotenv(ROOT / "backend" / ".env")
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")

app = FastAPI(title="Fire Calendar API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def regions() -> dict:
    return json.loads((CONTRACTS / "regions.json").read_text())


def region_ids() -> list[str]:
    return [r["id"] for r in regions()["regions"]]


def resolve(region_id: str, filename: str) -> Path:
    """Real processed file if it exists, otherwise the mock."""
    if region_id not in region_ids():
        raise HTTPException(404, f"unknown region '{region_id}'")
    for path in (PROCESSED / region_id / filename, MOCKS / region_id / filename):
        if path.exists():
            return path
    raise HTTPException(404, f"{filename} not available yet for '{region_id}'")


def load_json(region_id: str, filename: str) -> dict:
    return json.loads(resolve(region_id, filename).read_text())


class AreaQuery(BaseModel):
    region_id: str
    polygon: dict  # GeoJSON Polygon
    start: str = "2000-11"
    end: str = "2026-12"
    area_label: str | None = None


@app.get("/api/health")
def health() -> dict:
    using_mocks = [r for r in region_ids() if not (PROCESSED / r / "calendar.json").exists()]
    return {"status": "ok", "using_mocks": using_mocks, "firms_key_configured": bool(FIRMS_MAP_KEY)}


@app.get("/api/regions")
def get_regions() -> dict:
    return regions()


@app.get("/api/regions/{region_id}/calendar")
def get_calendar(region_id: str) -> dict:
    return load_json(region_id, "calendar.json")


@app.get("/api/regions/{region_id}/calibration")
def get_calibration(region_id: str) -> dict:
    return load_json(region_id, "calibration.json")


@app.get("/api/regions/{region_id}/sandbox-grid")
def get_sandbox_grid(region_id: str) -> dict:
    return load_json(region_id, "sandbox_grid.json")


@app.post("/api/calendar")
def area_calendar(q: AreaQuery) -> dict:
    # TODO(P4): hexes in polygon -> hex_day monthly cell-days -> calibration factors -> anomalies.
    # Interim: return the whole-region calendar trimmed to start..end so P5 can integrate now.
    cal = load_json(q.region_id, "calendar.json")
    lo, hi = q.start, q.end
    cal["months"] = [m for m in cal["months"] if lo <= f"{m['year']}-{m['month']:02d}" <= hi]
    if q.area_label:
        cal["area_label"] = q.area_label
    return cal


@app.post("/api/export/points")
def export_points(q: AreaQuery):
    raise HTTPException(501, "TODO(P4): CSV of points.parquet rows inside the polygon (contracts/api.md)")


@app.post("/api/export/calendar")
def export_calendar(q: AreaQuery):
    raise HTTPException(501, "TODO(P4): CSV of the area calendar months (contracts/api.md)")


@app.get("/api/nrt")
def nrt(region_id: str, days: int = 1):
    if not 1 <= days <= 7:
        raise HTTPException(422, "days must be 1..7")
    raise HTTPException(501, "TODO(P4): cached FIRMS area API proxy, NOAA-20/21 + MODIS NRT (contracts/api.md)")

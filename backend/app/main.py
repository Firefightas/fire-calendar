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


def nrt_bbox(region_id: str | None, bbox: str | None) -> list[float]:
    """Region bbox, or a global user bbox 'west,south,east,north' (TEAM_PLAN §0.1)."""
    if region_id:
        match = [r for r in regions()["regions"] if r["id"] == region_id]
        if not match:
            raise HTTPException(404, f"unknown region '{region_id}'")
        return match[0]["bbox"]
    if bbox:
        try:
            w, s, e, n = (float(v) for v in bbox.split(","))
        except ValueError as exc:
            raise HTTPException(422, "bbox must be west,south,east,north") from exc
        if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            raise HTTPException(422, "bbox out of range or inverted")
        return [w, s, e, n]
    raise HTTPException(422, "give region_id or bbox")


@app.get("/api/nrt")
def nrt(region_id: str | None = None, bbox: str | None = None, days: int = 1):
    if not 1 <= days <= 7:
        raise HTTPException(422, "days must be 1..7")
    area = nrt_bbox(region_id, bbox)
    # TODO(P4): FIRMS area API for VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, MODIS_NRT over `area`
    # (never S-NPP), cache ~15 min, return GeoJSON per contracts/api.md.
    raise HTTPException(501, f"TODO(P4): NRT proxy not implemented yet (area {area})")

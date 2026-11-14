"""FastAPI backend (owner: P4). Contract: contracts/api.md."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.area import AreaQuery, build_calendar, region_polygon

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
    expose_headers=["Content-Disposition", "X-Data-Source"],
)


@lru_cache
def regions() -> dict:
    return json.loads((CONTRACTS / "regions.json").read_text(encoding="utf-8"))


def region_ids() -> list[str]:
    return [r["id"] for r in regions()["regions"]]


def get_region(region_id: str) -> dict:
    for region in regions()["regions"]:
        if region["id"] == region_id:
            return region
    raise HTTPException(404, f"unknown region '{region_id}'")


def resolve(region_id: str, filename: str) -> Path:
    """Real processed file if it exists, otherwise the mock."""
    get_region(region_id)
    for path in (PROCESSED / region_id / filename, MOCKS / region_id / filename):
        if path.exists():
            return path
    raise HTTPException(404, f"{filename} not available yet for '{region_id}'")


def resolve_table(region_id: str, name: str) -> tuple[Path, bool]:
    get_region(region_id)
    for path, is_mock in (
        (PROCESSED / region_id / f"{name}.parquet", False),
        (MOCKS / region_id / f"{name}.sample.csv", True),
    ):
        if path.exists():
            return path, is_mock
    raise HTTPException(503, f"{name} archive not available yet for '{region_id}'")


def load_json(region_id: str, filename: str) -> dict:
    return json.loads(resolve(region_id, filename).read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> dict:
    using_mocks = [
        r for r in region_ids()
        if not (PROCESSED / r / "calendar.json").exists() or load_json(r, "calendar.json").get("is_mock", True)
    ]
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
    region_polygon(q, get_region(q.region_id))
    path, is_mock = resolve_table(q.region_id, "hex_day")
    return build_calendar(q, path, load_json(q.region_id, "calendar.json"),
                          load_json(q.region_id, "calibration.json"), is_mock)


@app.post("/api/export/points")
def export_points(q: AreaQuery):
    raise HTTPException(501, "TODO(P4): CSV of points.parquet rows inside the polygon (contracts/api.md)")


@app.post("/api/export/calendar")
def export_calendar(q: AreaQuery):
    raise HTTPException(501, "TODO(P4): CSV of the area calendar months (contracts/api.md)")


def nrt_bbox(region_id: str | None, bbox: str | None) -> list[float]:
    """Region bbox, or a global user bbox 'west,south,east,north'."""
    if region_id and bbox:
        raise HTTPException(422, "give either region_id or bbox, not both")
    if region_id:
        return get_region(region_id)["bbox"]
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
    raise HTTPException(501, f"TODO(P4): NRT proxy not implemented yet (area {area})")
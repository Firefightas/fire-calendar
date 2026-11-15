"""Real terrain grid for the Tactical Containment Sandbox: ESA WorldCover + Open-Meteo elevation.

Builds the base grid (land cover, asset type, burnable, elevation, slope) for the ~1,000 H3 res-7
hexes around a region's demo centre, then joins P3's fire history with join_history. Nothing is
invented: a hex with no WorldCover sample or no elevation makes the run fail.

Written by P3 in P2's folder with both humans' approval (PLAN.md, Requests, 15 Nov 2026).

Usage (from repo root; rasterio is not a project dependency, so it is added for this run only):
    uv run --with rasterio python -m pipeline.sandbox_inputs.terrain --region rio_negro
"""

from __future__ import annotations

import argparse
import json
import math
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

import h3
import pandas as pd

from pipeline.sandbox_inputs.join_history import ROOT, join_history

WORLDCOVER_URL = ("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
                  "ESA_WorldCover_10m_2021_v200_{tile}_Map.tif")
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
TILE_DEG = 3  # WorldCover tiles are 3 x 3 degrees, named by their south-west corner
DECIMATION = 8  # read every 8th 10 m pixel (an 80 m systematic sample, about 800 samples per hex)
MIN_SAMPLES = 100
ELEVATION_BATCH = 100  # coordinates per Open-Meteo call
RETRIES, RETRY_WAIT_S = 8, 20
RINGS = 18  # grid_disk radius: 1,027 hexes, the footprint of the mock grid
RES = 7

LANDCOVER_CLASSES = {"10": "tree", "20": "shrub", "30": "grass", "40": "crop", "50": "built", "60": "bare",
                     "70": "snow", "80": "water", "90": "wetland", "95": "mangrove", "100": "moss"}
ASSET_TYPE = {10: "forest", 20: "grassland", 30: "grassland", 40: "farm", 50: "village", 80: "river"}
BURNABLE = {10, 20, 30, 40, 50}

# A 5 km2 hex is far larger than a river or a village, so the plain majority class erases both and
# the sandbox loses its natural barriers and the assets it must protect. A hex is therefore classed
# as built-up or water when that class covers at least this share of it; otherwise the majority
# class is used. Built-up wins over water (a town on a river bank is an asset first).
BUILT_MIN_SHARE = 0.05
WATER_MIN_SHARE = 0.05
BUILT, WATER = 50, 80


def grid_cells(center_lat: float, center_lon: float, rings: int = RINGS) -> list[str]:
    return sorted(h3.grid_disk(h3.latlng_to_cell(center_lat, center_lon, RES), rings))


def tile_name(lat: float, lon: float) -> str:
    """WorldCover tile holding (lat, lon), e.g. S42W069."""
    south = math.floor(lat / TILE_DEG) * TILE_DEG
    west = math.floor(lon / TILE_DEG) * TILE_DEG
    return f"{'N' if south >= 0 else 'S'}{abs(south):02d}{'E' if west >= 0 else 'W'}{abs(west):03d}"


def tiles_for(south: float, west: float, north: float, east: float) -> list[str]:
    lats = range(math.floor(south / TILE_DEG) * TILE_DEG, math.floor(north / TILE_DEG) * TILE_DEG + 1, TILE_DEG)
    lons = range(math.floor(west / TILE_DEG) * TILE_DEG, math.floor(east / TILE_DEG) * TILE_DEG + 1, TILE_DEG)
    return [tile_name(lat, lon) for lat in lats for lon in lons]


def landcover_class(shares: dict[int, float]) -> int:
    """Hex class from its WorldCover class shares (see BUILT_MIN_SHARE / WATER_MIN_SHARE)."""
    if shares.get(BUILT, 0.0) >= BUILT_MIN_SHARE:
        return BUILT
    if shares.get(WATER, 0.0) >= WATER_MIN_SHARE:
        return WATER
    return max(sorted(shares), key=shares.get)


def slope_deg(cell: str, elevation: dict[str, float]) -> float:
    """Max slope to the neighbours that are in the grid: atan(|dh| / centre distance), degrees."""
    here = h3.cell_to_latlng(cell)
    steepest = 0.0
    for other in h3.grid_ring(cell, 1):
        if other in elevation:
            run = h3.great_circle_distance(here, h3.cell_to_latlng(other), unit="m")
            steepest = max(steepest, abs(elevation[other] - elevation[cell]) / run)
    return math.degrees(math.atan(steepest))


def build_cells(shares: dict[str, dict[int, float]], elevation: dict[str, float]) -> list[dict]:
    """Grid cells without fire history (burn_count 0, years_since_last_fire null until the join)."""
    cells = []
    for cell in sorted(shares):
        lat, lon = h3.cell_to_latlng(cell)
        landcover = landcover_class(shares[cell])
        cells.append({"h3": cell, "lat": round(lat, 5), "lon": round(lon, 5), "landcover": landcover,
                      "asset_type": ASSET_TYPE.get(landcover, "none"), "burnable": landcover in BURNABLE,
                      "elevation_m": round(elevation[cell], 1), "slope_deg": round(slope_deg(cell, elevation), 2),
                      "burn_count": 0.0, "years_since_last_fire": None})
    return cells


def worldcover_shares(cells: list[str], decimation: int = DECIMATION) -> dict[str, dict[int, float]]:
    """Share of each WorldCover class per hex, from a systematic sample of the 10 m map."""
    try:
        import rasterio  # noqa: PLC0415
        from rasterio.windows import from_bounds  # noqa: PLC0415
    except ImportError as err:  # not in pyproject.toml (root file, P1)
        raise SystemExit("rasterio is needed: run with  uv run --with rasterio python -m ...") from err

    wanted = set(cells)
    boundary = [point for cell in cells for point in h3.cell_to_boundary(cell)]
    south, north = min(p[0] for p in boundary), max(p[0] for p in boundary)
    west, east = min(p[1] for p in boundary), max(p[1] for p in boundary)
    counts: dict[str, Counter] = {cell: Counter() for cell in cells}
    for tile in tiles_for(south, west, north, east):
        with rasterio.open(WORLDCOVER_URL.format(tile=tile)) as src:
            left, bottom = max(west, src.bounds.left), max(south, src.bounds.bottom)
            right, top = min(east, src.bounds.right), min(north, src.bounds.top)
            if left >= right or bottom >= top:
                continue
            window = from_bounds(left, bottom, right, top, src.transform).round_offsets().round_lengths()
            rows, cols = int(window.height // decimation), int(window.width // decimation)
            data = src.read(1, window=window, out_shape=(rows, cols))
            lon0, lat0 = src.transform * (window.col_off, window.row_off)
            step_lon, step_lat = src.transform.a * decimation, src.transform.e * decimation
            for i in range(rows):
                lat = lat0 + (i + 0.5) * step_lat
                for j, value in enumerate(data[i].tolist()):
                    cell = h3.latlng_to_cell(lat, lon0 + (j + 0.5) * step_lon, RES)
                    if cell in wanted and value:  # 0 is "no data"
                        counts[cell][value] += 1
    thin = [cell for cell in cells if sum(counts[cell].values()) < MIN_SAMPLES]
    if thin:
        raise SystemExit(f"{len(thin)} hexes have fewer than {MIN_SAMPLES} WorldCover samples, e.g. {thin[:3]}")
    return {cell: {k: n / sum(c.values()) for k, n in c.items()} for cell, c in counts.items()}


def _get_json(url: str) -> dict:
    """GET with patience: Open-Meteo answers 429 when its per-minute quota is used up."""
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310
                return json.load(response)
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == RETRIES - 1:  # noqa: PLR2004
                raise
            time.sleep(RETRY_WAIT_S)
    raise AssertionError("unreachable")


def open_meteo_elevation(cells: list[str]) -> dict[str, float]:
    """Elevation in metres at each hex centre (Open-Meteo elevation API, no key)."""
    elevation: dict[str, float] = {}
    for start in range(0, len(cells), ELEVATION_BATCH):
        batch = cells[start:start + ELEVATION_BATCH]
        points = [h3.cell_to_latlng(cell) for cell in batch]
        query = (f"latitude={','.join(f'{lat:.5f}' for lat, _ in points)}"
                 f"&longitude={','.join(f'{lon:.5f}' for _, lon in points)}")
        values = _get_json(f"{ELEVATION_URL}?{query}")["elevation"]
        if len(values) != len(batch) or any(v is None for v in values):
            raise SystemExit("Open-Meteo returned no elevation for some hexes")
        elevation.update(zip(batch, map(float, values), strict=True))
    return elevation


def main(argv: list[str] | None = None) -> None:
    regions = {r["id"]: r for r in json.loads((ROOT / "contracts/regions.json").read_text(encoding="utf-8"))["regions"]}
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--region", required=True, choices=sorted(regions))
    parser.add_argument("--center", nargs=2, type=float, metavar=("LAT", "LON"),
                        help="demo centre (default: the region centre in contracts/regions.json)")
    parser.add_argument("--rings", type=int, default=RINGS)
    parser.add_argument("--history", type=Path, help="default: data/processed/<region>/hex_fire_history.parquet")
    parser.add_argument("--out", type=Path, help="default: data/processed/<region>/sandbox_grid.json")
    args = parser.parse_args(argv)

    folder = ROOT / "data/processed" / args.region
    history_path = args.history or folder / "hex_fire_history.parquet"
    out = args.out or folder / "sandbox_grid.json"
    if not history_path.exists():
        parser.error(f"{history_path} not found: run pipeline.harmonize.run first")
    lon, lat = regions[args.region]["center"]
    if args.center:
        lat, lon = args.center

    cells = grid_cells(lat, lon, args.rings)
    shares = worldcover_shares(cells)
    elevation = open_meteo_elevation(cells)
    base = {"region_id": args.region, "is_mock": False, "h3_resolution": RES,
            "landcover_classes": LANDCOVER_CLASSES, "cells": build_cells(shares, elevation)}
    history = pd.read_parquet(history_path)
    grid = join_history(base, history)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(grid, indent=2, allow_nan=False), encoding="utf-8")
    burned = set(history.h3)
    provenance = {
        "landcover": "ESA WorldCover 10 m 2021 v200, tiles " + ", ".join(tiles_for(
            min(c["lat"] for c in grid["cells"]), min(c["lon"] for c in grid["cells"]),
            max(c["lat"] for c in grid["cells"]), max(c["lon"] for c in grid["cells"]))),
        "landcover_rule": f"built-up if >= {BUILT_MIN_SHARE:.0%} of the hex, else water if >= {WATER_MIN_SHARE:.0%}, "
                          f"else majority class; {DECIMATION * 10} m systematic sample",
        "elevation": "Open-Meteo elevation API at hex centres; slope = max over in-grid neighbours",
        "history_input": history_path.name, "history_rows": len(history),
        "center": [lat, lon], "rings": args.rings, "cells": len(grid["cells"]),
        "history_matched": sum(c["h3"] in burned for c in grid["cells"]),
        "landcover_counts": dict(sorted(Counter(c["landcover"] for c in grid["cells"]).items())),
        "asset_counts": dict(sorted(Counter(c["asset_type"] for c in grid["cells"]).items())),
        "elevation_m": [min(c["elevation_m"] for c in grid["cells"]), max(c["elevation_m"] for c in grid["cells"])],
        "max_slope_deg": max(c["slope_deg"] for c in grid["cells"]),
        "is_mock": grid["is_mock"],
    }
    out.with_suffix(".provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()

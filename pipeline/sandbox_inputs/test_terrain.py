import json
import math

import h3
import pandas as pd
import pytest
from jsonschema import Draft202012Validator

from pipeline.sandbox_inputs import terrain
from pipeline.sandbox_inputs.join_history import ROOT, join_history


def test_tile_names_follow_the_south_west_corner():
    assert terrain.tile_name(-39.3, -65.6) == "S42W066"
    assert terrain.tile_name(37.2, -119.5) == "N36W120"
    assert terrain.tile_name(45.9, 25.0) == "N45E024"
    assert terrain.tiles_for(-39.66, -66.01, -38.95, -65.2) == ["S42W069", "S42W066", "S39W069", "S39W066"]


def test_landcover_keeps_villages_and_rivers_that_a_majority_would_erase():
    assert terrain.landcover_class({20: 0.9, 80: 0.04, 50: 0.04}) == 20  # plain majority
    assert terrain.landcover_class({20: 0.9, 80: 0.06}) == 80
    assert terrain.landcover_class({40: 0.8, 50: 0.06, 80: 0.14}) == 50  # built-up wins over water
    assert terrain.landcover_class({10: 0.5, 20: 0.5}) == 10  # ties go to the lower code, deterministically


def test_slope_uses_only_neighbours_inside_the_grid():
    cell = h3.latlng_to_cell(-39.3, -65.6, 7)
    uphill, outside = sorted(h3.grid_ring(cell, 1))[:2]
    run = h3.great_circle_distance(h3.cell_to_latlng(cell), h3.cell_to_latlng(uphill), unit="m")
    elevation = {cell: 100.0, uphill: 100.0 + run}  # 45 degrees to the one known neighbour
    assert outside not in elevation
    assert terrain.slope_deg(cell, elevation) == pytest.approx(45.0)
    assert terrain.slope_deg(cell, {cell: 100.0}) == 0.0


def test_built_cells_pass_the_contract_after_the_history_join():
    cells = terrain.grid_cells(-39.3, -65.6, rings=2)
    assert len(cells) == 19
    shares = {cell: {20: 0.7, 30: 0.3} for cell in cells}
    shares[cells[0]] = {80: 0.5, 20: 0.5}
    shares[cells[1]] = {50: 0.2, 40: 0.8}
    shares[cells[2]] = {60: 1.0}
    elevation = {cell: 120.0 + i for i, cell in enumerate(cells)}
    base = {"region_id": "rio_negro", "is_mock": False, "h3_resolution": 7,
            "landcover_classes": terrain.LANDCOVER_CLASSES, "cells": terrain.build_cells(shares, elevation)}
    by_id = {c["h3"]: c for c in base["cells"]}
    assert (by_id[cells[0]]["asset_type"], by_id[cells[0]]["burnable"]) == ("river", False)
    assert (by_id[cells[1]]["asset_type"], by_id[cells[1]]["burnable"]) == ("village", True)
    assert (by_id[cells[2]]["asset_type"], by_id[cells[2]]["burnable"]) == ("none", False)
    assert all(0 <= c["slope_deg"] < 1 and math.isfinite(c["elevation_m"]) for c in base["cells"])

    history = pd.DataFrame({"h3": [cells[3]], "burn_count": [4.5], "years_since_last_fire": [2.0]})
    grid = join_history(base, history)
    schema = json.loads((ROOT / "contracts/sandbox_grid.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(grid)
    assert grid["is_mock"] is False
    joined = {c["h3"]: c for c in grid["cells"]}
    assert (joined[cells[3]]["burn_count"], joined[cells[3]]["years_since_last_fire"]) == (4.5, 2.0)
    assert (joined[cells[4]]["burn_count"], joined[cells[4]]["years_since_last_fire"]) == (0.0, None)

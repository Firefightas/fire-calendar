"""Join P3 history onto an existing terrain grid without fabricating terrain.

Example: uv run python -m pipeline.sandbox_inputs.join_history --region rio_negro
  --grid contracts/mocks/rio_negro/sandbox_grid.json
  --history data/processed/rio_negro/hex_fire_history.parquet
  --out data/processed/rio_negro/sandbox_grid.json
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path

import h3
import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
HISTORY_COLUMNS = ["h3", "burn_count", "years_since_last_fire"]


def join_history(grid: dict, history: pd.DataFrame, *, history_is_mock: bool = False) -> dict:
    """Left join; retain zero-count recency and mark any mock input as mock."""
    schema = json.loads((ROOT / "contracts/sandbox_grid.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    validator.validate(grid)
    if list(history.columns) != HISTORY_COLUMNS:
        raise ValueError(f"history must have exactly {HISTORY_COLUMNS}")
    if history.h3.isna().any() or history.h3.duplicated().any():
        raise ValueError("history h3 must be non-null and unique")
    cells = [c["h3"] for c in grid["cells"]]
    if len(cells) != len(set(cells)):
        raise ValueError("grid h3 must be unique")
    if not all(h3.is_valid_cell(c) and h3.get_resolution(c) == 7 for c in [*cells, *history.h3]):
        raise ValueError("all h3 values must be valid resolution-7 cells")
    counts = pd.to_numeric(history.burn_count, errors="raise")
    recency = pd.to_numeric(history.years_since_last_fire, errors="raise")
    if counts.isna().any() or not np.isfinite(counts).all() or (counts < 0).any():
        raise ValueError("burn_count must be finite and non-negative")
    known = recency.dropna()
    if not np.isfinite(known).all() or (known < 0).any():
        raise ValueError("years_since_last_fire must be null or finite and non-negative")
    lookup = dict(zip(history.h3, zip(counts, recency, strict=True), strict=True))
    result = copy.deepcopy(grid)
    result["is_mock"] = bool(grid["is_mock"] or history_is_mock)
    for cell in result["cells"]:
        count, age = lookup.get(cell["h3"], (0.0, None))
        cell["burn_count"] = float(count)
        cell["years_since_last_fire"] = None if pd.isna(age) else float(age)
    validator.validate(result)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--region", required=True)
    ap.add_argument("--grid", required=True, type=Path)
    ap.add_argument("--history", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--history-is-mock", action="store_true")
    args = ap.parse_args()
    grid = json.loads(args.grid.read_text(encoding="utf-8"))
    if grid["region_id"] != args.region:
        ap.error("--region does not match the base grid")
    history = pd.read_parquet(args.history)
    result = join_history(grid, history, history_is_mock=args.history_is_mock)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.out.with_suffix(".json.part")
    temporary.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(args.out)
    history_cells = set(history.h3)
    matched = sum(c["h3"] in history_cells for c in result["cells"])
    manifest = dict(grid_input=str(args.grid), history_input=str(args.history),
                    grid_sha256=hashlib.sha256(args.grid.read_bytes()).hexdigest(),
                    history_sha256=hashlib.sha256(args.history.read_bytes()).hexdigest(),
                    history_rows=len(history), cells=len(result["cells"]), matched=matched,
                    missing=len(result["cells"]) - matched, is_mock=result["is_mock"])
    args.out.with_suffix(".provenance.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()

"""Every mock and every processed output must match its contract.

Runs on every push (CI). If this fails, someone changed a shape without
updating contracts/ (or vice versa).
"""

import csv
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
REGIONS = json.loads((CONTRACTS / "regions.json").read_text())["regions"]
REGION_IDS = [r["id"] for r in REGIONS]


def validator(name: str) -> Draft202012Validator:
    schema = json.loads((CONTRACTS / name).read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def assert_valid(name: str, path: Path) -> None:
    errors = sorted(validator(name).iter_errors(json.loads(path.read_text())), key=str)
    assert not errors, f"{path} violates {name}:\n" + "\n".join(e.message for e in errors[:10])


def candidate_files(region_id: str, filename: str) -> list[Path]:
    return [p for p in (CONTRACTS / "mocks" / region_id / filename,
                        ROOT / "data" / "processed" / region_id / filename) if p.exists()]


def test_regions_file():
    assert_valid("regions.schema.json", CONTRACTS / "regions.json")
    for r in REGIONS:
        w, s, e, n = r["bbox"]
        assert w < e and s < n, r["id"]


@pytest.mark.parametrize("region_id", REGION_IDS)
def test_calendar(region_id):
    files = candidate_files(region_id, "calendar.json")
    assert files, f"no calendar.json for {region_id} (mock or processed)"
    for path in files:
        assert_valid("calendar.schema.json", path)
        months = json.loads(path.read_text())["months"]
        keys = [(m["year"], m["month"]) for m in months]
        assert keys == sorted(keys) and len(keys) == len(set(keys)), "months must be sorted and unique"
        for m in months:
            assert m["unc_low"] <= m["harmonized"] <= m["unc_high"], (path, m["year"], m["month"])
            if m["viirs_raw"] is None:
                assert m["is_estimated"], "a month without VIIRS must be marked is_estimated"
            if "peak_event" in m:
                pe = m["peak_event"]
                w, s, e, n = pe["bbox"]
                assert w < e and s < n, (path, m["year"], m["month"], pe["bbox"])
                assert pe["first_date"] <= pe["last_date"], (path, m["year"], m["month"])


@pytest.mark.parametrize("region_id", REGION_IDS)
def test_calibration(region_id):
    files = candidate_files(region_id, "calibration.json")
    assert files, f"no calibration.json for {region_id}"
    for path in files:
        assert_valid("calibration.schema.json", path)
        data = json.loads(path.read_text())
        assert data["fit_years"][1] < data["test_years"][0], "test years must come after fit years"
        assert [m["month"] for m in data["monthly_factors"]] == list(range(1, 13))


@pytest.mark.parametrize("region_id", REGION_IDS)
def test_sandbox_grid_if_present(region_id):
    files = candidate_files(region_id, "sandbox_grid.json")
    if not files:
        pytest.skip("sandbox_grid.json not generated yet (needs h3)")
    asset = {10: "forest", 20: "grassland", 30: "grassland", 40: "farm", 50: "village", 80: "river"}
    for path in files:
        assert_valid("sandbox_grid.schema.json", path)
        for c in json.loads(path.read_text())["cells"]:
            assert c["asset_type"] == asset.get(c["landcover"], "none"), (path, c["h3"])
            assert c["burnable"] == (c["landcover"] in {10, 20, 30, 40, 50}), (path, c["h3"])


POINT_COLUMNS = ["date", "time", "lat", "lon", "h3", "sensor", "satellite", "confidence_class",
                 "frp", "daynight", "type", "is_nrt"]
HEXDAY_COLUMNS = ["h3", "date", "sensor", "satellite", "n_points", "frp_sum"]
HISTORY_COLUMNS = ["h3", "burn_count", "years_since_last_fire"]


@pytest.mark.parametrize("region_id", REGION_IDS)
@pytest.mark.parametrize("filename,columns", [("points.sample.csv", POINT_COLUMNS),
                                              ("hex_day.sample.csv", HEXDAY_COLUMNS),
                                              ("hex_fire_history.sample.csv", HISTORY_COLUMNS)])
def test_sample_tables_if_present(region_id, filename, columns):
    path = CONTRACTS / "mocks" / region_id / filename
    if not path.exists():
        pytest.skip(f"{filename} not generated yet (needs h3)")
    with open(path) as f:
        assert next(csv.reader(f)) == columns

"""Scientific regressions use explicit synthetic archives, never real data."""

import copy
import json
import math

import h3
import jsonschema
import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.tests.helpers import LAT, LON, body, square

client = TestClient(main.app)
def test_epochs_deduplication_and_sparse_uncertainty(archive):
    add, save, _, _, _ = archive
    add(2001, 1, "terra")
    add(2003, 1, "terra")
    add(2003, 1, "aqua")  # same hex/day is ONE MODIS cell-day
    add(2015, 1, "terra")
    add(2015, 1, "snpp", 2)
    add(2015, 1, "snpp", 20, cell=h3.latlng_to_cell(LAT, LON + 0.4, 7))
    add(2026, 11, "noaa20")
    add(2026, 11, "noaa21")  # never add the satellites together
    save()
    response = client.post("/api/calendar", json=body(area_label="Synthetic test area"))
    assert response.status_code == 200
    result = response.json()
    schema = json.loads((main.CONTRACTS / "calendar.schema.json").read_text(encoding="utf-8"))
    jsonschema.validate(result, schema)
    months = {(m["year"], m["month"]): m for m in result["months"]}
    assert months[2001, 1]["harmonized"] == 4.0
    assert months[2003, 1]["modis_raw"] == 1
    assert months[2003, 1]["harmonized"] == 2.0
    assert months[2015, 1]["harmonized"] == 2
    assert months[2015, 1]["viirs_raw"] == 2
    assert months[2026, 11]["harmonized"] == 1.25
    assert months[2026, 11]["source"] == "viirs_noaa20"
    assert months[2003, 1]["unc_high"] == pytest.approx(2 + 1.96 * math.sqrt(2 + 1))
    assert result["is_mock"] is False
    assert result["area_label"] == "Synthetic test area"


def test_local_factors_exclude_held_out_years_and_filter_baseline_last(archive):
    add, save, _, _, _ = archive
    add(2003, 1, "terra")
    for year in (2013, 2014, 2015):
        add(year, 1, "terra", 5)
        add(year, 1, "snpp", 20)  # fitted local factor = 4, parent = 2
    for year in (2021, 2022, 2023):
        add(year, 1, "terra", 20)
        add(year, 1, "snpp", 1)  # would contaminate median if test years were fitted
    save()
    full = client.post("/api/calendar", json=body()).json()
    trimmed = client.post("/api/calendar", json=body(start="2003-01", end="2003-01")).json()
    row = trimmed["months"][0]
    assert row["harmonized"] == 4
    assert row == next(m for m in full["months"] if (m["year"], m["month"]) == (2003, 1))
    assert trimmed["first_month"] == trimmed["last_month"] == "2003-01"
    assert row["median_m"] == 0 and row["iqr_m"] == 1 and row["anomaly_z"] == 4


def test_noaa_selection_uses_regional_availability_not_zero_area_burns(archive):
    add, save, reference, _, _ = archive
    add(2026, 11, "noaa21", 3)
    save()
    november = client.post("/api/calendar", json=body(start="2026-11")).json()["months"][0]
    assert november["source"] == "viirs_noaa20" and november["harmonized"] == 0
    reference["months"][-1]["source"] = "viirs_noaa21"
    save()
    november = client.post("/api/calendar", json=body(start="2026-11")).json()["months"][0]
    assert november["source"] == "viirs_noaa21" and november["harmonized"] == 4.5


def test_holes_and_empty_areas_return_zero_counts(archive):
    add, save, _, _, _ = archive
    add(2015, 1, "snpp")
    save()
    polygon = square()
    polygon["coordinates"].append(square(size=0.01)["coordinates"][0])
    result = client.post("/api/calendar", json=body(polygon=polygon)).json()
    assert all(m["harmonized"] == 0 and m["anomaly_z"] == 0 for m in result["months"])


@pytest.mark.parametrize("overrides", [
    {"polygon": {"type": "Polygon", "coordinates": []}},
    {"polygon": {"type": "Point", "coordinates": [LON, LAT]}},
    {"polygon": {"type": "Polygon", "coordinates": [[[LON, LAT]] * 4]}},
    {"polygon": square(lon=0, lat=0)},
    {"polygon": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}},
    {"polygon": {"type": "Polygon", "coordinates": [[[LON, LAT], [LON + 0.1, LAT], [LON, LAT + 0.1]]]}},
    {"start": "2015-13"}, {"end": "2015-1"}, {"start": "2020-01", "end": "2019-12"},
])
def test_invalid_area_queries_are_rejected(overrides):
    response = client.post("/api/calendar", json=body(**overrides))
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_sample_fallback_is_marked_and_never_whole_region_totals(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PROCESSED", tmp_path)
    result = client.post("/api/calendar", json=body()).json()
    assert result["is_mock"] is True
    whole = main.load_json("rio_negro", "calendar.json")
    assert sum(m["harmonized"] for m in result["months"]) < sum(m["harmonized"] for m in whole["months"])


def test_missing_sample_and_parquet_returns_explicit_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PROCESSED", tmp_path / "processed")
    monkeypatch.setattr(main, "MOCKS", tmp_path / "mocks")
    assert client.post("/api/calendar", json=body()).status_code == 503


def test_mixed_mock_calibration_remains_labeled_mock(archive):
    add, save, _, calibration, _ = archive
    add(2015, 1, "snpp")
    calibration["is_mock"] = True
    save()
    assert client.post("/api/calendar", json=body()).json()["is_mock"] is True


def test_nrt_flag_comes_from_archive_coverage_not_area_last_fire(archive):
    add, save, reference, _, _ = archive
    add(2015, 1, "snpp")
    save()
    result = client.post("/api/calendar", json=body()).json()
    assert [m["is_nrt"] for m in result["months"]] == [
        m["is_nrt"] for m in reference["months"] if m["year"] >= 2001
    ]


def test_health_reports_synthetic_processed_calendar_as_mock(archive):
    _, save, reference, _, _ = archive
    reference["is_mock"] = True
    save()
    assert "rio_negro" in client.get("/api/health").json()["using_mocks"]


def test_is_mock_does_not_mutate_regional_payload(archive):
    add, save, reference, _, _ = archive
    before = copy.deepcopy(reference)
    add(2015, 1, "snpp")
    save()
    client.post("/api/calendar", json=body())
    assert main.load_json("rio_negro", "calendar.json") == before

def test_incomplete_last_month_uses_same_days_in_baseline_years(archive):
    add, save, _, calibration, _ = archive
    for year in range(2001, 2026):
        add(year, 11, "terra" if year < 2012 else "snpp", 20)
    add(2026, 11, "noaa20", 2)
    calibration["diagnostics"] = {"last_data_date": "2026-11-02", "last_month_complete": False}
    save()
    query = body(start="2026-11")
    result = client.post("/api/calendar", json=query).json()
    row = result["months"][0]
    assert row["harmonized"] == 2.5
    assert row["median_m"] == 2 and row["iqr_m"] == 2 and row["anomaly_z"] == 0.25
    full = client.post("/api/calendar", json=body()).json()
    assert full["months"][-1] == row
    previous = next(m for m in full["months"] if (m["year"], m["month"]) == (2025, 11))
    assert previous["median_m"] == 20 and previous["iqr_m"] == 20

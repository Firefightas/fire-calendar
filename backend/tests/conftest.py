import json
from datetime import date

import duckdb
import pytest

from backend.app import main
from backend.tests.helpers import CELL


@pytest.fixture
def archive(tmp_path, monkeypatch):
    processed = tmp_path / "processed"
    region = processed / "rio_negro"
    region.mkdir(parents=True)
    monkeypatch.setattr(main, "PROCESSED", processed)
    reference = main.load_json("rio_negro", "calendar.json")
    calibration = main.load_json("rio_negro", "calibration.json")
    reference["is_mock"] = calibration["is_mock"] = False
    calibration.update(terra_only_factor=2.0, noaa20_factor=1.25, noaa21_factor=1.5)
    for factor in calibration["monthly_factors"]:
        factor.update(factor=2.0, cv=0.5)

    rows = []

    def add(year, month, satellite, days=1, cell=CELL):
        sensor = "modis" if satellite in ("terra", "aqua") else "viirs"
        rows.extend((cell, date(year, month, day), sensor, satellite, 99, 7.0) for day in range(1, days + 1))

    def save():
        with duckdb.connect() as connection:
            connection.execute("""
                CREATE TABLE input(h3 VARCHAR, date DATE, sensor VARCHAR, satellite VARCHAR,
                                   n_points INTEGER, frp_sum DOUBLE)
            """)
            if rows:
                connection.executemany("INSERT INTO input VALUES (?, ?, ?, ?, ?, ?)", rows)
            connection.sql("SELECT * FROM input").write_parquet(str(region / "hex_day.parquet"))
        (region / "calendar.json").write_text(json.dumps(reference), encoding="utf-8")
        (region / "calibration.json").write_text(json.dumps(calibration), encoding="utf-8")

    return add, save, reference, calibration, region

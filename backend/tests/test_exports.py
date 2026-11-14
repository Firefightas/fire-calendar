import csv
import io

import duckdb
import h3
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.exports import CALENDAR_COLUMNS, POINT_COLUMNS
from backend.tests.helpers import CELL, LAT, LON, body, square

client = TestClient(main.app)


def test_calendar_csv_matches_area_response(archive):
    add, save, _, _, _ = archive
    add(2003, 1, "terra")
    save()
    query = body(start="2003-01", end="2003-12")
    calendar = client.post("/api/calendar", json=query).json()
    response = client.post("/api/export/calendar", json=query)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == 'attachment; filename="calendar_rio_negro_2003-01_2003-12.csv"'
    assert response.headers["x-data-source"] == "processed"
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert tuple(rows[0]) == CALENDAR_COLUMNS
    assert len(rows) == len(calendar["months"]) == 12
    assert float(rows[0]["harmonized"]) == calendar["months"][0]["harmonized"]
    assert rows[0]["is_estimated"] == "true"
    assert rows[0]["viirs_raw"] == ""


def test_points_csv_exact_polygon_holes_dates_and_leading_zero_time(archive):
    _, save, _, _, region = archive
    save()
    polygon = square(size=0.004)
    west, south = polygon["coordinates"][0][0]
    # The second point shares the included point's H3 cell but is OUTSIDE
    # the polygon; it must not be exported just because its hex is selected.
    outside_lon, outside_lat = LON + 0.006, LAT
    assert h3.latlng_to_cell(outside_lat, outside_lon, 7) == CELL
    rows = [
        ("2015-01-01", "0042", LAT, LON, CELL, "modis", "terra", "high", 7.0, "D", 0, False),
        ("2015-01-02", "0043", outside_lat, outside_lon, CELL, "modis", "terra", "high", 7.0, "D", 0, False),
        ("2014-12-31", "0044", LAT, LON, CELL, "viirs", "snpp", "nominal", 8.0, "N", None, False),
        ("2015-01-31", "0045", south, west, CELL, "viirs", "snpp", "nominal", 8.0, "N", None, True),
        ("2015-02-01", "0046", LAT, LON, CELL, "viirs", "snpp", "nominal", 8.0, "N", None, True),
    ]
    with duckdb.connect() as connection:
        connection.execute("""
            CREATE TABLE points(date DATE, time VARCHAR, lat DOUBLE, lon DOUBLE, h3 VARCHAR,
                                sensor VARCHAR, satellite VARCHAR, confidence_class VARCHAR, frp DOUBLE,
                                daynight VARCHAR, type INTEGER, is_nrt BOOLEAN)
        """)
        connection.executemany("INSERT INTO points VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
        connection.sql("SELECT * FROM points").write_parquet(str(region / "points.parquet"))
    query = body(polygon=polygon, start="2015-01", end="2015-01")
    response = client.post("/api/export/points", json=query)
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="hotspots_rio_negro_2015-01_2015-01.csv"'
    records = list(csv.DictReader(io.StringIO(response.text)))
    assert tuple(records[0]) == POINT_COLUMNS
    assert [row["time"] for row in records] == ["0042", "0045"]
    assert records[-1]["type"] == "" and records[-1]["is_nrt"] == "true"

    polygon["coordinates"].append(square(size=0.001)["coordinates"][0])
    response = client.post("/api/export/points", json=body(polygon=polygon, start="2015-01", end="2015-01"))
    assert [row["time"] for row in csv.DictReader(io.StringIO(response.text))] == ["0045"]


def test_empty_and_mock_csvs_are_labeled(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PROCESSED", tmp_path)
    query = body(start="2015-01", end="2015-01")
    response = client.post("/api/export/points", json=query)
    assert response.status_code == 200 and response.headers["x-data-source"] == "MOCK DATA"
    assert list(csv.reader(io.StringIO(response.text))) == [list(POINT_COLUMNS)]
    response = client.post("/api/export/calendar", json=query)
    assert response.status_code == 200 and response.headers["x-data-source"] == "MOCK DATA"


def test_download_headers_are_exposed_to_frontend():
    response = client.options("/api/export/calendar", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
    })
    assert response.status_code == 200
    response = client.post("/api/export/calendar", json=body(start="2015-01", end="2015-01"),
                           headers={"Origin": "http://localhost:5173"})
    assert "Content-Disposition" in response.headers["access-control-expose-headers"]


def test_exports_validate_region_polygon_and_dates():
    for endpoint in ("/api/export/points", "/api/export/calendar"):
        assert client.post(endpoint, json=body(start="2020-02", end="2020-01")).status_code == 422
        assert client.post(endpoint, json=body(polygon=square(lon=0, lat=0))).status_code == 422
        assert client.post(endpoint, json=body(region_id="atlantis")).status_code == 404
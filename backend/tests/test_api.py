import json

from fastapi.testclient import TestClient

from backend.app import main

client = TestClient(main.app)
POLYGON = {"type": "Polygon", "coordinates": [[
    [-65.7, -39.4], [-65.5, -39.4], [-65.5, -39.2], [-65.7, -39.2], [-65.7, -39.4],
]]}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_regions_and_calendar():
    regions = client.get("/api/regions").json()["regions"]
    assert regions
    cal = client.get(f"/api/regions/{regions[0]['id']}/calendar").json()
    assert cal["months"] and "harmonized" in cal["months"][0]


def test_regions_are_decoded_as_utf8():
    expected = json.loads((main.CONTRACTS / "regions.json").read_text(encoding="utf-8"))
    assert client.get("/api/regions").json() == expected


def test_unknown_region_is_404():
    assert client.get("/api/regions/atlantis/calendar").status_code == 404


def test_area_calendar_trims_months():
    body = {"region_id": "rio_negro", "polygon": POLYGON, "start": "2015-01", "end": "2015-12"}
    response = client.post("/api/calendar", json=body)
    assert response.status_code == 200
    months = response.json()["months"]
    assert len(months) == 12 and all(m["year"] == 2015 for m in months)


def test_nrt_parameter_validation():
    assert client.get("/api/nrt", params={"days": 1}).status_code == 422
    assert client.get("/api/nrt", params={"bbox": "10,0,5,1"}).status_code == 422
    assert client.get("/api/nrt", params={"region_id": "atlantis"}).status_code == 404
    assert client.get("/api/nrt", params={"bbox": "-66,-40,-65,-39", "days": 3}).status_code == 501
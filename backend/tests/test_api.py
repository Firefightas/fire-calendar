from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_regions_and_calendar():
    regions = client.get("/api/regions").json()["regions"]
    assert regions
    cal = client.get(f"/api/regions/{regions[0]['id']}/calendar").json()
    assert cal["months"] and "harmonized" in cal["months"][0]


def test_unknown_region_is_404():
    assert client.get("/api/regions/atlantis/calendar").status_code == 404


def test_area_calendar_trims_months():
    body = {"region_id": "rio-negro", "polygon": {"type": "Polygon", "coordinates": []},
            "start": "2015-01", "end": "2015-12"}
    months = client.post("/api/calendar", json=body).json()["months"]
    assert len(months) == 12 and all(m["year"] == 2015 for m in months)

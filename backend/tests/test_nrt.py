import asyncio
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app import nrt as proxy

client = TestClient(main.app)
FAKE_KEY = "synthetic-test-key"
BBOX = "-66,-40,-65,-39"
HEADER = "latitude,longitude,acq_date,acq_time,satellite,confidence,frp,daynight,type\n"


@pytest.fixture(autouse=True)
def isolated_proxy(monkeypatch):
    proxy.clear_cache()
    monkeypatch.setattr(main, "FIRMS_MAP_KEY", FAKE_KEY)
    monkeypatch.setattr(proxy, "utc_today", lambda: date(2026, 11, 14))
    yield
    proxy.clear_cache()


def mock_http(monkeypatch, handler):
    real_client = httpx.AsyncClient

    def factory(**kwargs):
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(proxy.httpx, "AsyncClient", factory)


def source(request):
    return request.url.path.split("/")[-4]


def test_sources_normalization_filtering_deduplication_and_cache(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        if source(request) == "MODIS_NRT":
            rows = (
                "-39.3,-65.6,2026-11-14,0005,T,80,9,D,0\n"
                "-39.3,-65.6,2026-11-14,0005,T,80,9,D,0\n"
                "-39.3,-65.6,2026-11-14,0006,A,29,9,D,0\n"  # low confidence
                "-39.3,-65.6,2026-11-14,0007,A,90,9,D,2\n"  # flare
            )
        else:
            sat = "N20" if source(request) == "VIIRS_NOAA20_NRT" else "N21"
            rows = (
                f"-39.3,-65.6,2026-11-14,0030,{sat},n,10,N,\n"
                f"-39.3,-65.6,2026-11-14,0031,{sat},l,10,N,\n"
                f"40,-65.6,2026-11-14,0032,{sat},h,10,N,\n"  # outside bbox
                f"-39.3,-65.6,2026-11-10,0033,{sat},h,10,N,\n"  # outside dates
            )
        return httpx.Response(200, text=HEADER + rows)

    mock_http(monkeypatch, handler)
    response = client.get("/api/nrt", params={"bbox": BBOX})
    assert response.status_code == 200
    result = response.json()
    assert result["type"] == "FeatureCollection" and len(result["features"]) == 3
    assert {f["properties"]["satellite"] for f in result["features"]} == {"terra", "noaa20", "noaa21"}
    assert {source(call) for call in calls} == set(proxy.SOURCES)
    assert all("SNPP" not in str(call.url) for call in calls)
    terra = next(f for f in result["features"] if f["properties"]["satellite"] == "terra")
    assert terra["properties"]["time"] == "0005" and terra["properties"]["confidence_class"] == "high"
    assert terra["geometry"]["coordinates"] == [-65.6, -39.3]
    assert client.get("/api/nrt", params={"bbox": BBOX}).json() == result
    assert len(calls) == 3


def test_seven_days_are_split_into_forward_date_windows(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request.url.path.split("/")[-2:])
        return httpx.Response(200, text=HEADER)

    mock_http(monkeypatch, handler)
    response = client.get("/api/nrt", params={"bbox": BBOX, "days": 7})
    assert response.status_code == 200 and response.json()["features"] == []
    assert calls.count(["5", "2026-11-08"]) == 3
    assert calls.count(["2", "2026-11-13"]) == 3


def test_cache_expires_and_is_specific_to_bbox_days_and_utc_date(monkeypatch):
    calls = []
    clock = [10.0]
    monkeypatch.setattr(proxy, "monotonic", lambda: clock[0])

    def handler(request):
        calls.append(request)
        return httpx.Response(200, text=HEADER)

    mock_http(monkeypatch, handler)
    client.get("/api/nrt", params={"bbox": BBOX})
    clock[0] += 899
    client.get("/api/nrt", params={"bbox": BBOX})
    assert len(calls) == 3
    clock[0] += 1
    client.get("/api/nrt", params={"bbox": BBOX})
    assert len(calls) == 6
    client.get("/api/nrt", params={"bbox": BBOX, "days": 2})
    client.get("/api/nrt", params={"bbox": "-66,-40,-64,-39"})
    assert len(calls) == 12
    monkeypatch.setattr(proxy, "utc_today", lambda: date(2026, 11, 15))
    client.get("/api/nrt", params={"bbox": BBOX})
    assert len(calls) == 15


@pytest.mark.parametrize("failure", ["status", "body", "malformed", "timeout"])
def test_upstream_failures_are_explicit_uncached_and_do_not_expose_key(monkeypatch, failure):
    calls = []

    def handler(request):
        calls.append(request)
        if failure == "timeout":
            raise httpx.ReadTimeout(f"timeout {request.url}", request=request)
        if failure == "status":
            return httpx.Response(429, text=f"quota exceeded for {FAKE_KEY}")
        if failure == "body":
            return httpx.Response(200, text=f"Invalid MAP_KEY {FAKE_KEY}")
        return httpx.Response(200, text=HEADER + "-39.3,-65.6,2026-11-14,9999,T,80,9,D,0\n")

    mock_http(monkeypatch, handler)
    for _ in range(2):
        response = client.get("/api/nrt", params={"bbox": BBOX})
        assert response.status_code == 502
        assert FAKE_KEY not in response.text and "https://" not in response.text
    assert len(calls) == 6


def test_missing_key_returns_503_without_network(monkeypatch):
    monkeypatch.setattr(main, "FIRMS_MAP_KEY", "")
    response = client.get("/api/nrt", params={"bbox": BBOX})
    assert response.status_code == 503 and "not configured" in response.json()["detail"]


def test_partial_source_failure_does_not_look_like_complete_overlay(monkeypatch):
    def handler(request):
        return httpx.Response(500 if source(request) == "VIIRS_NOAA21_NRT" else 200, text=HEADER)

    mock_http(monkeypatch, handler)
    assert client.get("/api/nrt", params={"bbox": BBOX}).status_code == 502


def test_region_and_equivalent_bbox_share_cache(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, text=HEADER)

    mock_http(monkeypatch, handler)
    client.get("/api/nrt", params={"region_id": "rio_negro"})
    bbox = ",".join(str(x) for x in main.get_region("rio_negro")["bbox"])
    client.get("/api/nrt", params={"bbox": bbox})
    assert len(calls) == 3


@pytest.mark.parametrize("params", [
    {}, {"bbox": "1,2,3"}, {"bbox": "nan,0,1,2"}, {"bbox": "0,0,inf,1"},
    {"bbox": BBOX, "days": 0}, {"bbox": BBOX, "days": 8},
    {"bbox": BBOX, "region_id": "rio_negro"},
])
def test_invalid_requests_never_reach_firms(params):
    assert client.get("/api/nrt", params=params).status_code == 422


def test_sources_are_fetched_concurrently(monkeypatch):
    pending, maximum = 0, 0

    async def handler(request):
        nonlocal pending, maximum
        pending += 1
        maximum = max(maximum, pending)
        await asyncio.sleep(0)
        pending -= 1
        return httpx.Response(200, text=HEADER)

    mock_http(monkeypatch, handler)
    assert client.get("/api/nrt", params={"bbox": BBOX}).status_code == 200
    assert maximum == 3
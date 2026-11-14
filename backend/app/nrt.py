"""Cached global FIRMS overlay. Never return upstream URLs or key-bearing errors."""

from __future__ import annotations

import asyncio
import csv
import io
import math
from collections import OrderedDict
from datetime import UTC, date, datetime, timedelta
from threading import Lock
from time import monotonic

import httpx
from fastapi import HTTPException

SOURCES = ("VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT")
BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
CACHE_SECONDS = 15 * 60
CACHE_ENTRIES = 64
_cache: OrderedDict[tuple, tuple[float, dict]] = OrderedDict()
_cache_lock = Lock()


def utc_today() -> date:
    return datetime.now(UTC).date()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def windows(days: int, today: date) -> list[tuple[date, int]]:
    """NASA's dated query goes forwards; cover exactly today-(days-1)..today."""
    start = today - timedelta(days=days - 1)
    result = []
    remaining = days
    while remaining:
        count = min(5, remaining)
        result.append((start, count))
        start += timedelta(days=count)
        remaining -= count
    return result


def parse_csv(text: str, source: str, area: list[float], start: date, end: date) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    required = {"latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "daynight", "satellite"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise ValueError("not a FIRMS hotspot CSV")
    features = []
    west, south, east, north = area
    for row in reader:
        lon, lat, frp = float(row["longitude"]), float(row["latitude"]), float(row["frp"])
        if not all(math.isfinite(v) for v in (lon, lat, frp)) or frp < 0:
            raise ValueError("invalid hotspot numbers")
        acquired = date.fromisoformat(row["acq_date"])
        time = str(int(row["acq_time"])).zfill(4)
        if len(time) != 4 or not (0 <= int(time[:2]) < 24 and 0 <= int(time[2:]) < 60):
            raise ValueError("invalid acquisition time")
        daynight = row["daynight"].upper()
        if daynight not in ("D", "N"):
            raise ValueError("invalid daynight")
        confidence = row["confidence"].strip().lower()
        if source == "MODIS_NRT":
            number = float(confidence)
            if not math.isfinite(number) or not 0 <= number <= 100:
                raise ValueError("invalid MODIS confidence")
            confidence = "low" if number < 30 else "nominal" if number < 80 else "high"
            satellite = {"t": "terra", "terra": "terra", "a": "aqua", "aqua": "aqua"}[
                row["satellite"].strip().lower()
            ]
        else:
            confidence = {"l": "low", "low": "low", "n": "nominal", "nominal": "nominal",
                          "h": "high", "high": "high"}[confidence]
            satellite = "noaa20" if source == "VIIRS_NOAA20_NRT" else "noaa21"
        fire_type = row.get("type", "").strip()
        if confidence == "low" or (fire_type and float(fire_type) != 0):
            continue
        if not (west <= lon <= east and south <= lat <= north and start <= acquired <= end):
            continue
        features.append({
            "type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"satellite": satellite, "date": acquired.isoformat(), "time": time,
                           "confidence_class": confidence, "frp": frp, "daynight": daynight},
        })
    return features


async def overlay(area: list[float], days: int, map_key: str) -> dict:
    if not map_key:
        raise HTTPException(503, "FIRMS_MAP_KEY is not configured in backend/.env")
    today = utc_today()
    key = (tuple(area), days, today)
    with _cache_lock:
        cached = _cache.get(key)
        if cached and monotonic() - cached[0] < CACHE_SECONDS:
            _cache.move_to_end(key)
            return cached[1]
        _cache.pop(key, None)

    bbox = ",".join(str(v) for v in area)
    start = today - timedelta(days=days - 1)

    async def fetch(client, source, first, count):
        response = await client.get(f"{BASE_URL}/{map_key}/{source}/{bbox}/{count}/{first.isoformat()}")
        response.raise_for_status()
        return parse_csv(response.text, source, area, start, today)

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=2.0)) as client:
            results = await asyncio.gather(
                *(fetch(client, source, first, count) for source in SOURCES for first, count in windows(days, today)),
                return_exceptions=True,
            )
        if any(isinstance(result, BaseException) for result in results):
            raise ValueError("one or more FIRMS requests failed")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, csv.Error):
        # NASA errors and HTTP exception strings can contain the MAP_KEY URL.
        # Fail the whole overlay instead of presenting incomplete source data.
        raise HTTPException(502, "FIRMS NRT data could not be retrieved; please try again later") from None

    unique = {}
    for result in results:
        for feature in result:
            props, coords = feature["properties"], feature["geometry"]["coordinates"]
            identity = (props["satellite"], props["date"], props["time"], *coords)
            unique[identity] = feature
    payload = {"type": "FeatureCollection", "features": [unique[k] for k in sorted(unique)]}
    with _cache_lock:
        _cache[key] = (monotonic(), payload)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_ENTRIES:
            _cache.popitem(last=False)
    return payload
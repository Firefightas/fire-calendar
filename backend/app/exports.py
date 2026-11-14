"""Streaming downloads using the frozen CSV columns from contracts/."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from pathlib import Path

from fastapi.responses import StreamingResponse
from shapely import intersects_xy
from shapely.geometry import Polygon
from starlette.background import BackgroundTask

from backend.app.area import AreaQuery, table_connection

POINT_COLUMNS = (
    "date", "time", "lat", "lon", "h3", "sensor", "satellite",
    "confidence_class", "frp", "daynight", "type", "is_nrt",
)
CALENDAR_COLUMNS = (
    "year", "month", "modis_raw", "viirs_raw", "harmonized", "is_estimated",
    "is_nrt", "median_m", "iqr_m", "anomaly_z", "unc_low", "unc_high", "source",
)


def csv_rows(rows: Iterable[Iterable]) -> Iterable[str]:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    for row in rows:
        writer.writerow("true" if v is True else "false" if v is False else v for v in row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def headers(kind: str, query: AreaQuery, is_mock: bool) -> dict:
    return {
        "Content-Disposition": f'attachment; filename="{kind}_{query.region_id}_{query.start}_{query.end}.csv"',
        "X-Data-Source": "MOCK DATA" if is_mock else "processed",
    }


def calendar_download(query: AreaQuery, calendar: dict) -> StreamingResponse:
    rows = (tuple(month[column] for column in CALENDAR_COLUMNS) for month in calendar["months"])
    return StreamingResponse(
        csv_rows(_with_header(CALENDAR_COLUMNS, rows)), media_type="text/csv",
        headers=headers("calendar", query, calendar["is_mock"]),
    )


def _with_header(columns: tuple, rows: Iterable) -> Iterable:
    yield columns
    yield from rows


def points_download(query: AreaQuery, geometry: Polygon, path: Path, is_mock: bool) -> StreamingResponse:
    connection = table_connection(path)
    west, south, east, north = geometry.bounds
    try:
        # Bbox and date filtering happen in DuckDB, exact polygon + holes in
        # bounded Python batches. H3 membership alone would leak edge points.
        columns = ", ".join(f'"{column}"' for column in POINT_COLUMNS)
        cursor = connection.execute(f"""
            SELECT {columns} FROM archive
            WHERE CAST(date AS DATE) >= CAST(? AS DATE)
              AND CAST(date AS DATE) < CAST(? AS DATE) + INTERVAL 1 MONTH
              AND CAST(lon AS DOUBLE) BETWEEN ? AND ?
              AND CAST(lat AS DOUBLE) BETWEEN ? AND ?
            ORDER BY CAST(date AS DATE), time, satellite, h3
        """, [query.start + "-01", query.end + "-01", west, east, south, north])
    except Exception:
        connection.close()
        raise

    def rows():
        try:
            yield POINT_COLUMNS
            while batch := cursor.fetchmany(1000):
                mask = intersects_xy(geometry, [float(r[3]) for r in batch], [float(r[2]) for r in batch])
                for row, inside in zip(batch, mask, strict=True):
                    if inside:
                        values = list(row)
                        values[1] = str(values[1]).zfill(4)
                        # Sample CSVs are deliberately all-varchar; retain
                        # the same null/bool serialization as real Parquet.
                        if isinstance(values[-1], str):
                            values[-1] = values[-1].lower() == "true"
                        yield values
        finally:
            connection.close()

    return StreamingResponse(
        csv_rows(rows()), media_type="text/csv", headers=headers("hotspots", query, is_mock),
        background=BackgroundTask(connection.close),
    )
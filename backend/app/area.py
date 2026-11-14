"""Polygon validation and area calendars; shapes remain defined by contracts/."""

from __future__ import annotations

import math
import re
from datetime import UTC, date, datetime
from pathlib import Path
from statistics import fmean, median, pstdev

import duckdb
import h3
from fastapi import HTTPException
from pydantic import BaseModel, field_validator, model_validator
from shapely.geometry import Polygon, box, shape

SATELLITES = ("terra", "aqua", "snpp", "noaa20", "noaa21")


class AreaQuery(BaseModel):
    region_id: str
    polygon: dict
    start: str = "2000-11"
    end: str = "2026-12"
    area_label: str | None = None

    @field_validator("start", "end")
    @classmethod
    def month_format(cls, value: str) -> str:
        if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value) or not 2000 <= int(value[:4]) <= 9998:
            raise ValueError("dates must be YYYY-MM, with a year from 2000 through 9998")
        return value

    @field_validator("polygon")
    @classmethod
    def polygon_format(cls, value: dict) -> dict:
        if value.get("type") != "Polygon":
            raise ValueError("polygon must be a GeoJSON Polygon")
        rings = value.get("coordinates")
        if not isinstance(rings, list) or not rings:
            raise ValueError("polygon must have an exterior ring")
        for ring in rings:
            if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError("polygon rings must be closed and have at least four positions")
            for point in ring:
                if not isinstance(point, (list, tuple)) or len(point) != 2:
                    raise ValueError("positions must be [longitude, latitude]")
                if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point):
                    raise ValueError("coordinates must be finite numbers")
                if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
                    raise ValueError("coordinates are outside longitude/latitude bounds")
        geometry = shape(value)
        if geometry.is_empty or not geometry.is_valid or geometry.area == 0:
            raise ValueError("polygon must be nonempty and valid, without crossing rings")
        return value

    @model_validator(mode="after")
    def ordered_months(self) -> AreaQuery:
        if self.start > self.end:
            raise ValueError("start must be on or before end")
        return self


def region_polygon(query: AreaQuery, region: dict) -> Polygon:
    geometry = shape(query.polygon)
    if not box(*region["bbox"]).covers(geometry):
        raise HTTPException(422, "polygon must be inside the selected region bbox")
    return geometry


def table_connection(path: Path) -> duckdb.DuckDBPyConnection:
    """A private connection per request; sample CSV fields retain leading zeros."""
    connection = duckdb.connect()
    try:
        if path.suffix == ".parquet":
            connection.read_parquet(str(path)).create_view("archive")
        else:
            connection.read_csv(str(path), all_varchar=True).create_view("archive")
        return connection
    except Exception:
        connection.close()
        raise


def monthly_counts(path: Path, polygon: dict, day_cutoff: tuple[int, int] | None = None) -> dict[tuple[int, int], dict]:
    cells = sorted(h3.geo_to_cells(polygon, res=7))
    if not cells:
        return {}
    where, parameters = "", [cells]
    if day_cutoff is not None:
        where = " AND (month(CAST(date AS DATE)) != ? OR day(CAST(date AS DATE)) <= ?)"
        parameters.extend(day_cutoff)
    with table_connection(path) as connection:
        rows = connection.execute(f"""
            WITH selected AS (
                SELECT h3, CAST(date AS DATE) AS day, sensor, satellite
                FROM archive WHERE h3 IN (SELECT unnest(?)){where}
            )
            SELECT year(day), month(day), satellite,
                   COUNT(DISTINCT (h3, day))
            FROM selected GROUP BY 1, 2, 3
            UNION ALL
            SELECT year(day), month(day), 'modis',
                   COUNT(DISTINCT (h3, day))
            FROM selected WHERE sensor = 'modis' GROUP BY 1, 2
        """, parameters).fetchall()
    counts = {}
    for year, month, satellite, count in rows:
        counts.setdefault((year, month), dict.fromkeys((*SATELLITES, "modis"), 0))[satellite] = count
    return counts


def area_factors(counts: dict, calibration: dict) -> dict[int, dict]:
    """Fit local monthly ratios only in 2012-2020; sparse months inherit the region.

    Match P3's >=5 denominator and >=3 usable-year thresholds. Unlike P3's
    whole-region pooled fallback, an area uses its parent region when sparse.
    Terra-only and NOAA conversion factors remain the supplied regional ones.
    """
    factors = {}
    for parent in calibration["monthly_factors"]:
        month = parent["month"]
        ratios = [
            row["snpp"] / row["modis"]
            for (year, m), row in counts.items()
            if m == month and (2012, 2) <= (year, m) <= (2020, 12)
            and row["modis"] >= 5 and row["snpp"] > 0
        ]
        if len(ratios) >= 3:
            factors[month] = {"factor": median(ratios), "cv": pstdev(ratios) / fmean(ratios)}
        else:
            factors[month] = {"factor": parent["factor"], "cv": parent["cv"]}
    return factors


def quantile(values: list[float], p: float) -> float:
    """Linear interpolation, matching P3's pandas quantile convention."""
    values = sorted(values)
    index = (len(values) - 1) * p
    lo, hi = math.floor(index), math.ceil(index)
    return values[lo] + (values[hi] - values[lo]) * (index - lo)


def epoch(row: dict, parent: dict, calibration: dict, factors: dict) -> tuple:
    monthly = factors[parent["month"]]
    ym = (parent["year"], parent["month"])
    # Use regional source availability after S-NPP: zero area detections do
    # not establish that a satellite was unavailable for the whole month.
    if ym < (2002, 7):
        column, source = "terra", "modis_terra"
        factor = calibration["terra_only_factor"] * monthly["factor"]
        terra_cv = calibration.get("diagnostics", {}).get("terra_only", {}).get("cv", 0.0)
        cv = math.hypot(monthly["cv"], terra_cv)
    elif ym < (2012, 2):
        column, source = "modis", "modis_terra_aqua"
        factor, cv = monthly["factor"], monthly["cv"]
    elif ym <= (2026, 10):
        column, source, factor, cv = "snpp", "viirs_snpp", 1.0, 0.0
    else:
        column = "noaa21" if parent["source"] == "viirs_noaa21" else "noaa20"
        source, factor = f"viirs_{column}", calibration[f"{column}_factor"]
        cv = calibration.get("diagnostics", {}).get(column, {}).get("cv", 0.0)
    return column, source, factor, cv


def build_calendar(query: AreaQuery, path: Path, reference: dict, calibration: dict, is_mock: bool) -> dict:
    counts = monthly_counts(path, query.polygon)
    factors = area_factors(counts, calibration)
    months = []
    for parent in reference["months"]:
        year, month = parent["year"], parent["month"]
        row = counts.get((year, month), dict.fromkeys((*SATELLITES, "modis"), 0))
        column, source, factor, cv = epoch(row, parent, calibration, factors)
        harmonized = row[column] * factor
        half = 1.96 * math.sqrt(harmonized + (cv * harmonized) ** 2)
        from_modis = source.startswith("modis")
        months.append({
            "year": year, "month": month,
            "modis_raw": row[column] if from_modis else row["modis"],
            "viirs_raw": None if from_modis else row[column],
            "harmonized": harmonized, "is_estimated": from_modis,
            "is_nrt": parent["is_nrt"], "source": source,
            "unc_low": max(0.0, harmonized - half), "unc_high": harmonized + half,
        })

    baseline = reference["baseline_years"]
    for month in range(1, 13):
        values = [
            r["harmonized"] for r in months
            if r["month"] == month and baseline[0] <= r["year"] <= baseline[1]
        ]
        if not values:
            raise HTTPException(503, "regional calendar does not contain a complete anomaly baseline")
        middle, iqr = median(values), quantile(values, 0.75) - quantile(values, 0.25)
        for row in months:
            if row["month"] == month:
                row.update(median_m=middle, iqr_m=iqr, anomaly_z=(row["harmonized"] - middle) / max(iqr, 1.0))

    diagnostics = calibration.get("diagnostics", {})
    if diagnostics.get("last_month_complete") is False and months:
        try:
            last_day = date.fromisoformat(diagnostics.get("last_data_date", ""))
        except (ValueError, TypeError):
            last_day = None
        if last_day and (last_day.year, last_day.month) == (months[-1]["year"], months[-1]["month"]):
            partial = monthly_counts(path, query.polygon, (last_day.month, last_day.day))
            templates = {(r["year"], r["month"]): r for r in reference["months"]}
            values = []
            for year in range(baseline[0], baseline[1] + 1):
                row = partial.get((year, last_day.month), dict.fromkeys((*SATELLITES, "modis"), 0))
                template = templates[(year, last_day.month)]
                column, _, factor, _ = epoch(row, template, calibration, factors)
                values.append(row[column] * factor)
            middle = median(values)
            iqr = quantile(values, 0.75) - quantile(values, 0.25)
            months[-1].update(
                median_m=middle, iqr_m=iqr,
                anomaly_z=(months[-1]["harmonized"] - middle) / max(iqr, 1.0),
            )

    # Calculate baseline and calibration from the full archive BEFORE slicing.
    months = [r for r in months if query.start <= f"{r['year']:04d}-{r['month']:02d}" <= query.end]
    result = {
        "region_id": query.region_id, "unit": "active_fire_cell_days", "scale": "SNPP_VIIRS_EQ",
        "is_mock": bool(is_mock or reference["is_mock"] or calibration["is_mock"]),
        "generated_at": datetime.now(UTC).isoformat(),
        "first_month": f"{months[0]['year']:04d}-{months[0]['month']:02d}" if months else query.start,
        "last_month": f"{months[-1]['year']:04d}-{months[-1]['month']:02d}" if months else query.end,
        "baseline_years": baseline, "months": months,
    }
    if query.area_label is not None:
        result["area_label"] = query.area_label
    return result
"""Conservative retrospective screen for persistent thermal sources.

These are inferred sources, not confirmed industrial facilities. Never use the
screen as a ground-truth fire/non-fire label. No regional lists or FRP cutoffs.
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd

SITE_RESOLUTION = 9
MIN_DAYS = 20
MIN_MONTHS = 4
MIN_SPAN_DAYS = 120
MIN_YEARS = 2
EVENT_NEIGHBORS = 3


def screen_persistence(points: pd.DataFrame) -> tuple[pd.Series, pd.DataFrame]:
    """Return a removal mask and auditable site/year evidence, without changing columns.

    A site is an H3 res-9 cell (~0.1 km²). In at least two distinct years,
    at least one individual satellite must detect it on >=20 distinct days,
    in >=4 months spanning >=120 days. Only qualifying site-years are screened,
    using one common spatial/temporal mask for all satellites (never adding their
    counts). Points during a wider event are retained: >=3 adjacent res-7 cells
    active within +/-1 day. Historic/isolated fires are not retroactively masked.
    """
    p = points.reset_index(drop=True).copy()
    p["date"] = pd.to_datetime(p["date"])
    p["year"] = p["date"].dt.year
    p["month"] = p["date"].dt.month
    p["site"] = [h3.latlng_to_cell(a, b, SITE_RESOLUTION) for a, b in zip(p.lat, p.lon, strict=True)]
    daily = p.drop_duplicates(["site", "satellite", "date"])
    evidence = daily.groupby(["site", "satellite", "year"]).agg(
        days=("date", "size"), months=("month", "nunique"), first=("date", "min"), last=("date", "max")
    ).reset_index()
    evidence["span_days"] = (evidence["last"] - evidence["first"]).dt.days
    evidence["qualifies"] = (
        (evidence.days >= MIN_DAYS) & (evidence.months >= MIN_MONTHS) & (evidence.span_days >= MIN_SPAN_DAYS)
    )
    repeated = evidence[evidence.qualifies].groupby("site").year.nunique()
    sites = set(repeated[repeated >= MIN_YEARS].index)
    qualified = evidence[evidence.qualifies & evidence.site.isin(sites)]
    keys = set(zip(qualified.site, qualified.year, strict=True))
    candidate = np.array([(s, y) in keys for s, y in zip(p.site, p.year, strict=True)], dtype=bool)
    evidence["persistent_site"] = evidence.site.isin(sites)

    # Use unique neighbor cells, not rows, satellites or repeated overpasses.
    active = {day: set(g.h3) for day, g in p.groupby("date")}
    protected = set()
    neighbors = {}
    for cell, day in p.loc[candidate, ["h3", "date"]].drop_duplicates().itertuples(index=False, name=None):
        if cell not in neighbors:
            neighbors[cell] = set(h3.grid_disk(cell, 1)) - {cell}
        nearby = set().union(*(active.get(day + pd.Timedelta(days=d), set()) for d in (-1, 0, 1)))
        if len(neighbors[cell] & nearby) >= EVENT_NEIGHBORS:
            protected.add((cell, day))
    removed = candidate & np.array(
        [(cell, day) not in protected for cell, day in zip(p.h3, p.date, strict=True)], dtype=bool
    )
    return pd.Series(removed, index=points.index, name="persistent_source"), evidence


def filter_persistent_sources(points: pd.DataFrame) -> pd.DataFrame:
    """Filter points first; derive hex_day from the retained table afterward."""
    removed, _ = screen_persistence(points)
    return points.loc[~removed].copy()

"""Reproducible evidence and before/after checks; writes only local audit artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline.ingest.normalize import hex_day
from pipeline.ingest.persistence import screen_persistence


def audit(points: pd.DataFrame, suspects: pd.DataFrame, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    p = points.copy()
    p["date"] = pd.to_datetime(p.date)
    p["year"] = p.date.dt.year
    annual = p.drop_duplicates(["h3", "satellite", "date"]).groupby(["h3", "satellite", "year"]).size()
    annual = annual.rename("days").reset_index()
    recurrent = annual[annual.days >= 10].groupby("h3").year.nunique()
    reproduced = set(recurrent[recurrent >= 2].index)
    annual[annual.h3.isin(suspects.h3)].to_csv(out / "suspect_satellite_year_days.csv", index=False)
    rows = []
    for cell, g in p[p.h3.isin(suspects.h3)].groupby("h3"):
        lat, lon = g.lat.median(), g.lon.median()
        distance = 6371000 * np.sqrt(np.radians(g.lat - lat)**2
                                    + (np.cos(np.radians(lat)) * np.radians(g.lon - lon))**2)
        rows.append(dict(h3=cell, points=len(g), night_share=float(g.daynight.eq("N").mean()),
                         frp_p10=float(g.frp.quantile(.1)), frp_median=float(g.frp.median()),
                         frp_p90=float(g.frp.quantile(.9)), radius_p50_m=float(np.quantile(distance, .5)),
                         radius_p90_m=float(np.quantile(distance, .9))))
    metrics = pd.DataFrame(rows)
    metrics[metrics.h3.isin(suspects.h3)].to_csv(out / "suspect_spatial_frp.csv", index=False)
    removed, evidence = screen_persistence(points)
    evidence.to_csv(out / "persistence_evidence.csv", index=False)
    kept = points.loc[~removed]
    summary = dict(suspects_reproduced=reproduced == set(suspects.h3), suspect_hexes=len(reproduced),
                   points_before=len(points), points_after=len(kept), removed_points=int(removed.sum()),
                   removed_percent=100 * float(removed.mean()), hexes_before=int(points.h3.nunique()),
                   hexes_after=int(kept.h3.nunique()), affected_hexes=int(points.loc[removed].h3.nunique()),
                   sites=int(evidence.loc[evidence.persistent_site, "site"].nunique()),
                   hex_day_before=len(hex_day(points)), hex_day_after=len(hex_day(kept)), seasons={})
    for name, start, end in [("2000-2002", "2000-01-01", "2002-12-31"),
                              ("2016-12_to_2017-02", "2016-12-01", "2017-02-28")]:
        sel = p.date.between(start, end)
        r = p.loc[sel & removed]
        summary["seasons"][name] = dict(before=int(sel.sum()), after=int((sel & ~removed).sum()),
                                         removed=int((sel & removed).sum()),
                                         removed_hexes=sorted(r.h3.unique()),
                                         removed_frp_max=None if r.empty else float(r.frp.max()))
    for name, sel in [("suspects", p.h3.isin(suspects.h3)), ("other", ~p.h3.isin(suspects.h3))]:
        g = p[sel]
        summary[name] = dict(points=len(g), night_share=float(g.daynight.eq("N").mean()),
                             frp_median=float(g.frp.median()), type0=int(g.type.eq(0).sum()),
                             null_type=int(g.type.isna().sum()))
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--points", required=True, type=Path)
    ap.add_argument("--suspects", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    result = audit(pd.read_parquet(args.points), pd.read_csv(args.suspects), args.out)
    result["input_sha256"] = hashlib.sha256(args.points.read_bytes()).hexdigest()
    (args.out / "summary.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

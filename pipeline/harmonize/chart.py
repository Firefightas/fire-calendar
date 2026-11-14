"""Validation chart for the pitch: raw (naive sensor switch) vs. harmonized series, plus the held-out test.

Reads calendar.json + calibration.json written by pipeline.harmonize.run; every number on the
chart comes from those two files. Mock inputs (is_mock: true) are labeled "MOCK DATA".

Usage (from repo root; matplotlib is not a project dependency yet, hence --with):
    uv run --with matplotlib python -m pipeline.harmonize.chart --region rio_negro
    uv run --with matplotlib python -m pipeline.harmonize.chart --region rio_negro --dir <dir> --out chart.png
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from pipeline.harmonize.run import PROCESSED, REGIONS

SMOOTH_MONTHS = 12  # running mean, so the seasonal cycle does not hide the 2012 step

SURFACE, INK, INK_SECONDARY, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
HARMONIZED_COLOR, RAW_COLOR = "#2a78d6", "#eb6834"


def chart_data(calendar: dict, calibration: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(series, holdout) frames behind the two panels.

    series:  date, raw (VIIRS where it exists, else MODIS: the naive switch), harmonized, and
             their SMOOTH_MONTHS running means raw_smooth / harmonized_smooth.
    holdout: date, observed (S-NPP), predicted (MODIS x fitted monthly factor) for the test years.
    """
    months = pd.DataFrame(calendar["months"])
    months["date"] = pd.to_datetime({"year": months["year"], "month": months["month"], "day": 1})
    series = pd.DataFrame({"date": months["date"],
                           "raw": months["viirs_raw"].astype(float).fillna(months["modis_raw"].astype(float)),
                           "harmonized": months["harmonized"]})
    for column in ("raw", "harmonized"):
        series[f"{column}_smooth"] = series[column].rolling(SMOOTH_MONTHS).mean()

    factor = months["month"].map({f["month"]: f["factor"] for f in calibration["monthly_factors"]})
    test = months["year"].between(*calibration["test_years"]) & (months["source"] == "viirs_snpp")
    holdout = pd.DataFrame({"date": months.loc[test, "date"], "observed": months.loc[test, "viirs_raw"],
                            "predicted": months.loc[test, "modis_raw"] * factor[test]})
    return series, holdout.reset_index(drop=True)


def _style(ax) -> None:
    ax.set_facecolor(SURFACE)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK_SECONDARY, length=0, labelsize=10)
    ax.set_ylim(bottom=0)


def plot(calendar: dict, calibration: dict, out: Path) -> Path:
    import matplotlib  # noqa: PLC0415

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt  # noqa: PLC0415

    series, holdout = chart_data(calendar, calibration)
    region = REGIONS.get(calendar["region_id"], {}).get("name", calendar["region_id"])
    mock = "MOCK DATA (synthetic input) · " if calendar["is_mock"] or calibration["is_mock"] else ""
    fit, test = calibration["fit_years"], calibration["test_years"]

    fig, (top, bottom) = plt.subplots(2, 1, figsize=(12, 6.75), height_ratios=[3, 2], facecolor=SURFACE)
    fig.subplots_adjust(left=0.07, right=0.97, top=0.80, bottom=0.07, hspace=0.45)

    # Panel 1: the sensor switch.
    top.plot(series["date"], series["raw_smooth"], color=RAW_COLOR, linewidth=2, label="Raw: MODIS, then VIIRS")
    top.plot(series["date"], series["harmonized_smooth"], color=HARMONIZED_COLOR, linewidth=2,
             label="Harmonized (S-NPP VIIRS equivalent)")
    _style(top)
    switch = pd.Timestamp(2012, 2, 1)
    if series["date"].min() < switch < series["date"].max():
        top.axvline(switch, color=INK_SECONDARY, linewidth=1, linestyle=(0, (4, 3)))
        top.annotate("S-NPP VIIRS starts (Feb 2012)", (switch, top.get_ylim()[1]), xytext=(6, -4),
                     textcoords="offset points", va="top", fontsize=10, color=INK_SECONDARY)
    top.legend(loc="upper left", frameon=False, fontsize=10, labelcolor=INK, ncols=2,
               bbox_to_anchor=(0, 1.13), borderaxespad=0, handlelength=1.6)
    top.set_ylabel(f"cell-days per month\n({SMOOTH_MONTHS}-month running mean)", color=INK_SECONDARY, fontsize=10)
    if "raw_step_ratio" in calibration:
        step = (f"2013–2015 vs. 2009–2011: raw ×{calibration['raw_step_ratio']:.2f}, "
                f"harmonized ×{calibration['harmonized_step_ratio']:.2f}")
        top.set_title(step, loc="right", fontsize=10, color=INK_SECONDARY, pad=10)

    # Panel 2: held-out test.
    bottom.plot(holdout["date"], holdout["observed"], color=INK_SECONDARY, linewidth=2, label="Observed S-NPP VIIRS")
    bottom.plot(holdout["date"], holdout["predicted"], color=HARMONIZED_COLOR, linewidth=2,
                label=f"Predicted from MODIS (factors fitted on {fit[0]}–{fit[1]} only)")
    _style(bottom)
    bottom.legend(loc="upper left", frameon=False, fontsize=10, labelcolor=INK, ncols=2,
                  bbox_to_anchor=(0, 1.2), borderaxespad=0, handlelength=1.6)
    bottom.set_ylabel("cell-days per month", color=INK_SECONDARY, fontsize=10)
    error = f"Held-out {test[0]}–{test[1]}: MAE {calibration['test_mae']:.1f} cell-days"
    if "test_mape" in calibration:
        error += f" (MAPE {calibration['test_mape']:.1%})"
    bottom.set_title(error, loc="right", fontsize=10, color=INK_SECONDARY, pad=10)

    fig.suptitle(f"{region}: active fire cell-days, raw vs. harmonized", x=0.07, y=0.965, ha="left",
                 fontsize=15, fontweight="bold", color=INK)
    fig.text(0.07, 0.905, f"{mock}H3 res-7 hexes with ≥ 1 detection per day · scale {calendar['scale']} · "
             f"{calendar['first_month']} to {calendar['last_month']}", fontsize=10, color=INK_SECONDARY)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=200, facecolor=SURFACE)
    plt.close(fig)
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--region", required=True, choices=sorted(REGIONS))
    parser.add_argument("--dir", type=Path, help="folder with calendar.json and calibration.json "
                                                 "(default: data/processed/<region>)")
    parser.add_argument("--out", type=Path, help="PNG path (default: <dir>/validation_chart.png)")
    args = parser.parse_args(argv)

    folder = args.dir or PROCESSED / args.region
    for name in ("calendar.json", "calibration.json"):
        if not (folder / name).exists():
            parser.error(f"{folder / name} not found: run pipeline.harmonize.run first")
    calendar = json.loads((folder / "calendar.json").read_text())
    calibration = json.loads((folder / "calibration.json").read_text())
    print(plot(calendar, calibration, args.out or folder / "validation_chart.png"))


if __name__ == "__main__":
    main()

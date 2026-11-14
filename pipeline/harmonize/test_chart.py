import pytest

from pipeline.harmonize import chart, run


@pytest.fixture(scope="module")
def outputs():
    calendar, calibration, _ = run.build_outputs(run.synthetic_hex_day("rio_negro", seed=0), "rio_negro", is_mock=True)
    return calendar, calibration


def test_chart_data_comes_from_the_output_files(outputs):
    calendar, calibration = outputs
    series, holdout = chart.chart_data(calendar, calibration)
    assert len(series) == len(calendar["months"])

    by_date = series.set_index("date")
    # Raw is the naive switch: MODIS before S-NPP, VIIRS after; harmonized is untouched.
    m2005 = next(m for m in calendar["months"] if (m["year"], m["month"]) == (2005, 3))
    m2015 = next(m for m in calendar["months"] if (m["year"], m["month"]) == (2015, 3))
    assert by_date.loc["2005-03-01", "raw"] == m2005["modis_raw"]
    assert by_date.loc["2015-03-01", "raw"] == m2015["viirs_raw"]
    assert by_date.loc["2005-03-01", "harmonized"] == m2005["harmonized"]
    assert series["harmonized_smooth"].iloc[11] == pytest.approx(series["harmonized"].iloc[:12].mean())

    # The held-out panel reproduces the reported test error.
    assert holdout["date"].dt.year.between(*calibration["test_years"]).all()
    mae = (holdout["predicted"] - holdout["observed"]).abs().mean()
    assert mae == pytest.approx(calibration["test_mae"], rel=0.02)


def test_plot_writes_png(outputs, tmp_path):
    pytest.importorskip("matplotlib")
    out = chart.plot(*outputs, tmp_path / "chart.png")
    assert out.stat().st_size > 10_000

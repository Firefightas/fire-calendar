import json
from pathlib import Path

import pandas as pd
import pytest
from jsonschema import Draft202012Validator

from pipeline.harmonize import run

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"


@pytest.fixture(scope="module")
def hex_day():
    return run.synthetic_hex_day("rio_negro", seed=0)


@pytest.fixture(scope="module")
def monthly(hex_day):
    return run.monthly_cell_days(hex_day)


def test_modis_combined_counts_a_hex_day_once():
    hd = pd.DataFrame({
        "h3": ["a", "a", "b", "a"], "date": ["2015-01-05", "2015-01-05", "2015-01-05", "2015-03-01"],
        "sensor": ["modis", "modis", "viirs", "modis"], "satellite": ["terra", "aqua", "snpp", "aqua"],
        "n_points": 1, "frp_sum": 1.0,
    })
    m = run.monthly_cell_days(hd).set_index(["year", "month"])
    assert m.loc[(2015, 1), ["terra", "aqua", "snpp", "modis"]].tolist() == [1, 1, 1, 1]
    assert m.loc[(2015, 2)].sum() == 0  # months without fire are present, as zeros
    assert m.loc[(2015, 3), "modis"] == 1


def test_recovers_known_ratios(monthly):
    truth, f = run.SYNTHETIC_TRUTH, run.fit_factors(monthly)
    factors = [m["factor"] for m in f["monthly"]]
    assert not any(m["fallback"] for m in f["monthly"])
    assert sorted(factors)[6] == pytest.approx(truth["monthly_factor"], rel=0.05)
    assert factors == pytest.approx([truth["monthly_factor"]] * 12, rel=0.2)
    assert f["terra_only"]["factor"] == pytest.approx(truth["terra_only_factor"], rel=0.05)
    assert f["noaa20"]["factor"] == pytest.approx(truth["noaa20_factor"], rel=0.03)
    assert f["noaa21"]["factor"] == pytest.approx(truth["noaa21_factor"], rel=0.05)
    # Afternoon Aqua sees more of what S-NPP sees than morning Terra does (synthetic detection rates).
    assert f["aqua_to_snpp"]["factor"] < f["terra_to_snpp"]["factor"]


def test_fit_uses_fit_years_only(monthly):
    tampered = monthly.copy()
    outside = ~tampered["year"].between(*run.FIT_YEARS)
    tampered.loc[outside, ["terra", "aqua", "modis", "snpp", "noaa20"]] *= 7
    a, b = run.fit_factors(monthly), run.fit_factors(tampered)
    for key in ("monthly", "terra_only", "noaa20"):
        assert a[key] == b[key]


def test_sparse_month_falls_back_to_pooled_factor(monthly):
    sparse = monthly.copy()
    sparse.loc[sparse["month"] == 6, ["terra", "aqua", "modis"]] = 1  # below MIN_CELL_DAYS
    june = run.fit_factors(sparse)["monthly"][5]
    assert june["fallback"] and june["n_years"] == 0 and june["factor"] > 0


def test_iqr_anomaly_score():
    series = pd.DataFrame({"year": [2001, 2002, 2003, 2004, 2005], "month": 1,
                           "harmonized": [10.0, 20.0, 30.0, 40.0, 100.0]})
    out = run.add_anomaly(series, (2001, 2004))  # 2005 is outside the baseline
    assert out["median_m"].iloc[0] == 25.0 and out["iqr_m"].iloc[0] == 15.0
    assert out["anomaly_z"].iloc[-1] == pytest.approx((100 - 25) / 15)
    flat = run.add_anomaly(series.assign(harmonized=[3.0, 3.0, 3.0, 3.0, 5.0]), (2001, 2004))
    assert flat["anomaly_z"].iloc[-1] == pytest.approx(2.0)  # IQR 0 -> floor 1.0


def test_outputs_match_contracts(hex_day):
    calendar, calibration = run.build_outputs(hex_day, "rio_negro", is_mock=True)
    for name, doc in (("calendar.schema.json", calendar), ("calibration.schema.json", calibration)):
        errors = list(Draft202012Validator(json.loads((CONTRACTS / name).read_text())).iter_errors(doc))
        assert not errors, [e.message for e in errors[:5]]
    assert calendar["is_mock"] and calibration["is_mock"]
    assert calendar["baseline_years"] == [2001, 2025]
    assert (calendar["first_month"], calendar["last_month"]) == ("2000-11", "2026-11")

    months = {(m["year"], m["month"]): m for m in calendar["months"]}
    assert list(months) == sorted(months)
    expected_source = {(2000, 11): "modis_terra", (2002, 6): "modis_terra", (2002, 7): "modis_terra_aqua",
                       (2012, 1): "modis_terra_aqua", (2012, 2): "viirs_snpp", (2026, 10): "viirs_snpp",
                       (2026, 11): "viirs_noaa20"}
    for ym, source in expected_source.items():
        assert months[ym]["source"] == source, ym
    for m in months.values():
        assert m["unc_low"] <= m["harmonized"] <= m["unc_high"]
        assert m["is_estimated"] == (m["viirs_raw"] is None) == m["source"].startswith("modis")
    assert not months[(2026, 5)]["is_nrt"] and months[(2026, 6)]["is_nrt"]

    # The naive sensor switch jumps at 2012; the harmonized series does not.
    assert calibration["raw_step_ratio"] > 1.5
    assert calibration["harmonized_step_ratio"] < calibration["raw_step_ratio"]
    assert calibration["test_mape"] < 0.2


def test_cli_writes_files(tmp_path, capsys):
    run.main(["--region", "romania", "--synthetic", "--out", str(tmp_path)])
    assert json.loads((tmp_path / "calendar.json").read_text())["region_id"] == "romania"
    assert json.loads((tmp_path / "calibration.json").read_text())["is_mock"] is True
    assert "SYNTHETIC" in capsys.readouterr().out
    with pytest.raises(SystemExit):  # synthetic output must never land in data/processed by default
        run.main(["--region", "romania", "--synthetic"])

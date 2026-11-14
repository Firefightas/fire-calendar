import pandas as pd

from pipeline.ingest.normalize import dedupe_nrt, filter_and_clip, hex_day, normalize_frame

BBOX = [-71.9, -42.0, -62.8, -37.5]


def modis_raw():
    return pd.DataFrame({
        "latitude": [-39.3, -39.3, -39.2, 10.0], "longitude": [-65.6, -65.6, -65.5, 10.0],
        "brightness": [320, 330, 340, 350], "scan": 1.0, "track": 1.0,
        "acq_date": ["2015-01-05"] * 4, "acq_time": [1405, 1405, 305, 1405],
        "satellite": ["Aqua", "Terra", "A", "T"], "instrument": "MODIS",
        "confidence": [85, 20, 50, 90], "version": "6.1", "bright_t31": 300, "frp": [12.0, 3.0, 5.0, 1.0],
        "daynight": ["D", "D", "N", "D"], "type": [0, 0, 2, 0],
    })


def viirs_raw():
    return pd.DataFrame({
        "latitude": [-39.3, -39.31], "longitude": [-65.6, -65.61], "bright_ti4": [330, 340],
        "scan": 0.4, "track": 0.4, "acq_date": ["2026-11-10", "2026-11-10"], "acq_time": [512, 1730],
        "satellite": ["N20", "N21"], "instrument": "VIIRS", "confidence": ["n", "h"],
        "version": ["2.0NRT", "2.0NRT"], "bright_ti5": 290, "frp": [2.0, 4.0], "daynight": ["N", "D"],
    })


def test_modis_normalize_and_filter():
    df = normalize_frame(modis_raw())
    assert list(df["satellite"]) == ["aqua", "terra", "aqua", "terra"]
    assert list(df["confidence_class"]) == ["high", "low", "nominal", "high"]
    assert df["time"].iloc[2] == "0305" and not df["is_nrt"].any()
    kept = filter_and_clip(df, BBOX)
    assert len(kept) == 1  # low confidence, static source (type 2) and out-of-bbox removed


def test_viirs_normalize():
    df = normalize_frame(viirs_raw())
    assert list(df["satellite"]) == ["noaa20", "noaa21"]
    assert list(df["confidence_class"]) == ["nominal", "high"]
    assert df["is_nrt"].all() and df["type"].isna().all()
    assert len(filter_and_clip(df, BBOX)) == 2


def test_dedupe_prefers_standard_data():
    sp = normalize_frame(modis_raw()).iloc[:1]
    nrt = sp.assign(is_nrt=True)
    assert len(dedupe_nrt(pd.concat([sp, nrt]))) == 1


def test_hex_day_counts_per_satellite():
    pts = normalize_frame(modis_raw()).assign(h3="87abc")
    hd = hex_day(pts)
    assert list(hd.columns) == ["h3", "date", "sensor", "satellite", "n_points", "frp_sum"]
    assert set(hd["satellite"]) == {"terra", "aqua"} and hd["n_points"].sum() == 4

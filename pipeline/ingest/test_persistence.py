import h3
import pandas as pd
import pytest

from pipeline.ingest.normalize import hex_day
from pipeline.ingest.persistence import filter_persistent_sources, screen_persistence


def point(lat, lon, day, satellite="snpp"):
    return dict(date=pd.Timestamp(day).date(), time="0100", lat=lat, lon=lon,
                h3=h3.latlng_to_cell(lat, lon, 7), sensor="viirs", satellite=satellite,
                confidence_class="nominal", frp=2.0, daynight="N", type=0, is_nrt=False)


def persistent(lat=-38.3, lon=-69.0):
    return pd.DataFrame([point(lat, lon, f"{year}-{month:02}-{day:02}")
                         for year in (2019, 2020) for month in (1, 4, 7, 10) for day in range(1, 6)])


@pytest.mark.parametrize("lat,lon", [(-38.3, -69.0), (38.3, -121.0), (46.0, 25.0)])
def test_rule_is_geographic_and_applies_to_all_satellites(lat, lon):
    p = persistent(lat, lon)
    extra = pd.DataFrame([point(lat, lon, "2020-07-10", sat)
                          for sat in ("terra", "aqua", "snpp", "noaa20", "noaa21")])
    p = pd.concat([p, extra], ignore_index=True)
    removed, _ = screen_persistence(p)
    assert removed.all()
    assert filter_persistent_sources(p).columns.tolist() == p.columns.tolist()


def test_no_summing_satellites_or_duplicate_overpasses_to_reach_threshold():
    p = persistent()
    p["satellite"] = ["snpp" if i % 2 else "noaa20" for i in range(len(p))]
    p = pd.concat([p, p, p], ignore_index=True)
    assert not screen_persistence(p)[0].any()


def test_short_recurrent_fire_and_single_long_fire_stay():
    short = pd.DataFrame([point(40, -120, day) for year in (2019, 2020)
                          for day in pd.date_range(f"{year}-07-01", periods=25)])
    long = persistent().query("date >= @pd.Timestamp('2020-01-01').date()")
    assert not screen_persistence(short)[0].any()
    assert not screen_persistence(long)[0].any()


def test_old_fire_and_other_locations_in_same_hex_stay_and_tables_aggregate():
    p = persistent()
    # Same output hex, but spatially separate from the recurring pixel site.
    lat, lon = h3.cell_to_latlng(p.h3.iloc[0])
    other = point(lat, lon, "2020-07-01")
    assert h3.latlng_to_cell(lat, lon, 9) != h3.latlng_to_cell(-38.3, -69.0, 9)
    p = pd.concat([p, pd.DataFrame([point(-38.3, -69.0, "2001-01-01"), other])], ignore_index=True)
    kept = filter_persistent_sources(p)
    assert len(kept) == 2
    assert hex_day(kept).n_points.sum() == len(kept)


def test_widespread_event_preserves_candidate_points():
    p = persistent()
    cell = p.h3.iloc[0]
    neighbors = sorted(set(h3.grid_disk(cell, 1)) - {cell})[:3]
    extra = [point(*h3.cell_to_latlng(c), "2020-07-02") for c in neighbors]
    p = pd.concat([p, pd.DataFrame(extra)], ignore_index=True)
    removed, _ = screen_persistence(p)
    for day in ("2020-07-01", "2020-07-02", "2020-07-03"):
        assert not removed[p.date == pd.Timestamp(day).date()].any()
    assert removed.any()


def test_empty_and_nonconsecutive_index():
    p = persistent()
    p.index = range(100, 100 + len(p))
    assert screen_persistence(p)[0].index.equals(p.index)
    assert filter_persistent_sources(p.iloc[:0]).empty

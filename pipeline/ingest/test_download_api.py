from datetime import date
from types import SimpleNamespace

import pytest
import requests

from pipeline.ingest import download_api


@pytest.mark.parametrize("failure", ["network", "body", "empty"])
def test_failed_requests_do_not_expose_key(monkeypatch, failure):
    key = "test-secret-only"

    def get(*args, **kwargs):
        if failure == "network":
            raise requests.ConnectionError(f"https://example.invalid/{key}")
        return SimpleNamespace(status_code=200, text=key if failure == "body" else "")

    monkeypatch.setattr(download_api.requests, "get", get)
    monkeypatch.setattr(download_api.time, "sleep", lambda _: None)
    with pytest.raises(RuntimeError) as exc:
        download_api.fetch(key, "MODIS_NRT", [0, 0, 1, 1], date(2026, 5, 1), 5)
    assert key not in str(exc.value)
    assert exc.value.__suppress_context__


def test_header_only_csv_is_valid_empty_result(monkeypatch):
    monkeypatch.setattr(download_api.requests, "get", lambda *a, **k: SimpleNamespace(
        status_code=200, text="latitude,longitude,acq_date,satellite\n"))
    result = download_api.fetch("test-key", "MODIS_SP", [0, 0, 1, 1], date(2000, 1, 1), 5)
    assert result.empty
    assert "acq_date" in result.columns

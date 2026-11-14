import copy
import json

import pandas as pd
import pytest

from pipeline.sandbox_inputs.join_history import HISTORY_COLUMNS, ROOT, join_history


@pytest.fixture
def grid():
    return json.loads((ROOT / "contracts/mocks/rio_negro/sandbox_grid.json").read_text(encoding="utf-8"))


def test_left_join_preserves_zero_count_recency_and_missing_null(grid):
    first, second = [c["h3"] for c in grid["cells"][:2]]
    history = pd.DataFrame([[first, 0.0, 2.5], [second, 9.3, 0.0]], columns=HISTORY_COLUMNS)
    original = copy.deepcopy(grid)
    result = join_history(grid, history)
    assert grid == original
    assert result["is_mock"]
    assert result["cells"][0]["burn_count"] == 0
    assert result["cells"][0]["years_since_last_fire"] == 2.5
    assert result["cells"][1]["burn_count"] == 9.3
    assert result["cells"][1]["years_since_last_fire"] == 0
    for cell in result["cells"][2:]:
        assert cell["burn_count"] == 0 and cell["years_since_last_fire"] is None


def test_replacement_history_overwrites_all_old_values(grid):
    h = pd.DataFrame([[grid["cells"][0]["h3"], 10, 0]], columns=HISTORY_COLUMNS)
    old = join_history(grid, h)
    new = join_history(old, h.iloc[:0])
    assert all(c["burn_count"] == 0 and c["years_since_last_fire"] is None for c in new["cells"])


def test_mock_history_cannot_become_real(grid):
    grid["is_mock"] = False
    assert join_history(grid, pd.DataFrame(columns=HISTORY_COLUMNS), history_is_mock=True)["is_mock"]


@pytest.mark.parametrize("count,age", [(-1, 0), (float("nan"), 0), (float("inf"), 0), (0, -1), (0, float("inf"))])
def test_bad_numeric_values_fail(grid, count, age):
    h = pd.DataFrame([[grid["cells"][0]["h3"], count, age]], columns=HISTORY_COLUMNS)
    with pytest.raises(ValueError):
        join_history(grid, h)


def test_duplicate_history_fails(grid):
    h = pd.DataFrame([[grid["cells"][0]["h3"], 0, 1]] * 2, columns=HISTORY_COLUMNS)
    with pytest.raises(ValueError, match="unique"):
        join_history(grid, h)

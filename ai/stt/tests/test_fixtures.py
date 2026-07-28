"""v2 fixture 계약 테스트 — 관제실이 그대로 읽어 검증하는 것과 동일한 계약.

valid/*.json 은 SttEvent 유니온으로 파싱되어야 하고, invalid/*.json 은 거부되어야 한다.
"""

from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from stt.events import SttEvent

_FIX = Path(__file__).resolve().parent.parent / "fixtures" / "v2"
_adapter: TypeAdapter[SttEvent] = TypeAdapter(SttEvent)

_VALID = sorted((_FIX / "valid").glob("*.json"))
_INVALID = sorted((_FIX / "invalid").glob("*.json"))


def test_fixtures_present() -> None:
    assert len(_VALID) == 3
    assert len(_INVALID) >= 5


@pytest.mark.parametrize("path", _VALID, ids=lambda p: p.stem)
def test_valid_fixture_parses(path: Path) -> None:
    _adapter.validate_json(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("path", _INVALID, ids=lambda p: p.stem)
def test_invalid_fixture_rejected(path: Path) -> None:
    with pytest.raises(ValidationError):
        _adapter.validate_json(path.read_text(encoding="utf-8"))

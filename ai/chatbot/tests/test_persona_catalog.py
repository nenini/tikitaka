"""페르소나 카탈로그 — 선택·키 왕복 검증."""

from __future__ import annotations

import pytest

from chatbot.persona_catalog import PersonaNotFound, get_persona, select_persona


def test_select_by_gender_and_age() -> None:
    entry = select_persona(gender="FEMALE", age=26)
    assert entry.spec.gender == "female"


def test_select_by_age_range() -> None:
    entry = select_persona(gender="MALE", min_age=29, max_age=34)
    assert entry.spec.gender == "male"
    assert 29 <= entry.age <= 34


def test_key_roundtrip_reconstructs_same_persona() -> None:
    entry = select_persona(gender="FEMALE", age=26)
    assert get_persona(entry.key).key == entry.key


def test_unknown_key_raises() -> None:
    with pytest.raises(PersonaNotFound):
        get_persona("NOPE_00")

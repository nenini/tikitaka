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


# ── 반대 성별 매칭 (AI 화상 세션) ────────────────────────────────────
def test_opposite_gender_flips() -> None:
    from chatbot.persona_catalog import opposite_gender

    assert opposite_gender("MALE") == "female"
    assert opposite_gender("female") == "male"
    assert opposite_gender("남자") == "female"


def test_opposite_gender_unknown_is_none() -> None:
    """모르면 성별 무관 선택으로 떨어진다 — 임의로 한쪽을 고르지 않는다."""
    from chatbot.persona_catalog import opposite_gender

    assert opposite_gender(None) is None
    assert opposite_gender("기타") is None


def test_select_partner_returns_the_other_gender() -> None:
    """select_persona 는 '상대의 성별'을 받는다. 내 성별을 그대로 넘기면 동성이 나온다."""
    from chatbot.persona_catalog import select_partner

    assert select_partner("MALE").spec.gender == "female"
    assert select_partner("FEMALE").spec.gender == "male"


def test_select_partner_without_gender_still_returns_someone() -> None:
    from chatbot.persona_catalog import select_partner

    assert select_partner(None).key

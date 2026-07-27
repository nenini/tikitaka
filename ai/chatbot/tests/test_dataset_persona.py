import random

import pytest

from chatbot.persona import build_system_prompt_from_persona, sample_persona
from chatbot.schemas import KoreaPersona


def _fixture() -> list[KoreaPersona]:
    return [
        KoreaPersona(
            uuid="1", sex="여자", age=27, occupation="디자이너",
            persona="전시를 좋아하는 27세 서울 사람",
            hobbies_and_interests="전시 관람, 카페 투어",
        ),
        KoreaPersona(
            uuid="2", sex="남자", age=33, occupation="개발자",
            persona="운동을 즐기는 33세",
            hobbies_and_interests="헬스, 러닝",
        ),
        KoreaPersona(
            uuid="3", sex="여자", age=22, occupation="대학생",
            persona="영화광 22세",
            hobbies_and_interests="영화, 음악",
        ),
    ]


def test_sample_filters_sex_and_age():
    p = sample_persona(_fixture(), sex="여자", min_age=25, max_age=30, rng=random.Random(0))
    assert p.sex == "여자"
    assert 25 <= p.age <= 30


def test_sample_hobby_keyword():
    p = sample_persona(_fixture(), hobby_keyword="전시")
    assert "전시" in p.hobbies_and_interests


def test_sample_no_match_raises():
    with pytest.raises(ValueError):
        sample_persona(_fixture(), sex="남자", min_age=40, max_age=50)


def test_build_prompt_from_persona_contains_fields():
    prompt = build_system_prompt_from_persona(_fixture()[0], stage="before")
    assert "27세" in prompt
    assert "여자" in prompt
    assert "전시" in prompt
    assert "소개팅 전" in prompt


def test_korea_persona_camel_contract():
    c = _fixture()[0].to_contract()
    assert c["hobbiesAndInterests"] == "전시 관람, 카페 투어"
    assert c["age"] == 27

"""API용 페르소나 카탈로그 — 안정적인 personaKey로 조회·재구성 가능한 고정 목록.

BE는 personaKey만 저장하고 매 요청에 되돌려준다. 따라서 키로 항상 같은 페르소나를
재구성할 수 있어야 한다 → 데이터셋 랜덤 대신 코드 내 고정 카탈로그를 쓴다(자기완결·결정적).
(CLI 데모는 여전히 Nemotron 데이터셋 persona.py 사용.)
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from chatbot.schemas import PersonaSpec


class PersonaNotFound(Exception):
    """조건에 맞는 페르소나가 없거나, 주어진 키가 카탈로그에 없을 때."""


@dataclass(frozen=True)
class PersonaEntry:
    key: str
    display_name: str
    age: int
    spec: PersonaSpec


def _spec(gender: str, age: int, personality: str, speech_style: str, hobbies: list[str]) -> PersonaSpec:
    return PersonaSpec(
        gender=gender,
        age_group=f"{age // 10 * 10}대",
        personality=personality,
        speech_style=speech_style,
        hobbies=hobbies,
    )


_CATALOG: tuple[PersonaEntry, ...] = (
    PersonaEntry("FEMALE_25_BRIGHT_01", "밝고 활발한 상대", 25,
                 _spec("female", 25, "밝고 활발한", "발랄하고 친근한", ["여행", "맛집 탐방"])),
    PersonaEntry("FEMALE_26_CALM_01", "차분한 상대", 26,
                 _spec("female", 26, "차분한", "다정하고 편안한", ["전시", "카페"])),
    PersonaEntry("FEMALE_29_WARM_01", "다정한 상대", 29,
                 _spec("female", 29, "다정한", "따뜻하고 살가운", ["요리", "영화"])),
    PersonaEntry("FEMALE_32_HONEST_01", "솔직담백한 상대", 32,
                 _spec("female", 32, "담백하고 솔직한", "담백하고 솔직한", ["운동", "독서"])),
    PersonaEntry("MALE_27_HUMOR_01", "유쾌한 상대", 27,
                 _spec("male", 27, "유머러스한", "유쾌하고 편한", ["게임", "축구"])),
    PersonaEntry("MALE_28_CALM_01", "차분한 상대", 28,
                 _spec("male", 28, "차분한", "담담하고 다정한", ["음악", "산책"])),
    PersonaEntry("MALE_30_WARM_01", "따뜻한 상대", 30,
                 _spec("male", 30, "다정한", "따뜻하고 배려있는", ["영화", "카페"])),
    PersonaEntry("MALE_33_STEADY_01", "듬직한 상대", 33,
                 _spec("male", 33, "듬직하고 진중한", "진중하고 다정한", ["등산", "요리"])),
)

_BY_KEY: dict[str, PersonaEntry] = {entry.key: entry for entry in _CATALOG}


def _normalize_gender(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"female", "f", "여", "여자", "woman"}:
        return "female"
    if normalized in {"male", "m", "남", "남자", "man"}:
        return "male"
    return None


def get_persona(key: str) -> PersonaEntry:
    entry = _BY_KEY.get(key)
    if entry is None:
        raise PersonaNotFound(key)
    return entry


def select_persona(
    *,
    gender: str | None,
    age: int | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
    rng: random.Random | None = None,
) -> PersonaEntry:
    """성별·나이 조건으로 카탈로그에서 페르소나 1명 선택. 없으면 PersonaNotFound."""
    normalized = _normalize_gender(gender)
    candidates = [e for e in _CATALOG if e.spec.gender == normalized] if normalized else list(_CATALOG)
    if not candidates:
        raise PersonaNotFound(f"gender={gender}")

    if min_age is not None or max_age is not None:
        low = min_age if min_age is not None else 0
        high = max_age if max_age is not None else 200
        in_range = [e for e in candidates if low <= e.age <= high]
        candidates = in_range or candidates  # 범위에 없으면 성별만 맞춰 폴백
    elif age is not None:
        closest = min(abs(e.age - age) for e in candidates)
        candidates = [e for e in candidates if abs(e.age - age) == closest]

    chooser = rng if rng is not None else random.Random()
    return chooser.choice(candidates)

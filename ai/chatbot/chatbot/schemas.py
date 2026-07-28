"""챗봇 계약 스키마 — PersonaSpec · ChatMessage.

Python 내부는 snake_case, 외부(JSON) 계약은 camelCase로 직렬화한다.
ERD `chatbot_personas` / `chatbot_messages` 와 정합. (stt/events.py 패턴 재사용)
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _CamelModel(BaseModel):
    # snake_case로 생성하고 by_alias=True로 camelCase JSON을 얻는다.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PersonaSpec(_CamelModel):
    """사용자가 선택한 속성 조합. 이 값으로 systemPrompt를 조립한다(persona.py).

    모델은 하나만 공유하고, 이 속성 조합(→systemPrompt)만 바꿔 여러 페르소나를 연출한다.
    """

    age_group: str = "20대"                 # 예: "20대", "30대"
    gender: str = "female"                  # "female" | "male"
    hobbies: list[str] = Field(default_factory=list)   # 예: ["전시", "카페"]
    speech_style: str = "다정하고 편안한"      # 말투
    personality: str = "차분한"               # 성향
    difficulty: str = "편안함"                # 편안함 | 보통 | 실전
    reaction_level: str = "호의적"            # 호의적 | 중립 | 반응 적음

    def to_contract(self) -> dict:
        return self.model_dump(by_alias=True)


class ChatMessage(_CamelModel):
    """대화 메시지 하나. ERD `chatbot_messages` 대응."""

    sender_type: str                        # "user" | "bot"
    text: str
    is_proactive: bool = False              # 챗봇이 먼저 보낸 선톡인지
    created_at: str = Field(default_factory=_utcnow_iso)

    def to_contract(self) -> dict:
        """camelCase dict — BE/FE 계약 형식으로 직렬화."""
        return self.model_dump(by_alias=True)


class KoreaPersona(_CamelModel):
    """Nemotron-Personas-Korea(합성 한국인 페르소나)에서 온 1명.

    출처: nvidia/Nemotron-Personas-Korea (CC BY 4.0). 소개팅 연습용으로 필터(미혼·20~39세)해 사용.
    데이터셋 키가 snake_case라 populate_by_name으로 그대로 로드된다.
    """

    uuid: str
    sex: str                                # "남자" | "여자"
    age: int
    occupation: str = ""
    persona: str = ""                       # 인물 요약 서술
    hobbies_and_interests: str = ""
    cultural_background: str = ""
    career_goals_and_ambitions: str = ""

    def to_contract(self) -> dict:
        return self.model_dump(by_alias=True)

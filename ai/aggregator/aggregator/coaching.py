"""코칭 파이프라인 — 분석 이벤트를 게이트·쿨다운·TTL을 거쳐 코칭 명령으로 바꾼다.

친구 아키텍처 리뷰(#2·#3): '감지 사실(AnalysisEvent)'과 '코칭 명령(CoachingCommand)'을
분리한다. 실시간에는 LLM을 쓰지 않고 규칙 + 템플릿(messageKey)으로만 코칭한다(6GB GPU 제약).
MVP 코칭 트리거 = 침묵만. 질문·군말은 분석/리포트 전용(코칭 아님).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from aggregator.events import AnalysisEvent, SilenceDetected
from aggregator.state import SessionState

CoachingType = Literal["SILENCE_RECOVERY", "ATTENTION_RECOVERY", "SPEAKING_BALANCE"]
CoachingPriority = Literal["LOW", "MEDIUM", "HIGH"]

# messageKey → 문구. 실제로는 BE/FE가 매핑(다국어·버전 관리 용이). 여기 값은 참고/데모용.
COACHING_TEMPLATES: dict[str, str] = {
    "SILENCE_RECOVERY_01": "궁금한 점을 가볍게 질문해 보세요.",
    "ATTENTION_RECOVERY_01": "상대방의 이야기에 화면을 바라보며 반응해 보세요.",
    "SPEAKING_BALANCE_01": "상대방의 이야기도 자연스럽게 물어보세요.",
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_event_id() -> str:
    return str(uuid.uuid4())


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CoachingCommand(_CamelModel):
    """'사용자에게 코칭을 전달하라'는 명령. BE(#114)로 전달 요청된다."""

    event_type: Literal["COACHING_REQUESTED"] = "COACHING_REQUESTED"
    session_id: str
    target_participant_id: str | None            # None = 세션 전체(침묵)
    coaching_type: CoachingType
    message_key: str                             # 문구 자체가 아니라 키(BE/FE가 매핑)
    priority: CoachingPriority
    reason_code: str
    triggered_at_session_elapsed_ms: int
    expires_at_session_elapsed_ms: int           # TTL: 이 시각 지나면 전달하지 않음
    deduplication_key: str

    event_id: str = Field(default_factory=_new_event_id)
    version: Literal[1] = 1
    occurred_at: str = Field(default_factory=_utcnow_iso)
    source: str = "aggregator"

    def to_contract(self) -> dict[str, object]:
        return self.model_dump(by_alias=True)


class CoachingPolicy:
    """분석 이벤트 → (게이트·쿨다운·TTL) → 코칭 명령. 실시간 LLM 미사용.

    MVP: 침묵만 코칭(SILENCE_RECOVERY). 질문·군말은 분석/리포트 전용이라 코칭을 만들지 않는다.
    쿨다운: 같은 코칭 종류는 cooldown_ms 안에 재발동하지 않는다.
    세션당 코칭 횟수 상한(max_per_session)도 둔다.
    """

    def __init__(
        self, *, cooldown_ms: int = 60_000, ttl_ms: int = 15_000, max_per_session: int = 20
    ) -> None:
        self.cooldown_ms = cooldown_ms
        self.ttl_ms = ttl_ms
        self.max_per_session = max_per_session
        self._last_by_type: dict[str, int] = {}
        self._count = 0

    def evaluate(self, event: AnalysisEvent, state: SessionState) -> CoachingCommand | None:
        if isinstance(event, SilenceDetected):
            return self._make(
                state=state,
                now_ms=event.session_elapsed_ms,
                coaching_type="SILENCE_RECOVERY",
                message_key="SILENCE_RECOVERY_01",
                priority="LOW",
                reason_code="LONG_SILENCE",
                target_participant_id=None,
            )
        # 질문·군말은 코칭 트리거가 아니다(분석/리포트 전용).
        return None

    def _make(
        self,
        *,
        state: SessionState,
        now_ms: int,
        coaching_type: CoachingType,
        message_key: str,
        priority: CoachingPriority,
        reason_code: str,
        target_participant_id: str | None,
    ) -> CoachingCommand | None:
        if self._count >= self.max_per_session:
            return None
        last = self._last_by_type.get(coaching_type)
        if last is not None and now_ms - last < self.cooldown_ms:
            return None  # 쿨다운
        self._last_by_type[coaching_type] = now_ms
        self._count += 1
        target = target_participant_id if target_participant_id is not None else "session"
        return CoachingCommand(
            session_id=state.session_id,
            target_participant_id=target_participant_id,
            coaching_type=coaching_type,
            message_key=message_key,
            priority=priority,
            reason_code=reason_code,
            triggered_at_session_elapsed_ms=now_ms,
            expires_at_session_elapsed_ms=now_ms + self.ttl_ms,
            deduplication_key=f"{state.session_id}:{target}:{coaching_type}:{self._count}",
        )


def noop_coaching(command: CoachingCommand) -> None:
    """코칭 명령을 버리는 기본 싱크(테스트·분석 전용 실행용)."""
    return None

"""터미널 출력 emitter — 분석 이벤트와 코칭 명령을 사람이 보게 찍는다(로컬 데모용).

나중에 이 자리를 BE 발행(#112 분석 이벤트 / #114 코칭 전달) 어댑터로 교체하면 된다.
"""

from __future__ import annotations

from aggregator.coaching import COACHING_TEMPLATES, CoachingCommand
from aggregator.events import AnalysisEvent


def console_emit(event: AnalysisEvent) -> None:
    who = event.speaker_id or "session"
    payload = event.payload.model_dump(by_alias=True)
    print(f"   ↳ [통제실] {event.event_type} ({who}) {payload}")


def console_coaching_emit(command: CoachingCommand) -> None:
    who = command.target_participant_id or "session"
    text = COACHING_TEMPLATES.get(command.message_key, command.message_key)
    print(f'   ★ [코칭요청] {command.coaching_type} ({who}) "{text}" [{command.reason_code}]')

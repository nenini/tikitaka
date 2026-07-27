"""오프라인 데모 스크립트가 기대한 분석 이벤트·코칭 명령을 내는지 검증."""

from __future__ import annotations

from aggregator.coaching import CoachingCommand
from aggregator.events import AnalysisEvent
from aggregator.offline_demo import _SCRIPT, run


def test_offline_script_emits_expected_events() -> None:
    analysis: list[AnalysisEvent] = []
    coaching: list[CoachingCommand] = []
    run(_SCRIPT, on_analysis=analysis.append, on_coaching=coaching.append)

    types = [event.event_type for event in analysis]
    # 분석: 질문 2회, 군말 1회, 침묵 2회(중간·끝)
    assert types.count("QUESTION_ASKED") == 2
    assert types.count("FILLER_DETECTED") == 1
    assert types.count("SILENCE_DETECTED") == 2

    # 코칭: 침묵 2회지만 60초 쿨다운으로 1회만 발동(질문·군말은 코칭 아님)
    assert [c.coaching_type for c in coaching] == ["SILENCE_RECOVERY"]

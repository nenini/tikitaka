"""오프라인 데모 — 마이크·GPU·STT 없이 통제실 동작을 본다.

스크립트된 가상 대화(전사 결과)를 SessionAggregator에 흘려보내고, 감지 결과를
실시간처럼 출력한다. STT 엔진을 로드하지 않으므로 어디서나 즉시 실행된다.

실행:
    # aggregator 디렉토리에서 (stt.events만 필요 → pydantic이면 충분)
    PYTHONPATH=../stt uv run python -m aggregator.offline_demo
    PYTHONPATH=../stt uv run python -m aggregator.offline_demo --delay 0.4   # 사람이 보기 좋게 지연
"""

from __future__ import annotations

import argparse
import time

from stt.events import TranscriptEvent, TranscriptPayload

from aggregator.aggregator import AnalysisEmitter, CoachingEmitter, SessionAggregator
from aggregator.console_sink import console_coaching_emit, console_emit

_ScriptLine = tuple[str, int, int, str]

# (speaker_id, start_ms, end_ms, text) — 소개팅 초반 가상 대화
_SCRIPT: tuple[_ScriptLine, ...] = (
    ("user-A", 200, 1800, "안녕하세요 반갑습니다"),
    ("user-B", 2100, 3600, "네 반가워요"),
    ("user-A", 4000, 6200, "주말엔 보통 어떻게 지내세요?"),          # 질문
    ("user-B", 6500, 9000, "어 저는 그 약간 집에 있는 편이에요"),      # 군말(어/그/약간)
    # 여기서 약 12초 침묵 → 질문 추천
    ("user-A", 21000, 23000, "아 그러시구나 저도 그래요"),
    ("user-B", 23500, 25500, "취미는 어떤 거 좋아하세요?"),           # 질문
)


def _to_event(line: _ScriptLine) -> TranscriptEvent:
    speaker_id, start_ms, end_ms, text = line
    return TranscriptEvent(
        session_id="offline-demo",
        speaker_id=speaker_id,
        seq=0,
        session_elapsed_ms=start_ms,
        payload=TranscriptPayload(text=text, segment_start_ms=start_ms, segment_end_ms=end_ms),
    )


def run(
    script: tuple[_ScriptLine, ...],
    *,
    delay_s: float = 0.0,
    on_analysis: AnalysisEmitter = console_emit,
    on_coaching: CoachingEmitter = console_coaching_emit,
) -> None:
    aggregator = SessionAggregator(
        session_id="offline-demo", on_analysis=on_analysis, on_coaching=on_coaching
    )
    clock_ms = 0
    for line in script:
        _speaker, start_ms, end_ms, text = line
        # 발화 시작까지 1초 간격으로 시간을 흘려 침묵 감지를 구동
        for now_ms in range(clock_ms, start_ms, 1000):
            aggregator.tick(now_ms)
        event = _to_event(line)
        print(f"[전사 {start_ms / 1000:6.1f}s] ({event.speaker_id}) {text}")
        aggregator.push_transcript(event)
        clock_ms = end_ms
        if delay_s > 0:
            time.sleep(delay_s)
    # 마지막 발화 이후의 침묵도 흘려본다
    for now_ms in range(clock_ms, clock_ms + 13000, 1000):
        aggregator.tick(now_ms)


def main() -> None:
    parser = argparse.ArgumentParser(description="통제실 오프라인 데모 (마이크 불필요)")
    parser.add_argument("--delay", type=float, default=0.0, help="발화 간 지연(초, 보기용)")
    args = parser.parse_args()
    delay_s: float = args.delay
    print("[offline] 가상 대화를 통제실에 흘려보냅니다 — 감지 결과를 관찰하세요.\n")
    run(_SCRIPT, delay_s=delay_s)
    print("\n[offline] 끝.")


if __name__ == "__main__":
    main()

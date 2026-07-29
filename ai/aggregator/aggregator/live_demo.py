"""실제 마이크 → STT v2 → 관제실 로컬 데모.

한 개의 마이크를 한 명의 사용자 음성으로 취급한다. STT 자체 VAD가 만드는
SPEECH_STARTED/SPEECH_ENDED와 비동기 Whisper 전사 결과를 모두
SessionAggregator에 전달한다. LiveKit이나 Backend는 필요하지 않다.

실행 예시(ai/aggregator 디렉터리):
    PYTHONPATH=../stt uv run --project ../stt python -m aggregator.live_demo
    PYTHONPATH=../stt uv run --project ../stt python -m aggregator.live_demo \
        --device cpu --model medium --lang ko

Ctrl+C로 정상 종료한다.
"""

from __future__ import annotations

import argparse
import queue
import time
from collections.abc import Iterable

import numpy as np
import numpy.typing as npt
import sounddevice as sd
from stt.events import SttEvent, TranscriptFinalizedEvent
from stt.pipeline import SAMPLE_RATE, SttEngine
from stt.session import SessionSttRunner, make_vad_options

from aggregator.aggregator import SessionAggregator
from aggregator.console_sink import console_coaching_emit, console_emit

AudioChunk = npt.NDArray[np.float32]


def _print_stt_event(event: SttEvent) -> None:
    if isinstance(event, TranscriptFinalizedEvent):
        payload = event.payload
        print(
            f"[전사 {payload.segment_start_ms / 1000:6.1f}s] "
            f"({event.user_id}, 신뢰도={event.confidence:.2f}) {payload.text}"
        )
        return
    print(
        f"[음성 {event.session_elapsed_ms / 1000:6.1f}s] "
        f"({event.user_id}) <{event.event_type}>"
    )


def _forward_events(
    events: Iterable[SttEvent],
    aggregator: SessionAggregator,
) -> None:
    for event in events:
        _print_stt_event(event)
        aggregator.push_stt_event(event)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="실제 마이크 → STT v2 → 관제실 로컬 데모"
    )
    parser.add_argument("--speaker", default="user-A", help="로컬 사용자 ID")
    parser.add_argument(
        "--participant",
        default=None,
        help="LiveKit participantIdentity 대용 값(기본값: dev-사용자ID)",
    )
    parser.add_argument("--session", default="live-demo", help="세션 ID")
    parser.add_argument("--model", default="large-v3", help="Whisper 모델 크기")
    parser.add_argument("--device", default="cuda", help="cuda 또는 cpu")
    parser.add_argument("--lang", default="ko", help="ko 또는 en")
    parser.add_argument(
        "--end-silence",
        type=int,
        default=700,
        help="발화가 끝났다고 판단할 침묵 길이(ms)",
    )
    parser.add_argument(
        "--vad-threshold",
        type=float,
        default=0.5,
        help="VAD 민감도(0~1)",
    )
    parser.add_argument(
        "--min-conf",
        type=float,
        default=0.5,
        help="전사 결과 최소 신뢰도(0~1)",
    )
    parser.add_argument(
        "--max-utterance",
        type=float,
        default=20.0,
        help="한 발화의 최대 길이(초)",
    )
    args = parser.parse_args()

    user_id: str = args.speaker
    participant_identity = args.participant or f"dev-{user_id}"
    session_id: str = args.session

    print(
        f"[데모] STT 로딩 중... "
        f"(model={args.model}, device={args.device}, lang={args.lang})"
    )
    engine = SttEngine(
        model_size=args.model,
        device=args.device,
        language=args.lang,
    )
    runner = SessionSttRunner(
        engine,
        session_id=session_id,
        vad_opts=make_vad_options(
            args.vad_threshold,
            args.end_silence,
            args.max_utterance,
        ),
        end_silence_ms=args.end_silence,
        min_confidence=args.min_conf,
    )
    aggregator = SessionAggregator(
        session_id=session_id,
        on_analysis=console_emit,
        on_coaching=console_coaching_emit,
        participant_user_ids=[user_id],
    )

    audio_q: queue.Queue[AudioChunk] = queue.Queue()

    def audio_callback(
        indata: AudioChunk,
        frames: int,
        time_info: object,
        status: object,
    ) -> None:
        if status:
            print(f"[데모] 마이크 입력 상태: {status}")
        audio_q.put(indata[:, 0].copy())

    started_at = time.monotonic()

    def now_ms() -> int:
        return int((time.monotonic() - started_at) * 1000)

    print(
        "[데모] 준비 완료. 말해보세요. "
        "VAD 시작·종료와 최종 전사가 관제실로 전달됩니다. Ctrl+C로 종료.\n"
    )
    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            callback=audio_callback,
        ):
            while True:
                try:
                    chunk = audio_q.get(timeout=0.2)
                    while not audio_q.empty():
                        chunk = np.concatenate([chunk, audio_q.get_nowait()])
                    _forward_events(
                        runner.feed(
                            user_id=user_id,
                            participant_identity=participant_identity,
                            audio=chunk,
                        ),
                        aggregator,
                    )
                except queue.Empty:
                    pass

                # Whisper는 별도 worker에서 동작하므로 매 반복마다 완성된
                # TRANSCRIPT_FINALIZED를 꺼내 관제실에 전달한다.
                _forward_events(runner.poll_transcripts(), aggregator)
                aggregator.tick(now_ms())
    except KeyboardInterrupt:
        print("\n[데모] 종료 중입니다. 진행 중인 마지막 발화를 정리합니다.")
    finally:
        _forward_events(runner.close(timeout=3.0), aggregator)
        _forward_events(runner.poll_transcripts(), aggregator)
        print(f"[데모] 종료 완료. STT 대기열 드롭 수: {runner.dropped_count}")


if __name__ == "__main__":
    main()

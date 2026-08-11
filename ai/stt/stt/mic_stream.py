"""마이크 실시간 STT — 단일 화자, VAD 발화 단위 (STT-03).

말하는 동안 버퍼링하고 문장 끝(무음)에 발화를 통째로 전사한다.
엔드포인팅 로직은 stt.session.SpeakerStream을 재사용한다(STT-04와 공유).

실행:
    uv run python -m stt.mic_stream
    uv run python -m stt.mic_stream --speaker user-B --model medium
    uv run python -m stt.mic_stream --end-silence 900 --min-conf 0.4
    uv run python -m stt.mic_stream --device cpu

Ctrl+C로 종료.
"""

from __future__ import annotations

import argparse
import queue

import numpy as np
import sounddevice as sd

from stt.pipeline import SAMPLE_RATE, SttEngine
from stt.events import TranscriptFinalizedEvent
from stt.session import SpeakerStream, make_vad_options


def main() -> None:
    ap = argparse.ArgumentParser(description="마이크 실시간 STT (VAD 발화 단위)")
    ap.add_argument("--speaker", default="user-A", help="화자 ID (예: user-A / user-B)")
    ap.add_argument("--session", default="local-test", help="세션 ID")
    ap.add_argument("--model", default="large-v3", help="whisper 모델 크기")
    ap.add_argument("--device", default="cuda", help="cuda 또는 cpu")
    ap.add_argument("--end-silence", type=int, default=700, help="발화 종료로 볼 무음(ms)")
    ap.add_argument("--vad-threshold", type=float, default=0.5, help="VAD 민감도(0~1)")
    ap.add_argument("--min-conf", type=float, default=0.5, help="최소 신뢰도(환각 필터, 0~1)")
    ap.add_argument("--max-utterance", type=float, default=20.0, help="최대 발화 길이(초)")
    args = ap.parse_args()

    print(f"[stt] 모델 로딩... (model={args.model}, device={args.device})")
    engine = SttEngine(model_size=args.model, device=args.device)
    print(f"[stt] 준비 완료 (device={engine.device}). 말해보세요 — Ctrl+C 종료.\n")

    stream = SpeakerStream(
        engine,
        session_id=args.session,
        user_id=args.speaker,
        participant_identity=f"dev-{args.speaker}",
        vad_opts=make_vad_options(args.vad_threshold, args.end_silence, args.max_utterance),
        end_silence_ms=args.end_silence,
        min_confidence=args.min_conf,
    )

    audio_q: "queue.Queue[np.ndarray]" = queue.Queue()

    def callback(
        indata: np.ndarray, frames: int, time_info: object, status: object
    ) -> None:
        if status:
            print(f"[stt] 입력 상태: {status}")
        audio_q.put(indata[:, 0].copy())

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback):
        try:
            while True:
                chunk = audio_q.get()
                while not audio_q.empty():
                    chunk = np.concatenate([chunk, audio_q.get_nowait()])
                for e in stream.feed(chunk):
                    if isinstance(e, TranscriptFinalizedEvent):
                        p = e.payload
                        print(
                            f"[{p.segment_start_ms / 1000:6.1f}s] "
                            f"({e.user_id} conf={e.confidence}) {p.text}"
                        )
                    else:
                        print(
                            f"[{e.session_elapsed_ms / 1000:6.1f}s] "
                            f"({e.user_id}) <{e.event_type}>"
                        )
        except KeyboardInterrupt:
            print("\n[stt] 종료.")


if __name__ == "__main__":
    main()

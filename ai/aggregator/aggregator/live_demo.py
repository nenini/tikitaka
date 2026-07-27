"""라이브 데모 — 마이크 → STT → 통제실 → 감지 결과 실시간 출력.

실제로 말하면 전사가 통제실로 들어가고, 질문·군말·침묵 감지가 터미널에 찍힌다.
`mic_stream.py`를 참고하되 전사를 SessionAggregator로 밀어넣는다.

실행(마이크·GPU + stt 런타임 의존 필요):
    # stt 런타임 의존(faster-whisper 등)이 있는 환경에서, stt를 PYTHONPATH에 두고 실행
    uv run python -m aggregator.live_demo
    uv run python -m aggregator.live_demo --lang ko --device cpu

Ctrl+C로 종료.
"""

from __future__ import annotations

import argparse
import queue
import time

import numpy as np
import numpy.typing as npt
import sounddevice as sd

from stt.pipeline import SAMPLE_RATE, SttEngine
from stt.session import SpeakerStream, make_vad_options

from aggregator.aggregator import SessionAggregator
from aggregator.console_sink import console_coaching_emit, console_emit

AudioChunk = npt.NDArray[np.float32]


def main() -> None:
    parser = argparse.ArgumentParser(description="마이크 → STT → 통제실 라이브 데모")
    parser.add_argument("--speaker", default="user-A", help="화자 ID")
    parser.add_argument("--session", default="demo", help="세션 ID")
    parser.add_argument("--device", default="cuda", help="cuda 또는 cpu")
    parser.add_argument("--lang", default="auto", help="auto(한국어 편향)/ko/en")
    args = parser.parse_args()

    speaker_id: str = args.speaker
    session_id: str = args.session
    device: str = args.device
    lang: str = args.lang

    language = None if lang == "auto" else lang
    print(f"[demo] STT 로딩... (device={device}, lang={lang})")
    engine = SttEngine(device=device, language=language)
    stream = SpeakerStream(
        engine,
        session_id=session_id,
        speaker_id=speaker_id,
        vad_opts=make_vad_options(),
    )
    aggregator = SessionAggregator(
        session_id=session_id, on_analysis=console_emit, on_coaching=console_coaching_emit
    )
    print("[demo] 준비 완료. 말해보세요 — Ctrl+C 종료.\n")

    audio_q: queue.Queue[AudioChunk] = queue.Queue()

    def audio_callback(
        indata: AudioChunk, frames: int, time_info: object, status: object
    ) -> None:
        if status:
            print(f"[demo] 입력 상태: {status}")
        audio_q.put(indata[:, 0].copy())

    started_at = time.monotonic()

    def now_ms() -> int:
        return int((time.monotonic() - started_at) * 1000)

    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=audio_callback
    ):
        try:
            while True:
                try:
                    chunk: AudioChunk = audio_q.get(timeout=0.5)  # 무음이어도 0.5s마다 tick
                    while not audio_q.empty():
                        chunk = np.concatenate([chunk, audio_q.get_nowait()])
                    for event in stream.feed(chunk):
                        payload = event.payload
                        print(
                            f"[전사 {payload.segment_start_ms / 1000:6.1f}s] "
                            f"({event.speaker_id}) {payload.text}"
                        )
                        aggregator.push_transcript(event)  # ← 통제실로 전달
                except queue.Empty:
                    pass
                aggregator.tick(now_ms())  # 침묵 등 시간 기반 감지
        except KeyboardInterrupt:
            print("\n[demo] 종료.")


if __name__ == "__main__":
    main()

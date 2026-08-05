"""TTS 데모 — 텍스트를 한국어 음성으로 합성해 WAV로 저장/재생 (S15P11A307-475).

실행:
    uv run python -m tts.demo --text "안녕하세요, 오늘 만나서 반가워요"
    uv run python -m tts.demo --voice ko-KR-InJoonNeural --play
    uv run python -m tts.demo --engine mock          # 네트워크 없이 경로만 확인
"""

from __future__ import annotations

import argparse
import time
import wave

from tts.edge import DEFAULT_VOICE, EdgeTtsEngine
from tts.engine import SAMPLE_RATE, SAMPLE_WIDTH, TtsEngine, pcm_duration_ms
from tts.mock import MockTts

_DEFAULT_TEXT = "안녕하세요, 저도 반가워요. 주말엔 보통 카페 가거나 전시 보러 다녀요."


def _play(pcm: bytes) -> None:
    """sounddevice로 재생(선택). 미설치면 안내만 하고 넘어간다."""
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError:
        print("[tts] 재생하려면 sounddevice가 필요합니다: uv add --dev sounddevice")
        return
    sd.play(np.frombuffer(pcm, dtype=np.int16), SAMPLE_RATE)
    sd.wait()


def main() -> None:
    ap = argparse.ArgumentParser(description="텍스트 → 한국어 음성 합성 데모")
    ap.add_argument("--text", default=_DEFAULT_TEXT, help="합성할 문장")
    ap.add_argument("--voice", default=DEFAULT_VOICE, help="edge-tts 보이스 이름")
    ap.add_argument("--engine", default="edge", choices=("edge", "mock"), help="사용할 엔진")
    ap.add_argument("--rate", default="+0%", help="말하기 속도 (예: +10%%)")
    ap.add_argument("--out", default="tts_demo.wav", help="저장할 WAV 경로")
    ap.add_argument("--play", action="store_true", help="합성 후 바로 재생")
    args = ap.parse_args()

    engine: TtsEngine = (
        MockTts() if args.engine == "mock" else EdgeTtsEngine(args.voice, rate=args.rate)
    )

    print(f"[tts] 합성 중... (engine={args.engine}, voice={args.voice})")
    started = time.perf_counter()
    chunks: list[bytes] = []
    first_chunk_s: float | None = None
    for chunk in engine.synthesize(args.text):
        if first_chunk_s is None:
            first_chunk_s = time.perf_counter() - started
        chunks.append(chunk)

    pcm = b"".join(chunks)
    if not pcm:
        print("[tts] 합성 결과가 비어 있습니다.")
        return

    elapsed = time.perf_counter() - started
    print(
        f"[tts] 청크 {len(chunks)}개 · {len(pcm)}바이트 · "
        f"{pcm_duration_ms(len(pcm)) / 1000:.2f}초 분량"
    )
    print(f"[tts] 첫 청크 {first_chunk_s:.3f}s · 전체 {elapsed:.3f}s")

    with wave.open(args.out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(SAMPLE_WIDTH)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)
    print(f"[tts] 저장: {args.out}")

    if args.play:
        _play(pcm)


if __name__ == "__main__":
    main()

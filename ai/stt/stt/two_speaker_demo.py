"""화자별 2스트림 STT 데모 (STT-04).

두 오디오 파일을 각각 화자 A / B 스트림으로 전사하고, 공통 시간축으로
정렬한 interleaved TranscriptEvent를 출력한다. 실제 서비스의 2-브라우저
오디오 경로는 STT-05에서 연동한다.

실행:
    uv run python -m stt.two_speaker_demo --audio-a a.wav --audio-b b.wav
    uv run python -m stt.two_speaker_demo --audio-a a.wav --audio-b b.wav --model medium
"""

from __future__ import annotations

import argparse
import wave

import numpy as np

from stt.pipeline import SAMPLE_RATE, SttEngine
from stt.session import SessionSttRunner, StreamEvent, make_vad_options


def load_wav_16k_mono(path: str) -> np.ndarray:
    """wav 파일을 16kHz mono float32로 로드(필요 시 다운믹스·선형 리샘플)."""
    with wave.open(path, "rb") as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"{path}: 16-bit PCM wav만 지원합니다 (sampwidth={sw}).")
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    if sr != SAMPLE_RATE:
        tgt = int(len(data) * SAMPLE_RATE / sr)
        data = np.interp(
            np.linspace(0, len(data), tgt, endpoint=False),
            np.arange(len(data)),
            data,
        ).astype(np.float32)
    return data


def _run_stream(
    runner: SessionSttRunner, user_id: str, audio: np.ndarray, chunk_s: float = 0.5
) -> list[StreamEvent]:
    events: list[StreamEvent] = []
    step = int(SAMPLE_RATE * chunk_s)
    for i in range(0, len(audio), step):
        events.extend(
            runner.feed(
                user_id=user_id,
                participant_identity=f"dev-{user_id}",
                audio=audio[i : i + step],
            )
        )
    return events


def main() -> None:
    ap = argparse.ArgumentParser(description="화자별 2스트림 STT 데모")
    ap.add_argument("--audio-a", required=True, help="화자 A 오디오(wav)")
    ap.add_argument("--audio-b", required=True, help="화자 B 오디오(wav)")
    ap.add_argument("--session", default="demo-session")
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--end-silence", type=int, default=700)
    ap.add_argument("--min-conf", type=float, default=0.5)
    args = ap.parse_args()

    print(f"[stt] 모델 로딩... (model={args.model}, device={args.device})")
    engine = SttEngine(model_size=args.model, device=args.device)
    runner = SessionSttRunner(
        engine,
        session_id=args.session,
        vad_opts=make_vad_options(end_silence_ms=args.end_silence),
        end_silence_ms=args.end_silence,
        min_confidence=args.min_conf,
    )

    audio_a = load_wav_16k_mono(args.audio_a)
    audio_b = load_wav_16k_mono(args.audio_b)
    print(f"[stt] A={len(audio_a) / SAMPLE_RATE:.1f}s, B={len(audio_b) / SAMPLE_RATE:.1f}s. 전사 중...\n")

    speech = _run_stream(runner, "user-A", audio_a) + _run_stream(runner, "user-B", audio_b)
    runner.close()  # 진행 중 발화 flush + 대기 전사 완료까지
    transcripts = runner.poll_transcripts()
    transcripts.sort(key=lambda e: e.payload.segment_start_ms)  # 공통 시간축 정렬

    for t in transcripts:
        p = t.payload
        print(f"[{p.segment_start_ms / 1000:6.1f}s] ({t.user_id} conf={t.confidence}) {p.text}")
    print(f"\n[stt] 전사 {len(transcripts)}개 / SPEECH {len(speech)}개 (A/B interleaved).")


if __name__ == "__main__":
    main()

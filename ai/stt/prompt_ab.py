"""initial_prompt A/B — 문장부호 이득 vs 무음 환각을 한 번에 비교한다.

`CANDIDATE_PROMPT`(문장부호 복원용)를 넣을지 뺄지 판단하는 도구다. 두 축을 같이
봐야 한다 — 발화 클립만 보면 프롬프트가 좋아 보이는데, 무음을 넣으면 뒤집힌다.

  ① 발화 클립  fixtures/audio/*.wav  → 물음표·마침표가 얼마나 복원되나
  ② 무음·잡음  합성                  → 환각이 **필터를 통과해서** 나오나

②가 핵심이다. Whisper 는 무음에서 원래 환각을 내지만("시청해주셔서 감사합니다"),
프롬프트가 없으면 no_speech_prob·min_confidence 필터에 걸린다. 프롬프트를 넣으면
환각이 고신뢰 문장으로 바뀌어 필터를 그대로 통과한다.

실행 (ai/stt 폴더에서):
    uv run --with soundfile python prompt_ab.py
    uv run --with soundfile python prompt_ab.py --model medium
    uv run --with soundfile python prompt_ab.py --min-conf 0.7   # 필터 조여서 재확인
"""

from __future__ import annotations

import argparse
import pathlib

import numpy as np
import soundfile as sf

from stt.pipeline import NO_SPEECH_THRESHOLD, SttEngine

# 되돌린 프롬프트. 프로덕션(stt.pipeline)에는 더 이상 없다 — 다시 재보려고 여기 남긴다.
CANDIDATE_PROMPT = "네, 그렇습니다. 정말요? 알겠습니다. 어떻게 될까요? 그럼 이만 줄이겠습니다."


SAMPLE_RATE = 16_000


def _silence_clips() -> list[tuple[str, np.ndarray]]:
    """무음·저레벨 잡음. 실제 세션에서 사람이 말 안 하는 구간을 흉내낸다."""
    rng = np.random.default_rng(7)  # 고정 시드 — 돌릴 때마다 같은 입력
    return [
        ("무음 3초", np.zeros(SAMPLE_RATE * 3, dtype=np.float32)),
        ("무음 10초", np.zeros(SAMPLE_RATE * 10, dtype=np.float32)),
        ("미세잡음 3초", (rng.standard_normal(SAMPLE_RATE * 3) * 0.0015).astype(np.float32)),
        ("에어컨 5초", (rng.standard_normal(SAMPLE_RATE * 5) * 0.006).astype(np.float32)),
        ("숨소리급 2초", (rng.standard_normal(SAMPLE_RATE * 2) * 0.004).astype(np.float32)),
    ]


def _speech_clips() -> list[tuple[str, np.ndarray]]:
    clips: list[tuple[str, np.ndarray]] = []
    for path in sorted(pathlib.Path("fixtures/audio").glob("*.wav")):
        audio, rate = sf.read(path, dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if rate != SAMPLE_RATE:
            raise SystemExit(f"{path}: 16kHz 가 아니다 (rate={rate})")
        clips.append((path.name, audio))
    if not clips:
        raise SystemExit("fixtures/audio 에 wav 가 없다 — record_clip.py 로 먼저 녹음")
    return clips


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute", default="float16")
    parser.add_argument("--min-conf", type=float, default=0.5)
    parser.add_argument(
        "--no-speech", type=float, default=NO_SPEECH_THRESHOLD,
        help="이 값을 넘는 no_speech_prob 은 버린다. 낮출수록 환각에 엄격.",
    )
    args = parser.parse_args()

    engine = SttEngine(
        model_size=args.model, device=args.device, compute_type=args.compute
    )
    print(f"모델={args.model} device={engine.device} "
          f"min_conf={args.min_conf} no_speech={args.no_speech}\n")

    speech = _speech_clips()
    silence = _silence_clips()

    for label, prompt in (("프롬프트 없음", None), ("CANDIDATE_PROMPT", CANDIDATE_PROMPT)):
        print("=" * 66)
        print(f"[{label}]")
        if prompt:
            print(f"  {prompt}")

        print("\n  ① 발화 클립 — 문장부호가 복원되나")
        marks = dots = 0
        for name, audio in speech:
            pieces = engine.transcribe_chunk(
                audio, min_confidence=args.min_conf,
                no_speech_threshold=args.no_speech, initial_prompt=prompt,
            )
            text = " ".join(p.text for p in pieces)
            marks += text.count("?")
            dots += text.count(".")
            print(f"     {name:18} {text}")
        print(f"     → 물음표 {marks} · 마침표 {dots}")

        print("\n  ② 무음·잡음 — 환각이 필터를 통과하나  ← 여기가 핵심")
        leaked = 0
        for name, audio in silence:
            pieces = engine.transcribe_chunk(
                audio, min_confidence=args.min_conf,
                no_speech_threshold=args.no_speech, initial_prompt=prompt,
            )
            if pieces:
                leaked += 1
                shown = " / ".join(f"{p.text!r}(conf {p.confidence})" for p in pieces)
                print(f"     {name:14} 통과 → {shown}")
            else:
                print(f"     {name:14} 차단")
        print(f"     → 환각 통과 {leaked}/{len(silence)}\n")

    print("=" * 66)
    print("판단 기준: ②가 0 이 아니면 그 설정은 전사를 오염시킨다.")
    print("           환각 전사는 리포트·주제분류·침묵판정에 그대로 들어간다.")


main()

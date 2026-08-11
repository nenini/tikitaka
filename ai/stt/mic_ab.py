"""마이크 실시간 A/B — 같은 목소리를 프롬프트 있음/없음 두 경로에 동시에 넣는다.

`CANDIDATE_PROMPT`(문장부호 복원용)를 유지할지 뺄지 직접 듣고 판단하려는 도구다.
같은 오디오를 두 스트림에 흘리므로 조건이 완전히 같다 — 따로 두 번 말할 필요가 없다.

봐야 할 것 두 가지:
  ① 말할 때  — 프롬프트 쪽에 물음표·마침표가 더 붙나
  ② 가만히 있을 때 — 프롬프트 쪽만 "감사합니다" 같은 환각이 뜨나  ← 이게 핵심

②가 문제다. Whisper 는 무음에서 원래 환각을 내지만, 프롬프트가 없으면 신뢰도가 낮아
필터에 걸린다. 프롬프트를 넣으면 고신뢰 문장이 돼서 그대로 통과한다.

⚠️ 발화마다 Whisper 를 두 번 돌린다. 실사용보다 느린 건 정상이다.

실행 (ai/stt 폴더에서):
    uv run python mic_ab.py
    uv run python mic_ab.py --min-conf 0.9      # 필터를 조이면 막히는지
    uv run python mic_ab.py --device cpu        # GPU 없을 때

Ctrl+C 로 종료하면 요약이 나온다.
"""

from __future__ import annotations

import argparse
import queue
import time

import numpy as np
import sounddevice as sd

from stt.events import TranscriptFinalizedEvent
from stt.pipeline import SAMPLE_RATE, SttEngine, TranscriptPiece
from stt.session import SpeakerStream, make_vad_options

# 되돌린 프롬프트. 프로덕션(stt.pipeline)에는 더 이상 없다 — 다시 재보려고 여기 남긴다.
CANDIDATE_PROMPT = "네, 그렇습니다. 정말요? 알겠습니다. 어떻게 될까요? 그럼 이만 줄이겠습니다."


class _PromptOverride:
    """엔진을 감싸 initial_prompt 만 바꿔 넘긴다.

    SpeakerStream 은 `transcribe_chunk` 만 부르므로(Transcriber 프로토콜) 이 래퍼로
    충분하다. 프로덕션 코드는 건드리지 않는다.
    """

    def __init__(self, engine: SttEngine, prompt: str | None) -> None:
        self._engine = engine
        self._prompt = prompt

    def transcribe_chunk(
        self,
        audio: np.ndarray,
        *,
        base_ms: int = 0,
        vad_filter: bool = False,
        min_confidence: float = 0.5,
    ) -> list[TranscriptPiece]:
        return self._engine.transcribe_chunk(
            audio,
            base_ms=base_ms,
            vad_filter=vad_filter,
            min_confidence=min_confidence,
            initial_prompt=self._prompt,
        )


def _make_stream(engine: object, label: str, args: argparse.Namespace) -> SpeakerStream:
    return SpeakerStream(
        engine,  # type: ignore[arg-type]
        session_id="mic-ab",
        user_id=label,
        participant_identity=f"dev-{label}",
        vad_opts=make_vad_options(
            args.vad_threshold, args.end_silence, args.max_utterance
        ),
        end_silence_ms=args.end_silence,
        min_confidence=args.min_conf,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="마이크 실시간 프롬프트 A/B")
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--end-silence", type=int, default=700)
    ap.add_argument("--vad-threshold", type=float, default=0.5)
    ap.add_argument("--min-conf", type=float, default=0.5)
    ap.add_argument("--max-utterance", type=float, default=20.0)
    args = ap.parse_args()

    print(f"[stt] 모델 로딩... (model={args.model}, device={args.device})")
    engine = SttEngine(model_size=args.model, device=args.device)
    print(f"[stt] 준비 완료 (device={engine.device})\n")
    print("  프롬프트:", CANDIDATE_PROMPT)
    print()
    print("  ① 아무 말이나 해보세요 — 두 줄이 어떻게 다른지")
    print("  ② 그다음 10초쯤 가만히 있어 보세요 — 무음에서 뭐가 뜨는지  ← 핵심")
    print("  Ctrl+C 로 종료\n")
    print("-" * 70)

    with_prompt = _make_stream(_PromptOverride(engine, CANDIDATE_PROMPT), "with", args)
    without = _make_stream(_PromptOverride(engine, None), "without", args)

    audio_q: "queue.Queue[np.ndarray]" = queue.Queue()

    def callback(indata, frames, time_info, status) -> None:  # noqa: ANN001
        if status:
            print(f"[stt] 입력 상태: {status}")
        audio_q.put(indata[:, 0].copy())

    started = time.monotonic()
    counts = {"with": 0, "without": 0}

    def texts(events: list[object]) -> list[str]:
        return [
            e.payload.text
            for e in events
            if isinstance(e, TranscriptFinalizedEvent)
        ]

    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback
    ):
        try:
            while True:
                chunk = audio_q.get()
                while not audio_q.empty():
                    chunk = np.concatenate([chunk, audio_q.get_nowait()])

                # **같은 오디오**를 둘 다에 넣는다 — 조건을 완전히 같게 만든다.
                a = texts(with_prompt.feed(chunk))
                b = texts(without.feed(chunk.copy()))
                if not a and not b:
                    continue

                stamp = time.monotonic() - started
                counts["with"] += len(a)
                counts["without"] += len(b)
                print(f"\n[{stamp:6.1f}s]")
                print(f"  프롬프트 있음 : {' | '.join(a) if a else '(없음)'}")
                print(f"  프롬프트 없음 : {' | '.join(b) if b else '(없음)'}")
                if a and not b:
                    print("  ^^^ 한쪽만 나왔다 — 무음 중이었다면 환각이다")
        except KeyboardInterrupt:
            pass

    print("\n" + "-" * 70)
    print(f"전사 건수  프롬프트 있음 {counts['with']} · 없음 {counts['without']}")
    print("말한 횟수보다 '있음'이 많으면 그 차이가 환각이다.")


main()

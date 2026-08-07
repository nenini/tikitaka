"""STT 코어 파이프라인 — 오디오 청크 → faster-whisper → TranscriptEvent (STT-03).

faster-whisper(ctranslate2 백엔드)로 한국어 STT를 수행하고,
결과 세그먼트를 아키텍처 계약(TranscriptEvent)으로 변환한다.
GPU(cuda) 우선, 초기화 실패 시 CPU로 자동 폴백.
"""

from __future__ import annotations

import logging
import math
import os
from typing import List

logger = logging.getLogger(__name__)


def _add_cuda_dll_dirs() -> None:
    """Windows에서 pip로 설치한 nvidia cuBLAS/cuDNN DLL을 로드할 수 있게 한다.

    os.add_dll_directory만으로는 '지연 로딩'되는 cublas64_12.dll을 못 찾는 경우가 있어
    PATH에도 bin 디렉터리를 추가한다. faster_whisper(ctranslate2) import 전에 호출해야 한다.
    """
    if os.name != "nt":
        return
    import importlib.util
    from pathlib import Path

    dirs: List[str] = []
    for mod in ("nvidia.cublas", "nvidia.cudnn", "nvidia.cuda_nvrtc"):
        spec = importlib.util.find_spec(mod)
        if not spec or not spec.submodule_search_locations:
            continue
        bin_dir = Path(list(spec.submodule_search_locations)[0]) / "bin"
        if bin_dir.is_dir():
            dirs.append(str(bin_dir))
    for d in dirs:
        try:
            os.add_dll_directory(d)
        except OSError:
            pass
    if dirs:
        os.environ["PATH"] = os.pathsep.join(dirs) + os.pathsep + os.environ.get("PATH", "")


# ⚠️ faster_whisper import 전에 CUDA DLL 경로를 먼저 잡는다.
_add_cuda_dll_dirs()

import numpy as np  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

import re  # noqa: E402
from dataclasses import dataclass  # noqa: E402

SAMPLE_RATE = 16_000

# 한국어 전사에 나올 수 없는 외국 문자(키릴·아랍·일본가나·한자) — 있으면 환각으로 드롭.
_FOREIGN_SCRIPT = re.compile(r"[Ѐ-ӿ؀-ۿ぀-ヿ一-鿿]")

# whisper가 "이건 음성이 아닌 것 같다"고 보는 확률의 상한. 초과하면 전사를 버린다.
#
# 실측 2026-07-30 (테스트 55건 = 발화 45 + 거부 10, float16·int8_float16 양쪽):
#   진짜 발화 no_speech_prob  최대 0.212
#   무음/노이즈 출력          최소 0.458
#   → 임계 0.25~0.45 구간이 전부 동일(CER 불변, 환각 통과 0건). 중앙값 0.35 채택.
# 기존 0.6은 환각 구간에 걸쳐 있어 float16에서 "시청해주셔서 감사합니다."가 새어나갔다
# (int8에서는 우연히 막혔다 — 양자화에 따라 결과가 뒤집히던 것을 이 값으로 없앤다).
#
# ⚠️ 2026-07-31 라이브 마이크 실사용: 0.35는 오프라인 55건에 과적합 — 실제 마이크는
# 진짜 발화의 no_speech_prob이 0.35~0.6에도 자주 들어와서 발화가 통째로 드롭됐다
# (SPEECH_STARTED/ENDED만 뜨고 전사 안 뜸). 환경별 튜닝 필요. 현재 0.5 (실험서 0.6과 동일, 환각 컷만 소폭 강화, #39).
NO_SPEECH_THRESHOLD = 0.5


@dataclass(frozen=True)
class TranscriptPiece:
    """whisper 세그먼트 하나의 전사 결과 — 이벤트 조립 전 원자료.

    이벤트 계약(TranscriptEvent) 조립은 session 계층이 담당한다(식별자·utteranceId 주입).
    """

    text: str
    confidence: float
    segment_start_ms: int
    segment_end_ms: int
    language: str


class SttEngine:
    """단일 화자용 STT 엔진. 화자별로 인스턴스를 하나씩 두면 스트림이 분리된다(STT-04)."""

    def __init__(
        self,
        model_size: str = "large-v3",
        device: str = "cuda",
        compute_type: str = "float16",
        language: str = "ko",
    ) -> None:
        self.language = language
        try:
            self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
            self.device = device
        except Exception as exc:  # GPU/cuDNN 초기화 실패 → CPU 폴백
            print(f"[stt] {device} 초기화 실패 ({exc!r}) → CPU(int8) 폴백")
            self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
            self.device = "cpu"

    def transcribe_chunk(
        self,
        audio: np.ndarray,
        *,
        base_ms: int = 0,
        vad_filter: bool = False,
        min_confidence: float = 0.5,
        no_speech_threshold: float = NO_SPEECH_THRESHOLD,
        initial_prompt: str | None = None,
    ) -> list[TranscriptPiece]:
        """오디오 청크(float32 mono 16kHz) → 전사 조각 리스트.

        세그먼트 시각은 base_ms(발화 시작 sessionElapsedMs) + 세그먼트 상대시각으로 절대화한다.
        무음/노이즈에서 흔한 whisper 환각("감사합니다" 등)은 no_speech_prob·confidence로 거른다.
        """
        segments, info = self.model.transcribe(
            audio,
            language=self.language,
            beam_size=5,
            vad_filter=vad_filter,  # 무음 구간 스킵 (기본 False: 상위에서 이미 VAD 게이팅)
            vad_parameters=dict(min_silence_duration_ms=500),
            no_speech_threshold=no_speech_threshold,
            log_prob_threshold=-1.0,
            condition_on_previous_text=False,  # 청크 간 환각 전파 방지
            # **기본은 None 이다.** 문장부호를 얻으려고 프롬프트를 넣었다가 되돌렸다
            # (2026-08-07). 실측:
            #   프롬프트 없음  물음표 3 · 마침표 8    무음 환각 필터통과 0/5
            #   프롬프트 있음  물음표 4 · 마침표 16   무음 환각 필터통과 5/5
            # 프롬프트가 환각을 만든 게 아니라, 환각을 "대화처럼 보이는 고신뢰 문장"
            # (conf 0.84~0.89)으로 바꿔 필터를 통과시켰다. 프로덕션 세션 15에서 전사
            # 24개 중 11개(46%)가 프롬프트 문장이었고, 리포트가 그걸 실제 발화로 읽어
            # "불필요한 감사 표현"이라고 지적했다. 얻은 건 클립 6개에서 물음표 1개다.
            # 인자는 남긴다 — ai/stt/prompt_ab.py 로 다시 재보려면 필요하다.
            initial_prompt=initial_prompt,
            # 반복은 후처리(collapse+반복억제)로 잡는다. 디코딩 강제(no_repeat_ngram/penalty)는
            # 정확도를 깎아서 제거함. compression_ratio는 기본값(2.4)만 유지 = 반복 세그먼트 드롭.
            compression_ratio_threshold=2.4,
        )

        pieces: list[TranscriptPiece] = []
        for seg in segments:
            # 어느 필터가 얼마나 잘라내는지 남긴다. 임계값 두 개(no_speech_prob,
            # min_confidence)가 모두 0.5 인데 실측 분포를 본 적이 없어서, 진짜 말이
            # 걸리는지 잡음만 걸리는지 판단할 근거가 없었다.
            text = seg.text.strip()
            if not text:
                logger.debug("segment dropped reason=EMPTY_TEXT")
                continue
            if _FOREIGN_SCRIPT.search(text):
                # 한국어에 없는 외국 문자(키릴/한자 등) = 환각 드롭
                logger.debug("segment dropped reason=FOREIGN_SCRIPT text=%r", text)
                continue
            # 무음 확률이 높거나(환각 의심) 신뢰도가 낮으면 버린다
            no_speech_prob = float(getattr(seg, "no_speech_prob", 0.0))
            if no_speech_prob > no_speech_threshold:
                logger.debug(
                    "segment dropped reason=NO_SPEECH_PROB value=%.3f threshold=%.2f text=%r",
                    no_speech_prob, no_speech_threshold, text,
                )
                continue
            confidence = round(min(max(math.exp(seg.avg_logprob), 0.0), 1.0), 2)
            if confidence < min_confidence:
                logger.debug(
                    "segment dropped reason=LOW_CONFIDENCE value=%.2f threshold=%.2f text=%r",
                    confidence, min_confidence, text,
                )
                continue
            pieces.append(
                TranscriptPiece(
                    text=text,
                    confidence=confidence,
                    segment_start_ms=base_ms + int(seg.start * 1000),
                    segment_end_ms=base_ms + int(seg.end * 1000),
                    language=info.language,
                )
            )
        return pieces

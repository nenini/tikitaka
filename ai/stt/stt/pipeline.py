"""STT 코어 파이프라인 — 오디오 청크 → faster-whisper → TranscriptEvent (STT-03).

faster-whisper(ctranslate2 백엔드)로 한국어 STT를 수행하고,
결과 세그먼트를 아키텍처 계약(TranscriptEvent)으로 변환한다.
GPU(cuda) 우선, 초기화 실패 시 CPU로 자동 폴백.
"""

from __future__ import annotations

import math
import os
from typing import List


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

from stt.events import TranscriptEvent, TranscriptPayload  # noqa: E402

SAMPLE_RATE = 16_000


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

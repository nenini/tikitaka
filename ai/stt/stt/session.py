"""화자별 STT 스트림 멀티플렉싱 (STT-04).

- SpeakerStream: 한 화자의 VAD 버퍼 + 발화 엔드포인팅 상태머신.
- SessionSttRunner: 공유 SttEngine 1개 위에서 여러 화자 스트림을 관리하고
  speakerId를 태깅해 공통 시간축(sessionElapsedMs)의 TranscriptEvent를 낸다.

화자 분리는 diarization이 아니라 입력 스트림 분리(WebRTC 트랙 상당)로 처리한다.
모델(WhisperModel)은 하나만 공유한다 — transcribe는 호출마다 독립이므로 VRAM을 아낀다.
"""

from __future__ import annotations

from typing import Dict, List

import numpy as np
from faster_whisper.vad import VadOptions, get_speech_timestamps

from stt.events import TranscriptEvent
from stt.pipeline import SAMPLE_RATE, SttEngine

MAX_BUFFER_SECONDS = 25.0


def make_vad_options(
    threshold: float = 0.5,
    end_silence_ms: int = 700,
    max_utterance_s: float = 20.0,
) -> VadOptions:
    return VadOptions(
        threshold=threshold,
        min_silence_duration_ms=end_silence_ms,
        min_speech_duration_ms=250,
        max_speech_duration_s=max_utterance_s,
        speech_pad_ms=200,
    )


class SpeakerStream:
    """한 화자의 오디오를 받아 발화 단위로 STT하여 TranscriptEvent를 낸다."""

    def __init__(
        self,
        engine: SttEngine,
        *,
        session_id: str,
        speaker_id: str,
        vad_opts: VadOptions,
        end_silence_ms: int = 700,
        min_confidence: float = 0.5,
    ) -> None:
        self.engine = engine
        self.session_id = session_id
        self.speaker_id = speaker_id
        self.vad_opts = vad_opts
        self.min_confidence = min_confidence
        self._end_silence_samples = int(SAMPLE_RATE * end_silence_ms / 1000)
        self._max_buffer_samples = int(SAMPLE_RATE * MAX_BUFFER_SECONDS)
        self._buffer: np.ndarray = np.empty(0, dtype=np.float32)
        self._offset = 0  # 버퍼 앞에서 소비/버린 샘플 수 (절대 시간축)
        self._seq = 0

    def flush_utterance(self, utterance: np.ndarray, start_ms: int) -> List[TranscriptEvent]:
        """발화 하나를 전사하고 speakerId·seq를 태깅해 반환한다(테스트 가능한 seam)."""
        events = self.engine.transcribe_chunk(
            utterance,
            session_id=self.session_id,
            speaker_id=self.speaker_id,
            session_elapsed_ms=start_ms,
            seq_start=self._seq,
            vad_filter=False,  # 이미 VAD로 발화만 잘랐음
            min_confidence=self.min_confidence,
        )
        self._seq += len(events)
        return events

    def feed(self, audio: np.ndarray) -> List[TranscriptEvent]:
        """오디오 청크를 누적하고, 발화가 끝났으면 전사해 이벤트를 반환한다."""
        self._buffer = np.concatenate([self._buffer, audio])

        segments = get_speech_timestamps(self._buffer, self.vad_opts)
        if not segments:
            # 발화 없음: 버퍼가 길어지면 앞을 버림(발화 시작을 놓치지 않게 뒤 1초 유지)
            if len(self._buffer) > SAMPLE_RATE * 2:
                drop = len(self._buffer) - SAMPLE_RATE
                self._buffer = self._buffer[drop:]
                self._offset += drop
            return []

        last_end = segments[-1]["end"]
        trailing_silence = len(self._buffer) - last_end
        force = len(self._buffer) >= self._max_buffer_samples
        if trailing_silence < self._end_silence_samples and not force:
            return []  # 아직 말하는 중

        first = segments[0]["start"]
        utterance = self._buffer[first:last_end]
        start_ms = int((self._offset + first) / SAMPLE_RATE * 1000)
        events = self.flush_utterance(utterance, start_ms)

        self._buffer = self._buffer[last_end:]  # 소비 구간 제거
        self._offset += last_end
        return events

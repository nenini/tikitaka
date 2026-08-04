"""In-memory transcript segments and short-lived post-session snapshots."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class TranscriptSegment:
    """One finalized STT utterance with enough identity for later evidence."""

    event_id: str
    utterance_id: str
    session_id: str
    user_id: str
    participant_identity: str
    client_instance_id: str
    seq: int
    start_ms: int
    end_ms: int
    text: str
    confidence: float
    language: str
    occurred_at: str

    @property
    def speaker_id(self) -> str:
        """Compatibility name used by existing conversation detectors."""
        return self.user_id

    @property
    def duration_ms(self) -> int:
        return max(0, self.end_ms - self.start_ms)


@dataclass
class TranscriptBuffer:
    """Keep finalized segments and expose a deterministic conversation order."""

    _segments: list[TranscriptSegment] = field(default_factory=list)

    def append(self, segment: TranscriptSegment) -> None:
        self._segments.append(segment)

    def ordered_segments(self) -> tuple[TranscriptSegment, ...]:
        return tuple(
            sorted(
                self._segments,
                key=lambda segment: (
                    segment.start_ms,
                    segment.end_ms,
                    segment.seq,
                    segment.event_id,
                ),
            )
        )

    @property
    def segment_count(self) -> int:
        return len(self._segments)

    @property
    def character_count(self) -> int:
        return sum(len(segment.text) for segment in self._segments)

    def render(self) -> str:
        return "\n".join(
            (
                f"[{_format_elapsed(segment.start_ms)}] "
                f"user-{segment.user_id}: {segment.text}"
            )
            for segment in self.ordered_segments()
        )


@dataclass(frozen=True)
class RetainedTranscript:
    """Immutable transcript kept only until its post-session TTL expires."""

    session_id: str
    ended_at: datetime
    expires_at: datetime
    segments: tuple[TranscriptSegment, ...]

    @property
    def segment_count(self) -> int:
        return len(self.segments)

    @property
    def character_count(self) -> int:
        return sum(len(segment.text) for segment in self.segments)

    def render(self) -> str:
        return "\n".join(
            (
                f"[{_format_elapsed(segment.start_ms)}] "
                f"user-{segment.user_id}: {segment.text}"
            )
            for segment in self.segments
        )


def _format_elapsed(elapsed_ms: int) -> str:
    total_seconds = max(0, elapsed_ms) // 1000
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"

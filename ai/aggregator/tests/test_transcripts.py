from datetime import datetime, timezone

from aggregator.transcripts import TranscriptBuffer, TranscriptSegment


def _segment(
    *,
    event_id: str,
    seq: int,
    start_ms: int,
    text: str,
) -> TranscriptSegment:
    return TranscriptSegment(
        event_id=event_id,
        utterance_id=f"utterance-{event_id}",
        session_id="15",
        user_id="1",
        participant_identity="user-1",
        client_instance_id="client-1",
        seq=seq,
        start_ms=start_ms,
        end_ms=start_ms + 1_000,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at=datetime.now(timezone.utc).isoformat(),
    )


def test_buffer_orders_segments_without_losing_identity_fields() -> None:
    buffer = TranscriptBuffer()
    later = _segment(
        event_id="later",
        seq=2,
        start_ms=2_000,
        text="두 번째",
    )
    earlier = _segment(
        event_id="earlier",
        seq=1,
        start_ms=1_000,
        text="첫 번째",
    )

    buffer.append(later)
    buffer.append(earlier)

    ordered = buffer.ordered_segments()
    assert ordered == (earlier, later)
    assert ordered[0].utterance_id == "utterance-earlier"
    assert ordered[0].participant_identity == "user-1"
    assert ordered[0].confidence == 0.9
    assert buffer.segment_count == 2
    assert buffer.character_count == len("첫 번째두 번째")
    assert buffer.render().splitlines() == [
        "[00:01] user-1: 첫 번째",
        "[00:02] user-1: 두 번째",
    ]

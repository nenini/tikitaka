"""MVP conversation coaching: directed silence, response and reactions."""

from __future__ import annotations

from stt.events import (
    SpeechStartedEvent,
    SpeechStartedPayload,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)

from aggregator.aggregator import SessionAggregator
from aggregator.coaching import CoachingCommand, CoachingPolicy
from aggregator.coaching_arbitrator import CoachingArbitrator
from aggregator.coaching_candidates import CoachingCandidate
from aggregator.events import AnalysisEvent

_CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
_CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _aggregator() -> tuple[
    SessionAggregator,
    list[AnalysisEvent],
    list[CoachingCommand],
]:
    analysis: list[AnalysisEvent] = []
    coaching: list[CoachingCommand] = []
    aggregator = SessionAggregator(
        "session-mvp",
        on_analysis=analysis.append,
        on_coaching=coaching.append,
        participant_user_ids=["user-a", "user-b"],
    )
    return aggregator, analysis, coaching


def _transcript(
    user_id: str,
    text: str,
    start_ms: int,
    end_ms: int,
    *,
    client_id: str,
    seq: int = 1,
) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id="session-mvp",
        user_id=user_id,
        participant_identity=f"participant-{user_id}",
        client_instance_id=client_id,
        utterance_id=f"00000000-0000-4000-8000-{end_ms:012d}",
        seq=seq,
        session_elapsed_ms=end_ms,
        confidence=0.9,
        payload=TranscriptPayload(
            text=text,
            language="ko",
            segment_start_ms=start_ms,
            segment_end_ms=end_ms,
        ),
    )


def _speech_started(
    user_id: str,
    start_ms: int,
    *,
    client_id: str,
) -> SpeechStartedEvent:
    return SpeechStartedEvent(
        session_id="session-mvp",
        user_id=user_id,
        participant_identity=f"participant-{user_id}",
        client_instance_id=client_id,
        utterance_id=f"10000000-0000-4000-8000-{start_ms:012d}",
        seq=1,
        session_elapsed_ms=start_ms,
        confidence=0.9,
        payload=SpeechStartedPayload(observed_start_elapsed_ms=start_ms),
    )


def test_silence_coaches_only_the_last_speakers_counterpart() -> None:
    aggregator, analysis, coaching = _aggregator()
    aggregator.push_stt_event(
        _transcript("user-a", "반갑습니다.", 0, 1000, client_id=_CLIENT_A)
    )

    aggregator.tick(11_000)

    assert [event.event_type for event in analysis] == ["SILENCE_DETECTED"]
    silence = [
        command
        for command in coaching
        if command.coaching_type == "SILENCE_RECOVERY"
    ]
    assert len(silence) == 1
    assert silence[0].target_user_id == "user-b"


def test_long_talk_without_verbal_reaction_prompts_listener() -> None:
    aggregator, _, coaching = _aggregator()
    aggregator.push_stt_event(
        _speech_started("user-a", 1000, client_id=_CLIENT_A)
    )

    aggregator.tick(15_999)
    assert coaching == []
    aggregator.tick(16_000)

    assert len(coaching) == 1
    assert coaching[0].coaching_type == "REACTION_PROMPT"
    assert coaching[0].target_user_id == "user-b"


def test_verbal_reaction_suppresses_reaction_prompt() -> None:
    aggregator, _, coaching = _aggregator()
    aggregator.push_stt_event(
        _speech_started("user-a", 1000, client_id=_CLIENT_A)
    )
    aggregator.push_stt_event(
        _transcript(
            "user-b",
            "아, 그러시구나.",
            8000,
            9000,
            client_id=_CLIENT_B,
        )
    )

    aggregator.tick(16_000)

    assert not [
        command
        for command in coaching
        if command.coaching_type == "REACTION_PROMPT"
    ]


def test_question_without_response_prompts_other_participant() -> None:
    aggregator, _, coaching = _aggregator()
    aggregator.push_stt_event(
        _transcript(
            "user-b",
            "주말에는 무엇을 하세요?",
            0,
            1000,
            client_id=_CLIENT_B,
        )
    )

    aggregator.tick(5_999)
    assert coaching == []
    aggregator.tick(6_000)

    assert len(coaching) == 1
    assert coaching[0].coaching_type == "RESPONSE_PROMPT"
    assert coaching[0].target_user_id == "user-a"


def test_silence_has_priority_over_reaction_for_same_target() -> None:
    arbitrator = CoachingArbitrator()
    silence = CoachingCandidate(
        coaching_type="SILENCE_RECOVERY",
        target_user_id="user-a",
        message_key="SILENCE_RECOVERY_01",
        reason_code="LONG_SILENCE",
        triggered_at_ms=10_000,
        trigger_id="silence",
    )
    reaction = CoachingCandidate(
        coaching_type="REACTION_PROMPT",
        target_user_id="user-a",
        message_key="REACTION_PROMPT_01",
        reason_code="NO_REACTION",
        triggered_at_ms=10_000,
        trigger_id="reaction",
    )

    assert arbitrator.select([reaction, silence]) == [silence]


def test_messages_rotate_per_target_and_coaching_type() -> None:
    policy = CoachingPolicy(cooldown_ms=0)
    aggregator, _, _ = _aggregator()
    commands = []
    for index in range(3):
        command = policy.evaluate_candidate(
            CoachingCandidate(
                coaching_type="REACTION_PROMPT",
                target_user_id="user-a",
                message_key="REACTION_PROMPT_01",
                reason_code="NO_REACTION",
                triggered_at_ms=index,
                trigger_id=f"reaction-{index}",
            ),
            aggregator.state,
        )
        assert command is not None
        commands.append(command)

    assert [command.message_key for command in commands] == [
        "REACTION_PROMPT_01",
        "REACTION_PROMPT_02",
        "REACTION_PROMPT_03",
    ]

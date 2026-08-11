"""코칭이 세션 내내 죽어 있던 두 경로 (2026-08-06 운영).

① 중재 순서 — 중재기가 정책보다 먼저 돌아서, 정책이 확실히 거부할 후보가 타깃의
   유일한 슬롯을 먹고 사라졌다. 질문 뒤 상대가 끝내 답을 안 하면 RESPONSE_PROMPT
   후보가 매 tick 다시 생성되면서 SILENCE_RECOVERY 를 영영 굶겼다.
② is_speaking 고착 — SPEECH_ENDED 가 유실되면 침묵 감지가 `any(is_speaking)`
   게이트에서 막혀 세션 전체가 죽는다. 복구 수단이 없었다.
"""

from __future__ import annotations

import uuid

from stt.events import (
    SpeechEndedEvent,
    SpeechEndedPayload,
    SpeechStartedEvent,
    SpeechStartedPayload,
    SttEvent,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)

from aggregator.aggregator import _MAX_UTTERANCE_MS, SessionAggregator
from aggregator.coaching import CoachingCommand
from aggregator.coaching_arbitrator import CoachingArbitrator
from aggregator.coaching_candidates import CoachingCandidate, CoachingType
from aggregator.events import AnalysisEvent, SilenceDetected

_CLIENT = {
    "A": "11111111-1111-4111-8111-111111111111",
    "B": "22222222-2222-4222-8222-222222222222",
}


class _Seq:
    def __init__(self) -> None:
        self._n = {"A": 0, "B": 0}

    def next(self, user: str) -> int:
        self._n[user] += 1
        return self._n[user]


def _started(seq: _Seq, user: str, at_ms: int) -> SpeechStartedEvent:
    return SpeechStartedEvent(
        session_id="t",
        user_id=user,
        participant_identity=f"p-{user}",
        client_instance_id=_CLIENT[user],
        utterance_id=str(uuid.uuid4()),
        seq=seq.next(user),
        session_elapsed_ms=at_ms,
        confidence=1.0,
        payload=SpeechStartedPayload(observed_start_elapsed_ms=at_ms),
    )


def _ended(seq: _Seq, user: str, start_ms: int, at_ms: int) -> SpeechEndedEvent:
    return SpeechEndedEvent(
        session_id="t",
        user_id=user,
        participant_identity=f"p-{user}",
        client_instance_id=_CLIENT[user],
        utterance_id=str(uuid.uuid4()),
        seq=seq.next(user),
        session_elapsed_ms=at_ms,
        confidence=1.0,
        payload=SpeechEndedPayload(
            observed_start_elapsed_ms=start_ms,
            observed_end_elapsed_ms=at_ms,
            speech_duration_ms=at_ms - start_ms,
            termination_reason="SILENCE",
        ),
    )


def _text(
    seq: _Seq, user: str, start_ms: int, at_ms: int, body: str
) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id="t",
        user_id=user,
        participant_identity=f"p-{user}",
        client_instance_id=_CLIENT[user],
        utterance_id=str(uuid.uuid4()),
        seq=seq.next(user),
        session_elapsed_ms=at_ms,
        confidence=0.9,
        payload=TranscriptPayload(
            text=body,
            language="ko",
            segment_start_ms=start_ms,
            segment_end_ms=at_ms,
        ),
    )


class _Run:
    """이벤트를 **발생 시각에 맞춰** 흘리면서 tick 을 돌린 결과.

    전부 앞당겨 넣으면 last_activity_ms 가 처음부터 마지막 값이 돼서 침묵 구간이
    하나로 뭉개진다. 실제 런타임은 시간순으로 들어온다.
    """

    def __init__(
        self,
        events: list[SttEvent],
        *,
        until_ms: int,
        awaiting: tuple[int, int] | None = None,
    ) -> None:
        """awaiting: (시작ms, 끝ms) — 그 구간 동안 전사가 처리 중이라고 본다."""
        self.commands: list[CoachingCommand] = []
        self.silences: list[int] = []
        self.aggregator = SessionAggregator(
            "t",
            on_analysis=self._on_analysis,
            on_coaching=self.commands.append,
            participant_user_ids=["A", "B"],
        )
        pending = sorted(events, key=lambda event: event.session_elapsed_ms)
        index = 0
        for now_ms in range(0, until_ms + 1, 500):
            while (
                index < len(pending)
                and pending[index].session_elapsed_ms <= now_ms
            ):
                self.aggregator.push_stt_event(pending[index])
                index += 1
            in_flight = (
                1 if awaiting and awaiting[0] <= now_ms < awaiting[1] else 0
            )
            self.aggregator.tick(now_ms, awaiting_transcripts=in_flight)

    def _on_analysis(self, event: AnalysisEvent) -> None:
        if isinstance(event, SilenceDetected):
            self.silences.append(event.session_elapsed_ms)

    def types(self) -> set[str]:
        return {command.coaching_type for command in self.commands}

    def speaking(self) -> dict[str, bool]:
        return {
            user.user_id: user.is_speaking
            for user in self.aggregator.state.users.values()
        }


# ── ① 중재 순서 ──────────────────────────────────────────────────


def _candidate(
    kind: CoachingType, target: str, trigger: str
) -> CoachingCandidate:
    return CoachingCandidate(
        coaching_type=kind,
        target_user_id=target,
        message_key=f"{kind}_01",
        reason_code="TEST",
        triggered_at_ms=1_000,
        trigger_id=trigger,
        priority="LOW",
    )


def test_ranked_orders_candidates_per_target() -> None:
    silence = _candidate("SILENCE_RECOVERY", "B", "s")
    response = _candidate("RESPONSE_PROMPT", "B", "r")
    other = _candidate("SILENCE_RECOVERY", "A", "s2")

    ranked = CoachingArbitrator().ranked([silence, response, other])

    assert list(ranked) == ["B", "A"]
    assert [c.coaching_type for c in ranked["B"]] == [
        "RESPONSE_PROMPT",
        "SILENCE_RECOVERY",
    ]
    assert [c.coaching_type for c in ranked["A"]] == ["SILENCE_RECOVERY"]


def test_unanswered_question_no_longer_starves_silence_coaching() -> None:
    """A 가 질문하고 B 가 끝내 답하지 않는 90초.

    예전엔 7초의 RESPONSE_PROMPT 1건이 전부였다. RESPONSE_PROMPT 후보가 매 tick
    다시 생성돼 랭크 1로 중재를 통과하고, 정책은 같은 trigger_id 라 거부했다.
    """
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 0),
            _ended(seq, "A", 0, 2_000),
            _text(seq, "A", 0, 2_000, "취미가 뭐예요?"),
        ],
        until_ms=90_000,
    )

    assert run.silences, "침묵 자체는 감지돼야 한다"
    assert run.types() == {"RESPONSE_PROMPT", "SILENCE_RECOVERY"}


def test_arbitration_still_sends_at_most_one_per_target_per_tick() -> None:
    """폴백은 '1등이 거부되면 다음'이지 '여러 건 발행'이 아니다."""
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 0),
            _ended(seq, "A", 0, 2_000),
            _text(seq, "A", 0, 2_000, "취미가 뭐예요?"),
        ],
        until_ms=90_000,
    )
    per_tick: dict[tuple[int, str], int] = {}
    for command in run.commands:
        key = (
            command.triggered_at_session_elapsed_ms,
            command.target_user_id or "session",
        )
        per_tick[key] = per_tick.get(key, 0) + 1
    assert per_tick and max(per_tick.values()) == 1


# ── ② is_speaking 고착 ───────────────────────────────────────────


def test_lost_speech_ended_no_longer_kills_silence_detection() -> None:
    """SPEECH_ENDED 가 유실돼도 안전망이 풀어 준다.

    게이트가 any() 라 한 명만 고착돼도 세션 전체의 침묵 감지가 죽었다.
    """
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 1_000),
            _text(seq, "A", 1_000, 5_000, "안녕하세요 반가워요"),
        ],
        until_ms=_MAX_UTTERANCE_MS + 20_000,
    )

    assert run.speaking() == {"A": False, "B": False}
    assert run.silences, "고착이 풀려야 침묵이 감지된다"
    assert run.silences[0] > _MAX_UTTERANCE_MS


def test_only_one_side_stuck_still_recovers() -> None:
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 1_000),
            _ended(seq, "A", 1_000, 5_000),
            _text(seq, "A", 1_000, 5_000, "안녕하세요 반가워요"),
            _started(seq, "B", 6_000),
            _text(seq, "B", 6_000, 9_000, "네 저도요"),
        ],
        until_ms=_MAX_UTTERANCE_MS + 20_000,
    )

    assert run.speaking() == {"A": False, "B": False}
    assert run.silences


def test_normal_long_speech_is_not_cleared_too_early() -> None:
    """STT 는 25초면 강제로 끊는다. 그 전에 풀면 정상 발화를 침묵으로 오인한다."""
    seq = _Seq()
    run = _Run([_started(seq, "A", 0)], until_ms=_MAX_UTTERANCE_MS - 1_000)

    assert run.speaking()["A"] is True
    assert run.silences == [], "말하는 중에는 침묵 감지가 돌면 안 된다"


# ── ③ 침묵 재시도 ────────────────────────────────────────────────


def test_silence_is_retried_while_it_lasts() -> None:
    """침묵이 이어지는 동안 감지기가 주기적으로 다시 낸다.

    한 번만 내면, 그 tick 에 더 높은 순위 후보가 있었다는 이유만으로 그 침묵은
    영영 코칭되지 않는다. 후보가 중재기·정책을 통과할 기회를 여러 번 줘야 한다.
    """
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 0),
            _ended(seq, "A", 0, 2_000),
            _text(seq, "A", 0, 2_000, "안녕하세요 반가워요"),
        ],
        until_ms=60_000,
    )

    assert len(run.silences) >= 5, "침묵이 58초 이어졌는데 한 번만 감지하면 안 된다"


def test_retried_silence_still_coaches_only_once() -> None:
    """재시도해도 같은 침묵 구간의 코칭은 1건이다.

    trigger_id 가 last_activity_ms 기준이라 정책이 중복을 막는다. event_id 를
    쓰면 매번 새 UUID 라 같은 침묵에 코칭이 쏟아진다.
    """
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 0),
            _ended(seq, "A", 0, 2_000),
            _text(seq, "A", 0, 2_000, "안녕하세요 반가워요"),
        ],
        until_ms=60_000,
    )

    silence_commands = [
        command
        for command in run.commands
        if command.coaching_type == "SILENCE_RECOVERY"
    ]
    assert len(silence_commands) == 1
    assert len({command.deduplication_key for command in silence_commands}) == 1


def test_new_silence_episode_gets_its_own_coaching() -> None:
    """발화가 재개된 뒤 다시 침묵하면 그건 별개 구간이다."""
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 0),
            _ended(seq, "A", 0, 2_000),
            _text(seq, "A", 0, 2_000, "안녕하세요 반가워요"),
            _started(seq, "B", 70_000),
            _ended(seq, "B", 70_000, 72_000),
            _text(seq, "B", 70_000, 72_000, "네 반가워요 저도"),
        ],
        until_ms=140_000,
    )

    triggers = {
        command.deduplication_key
        for command in run.commands
        if command.coaching_type == "SILENCE_RECOVERY"
    }
    assert len(triggers) == 2, "두 침묵 구간은 서로 다른 코칭이어야 한다"


# ── ④ 잡음이 침묵 시계를 되돌리던 문제 (세션 14) ──────────────────


def _noise(seq: _Seq, user: str, at_ms: int, duration_ms: int = 300) -> list[SttEvent]:
    """전사가 안 나오는 짧은 VAD 개방 — 숨소리·잡음.

    VAD 는 min_speech_duration_ms=250 이라 이런 블립에도 발화를 연다.
    """
    return [
        _started(seq, user, at_ms),
        _ended(seq, user, at_ms, at_ms + duration_ms),
    ]


def test_noise_blips_do_not_reset_the_silence_clock() -> None:
    """세션 14 재현 — 배치는 침묵 4회, 실시간은 0회였다.

    전사 사이가 40초 비어 있는데 그 안에서 잡음이 5초마다 VAD 를 열었다. 예전에는
    SPEECH_STARTED 마다 last_activity_ms 가 0으로 돌아가 silent_ms 가 1.2초를
    못 넘겼다. 로그상 BELOW_THRESHOLD 22회 / SOMEONE_SPEAKING 22회가 정확히
    번갈아 나왔고, 어느 쪽으로도 10초를 통과할 수 없는 구조였다.
    """
    seq = _Seq()
    events: list[SttEvent] = [
        _started(seq, "A", 0),
        _ended(seq, "A", 0, 3_000),
        _text(seq, "A", 0, 3_000, "안녕하세요 반가워요"),
    ]
    # 5초마다 300ms 잡음. 전사는 하나도 안 나온다.
    for at_ms in range(8_000, 44_000, 5_000):
        events += _noise(seq, "B", at_ms)

    run = _Run(events, until_ms=50_000)

    assert run.silences, "잡음만 있는 40초 구간은 침묵으로 잡혀야 한다"
    assert any(
        command.coaching_type == "SILENCE_RECOVERY" for command in run.commands
    )


def test_silence_is_held_while_a_transcript_is_still_in_flight() -> None:
    """소리는 멈췄는데 말인지 아직 모르는 구간에서는 결론을 미룬다.

    여기서 침묵으로 단정하면 방금 6초를 말한 사람에게 "대화가 끊겼어요"가 나간다.
    반대로 활동으로 치면 잡음 하나가 침묵을 영영 막는다. 그래서 보류다.
    """
    seq = _Seq()
    events: list[SttEvent] = [
        _started(seq, "A", 0),
        _ended(seq, "A", 0, 3_000),
        _text(seq, "A", 0, 3_000, "안녕하세요 반가워요"),
        # 6초 발화. 전사가 아직 워커에 있다.
        _started(seq, "B", 8_000),
        _ended(seq, "B", 8_000, 14_000),
    ]

    held = _Run(events, until_ms=22_000, awaiting=(14_000, 30_000))
    assert held.silences == [], "전사 처리 중에는 침묵으로 단정하지 않는다"

    # 워커가 끝났는데도 전사가 안 나왔다 = 말이 아니었다. 그때는 침묵이 맞다
    # (리포트의 배치 판정도 전사 간격만 본다 — 두 숫자가 어긋나면 안 된다).
    released = _Run(events, until_ms=22_000, awaiting=(14_000, 16_000))
    assert released.silences


def test_long_utterance_in_progress_is_never_silence() -> None:
    """말하는 도중에는 전사가 없어도 침묵이 아니다 — is_speaking 게이트가 막는다."""
    seq = _Seq()
    run = _Run(
        [
            _started(seq, "A", 0),
            _ended(seq, "A", 0, 3_000),
            _text(seq, "A", 0, 3_000, "안녕하세요 반가워요"),
            _started(seq, "B", 5_000),  # 계속 말하는 중 (ENDED 없음)
        ],
        until_ms=25_000,
    )

    assert run.silences == []

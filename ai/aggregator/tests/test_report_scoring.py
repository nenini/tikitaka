"""리포트 결정적 집계 검증 (S15P11A307-488·489).

LLM 없이 코드만으로 나오는 수치라 전부 결정적으로 검증할 수 있다.
특히 경청 축은 맞장구를 말끊기에서 빼야 해서 경계 케이스를 촘촘히 본다.
"""

from __future__ import annotations

from itertools import count

from aggregator.detectors import SilenceDetector
from aggregator.report.input import ReportInput, SpeakerInput, VisionInput, build_report_input
from aggregator.report.scoring import (
    AXES,
    AXIS_BALANCE,
    AXIS_LISTENING,
    AXIS_NONVERBAL,
    AXIS_QUESTION,
    AXIS_REACTION,
    BACKCHANNEL_MAX_MS,
    SILENCE_THRESHOLD_MS,
    count_long_silences,
    find_long_silences,
    find_overlaps,
    count_overlaps,
    score_report,
)
from aggregator.state import SessionState, Utterance

A = "user-a"
B = "user-b"


_SEQ = count(1)


def _u(speaker: str, start_ms: int, end_ms: int, text: str = "발화") -> Utterance:
    """Utterance(=TranscriptSegment)는 STT v2 신원 필드를 전부 요구한다.

    리포트가 실제로 보는 건 화자·시각·텍스트뿐이라 나머지는 자리만 채운다.
    speaker_id는 user_id의 읽기 전용 별칭이므로 user_id로 넣는다.
    """
    seq = next(_SEQ)
    return Utterance(
        event_id=f"evt-{seq}",
        utterance_id=f"utt-{seq}",
        session_id="s1",
        user_id=speaker,
        participant_identity=f"identity-{speaker}",
        client_instance_id="11111111-1111-4111-8111-111111111111",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at="2026-08-03T14:00:00+09:00",
    )


def _report(
    utterances: list[Utterance],
    *,
    duration_ms: int = 30 * 60 * 1000,
    vision_enabled: bool = True,
    vision_counts: dict[str, int] | None = None,
    vision_available: bool = True,
) -> ReportInput:
    by_speaker: dict[str, list[Utterance]] = {}
    for utterance in utterances:
        by_speaker.setdefault(utterance.speaker_id, []).append(utterance)
    speakers = tuple(
        SpeakerInput(
            speaker_id=speaker,
            utterances=tuple(items),
            speaking_ms=sum(u.duration_ms for u in items),
            question_count=0,
            filler_count=0,
        )
        for speaker, items in by_speaker.items()
    )
    vision = tuple(
        VisionInput(user_id=speaker, available=vision_available,
                    behavior_counts=dict(vision_counts or {}),
                    coverage=1.0 if vision_available else 0.0)
        for speaker in by_speaker
    )
    return ReportInput(
        session_id="s1",
        session_duration_ms=duration_ms,
        speakers=speakers,
        vision=vision,
        vision_enabled=vision_enabled,
    )


# ── 실시간과의 일관성 ────────────────────────────────────────────────
def test_silence_threshold_matches_realtime_detector() -> None:
    """리포트와 실시간 코칭이 같은 기준으로 침묵을 세야 한다.

    어긋나면 같은 세션에서 두 숫자가 다르게 나가 사용자·BE가 혼란스러워진다.
    관제실이 SilenceDetector 임계값을 바꾸면 이 테스트가 먼저 실패한다.
    """
    assert SILENCE_THRESHOLD_MS == SilenceDetector().threshold_ms


# ── 침묵 ─────────────────────────────────────────────────────────────
def test_long_silence_counts_gaps_over_threshold() -> None:
    timeline = (_u(A, 0, 1_000), _u(B, 20_000, 21_000), _u(A, 25_000, 26_000))
    # 1s→20s = 19초(카운트), 21s→25s = 4초(미달)
    assert count_long_silences(timeline, 15_000) == 1


def test_long_silence_ignores_overlapping_utterances() -> None:
    """겹친 발화는 공백이 아니다 — cursor를 뒤로 되돌리면 안 된다."""
    timeline = (_u(A, 0, 30_000), _u(B, 5_000, 6_000), _u(A, 40_000, 41_000))
    assert count_long_silences(timeline, 15_000) == 0


def test_single_utterance_has_no_silence() -> None:
    assert count_long_silences((_u(A, 0, 1_000),), 15_000) == 0


def test_find_long_silences_returns_the_gap_bounds() -> None:
    """BE evidenceSegments가 시각을 요구한다 — 공백의 시작·끝이 정확해야 한다."""
    timeline = (_u(A, 0, 1_000), _u(B, 20_000, 21_000), _u(A, 25_000, 26_000))
    assert find_long_silences(timeline, 15_000) == ((1_000, 20_000),)


def test_find_long_silences_uses_latest_end_as_cursor() -> None:
    """겹친 발화 뒤의 공백은 더 늦게 끝난 발화 기준으로 잰다."""
    timeline = (_u(A, 0, 30_000), _u(B, 5_000, 6_000), _u(A, 50_000, 51_000))
    assert find_long_silences(timeline, 15_000) == ((30_000, 50_000),)


# ── 경청(말끊기) vs 맞장구 ────────────────────────────────────────────
def test_interruption_counted_when_long_and_other_stops() -> None:
    """상대 발화 도중 길게 끼어들고 상대가 멈춤 → 말끊기."""
    timeline = (_u(B, 0, 10_000), _u(A, 5_000, 9_000))  # 4초, 상대가 먼저 끝남
    interruptions, backchannels = count_overlaps(timeline, A)
    assert (interruptions, backchannels) == (1, 0)


def test_backchannel_not_counted_as_interruption() -> None:
    """짧고 상대가 계속 말함 → 맞장구. 경청 점수를 깎으면 안 된다."""
    timeline = (_u(B, 0, 10_000), _u(A, 4_000, 4_800, "네"))  # 0.8초, 상대 계속
    interruptions, backchannels = count_overlaps(timeline, A)
    assert (interruptions, backchannels) == (0, 1)


def test_short_but_other_stopped_is_interruption() -> None:
    """짧아도 상대가 멈췄으면 맞장구가 아니라 끊은 것이다."""
    timeline = (_u(B, 0, 5_000), _u(A, 4_500, 5_200))
    interruptions, backchannels = count_overlaps(timeline, A)
    assert (interruptions, backchannels) == (1, 0)


def test_backchannel_boundary_is_inclusive() -> None:
    timeline = (_u(B, 0, 20_000), _u(A, 5_000, 5_000 + BACKCHANNEL_MAX_MS))
    assert count_overlaps(timeline, A) == (0, 1)
    longer = (_u(B, 0, 20_000), _u(A, 5_000, 5_001 + BACKCHANNEL_MAX_MS))
    assert count_overlaps(longer, A) == (1, 0)


def test_non_overlapping_turns_are_not_interruptions() -> None:
    timeline = (_u(B, 0, 5_000), _u(A, 5_100, 8_000))
    assert count_overlaps(timeline, A) == (0, 0)


def test_overlap_attributed_to_the_one_who_started_inside() -> None:
    """먼저 말하던 쪽은 끊은 게 아니다."""
    timeline = (_u(B, 0, 10_000), _u(A, 5_000, 9_000))
    assert count_overlaps(timeline, B) == (0, 0)


def test_find_overlaps_returns_my_utterance_span() -> None:
    """구간은 내가 끼어든 발화의 시작~끝이다(타임라인 핀 위치)."""
    timeline = (_u(B, 0, 10_000), _u(A, 5_000, 9_000))
    interruptions, backchannels = find_overlaps(timeline, A)
    assert interruptions == ((5_000, 9_000),)
    assert backchannels == ()


def test_find_overlaps_separates_backchannel_spans() -> None:
    timeline = (_u(B, 0, 10_000), _u(A, 4_000, 4_800, "네"))
    interruptions, backchannels = find_overlaps(timeline, A)
    assert interruptions == ()
    assert backchannels == ((4_000, 4_800),)


# ── 축 환산 ──────────────────────────────────────────────────────────
def test_balance_peaks_near_fifty_percent() -> None:
    even = _report([_u(A, 0, 10_000), _u(B, 10_100, 20_100)])
    axis = next(a for a in score_report(even).for_speaker(A) if a.axis == AXIS_BALANCE)
    assert axis.measured
    assert axis.score is not None and axis.score >= 4.9


def test_balance_drops_when_one_side_dominates() -> None:
    skewed = _report([_u(A, 0, 27_000), _u(B, 27_100, 30_100)])  # A 90%
    axis = next(a for a in score_report(skewed).for_speaker(A) if a.axis == AXIS_BALANCE)
    assert axis.score is not None and axis.score <= 1.5


def test_balance_unmeasured_with_single_speaker() -> None:
    solo = _report([_u(A, 0, 10_000)])
    axis = next(a for a in score_report(solo).for_speaker(A) if a.axis == AXIS_BALANCE)
    assert not axis.measured and axis.score is None


def test_listening_penalises_repeated_interruptions() -> None:
    timeline = [_u(B, i * 60_000, i * 60_000 + 20_000) for i in range(12)]
    timeline += [_u(A, i * 60_000 + 5_000, i * 60_000 + 15_000) for i in range(12)]
    axis = next(a for a in score_report(_report(timeline)).for_speaker(A) if a.axis == AXIS_LISTENING)
    assert axis.score is not None and axis.score <= 2.0


def test_scores_are_continuous_not_integers() -> None:
    """Gap 밴드 ±0.8 임계가 의미를 가지려면 연속값이어야 한다."""
    report = _report([_u(A, 0, 17_000), _u(B, 17_100, 30_100)])  # 약 57%
    axis = next(a for a in score_report(report).for_speaker(A) if a.axis == AXIS_BALANCE)
    assert axis.score is not None
    assert axis.score != round(axis.score)  # 정수가 아니어야 한다


# ── vision 조건부 축 ─────────────────────────────────────────────────
def test_vision_axes_unmeasured_when_disabled() -> None:
    report = _report([_u(A, 0, 10_000), _u(B, 10_100, 20_000)], vision_enabled=False)
    axes = {a.axis: a for a in score_report(report).for_speaker(A)}
    assert not axes[AXIS_REACTION].measured
    assert not axes[AXIS_NONVERBAL].measured
    assert axes[AXIS_BALANCE].measured  # 나머지는 정상 — 4축 축소가 아니다


def test_vision_axes_unmeasured_when_unavailable() -> None:
    report = _report([_u(A, 0, 10_000), _u(B, 10_100, 20_000)], vision_available=False)
    axes = {a.axis: a for a in score_report(report).for_speaker(A)}
    assert not axes[AXIS_REACTION].measured
    assert axes[AXIS_REACTION].display == "측정 부족"


def test_vision_axes_measured_when_available() -> None:
    report = _report(
        [_u(A, 0, 10_000), _u(B, 10_100, 20_000)],
        vision_counts={"SMILE_STARTED": 12, "GAZE_AWAY_STARTED": 3},
    )
    axes = {a.axis: a for a in score_report(report).for_speaker(A)}
    assert axes[AXIS_REACTION].measured
    assert axes[AXIS_NONVERBAL].measured


def test_vision_axes_unmeasured_below_seventy_percent_coverage() -> None:
    report = _report(
        [_u(A, 0, 10_000), _u(B, 10_100, 20_000)],
        vision_counts={"SMILE_STARTED": 12},
    )
    low_coverage = ReportInput(
        session_id=report.session_id,
        session_duration_ms=report.session_duration_ms,
        speakers=report.speakers,
        vision=tuple(
            VisionInput(
                item.user_id,
                item.available,
                item.behavior_counts,
                0.69,
            )
            for item in report.vision
        ),
        vision_enabled=True,
    )

    axes = {a.axis: a for a in score_report(low_coverage).for_speaker(A)}

    assert not axes[AXIS_REACTION].measured
    assert not axes[AXIS_NONVERBAL].measured


# ── 질문균형 ─────────────────────────────────────────────────────────
def test_question_axis_is_measured_now() -> None:
    """STT가 initial_prompt로 문장부호를 복원하면서 질문 집계가 성립하게 됐다.

    2026-08-06 이전엔 whisper가 짧은 발화에 '?'를 안 붙여 이 축을 통째로 비워 뒀다.
    `stt.pipeline.PUNCTUATION_PROMPT` 실측으로 그 전제가 깨졌다.
    """
    report = _report([_u(A, 0, 10_000), _u(B, 10_100, 20_000)])
    axes = {a.axis: a for a in score_report(report).for_speaker(A)}
    assert axes[AXIS_QUESTION].measured
    assert axes[AXIS_QUESTION].score is not None


def test_question_axis_penalises_both_silence_and_interrogation() -> None:
    """산 모양이다 — 질문이 없어도, 너무 많아도 감점."""

    def score_for(count: int) -> float:
        report = _report([_u(A, 0, 10_000), _u(B, 10_100, 20_000)])
        loaded = ReportInput(
            session_id=report.session_id,
            session_duration_ms=30 * 60 * 1000,
            speakers=tuple(
                SpeakerInput(s.speaker_id, s.utterances, s.speaking_ms, count, s.filler_count)
                for s in report.speakers
            ),
            vision=report.vision,
            vision_enabled=report.vision_enabled,
        )
        axis = {a.axis: a for a in score_report(loaded).for_speaker(A)}[AXIS_QUESTION]
        assert axis.score is not None
        return axis.score

    assert score_for(0) < score_for(16)
    assert score_for(60) < score_for(16)



def test_all_six_axes_present_in_order() -> None:
    report = _report([_u(A, 0, 10_000), _u(B, 10_100, 20_000)])
    assert tuple(a.axis for a in score_report(report).for_speaker(A)) == AXES


# ── 스냅샷 ───────────────────────────────────────────────────────────
def test_build_report_input_snapshots_state() -> None:
    state = SessionState(session_id="s1")
    state.add_utterance(_u(A, 0, 3_000, "안녕하세요"))
    state.add_utterance(_u(B, 3_500, 6_000, "반가워요"))
    speaker = state.speaker(A)
    speaker.filler_count = 3
    speaker.filler_breakdown = {"뭐": 2, "음": 1}
    vision = state.vision_user(A)
    vision.metric_snapshot_count = 10
    vision.usable_snapshot_count = 8
    vision.observation_window_ms = 10_000
    vision.usable_observed_ms = 8_000

    snapshot = build_report_input(state)

    assert snapshot.session_id == "s1"
    assert snapshot.session_duration_ms == 6_000
    assert len(snapshot.all_utterances) == 2
    assert snapshot.all_utterances[0].text == "안녕하세요"
    assert snapshot.speaker(A) is not None
    assert snapshot.speaker(A).filler_breakdown == {"뭐": 2, "음": 1}  # type: ignore[union-attr]
    assert snapshot.vision_for(A) is not None
    assert snapshot.vision_for(A).coverage == 0.8  # type: ignore[union-attr]

    # 스냅샷 이후 state가 바뀌어도 스냅샷은 그대로여야 한다
    state.add_utterance(_u(A, 7_000, 8_000, "나중 발화"))
    assert len(snapshot.all_utterances) == 2


def test_build_report_input_merges_timeline_in_time_order() -> None:
    state = SessionState(session_id="s1")
    state.add_utterance(_u(B, 5_000, 6_000, "두번째"))
    state.add_utterance(_u(A, 0, 1_000, "첫번째"))
    merged = build_report_input(state).all_utterances
    assert [u.text for u in merged] == ["첫번째", "두번째"]

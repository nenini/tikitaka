"""결정적 6축 집계·환산 (S15P11A307-489). **LLM 개입 0.**

여기서 계산한 수치는 리포트의 유일한 정답이다. builder(LLM)는 이 값을 설명만 하고
재계산하지 않으며, 근거 없는 수치를 만들면 schema 단계에서 잘린다.

⚠️ 환산 구간값은 **잠정**이다. 2인 실세션 데이터가 0건이라 문헌·직관 기반으로 잡았고,
실세션을 확보하기 전까지 **검증 불가**하다. 숫자가 있다고 검증된 것으로 읽지 말 것.

⚠️ 설계 문서(부록2)와 다른 점 — 리액션·비언어:
  문서는 '미소 빈도/분', '화면 응시 비율'로 정의했으나 **세션 누적 시간이 상태에 없다.**
  (`low_smile_observed_ms`는 코칭용 작업 변수라 미소가 나오면 0으로 리셋된다.)
  따라서 두 축은 **에피소드 횟수 기반**으로 환산한다. 누적 시간이 상태에 추가되면
  문서 정의대로 되돌릴 것.
"""

from __future__ import annotations

from dataclasses import dataclass

from aggregator.report.input import ReportInput, SpeakerInput, VisionInput
from aggregator.state import Utterance

# ── 축 이름 (AI세션리포트 구성 레이아웃.md 공통 6축) ──────────────────
AXIS_FLOW = "대화흐름"
AXIS_QUESTION = "질문균형"
AXIS_LISTENING = "경청"
AXIS_REACTION = "리액션"
AXIS_BALANCE = "대화균형"
AXIS_NONVERBAL = "비언어표현"
AXES = (AXIS_FLOW, AXIS_QUESTION, AXIS_LISTENING, AXIS_REACTION, AXIS_BALANCE, AXIS_NONVERBAL)

# ── 판정 상수 (전부 잠정) ────────────────────────────────────────────
SILENCE_THRESHOLD_MS = 10_000
"""리포트가 '침묵'으로 세는 발화 간 공백. **실시간 SilenceDetector와 같은 값이어야 한다.**

이전엔 리포트만 15초로 따로 셌다. 그러면 같은 세션에서 실시간 코칭은 12회, 리포트는
7회로 나와 사용자에게 두 숫자가 동시에 노출된다. 실시간 스트림이 기준이고 리포트가
그걸 따른다 — 관제실이 BE로 보내는 피드백이 1차 소스다.

`SilenceDetector()`를 직접 만들어 기본값을 읽지 않는다(감지기 인스턴스를 import 시점에
생성하는 건 부작용이다). 대신 값을 복제하고 `test_report_scoring`이 두 값의 일치를
검증한다 — 어긋나면 테스트가 실패한다. 관제실이 이 값을 config/settings로 올리면
양쪽 다 그걸 가리키게 바꾼다.

레이아웃 문서는 '15초↑ 침묵 횟수'로 적혀 있다. 문서 쪽을 고쳐야 한다.
"""

BACKCHANNEL_MAX_MS = 1_500
"""이보다 짧은 겹침 발화는 맞장구로 보고 말끊기에서 제외한다.
   근거: 2026-07-30 STT 실험 — 짧은 추임새("음", "네")는 whisper가 전사를 못 하거나
   환각을 만든다. 텍스트로는 못 가르고 길이·타이밍으로만 판정할 수 있다."""

SCORE_MIN = 1.0
SCORE_MAX = 5.0


@dataclass(frozen=True)
class AxisScore:
    """한 축의 점수. `measured=False`면 데이터 부족(레이더에서 점선 처리)."""

    axis: str
    score: float | None
    raw: float | None
    measured: bool
    note: str

    @property
    def display(self) -> str:
        return "측정 부족" if not self.measured else f"{self.score:.1f}"


@dataclass(frozen=True)
class SpeakerMetrics:
    """축 계산에 쓰인 원시 지표. LLM 프롬프트에 그대로 넣어 '설명'만 시킨다."""

    speaker_id: str
    speaking_ms: int
    speaking_ratio: float | None
    question_count: int
    filler_count: int
    long_silence_count: int
    interruption_count: int
    backchannel_count: int
    smile_episode_count: int
    gaze_away_count: int
    face_missing_count: int
    vision_measured: bool


@dataclass(frozen=True)
class ReportScores:
    session_id: str
    session_duration_ms: int
    metrics: tuple[SpeakerMetrics, ...]
    axes: dict[str, tuple[AxisScore, ...]]
    """speaker_id → 6축 점수. AXES 순서를 지킨다."""

    def for_speaker(self, speaker_id: str) -> tuple[AxisScore, ...]:
        return self.axes.get(speaker_id, ())


# ── 환산 헬퍼 ────────────────────────────────────────────────────────
def _interpolate(value: float, bands: tuple[tuple[float, float], ...]) -> float:
    """(경계값, 점수) 목록을 값 오름차순으로 받아 구간 내 선형 보간한다.

    정수 대신 연속값을 내는 이유: Gap 밴드의 ±0.8 임계가 정수 스케일에서는 무의미하다
    (정수끼리 빼면 차이도 정수라 1점만 달라도 전부 '격차'가 된다).
    """
    if value <= bands[0][0]:
        return bands[0][1]
    for (low_v, low_s), (high_v, high_s) in zip(bands, bands[1:]):
        if value <= high_v:
            span = high_v - low_v
            if span <= 0:
                return high_s
            ratio = (value - low_v) / span
            return low_s + (high_s - low_s) * ratio
    return bands[-1][1]


def _clamp(score: float) -> float:
    return round(min(max(score, SCORE_MIN), SCORE_MAX), 2)


def _per_30min(count: int, duration_ms: int) -> float:
    """30분 기준으로 정규화. 세션 길이가 달라도 축 점수를 비교할 수 있게 한다."""
    if duration_ms <= 0:
        return float(count)
    return count * (30 * 60 * 1000) / duration_ms


# ── 원시 지표 계산 (batch) ───────────────────────────────────────────
def find_long_silences(
    utterances: tuple[Utterance, ...], threshold_ms: int
) -> tuple[tuple[int, int], ...]:
    """발화 사이 공백이 threshold 이상인 구간 (시작ms, 끝ms).

    실시간 SilenceDetector를 쓰지 않는다 — 그쪽은 코칭용이라 쿨다운이 걸려 있어
    반복 침묵을 한 번만 센다. 리포트는 타임라인 전체를 보므로 직접 세는 편이 정확하다.

    구간을 반환하는 이유: BE의 `evidenceSegments`가 시각을 요구한다(화면에서 타임라인
    핀으로 쓴다). 횟수만 필요하면 len()을 취한다.
    """
    if len(utterances) < 2:
        return ()
    gaps: list[tuple[int, int]] = []
    cursor = utterances[0].end_ms
    for utterance in utterances[1:]:
        if utterance.start_ms - cursor >= threshold_ms:
            gaps.append((cursor, utterance.start_ms))
        cursor = max(cursor, utterance.end_ms)
    return tuple(gaps)


def count_long_silences(utterances: tuple[Utterance, ...], threshold_ms: int) -> int:
    """긴 침묵 횟수. 구간이 필요하면 find_long_silences를 쓴다."""
    return len(find_long_silences(utterances, threshold_ms))


def find_overlaps(
    utterances: tuple[Utterance, ...],
    speaker_id: str,
    *,
    backchannel_max_ms: int = BACKCHANNEL_MAX_MS,
) -> tuple[tuple[tuple[int, int], ...], tuple[tuple[int, int], ...]]:
    """speaker_id가 상대 발화 도중 끼어든 구간을 (말끊기, 맞장구)로 나눠 반환한다.

    말끊기 = 상대가 말하는 중에 내가 발화를 시작했고, 그게 짧은 맞장구가 아닌 경우.
    맞장구 = 겹쳤지만 짧고(<=backchannel_max_ms) **상대가 내 발화 뒤에도 계속 말한** 경우.

    맞장구를 빼지 않으면 "네", "아 진짜요?"가 전부 말끊기로 잡혀 경청 점수가 무너진다.

    구간은 겹침이 시작된 시점부터 내 발화가 끝날 때까지다(BE `evidenceSegments`용).
    """
    interruptions: list[tuple[int, int]] = []
    backchannels: list[tuple[int, int]] = []
    for mine in utterances:
        if mine.speaker_id != speaker_id:
            continue
        for other in utterances:
            if other.speaker_id == speaker_id:
                continue
            started_inside = other.start_ms < mine.start_ms < other.end_ms
            if not started_inside:
                continue
            short = mine.duration_ms <= backchannel_max_ms
            other_kept_talking = other.end_ms > mine.end_ms
            span = (mine.start_ms, mine.end_ms)
            if short and other_kept_talking:
                backchannels.append(span)
            else:
                interruptions.append(span)
            break  # 한 발화는 한 번만 센다
    return tuple(interruptions), tuple(backchannels)


def count_overlaps(
    utterances: tuple[Utterance, ...],
    speaker_id: str,
    *,
    backchannel_max_ms: int = BACKCHANNEL_MAX_MS,
) -> tuple[int, int]:
    """(말끊기, 맞장구) 횟수. 구간이 필요하면 find_overlaps를 쓴다."""
    interruptions, backchannels = find_overlaps(
        utterances, speaker_id, backchannel_max_ms=backchannel_max_ms
    )
    return len(interruptions), len(backchannels)


# ── 축별 환산 ────────────────────────────────────────────────────────
def _score_balance(ratio: float | None) -> AxisScore:
    """대화균형 — 50%에 가까울수록 고점. 양방향이라 중앙 거리로 환산한다."""
    if ratio is None:
        return AxisScore(AXIS_BALANCE, None, None, False, "화자가 2명이 아니라 비율 산출 불가")
    distance = abs(ratio - 0.5)  # 0 = 완벽 균형, 0.5 = 독점
    score = _interpolate(distance, ((0.05, 5.0), (0.10, 4.0), (0.15, 3.0), (0.20, 2.0), (0.50, 1.0)))
    return AxisScore(AXIS_BALANCE, _clamp(score), round(ratio, 3), True, f"발화 비율 {ratio:.1%}")


def _score_flow(silence_count: int, duration_ms: int) -> AxisScore:
    """대화흐름 — 긴 침묵이 적을수록 고점. 임계는 SILENCE_THRESHOLD_MS(실시간과 동일)."""
    normalized = _per_30min(silence_count, duration_ms)
    score = _interpolate(normalized, ((1.0, 5.0), (3.0, 4.0), (5.0, 3.0), (8.0, 2.0), (12.0, 1.0)))
    seconds = SILENCE_THRESHOLD_MS // 1000
    return AxisScore(
        AXIS_FLOW, _clamp(score), round(normalized, 2), True,
        f"{seconds}초 이상 침묵 {silence_count}회",
    )


def _score_listening(interruptions: int, duration_ms: int) -> AxisScore:
    """경청 — 말끊기가 적을수록 고점. 맞장구는 이미 제외됐다."""
    normalized = _per_30min(interruptions, duration_ms)
    score = _interpolate(normalized, ((1.0, 5.0), (3.0, 4.0), (6.0, 3.0), (9.0, 2.0), (14.0, 1.0)))
    return AxisScore(
        AXIS_LISTENING, _clamp(score), round(normalized, 2), True,
        f"말 끊기 {interruptions}회 (맞장구 제외)",
    )


def _score_question() -> AxisScore:
    """질문균형 — 현재 측정 불가.

    QuestionDetector는 '?'와 몇몇 의문 어미로 질문을 가른다. 그런데 whisper large-v3는
    짧은 발화(2~4초)에 문장부호를 붙이지 않는다 — ai/stt/fixtures/audio 6개를 직접
    전사해 확인했고, "취미가 어떻게 되세요?"로 녹음한 클립도 부호 없이 나와 6개 전부
    질문 0건으로 판정됐다.

    부호가 없으면 한국어 의문문은 평서문과 텍스트가 같다("커피 자주 드세요"(질문) vs
    "한번 해보세요"(권유)). 어미 규칙을 넓히면 평서문이 질문으로 잡혀 점수가 최고점으로
    부풀고, 좁히면 모든 세션이 최저점으로 깔린다. 둘 다 틀린 점수라 빈 점수로 둔다.

    되살리는 조건: STT가 부호를 복원하거나(initial_prompt 등) 의도 분류기가 들어올 때.
    """
    return AxisScore(AXIS_QUESTION, None, None, False, "STT 문장부호 미제공으로 측정 부족")


def _score_reaction(vision: VisionInput | None, backchannels: int, duration_ms: int) -> AxisScore:
    """리액션 — 미소 에피소드 + 말맞장구. vision 없으면 맞장구만으로는 판정하지 않는다."""
    if vision is None or not vision.available:
        return AxisScore(AXIS_REACTION, None, None, False, "vision 미수신 — 측정 부족")
    smiles = vision.count("SMILE_STARTED")
    normalized = _per_30min(smiles + backchannels, duration_ms)
    score = _interpolate(normalized, ((2.0, 1.0), (5.0, 2.0), (10.0, 3.0), (18.0, 4.0), (30.0, 5.0)))
    return AxisScore(
        AXIS_REACTION, _clamp(score), round(normalized, 2), True,
        f"미소와 맞장구 총 {smiles + backchannels}회",
    )


def _score_nonverbal(vision: VisionInput | None, duration_ms: int) -> AxisScore:
    """비언어표현 — 시선 이탈·얼굴 이탈이 적을수록 고점.

    문서 정의는 '화면 응시 비율'이지만 누적 시간이 상태에 없어 **횟수**로 대신한다.
    """
    if vision is None or not vision.available:
        return AxisScore(AXIS_NONVERBAL, None, None, False, "vision 미수신 — 측정 부족")
    away = vision.count("GAZE_AWAY_STARTED") + vision.count("FACE_MISSING_STARTED")
    normalized = _per_30min(away, duration_ms)
    score = _interpolate(normalized, ((2.0, 5.0), (5.0, 4.0), (9.0, 3.0), (14.0, 2.0), (20.0, 1.0)))
    return AxisScore(
        AXIS_NONVERBAL, _clamp(score), round(normalized, 2), True,
        f"시선 또는 얼굴 이탈 {away}회",
    )


def _metrics_for(
    report: ReportInput, speaker: SpeakerInput, timeline: tuple[Utterance, ...]
) -> tuple[SpeakerMetrics, int]:
    interruptions, backchannels = count_overlaps(timeline, speaker.speaker_id)
    vision = report.vision_for(speaker.speaker_id)
    vision_measured = report.vision_enabled and vision is not None and vision.available
    metrics = SpeakerMetrics(
        speaker_id=speaker.speaker_id,
        speaking_ms=speaker.speaking_ms,
        speaking_ratio=_ratio(report, speaker.speaker_id),
        question_count=speaker.question_count,
        filler_count=speaker.filler_count,
        long_silence_count=count_long_silences(timeline, SILENCE_THRESHOLD_MS),
        interruption_count=interruptions,
        backchannel_count=backchannels,
        smile_episode_count=vision.count("SMILE_STARTED") if vision else 0,
        gaze_away_count=vision.count("GAZE_AWAY_STARTED") if vision else 0,
        face_missing_count=vision.count("FACE_MISSING_STARTED") if vision else 0,
        vision_measured=vision_measured,
    )
    return metrics, backchannels


def _ratio(report: ReportInput, speaker_id: str) -> float | None:
    total = sum(s.speaking_ms for s in report.speakers)
    if total == 0 or len(report.speakers) < 2:
        return None
    target = report.speaker(speaker_id)
    return round(target.speaking_ms / total, 3) if target else None


def score_report(report: ReportInput) -> ReportScores:
    """ReportInput → 화자별 6축 점수 + 원시 지표. 여기서 나온 수치가 리포트의 정답이다."""
    timeline = report.all_utterances
    duration = report.session_duration_ms
    metrics: list[SpeakerMetrics] = []
    axes: dict[str, tuple[AxisScore, ...]] = {}

    for speaker in report.speakers:
        speaker_metrics, backchannels = _metrics_for(report, speaker, timeline)
        metrics.append(speaker_metrics)
        vision = report.vision_for(speaker.speaker_id) if report.vision_enabled else None
        axes[speaker.speaker_id] = (
            _score_flow(speaker_metrics.long_silence_count, duration),
            _score_question(),
            _score_listening(speaker_metrics.interruption_count, duration),
            _score_reaction(vision, backchannels, duration),
            _score_balance(speaker_metrics.speaking_ratio),
            _score_nonverbal(vision, duration),
        )

    return ReportScores(
        session_id=report.session_id,
        session_duration_ms=duration,
        metrics=tuple(metrics),
        axes=axes,
    )

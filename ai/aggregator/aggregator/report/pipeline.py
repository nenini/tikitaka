"""세션 종료 → 리포트 생성 → BE 발행 (S15P11A307-494).

관제실은 `run_report_job()` 하나만 호출하면 된다. 그 안에서 순서를 지킨다.

  ① 수치 계산(코드) → ②번 API보다 먼저 analyses를 보낸다
  ② LLM 문장 생성 → 실패하면 규칙 기반 폴백
  ③ 유저별로 reports/results 발행

관제실 요청(2026-08-03): **세션 종료 요청 안에서 await하지 말 것.**
`build_report_input()`으로 스냅샷만 즉시 복사한 뒤 이 작업을 큐에 넣고 PROCESSED로 응답한다.
스냅샷을 먼저 뜨는 이유는 그 뒤로 SessionState가 어떻게 되든 리포트가 영향받지 않게 하려는 것이다.

실패 처리 원칙: **FAILED도 반드시 BE에 보낸다.** 안 보내면 프론트가 PENDING에 머문다.
"""

from __future__ import annotations

import asyncio
import logging

from aggregator.report.builder import (
    ReportLlmError,
    ReportNarrative,
    TextGenerator,
    build_narrative,
    fallback_narrative,
)
from aggregator.report.input import ReportInput
from aggregator.report.publish import ReportPublisher, ReportPublishError
from aggregator.report.schema import (
    analysis_failure_payload,
    analysis_idempotency_key,
    build_analysis_payload,
    build_report_payload,
    report_failure_payload,
    report_idempotency_key,
)
from aggregator.report.scoring import ReportScores, score_report

logger = logging.getLogger(__name__)

# BE 확정 목록(2026-08-04): INSUFFICIENT_ANALYSIS_DATA · LLM_UNAVAILABLE · NO_UTTERANCE
# · SESSION_TOO_SHORT · INTERNAL_ERROR · ANALYSIS_FAILED.
# 그중 AI가 실제로 내보내는 건 아래 둘뿐이다. LLM_UNAVAILABLE은 쓰지 않는다 —
# 문장 생성이 실패하면 규칙 기반으로 내려가 FALLBACK이 되지 FAILED가 되지 않는다.
FAILURE_NO_UTTERANCE = "NO_UTTERANCE"
FAILURE_UNEXPECTED = "ANALYSIS_FAILED"


async def run_report_job(
    report: ReportInput,
    *,
    session_id: int,
    user_ids: dict[str, int],
    analyzed_at: str,
    publisher: ReportPublisher,
    generator: TextGenerator | None,
    include_quotes: bool = False,
) -> None:
    """리포트 한 세션분을 만들어 BE에 보낸다. 예외를 밖으로 던지지 않는다.

    백그라운드 작업이라 위로 던져도 받을 데가 없다. 대신 전부 로그로 남기고,
    사용자에게 영향이 가는 실패(리포트 미생성)는 BE에 FAILED로 통지한다.

    generator=None이면 LLM을 쓰지 않고 규칙 기반으로만 만든다(설정 미비 등).
    """
    if not report.all_utterances:
        logger.warning("리포트 생략 session=%s reason=발화 없음", session_id)
        await _notify_failure(
            publisher,
            session_id=session_id,
            user_ids=list(user_ids.values()),
            generated_at=analyzed_at,
            code=FAILURE_NO_UTTERANCE,
            reason="유효한 발화가 없어 리포트를 생성하지 못했습니다.",
        )
        return

    try:
        scores = score_report(report)
    except Exception:  # noqa: BLE001 — 수치 계산 실패는 원인이 다양하고 여기서 끊어야 한다
        logger.exception("리포트 수치 계산 실패 session=%s", session_id)
        await _notify_failure(
            publisher,
            session_id=session_id,
            user_ids=list(user_ids.values()),
            generated_at=analyzed_at,
            code=FAILURE_UNEXPECTED,
            reason="세션 분석 중 오류가 발생해 리포트를 생성하지 못했습니다.",
        )
        return

    # ① 객관 지표 먼저. 이게 저장돼 있으면 나중에 문장만 다시 만들 수 있다.
    analysis = build_analysis_payload(
        report,
        scores,
        session_id=session_id,
        user_ids=user_ids,
        analyzed_at=analyzed_at,
    )
    try:
        duplicate = await publisher.publish_analysis(
            analysis, idempotency_key=analysis_idempotency_key(session_id)
        )
        logger.info("분석 발행 session=%s duplicate=%s", session_id, duplicate)
    except ReportPublishError:
        # 수치 저장에 실패해도 문장은 계속 만든다 — 사용자 화면이 우선이다.
        logger.exception("분석 발행 실패 session=%s", session_id)

    # ② 참가자 전원의 문장을 만들어 **한 번에** 보낸다(BE 계약 2026-08-04).
    narratives: list[tuple[int, ReportNarrative]] = []
    for speaker_id, user_id in user_ids.items():
        if report.speaker(speaker_id) is None:
            continue
        narratives.append(
            (
                user_id,
                await _narrate(
                    report,
                    scores,
                    speaker_id=speaker_id,
                    user_id=user_id,
                    session_id=session_id,
                    generator=generator,
                    include_quotes=include_quotes,
                ),
            )
        )
    if not narratives:
        logger.warning("리포트 생략 session=%s reason=대상 화자 없음", session_id)
        return

    payload = build_report_payload(
        narratives, session_id=session_id, generated_at=analyzed_at
    )
    try:
        accepted = await publisher.publish_report(
            payload, idempotency_key=report_idempotency_key(session_id)
        )
        logger.info(
            "리포트 발행 session=%s accepted=%d users=%s",
            session_id,
            accepted,
            [user_id for user_id, _ in narratives],
        )
    except ReportPublishError:
        logger.exception("리포트 발행 실패 session=%s", session_id)


async def _narrate(
    report: ReportInput,
    scores: ReportScores,
    *,
    speaker_id: str,
    user_id: int,
    session_id: int,
    generator: TextGenerator | None,
    include_quotes: bool,
) -> ReportNarrative:
    try:
        if generator is None:
            return fallback_narrative(scores, speaker_id)
        # build_narrative는 LLM 실패를 스스로 폴백으로 흡수한다
        return await asyncio.to_thread(
            build_narrative,
            report,
            scores,
            speaker_id,
            generator,
            include_quotes=include_quotes,
        )
    except ReportLlmError:
        logger.exception("문장 생성 실패 session=%s user=%s", session_id, user_id)
        return fallback_narrative(scores, speaker_id)


async def _notify_failure(
    publisher: ReportPublisher,
    *,
    session_id: int,
    user_ids: list[int],
    generated_at: str,
    code: str,
    reason: str,
) -> None:
    """리포트를 못 만들었다고 BE에 알린다. 이걸 빼면 프론트가 PENDING에 갇힌다.

    **두 API 모두에 보낸다.** reports에만 보내면 analyses 쪽 레코드가 영영 안 생겨
    BE가 "분석 대기 중"으로 남는다.
    """
    analysis = analysis_failure_payload(
        session_id=session_id, user_ids=user_ids, analyzed_at=generated_at
    )
    try:
        await publisher.publish_analysis(
            analysis, idempotency_key=analysis_idempotency_key(session_id)
        )
    except ReportPublishError:
        logger.exception("분석 FAILED 통지 실패 session=%s", session_id)

    payload = report_failure_payload(
        session_id=session_id,
        user_ids=user_ids,
        generated_at=generated_at,
        failure_code=code,
        failure_reason=reason,
    )
    try:
        await publisher.publish_report(
            payload, idempotency_key=report_idempotency_key(session_id)
        )
    except ReportPublishError:
        logger.exception("FAILED 통지 실패 session=%s", session_id)

"""리포트 → BE 통신 시험 (LiveKit·실세션 없이 **실제 POST**).

FE가 `POST /api/v1/sessions/{id}/report`를 부르면 BE는 리포트 레코드를 GENERATING으로
만든다. 그게 COMPLETED가 되려면 **AI가 그 세션의 리포트를 BE 내부 엔드포인트로 POST**해야 한다:
    POST {BACKEND_BASE_URL}/internal/v1/session-analyses        (X-Internal-Token)
    POST {BACKEND_BASE_URL}/internal/v1/session-reports/results (X-Internal-Token, Idempotency-Key)

이 스크립트는 샘플 대화로 ReportInput을 만들어 **진짜 ReportPublisher**로 `run_report_job`을
호출한다. 즉 실제 BE로 POST가 나가고, 인증/계약/수용 여부가 그대로 드러난다.

사용:
    # .env 또는 export 로 아래 준비 (JWT 아님 — 내부 토큰)
    #   BACKEND_BASE_URL=http://localhost:8080
    #   AI_SESSION_INTERNAL_TOKEN=<BE와 동일한 내부 토큰>
    #   REPORT_LLM_BASE_URL=http://127.0.0.1:11434   (없으면 규칙기반 폴백)
    uv run python -m aggregator.report_be_check --session-id 1 --user-id 1
    uv run python -m aggregator.report_be_check --session-id 1 --user-id 1 --peer-user-id 2
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from itertools import count

from aggregator.report.builder import OllamaGenerator
from aggregator.report.input import ReportInput, SpeakerInput, VisionInput
from aggregator.report.pipeline import run_report_job
from aggregator.report.publish import ReportPublisher
from aggregator.settings import IntegrationSettings
from aggregator.state import Utterance

_SEQ = count(1)

_A = "user-a"
_B = "user-b"


def _u(speaker: str, start_ms: int, end_ms: int, text: str) -> Utterance:
    seq = next(_SEQ)
    return Utterance(
        event_id=f"evt-{seq}",
        utterance_id=f"utt-{seq}",
        session_id="be-check",
        user_id=speaker,
        participant_identity=f"identity-{speaker}",
        client_instance_id="11111111-1111-4111-8111-111111111111",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at="2026-08-04T17:00:00+09:00",
    )


def _sample_report(session_id: str) -> ReportInput:
    mine = (
        _u(_A, 0, 8_000, "안녕하세요 만나서 반가워요"),
        _u(_A, 20_000, 30_000, "저는 주말에 주로 운동을 해요"),
    )
    yours = (_u(_B, 9_000, 18_000, "저도 반가워요 저는 영화를 좋아해요"),)
    return ReportInput(
        session_id=session_id,
        session_duration_ms=30 * 60 * 1000,
        speakers=(
            SpeakerInput(_A, mine, sum(u.duration_ms for u in mine), 2, 4, {"뭐": 3}),
            SpeakerInput(_B, yours, sum(u.duration_ms for u in yours), 1, 1),
        ),
        vision=(
            VisionInput(_A, True, {"SMILE_STARTED": 6, "GAZE_AWAY_STARTED": 2}, 0.9, 30 * 60 * 1000),
            VisionInput(_B, True, {"SMILE_STARTED": 3}, 0.8, 30 * 60 * 1000),
        ),
        vision_enabled=True,
    )


async def _run(args: argparse.Namespace) -> None:
    settings = IntegrationSettings.from_env()
    if not settings.backend_configured:
        raise SystemExit(
            "BACKEND_BASE_URL·AI_SESSION_INTERNAL_TOKEN 이 필요합니다(.env 또는 export)."
        )

    report = _sample_report(str(args.session_id))
    user_ids = {_A: args.user_id}
    if args.peer_user_id is not None:
        user_ids[_B] = args.peer_user_id

    generator = None
    if settings.report_llm_configured:
        generator = OllamaGenerator(
            base_url=settings.report_llm_base_url,
            model=settings.report_llm_model,
            timeout_seconds=settings.report_llm_timeout_seconds,
        )

    publisher = ReportPublisher(settings)
    analyzed_at = datetime.now(timezone(timedelta(hours=9))).isoformat()
    print(
        f"→ BE({settings.backend_base_url}) 로 실제 POST "
        f"session={args.session_id} users={user_ids} "
        f"llm={'EXAONE' if generator else '규칙기반 폴백'}"
    )
    try:
        await run_report_job(
            report,
            session_id=args.session_id,
            user_ids=user_ids,
            analyzed_at=analyzed_at,
            publisher=publisher,
            generator=generator,
        )
    finally:
        await publisher.close()
    print(
        "\n완료. 위 로그의 '분석 발행'·'리포트 발행' 줄에서 성공(accepted)/중복(duplicate)/"
        "실패를 확인하세요. BE에서 해당 세션 리포트 status가 COMPLETED 로 바뀌면 통신 성공."
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="리포트 → BE 통신 시험")
    parser.add_argument("--session-id", type=int, required=True, help="종료된 세션 ID(BE)")
    parser.add_argument("--user-id", type=int, required=True, help="본인(A) BE userId")
    parser.add_argument("--peer-user-id", type=int, default=None, help="상대(B) BE userId(선택)")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()

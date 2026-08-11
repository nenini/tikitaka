"""BE 발행·파이프라인 검증 (S15P11A307-494) — 네트워크 없이 가짜 HTTP로.

핵심 관심사는 "BE가 죽거나 느려도 리포트 경로가 조용히 사라지지 않는가"다.
특히 FAILED 콜백은 빠지면 프론트가 PENDING 화면에 갇힌다.
"""

from __future__ import annotations

import asyncio
from itertools import count

import httpx
import pytest

from aggregator.report.builder import ReportLlmError, ReportNarrative
from aggregator.report.input import ReportInput, SpeakerInput, VisionInput
from aggregator.report.pipeline import run_report_job
from aggregator.report.publish import (
    ANALYSES_PATH,
    REPORT_RESULTS_PATH,
    ReportPublisher,
    ReportPublishError,
)
from aggregator.settings import IntegrationSettings
from aggregator.state import Utterance

A = "user-a"
B = "user-b"
IDS = {A: 1001, B: 1002}
AT = "2026-08-03T17:00:00+09:00"

_SEQ = count(1)


def _settings(**overrides: object) -> IntegrationSettings:
    base: dict[str, object] = {
        "internal_token": "tok",
        "backend_base_url": "http://be.test",
        "backend_max_attempts": 3,
        "backend_retry_delay_seconds": 0.0,
        "report_llm_base_url": "http://llm.test",
    }
    base.update(overrides)
    return IntegrationSettings(**base)  # type: ignore[arg-type]


class _Recorder:
    """요청을 기록하고 정해둔 응답을 돌려준다."""

    def __init__(self, *responses: httpx.Response) -> None:
        self._responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if len(self._responses) > 1:
            return self._responses.pop(0)
        return self._responses[0]


def _publisher(recorder: _Recorder, **overrides: object) -> ReportPublisher:
    transport = httpx.MockTransport(recorder)
    return ReportPublisher(
        _settings(**overrides),
        http_client=httpx.AsyncClient(transport=transport),
        sleep=_no_sleep,
    )


async def _no_sleep(_seconds: float) -> None:
    return None


def _ok(**data: object) -> httpx.Response:
    return httpx.Response(200, json={"success": True, "data": data})


# ── 발행 기본 ────────────────────────────────────────────────────────
def test_analysis_sends_token_and_idempotency_key() -> None:
    async def scenario() -> None:
        recorder = _Recorder(_ok(duplicate=False))
        publisher = _publisher(recorder)
        await publisher.publish_analysis({"a": 1}, idempotency_key="key-1")
        request = recorder.requests[0]
        assert request.url.path == ANALYSES_PATH
        assert request.headers["X-Internal-Token"] == "tok"
        assert request.headers["Idempotency-Key"] == "key-1"
        await publisher.close()

    asyncio.run(scenario())


def test_duplicate_flag_is_returned() -> None:
    async def scenario() -> None:
        recorder = _Recorder(_ok(duplicate=True))
        publisher = _publisher(recorder)
        assert await publisher.publish_analysis({}, idempotency_key="k") is True
        await publisher.close()

    asyncio.run(scenario())


def test_report_returns_accepted_count() -> None:
    async def scenario() -> None:
        recorder = _Recorder(_ok(acceptedCount=1))
        publisher = _publisher(recorder)
        assert await publisher.publish_report({}, idempotency_key="k") == 1
        assert recorder.requests[0].url.path == REPORT_RESULTS_PATH
        await publisher.close()

    asyncio.run(scenario())


# ── 재시도 ───────────────────────────────────────────────────────────
def test_retries_on_server_error_then_succeeds() -> None:
    async def scenario() -> None:
        recorder = _Recorder(httpx.Response(503), _ok(duplicate=False))
        publisher = _publisher(recorder)
        await publisher.publish_analysis({}, idempotency_key="same-key")
        assert len(recorder.requests) == 2
        # 재시도에도 같은 멱등키를 유지해야 BE가 중복으로 걸러낸다
        assert {r.headers["Idempotency-Key"] for r in recorder.requests} == {"same-key"}
        await publisher.close()

    asyncio.run(scenario())


def test_does_not_retry_client_error() -> None:
    """4xx는 우리 요청이 틀린 것이라 다시 보내도 같다."""
    async def scenario() -> None:
        recorder = _Recorder(httpx.Response(400))
        publisher = _publisher(recorder)
        with pytest.raises(ReportPublishError):
            await publisher.publish_analysis({}, idempotency_key="k")
        assert len(recorder.requests) == 1
        await publisher.close()

    asyncio.run(scenario())


def test_retries_on_conflict_while_backend_prepares_the_row() -> None:
    """409(REPORT_NOT_PREPARED)는 요청이 틀린 게 아니라 순서가 이른 것이다.

    BE 는 세션 종료 이벤트를 받고 리포트 행을 먼저 만든다. 그 준비 전에 우리 POST 가
    도착하면 409 다. 재시도하지 않으면 그 세션의 리포트 문장이 영구히 사라진다.
    """
    async def scenario() -> None:
        recorder = _Recorder(
            httpx.Response(409, json={"success": False, "code": "REPORT_NOT_PREPARED"}),
            _ok(duplicate=False),
        )
        publisher = _publisher(recorder)
        await publisher.publish_report({}, idempotency_key="same-key")
        assert len(recorder.requests) == 2
        assert {r.headers["Idempotency-Key"] for r in recorder.requests} == {"same-key"}
        await publisher.close()

    asyncio.run(scenario())


def test_does_not_retry_permanent_conflicts() -> None:
    """같은 버전에 다른 내용이 저장돼 있다는 409는 다시 보내도 같은 답이다.

    전부 재시도하면 영구 실패가 지연 실패로 바뀔 뿐이다.
    """
    async def scenario() -> None:
        for code in ("ANALYSIS_IDEMPOTENCY_CONFLICT", "REPORT_RESULT_CONFLICT"):
            recorder = _Recorder(httpx.Response(409, json={"success": False, "code": code}))
            publisher = _publisher(recorder)
            with pytest.raises(ReportPublishError):
                await publisher.publish_analysis({}, idempotency_key="k")
            assert len(recorder.requests) == 1, code
            await publisher.close()

    asyncio.run(scenario())


def test_gives_up_after_max_attempts() -> None:
    async def scenario() -> None:
        recorder = _Recorder(httpx.Response(500))
        publisher = _publisher(recorder)
        with pytest.raises(ReportPublishError):
            await publisher.publish_analysis({}, idempotency_key="k")
        assert len(recorder.requests) == 3
        await publisher.close()

    asyncio.run(scenario())


def test_rejects_unsuccessful_envelope() -> None:
    async def scenario() -> None:
        recorder = _Recorder(httpx.Response(200, json={"success": False}))
        publisher = _publisher(recorder)
        with pytest.raises(ReportPublishError):
            await publisher.publish_analysis({}, idempotency_key="k")
        await publisher.close()

    asyncio.run(scenario())


def test_requires_backend_configuration() -> None:
    async def scenario() -> None:
        publisher = ReportPublisher(_settings(backend_base_url=""), sleep=_no_sleep)
        with pytest.raises(ReportPublishError):
            await publisher.publish_analysis({}, idempotency_key="k")
        await publisher.close()

    asyncio.run(scenario())


# ── 파이프라인 ───────────────────────────────────────────────────────
def _u(speaker: str, start_ms: int, end_ms: int) -> Utterance:
    seq = next(_SEQ)
    return Utterance(
        event_id=f"evt-{seq}", utterance_id=f"utt-{seq}", session_id="s1",
        user_id=speaker, participant_identity=f"identity-{speaker}",
        client_instance_id="11111111-1111-4111-8111-111111111111", seq=seq,
        start_ms=start_ms, end_ms=end_ms, text="발화", confidence=0.9,
        language="ko", occurred_at=AT,
    )


def _report(*, empty: bool = False) -> ReportInput:
    if empty:
        return ReportInput("s1", 0, (), (), True)
    mine = (_u(A, 0, 10_000),)
    yours = (_u(B, 12_000, 20_000),)
    return ReportInput(
        session_id="s1",
        session_duration_ms=24 * 60 * 1000,
        speakers=(
            SpeakerInput(A, mine, 10_000, 0, 3),
            SpeakerInput(B, yours, 8_000, 0, 1),
        ),
        vision=(VisionInput(A, True, {"SMILE_STARTED": 2}, 1.0),
                VisionInput(B, True, {}, 1.0)),
        vision_enabled=True,
    )


class _FakeLlm:
    def generate(self, prompt: str) -> str:
        return (
            '{"summary": "요약", "strengths": ["잘함"], "improvements": ["개선"],'
            ' "missions": ["미션"], "cards": []}'
        )


class _DeadLlm:
    def generate(self, prompt: str) -> str:
        raise ReportLlmError("서버 다운")


def _paths(recorder: _Recorder) -> list[str]:
    return [r.url.path for r in recorder.requests]


def test_job_sends_analysis_then_one_report_per_user() -> None:
    async def scenario() -> None:
        recorder = _Recorder(_ok(duplicate=False, acceptedCount=1))
        publisher = _publisher(recorder)
        await run_report_job(
            _report(), session_id=1, user_ids=IDS, analyzed_at=AT,
            publisher=publisher, generator=_FakeLlm(),
        )
        assert _paths(recorder) == [ANALYSES_PATH, REPORT_RESULTS_PATH]
        await publisher.close()

    asyncio.run(scenario())


def test_job_reports_failed_when_no_utterance() -> None:
    """발화가 없으면 FAILED를 보내야 프론트가 PENDING에서 빠져나온다."""
    async def scenario() -> None:
        recorder = _Recorder(_ok(acceptedCount=1))
        publisher = _publisher(recorder)
        await run_report_job(
            _report(empty=True), session_id=1, user_ids=IDS, analyzed_at=AT,
            publisher=publisher, generator=_FakeLlm(),
        )
        # 두 API 모두에 알려야 한다. reports에만 보내면 analyses 레코드가 안 생겨
        # BE가 "분석 대기 중"으로 남는다.
        assert _paths(recorder) == [ANALYSES_PATH, REPORT_RESULTS_PATH]
        analysis, reports = recorder.requests
        assert b"FAILED" in analysis.content
        assert b"NO_UTTERANCE" in reports.content
        # 실패해도 참가자 전원이 배열에 담겨야 한다
        assert reports.content.count(b'"userId"') == 2
        await publisher.close()

    asyncio.run(scenario())


def test_job_falls_back_when_llm_dead() -> None:
    """LLM이 죽어도 리포트는 나간다 — RULE_BASED로."""
    async def scenario() -> None:
        recorder = _Recorder(_ok(duplicate=False, acceptedCount=1))
        publisher = _publisher(recorder)
        await run_report_job(
            _report(), session_id=1, user_ids=IDS, analyzed_at=AT,
            publisher=publisher, generator=_DeadLlm(),
        )
        reports = [r for r in recorder.requests if r.url.path == REPORT_RESULTS_PATH]
        assert reports
        for request in reports:
            assert b"RULE_BASED" in request.content
        await publisher.close()

    asyncio.run(scenario())


def test_job_continues_when_analysis_publish_fails() -> None:
    """수치 저장이 실패해도 사용자 화면용 문장은 보낸다."""
    async def scenario() -> None:
        recorder = _Recorder(httpx.Response(500), httpx.Response(500), httpx.Response(500),
                             _ok(acceptedCount=1))
        publisher = _publisher(recorder)
        await run_report_job(
            _report(), session_id=1, user_ids=IDS, analyzed_at=AT,
            publisher=publisher, generator=_FakeLlm(),
        )
        assert REPORT_RESULTS_PATH in _paths(recorder)
        await publisher.close()

    asyncio.run(scenario())


def test_job_never_raises_even_when_backend_is_down() -> None:
    """백그라운드 작업이라 예외를 던지면 받을 데가 없다."""
    async def scenario() -> None:
        recorder = _Recorder(httpx.Response(500))
        publisher = _publisher(recorder)
        await run_report_job(
            _report(), session_id=1, user_ids=IDS, analyzed_at=AT,
            publisher=publisher, generator=_FakeLlm(),
        )
        await publisher.close()

    asyncio.run(scenario())


def test_job_uses_rule_based_when_generator_missing() -> None:
    async def scenario() -> None:
        recorder = _Recorder(_ok(duplicate=False, acceptedCount=1))
        publisher = _publisher(recorder)
        await run_report_job(
            _report(), session_id=1, user_ids=IDS, analyzed_at=AT,
            publisher=publisher, generator=None,
        )
        reports = [r for r in recorder.requests if r.url.path == REPORT_RESULTS_PATH]
        for request in reports:
            assert b"RULE_BASED" in request.content
        await publisher.close()

    asyncio.run(scenario())


def test_narrative_status_mapping_is_covered() -> None:
    """build_report_payload가 두 상태를 구분하는지는 schema 테스트가 본다."""
    assert ReportNarrative("s", (), (), (), (), True).generated_by_llm

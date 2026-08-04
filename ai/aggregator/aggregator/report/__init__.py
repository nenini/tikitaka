"""사후 세션 리포트 — 세션 종료 시 in-memory SessionState로 1회 생성.

실시간 아님. 통제실이 세션 내내 쌓아둔 원문·타임라인을 종료 시점에 batch로 읽어
결정적 집계(scoring) → LLM 문장 생성(builder) → 검증(schema) → 발행(publish) 순으로 처리한다.

역할 분리가 핵심이다:
  scoring.py  모든 **수치**를 코드가 계산한다. LLM은 재계산하지 않는다.
  builder.py  이미 계산된 수치를 **설명하는 문장**만 LLM이 만든다.

호출하는 쪽(관제실)이 알아야 하는 건 두 개뿐이다.
  build_report_input(state)  세션 종료 시 스냅샷을 뜬다 — 여기까지는 즉시 끝난다.
  run_report_job(...)        나머지 전부. 10초쯤 걸리므로 작업 큐에서 돌린다.
"""

from aggregator.report.builder import generator_from_settings
from aggregator.report.input import ReportInput, SpeakerInput, VisionInput, build_report_input
from aggregator.report.pipeline import run_report_job
from aggregator.report.publish import ReportPublisher, ReportPublishError
from aggregator.report.schema import ANALYSIS_VERSION, REPORT_VERSION
from aggregator.report.scoring import (
    AxisScore,
    ReportScores,
    SpeakerMetrics,
    score_report,
)

__all__ = [
    "ANALYSIS_VERSION",
    "AxisScore",
    "ReportInput",
    "ReportPublishError",
    "ReportPublisher",
    "ReportScores",
    "REPORT_VERSION",
    "SpeakerInput",
    "SpeakerMetrics",
    "VisionInput",
    "build_report_input",
    "generator_from_settings",
    "run_report_job",
    "score_report",
]

"""The offline demo must use the same production rules as the MVP engine."""

from __future__ import annotations

import pytest

from aggregator.coaching import CoachingCommand
from aggregator.events import AnalysisEvent
from aggregator.offline_demo import run


@pytest.mark.parametrize(
    ("scenario", "expected_types"),
    [
        ("normal", []),
        ("camera", ["VISION_SETUP_GUIDANCE"]),
        ("attention", ["ATTENTION_RECOVERY"]),
        ("silence", ["SILENCE_RECOVERY"]),
        ("response", ["RESPONSE_PROMPT"]),
        ("reaction", ["REACTION_PROMPT"]),
    ],
)
def test_offline_scenario_emits_expected_coaching(
    scenario: str,
    expected_types: list[str],
) -> None:
    analysis: list[AnalysisEvent] = []
    coaching: list[CoachingCommand] = []

    run(
        scenario,
        on_analysis=analysis.append,
        on_coaching=coaching.append,
    )

    assert [command.coaching_type for command in coaching] == expected_types

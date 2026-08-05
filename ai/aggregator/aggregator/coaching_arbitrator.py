"""Choose at most one coaching candidate per target and decision cycle."""

from __future__ import annotations

from aggregator.coaching_candidates import CoachingCandidate

_MVP_TYPE_RANK = {
    "VISION_SETUP_GUIDANCE": 0,
    "RESPONSE_PROMPT": 1,
    "ATTENTION_RECOVERY": 2,
    "SILENCE_RECOVERY": 3,
    "REACTION_PROMPT": 4,
    "EXPRESSION_GUIDANCE": 5,
}


class CoachingArbitrator:
    """Apply the agreed MVP priority without mixing detector concerns."""

    def select(
        self,
        candidates: list[CoachingCandidate],
    ) -> list[CoachingCandidate]:
        selected: dict[str, CoachingCandidate] = {}
        for candidate in candidates:
            target = candidate.target_user_id or "session"
            previous = selected.get(target)
            if previous is None or self._rank(candidate) < self._rank(previous):
                selected[target] = candidate
        return list(selected.values())

    @staticmethod
    def _rank(candidate: CoachingCandidate) -> int:
        return _MVP_TYPE_RANK.get(candidate.coaching_type, 999)

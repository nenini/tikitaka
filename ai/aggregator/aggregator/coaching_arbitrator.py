"""Choose at most one coaching candidate per target and decision cycle."""

from __future__ import annotations

from aggregator.coaching_candidates import CoachingCandidate

_MVP_TYPE_RANK = {
    "VISION_SETUP_GUIDANCE": 0,
    # 안 들리면 대화 자체가 성립하지 않는다. 카메라 문제 바로 다음으로 급하고,
    # 실측 dBFS 라 다른 규칙보다 근거도 확실하다.
    "VOLUME_GUIDANCE": 1,
    "RESPONSE_PROMPT": 2,
    "ATTENTION_RECOVERY": 3,
    "SILENCE_RECOVERY": 4,
    "REACTION_PROMPT": 5,
    "EXPRESSION_GUIDANCE": 6,
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

    def ranked(
        self,
        candidates: list[CoachingCandidate],
    ) -> dict[str, list[CoachingCandidate]]:
        """타깃별 후보를 우선순위 오름차순으로 묶어 돌려준다.

        `select()` 처럼 1등만 남기면 안 되는 이유가 있다. 정책(중복·쿨다운·상한)은
        중재 **뒤에** 도는데, 정책이 확실히 거부할 후보가 1등이면 그 타깃은 이번
        사이클에 아무것도 못 받는다. 실제로 질문 뒤 상대가 끝내 답을 안 하면
        RESPONSE_PROMPT(랭크 1) 후보가 매 tick 다시 생성되면서 SILENCE_RECOVERY
        (랭크 3)를 세션 내내 굶겼다. 호출부가 순서대로 시도하도록 목록을 준다.
        """
        grouped: dict[str, list[CoachingCandidate]] = {}
        for candidate in candidates:
            target = candidate.target_user_id or "session"
            grouped.setdefault(target, []).append(candidate)
        return {
            target: sorted(items, key=self._rank)
            for target, items in grouped.items()
        }

    @staticmethod
    def _rank(candidate: CoachingCandidate) -> int:
        return _MVP_TYPE_RANK.get(candidate.coaching_type, 999)

from __future__ import annotations

import torch

from face_analysis.inference import (
    AnalysisStatus,
    PredictionPolicy,
    result_from_probabilities,
    retake_required_result,
    skipped_result,
)


def test_uncertain_still_returns_one_suggestion() -> None:
    result = result_from_probabilities(
        torch.tensor([0.22, 0.20, 0.12, 0.1, 0.09, 0.08, 0.07, 0.06, 0.06]),
        "female",
    )
    assert result.status is AnalysisStatus.UNCERTAIN
    assert len(result.suggestions) == 1
    assert result.suggestions[0].face_type == "dog"
    assert result.suggestions[0].relative_score == 0.22


def test_group_centered_facenet_policy_uses_calibrated_relative_score_scale() -> None:
    policy = PredictionPolicy()
    assert policy.success_threshold == 0.30
    assert policy.minimum_margin == 0.08


def test_success_may_return_two_suggestions() -> None:
    policy = PredictionPolicy(second_suggestion_threshold=0.2)
    result = result_from_probabilities(
        torch.tensor([0.58, 0.24, 0.04, 0.04, 0.03, 0.03, 0.02, 0.02]),
        "male",
        policy,
    )
    assert result.status is AnalysisStatus.SUCCESS
    assert [item.face_type for item in result.suggestions] == ["dog", "cat"]


def test_skipped_and_retake_results_have_no_face_type() -> None:
    assert skipped_result().as_dict() == {
        "status": "SKIPPED",
        "analysis_group": None,
        "suggestions": [],
        "reason_code": "user_skipped",
    }
    retake = retake_required_result("female", "too_blurry")
    assert retake.status is AnalysisStatus.RETAKE_REQUIRED
    assert retake.suggestions == ()

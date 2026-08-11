from __future__ import annotations

from collections import Counter

from face_analysis.labels import (
    ANALYSIS_GROUP_LABELS,
    FACE_TYPE_KO,
    REFERENCE_PEOPLE,
    labels_for_group,
)


def test_reference_people_are_complete_and_unique() -> None:
    assert len(REFERENCE_PEOPLE) == 68
    assert len({person.file_prefix for person in REFERENCE_PEOPLE}) == 68
    assert len({person.person_id for person in REFERENCE_PEOPLE}) == 68


def test_each_group_has_four_people_per_face_type() -> None:
    counts = Counter(
        (person.analysis_group, person.face_type) for person in REFERENCE_PEOPLE
    )
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        assert all(counts[(group, label)] == 4 for label in labels)


def test_analysis_group_is_explicitly_selected() -> None:
    assert labels_for_group("여자") == ANALYSIS_GROUP_LABELS["female"]
    assert labels_for_group("남성") == ANALYSIS_GROUP_LABELS["male"]


def test_turtle_uses_the_friendly_entertainment_display_name() -> None:
    assert FACE_TYPE_KO["turtle"] == "꼬북이상"

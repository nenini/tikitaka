from __future__ import annotations

from pathlib import Path

from face_analysis.dataset import build_manifest


ROOT = Path(__file__).resolve().parents[1]


def test_current_dataset_is_complete_and_has_no_exact_duplicates() -> None:
    rows = build_manifest(ROOT / "data", ROOT / "data" / "사진데이터")
    assert len(rows) == 204
    assert len({row["person_id"] for row in rows}) == 68
    assert len({row["source_sha256"] for row in rows}) == 204
    assert all(int(row["source_width"]) > 0 for row in rows)
    assert all(int(row["source_height"]) > 0 for row in rows)


def test_manifest_uses_group_specific_label_spaces() -> None:
    rows = build_manifest(ROOT / "data", ROOT / "data" / "사진데이터")
    female = {row["face_type"] for row in rows if row["analysis_group"] == "female"}
    male = {row["face_type"] for row in rows if row["analysis_group"] == "male"}
    assert "wolf" not in female
    assert "turtle" not in male
    assert "hamster" not in male

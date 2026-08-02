"""Nemotron-Personas-Korea 에서 소개팅 연습용 페르소나 샘플을 받아 personas/nemotron_korea.jsonl 로 저장.

출처: nvidia/Nemotron-Personas-Korea (CC BY 4.0). 전체 600만이 아니라 필터된 소량 샘플만.
필터: 미혼 + 20~39세 (소개팅 연습에 부적합한 기혼·고연령 제외).

  uv run python scripts/download_personas.py --target 150
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

API = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=nvidia/Nemotron-Personas-Korea&config=default&split=train"
    "&offset={off}&length=100"
)
# systemPrompt 조립에 쓸 필드만 보관 (파일 경량화)
KEEP = [
    "uuid", "sex", "age", "occupation", "persona",
    "hobbies_and_interests", "cultural_background", "career_goals_and_ambitions",
]
DATASET_SIZE = 6_000_000
SPREAD = 200_000  # 데이터셋 전반에 퍼뜨려 지역·직업 다양성 확보


def is_dating_ok(row: dict) -> bool:
    return row.get("marital_status") == "미혼" and 20 <= int(row.get("age", 0)) <= 39


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=150)
    ap.add_argument("--out", default="personas/nemotron_korea.jsonl")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    collected: list[dict] = []
    off = 0
    while len(collected) < args.target and off < DATASET_SIZE:
        try:
            d = json.load(urllib.request.urlopen(API.format(off=off), timeout=30))
        except Exception as exc:  # 네트워크/일시 오류는 건너뜀
            print(f"  skip offset={off} ({exc})")
            off += SPREAD
            continue
        for r in d["rows"]:
            if is_dating_ok(r["row"]):
                collected.append({k: r["row"].get(k) for k in KEEP})
        print(f"  offset~{off} → 누적 {len(collected)}명")
        off += SPREAD

    collected = collected[: args.target]
    with out.open("w", encoding="utf-8") as f:
        for c in collected:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"\n저장 완료: {out} ({len(collected)}명, 미혼 20~39세)")


if __name__ == "__main__":
    main()

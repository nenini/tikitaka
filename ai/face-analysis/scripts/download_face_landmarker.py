"""Download the pinned official MediaPipe model into the ignored artifacts dir."""

from __future__ import annotations

import argparse
import hashlib
import urllib.request
from pathlib import Path


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
MAX_MODEL_BYTES = 10 * 1024 * 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/face_landmarker.task"),
    )
    return parser.parse_args()


def main(args: argparse.Namespace) -> None:
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        MODEL_URL,
        headers={"User-Agent": "face-analysis-model-setup/1"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        payload = response.read(MAX_MODEL_BYTES + 1)
    if len(payload) > MAX_MODEL_BYTES:
        raise RuntimeError("Downloaded model exceeds the expected size limit.")
    digest = hashlib.sha256(payload).hexdigest()
    if digest != MODEL_SHA256:
        raise RuntimeError("Downloaded model checksum does not match the pin.")
    temporary = output.with_suffix(output.suffix + ".part")
    temporary.write_bytes(payload)
    temporary.replace(output)
    print(f"face_landmarker_ready path={output} sha256={digest}")


if __name__ == "__main__":
    main(parse_args())

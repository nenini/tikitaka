"""Start the loopback-only camera demo and optionally open a browser."""

from __future__ import annotations

import argparse
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.demo_app import app  # noqa: E402


def port_number(value: str) -> int:
    port = int(value)
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1024 and 65535")
    return port


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local face camera demo.")
    parser.add_argument("--port", type=port_number, default=8001)
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the system browser automatically.",
    )
    return parser.parse_args()


def open_when_ready(url: str, timeout_seconds: float = 120.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    health_url = f"{url}internal/v1/face-analysis/health"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=2):  # noqa: S310
                webbrowser.open(url)
                return
        except urllib.error.HTTPError:
            # A degraded response still means the local page is ready to explain it.
            webbrowser.open(url)
            return
        except (OSError, urllib.error.URLError):
            time.sleep(0.5)


def main(args: argparse.Namespace) -> None:
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Local face demo: {url}")
    print("Stop with Ctrl+C. Captured images are not written to disk.")
    if not args.no_browser:
        threading.Thread(
            target=open_when_ready,
            args=(url,),
            daemon=True,
        ).start()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        access_log=False,
        log_level="info",
    )


if __name__ == "__main__":
    main(parse_args())

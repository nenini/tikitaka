# 관제실(Aggregator) — 실시간 STT(faster-whisper, CUDA) + 코칭 + 사후 리포트.
# GPU 필요(Whisper). LLM 추론(코칭·리포트)은 컨테이너 밖 Ollama에 붙는다.
#
# ⚠️ build context 는 `ai/` (부모)여야 한다. aggregator 가 `../stt` 를 path 의존으로 쓰기 때문.
#   docker build -f aggregator/Dockerfile -t ssafy-ai-aggregator ./ai   (context=ai/)
#   또는 compose: build.context: ./  , dockerfile: aggregator/Dockerfile
#
# GPU 할당은 런타임에서. 코드/이미지에 물리 번호 하드코딩 없음:
#   docker run --gpus '"device=3"' -e CUDA_VISIBLE_DEVICES=3 -e STT_DEVICE=cuda:0 ...
#   (CUDA_VISIBLE_DEVICES=3 이면 컨테이너는 그 GPU를 cuda:0 으로 본다)

# cuDNN 포함 CUDA 런타임 — faster-whisper(ctranslate2)가 cuBLAS·cuDNN을 필요로 한다.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

# Python 3.11 + 오디오/런타임 시스템 의존
#  - libgomp1: ctranslate2 OpenMP
#  - ffmpeg·libsndfile1: 오디오 디코딩(av/soundfile)
#  - libportaudio2: sounddevice(로컬 데모 경로용 — import 시 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3.11-dev \
    ca-certificates curl \
    libgomp1 ffmpeg libsndfile1 libportaudio2 \
    && rm -rf /var/lib/apt/lists/*

# uv 바이너리
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# stt(path 의존) 소스 먼저 — aggregator uv.lock 의 `stt-pipeline = { path = "../stt" }`
COPY stt /app/stt

# 의존성만 먼저 설치(레이어 캐시). 루트 프로젝트는 빌드 안 함 — PYTHONPATH로 실행.
COPY aggregator/pyproject.toml aggregator/uv.lock /app/aggregator/
WORKDIR /app/aggregator
RUN uv python install 3.11 \
    && uv sync --frozen --no-install-project --no-dev

# 앱 소스(패키지 폴더만)
COPY aggregator/aggregator /app/aggregator/aggregator

ENV PATH="/app/aggregator/.venv/bin:$PATH" \
    PYTHONPATH="/app/aggregator:/app/stt" \
    PYTHONUNBUFFERED=1 \
    STT_DEVICE=cuda:0 \
    STT_MODEL_SIZE=large-v3

# aggregator.api:app (uvicorn :8000), GET /health
EXPOSE 8000
CMD ["python", "-m", "aggregator"]

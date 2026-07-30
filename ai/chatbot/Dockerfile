# 소개팅 AI 챗봇 스트리밍 API (FastAPI)
# LLM 추론은 컨테이너 밖 Ollama(호스트)에 붙는다 → OLLAMA_HOST 로 지정.
# 챗봇 자체는 GPU 불필요(경량 CPU 이미지). Whisper/torch 의존 없음.
FROM python:3.11-slim

# uv(빠른 파이썬 패키지 매니저) 바이너리만 복사
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# 의존성만 먼저 설치(레이어 캐시). 루트 프로젝트는 빌드 안 함 — pythonpath로 실행.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# 앱 소스(패키지 폴더만)
COPY chatbot ./chatbot

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app" \
    PYTHONUNBUFFERED=1 \
    OLLAMA_HOST="http://host.docker.internal:11434"

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "chatbot.api:app", "--host", "0.0.0.0", "--port", "8000"]

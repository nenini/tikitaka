# 얼굴상 분석 API (FastAPI). CPU 런타임 — 얼굴상은 온보딩 1회성이라 GPU 불필요.
# ⚠️ 모델 아티팩트(artifacts/*.onnx, *.task)와 참조 데이터(data/)는 gitignore라
#    이미지에 넣지 않는다. 실행 시 볼륨으로 마운트한다(../docker-compose.yml 참고).
#    startup(lifespan)에서 모델을 로드하므로, 그 파일들이 없으면 컨테이너가 부팅 실패한다.
FROM python:3.11-slim

# opencv / mediapipe / tensorflow 런타임 시스템 라이브러리
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# uv(빠른 파이썬 패키지 매니저) 바이너리만 복사
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# 의존성만 먼저 설치(레이어 캐시). dev 그룹(torch/torchvision cu126) 제외 = CPU 경량.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# inference/model/training 이 런타임에 torch·torchvision을 import한다(팀 pyproject엔 dev·cu126로
# 분류돼 --no-dev로 빠짐). 얼굴상은 CPU 실행이므로 CPU 빌드로 설치해 CUDA torch(수GB)를 피한다.
RUN uv pip install --python /app/.venv/bin/python \
      torch==2.7.0 torchvision==0.22.0 --index-url https://download.pytorch.org/whl/cpu

# 소스(src 레이아웃)
COPY src ./src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/src" \
    PYTHONUNBUFFERED=1

EXPOSE 8000
# 프로덕션 앱(데모앱 아님). CWD=/app 라서 기본 경로 artifacts/·data/ 가 마운트 지점과 일치.
CMD ["python", "-m", "uvicorn", "face_analysis.api:app", "--host", "0.0.0.0", "--port", "8000"]

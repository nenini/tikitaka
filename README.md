# Tikitaka — 화상 모의 소개팅 AI 코칭 플랫폼

> 소개팅은 누구나 하지만, 아무도 연습하지 않습니다.
> 운동에는 코치가 있고 발표에는 리허설이 있는데, 30분의 소개팅에는 아무것도 없었습니다.

Tikitaka는 화상으로 모의 소개팅을 하면서 **대화 중에 실시간 코칭을 받고**, 끝난 뒤에는
**무엇을 다르게 할지 알려주는 리포트**를 받는 서비스입니다. 코칭 카드는 **본인에게만** 보입니다.

---

## 목차

- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [시스템 아키텍처](#시스템-아키텍처)
- [저장소 구조](#저장소-구조)
- [로컬 실행](#로컬-실행)
- [환경 변수](#환경-변수)
- [테스트](#테스트)
- [배포](#배포)
- [설계 결정](#설계-결정)
- [팀](#팀)

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| **얼굴상 분석** | 사진 한 장으로 인상 유형을 분류. 온보딩 진입 장치 |
| **AI 가상 상대** | 사람을 만나기 전 혼자 연습. 페르소나가 매번 달라짐 |
| **매칭** | 설문 기반으로 상대를 배정하고 세션 일정을 잡음 |
| **화상 세션** | LiveKit 기반 30분 1:1 화상 대화 |
| **실시간 코칭** | 침묵·리액션·시선 등을 감지해 **나에게만** 보이는 카드 제공 |
| **세션 리포트** | 6축 점수 · 대화 타임라인 · 다음 세션 미션 |
| **성장 지표** | 세션이 쌓일수록 축별 변화를 추적 |

---

## 기술 스택

### Frontend
```
React 19 · TypeScript · Vite · Tailwind CSS
react-router-dom 7 · zustand · react-hook-form + zod
livekit-client 2.21 (WebRTC)
@mediapipe/tasks-vision 0.10 (브라우저 내 표정·시선 분석)
oxlint · prettier
```

### Backend
```
Java 21 · Spring Boot 4.1
Spring Web MVC · Data JPA · Security · WebSocket(STOMP) · Validation · Mail · Actuator
MySQL 8.4 · Flyway (마이그레이션 47개)
LiveKit Server SDK 0.13 · java-jwt · springdoc-openapi
```

### AI
```
Python 3.11 · uv (패키지 관리) · mypy strict · pytest

STT           faster-whisper (large-v3, CTranslate2, float16/CUDA) · Silero VAD
LLM           EXAONE-3.5-7.8B-Instruct (Ollama 서빙)
표정·시선      MediaPipe Tasks Vision (브라우저 Web Worker, TypeScript)
얼굴상         FaceNet512 (DeepFace) + MediaPipe 얼굴 기하
TTS           edge-tts · GMS(OpenAI 호환) TTS
서빙          FastAPI · uvicorn · httpx · pydantic
```

### Infra
```
Docker · Docker Compose · Jenkins · nginx
GPU: NVIDIA L40S 46GB
```

---

## 시스템 아키텍처

```
┌─ 사용자 브라우저 × 2 ──────────────────────────────────────┐
│  마이크    카메라 ──▶ MediaPipe (Web Worker)   코칭 카드    │
│                       └─ 영상 원본은 여기서 끝난다           │
└────┬──────────────────────────┬─────────────────────▲──────┘
     │ 오디오·영상 트랙            │ 표정·시선 "결과만"      │
     ▼                          │ (DataChannel)        │
┌─ LiveKit SFU ─────────┐        │                     │
│  방 정원 3명           │        │                     │
│  = 사람 2 + AI 1      │        │                     │
└────┬──────────────────┘        │                     │
     │ 사람별 오디오 트랙 구독      │                     │
     ▼                          ▼                     │
┌─ AI 워커 (aggregator) ───────────────────────┐        │
│  STT → SessionState → 감지기 → 중재기 → 정책   │        │
│  llm_coaching · report                      │        │
└────┬─────────────────────────────────────────┘        │
     │ 코칭 이벤트 · 리포트 (HTTPS)                        │
     ▼                                                 │
┌─ Backend (Spring Boot) ─┐  ──── STOMP 개인 큐로 푸시 ───┘
│  세션 · 매칭 · 리포트     │
└────┬────────────────────┘
     ▼
   MySQL
```

**두 가지 설계 원칙이 그림에 드러납니다.**

1. **AI는 서버 밖에서 훔쳐보지 않고, 방에 참가자로 들어갑니다.**
   `ai-session-{sessionId}` 라는 참가자로 입장해 사람별 오디오 트랙을 따로 구독합니다.
   섞인 오디오를 나중에 화자 분리하는 방식이 아니라, **처음부터 안 섞이게** 했습니다.

2. **얼굴 영상은 브라우저를 떠나지 않습니다.**
   MediaPipe가 브라우저 Web Worker 안에서 돌고, 서버로는 "미소 시작" 같은 이벤트만 갑니다.
   프라이버시·대역폭·GPU 비용을 한 번에 해결합니다.

> 상세 다이어그램(L0 전체 → L1 AI 내부 → L2 기능별 6장)은
> 상위 폴더의 `아키텍처_다이어그램.html` 참고.

---

## 저장소 구조

```
S15P11A307/
├── frontend/                React + TypeScript SPA
│   └── src/features/        account · auth · chatbot · consent · face · growth
│                            home · matching · profile · report · room · session · survey
├── backend/                 Spring Boot
│   └── src/main/java/com/date/backend/domain/
│                            aichat · auth · coach · consent · face · growth · match
│                            mission · moderation · notification · profile · report
│                            room · safety · silence · survey · user · admin
├── ai/
│   ├── aggregator/          통제실 — 실시간 코칭 집계 엔진 (AI 파트의 중심)
│   │   └── aggregator/
│   │       ├── livekit_stt.py        LiveKit 오디오 → STT
│   │       ├── livekit_vision.py     DataChannel 비전 이벤트 수신
│   │       ├── state.py              SessionState (두 화자 공통 시간축)
│   │       ├── detectors.py          침묵·질문·필러 감지
│   │       ├── coaching_detectors/   주의·대화·미소·카메라·성량
│   │       ├── coaching_arbitrator.py 후보 순위 결정
│   │       ├── coaching.py           정책 게이트 (쿨다운·중복·TTL)
│   │       ├── llm_coaching.py       코칭 문장 생성 (침묵 코칭만)
│   │       └── report/               세션 리포트 (수치 계산 + 문장 생성 + 검증)
│   ├── stt/                 faster-whisper + Silero VAD 파이프라인
│   ├── chatbot/             AI 가상 소개팅 상대 (페르소나 + LLM)
│   ├── tts/                 한국어 음성 합성
│   ├── face-analysis/       얼굴상 분석 (FastAPI)
│   └── vision-analysis/     브라우저 표정·시선 분석 (TypeScript, FE에 번들)
├── nginx/                   리버스 프록시 설정
├── scripts/                 배포 스크립트
├── docker-compose.prod.yml
└── Jenkinsfile
```

---

## 로컬 실행

### 사전 요구사항

| | 버전 |
|---|---|
| Node.js | 20+ |
| JDK | 21 (Eclipse Temurin) |
| Python | 3.11  |
| uv | 최신 |
| Docker | Compose v2 |
| GPU | STT·LLM 실행 시 CUDA. 없으면 CPU 폴백(느림) |

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm run vision:build # ai/vision-analysis 빌드 후 에셋 복사
```

### Backend

```bash
cd backend
./gradlew bootRun
```

```bash
./gradlew test       # 전체 테스트 (6~12분)
./gradlew build
```

MySQL이 먼저 떠 있어야 합니다. Flyway가 기동 시 스키마를 적용합니다.

```bash
docker compose -f docker-compose.prod.yml up -d mysql
```

### AI — 통제실 (aggregator)

AI 파트의 진입점입니다. `stt` · `chatbot` · `tts`를 로컬 의존성으로 함께 설치합니다.

```bash
cd ai/aggregator
uv sync
cp .env.example .env      # BACKEND_BASE_URL · INTERNAL_TOKEN 등 채우기
uv run python -m aggregator
```

```
GET  /health
GET  /api/v1/sessions/{session_id}/transcript
POST /api/v1/sessions/events        # 세션 시작·종료 수신
```

### AI — 챗봇

```bash
cd ai/chatbot
uv sync
uv run uvicorn chatbot.api:app --port 8200
```

```
POST /api/v1/chat/stream    # SSE 스트리밍
```

### AI — 얼굴상

```bash
cd ai/face-analysis
uv sync
uv run uvicorn face_analysis.api:app --port 8300
```

### AI — 마이크로 STT 단독 확인

```bash
cd ai/stt
uv sync
uv run python -m stt.mic_stream        # 말하면 전사가 콘솔에 찍힘
```

---

## 환경 변수

`.env.example`을 `.env`로 복사해 채웁니다. `.env`는 Git에서 제외됩니다.

### aggregator

| 변수 | 기본값 | 설명 |
|---|---|---|
| `BACKEND_BASE_URL` | — | 백엔드 주소 (필수) |
| `INTERNAL_TOKEN` | — | 내부 API 공유 토큰 (필수) |
| `STT_MODEL_SIZE` | `large-v3` | Whisper 모델 |
| `STT_DEVICE` | `cuda` | `cuda` / `cpu` |
| `STT_COMPUTE_TYPE` | `float16` | |
| `STT_LANGUAGE` | `ko` | |
| `STT_END_SILENCE_MS` | `700` | 발화 종료 판정 무음 길이 |
| `STT_VAD_THRESHOLD` | `0.5` | |
| `STT_MIN_CONFIDENCE` | `0.5` | 이 미만 전사는 버림 |
| `COACHING_LLM_ENABLED` | `false` | |
| `COACHING_LLM_BASE_URL` | `http://127.0.0.1:8100` | Ollama 주소 |
| `COACHING_LLM_MODEL` | EXAONE 3.5 7.8B | |
| `COACHING_LLM_TIMEOUT_SECONDS` | `3` | **LLM 호출 하나**의 타임아웃 |
| `COACHING_LLM_KEEP_ALIVE` | `1h` | 모델 상주 시간 |
| `REPORT_LLM_BASE_URL` | — | 리포트 문장 생성용 |
| `AGGREGATOR_TICK_INTERVAL_SECONDS` | `0.5` | |

### backend

`LIVEKIT_URL` · `LIVEKIT_API_KEY` · `LIVEKIT_API_SECRET` · `LIVEKIT_MAX_PARTICIPANTS`(기본 3) ·
DB 접속 정보 · JWT 시크릿 · 메일 설정.

---

## 테스트

```bash
# Backend — 458개
cd backend && ./gradlew test

# AI
cd ai/aggregator     && uv run pytest -q && uv run mypy .   # 384개
cd ai/stt            && uv run pytest -q                    #  54개
cd ai/chatbot        && uv run pytest -q                    #  75개
cd ai/face-analysis  && uv run pytest -q
cd ai/vision-analysis && npm test && npm run typecheck

# Frontend
cd frontend && npx tsc -b && npm run lint
```

AI 패키지는 **mypy strict**를 통과해야 합니다. `Any` 사용을 금지하고,
이벤트는 discriminated union으로 정적 타입을 보장합니다.

---

## 배포

Jenkins 파이프라인이 `develop` 브랜치를 받아 다음 순서로 처리합니다.

```
Checkout
 → Backend Test (gradlew clean test)
 → Vision Package Build
 → Frontend Check
 → Backend / Frontend / AI 이미지 빌드
 → Deployment Decision
 → Deploy Production (scripts/deploy-prod.sh)
```

프로덕션 구성(`docker-compose.prod.yml`):

```
nginx(80/443) ─┬─ frontend      정적 번들
               ├─ backend       :8080 (localhost 바인딩)
               ├─ chatbot
               └─ face-analysis
                  mysql 8.4 (volume: mysql-data)
```

`aggregator`(통제실)는 GPU가 필요해 컴포즈에 포함하지 않고 **GPU 서버에서 별도 실행**합니다.

---

## 설계 결정

프로젝트를 관통하는 판단들입니다. 자세한 근거는 `AI_문서/` 폴더 참고.

### 수치는 코드가, 문장은 LLM이

발화 비율·침묵 횟수·말 끊기·주제 분류는 **전부 코드가 결정적으로 계산**합니다.
그 값을 프롬프트에 "이미 계산 완료, 재계산 금지"로 박고, LLM은 설명 문장만 씁니다.

그리고 LLM이 규칙을 어기면 코드가 잡아냅니다(`report/builder.py`의 `parse_narrative`).

| 위반 | 처리 |
|---|---|
| 사전에 없는 유형으로 지적 | 카드 폐기 |
| 대화에 없는 문장 인용 | 인용 제거 |
| 시각을 지어냄 | 제거 |
| 측정하지 못한 축을 언급 | 문장 폐기 |

> 프롬프트에 "없는 내용을 쓰지 마라"고 넣어도 샜습니다. 확률적 지시로는 안 되고,
> 계산해 둔 값과 대조해 버리는 층이 있어야 막힙니다.

### 감지와 발행은 다른 일이다

감지기가 코칭을 직접 내보내지 않습니다. 여러 감지기가 동시에 후보를 올리면
`CoachingArbitrator`가 순위를 매기고, `CoachingPolicy`가 쿨다운·중복·TTL을 검사해
**통과한 하나만** 화면에 뜹니다. 대화 중에 카드가 세 개 뜨면 코칭이 아니라 방해입니다.

### 침묵 판정의 시계는 전사가 민다

VAD(소리)를 기준으로 두면 기침·의자 소리 250ms에도 시계가 0으로 돌아가
10초 침묵이 **구조적으로** 성립하지 않습니다. 기준을 전사로 바꾼 뒤
침묵 감지가 세션당 0건에서 15건이 됐습니다.

### Whisper `initial_prompt`는 쓰지 않는다

문장부호를 얻으려 프롬프트를 넣었더니, 무음 환각이 **대화처럼 보이는 고신뢰 문장**으로
바뀌어 필터를 그대로 통과했습니다(실측: 무음 5개 중 5개 통과, 프롬프트 없을 때 0개).
필터로는 막을 수 없어 되돌렸습니다.

### 챗봇은 파인튜닝하지 않는다

작은 모델을 카톡체 데이터로 QLoRA 학습했더니 **말투는 자연스러워졌지만 문맥을 놓쳤습니다**
("안녕하세요"에 "나도 과학 좋아해!"). 소개팅 대화에서는 문맥이 더 중요하다고 판단해
큰 모델 + 프롬프트 방식으로 갔습니다. 학습 파이프라인은 재현 가능하게 남겨 뒀습니다.

### 전사 원문은 저장하지 않는다

세션이 끝나는 시점에 리포트를 생성하고 원문은 남기지 않습니다.
백엔드로는 파생 결과(코칭 이벤트·지표·요약)만 전송합니다.

---

## 개발 규약

```
base 브랜치   develop
브랜치명      type/#{이슈번호}-설명       예) feature/#3-stt-input
커밋          type(#이슈): 설명           예) fix(#32): 침묵 판정 축 교체
type          feature / fix / docs / style / refactor / test / chore
```

**FE · BE · AI는 폴더로 분리되어 있고, 파트별로 따로 커밋·따로 푸시합니다.**
한 커밋에 두 파트를 섞지 않습니다 — 리뷰어와 롤백 단위가 폴더 경계와 같기 때문입니다.

---

## 팀

가상용 고예린 이규섭 차현우 홍선정

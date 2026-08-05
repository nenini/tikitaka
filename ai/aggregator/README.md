# aggregator — 통제실 (실시간 코칭 집계 엔진)

STT가 낸 `TranscriptEvent`를 받아 실시간 코칭 신호(`AnalysisEvent`)로 집계하는 엔진.
통제실 설계(`ssafy_project/AI_문서/통제실_설계_플랜.md`)의 Phase 0~1 구현.

## 구조
```
aggregator/
  events.py        # AnalysisEvent (SilenceDetected / QuestionAsked / FillerDetected) — 감지 사실, 타입드 union
  state.py         # SessionState / SpeakerState / Utterance (공통 시간축 누적)
  detectors.py     # Detector(Observer): Question / Filler / Silence — 감지 사실만 낸다
  coaching.py      # CoachingCommand + CoachingPolicy (게이트·쿨다운·TTL·templates)
  llm_coaching.py  # 카나나 로컬 서버를 통한 침묵 코칭 문구 보정
  aggregator.py    # SessionAggregator: 전사 → 감지 → [분석 emit] → 정책 → [코칭 emit]
  console_sink.py  # 터미널 emitter (분석 #112 / 코칭 #114 자리)
  live_demo.py     # 마이크 → STT → 통제실 실시간 데모
  offline_demo.py  # 마이크 없이 가상 대화로 확인
```

## 두 스트림 (친구 리뷰 #2·#3)
- **분석 이벤트(AnalysisEvent)** = "무슨 일이 감지됐다"(SILENCE/QUESTION/FILLER) → 지표·디버깅(#112).
- **코칭 명령(CoachingCommand)** = "사용자에게 전달하라"(COACHING_REQUESTED·messageKey·TTL·dedup) → 개인 전달(#114).
- 감지기는 코칭을 직접 내지 않는다 → `CoachingPolicy`가 게이트·쿨다운·TTL로 판단.
- 코칭 발생 판단은 규칙 엔진이 계속 담당한다. 옵션으로 카나나가 최근 전사를 보고 `SILENCE_RECOVERY`의 `messageText`만 자연스럽게 바꾸며, 오류·시간 초과·안전 필터 실패 시 기존 고정 문구로 복귀한다.
- MVP 코칭 트리거 = **침묵만**. 질문·군말은 분석/리포트 전용.

## 설계 원칙
- **Any 미사용**: 이벤트는 payload별 타입 분리(discriminated union)로 정적 타입 보장.
- **Observer 감지기**: `on_utterance`(내용) / `on_tick`(시간) 훅만 구현 → 하나씩 켜고 끄고 테스트.
- **전송-불가지론**: `emit` 콜백만 주입 → 지금은 콘솔, 나중에 BE(#112) WS.
- **stt 참조**: 통합 Python 3.11 환경이 로컬 `stt-pipeline`을
  의존성으로 설치한다. 서버 실행 시 별도 `PYTHONPATH`가 필요 없다.

## 개발 (로직·테스트, 오디오/GPU 불필요)
```bash
cd ai/aggregator
uv sync
uv run mypy         # strict + pydantic 플러그인, Any 금지
uv run pytest -q    # Mock TranscriptEvent 주입
```

## Backend 세션 연동

Backend가 세션 시작·종료와 LiveKit 구독 정보를 알려주면 AI가 구독 전용
참가자(`ai-session-{sessionId}`)로 방에 입장한다. `user-{userId}`별 오디오
트랙은 서로 섞지 않고 자체 VAD/STT를 거쳐 해당 세션의 `SessionAggregator`에
전달한다.

세션별 `SessionAggregator`가
생성된 내부 `CoachingCommand v2`를 Backend `COACHING_REQUESTED v1`로 변환해
전송한다. MVP 침묵 정책은 **10초 후 두 참가자에게 각각
`SILENCE_RECOVERY` 코칭**이며 15/30/45초 단계형 침묵 API는 사용하지 않는다.

`.env.example`을 `.env`로 복사해 실제 공유 토큰과 Backend 주소를 넣는다.
`.env`는 Git에서 제외된다.

```bash
cp .env.example .env
uv run python -m aggregator
```

수신 API:

```text
GET  /health
POST /api/v1/sessions/events
```

세션 시작 요청에는 아래 필드가 필수다. `accessToken`은 방 구독 전용이며
로그에 출력하지 않는다.

```json
{
  "liveKit": {
    "url": "wss://...",
    "roomName": "session-room-name",
    "accessToken": "...",
    "participantIdentity": "ai-session-15"
  }
}
```

Backend 전송 API:

```text
POST /internal/ai/coaching-events
```

선택 환경변수:

```text
BACKEND_REQUEST_TIMEOUT_SECONDS=5
BACKEND_EVENT_MAX_ATTEMPTS=3
BACKEND_EVENT_RETRY_DELAY_SECONDS=1
AGGREGATOR_TICK_INTERVAL_SECONDS=0.5
AGGREGATOR_SHUTDOWN_FLUSH_TIMEOUT_SECONDS=3
STT_MODEL_SIZE=large-v3
STT_DEVICE=cuda
STT_COMPUTE_TYPE=float16
STT_LANGUAGE=ko
```

## 카나나 맥락형 침묵 코칭

카나나는 코칭을 **발생시킬지 판단하지 않고**, 규칙 엔진이 10초
침묵을 감지했을 때 최근 대화에 맞는 후속 질문 문구만 만든다. 모델
서버는 AI 사망에서 OpenAI-compatible `/v1/chat/completions` API를
제공해야 한다.

```text
COACHING_LLM_ENABLED=true
COACHING_LLM_BASE_URL=http://GPU-서버-IP:8100
COACHING_LLM_MODEL=kakaocorp/kanana-2-3b-instruct
COACHING_LLM_TIMEOUT_SECONDS=2
COACHING_LLM_MAX_CONTEXT_UTTERANCES=10
COACHING_LLM_MAX_MESSAGE_CHARACTERS=100
```

양쪽 사용자에게 같은 침묵 코칭이 나갈 때는 모델을 한 번만 호출하고
같은 문구를 공유한다. Backend 계약은 계속 `COACHING_REQUESTED v1`,
`messageKey` 대문자, TTL 15초를 유지한다. 전사 원문은 Backend로
보내지 않는다.

### 8GB Windows GPU에서 Kanana 실행

Aggregator 가상환경과 Kanana 가상환경을 분리한다. 공식 3B
가중치가 약 7GB이므로 기본은 4-bit 양자화를 사용한다.

```powershell
cd ai/aggregator
py -3.11 -m venv .venv-kanana
.\.venv-kanana\Scripts\python.exe -m pip install -r kanana-requirements.txt
$env:KANANA_LOAD_IN_4BIT="true"
.\.venv-kanana\Scripts\python.exe -m uvicorn tools.kanana_server:app `
  --host 127.0.0.1 --port 8100
```

`http://127.0.0.1:8100/health`가 `UP`를 반환하면 Aggregator
`.env`의 `COACHING_LLM_ENABLED=true`를 적용하고 데모 서버를
재시작한다. 나중에 GPU 서버로 옮길 때는 같은 서버 코드를
실행하고 `COACHING_LLM_BASE_URL`만 GPU 서버 주소로 바꾼다.

## Vision · STT · Kanana 통합 데모

첫 번째 터미널:

```powershell
cd ai/aggregator
.\.venv\Scripts\python.exe ..\vision-analysis\demo\aggregator_server.py
```

두 번째 터미널:

```powershell
cd ai/vision-analysis
pnpm demo:control-room
```

`http://127.0.0.1:4174/control-room.html`에서 실제 Vision v4 이벤트,
시선·카메라·미소 코칭, 입 가림, STT v2 세 이벤트,
전사 버퍼, 10초 침묵, Kanana 생성/폴백을 한 화면에서
확인할 수 있다.

## 라이브 데모 (마이크 + GPU + stt 런타임 의존 필요)
`live_demo`는 stt의 런타임 의존(faster-whisper 등)이 필요하다. stt 실행 환경에서 stt를
`PYTHONPATH`에 두고 실행한다.
```bash
# 예 (stt 런타임 의존이 있는 환경)
uv run python -m aggregator.live_demo
uv run python -m aggregator.live_demo --lang ko --device cpu
```
말하면 전사가 통제실로 들어가고 질문·군말·침묵 감지가 실시간 출력된다:
```
[전사    3.1s] (user-A) 요즘 어떻게 지내세요?
   ↳ [통제실] QUESTION_ASKED (user-A) {'text': '요즘 어떻게 지내세요?', 'questionCount': 1}
   ↳ [통제실] SILENCE_DETECTED (session) {'silenceSec': 10.2, 'suggestion': '최근에 재밌게 한 거 있어요?'}
```

## 현재 범위 / 다음
- **구현됨**: Backend lifecycle + LiveKit 2화자 오디오 구독 + 자체 VAD/STT
  라우팅 + Vision v4 DataChannel 수신 + 침묵/비전 코칭 Backend 전달
  + 세션 종료 후 전사 TTL 메모리 보관 + 선택적 카나나 침묵 문구 생성.
- **다음(게이트)**: GPU 서버에서 실제 카나나 추론 서버 기동 /
  실제 Backend 토큰으로 2브라우저 종단간 장애·지연·폴백 시험 /
  사후 리포트와 신고 저장 API.

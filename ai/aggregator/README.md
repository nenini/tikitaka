# aggregator — 통제실 (실시간 코칭 집계 엔진)

STT가 낸 `TranscriptEvent`를 받아 실시간 코칭 신호(`AnalysisEvent`)로 집계하는 엔진.
통제실 설계(`ssafy_project/AI_문서/통제실_설계_플랜.md`)의 Phase 0~1 구현.

## 구조
```
aggregator/
  events.py        # AnalysisEvent (SilenceDetected / QuestionAsked / FillerDetected) — 감지 사실, 타입드 union
  state.py         # SessionState / SpeakerState / Utterance (공통 시간축 누적)
  detectors.py     # Detector(Observer): Question / Filler / Silence — 감지 사실만 낸다
  coaching.py      # CoachingCommand + CoachingPolicy (게이트·쿨다운·TTL·templates, LLM 미사용)
  aggregator.py    # SessionAggregator: 전사 → 감지 → [분석 emit] → 정책 → [코칭 emit]
  console_sink.py  # 터미널 emitter (분석 #112 / 코칭 #114 자리)
  live_demo.py     # 마이크 → STT → 통제실 실시간 데모
  offline_demo.py  # 마이크 없이 가상 대화로 확인
```

## 두 스트림 (친구 리뷰 #2·#3)
- **분석 이벤트(AnalysisEvent)** = "무슨 일이 감지됐다"(SILENCE/QUESTION/FILLER) → 지표·디버깅(#112).
- **코칭 명령(CoachingCommand)** = "사용자에게 전달하라"(COACHING_REQUESTED·messageKey·TTL·dedup) → 개인 전달(#114).
- 감지기는 코칭을 직접 내지 않는다 → `CoachingPolicy`가 게이트·쿨다운·TTL로 판단. **실시간 LLM 미사용**(6GB), 문구는 템플릿(messageKey).
- MVP 코칭 트리거 = **침묵만**. 질문·군말은 분석/리포트 전용.

## 설계 원칙
- **Any 미사용**: 이벤트는 payload별 타입 분리(discriminated union)로 정적 타입 보장.
- **Observer 감지기**: `on_utterance`(내용) / `on_tick`(시간) 훅만 구현 → 하나씩 켜고 끄고 테스트.
- **전송-불가지론**: `emit` 콜백만 주입 → 지금은 콘솔, 나중에 BE(#112) WS.
- **stt 참조**: stt는 build-system이 없어 `pythonpath`(../stt)로 import (stt 자체 관례와 동일).

## 개발 (로직·테스트, 오디오/GPU 불필요)
```bash
cd ai/aggregator
uv sync
uv run mypy         # strict + pydantic 플러그인, Any 금지
uv run pytest -q    # Mock TranscriptEvent 주입
```

## Backend 세션 연동

Backend가 세션 시작·종료를 알려주면 세션별 `SessionAggregator`를 만들고,
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
```

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
- **구현됨**: 내용 기반(질문·군말·침묵) + 라이브 데모 + 단위 테스트.
- **다음(게이트)**: 끼어들기·볼륨(2화자 오디오 + VAD onset/offset 노출 결정) / 지표·BE 발행(BE 계약) / 비전 결합(비전 패키지 머지) / 사후 리포트(GPU LLM). 상세는 `통제실_구현_plan.md` §7.

# 표정·시선 분석 (COACH-01) — 브라우저 ↔ AI 서버 연동

`ai/vision-analysis`(`@video-dating/browser-ai`)의 VisionPipeline 을 W-12 화상 세션의
**내 카메라 영상**에 물리고, 결과 배치를 LiveKit DataChannel 로 AI 워커에 보낸다.

## 데이터 흐름

```
로컬 카메라 트랙 (LiveKit LocalVideoTrack)
  → 분석 전용 <video> (DOM 에 붙은 2px 짜리, 화면의 PIP 와 별개)
  → FrameSampler (최신 프레임만, 기본 5fps)
  → Worker: MediaPipe FaceLandmarker → NormalizedFaceFrame
  → VisionPipeline (품질 게이트 → baseline → 행동 detector)
  → BufferedVisionEventPublisher (500ms 배치)
  → LiveKitVisionTransport → DataChannel topic `vision.v4` (Reliable)
  → AI 워커(`ai-session-{sessionId}`) → Aggregator.push_vision_batch()
```

원본 프레임·랜드마크는 브라우저 밖으로 나가지 않는다. 나가는 것은 스칼라 지표뿐이다.

## 전송 계약

| 항목 | 값 |
| --- | --- |
| topic | `vision.v4` |
| 신뢰성 | Reliable (`reliable: true`) |
| 수신자 | `destinationIdentities: ["ai-session-{sessionId}"]` |
| 페이로드 | UTF-8 JSON, `{ "behaviorEvents": [...], "metricSnapshots": [...] }` |
| 패킷 상한 | 12KB. 넘으면 같은 모양으로 쪼개 여러 패킷을 보낸다 |

### participantIdentity 를 페이로드에 넣지 않는 이유

Aggregator 의 `VisionEventBatch`(pydantic)는 `extra="forbid"` 이고 필드가
`behaviorEvents` / `metricSnapshots` **둘뿐**이다. 배치 위에 `participantIdentity` 를
얹으면 `model_validate` 가 배치를 통째로 거절한다.

그래서 신원은 이렇게 맞춘다.

- **sessionId · userId**: 이벤트 봉투(`VisionEventEnvelope`)에 들어 있다. 전송 직전에
  `LiveKitVisionTransport` 가 배치의 모든 이벤트를 현재 세션·로그인 사용자와 대조하고,
  하나라도 어긋나면 **보내지 않는다**.
- **participantIdentity**: 수신 측이 LiveKit 패킷의 **발신 participant** 에서 읽는다
  (`DataReceived` 이벤트의 `participant.identity`). 브라우저는 보내기 전에
  `room.localParticipant.identity === "user-{userId}"` 를 확인하고, 다르면 멈춘다.

즉 AI 서버에서는 `participant.identity` 와 배치 안 `userId` 가
`user-{userId}` 규칙으로 대응하는지만 확인하면 된다.

> 배치 봉투에 `participantIdentity` 를 **꼭 넣어야 한다면** Aggregator 쪽 계약
> (`VisionEventBatch`)을 먼저 넓혀야 한다. 지금 상태로 얹으면 검증에서 전부 떨어진다.

### 순서·중복

- `seq` 는 (userId, clientInstanceId) 기준 단조 증가다. 배치는 행동/메트릭 두 배열로
  나뉘어 순서가 깨지므로 수신 측이 `ordered_events()` 로 복원한다.
- `eventId` 가 멱등 키다. 재전송으로 같은 `eventId` 가 두 번 올 수 있다.
- 전송이 실패하면 배치는 브라우저 버퍼에 남아 다음 interval 에 재시도된다
  (최대 100건 / 30초, 초과분은 메트릭부터 버린다).

## 동의 (`visionEnabled`)

- SSOT 는 `RoomParticipant.expressionAnalysisEnabled` (DB 기본값 **FALSE**).
- 대기방 입장 직전에 `PATCH /sessions/{id}/analysis-settings` 로 1회 스냅샷을 찍어
  `sessionStorage` 에 남긴다(`analysisConsent.ts`). 세션이 IN_PROGRESS 가 되면 409 라
  그때가 마지막 기회다.
- **읽을 수 없으면 false** 로 본다 — 모를 때는 분석하지 않는다.
- 세션 도중 false 로 바뀌면 샘플링·파이프라인·전송을 모두 멈추고, 버퍼에 남은 배치는
  flush 하지 않고 **버린다**(`CONSENT_WITHDRAWN`).

## 로컬 자산

| 파일 | 출처 |
| --- | --- |
| `public/mediapipe/wasm/**` | `npm run vision:assets` (node_modules 에서 복사, postinstall 자동) |
| `public/models/face_landmarker.task` | 직접 내려받아 둔다 (아래) |

```bash
curl -L -o public/models/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

모델이 없으면 Worker 초기화가 실패하고 상태가 `UNAVAILABLE` 이 된다. 통화는 그대로
진행되고 콘솔에 경고만 남는다 — 분석은 fail-soft 다.

## AI 패키지 빌드

FE 는 `ai/vision-analysis` 의 **dist** 를 물린다(`@vision/*` alias).
패키지 소스를 바꿨다면 다시 빌드해야 FE 에 반영된다.

```bash
npm --prefix ../ai/vision-analysis install
npm run vision:build
```

소스를 직접 번들하지 않는 이유: FE tsconfig 의 `erasableSyntaxOnly`·`noUnusedLocals` 가
AI 패키지 소스에 그대로 적용돼 남의 코드에서 `tsc -b` 가 깨진다.

## 알려진 한계

- 카메라를 끄면 프레임이 아예 끊겨 `CAMERA_DISABLED` 행동 이벤트가 나가지 않는다.
  파이프라인은 프레임이 있어야 상태를 전이하기 때문이다. 수신 측은 메트릭 스냅샷의
  `observationInterval` 공백으로 그 구간을 인식해야 한다.
- 임계값은 AI 파트가 준 초기 후보값(`defaultVisionConfig`)을 그대로 쓴다. 실제 동의 기반
  평가 영상으로 튜닝하기 전까지 지표를 확정 판정에 쓰면 안 된다.

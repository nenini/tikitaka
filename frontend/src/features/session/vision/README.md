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
| 전송 조건 | `ai-session-{sessionId}` 가 **룸에 입장한 뒤에만** 보낸다 |

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

- `seq` 는 (userId, clientInstanceId) 기준 단조 증가다. 한 패킷 안에서는 행동/메트릭 두
  배열로 나뉘어 순서가 깨지므로 수신 측이 `ordered_events()` 로 복원한다.
- **패킷 사이의 순서는 브라우저가 보장한다.** 12KB 분할 시 behavior/metric 전체를 seq 로
  정렬한 뒤 연속 구간으로만 자르므로 항상 `packet[i].maxSeq < packet[i+1].minSeq` 다.
  (예전에는 behavior 를 먼저 채우고 metric 을 나중에 채워 `[11,13]` → `[10,12]` 처럼
  뒤집힌 패킷이 나올 수 있었다.)
- `eventId` 가 멱등 키다. 재전송으로 같은 `eventId` 가 두 번 올 수 있다.
- 전송이 실패하면 배치는 브라우저 버퍼에 남아 다음 interval 에 재시도된다
  (최대 100건 / 30초, 초과분은 메트릭부터 버린다).

### AI 워커 입장 전 이벤트

DataChannel 은 수신자가 없어도 publish 가 성공으로 끝난다. 그래서 워커가 룸에 없으면
`AI_WORKER_NOT_CONNECTED` 로 **던져서** publisher 버퍼에 남긴다.

⚠️ 버퍼 수명은 `transport.maxBufferedAgeMs` = **30초**다. 워커가 세션 시작보다 30초 넘게
늦게 입장하면 그 이전 구간은 폐기된다. baseline 수집이 세션 앞부분에서 이뤄지므로,
워커는 `AI_SESSION_STARTED` 직후 입장하는 것이 좋다.

### 룸 참가자 구성

룸에는 사람 2명 + AI 워커 1명이 들어온다. 참가자 수를 세는 곳에서는 AI 워커를 빼야 한다
(`livekit/identity.ts` 의 `isAiWorkerIdentity`). 안 그러면 상대가 아직 없는데도
"상대 입장"으로 판단해 빈 영상에 대고 "상대가 카메라를 껐어요" 를 띄운다.

## 동의 (`visionEnabled`)

- SSOT 는 `RoomParticipant.expressionAnalysisEnabled` (DB 기본값 **FALSE**).
- 대기방 입장 직전에 `PATCH /sessions/{id}/analysis-settings` 로 1회 스냅샷을 찍어
  `sessionStorage` 에 남긴다(`analysisConsent.ts`). 세션이 IN_PROGRESS 가 되면 409 라
  그때가 마지막 기회다.
- **읽을 수 없으면 false** 로 본다 — 모를 때는 분석하지 않는다.
- 세션 도중 false 로 바뀌면 샘플링·파이프라인·전송을 모두 멈추고, 버퍼에 남은 배치는
  flush 하지 않고 **버린다**(`CONSENT_WITHDRAWN`).

## 로컬 자산

둘 다 `npm run vision:assets` 가 준비한다. **`postinstall` 에서 자동 실행**되므로 새 PC·CI·
배포 서버 모두 `npm install` 한 번이면 갖춰진다.

| 파일 | 출처 |
| --- | --- |
| `public/mediapipe/wasm/**` | `node_modules/@mediapipe/tasks-vision/wasm` 에서 복사 |
| `public/models/face_landmarker.task` | 없으면 Google MediaPipe 호스팅에서 다운로드 (3.7MB) |

- 임시 파일로 받은 뒤 rename 하므로 중단돼도 잘린 파일이 남지 않는다. 이미 잘려 있으면
  크기를 보고 다시 받는다.
- 네트워크가 막혀도 **install 을 실패시키지 않는다.** 경고만 남고 분석이 꺼진 채로 뜬다.
- 오프라인 CI 에서 다운로드를 끄려면 `BT_SKIP_VISION_MODEL=1`.
- 수동으로 받으려면:

```bash
curl -L -o public/models/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

모델이 없으면 Worker 초기화가 실패하고 상태가 `UNAVAILABLE` 이 된다. 통화는 그대로
진행되고 콘솔에 경고만 남는다 — 분석은 fail-soft 다.

> ⚠️ WASM 은 `public/` 에 두지만 dev 서버에서는 거기서 서빙하면 **안 된다**.
> MediaPipe 는 런타임에 `import("/mediapipe/wasm/vision_wasm_module_internal.js")` 를
> 실행하는데, vite dev 는 `public/` 파일이 모듈로 import 되면 500 으로 거절한다.
> 그래서 `vite.config.ts` 의 `bt:mediapipe-wasm-dev` 플러그인이 transform 미들웨어보다
> 먼저 이 경로를 가로채 원본 바이트를 돌려준다. 프로덕션 빌드는 정적 서빙이라 무관하다 —
> **`vite build` 만 확인하면 절대 안 잡히는 버그**이므로 플러그인을 지우지 말 것.

## 콘솔로 확인하기

```js
localStorage.setItem('bt.vision.debug', '1')   // 상세 로그 (새로고침 불필요)
```

- 행동 감지(`SMILE_STARTED`·`GAZE_AWAY_STARTED`·`NOD_EVENT` …)는 dev 에서 항상 찍힌다.
- 상세 모드에서는 5초마다 품질·baseline·프로파일·누적 카운트 한 줄이 추가로 찍힌다.
- `[vision] 전송 실패 …` 가 계속 늘면 룸 연결 또는 신원 불일치다(전송은 되지만 받는 쪽이
  없는 경우는 실패로 잡히지 않는다 — DataChannel 은 수신자 유무를 알려주지 않는다).

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

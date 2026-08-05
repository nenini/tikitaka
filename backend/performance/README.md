# AI 채팅 SSE 성능 비교

이 테스트는 POST SSE 응답 전체를 수신하여 정상 완료율, 중도 종료율, 503 비율과 전체 처리 시간을 비교합니다.

## 주의사항

- 토큰은 파일에 저장하지 않고 환경변수로 전달합니다.
- 동일 세션의 동시 AI 응답은 정상적으로 409 차단됩니다.
- 동시 사용자 수만큼 서로 다른 사용자 토큰과 활성 AI 채팅 세션 ID가 필요합니다.
- 실제 AI를 사용하면 모델 응답 편차가 포함됩니다. 변경 전·후에 동일한 메시지와 동일한 AI 환경을 사용합니다.
- k6 기본 HTTP 모듈은 POST SSE 응답을 모두 받은 뒤 반환하므로 첫 chunk 시간보다 전체 완료시간과 안정성 비교에 적합합니다.

## 1. 스모크 테스트

PowerShell에서 변경 후 서버를 8080 포트로 실행한 뒤 다음을 실행합니다.

```powershell
k6 run `
  -e BASE_URL=http://localhost:8080 `
  -e ACCESS_TOKEN="발급받은_ACCESS_TOKEN" `
  -e SESSION_ID=1 `
  -e VUS=1 `
  -e ITERATIONS=1 `
  --summary-export=performance/results/after-smoke.json `
  performance/ai-chat-sse.js
```

`sse_completed_rate=100%`, `sse_midstream_failure_rate=0%`인지 확인합니다.

## 2. 변경 전·후 비교

변경 전 Worktree 서버를 8081, 변경 후 서버를 8080에서 실행합니다. DB 충돌을 피하려면 한 서버씩 순서대로 테스트하는 것을 권장합니다.

변경 전:

```powershell
k6 run `
  -e BASE_URL=http://localhost:8081 `
  -e ACCESS_TOKENS="토큰1,토큰2,토큰3,토큰4" `
  -e SESSION_IDS="11,12,13,14" `
  -e VUS=4 `
  -e ITERATIONS=4 `
  --summary-export=performance/results/before-vu4.json `
  performance/ai-chat-sse.js
```

변경 후:

```powershell
k6 run `
  -e BASE_URL=http://localhost:8080 `
  -e ACCESS_TOKENS="토큰1,토큰2,토큰3,토큰4" `
  -e SESSION_IDS="11,12,13,14" `
  -e VUS=4 `
  -e ITERATIONS=4 `
  --summary-export=performance/results/after-vu4.json `
  performance/ai-chat-sse.js
```

## 3. 부하 단계

각 단계는 서로 다른 활성 세션을 준비하여 최소 3회 반복합니다.

| 단계 | VUS | 확인 목적 |
|---|---:|---|
| Smoke | 1 | 요청 형식과 인증 확인 |
| 기존 경계 | 4 | 기존 corePool 범위 확인 |
| 중간 부하 | 8 | 변경 후 확장 확인 |
| 최대 부하 | 16 | 변경 후 maxPool 범위 확인 |
| 초과 부하 | 20 | 즉시 503 과부하 제어 확인 |

## 핵심 결과 지표

- `sse_completed_rate`: `done`까지 정상 완료된 비율
- `sse_midstream_failure_rate`: HTTP 200 이후 `done` 없이 끊긴 비율
- `sse_busy_rate`: 503으로 빠르게 거절된 비율
- `sse_total_duration`: 요청부터 전체 SSE 종료까지 걸린 시간
- `http_req_duration`: k6가 측정한 전체 HTTP 요청 시간
- `checks`: 응답 계약 검증 성공률

503은 무조건 실패가 아니라 동시 처리 한도를 넘긴 요청을 오래 대기시키지 않은 결과입니다. 변경 후 초과 부하에서는 중도 종료 대신 503이 나타나는지 비교합니다.

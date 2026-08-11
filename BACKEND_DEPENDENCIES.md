# 백엔드 의존 작업 협의표

작성 2026-08-04 · 기준 커밋 `7d66608`(origin/develop) · 작성자 FE
체크리스트 항목 **A12(백엔드 의존 작업 협의표 운영)** 의 산출물.

FE 단독으로 끝낼 수 없는 항목에 **담당자·목표일·대안**을 붙이기 위한 표다.
판정은 추측이 아니라 **백엔드 컨트롤러를 전수 조사해** 확인했다.

> ⚠️ 조사 결과 **체크리스트의 "백엔드 대기" 판정이 6건 낡아 있었다.**
> 이미 구현된 API를 기다리고 있던 셈이라, 아래 §1 을 먼저 본다.

---

## 1. 이미 구현됐다 — 기다릴 필요 없음 (6건)

FE 체크리스트가 "백엔드 대기"로 두고 있지만 **서버에는 이미 있다.**
FE가 계약을 잘못 알고 있었거나, 구현 시점을 놓친 것이다.

| 체크리스트 | FE가 기다리던 것 | 실제 |
|---|---|---|
| **A10 · A43** 5분 연장 | "연장 API 미구현" | ✅ `POST /api/v1/sessions/{sessionId}/extensions` |
| **A42** 세션 신고·차단 | "신고/차단 API 계획" | ✅ `POST /api/v1/moderation/reports` · `POST /api/v1/users/{userId}/blocks` |
| **A47** 마이페이지 고정 수치 | "blocks/restrictions API 계획" | ✅ `GET /api/v1/users/me/blocks` · `GET /api/v1/users/me/restrictions` |
| **A34 · A35** 알림 | (구현됨으로 표시) | ✅ 목록·미확인 수·읽음·전체읽음 4개 |
| **A74** OAuth IPv4/IPv6 | "build.gradle 반영 확인 필요" | ✅ `build.gradle:56-60` 에 `-Djava.net.preferIPv6Addresses=true` 반영 완료 |

### 5분 연장 계약 (A10 · A43 — 가장 큰 정정)

```http
POST /api/v1/sessions/{sessionId}/extensions
{ "decision": "AGREE" | "DECLINE" }
```

응답 `SessionExtensionDecisionResponse` — `status`, 양측 `decision`,
`scheduledEndAt`, `actualEndAt` 을 준다.
**STOMP 로도 밀어준다**: `/topic/sessions/{sessionId}/extensions`
(`eventType = SESSION_EXTENSION_DECISION_CHANGED`).

규칙: 결정 창은 **5분**, 양측 `AGREE` 여야 35분까지 유지되고
`DECLINE` 또는 미응답이면 30분에 종료된다.

→ **A10 은 "범위 확정"이 아니라 이미 확정된 계약이다. A43 은 즉시 착수 가능.**
현재 FE의 로컬 토글은 실제 시간을 늘리지 못하는 상태이므로 우선순위가 높다.

---

## 2. 정말 미구현 — 협의 필요 (10건)

전수 조사에서 **대응 엔드포인트가 존재하지 않음**을 확인했다.

| # | 항목 | 필요한 API | 우선 | FE 대안(서버 없이) | 담당 | 목표일 |
|---|---|---|---|---|---|---|
| A38 | 세션 리포트 | `GET /sessions/{id}/reports/me` · `/status` | P0 | ✅ 폴백 제거 후 '준비중' 화면 | BE | |
| A37 | 세션 종료 플로우 | 위 REPORT 의존 | P0 | ✅ 리포트 미구현 시 종료로 마감 | BE | |
| A16 | 이메일 중복 확인 | `GET /auth/email-availability` | P0 | ✅ 제출 시 409 처리로 대체 | BE | |
| A15 | KYC 상태 | `POST /auth/adult-verification` | P0 | ⚠️ Mock 을 환경별로 격리만 가능 | BE | |
| A40 | 성장 대시보드 | `GET /users/me/growth-dashboard` 외 3 | P1 | ✅ 폴백 제거 후 '준비중' | BE | |
| A19 | 분석 데이터 삭제 요청 | `POST /users/me/data-deletion-requests` | P1 | ✅ 화면에서 내림(완료) | BE | |
| A44 | 홈 예정 세션 | `GET /sessions/upcoming` | P1 | ✅ 데모 데이터 제거·빈 상태 | BE | |
| A45 | 매칭 지연 사유 | `GET /match-requests/{id}/delay-reason` | P1 | ✅ 사유 미표시 | BE | |
| A53 | 리포트 목록 | 세션 히스토리/리포트 목록 | P1 | ⚠️ 현재 `/reports` 는 막다른 페이지 | BE | |
| A51 | 챗봇 페르소나 저장 | persona 옵션/추천 API | P1 | ⚠️ 서버는 `purpose` 만 받음 | BE | |
| A54 | 세션 분석 설정 조회 | `GET /sessions/{id}/analysis-settings` | P2 | ⚠️ sessionStorage 스냅샷으로 버팀 | BE | |

**"FE 대안" 이 ✅ 인 것은 서버 없이도 안전한 상태로 만들 수 있다** —
가짜 데이터를 지우고 '준비중'을 명시하면 된다. ⚠️ 는 대안이 불완전해 서버가 필요하다.

### A54 — 분석 설정을 읽을 방법이 없다

`PATCH /sessions/{id}/analysis-settings` 는 있는데 **GET 이 없다.** 게다가 세션이
`IN_PROGRESS` 가 되면 PATCH 가 409라, 세션 도중에는 현재 설정을 알아낼 길이 아예 없다.

지금은 대기방에서 입장할 때 받은 PATCH 응답을 `sessionStorage` 에 스냅샷으로 남겨
쓰고 있다(`features/session/vision/analysisConsent.ts`). 새로고침은 견디지만
**다른 탭·기기에서는 복원되지 않고**, 프라이빗 모드처럼 스토리지가 막힌 브라우저에서는
읽지 못한다. 그 경우 **분석하지 않는 쪽(false)** 으로 떨어뜨려 안전하게는 처리했으나,
사용자가 켜 둔 분석이 조용히 꺼지는 것이라 정상 동작은 아니다.

GET 하나면 스냅샷 전체를 걷어낼 수 있다. 우선순위는 낮다(P2) — 현재 대안이 안전한 방향으로
실패하기 때문이다.

### 가장 급한 것: REPORT API (A38 · A37)

리포트는 **P0 이면서 대안이 '준비중 화면'뿐**이다. 세션 → 평가 → 리포트가
핵심 여정인데 마지막이 비어 있으면 데모가 완결되지 않는다.
현재 `report/api.ts` 의 `demoReport` 가 가짜 점수를 반환하고 있어
**서버 장애와 정상 동작이 구분되지 않는다**(상호 평가와 같은 문제였고 그쪽은 제거 완료).

필요한 최소 계약:

```http
GET /api/v1/sessions/{sessionId}/reports/status   → { reportStatus, generatedAt }
GET /api/v1/sessions/{sessionId}/reports/me       → 점수·근거·레이더·이슈
POST /api/v1/sessions/{sessionId}/reports         → 생성 요청(실패 재시도)
```

`reportStatus` 는 `PENDING · GENERATING · COMPLETED · FAILED` 를 가정하고 있다.
**조각별 엔드포인트(`/radar`, `/metrics`, …)로 나눌지, `/me` 하나로 합칠지 확정이 필요하다.**
FE는 한 화면에 전부 그리므로 `/me` 하나를 선호한다(9번 호출 대신 1번).

---

## 3. 계약 문서 정정 요청 (2건)

구현과 문서가 어긋나 FE가 어느 쪽을 믿어야 할지 모호한 것들.

| 대상 | 문제 | 요청 |
|---|---|---|
| `ai/face-analysis/FE_INTEGRATION.md` | 저장 규약이 백엔드 구현과 불일치. 문서는 `{faceType, analysisStatus, analysisModelVersion}` 를 보내고 `relativeScore` 는 **보내지 말라**고 하지만, 실제 `FaceAnalysisResultSubmitRequest` 는 `{modelVersion, tags[{code, relativeScore, rank}]}` 이고 `relativeScore` 가 `@NotNull` | 문서를 구현에 맞춰 정정 (FE는 구현 기준으로 이미 배선함) |
| `consent_types` 테이블 | 필수/선택 구분 컬럼이 없어 서버가 필수 여부를 표현하지 못함. FE가 `code` 로 하드코딩 중 | `required` 컬럼 추가 |

---

## 4. 계약 변경 요청 (2건)

확정된 계약과 서버 검증이 어긋나는 것들. [CONTRACT_DECISIONS.md](CONTRACT_DECISIONS.md) 참고.

| 대상 | 현재 | 요청 | 이유 |
|---|---|---|---|
| `SignupRequest.phoneNumber` | `@Size(max=30)` — 빈 값 통과 | `@NotBlank` 승격 | A7에서 전화번호를 **필수로 확정**했다. FE만 막으면 API 직접 호출로 우회된다 |
| **소셜 가입 사용자 필드** | `User.oauthUser(email, name)` — `birthDate`·`phoneNumber` 없음 | 온보딩에서 수집하는 경로 신설 | 🔴 **`MatchEligibilityPolicy` 가 `birthDate == null` 이면 매칭을 성립시키지 않는다. 현재 소셜 가입자는 전원 매칭 불가.** |

**소셜 가입자 매칭 불가는 이 표에서 가장 급한 항목이다.** 기능이 조용히 죽어 있고
로그에도 남지 않는다. 수집 위치는 KYC 단계(`/signup/verify`)와 프로필 단계 중
BE·PO가 정하면 FE는 폼만 붙이면 된다.

---

## 5. 백엔드 외 의존

| 항목 | 의존 대상 | 상태 |
|---|---|---|
| A2 Vision 실동작 스모크 | AI 워커 기동 | 🟠 미검증 |
| A11 AI 화상 트랙 Go/No-Go | AI TTS 파이프라인 + PO 범위 결정 | 🔴 [RELEASE_SCOPE.md](RELEASE_SCOPE.md) 참고 |
| A58 E2E 시나리오 | 테스트 데이터·환경 | 🟠 |
| A71 사진 스타일링 피드백 | AI·BE 신규 | ⬜ 출시 범위 제외 권장 |

---

## 운영 방법

- **주 1회** 이 표를 갱신한다. 갱신 시 §1을 먼저 다시 확인한다 —
  이번처럼 "이미 구현됐는데 기다리고 있던" 건이 또 생길 수 있다.
- 백엔드 담당자는 §2 표의 **담당·목표일 칸을 채워** 주면 된다.
- FE는 §2의 "대안 ✅" 항목을 **서버를 기다리지 않고 먼저 안전화**한다
  (가짜 데이터 제거 → 준비중 명시). 서버가 붙으면 배선만 갈아끼운다.

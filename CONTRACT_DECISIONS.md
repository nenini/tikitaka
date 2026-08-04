# 계약 결정안 — 회원가입 개인정보 · 동의 모델 · 설문 선택 개수

작성 2026-08-04 · 기준 커밋 `7d66608`(origin/develop) · 작성자 FE

FE 총괄 체크리스트의 **P0-긴급** 3건(A7·A8·A9)은 코드로 풀 수 없는 **계약 합의**다.
기능명세 / 백엔드 구현 / 프론트 구현이 서로 다른 상태이고, 어느 쪽에 맞출지는
PO·BE·FE가 함께 정해야 한다. 이 문서는 **결정에 필요한 사실만 코드에서 확인해 정리**하고
각 안의 비용을 적은 것이다. 문서 자체가 결정은 아니다.

세 건 모두 **온보딩 흐름을 막고 있어** 다른 P0 작업의 선행 조건이다.
특히 A9(설문 선택 개수)가 확정되지 않으면 A23(온보딩 설문 화면)을 두 번 만들게 된다.

> 표기: 🔴 결정 필요 · 🟠 결정에 딸린 후속 작업 · ⚠️ 결정과 무관하게 지금 버그

---

## 요약

| | 쟁점 | 권고 | 결정권자 |
|---|---|---|---|
| **A7** | 가입 시 실명·전화·생년월일을 받을 것인가 | 실명·생년월일 유지, **전화번호 제거** | PO + BE |
| **A8** | 선택 동의를 4개로 볼 것인가 2개로 볼 것인가 | **백엔드 2종에 맞추고** 표정·음성은 세션 설정으로 이관 | PO(법무) + BE |
| **A9** | 선호 얼굴상을 복수 선택으로 열 것인가 | **단수 유지**(이번 스프린트), 복수는 다음 차수 | 기획 + BE |

---

## A7 · 회원가입 개인정보 계약

### 현재 상태 (3자 불일치)

| 필드 | 기능명세 §3.1~3.2 | 백엔드 `SignupRequest` | 프론트 `SignupPage` |
|---|---|---|---|
| email | ✅ 필수 | `@NotBlank @Email` | 필수 |
| password | ✅ 필수 | `@Size(8,64)` + 영문·숫자·**특수문자** | 8자↑ 영문·숫자 (**특수문자 없음**) |
| realName | ❌ 없음 | `@NotBlank @Size(max=50)` | 필수 (2자↑) |
| phoneNumber | ❌ 없음 | `@Size(max=30)` — **선택** | **필수** (정규식 강제) |
| birthDate | ❌ 없음 | `@NotNull @Past` | 필수 (만 19세↑) |

근거: [SignupRequest.java](backend/src/main/java/com/date/backend/domain/auth/dto/request/SignupRequest.java),
[PasswordPolicy.java](backend/src/main/java/com/date/backend/domain/auth/password/PasswordPolicy.java),
[SignupPage.tsx](frontend/src/features/auth/SignupPage.tsx),
[User.java](backend/src/main/java/com/date/backend/domain/user/domain/User.java)

### ⚠️ 결정과 무관하게 지금 고쳐야 하는 것

**비밀번호 정책이 어긋나 가입이 실패한다.**
백엔드는 `^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,64}$` — 특수문자 필수, 64자 상한.
프론트는 영문·숫자만 검사하고 상한이 없다. 사용자가 `qwer1234` 를 넣으면
**프론트 검증을 통과한 뒤 서버에서 거부**된다. 정책은 백엔드가 정본이므로 프론트를 맞춘다.
→ 이 건은 결정을 기다리지 않고 FE에서 처리한다.

### 🔴 쟁점 — 세 필드는 정말 필요한가

개인정보는 "필요해서 받는다"를 설명할 수 있어야 한다. 각 필드의 **실제 사용처**를 코드에서 확인했다.

**`birthDate` — 제거 불가. 오히려 지금 구멍이 있다.**

나이는 매칭 성립 조건이다. [MatchEligibilityPolicy.java:32](backend/src/main/java/com/date/backend/domain/match/policy/MatchEligibilityPolicy.java:32)
가 `birthDate == null` 이면 **매칭을 성립시키지 않는다**(`return false`).
공개 프로필의 `age` 도 여기서 나온다.

그런데 **소셜 가입 사용자는 `birthDate` 가 없다.**
[OAuthService.java:59](backend/src/main/java/com/date/backend/domain/auth/application/OAuthService.java:59) 는
`User.oauthUser(email, name)` 로만 만든다 — 생년월일도 전화번호도 채우지 않는다.
즉 **현재 구글로 가입한 사용자는 영원히 매칭이 잡히지 않는다.**
결정과 별개로 이 구멍은 메워야 한다(아래 후속 작업 참고).

**`realName` — 표시용. 대체 가능하지만 지금은 묶여 있다.**

`User.realName` 은 `nullable = false` 이고, `GET /users/me` 응답에 실린다.
프론트는 프로필 닉네임이 확정되기 전 표시명으로 이 값을 쓴다
([auth.store.ts](frontend/src/stores/auth.store.ts) 의 `toAuthUser`).
AI 챗봇 컨텍스트에서도 참조한다. **신고·분쟁 처리 시 본인 특정** 용도라면 유지 근거가 되지만,
그 목적이 아니라면 닉네임으로 대체 가능하다. → PO 판단 필요.

**`phoneNumber` — 사용처를 찾지 못했다.**

백엔드에서 저장만 하고 **읽는 곳이 없다.** 인증(SMS)에도 쓰지 않는다
(본인인증은 별도 KYC 단계 `adultVerifiedAt`).
그런데 **프론트만 필수로 강제**하고 있어, 백엔드가 선택으로 둔 항목을 프론트가 더 엄격히 받는 상태다.
수집 근거가 가장 약하다.

### 선택지

| | 안 | 내용 | 비용 |
|---|---|---|---|
| **A** | **전화번호만 제거** *(권고)* | email·password·realName·birthDate 유지. FE에서 전화 입력 삭제 | FE 폼 수정 + BE에서 컬럼 미사용 정리. **마이그레이션 불필요**(이미 nullable) |
| B | 명세대로 축소 | email·password만 받고 실명·생년월일은 온보딩 프로필 단계로 이동 | `User.realName` nullable 변경 + 매칭·표시명 경로 수정. **BE 마이그레이션 필요**. 소셜/이메일 가입 흐름이 통일되는 이점은 큼 |
| C | 현행 유지 | 명세를 코드에 맞춰 개정 | 코드 변경 0. 다만 "왜 받는지" 설명이 필요한 항목이 남는다 |

**권고: A.** 사용처가 없는 전화번호를 빼면 개인정보 최소수집 원칙에 가장 싸게 가까워진다.
B는 방향이 더 옳지만 소셜 가입 구멍(birthDate)과 함께 풀어야 해서 이번 스프린트에는 부담이 크다.

### 🟠 결정 시 후속 작업

1. **(결정 무관·즉시)** FE 비밀번호 검증을 `PasswordPolicy.REGEXP` 와 동일하게 맞춘다.
2. **(결정 무관·BE)** 소셜 가입자의 `birthDate` 수집 경로를 만든다.
   현재 온보딩에 생년월일 입력 단계가 없어 KYC(`/signup/verify`)나 프로필 단계에서 받아야 한다.
   → **이걸 정하지 않으면 소셜 가입자는 매칭이 불가능하다.**
3. A안 채택 시: FE 가입 폼에서 전화 필드 제거, `SignupPayload.phoneNumber` 제거.
4. B안 채택 시: BE 마이그레이션 + `UserResponse`·`toAuthUser`·매칭 자격 판정 재검토.

---

## A8 · 동의 모델 정합화

### 현재 상태 (프론트가 서버에 없는 항목을 그리고 있다)

**백엔드 — 동의 유형 2종.** [V6__seed_consent_types.sql](backend/src/main/resources/db/migration/V6__seed_consent_types.sql)

| code | name |
|---|---|
| `INTEGRATED_SERVICE_CONSENT` | 서비스 이용 및 분석 통합 동의 |
| `FACE_CAPTURE_CONSENT` | 얼굴 촬영 및 분석 동의 |

`consent_types` 는 enum이 아니라 **DB 테이블**이라 행을 추가하면 유형이 늘어난다.
다만 **필수/선택 구분 컬럼이 없다** — `code`, `name`, `version`, `isActive` 뿐이다.
즉 "무엇이 필수인가"를 현재 서버는 표현하지 못한다.

**프론트 — 필수 1 + 선택 4.**
[ConsentPage.tsx:29](frontend/src/features/auth/ConsentPage.tsx:29) 과
[ConsentManagePage.tsx](frontend/src/features/account/ConsentManagePage.tsx) 가
`face` · `expression` · `voice` · `report` 4개를 선택 동의로 노출한다.
서버에 대응 유형이 없는 것이 **3개**(expression·voice·report)다.
게다가 가입 동의 화면은 아직 **`console.log` 만 하고 서버에 저장하지 않는다.**

**표정·음성은 이미 다른 곳에 메커니즘이 있다.**
[SessionAnalysisSettingsRequest.java](backend/src/main/java/com/date/backend/domain/room/dto/request/SessionAnalysisSettingsRequest.java)
가 `voiceAnalysisEnabled` / `expressionAnalysisEnabled` 를 **세션 참가자 단위**로 관리한다
(`PATCH /sessions/{id}/analysis-settings`). 프론트가 이걸 가입 동의로 한 번 더 만든 셈이라,
같은 상태가 두 곳에 생겨 어긋날 수밖에 없다.

### 🔴 쟁점

1. 표정·음성 분석을 **가입 시 1회 동의**로 받을 것인가, **세션마다 설정**으로 받을 것인가?
2. 누적 리포트 저장은 별도 동의인가, 통합 동의에 포함되는가?
3. 서버가 **필수/선택을 표현하지 못하는데** 프론트가 필수 항목을 잠그는 것이 맞는가?

### 선택지

| | 안 | 내용 | 비용 |
|---|---|---|---|
| **A** | **서버 2종에 맞춘다** *(권고)* | 가입 동의 = 통합(필수) + 얼굴(선택). 표정·음성은 세션 설정 화면으로 이관, 리포트 저장은 통합 동의에 포함 | FE 두 화면 수정. **BE 변경 없음.** 세션 설정 화면(A31)과 자연히 합류 |
| B | 서버를 4종으로 늘린다 | `EXPRESSION_ANALYSIS` · `VOICE_ANALYSIS` · `REPORT_STORAGE` 유형 추가 | BE 마이그레이션 + 세션 설정과의 우선순위 규칙 필요(가입에서 껐는데 세션에서 켜면?). **상태 두 곳 문제를 그대로 안고 감** |
| C | 절충 | 4종을 만들되 세션 설정은 가입 동의의 하위로 두고, 동의 꺼짐이면 세션 설정을 잠근다 | B + 잠금 규칙. 가장 비싸지만 사용자에게 가장 투명 |

**권고: A.** 표정·음성은 **세션마다 끄고 켜는 것이 사용자에게 더 유리**하고(한 번 동의로 영구 적용보다 통제권이 크다),
서버가 이미 그렇게 구현돼 있다. 리포트 저장은 서비스 본질 기능이라 통합 동의 범위로 보는 것이 자연스럽다.
다만 **이건 법무 판단이 필요한 영역**이므로 PO 확인이 반드시 있어야 한다.

### 🟠 결정 시 후속 작업

1. **(결정 무관)** `consent_types` 에 필수/선택 구분이 없다. FE가 `code` 로 하드코딩해 판단할지,
   BE가 `required` 컬럼을 추가할지 정해야 한다. → **하드코딩은 유형이 늘 때마다 FE 배포가 필요**하므로 컬럼 추가 권장.
2. 가입 동의 화면을 실제 API(`GET /consents` → `PUT /users/me/consents`)에 연결한다(체크리스트 A17).
3. 동의 관리 화면의 고정 `INITIAL` 을 서버 조회로 교체한다(A18).
4. A안 채택 시 표정·음성 토글을 세션 설정 화면으로 옮기고, 동의 화면에서 제거한다.
5. "기존 분석 데이터 삭제 요청" 은 대응 API가 없다 — 별도 백엔드 협의 항목.

---

## A9 · 설문 선택 개수 계약

### 현재 상태

**백엔드 `SurveySaveRequest` 의 제약이 매우 엄격하다.**
[SurveySaveRequest.java](backend/src/main/java/com/date/backend/domain/survey/dto/request/SurveySaveRequest.java)

| 항목 | 제약 |
|---|---|
| `preferredFaceTagId` | **`Long` 단수** · `@NotNull @Positive` |
| `preferredTraitIds` | **정확히 3개** (`@Size(min=3, max=3)`) · 중복 불가 |
| `userTraitIds` | **정확히 3개** · 중복 불가 |
| `minPreferredAge` / `maxPreferredAge` | `@NotNull @Positive`, max ≥ min |
| `practiceGoalIds` | **1개 이상** · 중복 불가 |

**선택지 카탈로그** ([V5__add_survey_schema_and_catalog.sql](backend/src/main/resources/db/migration/V5__add_survey_schema_and_catalog.sql))

- 얼굴상 10종 — `applicableGender` 가 있어 성별로 걸러진다
  (`TURTLE_FACE`·`HAMSTER_FACE` = FEMALE 전용, `WOLF_FACE` = MALE 전용, 나머지 ALL)
- 성격 11종 (다정·온화·낙천·느긋·도도·친근·차분·섬세·솔직·예의바른·유머러스한)
- 고민 5종 (말이 많음/적음, 목소리 큼/작음, 기타)

**기획 의도는 선호 얼굴상 다중 선택.** 하지만 서버는 단수다.

### 🔴 쟁점 — 다중 선택의 실제 비용

단순히 DTO만 고치면 되는 문제가 아니다. **선호 얼굴상은 매칭 스코어링에 물려 있다.**

[MatchRequest.java:40](backend/src/main/java/com/date/backend/domain/match/domain/MatchRequest.java:40) 의
`preferredFaceTagId` 는 `nullable = false` 인 **단일 FK 컬럼**이고,
`MatchScorePolicy` 가 이 값으로 점수를 낸다. 복수로 바꾸려면:

1. `preferred_face_tags` 조인 테이블 신설 + 마이그레이션
2. `MatchRequest` 의 FK 컬럼 제거 → 연관관계 변경
3. `MatchScorePolicy` 의 점수 계산을 "일치/불일치"에서 "집합 포함"으로 재정의
4. 매칭 회귀 테스트 전면 재실행(체크리스트 A32)

즉 **매칭 도메인을 건드리는 작업**이고, 매칭은 이미 구현이 끝나 회귀 대상인 영역이다.

### 선택지

| | 안 | 내용 | 비용 |
|---|---|---|---|
| **A** | **단수 유지** *(권고)* | 서버 계약대로 얼굴상 1개. UI를 단일 선택으로 명확히 그림 | FE만. **즉시 A23 착수 가능** |
| B | 복수 허용 | 조인 테이블 + 스코어링 재정의 | BE 마이그레이션 + 매칭 회귀. 이번 스프린트에는 위험 |
| C | 단수 + "상관없음" | 얼굴상에 "상관없음" 선택지를 더해 사실상 필터 해제 | BE에 카탈로그 행 1개 추가 + 스코어링에서 해당 코드 예외 처리. **B보다 훨씬 싸고 사용자 불만의 상당 부분을 흡수** |

**권고: A로 이번 스프린트를 진행하고, C를 후속 개선으로 검토.**
"얼굴상 하나만 고르라니 좁다"는 불만의 실체는 대개 "굳이 안 고르고 싶다"이므로,
복수 선택보다 "상관없음"이 비용 대비 효과가 크다.

### 🔴 함께 확정해야 할 것

성격 **정확히 3개** 제약도 확인이 필요하다. 서버가 `min=3, max=3` 이라
사용자가 2개만 고르면 제출이 막힌다. **UI에서 "3개를 고르세요"를 명시하고 3개 미만이면
제출 버튼을 잠가야** 서버 오류를 보지 않는다. 이 규칙을 유지할지, 1~3개로 완화할지 정해야 한다.

### 🟠 결정 시 후속 작업

1. A안 확정 즉시 **A23(온보딩 설문 화면) 착수 가능** — 현재 이것 때문에 막혀 있다.
2. 얼굴상 목록은 성별로 필터해야 한다(`applicableGender`). 프로필 성별이 설문보다 **먼저** 확정돼야 하므로
   온보딩 순서(프로필 → 얼굴 → 설문)를 유지한다.
3. 나이 범위의 UI 상·하한과 기본값을 정해야 한다(서버는 `@Positive` 와 max ≥ min 만 본다).

---

## 결정 요청

| 항목 | 결정권자 | 막고 있는 작업 |
|---|---|---|
| A7 전화번호 수집 여부 | PO | 가입 폼 확정 |
| A7 소셜 가입자 birthDate 수집 경로 | **BE + PO (긴급)** | **소셜 가입자 매칭 전면 불가** |
| A8 표정·음성 동의의 위치 | PO(법무) + BE | A17·A18 동의 API 연동 |
| A8 `consent_types` 필수/선택 표현 | BE | 동의 화면 필수 잠금 로직 |
| A9 얼굴상 단수/복수 | 기획 + BE | **A23 온보딩 설문 화면** |
| A9 성격 3개 고정 유지 여부 | 기획 | A23 폼 검증 |

FE는 결정 없이도 진행 가능한 것부터 처리한다 —
**비밀번호 정책 동기화**는 결정을 기다리지 않고 반영한다.

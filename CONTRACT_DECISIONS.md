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

## 결정 결과 (2026-08-04 확정)

| | 쟁점 | FE 권고였던 안 | **확정** |
|---|---|---|---|
| **A7** | 가입 시 실명·전화·생년월일을 받을 것인가 | A(전화 제거) | **C — 현행 유지.** 실명·전화·생년월일 모두 수집, 기능명세를 코드에 맞춰 개정 |
| **A8** | 선택 동의를 4개로 볼 것인가 2개로 볼 것인가 | A | **A — 서버 2종.** 가입 동의 = 통합(필수) + 얼굴(선택). 표정·음성은 세션 설정으로 이관, 리포트 저장은 통합 동의에 포함 |
| **A9** | 선호 얼굴상을 복수 선택으로 열 것인가 | A | **A — BE DTO 고정.** 얼굴상 1개, 성격 각 3개 |

아래 각 절의 "선택지"는 결정 근거를 남기기 위해 그대로 둔다.
**확정에 따른 후속 작업은 각 절 끝의 ✅ 블록**을 본다.

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

### ✅ 확정: C안 — 현행 유지

**email · password · realName · phoneNumber · birthDate 5개를 모두 가입 시 수집한다.**
기능명세 §3.1~3.2를 코드에 맞춰 개정한다. 전화번호도 **계약상 필수**로 본다.

수집 근거는 개정된 명세에 명시한다 — 실명·전화번호는 신고·분쟁 처리 시 본인 특정용,
생년월일은 성인 확인과 매칭 연령 조건용.

| 후속 작업 | 담당 | 상태 |
|---|---|---|
| FE 비밀번호 검증을 `PasswordPolicy.REGEXP` 와 일치시킨다 | FE | ✅ 완료 (`f89c4f1`) |
| **소셜 가입자 `birthDate` 수집 경로 신설** | **BE + FE** | 🔴 미착수 — 아래 참고 |
| `SignupRequest.phoneNumber` 를 `@NotBlank` 로 승격 | BE | 🟠 제안 |
| 기능명세 §3.1~3.2 개정 | PO | 🟠 |

**전화번호를 필수로 확정했으므로 백엔드도 필수여야 한다.** 현재 `SignupRequest.phoneNumber` 는
`@Size(max=30)` 뿐이라 빈 값도 통과한다. 프론트만 막고 있으면 API를 직접 호출하는 경로로
전화번호 없는 계정이 생긴다. → **BE에 `@NotBlank @Size(max=30)` 승격을 요청한다.**
(FE 담당 범위 밖이라 제안만 하고 직접 고치지 않는다.)

**소셜 가입자 문제는 이 결정으로 해결되지 않는다.**
`User.oauthUser(email, name)` 는 전화번호와 생년월일을 채우지 않으므로, 5개 필수 계약과
소셜 가입 경로가 여전히 어긋난다. 온보딩 어딘가에서 두 값을 받아야 하고,
**받기 전까지 그 계정은 매칭이 성립하지 않는다.** 후보는 두 가지다.

- KYC 단계(`/signup/verify`)에서 함께 받는다 — 성인 인증과 목적이 같아 자연스럽다
- 프로필 단계(`/signup/profile`)에 필드를 더한다 — 화면 추가가 없어 싸다

→ **결정 필요(BE + PO).** FE는 어느 쪽이든 폼만 추가하면 된다.

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

### ✅ 확정: A안 — 서버 2종에 맞춘다

**가입 동의 = `INTEGRATED_SERVICE_CONSENT`(필수) + `FACE_CAPTURE_CONSENT`(선택).**

- **표정·음성 분석**은 동의 항목에서 내리고 **세션 설정**으로 다룬다
  (`PATCH /sessions/{id}/analysis-settings`). 세션마다 켜고 끌 수 있어 사용자 통제권이 더 크고,
  서버가 이미 그렇게 구현돼 있다.
- **누적 리포트 저장**은 통합 동의 범위에 포함하고 별도 항목을 두지 않는다.
  통합 동의 설명 문구에 분석 결과 저장을 명시한다.

| 후속 작업 | 담당 | 상태 |
|---|---|---|
| 가입 동의 화면을 서버 유형 기반으로 재작성 + `PUT /users/me/consents` 연결 | FE | ✅ 완료 |
| 동의 관리 화면을 `GET /users/me/consents` · `DELETE` 로 연결 | FE | ✅ 완료 |
| 표정·음성 항목을 동의 화면에서 제거 | FE | ✅ 완료 |
| 표정·음성 토글을 세션 설정 화면에 배치 | FE | 🟠 체크리스트 A31 에서 처리 |
| `consent_types` 에 `required` 컬럼 추가 | BE | 🟠 제안 |
| "기존 분석 데이터 삭제 요청" API | BE | 🔴 미구현 — 화면에서 내림 |

**필수/선택 판별은 현재 FE가 코드로 한다.** `consent_types` 에 구분 컬럼이 없기 때문이다
([types.ts](frontend/src/features/consent/types.ts) 의 `REQUIRED_CONSENT_CODES`).
유형이 늘 때마다 FE 배포가 필요하므로 **BE에 `required` 컬럼 추가를 요청**한다.
컬럼이 생기면 그 상수는 지운다.

**"기존 분석 데이터 삭제 요청" 버튼은 화면에서 내렸다.** 대응 API가 없어 눌러도
`console.log` 만 하고 있었다 — 삭제가 접수된 것처럼 보이는 쪽이 없는 것보다 나쁘다.
API가 생기면 되살린다.

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

### ✅ 확정: A안 — 백엔드 DTO 계약을 그대로 고정

**`SurveySaveRequest` 의 제약이 정본이다. 프론트가 여기에 맞춘다.**

| 항목 | 확정 규칙 |
|---|---|
| 선호 얼굴상 | **정확히 1개** (단일 선택) |
| 원하는 상대 성격 | **정확히 3개** · 중복 불가 |
| 본인 성격 | **정확히 3개** · 중복 불가 |
| 선호 나이 | 최소·최대 필수, 최대 ≥ 최소 |
| 개선 고민 | **1개 이상** · 중복 불가 |

복수 선택과 "상관없음" 은 이번 스프린트에서 다루지 않는다.
선호 얼굴상 복수화는 `MatchRequest` 의 단일 FK와 `MatchScorePolicy` 를 함께 바꿔야 해서
매칭 회귀가 따라온다 — 매칭이 안정화된 뒤 별도 스토리로 검토한다.

| 후속 작업 | 담당 | 상태 |
|---|---|---|
| **A23 온보딩 설문 화면 착수** — 차단 해제됨 | FE | 🟢 착수 가능 |
| 성격 3개 미만이면 제출 버튼 잠금 + "3개를 고르세요" 명시 | FE | 🟠 A23 에서 |
| 얼굴상 목록을 프로필 성별로 필터(`applicableGender`) | FE | 🟠 A23 에서 |
| 나이 범위 UI 상·하한·기본값 결정 | 기획 | 🟠 A23 착수 전 |

**UI가 서버 제약을 미리 막아야 한다.** 서버가 `@Size(min=3, max=3)` 이라 2개만 고르고 제출하면
검증 오류가 돌아온다. 개수를 채우기 전에는 제출을 잠가 사용자가 오류를 보지 않게 한다.

**온보딩 순서는 프로필 → 얼굴 → 설문을 유지한다.** 얼굴상 선택지가 `applicableGender` 로
성별에 따라 갈리므로(`TURTLE_FACE`·`HAMSTER_FACE` = 여성, `WOLF_FACE` = 남성),
프로필의 성별이 설문보다 먼저 확정돼야 한다.

**나이 범위는 서버가 사실상 검증하지 않는다.** `@Positive` 와 max ≥ min 만 본다.
UI 상·하한(예: 19~60)과 기본값은 기획이 정해야 한다.

---

## 남은 결정 · 요청 사항

세 건은 확정됐다. 확정에 딸려 나온 것들만 남는다.

| 항목 | 결정권자 | 막고 있는 것 | 급함 |
|---|---|---|---|
| **소셜 가입자 `birthDate`·`phoneNumber` 수집 경로** | BE + PO | **소셜 가입자는 매칭이 전혀 잡히지 않는다** | 🔴 |
| `SignupRequest.phoneNumber` 를 `@NotBlank` 로 승격 | BE | 확정 계약(전화 필수)과 서버가 불일치 | 🟠 |
| `consent_types` 에 `required` 컬럼 추가 | BE | FE가 코드로 하드코딩 중 | 🟠 |
| 기존 분석 데이터 삭제 요청 API | BE | 화면에서 기능을 내려둠 | 🟠 |
| 설문 나이 범위 UI 상·하한·기본값 | 기획 | A23 착수 전 필요 | 🟠 |
| 기능명세 §3.1~3.2 개정 | PO | 문서-코드 불일치 | 🟠 |

**FE가 지금 진행 가능한 것:** A23(온보딩 설문 화면) — A9 확정으로 차단이 풀렸다.

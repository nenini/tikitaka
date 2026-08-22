# MATCH 후보 탐색 쿼리 튜닝 보고서

## 1. 개요

이 문서는 TikiTaka 백엔드의 MATCH 기능이 매칭 요청을 저장하고 후보를
탐색하는 전체 흐름, 각 단계에서 데이터베이스가 담당하는 역할, 실행 계획
분석으로 발견한 병목과 개선 과정 및 결과를 정리한다.

이번 튜닝의 핵심은 인덱스를 새로 추가하는 것이 아니라, 이미 존재하는
인덱스를 사용하지 못하게 하던 쿼리 구조를 변경한 것이다.

### 최종 결과 요약

| 구분 | 변경 전 | 변경 후 | 개선 결과 |
| --- | ---: | ---: | ---: |
| DB 내부 실행 시간 | 27.2 ms | 2.53 ms | 90.7% 감소 |
| 100회 측정 p50 | 90.194 ms | 65.971 ms | 26.9% 감소 |
| 100회 측정 p95 | 94.847 ms | 69.665 ms | 26.5% 감소 |
| 스캔 대상 | 102,001행 | 방향별 인덱스 범위 | 전체 스캔 제거 |
| SQL 중복 제거 | DISTINCT 임시 테이블 | Java `Set` | 임시 테이블 제거 |
| 신규 인덱스 | - | 없음 | 쓰기 비용 증가 없음 |

---

## 2. 기존 MATCH 서비스 흐름

### 2.1 매칭 신청

사용자가 매칭을 신청하면 `MatchRequestService.create`가 다음 작업을 하나의
트랜잭션에서 처리한다.

1. 사용자 활성 상태와 이용 제한 여부를 확인한다.
2. PROFILE, FACE, SURVEY 데이터가 모두 준비됐는지 검증한다.
3. 신청 시점의 조건을 snapshot으로 만든다.
   - 선호 나이 범위
   - 선호 얼굴상
   - 사용자 실제 얼굴상
   - 선호 성격 3개
   - 사용자 성격 3개
   - 가능한 요일과 시간대
4. `match_requests`에 WAITING 요청을 저장한다.
5. 시간 조건을 `match_request_slots`에 저장한다.
6. 성격 조건을 `match_request_trait_snapshots`에 저장한다.
7. `active_match_requests`에 사용자별 활성 요청을 등록한다.
8. `match_jobs`에 처리할 작업을 등록한다.

신청 당시 snapshot을 저장하므로 PROFILE, FACE, SURVEY가 나중에 변경돼도
이미 대기 중인 요청의 조건은 자동으로 변하지 않는다. 사용자가 매칭 요청을
수정하면 기존 시간·성격 snapshot을 삭제하고 최신 데이터로 다시 저장한다.

`active_match_requests.userId`는 사용자별 활성 요청을 하나로 제한한다.
애플리케이션 검증과 함께 DB 제약 조건도 중복 신청을 방지한다.

### 2.2 DB Job Queue와 Worker

매칭 후보 탐색은 API 요청 스레드에서 즉시 완료하는 구조가 아니라 DB Job
Queue와 Scheduler Worker로 수행한다.

1. `MatchJobWorker`가 기본 1초 간격으로 실행된다.
2. lease가 만료된 PROCESSING 작업을 복구한다.
3. 실행 가능한 PENDING 작업을 batch 단위로 조회하고 잠근다.
4. 작업에 Worker ID와 lease 정보를 기록하여 선점한다.
5. `MatchJobProcessor`가 현재 관리자 매칭 정책 snapshot을 읽는다.
6. 최소 수락 시간과 최소 준비 시간을 반영해 가장 빠른 세션 가능 시각을
   계산한다.
7. `MatchCandidateService.findBestCandidate`로 최적 후보를 탐색한다.
8. 후보가 있으면 `MatchCreationService`가 동시성 검증 후 매칭을 생성한다.
9. 처리 성공 여부와 관계없이 현재 Job을 완료 상태로 변경한다. 실패하면
   retry와 lease 정책에 따라 실패 정보를 기록한다.

이 구조는 여러 Worker가 실행돼도 같은 요청을 동시에 처리하지 않도록
DB row lock과 Job 소유권을 사용한다.

### 2.3 후보 탐색 흐름

`MatchCandidateService.findBestCandidate`의 기존 처리 순서는 다음과 같다.

```text
원본 WAITING 요청 조회
        ↓
전체 WAITING 요청을 신청 시각순으로 조회
        ↓
본인 요청 제외
        ↓
사용자·프로필·시간·성격 snapshot 일괄 조회
        ↓
차단 사용자 조회
        ↓
최근 매칭 쿨다운 사용자 조회  ← 이번 튜닝 대상
        ↓
이미 활성 매칭이 있는 사용자 조회
        ↓
이용 제재 사용자 조회
        ↓
성별·양방향 나이 조건 필터
        ↓
향후 탐색 기간 내 공통 시간 확인
        ↓
얼굴상·성격 양방향 점수 계산
        ↓
점수 내림차순 → 신청 시각 → 요청 ID 순으로 최적 후보 선택
```

### 필수 조건

후보는 다음 필수 조건을 통과해야 한다.

- 양쪽 요청 상태가 WAITING이어야 한다.
- 본인과의 매칭이 아니어야 한다.
- 두 사용자 모두 활성 상태여야 한다.
- PROFILE과 생년월일 정보가 있어야 한다.
- 서로 다른 성별이어야 한다.
- 양쪽 모두 상대 나이를 각자의 선호 범위에 포함해야 한다.
- 서로 차단한 관계가 아니어야 한다.
- 현재 유효한 제재가 없어야 한다.
- 다른 PENDING_ACCEPTANCE 또는 CONFIRMED 매칭이 없어야 한다.
- 이전 매칭 상태별 쿨다운 기간이 끝나야 한다.
- 향후 정책상 탐색 기간 안에 공통 시간대가 있어야 한다.
- 현재 구현상 35분 세션 전체가 공통 시간 안에 포함돼야 한다.

### 점수와 최종 선택

필수 조건을 통과한 후보만 점수를 계산한다.

- 얼굴상: A 선호 ↔ B 실제, B 선호 ↔ A 실제를 양방향 계산
- 성격: A 선호 ↔ B 성격, B 선호 ↔ A 성격의 일치 비율 계산
- 얼굴상과 성격 가중치는 관리자 매칭 정책을 적용
- 총점이 높은 후보를 우선 선택
- 동점이면 먼저 신청한 요청, 다시 동점이면 작은 요청 ID를 선택

### 2.4 매칭 성립 시 동시성 재검증

후보 탐색과 실제 INSERT 사이에는 다른 Worker가 같은 사용자를 먼저 매칭할
수 있다. 따라서 `MatchCreationService.createMatch`는 다음 조건을 다시
검증한다.

1. 두 `match_requests` row를 `FOR UPDATE`로 잠근다.
2. 두 요청이 여전히 WAITING인지 확인한다.
3. `active_match_requests`가 여전히 해당 요청을 가리키는지 확인한다.
4. 다른 활성 매칭이 생기지 않았는지 확인한다.
5. 차단과 쿨다운 상태를 다시 확인한다.
6. 나이·성별 필수 조건과 공통 일정을 다시 계산한다.
7. 최신 상태에서 점수를 다시 계산한다.
8. `match_pairs`와 양쪽 `match_responses`를 저장한다.
9. 두 요청을 MATCH_FOUND로 변경하고 매칭 성립 이벤트를 발행한다.

후보 조회 단계는 빠른 탐색을 담당하고, 생성 단계는 잠금 기반의 최종
정합성 보장을 담당한다.

---

## 3. MATCH에서 데이터베이스가 사용되는 방식

### 3.1 주요 테이블

| 테이블 | 역할 |
| --- | --- |
| `match_requests` | 사용자별 매칭 조건 snapshot과 요청 상태 저장 |
| `active_match_requests` | 사용자별 현재 활성 요청을 한 건으로 제한 |
| `match_request_slots` | 신청 당시 가능한 요일·시간대 snapshot |
| `match_request_trait_snapshots` | 신청 당시 선호/실제 성격 snapshot |
| `match_jobs` | 후보 탐색 작업, 재시도, lease, Worker 소유권 저장 |
| `match_pairs` | 성립된 상대, 점수, 상태, 일정, 정책 snapshot, 종료 시각 저장 |
| `match_responses` | 사용자별 수락·거절 상태 저장 |
| `users`, `profiles` | 활성 상태, 생년월일, 성별 필터에 사용 |
| `user_blocks` | 양방향 차단 관계 필터에 사용 |
| `sanctions` | 현재 유효한 이용 제한 필터에 사용 |

### 3.2 후보 탐색 시 주요 DB 조회

| 조회 | 목적 | 기존 실행 계획 결과 |
| --- | --- | --- |
| WAITING 요청 | 전체 후보군 구성 | 요청 상태·시각 인덱스 사용 |
| 사용자/프로필 | 나이·성별·활성 상태 | ID 일괄 조회 |
| 시간 snapshot | 공통 세션 시각 계산 | 요청 ID 일괄 조회 |
| 성격 snapshot | 양방향 성격 점수 계산 | 요청 ID 일괄 조회 |
| 차단 관계 | 양방향 차단 후보 제외 | covering multi-range lookup |
| 이전 매칭 이력 | 상태별 쿨다운 후보 제외 | 전체 스캔 발생 |
| 활성 매칭 | 중복 매칭 방지 | 상태 인덱스 사용 |
| 유효 제재 | 제재 사용자 제외 | covering index 사용 |

후보마다 DB를 반복 조회하는 N+1 구조를 피하기 위해 사용자 ID와 요청 ID를
모은 후 관련 데이터를 일괄 조회하고 Java Map으로 그룹화한다. 다만 대규모
후보 ID가 차단 및 쿨다운 쿼리의 `IN` 목록으로 전달된다.

---

## 4. 성능 분석 환경

### 4.1 환경

- 기준 커밋: `origin/develop`의 `79b8263`
- 작업 브랜치: `feature/query-tuning-match`
- MySQL: 8.4.11
- 격리 Compose 프로젝트: `tikitaka-query-tuning`
- 측정일: 2026-08-22
- 운영 DB와 분리된 전용 Docker volume 사용
- 통계 갱신 후 warm-cache 기준으로 `EXPLAIN ANALYZE` 수행

### 4.2 테스트 데이터 규모

| 테이블 | 행 수 | 데이터 구성 |
| --- | ---: | --- |
| `users` | 10,003 | 기본 3명 + 성능 테스트 사용자 10,000명 |
| `match_requests` | 10,002 | WAITING 후보 10,000건 포함 |
| `active_match_requests` | 10,000 | 활성 요청 사용자 |
| `user_blocks` | 101,000 | 원본 사용자 관련 1,000건 + 무관한 100,000건 |
| `sanctions` | 500 | 현재 유효한 제재 500건 |
| `match_pairs` | 102,001 | 원본 관련 쿨다운 2,000건 + 무관한 이력 100,000건 |

원본 사용자는 `userId=10001`, 실제 후보 목록은 `10002..20000`의 9,999명으로
구성했다. 무관한 데이터를 충분히 추가해 특정 사용자 데이터만 있는 작은
테이블에서 측정하는 오류를 피했다.

### 4.3 측정 대상

실제 `findBestCandidate`가 후보 필터링 과정에서 사용하는 주요 쿼리를 각각
측정했다.

1. WAITING 요청 조회
2. 양방향 차단 조회
3. 양방향 쿨다운 조회
4. 현재 유효한 제재 조회
5. 활성 매칭 조회

초기 분석에서 단순 ID 범위 조건으로 대체하지 않고, 애플리케이션과 동일한
9,999개 후보 ID의 실제 `IN` 목록을 생성해 실행 계획을 다시 측정했다.

---

## 5. 기존 실행 계획과 병목

### 5.1 전체 기준 결과

| 쿼리 | 실제 읽은 행 | 반환 행 | 실행 시간 | 주요 실행 계획 |
| --- | ---: | ---: | ---: | --- |
| WAITING 요청 | 10,000 | 10,000 | 9.17 ms | `IDX_match_requests_status_requested` lookup |
| 양방향 차단 | 1,000 | 1,000 | 8.36 ms | 19,998개 point range 중 결과 행 lookup |
| 양방향 쿨다운 | 102,001 | 2,000 | 27.2 ms | full scan + DISTINCT 임시 테이블 |
| 유효 제재 | 500 | 500 | 0.23 ms | covering index scan |
| 활성 매칭 | 0 | 0 | 0.01 ms | status index range scan |

WAITING, 제재, 활성 매칭 조회는 기존 인덱스를 사용했다. 차단 조회는 많은
point range를 계획하지만 전체 스캔 없이 실제 결과 1,000건만 읽었다.
가장 명확한 병목은 쿨다운 조회였다.

### 5.2 기존 쿨다운 쿼리 구조

쿨다운은 사용자가 `userAId` 또는 `userBId` 어느 쪽에 저장돼도 상대방을
찾아야 하므로 다음 형태로 작성돼 있었다.

```sql
SELECT DISTINCT CASE
    WHEN userAId = :sourceUserId THEN userBId
    ELSE userAId
END AS candidateUserId
FROM match_pairs
WHERE (
    (userAId = :sourceUserId AND userBId IN (:candidateUserIds))
    OR
    (userBId = :sourceUserId AND userAId IN (:candidateUserIds))
)
AND (
    상태별 최근 매칭 쿨다운 조건
);
```

관련 인덱스는 이미 존재했다.

- `IDX_match_pairs_user_a_cooldown`
- `IDX_match_pairs_user_b_cooldown`

하지만 서로 다른 선두 컬럼의 조건을 하나의 `OR`로 묶고, `CASE`와
`DISTINCT`까지 적용하면서 MySQL Optimizer는 방향별 인덱스 조회 대신
`match_pairs` 전체 스캔을 선택했다.

```text
Table scan on temporary
  (actual time=27.1..27.2 rows=2000 loops=1)
  -> Temporary table with deduplication
     (actual time=27.1..27.1 rows=2000 loops=1)
     -> Filter
        (actual time=0.066..26.8 rows=2000 loops=1)
        -> Table scan on match_pairs
           (actual time=0.0386..21.2 rows=102001 loops=1)
```

### 병목의 본질

- 인덱스가 없어서 느린 문제가 아니었다.
- 2,000건을 얻기 위해 102,001건 전체를 읽었다.
- `DISTINCT` 처리를 위한 임시 테이블도 생성했다.
- `match_pairs` 이력이 증가할수록 조회 비용도 함께 증가하는 구조였다.
- 새 인덱스를 추가해도 `OR` 구조 때문에 선택되지 않을 가능성이 있었다.

---

## 6. 튜닝 가설과 대안 비교

다음 두 가지 대안을 실제 데이터로 비교했다.

### 대안 A: 방향 분리 + 후보 제한 유지

- `userAId = source` 방향과 `userBId = source` 방향을 별도 SELECT로 분리
- 두 결과를 `UNION ALL`로 결합
- 두 방향 모두 기존 `candidateUserIds IN (...)` 조건 유지

### 대안 B: 방향 분리 + source 조건만 사용

- 방향별 SELECT로 분리
- 후보 ID 목록은 제거하고 원본 사용자의 전체 이력을 조회
- 애플리케이션에서 후보군과 다시 교차

### 비교 결과

| 대안 | 반환 결과 | DB 실행 시간 | 판단 |
| --- | ---: | ---: | --- |
| 기존 쿼리 | 2,000 | 27.2 ms | 전체 스캔 발생 |
| 대안 A | 2,000 | 2.53 ms | 가장 빠르고 기존 계약 보존 |
| 대안 B | 2,000 | 2.93 ms | 빠르지만 조회 범위가 넓어짐 |

세 쿼리의 결과 집합 차이를 양방향으로 비교했고 모두 0건이었다. 대안 A가
더 빠르고 Repository 메서드의 입력 후보 제한 계약도 그대로 유지하므로
최종 개선안으로 선택했다.

---

## 7. 적용한 쿼리 튜닝

### 7.1 개선 쿼리

```sql
SELECT userBId AS candidateUserId
FROM match_pairs
WHERE userAId = :sourceUserId
  AND userBId IN (:candidateUserIds)
  AND (상태별 최근 매칭 쿨다운 조건)

UNION ALL

SELECT userAId AS candidateUserId
FROM match_pairs
WHERE userBId = :sourceUserId
  AND userAId IN (:candidateUserIds)
  AND (상태별 최근 매칭 쿨다운 조건);
```

### 7.2 개선 원리

첫 번째 SELECT는 `userAId`가 선두인 기존 쿨다운 인덱스를 사용하고,
두 번째 SELECT는 `userBId`가 선두인 인덱스를 사용한다. Optimizer가 하나의
복잡한 OR 조건을 해석할 필요 없이 각 방향에서 명확한 범위 조회를 수행한다.

`UNION`이 아니라 `UNION ALL`을 선택한 이유는 SQL의 중복 제거 비용을 없애기
위해서다. Repository는 원래 `Set<Long>`을 반환하고 `HashSet`으로 결과를
변환한다. 같은 상대와 복수 이력이 존재해도 Java에서 기존과 동일하게
중복이 제거되므로 DB가 임시 테이블을 만들어 중복 제거할 필요가 없다.

### 7.3 인덱스를 추가하지 않은 이유

- 필요한 방향별 복합 인덱스가 이미 존재했다.
- 실행 계획에서 쿼리 분리 후 해당 인덱스가 사용되는 것을 확인했다.
- 새 인덱스는 INSERT/UPDATE 및 저장 공간 비용을 증가시킨다.
- 병목 원인은 인덱스 부재가 아니라 기존 인덱스를 방해하는 SQL 구조였다.

따라서 Flyway 마이그레이션 없이 Repository SQL만 수정했다.

---

## 8. 테스트 및 검증 방법

### 8.1 실행 계획 검증

`EXPLAIN ANALYZE`로 예상 cost가 아니라 실제 실행 시간과 실제 읽은 행 수를
확인했다. 변경 전·후 모두 같은 데이터, 같은 후보 목록, warm-cache 조건을
사용했다.

### 8.2 결과 동등성 검증

기존 쿼리와 두 개선 대안의 결과를 각각 임시 테이블에 저장하고 다음 차집합
건수를 확인했다.

- 기존 결과 - 개선 결과
- 개선 결과 - 기존 결과

모든 차집합은 0건이고 결과 수는 2,000건으로 동일했다.

### 8.3 Repository 통합 테스트

H2 MySQL 호환 모드와 전체 Flyway 스키마를 사용한 통합 테스트에 다음
경우를 추가했다.

- 원본 사용자가 `userAId`에 저장된 이력
- 원본 사용자가 `userBId`에 저장된 이력
- 동일 상대와 여러 쿨다운 이력이 있는 경우
- 쿨다운 기간이 지난 상대
- 입력 후보 목록에 포함되지 않은 상대
- 빈 후보 목록

중복 이력은 한 사용자 ID로 반환되고, 기간이 지난 상대와 후보 목록 밖의
사용자는 제외되는 것을 검증했다.

### 8.4 반복 성능 측정

단발성 실행 계획 결과가 우연이 아닌지 확인하기 위해 다음 조건으로 반복
측정했다.

- 동일한 MySQL 연결 사용
- 기존 쿼리와 개선 쿼리를 번갈아 실행
- 각각 5회 예열
- 각각 100회 본 측정
- 매회 반환되는 2,000행을 클라이언트에서 모두 수신
- 최소, 평균, p50, p95, 최대 기록

### 8.5 전체 회귀 테스트

```bash
bash gradlew test
```

전체 백엔드 테스트 결과는 `BUILD SUCCESSFUL`이었다. `git diff --check`도
통과했다.

---

## 9. 최종 성능 결과

### 9.1 DB 내부 실행 시간

| 구분 | 실행 계획 | 시간 |
| --- | --- | ---: |
| 변경 전 | 102,001행 full scan + DISTINCT temporary table | 27.2 ms |
| 변경 후 | 방향별 cooldown index lookup + UNION ALL | 2.53 ms |

DB 내부 실행 시간은 약 90.7% 감소했다.

### 9.2 애플리케이션 관점 반복 측정

| 구분 | 결과 수 | 최소 | p50 | p95 | 최대 | 평균 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 변경 전 | 2,000 | 82.448 ms | 90.194 ms | 94.847 ms | 114.518 ms | 89.937 ms |
| 변경 후 | 2,000 | 59.922 ms | 65.971 ms | 69.665 ms | 84.142 ms | 65.665 ms |

- p50: 26.9% 감소
- p95: 26.5% 감소
- 평균: 약 27.0% 감소
- 최악값: 114.518 ms에서 84.142 ms로 감소

DB 내부 실행 시간은 크게 감소했지만 애플리케이션 관점의 개선율은 약
26~27%였다. 9,999개의 후보 ID를 바인딩하고 2,000개의 결과를 네트워크로
전송하고 역직렬화하는 비용은 변경 전·후에 공통으로 남아 있기 때문이다.

이 차이는 측정 오류가 아니라 DB 실행 외의 고정 비용이 전체 응답 시간에서
차지하는 비중을 보여준다.

---

## 10. 개선 전후 비교

| 항목 | 개선 전 | 개선 후 |
| --- | --- | --- |
| 양방향 관계 처리 | 하나의 OR 조건 | 방향별 SELECT |
| 상대 ID 계산 | CASE | 방향별 컬럼 직접 선택 |
| 결과 결합 | DISTINCT | UNION ALL |
| 중복 제거 위치 | MySQL 임시 테이블 | 기존 Java `HashSet` |
| 인덱스 사용 | 방향별 인덱스 미사용 | 기존 양방향 인덱스 사용 |
| 읽는 데이터 | `match_pairs` 전체 | 원본 사용자 관련 인덱스 범위 |
| 신규 인덱스 | - | 없음 |
| 결과 정합성 | 기준 | 동일 |

---

## 11. 결론과 배운 점

이번 병목은 “데이터가 많으니 인덱스를 추가한다”로 해결할 문제가 아니었다.
스키마에는 이미 적절한 방향별 인덱스가 있었지만, 양방향 관계를 하나의
`OR`와 `CASE`, `DISTINCT`로 처리한 SQL 때문에 Optimizer가 이를 사용하지
못했다.

실행 계획에서 전체 스캔과 임시 테이블을 확인하고, 방향별 쿼리 분리를
가설로 세운 뒤 실제 데이터로 대안을 비교했다. 결과 동등성, 경계 조건,
반복 성능, 전체 회귀 테스트까지 확인한 후 가장 빠르면서 기존 메서드 계약을
유지하는 대안을 선택했다.

핵심적으로 얻은 경험은 다음과 같다.

1. 인덱스 존재 여부만으로 실제 사용 여부를 판단할 수 없다.
2. `EXPLAIN ANALYZE`로 예상값이 아닌 실제 읽은 행과 시간을 확인해야 한다.
3. 양방향 관계의 `OR`는 방향별 인덱스 사용을 방해할 수 있다.
4. 계층별 책임을 고려하면 DB의 불필요한 DISTINCT를 제거할 수 있다.
5. 성능 개선은 결과 동등성과 회귀 테스트를 함께 증명해야 한다.
6. DB 내부 시간과 애플리케이션 체감 시간은 구분해서 측정해야 한다.
7. 신규 인덱스 없이 쿼리 구조만으로 병목을 해결하면 쓰기 비용 증가를
   피할 수 있다.

---

## 12. 재현 자료

관련 자료는 `backend/docs/query-tuning/match-candidate`에 있다.

| 파일 | 용도 |
| --- | --- |
| `seed-baseline.sql` | 격리된 테스트 DB에 성능 데이터 생성 |
| `baseline-explain.sql` | 기존 주요 쿼리 실행 계획 측정 |
| `baseline-results.md` | 기존 실행 계획 결과 |
| `cooldown-experiment.sql` | 대안별 결과 동등성과 실행 계획 비교 |
| `tuned-results.md` | 최종 반복 측정 및 개선 결과 |
| `README.md` | 측정 환경과 재현 방법 |

### 적용 코드

- `MatchCandidateConstraintRepository.findCooldownCandidateUserIds`
- `MatchRepositoryTest.findsCooldownCandidatesInBothPairDirectionsWithoutDuplicateResults`

### 적용 커밋

```text
9dd1612 perf(match): optimize cooldown candidate query
```

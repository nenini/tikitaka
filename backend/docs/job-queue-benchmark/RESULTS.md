# MATCH Scheduler → DB Job Queue 성능·안정성 실험 결과

## 1. 결론

DB Job Queue 도입의 핵심 효과는 단일 실행 속도 향상이 아니라 **작업 진행성,
수평 확장성, 중복 방지, 장애 복구 가능성**이었다.

- 후보가 없는 1,000건에서 직접 Scheduler는 1,000회 시도해도 선두 50건만
  확인했지만 Queue는 1,000건을 모두 한 번씩 처리했다.
- 성공 작업 5,000건, Worker 1개에서는 Queue가 직접 방식보다 13.8% 느렸다.
  Job 상태 전환과 선점 트랜잭션 비용이 실제로 존재한다.
- Worker 2개에서는 Queue 처리량이 직접 방식의 1.85배, Worker 4개에서는
  2.29배였다.
- 직접 방식은 Worker 2개에서 5,000회, Worker 4개에서 15,000회의 중복
  시도를 만들었다. Queue는 모든 조건에서 중복 완료가 0건이었다.
- 실제 Java 테스트로 stale PROCESSING 복구, 지수 backoff, 최대 시도 후
  FAILED 전환, 동시 사용자 중복 배정 방지를 확인했다.

따라서 “Queue가 항상 더 빠르다”는 결론은 틀리다. 단일 Worker 처리만 보면
추가 비용이 있지만, 요청량 증가와 다중 Worker 운영에서 처리량을 확장하고
작업 상태를 추적·복구하기 위해 필요한 구조라는 결론이다.

## 2. 구조 변경 근거

Git 이력으로 다음 변경을 확인했다.

| 커밋 | 시각 | 변경 |
| --- | --- | --- |
| `6bc5783` | 2026-07-27 10:30 KST | WAITING 요청을 직접 처리하는 Scheduler |
| `f19a9d1` | 2026-07-27 12:05 KST | `match_jobs` 기반 Job Queue와 Worker |
| `4605bf8` | 2026-07-27 12:14 KST | 재시도, backoff, stale Job 복구 |

현재 구현은 외부 메시지 브로커가 아니라 MySQL의 `match_jobs`를 사용하는
DB Job Queue다. Scheduler는 사라진 것이 아니라 Queue 적재와 Worker polling을
주기적으로 실행하는 역할로 축소됐다.

## 3. 실험 설계

### 공통 조건

- 데이터베이스: 격리된 Docker Compose MySQL
- 합성 매칭 요청: 최대 10,000건 (`matchRequestId` 10,001~20,000)
- 관련 데이터: `match_pairs` 102,001건, `user_blocks` 101,000건
- batch 크기: 50건
- dispatch 후 동일한 모의 작업: batch당 5ms
- Queue INSERT 시간: 처리량 측정 전 준비 단계이므로 제외
- 반복: 1,000건은 5회, 5,000건은 3회
- 대표값: 반복 측정의 중앙값

후보 점수 계산 성능은 양쪽에 동일하므로 이번 실험에서 분리했다. 측정 대상은
요청 선택, Job 선점, 상태 변경, Worker 확장에 따른 dispatch 계층이다.

### 시나리오 A: 후보 없음

초기 직접 방식에서 매칭 상대가 없으면 요청은 WAITING에 남는다. 다음 주기에
같은 정렬 선두 batch가 다시 선택되는 현상을 재현했다. Queue 방식은 후보가
없더라도 해당 Job 처리를 끝내 다음 요청으로 진행한다.

### 시나리오 B: 성공 작업 처리량

모든 요청의 작업이 성공한다고 가정했다. 직접 방식은 WAITING 요청을 조회한
뒤 상태를 바꾸고, Queue 방식은 PENDING Job을 선점해 PROCESSING과 COMPLETED로
전환한다. Worker 수를 1, 2, 4개로 변경했다.

## 4. 측정 결과

### 4.1 후보가 없을 때의 진행성 — 요청 1,000건

| 방식 | 시도 | 고유 처리 | 중복 시도 | 진행률 | 경과 시간 중앙값 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 직접 Scheduler | 1,000 | 50 | 950 | 5% | 214.595ms |
| DB Job Queue | 1,000 | 1,000 | 0 | 100% | 287.601ms |

직접 방식의 짧은 경과 시간은 성능 우위가 아니다. 전체 1,000건 중 950건을
보지 못하고 같은 50건을 20회 반복한 결과다. Queue는 같은 시도 횟수로
고유 요청을 20배 더 처리했다.

### 4.2 성공 처리량 — 요청 5,000건

| Worker | 방식 | 경과 시간 중앙값 | 처리량 중앙값 | 시도 | 중복 시도 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 직접 Scheduler | 1,174.356ms | 4,257.651건/s | 5,000 | 0 |
| 1 | DB Job Queue | 1,361.927ms | 3,671.270건/s | 5,000 | 0 |
| 2 | 직접 Scheduler | 1,186.013ms | 4,215.804건/s | 10,000 | 5,000 |
| 2 | DB Job Queue | 641.492ms | 7,794.328건/s | 5,000 | 0 |
| 4 | 직접 Scheduler | 1,156.750ms | 4,322.454건/s | 20,000 | 15,000 |
| 4 | DB Job Queue | 505.350ms | 9,894.131건/s | 5,000 | 0 |

Worker 1개에서는 Queue가 13.8% 느렸다. 반면 Worker를 늘리면 다음 차이가
나타났다.

- Worker 2개: Queue가 직접 방식보다 처리량 84.9% 증가
- Worker 4개: Queue가 직접 방식보다 처리량 128.9% 증가
- Queue 자체 확장: Worker 1→2에서 2.12배, 1→4에서 2.70배
- 직접 방식: Worker를 늘려도 처리량은 약 4.2~4.3천 건/s에 머물렀다.

직접 방식의 각 Worker가 같은 WAITING 선두 batch를 읽어 중복 작업을 수행한
반면, Queue는 트랜잭션 선점으로 Job 소유권을 분리했다.

### 4.3 1,000건 교차 확인

1,000건에서도 같은 경향이 재현됐다.

| Worker | 직접 Scheduler | DB Job Queue | Queue/직접 | 직접 중복 | Queue 중복 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3,592.079건/s | 3,647.930건/s | 1.02배 | 0 | 0 |
| 2 | 3,526.202건/s | 7,350.036건/s | 2.08배 | 1,000 | 0 |
| 4 | 3,636.186건/s | 9,700.199건/s | 2.67배 | 3,000 | 0 |

### 4.4 Lock 경합

현재 구현과 같은 `FOR UPDATE` 선점에서 4 Worker 실행 중 lock conflict가
관찰됐다.

- 1,000건 × 5회: 총 9회
- 5,000건 × 3회: 총 1회
- 모든 실행에서 최종 유실 0건, 중복 완료 0건

벤치마크 도구는 MySQL 오류 1205/1213을 기록하고 같은 실행 안에서 다시
시도한다. 이 수치는 Queue가 무경합이라는 뜻이 아니며, Worker 수를 더 늘릴
경우 `SKIP LOCKED` 또는 원자적 claim 방식의 추가 비교가 필요하다는 근거다.

## 5. 안정성 검증

실제 애플리케이션 코드에 대해 다음 테스트를 실행했다.

```bash
bash gradlew test \
  --tests 'com.date.backend.domain.match.application.MatchJobRecoveryIntegrationTest' \
  --tests 'com.date.backend.domain.match.application.MatchJobFailureServiceTest' \
  --tests 'com.date.backend.domain.match.policy.MatchJobRetryPolicyTest' \
  --tests 'com.date.backend.domain.match.application.MatchJobPopulationConcurrencyTest' \
  --tests 'com.date.backend.domain.match.scheduler.MatchJobWorkerTest'
```

결과: `BUILD SUCCESSFUL`

검증된 항목은 다음과 같다.

- 4개 처리 스레드에서도 사용자 중복 매칭 없이 8개 요청이 4쌍으로 완료
- Worker가 멈춰 60초를 넘긴 PROCESSING Job을 PENDING으로 복구
- 복구 시 workerId와 claimedAt 해제, attemptCount 유지
- 최초 5초부터 지수 backoff 적용, 최대 300초로 제한
- 최대 3회 시도 후 최종 FAILED 전환
- 개별 Job 실패가 Worker 전체 반복을 중단하지 않고 실패 상태로 기록

성능 측정은 실제 MySQL 동시 선점 특성을, Java 테스트는 도메인 상태 전이와
장애 복구 정책을 검증한다. Java 통합 테스트 일부는 H2 MySQL 호환 모드이므로
이를 MySQL 장애 주입 테스트로 과장하지 않는다.

## 6. 한계와 후속 실험

- 로컬 합성 데이터이며 운영 트래픽 결과가 아니다.
- 후보 탐색과 점수 계산을 제외했으므로 전체 매칭 API 응답 시간과 다르다.
- polling 간격을 제외해 순수 처리 구간만 비교했다.
- Queue 적재 시간은 제외했지만 Job 상태 전환 시간은 포함했다.
- 직접 방식의 다중 Worker는 이전 구조를 수평 확장했을 때의 경쟁 상황을
  재현한 것이다.
- 4 Worker에서 관찰된 lock conflict를 기준으로 `FOR UPDATE SKIP LOCKED`와
  현재 방식의 후속 A/B 실험을 고려할 수 있다.

## 7. 재현 자료

- 실행 도구: `benchmark.py`
- 결과 집계: `summarize.py`
- 원시 반복 결과: `results/throughput-*.json`, `results/progress-1000.json`
- 집계 결과: `results/summary.json`, `results/summary.csv`

원시 결과를 함께 보존해 중앙값만으로 분산이나 불리한 결과를 숨기지 않도록
했다.

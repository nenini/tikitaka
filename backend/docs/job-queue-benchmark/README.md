# MATCH Scheduler vs DB Job Queue 실험

## 목적

초기 MATCH 구현의 직접 Scheduler 방식과 현재 DB Job Queue + Worker 방식의
차이를 같은 코드·데이터·DB 환경에서 재현한다. 이 실험은 과거 의사결정
당시에 수행한 자료가 아니라 Git 이력으로 초기 구조를 확인한 뒤 현재 시점에
수행하는 사후 비교 실험이다.

DB Job Queue가 무조건 더 빠르다는 결론을 전제하지 않는다. 다음 항목을
분리해 측정한다.

1. 후보가 없을 때 서로 다른 요청으로 계속 진행하는가
2. 성공 작업을 처리하는 dispatch 계층의 순수 처리량과 추가 비용
3. Worker 수 증가에 따른 처리량과 lock 경합
4. Worker 중단 후 stale PROCESSING Job 복구
5. retry/backoff 및 최대 시도 횟수 이후 FAILED 전환
6. 작업 유실 및 중복 처리 여부

## 비교 대상

### 직접 Scheduler

초기 커밋 `6bc5783`의 구조를 현재 DB에서 재현한다.

```text
WAITING 요청 batch 조회
→ 요청별 작업 수행
→ 성공한 요청만 상태 변경
```

후보가 없으면 WAITING 상태가 유지되므로 다음 주기에 같은 선두 batch를
다시 조회할 수 있다.

### DB Job Queue

커밋 `f19a9d1`, `4605bf8`을 거쳐 완성된 현재 구조를 재현한다.

```text
match_jobs PENDING 등록
→ Worker가 row lock으로 batch 선점
→ PROCESSING
→ 작업 수행
→ COMPLETED 또는 retry/FAILED
```

후보가 없어도 현재 Job은 완료되므로 다음 Job으로 진행한다.

## 성능 실험 시나리오

### no-candidate-progress

전체 요청 수를 처리할 만큼의 cycle을 실행하되 작업 성공으로 요청 상태가
바뀌지 않는 상황을 재현한다.

- 직접 Scheduler: 동일 WAITING 선두 batch가 몇 번 다시 선택되는지 측정
- Job Queue: 전체 Job 중 고유하게 완료한 수를 측정
- 핵심 지표: `progress_ratio`, `duplicate_attempts`

이 시나리오는 속도 비교가 아니라 작업 진행성과 반복 스캔 증폭을 확인한다.

### successful-throughput

dispatch 이후 모든 작업이 성공한다고 가정한다. 양쪽 모두 동일한
`--work-ms` 지연을 적용한다.

- 핵심 지표: 전체 완료 시간, 초당 처리량, batch p50/p95
- Queue의 INSERT 준비 시간은 본 측정에서 제외
- Job 상태 전환 비용은 실제 실행 비용이므로 포함

## 데이터

쿼리 튜닝에서 만든 격리 fixture를 재사용한다.

- `matchRequestId`: 10,001~20,000
- 최대 WAITING 요청: 10,000건
- `match_pairs`: 102,001건
- `user_blocks`: 101,000건
- 실사용자 데이터와 분리된 Docker Compose 프로젝트 사용

스크립트는 요청 ID와 `perf-user-*@example.com` 이메일을 함께 검증한다.
합성 fixture가 아니면 실행을 중단한다.

## 실행 준비

백엔드 디렉터리에서 격리 DB를 실행하고 기존 seed를 적용한다.

```bash
docker compose \
  -p tikitaka-query-tuning \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d mysql

docker compose \
  -p tikitaka-query-tuning \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T mysql mysql -udate -pdate date \
  < docs/query-tuning/match-candidate/seed-baseline.sql
```

벤치마크 중에는 애플리케이션의 실제 `MatchJobWorker`가 Job을 먼저 소비하지
않도록 backend 컨테이너를 실행하지 않는다. 이미 실행 중이면 다음 명령으로
중지한 뒤 측정한다.

```bash
docker compose \
  -p tikitaka-query-tuning \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  stop backend
```

Python 가상 환경에 DB driver를 설치한다.

```bash
python3 -m venv .benchmark-venv
.benchmark-venv/bin/pip install pymysql
```

## 실행 예시

```bash
.benchmark-venv/bin/python \
  docs/job-queue-benchmark/benchmark.py \
  --requests 1000 \
  --batch-size 50 \
  --workers 1 \
  --work-ms 2 \
  --repeat 5 \
  --scenario all \
  --output docs/job-queue-benchmark/results/requests-1000-workers-1.json
```

Worker 확장 비교:

```bash
for workers in 1 2 4; do
  .benchmark-venv/bin/python \
    docs/job-queue-benchmark/benchmark.py \
    --requests 1000 \
    --batch-size 50 \
    --workers "$workers" \
    --work-ms 10 \
    --scenario throughput \
    --output "docs/job-queue-benchmark/results/workers-${workers}.json"
done
```

## 해석 시 주의사항

- 이 도구는 후보 점수 계산 속도가 아니라 dispatch 구조를 비교한다.
- 두 방식의 polling 대기 시간은 제외하고 수동으로 즉시 실행한다.
- 직접 Scheduler의 성공 처리는 benchmark를 위해 CANCELLED 상태로 전환한다.
- Queue 준비를 위한 Job INSERT 시간은 처리량에서 제외한다.
- 로컬 합성 데이터 결과를 운영 환경 수치로 일반화하지 않는다.
- Queue 방식이 단일 Worker에서 느려도 안정성과 확장성 결과를 별도로 본다.

## 결과 집계

원시 JSON 전체를 중앙값 기준 JSON과 CSV로 집계한다.

```bash
python3 docs/job-queue-benchmark/summarize.py \
  docs/job-queue-benchmark/results \
  --output docs/job-queue-benchmark/results/summary.json
```

측정 결과와 해석은 [RESULTS.md](RESULTS.md)에 정리되어 있다.

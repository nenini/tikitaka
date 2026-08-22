# MATCH 후보 탐색 쿼리 튜닝

## 목적

`MatchCandidateService.findBestCandidate`가 후보를 찾을 때 실행하는 SQL의
실행 계획과 실제 수행 시간을 MySQL 8.4에서 측정한다. 이 디렉터리의
baseline 자료는 애플리케이션 쿼리나 인덱스를 변경하기 전의 기준선이며,
최종 비교 결과는 [tuned-results.md](tuned-results.md)에 기록한다.

## 측정 환경

- Git 기준: `origin/develop` (`79b8263`)
- 브랜치: `feature/query-tuning-match`
- MySQL: 8.4.11
- 격리 Compose 프로젝트: `tikitaka-query-tuning`
- 측정일: 2026-08-22

## 데이터 규모

| 테이블 | 행 수 | 용도 |
| --- | ---: | --- |
| `users` | 10,003 | 로컬 기본 사용자 3명 + 성능 사용자 10,000명 |
| `match_requests` | 10,002 | WAITING 후보 10,000건 포함 |
| `active_match_requests` | 10,000 | 활성 요청 사용자 |
| `user_blocks` | 101,000 | 대상 관계 1,000건 + 무관한 관계 100,000건 |
| `sanctions` | 500 | 현재 유효한 제재 |
| `match_pairs` | 102,001 | 쿨다운 대상 2,000건 + 무관한 이력 100,000건 |

성능 데이터 ID는 로컬 프로필의 기본 데이터와 충돌하지 않도록 10,001부터
사용한다. 운영 데이터나 실사용자 정보는 포함하지 않는다.

## 재현 순서

백엔드 디렉터리에서 실행한다.

```bash
docker compose \
  -p tikitaka-query-tuning \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d mysql backend

docker compose \
  -p tikitaka-query-tuning \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T mysql mysql -udate -pdate date \
  < docs/query-tuning/match-candidate/seed-baseline.sql

docker compose \
  -p tikitaka-query-tuning \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  exec -T mysql mysql -udate -pdate date \
  < docs/query-tuning/match-candidate/baseline-explain.sql
```

`seed-baseline.sql`은 빈 테스트 DB에서 한 번 실행하는 스크립트다. 반복
측정할 때는 데이터를 다시 넣지 않고 `baseline-explain.sql`만 실행한다.

## 기준 결과 요약

상세 실행 계획은 [baseline-results.md](baseline-results.md)에 기록한다.

| 쿼리 | 실제 읽은 행 | 반환 행 | 실제 시간 | 주요 계획 |
| --- | ---: | ---: | ---: | --- |
| WAITING 요청 조회 | 10,000 | 10,000 | 9.17 ms | `IDX_match_requests_status_requested` lookup |
| 양방향 차단 조회 | 1,000 | 1,000 | 8.36 ms | 19,998개 point range 후보 중 1,000건 lookup |
| 양방향 쿨다운 조회 | 102,001 | 2,000 | 27.2 ms | full table scan + DISTINCT temporary table |
| 유효 제재 조회 | 500 | 500 | 0.23 ms | covering index scan |
| 활성 매칭 조회 | 0 | 0 | 0.01 ms | status index range scan |

## 기준선에서 확인한 병목

차단과 쿨다운은 모두 관계의 양쪽 방향을 하나의 `OR` 조건으로 조회한다.
차단 쿼리는 실제 9,999개 ID의 IN 목록을 전달했을 때 multi-range lookup을
선택해 결과 행만 읽었다. 반면 쿨다운 쿼리는 방향별 인덱스가 이미 있어도
이를 사용하지 않았다.

- 차단 조회는 전체 스캔을 피하지만 19,998개 point range를 계획하고
  실행하는 비용이 있다.
- 쿨다운 조회는 `match_pairs` 102,001행을 모두 읽고 DISTINCT 임시
  테이블을 만든다.
- 반대로 WAITING, 제재, 활성 매칭 조회는 기존 인덱스를 사용한다.

쿨다운 쿼리의 양방향 `OR`를 방향별 인덱스 조회와 `UNION ALL`로 분리해
애플리케이션에 반영했다. 신규 인덱스 없이 전체 스캔과 DISTINCT 임시
테이블을 제거했으며, 100회 반복 측정과 결과 동등성 검증을 완료했다.

차단 쿼리는 현재 전체 스캔 없이 결과 행만 읽으므로 이번 변경의 명확한
병목 범위에는 포함하지 않았다. 별도의 데이터 분포와 반복 측정 근거가
확보될 때 추가 변경 여부를 판단한다.

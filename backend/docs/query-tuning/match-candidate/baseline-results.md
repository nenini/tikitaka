# Baseline EXPLAIN ANALYZE 결과

측정 조건은 [README.md](README.md)를 따른다. 아래 시간은 통계 갱신 후
동일 세션에서 실행한 warm-cache 기준 1회 결과다. 최종 성능 비교에서는
반복 측정값과 p50/p95를 별도로 기록한다.

## 1. WAITING 요청 조회

```text
Index lookup on request using IDX_match_requests_status_requested
  (status='WAITING')
  (cost=560 rows=4874)
  (actual time=0.12..9.17 rows=10000 loops=1)
```

기존 `(status, requestedAt, matchRequestId)` 인덱스가 WHERE와 ORDER BY를
함께 지원한다. 현재 기준에서 구조 변경 우선순위가 낮다.

## 2. 양방향 차단 조회

```text
Filter
  (actual time=0.0435..8.36 rows=1000 loops=1)
  -> Covering index range scan on user_blocks
     using UK_user_blocks_blocker_blocked
     over 19,998 point ranges
     (actual time=0.0311..8.21 rows=1000 loops=1)
```

애플리케이션과 동일하게 9,999개 후보 ID를 IN 목록으로 전달했다. MySQL은
전체 스캔 대신 point range lookup을 선택했지만 양방향을 합쳐 19,998개
range를 계획한다. 실제 읽은 행은 반환 행과 같은 1,000건이다.

## 3. 양방향 쿨다운 조회

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

`userAId`와 `userBId` 방향별 복합 인덱스가 존재하지만 사용되지 않았다.
전체 스캔과 DISTINCT 임시 테이블이 발생해 현재 가장 명확한 병목이다.

## 4. 유효 제재 조회

```text
Group (no aggregates)
  (actual time=0.0312..0.23 rows=500 loops=1)
  -> Filter
     (actual time=0.0239..0.178 rows=500 loops=1)
     -> Covering index scan on sanctions
        using IDX_sanctions_user_active
        (actual time=0.0199..0.0768 rows=500 loops=1)
```

기존 복합 인덱스를 covering index로 사용한다.

## 5. 활성 매칭 조회

```text
Filter
  (actual time=0.0102..0.0102 rows=0 loops=1)
  -> Index range scan on pair using IDX_match_pairs_status_deadline
     (actual time=0.00971..0.00971 rows=0 loops=1)
```

성능 데이터에는 활성 상태 쌍을 넣지 않았기 때문에 결과는 0건이다.
상태 선행 인덱스로 빠르게 종료되며 현재 병목 근거는 없다.

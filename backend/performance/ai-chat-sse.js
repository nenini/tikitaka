import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TOKENS = csv(__ENV.ACCESS_TOKENS || __ENV.ACCESS_TOKEN);
const SESSION_IDS = csv(__ENV.SESSION_IDS || __ENV.SESSION_ID);
const VUS = Number(__ENV.VUS || 1);
const ITERATIONS = Number(__ENV.ITERATIONS || VUS);
const MESSAGE = __ENV.MESSAGE || 'SSE 성능 테스트 메시지입니다.';

if (TOKENS.length === 0 || SESSION_IDS.length === 0) {
  throw new Error('ACCESS_TOKEN(S)과 SESSION_ID(S)를 환경변수로 전달해야 합니다.');
}

if (TOKENS.length !== SESSION_IDS.length) {
  throw new Error('ACCESS_TOKENS와 SESSION_IDS의 개수가 같아야 합니다.');
}

if (VUS > SESSION_IDS.length) {
  throw new Error('동시 사용자 VUS보다 토큰/세션 쌍이 적습니다.');
}

export const options = {
  scenarios: {
    aiChatSse: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '6m',
    },
  },
  thresholds: {
    checks: ['rate>0.95'],
    sse_completed_rate: ['rate>0.95'],
    sse_midstream_failure_rate: ['rate<0.01'],
  },
};

const completedRate = new Rate('sse_completed_rate');
const midstreamFailureRate = new Rate('sse_midstream_failure_rate');
const busyRate = new Rate('sse_busy_rate');
const totalDuration = new Trend('sse_total_duration', true);
const responseBytes = new Trend('sse_response_bytes');
const statusCounter = new Counter('sse_status_total');

export default function () {
  const index = (__VU - 1) % SESSION_IDS.length;
  const sessionId = SESSION_IDS[index];
  const token = TOKENS[index];
  const startedAt = Date.now();

  const response = http.post(
    `${BASE_URL}/api/v1/ai-chat/sessions/${sessionId}/responses/stream`,
    JSON.stringify({ messageText: `${MESSAGE} [vu=${__VU}, iter=${__ITER}]` }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      timeout: '330s',
      tags: { endpoint: 'ai-chat-sse' },
    },
  );

  const body = response.body || '';
  const connected = body.includes('event: connected');
  const done = body.includes('event: done');
  const errorEvent = body.includes('event: error');
  const busy = response.status === 503;
  const midstreamFailure = response.status === 200 && connected && !done;

  statusCounter.add(1, { status: String(response.status) });
  completedRate.add(response.status === 200 && done);
  midstreamFailureRate.add(midstreamFailure);
  busyRate.add(busy);
  totalDuration.add(Date.now() - startedAt);
  responseBytes.add(body.length);

  check(response, {
    'HTTP 200 또는 의도된 503이다': (res) => res.status === 200 || res.status === 503,
    '200 응답은 connected 이벤트를 포함한다': () => response.status !== 200 || connected,
    '200 응답은 done 이벤트로 완료된다': () => response.status !== 200 || done,
    'SSE error 이벤트가 없다': () => !errorEvent,
  });
}

function csv(value) {
  if (!value) {
    return [];
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

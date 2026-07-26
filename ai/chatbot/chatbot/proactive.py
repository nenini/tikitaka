"""선톡(먼저 말 걸기) 트리거 — 12h 무응답 시 1회, 시간대별 멘트 (AI-DATE-01).

기능명세 v3 §7.1: 사용자가 12시간 이상 답장이 없으면 챗봇이 1회에 한해 먼저 메시지를 보낸다.
⚠️ 저녁·심야 멘트와 야간 발송 정책은 미정(D-05) — 아래 값은 잠정.
"""

from __future__ import annotations

from datetime import datetime, timedelta

PROACTIVE_AFTER = timedelta(hours=12)
QUIET_HOUR_END = 9  # 00:00~09:00 발송 안 함 (D-05 잠정)

# (시작시, 종료시, 멘트) — 24시간제
_TIME_GREETINGS: list[tuple[int, int, str]] = [
    (9, 12, "잘 잤어요?"),
    (12, 18, "점심 뭐 먹었어요?"),
    (18, 24, "오늘 하루 어땠어요?"),  # D-05 잠정
]


def is_quiet_hours(now: datetime) -> bool:
    """야간(발송 금지) 시간대인지."""
    return now.hour < QUIET_HOUR_END


def should_send_proactive(
    *, last_user_message_at: datetime, proactive_already_sent: bool, now: datetime
) -> bool:
    """지금 선톡을 보내야 하는지. 이미 보냈거나 야간이면 보내지 않는다."""
    if proactive_already_sent:
        return False
    if is_quiet_hours(now):
        return False
    return now - last_user_message_at >= PROACTIVE_AFTER


def proactive_greeting(now: datetime) -> str:
    """발송 시각대에 맞는 선톡 멘트."""
    for start, end, msg in _TIME_GREETINGS:
        if start <= now.hour < end:
            return msg
    return "잘 지내고 있어요?"

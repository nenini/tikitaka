from datetime import datetime, timedelta

from chatbot.proactive import (
    proactive_greeting,
    should_send_proactive,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 7, 21, hour, 0, 0)


def test_send_after_12h_no_reply():
    now = _dt(14)
    last = now - timedelta(hours=13)
    assert should_send_proactive(
        last_user_message_at=last, proactive_already_sent=False, now=now
    )


def test_no_send_before_12h():
    now = _dt(14)
    last = now - timedelta(hours=5)
    assert not should_send_proactive(
        last_user_message_at=last, proactive_already_sent=False, now=now
    )


def test_no_send_when_already_sent():
    now = _dt(14)
    last = now - timedelta(hours=20)
    assert not should_send_proactive(
        last_user_message_at=last, proactive_already_sent=True, now=now
    )


def test_no_send_during_quiet_hours():
    now = _dt(3)  # 새벽 3시
    last = now - timedelta(hours=20)
    assert not should_send_proactive(
        last_user_message_at=last, proactive_already_sent=False, now=now
    )


def test_greeting_by_time():
    assert proactive_greeting(_dt(10)) == "잘 잤어요?"
    assert proactive_greeting(_dt(13)) == "점심 뭐 먹었어요?"
    assert proactive_greeting(_dt(20)) == "오늘 하루 어땠어요?"

"""AI 화상 세션을 혼자 돌려보는 데모 (AIVIDEO-02·04).

마이크·LiveKit·BE 없이 **키보드로 대화**하고, AI 음성은 wav로 떨어뜨린다.
끝나면 리포트를 그대로 찍는다. 파이프라인이 실제로 붙는지 눈으로 보는 용도다.

    # 대화해 보기 (엔터만 치면 종료)
    uv run python -m aggregator.voice_demo --scenario cafe

    # 목소리 고르기 — 같은 문장을 보이스별로 합성
    uv run python -m aggregator.voice_demo --voices

⚠️ 텍스트 입력이라 **응답 시간은 실제보다 부풀려진다**(타이핑 시간이 섞인다).
   나머지 지표(말한 시간·발화 길이·필러)는 음절 기반 추정이라 경향만 본다.
   숫자의 절대값이 아니라 리포트가 나오는지, 문장이 말이 되는지를 확인하는 도구다.
"""

from __future__ import annotations

import argparse
import sys
import time
import wave
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from chatbot.llm import GmsChatAdapter
from chatbot.persona import SCENARIOS, build_system_prompt, scenario_labels, scenario_of
from chatbot.persona_catalog import select_partner
from tts.gms import GmsTtsEngine

from aggregator.report.voice import (
    build_voice_analysis_payload,
    build_voice_narrative,
    compute_voice_metrics,
)
from aggregator.transcripts import TranscriptSegment
from aggregator.voice_session import (
    SAMPLE_RATE,
    SAMPLE_WIDTH,
    VoiceSession,
    played_ms,
    voice_for,
)

OUT = Path(__file__).resolve().parents[1] / "demo_out"
SYLLABLES_PER_SEC = 4.5
"""한국어 평균 발화 속도. 텍스트 입력을 '말한 시간'으로 환산할 때 쓴다(추정)."""

# 성별당 하나만 쓰기로 했으므로(팀 결정), 후보를 성별로 나눠 들려준다.
VOICE_CANDIDATES = {
    "female": ("nova", "coral", "shimmer", "sage"),
    "male": ("onyx", "echo", "ash", "ballad"),
}


def _write_wav(path: Path, pcm: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(SAMPLE_WIDTH)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(pcm)


def _speech_ms(text: str) -> int:
    """음절 수로 발화 길이를 추정한다. 공백·문장부호는 빼고 센다."""
    syllables = sum(1 for ch in text if not ch.isspace() and ch.isalnum())
    return max(500, int(syllables / SYLLABLES_PER_SEC * 1000))


def _segment(text: str, start_ms: int, end_ms: int, seq: int) -> TranscriptSegment:
    return TranscriptSegment(
        event_id=f"demo-{seq}",
        utterance_id=f"demo-utt-{seq}",
        session_id="demo",
        user_id="1",
        participant_identity="user-1",
        client_instance_id="00000000-0000-4000-8000-000000000000",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.95,
        language="ko",
        occurred_at="2026-08-05T15:00:00+09:00",
    )


def sample_voices(line: str) -> None:
    """같은 문장을 보이스별로 합성해 wav로 떨군다. 성별당 하나씩 고르라는 용도."""
    print(f'문장: "{line}"\n')
    for gender, voices in VOICE_CANDIDATES.items():
        print(f"[{gender}]  현재 기본값: {voice_for(gender)}")
        for voice in voices:
            engine = GmsTtsEngine.from_env()
            engine.voice = voice
            started = time.time()
            pcm = b"".join(engine.synthesize(line))
            path = OUT / f"voice-{gender}-{voice}.wav"
            _write_wav(path, pcm)
            print(f"    {voice:9s} {played_ms(len(pcm))/1000:4.1f}초 "
                  f"({time.time()-started:.1f}초 소요) → {path.name}")
        print()
    print(f"{OUT} 에서 들어보고 **성별당 하나씩** 고르세요.")
    print("  ai/tts/.env 에  GMS_TTS_VOICE_FEMALE=coral  ·  GMS_TTS_VOICE_MALE=onyx  형태로 지정")


def converse(scenario: str, my_gender: str, goals: tuple[str, ...]) -> None:
    # 상대는 **내 성별의 반대**다. select_persona 는 '상대의 성별'을 받으므로
    # 내 성별을 그대로 넘기면 동성이 나온다.
    entry = select_partner(my_gender, age=26)
    prompt = build_system_prompt(entry.spec, stage="before", scenario=scenario)
    tts = GmsTtsEngine.from_env()
    tts.voice = voice_for(entry.spec.gender)
    picked = scenario_of(scenario)
    session = VoiceSession(
        llm=GmsChatAdapter.from_env(),
        tts=tts,
        system_prompt=prompt,
        greeting=picked.opening if picked else None,
    )

    print("=" * 66)
    label = picked.label if picked else scenario
    print(f"나: {my_gender} → 상대: {entry.display_name} ({entry.spec.gender}, "
          f"보이스 {tts.voice}) · 주제: {label}")
    if goals:
        print(f"개선 목표: {', '.join(goals)}")
    print("빈 줄을 입력하면 세션을 끝내고 리포트를 냅니다.")
    print("=" * 66)

    utterances: list[TranscriptSegment] = []
    now_ms = 0
    seq = 0

    # AI가 먼저 인사한다. 사용자가 먼저 말하기를 기다리면 시작이 어색하고,
    # 무슨 말부터 할지 모르는 사용자는 그대로 굳는다.
    greeting_pcm = b"".join(session.greet(now_ms=0))
    if greeting_pcm:
        first = session.turns[-1]
        _write_wav(OUT / f"turn-{first.index}.wav", greeting_pcm)
        now_ms = first.ended_ms
        print(f"\nAI > {first.text}")
        print(f"      음성 {first.duration_ms/1000:.1f}초 → turn-{first.index}.wav")

    while True:
        asked_at = time.time()
        try:
            text = input("\n나 > ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not text:
            break

        # 응답 시간 = 프롬프트가 뜬 뒤 엔터까지. 타이핑 시간이 섞여 부풀려진다.
        gap_ms = int((time.time() - asked_at) * 1000)
        start_ms = now_ms + gap_ms
        end_ms = start_ms + _speech_ms(text)
        seq += 1
        utterances.append(_segment(text, start_ms, end_ms, seq))
        session.note_user_speech(end_ms)
        now_ms = end_ms

        started = time.time()
        pcm = b"".join(session.reply(text, now_ms=now_ms))
        if not pcm:
            print("  (AI가 응답하지 못했습니다)")
            continue
        turn = session.turns[-1]
        path = OUT / f"turn-{turn.index}.wav"
        _write_wav(path, pcm)
        now_ms = turn.ended_ms
        print(f"AI > {turn.text}")
        print(f"      음성 {turn.duration_ms/1000:.1f}초 · 생성 {time.time()-started:.1f}초 "
              f"→ {path.name}")

    _print_report(session, tuple(utterances), now_ms, goals)


def _print_report(
    session: VoiceSession,
    utterances: tuple[TranscriptSegment, ...],
    duration_ms: int,
    goals: tuple[str, ...],
) -> None:
    if not utterances:
        print("\n발화가 없어 리포트를 만들지 않습니다.")
        return
    metrics = compute_voice_metrics(utterances=utterances, turns=session.turns)
    narrative = build_voice_narrative(
        metrics, session_duration_ms=duration_ms, practice_goals=goals
    )

    print("\n" + "=" * 66)
    print("리포트")
    print("=" * 66)
    print(f"  말한 시간       {metrics.speaking_ms/1000:.0f}초 "
          f"(전체 {duration_ms/1000:.0f}초)")
    mean_u = metrics.mean_utterance_ms
    print(f"  한 번에         {mean_u/1000:.1f}초" if mean_u else "  한 번에         -")
    mean_r = metrics.mean_response_ms
    print(f"  평균 응답       {mean_r/1000:.1f}초 (표본 {metrics.response_sample_count})"
          if mean_r else "  평균 응답       - (AI 턴 없음)")
    print(f"  필러워드        {metrics.filler_count}회")
    print(f"  AI 턴           {metrics.ai_turn_count} (끊김 {metrics.barge_in_count})")
    print()
    print(f"  ▶ {narrative.headline}")
    for note in narrative.notes:
        print(f"    · {note}")
    print(f"  ▶ 다음 미션: {narrative.mission}")

    payload = build_voice_analysis_payload(
        metrics, session_id=1, user_id=1001,
        session_duration_ms=duration_ms, analyzed_at="2026-08-05T15:00:00+09:00",
    )
    print(f"\n  BE 페이로드 키: {list(payload)}")
    print("\n  ⚠️ 텍스트 입력이라 응답 시간에 타이핑 시간이 섞여 있습니다.")


def main() -> None:
    ap = argparse.ArgumentParser(description="AI 화상 세션 데모")
    ap.add_argument("--scenario", default="first_meet", choices=SCENARIOS,
                    help="대화 주제. " + " / ".join(f"{c}={l}" for c, l in scenario_labels()))
    ap.add_argument("--my-gender", default="MALE",
                    help="**내** 성별 (MALE/FEMALE). 상대는 반대 성별로 잡힌다")
    ap.add_argument("--goal", action="append", default=[],
                    help="개선 목표 코드 (TALK_TOO_MUCH / TALK_TOO_LITTLE). 여러 번 가능")
    ap.add_argument("--voices", action="store_true", help="보이스 비교용 wav 생성")
    ap.add_argument("--line", default="안녕하세요, 오늘 처음 뵙네요. 반가워요.",
                    help="--voices 로 합성할 문장")
    args = ap.parse_args()

    if args.voices:
        sample_voices(args.line)
        return
    converse(args.scenario, args.my_gender, tuple(args.goal))


if __name__ == "__main__":
    main()

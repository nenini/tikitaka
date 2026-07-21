# AI — STT 입력 파이프라인 (통제실 입력단)

화자별 마이크 → STT → `TranscriptEvent` 변환. 이 이벤트가 통제실(Session Aggregator)의 입력이 된다.

- 기준: `AI_아키텍처_설계(수정).md` §4.2·§7.2 이벤트 계약
- 담당 스토리: STT-02(스키마) · STT-03(단일 파이프라인) · STT-04(화자별 2스트림)

## 환경

- Python 3.12 (uv 가상환경) · faster-whisper · sounddevice · pydantic
- GPU: CUDA + cuDNN 9 (pip 휠 `nvidia-cudnn-cu12`/`nvidia-cublas-cu12`, Windows DLL 경로 자동 설정)

```bash
uv sync            # 의존성 설치
uv run pytest -q   # 스키마 테스트
```

## 실행 — 마이크 실시간 STT

```bash
# 기본 (user-A, large-v3, GPU)
uv run python -m stt.mic_stream

# 화자 지정 / 모델 변경 / CPU
uv run python -m stt.mic_stream --speaker user-B --model medium
uv run python -m stt.mic_stream --device cpu
```

말하면 아래처럼 `TranscriptEvent`가 출력된다:

```
[   4.2s] (user-A conf=0.92) 최근에는 전시를 자주 보러 가요
```

## 구조

| 파일 | 역할 |
|---|---|
| `stt/events.py` | `TranscriptEvent` 스키마 (snake_case ↔ camelCase 계약) |
| `stt/pipeline.py` | `SttEngine` — 오디오 청크 → faster-whisper → TranscriptEvent (GPU→CPU 폴백) |
| `stt/session.py` | `SpeakerStream`(VAD 발화 엔드포인팅) · `SessionSttRunner`(화자 멀티플렉싱) |
| `stt/mic_stream.py` | 마이크 캡처 → `SpeakerStream` (단일 화자 실행 진입점) |
| `stt/two_speaker_demo.py` | 오디오 2개 → 화자 A/B interleaved 전사 (2스트림 데모) |
| `tests/` | 스키마 계약 · 멀티플렉싱 로직 테스트 |

## 2스트림 (STT-04)

**모델 1개를 두 화자 스트림이 공유**(VRAM 절약). 각 결과에 `speakerId=A/B` 태깅, 공통 시간축(`sessionElapsedMs`)으로 정렬해 통제실에 전달.

```bash
uv run python -m stt.two_speaker_demo --audio-a a.wav --audio-b b.wav
```

## 다음 (STT-05 / 통제실)

- 실제 2-브라우저 오디오 경로 연동 (FE/BE 협업) — `PENDING-ARCH-001`
- Session Aggregator: 이 `TranscriptEvent`들을 받아 시간순 결합·발화비율·침묵 상태 계산.

## Pending

- STT 방식 최종 결정 (로컬 whisper vs 서버 STT) — `PENDING-ARCH-001`
- 오디오 입력 경로 FE/BE 연동 — STT-05

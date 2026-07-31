# AI — STT 입력 파이프라인 (통제실 입력단)

화자별 마이크 → STT → `TranscriptEvent` 변환. 이 이벤트가 통제실(Session Aggregator)의 입력이 된다.

- 기준: `AI_아키텍처_설계(수정).md` §4.2·§7.2 이벤트 계약
- 담당 스토리: STT-02(스키마) · STT-03(단일 파이프라인) · STT-04(화자별 2스트림)

## 환경

- Python 3.11 (통합 AI 서버 표준) · faster-whisper · sounddevice · pydantic
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

## 구조 — 각 파일이 하는 일

전체 흐름: **마이크 오디오 → (발화 단위로 자르기) → (텍스트로 변환) → 정해진 형식으로 포장 → 통제실 전달**

### `stt/events.py` — "결과를 담는 표준 봉투"
STT 결과를 통제실·백엔드와 주고받을 때 쓰는 **데이터 형식(계약)**을 정의한다.
- `TranscriptEvent`: 한 번의 발화 = "누가(speakerId), 언제(sessionElapsedMs), 뭐라고(payload.text), 얼마나 확실하게(confidence)".
- `TranscriptPayload`: 실제 텍스트와 발화 구간(시작/끝 ms), 언어.
- **왜 필요?** 파이썬 내부에선 `snake_case`(session_id)로 쓰지만, JSON으로 내보낼 땐 프론트/백 관례인 `camelCase`(sessionId)로 자동 변환(`to_contract()`)한다. 서로 형식이 안 맞아 깨지는 걸 막는 "규격".

### `stt/pipeline.py` — "음성을 글자로 바꾸는 엔진"
실제 음성인식을 담당하는 핵심. `SttEngine` 클래스 하나.
- **모델 로딩**: faster-whisper `large-v3`를 GPU로 띄운다. GPU가 안 되면 자동으로 CPU로 내려간다(폴백).
- **DLL 경로 처리**(`_add_cuda_dll_dirs`): Windows에서 GPU 라이브러리(cuBLAS/cuDNN)를 못 찾는 문제를 import 전에 미리 해결.
- **변환**(`transcribe_chunk`): 오디오 조각 → 텍스트 세그먼트 → `TranscriptEvent`로 포장.
- **환각 필터**: 무음/잡음일 때 whisper가 "감사합니다" 같은 헛것을 만드는 걸, `no_speech_prob`(무음 확률)과 `confidence`(신뢰도)로 걸러낸다.

### `stt/session.py` — "화자별로 나눠서 발화 단위로 끊기"
두 사람이 동시에 말하는 상황을 정리하는 부분. 클래스 2개.
- `SpeakerStream`: **한 사람**의 오디오를 계속 받아 모으다가(`feed`), VAD(음성 감지)로 "말이 끝났다"고 판단되면 그 발화만 잘라 STT를 돌린다(`flush_utterance`). 즉 문장 단위로 끊어주는 상태머신.
- `SessionSttRunner`: **여러 화자**를 묶어서 관리. 화자마다 `SpeakerStream`을 두되 **STT 모델은 1개만 공유**한다(GPU 메모리 절약). 화자 구분은 음성분리(diarization)가 아니라 **입력 트랙 분리**(WebRTC에서 각자 마이크가 따로 들어옴)로 처리.
- `make_vad_options`: 침묵 몇 초를 "발화 끝"으로 볼지 등 VAD 설정값.

### `stt/mic_stream.py` — "내 마이크로 실제로 돌려보는 실행 파일"
노트북 마이크 입력을 받아 위 파이프라인을 실시간으로 돌리는 **진입점**. 말하면 바로 텍스트가 출력된다.
- CLI 옵션: `--speaker`(화자 이름), `--model`(모델 크기), `--device`(cpu/cuda), `--end-silence`(발화 끊김 판정 침묵 초) 등.

### `stt/two_speaker_demo.py` — "두 명 대화 테스트용"
오디오 파일 2개(A·B)를 넣으면 실제 소개팅처럼 **A/B가 번갈아 말하는 상황을 재현**해 전사 결과를 보여주는 데모. (`load_wav_16k_mono`로 어떤 wav든 16kHz mono로 맞춤)

### `tests/` — "자동 검증"
- `test_events.py`: 데이터 형식(계약)이 규격대로 나오는지 (4개).
- `test_session.py`: 화자별로 올바르게 나뉘고 seq/타임라인이 맞는지 — 실제 모델 없이 가짜 엔진(mock)으로 (4개).

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

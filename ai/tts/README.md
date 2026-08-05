# tts — 한국어 음성 합성 (S15P11A307-475)

사람↔AI 음성 대화에서 챗봇 응답을 소리로 바꾸는 모듈.
**텍스트 → 16kHz mono PCM 청크 스트림**이 전부다. 마이크 입력·대화 흐름은 `voice/`가 맡는다.

## 출력 계약

| 항목 | 값 |
|---|---|
| 샘플레이트 | 16,000 Hz |
| 채널 | mono |
| 포맷 | signed 16-bit little-endian PCM |
| 청크 | 기본 20ms (640 bytes) |

STT 입력(`stt.pipeline.SAMPLE_RATE` = 16000)과 같은 레이트라 오디오 경로 전체가 16k로 통일된다.

**청크로 쪼개 내보내는 이유**: 사용자가 말을 시작하면(바지인, S15P11A307-478) 재생 중인
음성을 즉시 끊어야 한다. 통짜 `bytes`를 반환하면 중간에 멈출 수 없다.

## 구조

| 파일 | 역할 |
|---|---|
| `tts/engine.py` | `TtsEngine` Protocol + 출력 계약 상수 + 청킹·int16 변환 헬퍼 |
| `tts/edge.py` | `EdgeTtsEngine` — 선정 엔진. MP3 디코딩·리샘플 포함 |
| `tts/mock.py` | `MockTts` — 네트워크·모델 없이 더미 PCM. 테스트·파이프라인 개발용 |
| `tts/demo.py` | CLI 데모 — 합성해서 WAV 저장/재생 |

엔진 교체는 `TtsEngine` Protocol 구현체를 갈아끼우면 된다 — `chatbot.llm.ChatLLM`과 같은 패턴.

## 사용법

```python
from tts import EdgeTtsEngine, voice_for_gender

engine = EdgeTtsEngine(voice_for_gender("female"))
for chunk in engine.synthesize("안녕하세요, 저도 반가워요."):
    ...  # 16k mono PCM 20ms 청크
```

```bash
uv run python -m tts.demo --text "안녕하세요" --play
uv run python -m tts.demo --voice ko-KR-InJoonNeural
uv run python -m tts.demo --engine mock          # 네트워크 없이 경로만 확인
uv run mypy && uv run pytest
```

`synthesize()`는 동기 인터페이스라 내부에서 `asyncio.run`을 쓴다.
**이미 실행 중인 이벤트 루프 안에서는 호출할 수 없다** — async 컨텍스트(FastAPI 등)에서는
`asyncio.to_thread`로 감싼다.

## 한국어 보이스

edge-tts가 제공하는 `ko-KR` 보이스는 3종이 전부다.

| 상수 | 보이스 | 성별 |
|---|---|---|
| `KO_FEMALE` (기본) | `ko-KR-SunHiNeural` | 여성 |
| `KO_MALE` | `ko-KR-InJoonNeural` | 남성 |
| `KO_MALE_MULTILINGUAL` | `ko-KR-HyunsuMultilingualNeural` | 남성 |

`voice_for_gender()`가 챗봇 `PersonaSpec.gender`("female"/"male")를 보이스로 매핑한다.

## 엔진 선정 근거

### 제약

- **VRAM 0이어야 한다.** RTX 4050 6GB(실측 여유 5.9GB)에 STT(faster-whisper)와
  LLM(Ollama)이 이미 들어간다. TTS에 GPU를 내줄 여유가 없다.
- **무료.** 팀 프로젝트라 과금 불가.
- 한국어 품질, 스트리밍, Windows + Python 3.11 uv 환경에서 설치 가능할 것.

### 비교

| 후보 | 무료 | 한국어 | VRAM | 판정 |
|---|---|---|---|---|
| **edge-tts** | ✅ 키·계정 불필요 | ✅ 뉴럴 3종, 품질 최상급 | **0** | **채택** |
| MeloTTS | ✅ MIT | ✅ 지원 | 0 (CPU 실시간) | 폴백 후보 |
| Chatterbox Multilingual v3 | ✅ MIT | ✅ 지원 | 0.5B → GPU 필요 | 제외 |
| CosyVoice2-0.5B | ✅ | ✅ 지원 | GPU 필요 | 제외 |
| Kokoro-82M | ✅ Apache-2.0 | ❌ **미지원** | 0 | 제외 |
| XTTS-v2 | ❌ CPML **비상업용** | ✅ | GPU | 제외 |
| CLOVA Voice | ❌ 유료 | ✅ 최상급 | 0 | 제외 |

- **Kokoro**: 일부 블로그가 한국어 지원이라 쓰지만 공식 `lang_code`는
  `a/b/e/f/h/i/j/p/z`(영·스페인·프랑스·힌디·이탈리아·일본·포르투갈·중국)로 **ko가 없다.**
- **XTTS-v2**: Coqui Public Model License = 비상업용. Coqui 사도 2024년에 문을 닫아 유지보수 없음.
- **Chatterbox / CosyVoice2**: 한국어 품질은 쓸 만하나 0.5B 자기회귀 모델이라 CPU 실시간이
  어렵고 GPU 여유가 없다.
- **MeloTTS**: 라이선스·로컬 실행 면에서 가장 이상적이지만 ① 공식 문서가 Windows는 Docker를
  권장하고 ② Python 3.9 기준으로 개발돼 3.11 uv 환경에 설치 마찰이 있으며 ③ 품질이
  "고표현 모델이 아닌 경량 베이스라인" 수준이다. **1순위가 막히면 여기로 간다.**

### 실측 (RTX 4050 노트북, 유선 네트워크)

| 문장 | 오디오 길이 | 첫 청크 | 전체 |
|---|---|---|---|
| "안녕하세요, 저도 반가워요. 주말엔 보통 카페 가거나 전시 보러 다녀요." | 7.18s | 0.53s | 0.54s |
| "네 반가워요, 편하게 얘기해요 우리." | 4.42s | 0.60s | 0.60s |

문장 하나를 0.5~0.6초에 합성한다. 파이프라인이 문장 단위로 조기 합성하면
첫 음성까지의 지연을 이 수준으로 유지할 수 있다.

### 감수한 리스크

| 리스크 | 내용 | 대응 |
|---|---|---|
| 네트워크 의존 | 오프라인·사내망 차단 시 동작 불가 | 폴백 = MeloTTS(로컬) |
| 비공식 엔드포인트 | Edge 브라우저용 서비스를 쓰는 방식이라 MS가 막거나 레이트리밋을 걸 수 있음 | 동일 |
| 텍스트 외부 전송 | **AI가 생성한 응답 문장**이 MS 서버로 나간다 | 사용자 음성·전사는 나가지 않는다. 나가는 것은 봇이 만든 대사뿐 |

세 번째 항목은 프로젝트의 "원문 비저장·로컬 처리" 원칙과 접점이 있어 적어 둔다.
사용자 발화·전사는 전송 대상이 아니고, 합성 대상은 봇이 생성한 문장이다.

## 상태

- ✅ 인터페이스·edge 엔진·Mock·데모, 테스트 15개, mypy strict 클린
- ⬜ MeloTTS 구현 (1순위가 막히면)
- ⬜ async 인터페이스 (S15P11A307-477 WebSocket 전송에서 필요해지면)

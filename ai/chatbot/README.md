# AI — 소개팅 연습 챗봇 (AI-DATE-01 / AI-DATE-02)

소개팅 **전/후** 대화를 연습하는 **텍스트 챗봇**. 로컬 LLM 1개를 공유하고, 사용자가 고른
**속성 조합(페르소나)** 을 systemPrompt로 주입해 서로 다른 상대처럼 대화한다.

- 기준: 기능명세 v3 §7 (텍스트 챗봇, 화상 트랙 P2 보류 = D-04)
- ERD: `chatbot_personas` · `chatbot_conversations` · `chatbot_messages`

## 핵심 원리 — "모델 1개 + 페르소나별 프롬프트"
```
유저A(20대녀) ┐
유저B(30대남) ┼─→ [로컬 LLM 1개(공유)]  ← 각자 systemPrompt + 각자 대화이력
유저C(차분녀) ┘
```
사람마다 LLM을 따로 두지 않는다(6GB VRAM 제약). **프롬프트와 대화 이력만** 사람마다 다르다.
(STT가 화자 2명이 whisper 1개를 공유한 것과 같은 원리.)

## 구조
| 파일 | 역할 | 상태 |
|---|---|---|
| `chatbot/schemas.py` | 계약: `PersonaSpec`·`ChatMessage`·`KoreaPersona` (camelCase) | ✅ |
| `chatbot/persona.py` | 속성 조립 + 데이터셋 로드·필터·랜덤추출·프롬프트 | ✅ |
| `chatbot/llm.py` | `ChatLLM` 인터페이스 + `MockLLM` + `LocalAdapter`(llama-cpp) | ✅ (Local은 모델 연결 대기) |
| `chatbot/conversation.py` | 대화 이력 관리 · before/after · 프롬프트+이력 주입 | ✅ |
| `chatbot/proactive.py` | 선톡 트리거(12h 무응답 1회, 시간대별 멘트) | ✅ |
| `chatbot/demo.py` | 확인용 데모 (속성형 / `--dataset` 랜덤매칭) | ✅ |
| `chatbot/feedback.py` | 메시지 피드백·대체문장·종합 리포트 (후속 P1) | ⬜ 예정 |
| `scripts/download_personas.py` | 페르소나 데이터 다운로드 | ✅ |
| `tests/` | mock LLM 기반 단위 테스트 (18개) | ✅ |

## 페르소나 데이터
- **출처: [nvidia/Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea)** (CC BY 4.0) — 실제 한국 인구 분포 기반 합성 페르소나 600만+.
- 소개팅 연습용으로 **미혼·20~39세** 필터해 소량 샘플(`personas/nemotron_korea.jsonl`, gitignore)만 사용.
- **회의 결정 "부분선택 + 랜덤매칭"**: 사용자는 성별·나이대만 고르고, 실제 인물은 데이터에서 랜덤 추출.
- 데이터 준비: `uv run python scripts/download_personas.py`

## 결정 사항
- **LLM 서빙:** 로컬 LLM (llama-cpp/vLLM). 어댑터로 추상화해 교체 가능.
- **페르소나:** 속성 조합형 (나이·성별·취미·말투·성향·반응 선택 → systemPrompt).
- **페르소나 씨앗:** NVIDIA 페르소나 데이터/프롬프트 활용(로컬과 호환).

## MVP 범위
- **P0:** 로컬 LLM 서빙 + 속성 페르소나 + before/after 대화 + 선톡
- **후속(P1):** 피드백·대체문장·종합 리포트

## 미정 / 필요
- 로컬 LLM 모델 확정 (한국어 7~8B Q4: EXAONE-3.5 / Qwen2.5-7B 등) → `LocalAdapter` 연결
- 선톡 저녁·심야 멘트/야간 정책 (D-05)
- 챗봇 피드백·리포트 **저장 테이블** — ERD에 없음, 팀 결정 필요

## 실행
```bash
uv sync
uv run python scripts/download_personas.py     # 페르소나 데이터 준비(1회)
uv run pytest -q                               # 테스트 18개
uv run python -m chatbot.demo                             # 속성형 데모
uv run python -m chatbot.demo --dataset --sex 여자 --min-age 25 --max-age 32   # 랜덤매칭 데모
```

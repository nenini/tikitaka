# Face analysis

Python 3.11 환경에서 사용자 제공 연예인 사진을 검증하고, YuNet 5-point landmark로
224×224 얼굴 이미지를 정렬하는 학습 준비 모듈입니다.

## 데이터 구성

- `data/사진데이터`: 원본 204장(68명 × 3장). 전처리 과정에서 수정하지 않습니다.
- `data/dataset_manifest.csv`: 인물, 얼굴상, 명시적 분석 그룹, 원본 SHA-256 매핑
- `data/processed`: 정렬 이미지. 재생성 가능하므로 Git에서 제외합니다.
- `data/processing_report.csv`: 얼굴 검출과 품질 검수 결과

여성 분석 그룹은 9종, 남성 분석 그룹은 8종입니다. 분석 그룹은 사용자가 명시적으로
선택해야 하며 얼굴에서 성별을 추론하지 않습니다.

## 실행

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_dataset.py
.\.venv\Scripts\python.exe scripts\make_contact_sheet.py
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check src scripts tests
```

전처리는 detector를 한 번만 로드하고 전체 이미지를 순차 처리합니다. 얼굴이 원본 경계에
붙어 있어도 반사 padding을 사용해 정렬하며 원본을 덮어쓰지 않습니다. 전체 landmark나
얼굴 embedding은 파일, 로그, report에 저장하지 않습니다.

## Phase 2 분류 모델

- 백본: DINOv2 ViT-S/14 (`dinov2_vits14`), frozen 상태로 사용
- 분류기: 공통 projection과 명시적으로 선택된 여성 9종·남성 8종 head
- 입력: YuNet으로 정렬된 RGB 224×224 얼굴 이미지
- 저장: projection/head 가중치와 라벨 순서만 저장
- 비저장: 원본 이미지, 얼굴 crop, DINOv2 특징 벡터, 사용자 식별자

현재 학습 스크립트는 `training_eligible=True`인 전처리 이미지를 모두 사용합니다. 인물 단위
데이터 분리와 별도 평가셋·평가 지표는 후속 단계에서 확정합니다.

```powershell
.\.venv\Scripts\python.exe scripts\train_classifier.py --device auto
```

최초 실행 시 공식 DINOv2 코드와 가중치가 PyTorch 캐시에 내려받아지고, 프로세스에서는
백본을 한 번만 로드합니다. 체크포인트 기본 경로는
`artifacts/face_type_head_experimental.pt`이며 Git에서 제외됩니다. 별도 검증 전에는 운영
모델로 간주하지 않습니다.

추론 결과 상태는 다음 계약을 따릅니다.

- `SUCCESS`: 신뢰 조건을 충족하며 1~2개 후보를 반환
- `UNCERTAIN`: 신뢰 조건을 충족하지 않아도 최소 1개 후보를 제안
- `RETAKE_REQUIRED`: 품질 검사를 통과하지 못했으며 후보는 비움
- `SKIPPED`: 사용자가 촬영을 건너뛰었으며 분석 그룹과 후보를 모두 비움

`PredictionPolicy`의 임계값은 초기값이며 별도 검증 단계에서 조정해야 합니다.

모델 출처, 제한사항과 개인정보 처리 원칙은 `MODEL_NOTES.md`에 기록합니다.
